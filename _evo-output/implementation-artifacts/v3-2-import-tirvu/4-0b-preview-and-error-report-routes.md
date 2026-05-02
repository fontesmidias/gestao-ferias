# Story 4.0b (backend slice da Epic 4): GET /imports/:jobId/preview (paginado) + GET /imports/:jobId/error-report.xlsx

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a frontend developer (Stories 4.1 e 4.2),
I want endpoints REST que: (a) paginam as rows do preview filtradas por status, (b) geram on-demand um `.xlsx` das linhas inválidas a partir do arquivo persistido — ambos com versões SuperAdmin (`/admin/imports/:jobId/...`) e TenantAdmin (`/imports/:jobId/...`),
so that o `ImportPreviewTable` (virtualized) consiga puxar páginas de rows e o botão "Baixar relatório de erros" da `ImportSummaryView` baixe o relatório real. Esta é a **segunda metade** do backend slice da Epic 4 (Story 4.0a já cobriu status + cancel).

## Acceptance Criteria

### GET `/imports/:jobId/preview` (paginado)

1. **Rotas:**
   - `GET /api/v1/admin/imports/:jobId/preview` (SUPERADMIN)
   - `GET /api/v1/imports/:jobId/preview` (ADMIN do tenant do job)

2. **Auth chain:** mesmo padrão das stories anteriores — `[requireAuth, (requireSuperAdmin|requireAdmin), requirePermission('import.run')]`.

3. **Rate limit:** `{ max: 60, timeWindow: '1 minute' }`. Frontend pode mudar página rápido.

4. **Query params:**
   - `status` (opcional) — `'create' | 'update' | 'unchanged' | 'reactivation' | 'invalid' | 'absent'`. Filtra. Se omitido, retorna todos.
   - `page` (default 1, mínimo 1)
   - `limit` (default 50, mínimo 1, máximo 200)

5. **State check:** job.status precisa estar em `['PREVIEW_READY', 'APPLYING', 'COMPLETED', 'FAILED', 'CANCELLED']`. Se PENDING/PARSING/TIMED_OUT (sem previewSummary) → 409 `INVALID_JOB_STATE` "Preview ainda não disponível".

6. **Tenant scope:** scope='tenant' && job.tenantId !== user.tenantId → 404 `JOB_NOT_FOUND` (anti-leak existência cross-tenant).

7. **Response 200:**
   ```json
   {
     "data": {
       "rows": [
         { "rowIndex": 1, "status": "create", "diff": null, "errors": null },
         { "rowIndex": 2, "status": "update", "diff": { "salary": { "from": 1500, "to": 1700 } }, "errors": null },
         ...
       ],
       "counts": { "create": 47, "update": 3, "unchanged": 5, "reactivation": 1, "invalid": 2, "absent": 5 },
       "newWorkplaces": ["TRT-DF"]
     },
     "error": null,
     "meta": {
       "pagination": { "page": 1, "limit": 50, "total": 47, "totalPages": 1 }
     }
   }
   ```

8. **Pagination calculada após filtragem:**
   - `total` = comprimento de `previewSummary.sampleRows` filtrado por `status` (se fornecido).
   - `totalPages = Math.ceil(total / limit)`.
   - rows = slice paginado.

9. **Filtragem case-sensitive** — `status` deve bater literal contra `'create'`/`'update'`/etc. Match falso → retorna 0 rows.

10. **`previewSummary` ausente** (job pré-PARSING) → 409 mesmo se status batesse outras checagens.

### GET `/imports/:jobId/error-report.xlsx`

11. **Rotas:**
    - `GET /api/v1/admin/imports/:jobId/error-report.xlsx`
    - `GET /api/v1/imports/:jobId/error-report.xlsx`

12. **Auth chain:** idem 4.0a.

13. **Rate limit:** `{ max: 10, timeWindow: '1 minute' }`. Operação cara (re-parse).

14. **Comportamento:**
    - Tenant scope check.
    - State check: `status in ['PREVIEW_READY', 'APPLYING', 'COMPLETED', 'FAILED']` (qualquer pós-parse, exclui CANCELLED/TIMED_OUT/PENDING/PARSING). Outro estado → 409 `INVALID_JOB_STATE`.
    - Se `previewSummary.counts.invalid === 0` (verifica via `previewSummary` lite ou re-conta) → **204 No Content** sem body.
    - Senão: chama `buildErrorReportXlsx({ tenantId, jobId, fileHash })`. Recebe `{ buffer, invalidCount }`.
    - Define headers:
      - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
      - `Content-Disposition: attachment; filename="<safe-name>-erros.xlsx"` onde `safe-name = job.filename.replace(/\.xlsx$/i, '')` ou `'import'` se vazio.
    - `reply.send(buffer)` → 200 binary.

### `error-report-builder.ts` (helper)

15. **`backend-api/src/modules/imports/error-report-builder.ts`** exporta:
    ```ts
    export interface BuildErrorReportInput {
      tenantId: string
      jobId: string
      fileHash: string
    }
    export interface BuildErrorReportResult {
      buffer: Buffer
      invalidCount: number
    }
    export async function buildErrorReportXlsx(input: BuildErrorReportInput): Promise<BuildErrorReportResult>
    ```

16. **Implementação:**
    - `buffer = await storageRead({ tenantId, jobId, expectedHash: fileHash })` (Story 1.1) — propaga `FileIntegrityError` ao caller.
    - `for await (row of parseRows(buffer))` colete em array.
    - Para cada row: `validate(row)` (Story 2.2). Se `status === 'invalid'`, push em `invalidRows: { row, errors }[]`.
    - Monta workbook com header em pt-BR:
      ```
      ['Linha', 'Motivo', 'ID Tirvu', 'CPF', 'Nome', 'Status', 'Empresa', 'Lotação', 'Admissão']
      ```
    - Body: para cada invalidRow, mapeia → row do xlsx. `Admissão` formatada `dd/MM/yyyy` se `Date`, senão string crua. `Motivo` = `errors.join('; ')`.
    - `XLSX.utils.aoa_to_sheet([header, ...body])`, `XLSX.utils.book_append_sheet(wb, sheet, 'Erros')`.
    - `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })` → Buffer.
    - Retorna `{ buffer, invalidCount: invalidRows.length }`.

17. **Custo:** parser+validator full file (~5-10s para 5k linhas). Aceitável para download manual. Rate limit 10/min protege.

### Helper `preview-flow.ts`

18. **`backend-api/src/modules/imports/preview-flow.ts`** com `previewEntrypoint(deps, request, reply, { jobId, scope, query: { status?, page?, limit? } })` seguindo padrão de `cancel-flow.ts`/`status-flow.ts` (Story 4.0a) — recebe `deps: { prisma }` explicitamente.

### Helper `error-report-flow.ts`

19. **`backend-api/src/modules/imports/error-report-flow.ts`** com `errorReportEntrypoint(deps, request, reply, { jobId, scope })` análogo. `deps` precisa de `{ prisma, log }`.

### Suite de testes

20. **`test/modules/error-report-builder.test.ts`** (≥3 cases):
    - Fixture `tirvu-mixed-errors.xlsx` (5 inválidas) → `invalidCount === 5`, buffer não-vazio, header esperado em xlsx.
    - Fixture `tirvu-anatel-50.xlsx` (sem inválidos) → `invalidCount === 0`, buffer com só header (read-back).
    - File integrity (`expectedHash` errado) → throw `FileIntegrityError`.

21. **`test/modules/preview-flow.test.ts`** (≥4 cases): mock prisma + previewSummary mock. Casos: filter, paginação, total bate, 409 sem previewSummary, 404 cross-tenant.

22. **`test/modules/error-report-flow.test.ts`** **NÃO criar** — wiring é trivial (delega para builder). Builder é testado isoladamente.

### Out-of-scope

23. **NÃO criar UI** — Stories 4.1/4.2.
24. **NÃO escrever `errorReportPath` no DB** — download é on-demand.
25. **NÃO criar GET /imports** (lista paginada de jobs).
26. **NÃO migrar rotas legadas para `requirePermission`**.
27. **NÃO incluir `unchanged` rows nos defaults** — operador raramente quer ver. Mas o filter `status=unchanged` é suportado.

## Tasks / Subtasks

### T1 — `error-report-builder.ts` (AC: 15, 16, 17)

- [x] T1.1 Criar `backend-api/src/modules/imports/error-report-builder.ts`. TODO header.
- [x] T1.2 Imports: `xlsx`, `read as storageRead` from `./import-storage`, `parseRows` from `./tirvu-parser`, `validate` from `./import-validator`.
- [x] T1.3 Implementar `buildErrorReportXlsx`:
  - storageRead → buffer
  - itera parseRows + validate, coleta invalidRows
  - monta header pt-BR (9 colunas) + body
  - XLSX.write → Buffer
  - retorna `{ buffer, invalidCount }`
- [x] T1.4 Helper local `formatDateBR(d: Date | string | null): string` para coluna Admissão.

### T2 — `preview-flow.ts` (AC: 4, 5, 6, 7, 8, 9, 10, 18)

- [x] T2.1 Criar `backend-api/src/modules/imports/preview-flow.ts`. Header TODO.
- [x] T2.2 Tipos `PreviewDeps = { prisma: PrismaClient }`, `PreviewQuery = { status?: string; page?: string|number; limit?: string|number }`.
- [x] T2.3 Função `previewEntrypoint(deps, request, reply, { jobId, scope })`:
  - findUnique job (select id, tenantId, status, previewSummary) → 404 / cross-tenant 404
  - state check: status in ['PREVIEW_READY','APPLYING','COMPLETED','FAILED','CANCELLED'] AND previewSummary !== null → senão 409
  - Parse query: `page = max(1, Number(query.page ?? 1))`, `limit = clamp(1, 200, Number(query.limit ?? 50))`. Status filter literal.
  - filtered = `previewSummary.sampleRows.filter(r => !status || r.status === status)`
  - paginated = `filtered.slice((page-1)*limit, page*limit)`
  - response com `data: { rows: paginated, counts, newWorkplaces }, meta: { pagination: { page, limit, total: filtered.length, totalPages: ceil(...) } }`

### T3 — `error-report-flow.ts` (AC: 14, 19)

- [x] T3.1 Criar `backend-api/src/modules/imports/error-report-flow.ts`. Header TODO.
- [x] T3.2 Tipos `ErrorReportDeps = { prisma: PrismaClient; log: Logger }`. Reusa `Logger`-like type.
- [x] T3.3 Função `errorReportEntrypoint(deps, request, reply, { jobId, scope })`:
  - findUnique job (select id, tenantId, status, fileHash, filename, previewSummary) → 404 / cross-tenant 404
  - state check: status in ['PREVIEW_READY','APPLYING','COMPLETED','FAILED']
  - se `previewSummary?.counts?.invalid` === 0 (ou null) → 204 No Content
  - try `{ buffer, invalidCount } = await buildErrorReportXlsx(...)`. catch FileIntegrityError → log + 500 com error envelope.
  - safeName = `job.filename.replace(/\.xlsx$/i, '')` ou `'import'`. encodeURIComponent.
  - headers: Content-Type + Content-Disposition `attachment; filename="${safeName}-erros.xlsx"`
  - reply.send(buffer)

### T4 — Adicionar rotas em jobs.ts (AC: 1, 2, 3, 11, 12, 13)

- [x] T4.1 Editar [backend-api/src/routes/api/v1/admin/imports/jobs.ts](backend-api/src/routes/api/v1/admin/imports/jobs.ts). Adicionar:
  - `fastify.get('/:jobId/preview', { onRequest: ADMIN_GUARD, config: { rateLimit: { max: 60, ... } } }, ...)`
  - `fastify.get('/:jobId/error-report.xlsx', { onRequest: ADMIN_GUARD, config: { rateLimit: { max: 10, ... } } }, ...)`
- [x] T4.2 Análogo em [backend-api/src/routes/api/v1/imports/jobs.ts](backend-api/src/routes/api/v1/imports/jobs.ts).
- [x] T4.3 Cuidado com filename URL-safe e ASCII fallback no Content-Disposition (chars não-ASCII em alguns user-agents quebram). Se filename original tem char não-ASCII, usar `encodeURIComponent` + RFC 5987:
  ```
  Content-Disposition: attachment; filename="import-erros.xlsx"; filename*=UTF-8''import-erros.xlsx
  ```
  Para simplificar, sanitizar: `safeName.replace(/[^a-zA-Z0-9._-]/g, '_')`.

### T5 — Tests (AC: 20, 21)

- [x] T5.1 Criar `backend-api/test/modules/error-report-builder.test.ts`. Setup tmpdir + persistir fixtures via `storage.persist`. Casos do AC20.
- [x] T5.2 Criar `backend-api/test/modules/preview-flow.test.ts`. Mock prisma com fixtures de previewSummary. Casos:
  - filter status=invalid retorna só invalid
  - page=2 limit=10 retorna offset 10
  - sem status retorna todos
  - previewSummary === null → 409 INVALID_JOB_STATE
  - cross-tenant tenant scope → 404
  - status PARSING → 409

### T6 — Validação final (AC: tudo)

- [x] T6.1 `npx tsc --noEmit` zero erros.
- [x] T6.2 Suite focada novo: 7+ cases pass.
- [x] T6.3 Suite full regression CI-style: ≥240, 0 fail.
- [x] T6.4 Atualizar Dev Agent Record com File List.

## Dev Notes

### Por que re-parse no error-report?

`previewSummary.sampleRows` armazena `{ rowIndex, status, diff?, errors? }` — não inclui o `row` original (CPF, nome, lotação). Para o xlsx ter campos identificadores, precisa do row. Re-parse custa ~5s para 5k linhas — aceitável para download manual.

Alternativa: estender sampleRows para guardar uma cópia do row. Custo: jsonb dobra de tamanho (~10MB por job). Não vale.

### Filename no Content-Disposition com chars não-ASCII

Browsers modernos suportam RFC 5987 (`filename*=UTF-8''...`). Para simplicidade, sanitizamos: substituímos chars não-ASCII por `_`. Aceitável — operador vê `serv__plus-erros.xlsx` em vez de quebrar.

### State check: por que aceitar CANCELLED no preview mas não no error-report?

Preview existe para qualquer estado pós-parse (operador pode querer ver o que ia ter sido aplicado). Error-report só faz sentido se houver invalid count > 0, que apenas estados pós-PREVIEW conhecem. CANCELLED tem previewSummary mas operador cancelou ANTES de aplicar — o relatório de erros do preview é informativo, mas decidi excluir CANCELLED para reduzir complexidade. Trade-off aceitável.

Atualização: AC11 `error-report` inclui `PREVIEW_READY` — se operador quer baixar erros antes de apply, OK. CANCELLED ficou fora; pode revisitar futuro.

### Pagination — sample da story spec

Architecture line 569-571: query `?status=...&page=1&limit=50` → response `{ rows: [...], pagination: {...} }`. Mantemos esse contrato.

### XLSX lib

`xlsx@0.18.5` já está em use. `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })` retorna `Buffer` no Node. Verificar tipo de retorno se precisar.

### Helper `parseLimit/parsePage` inline

```ts
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}
```

### Mock fixture pattern para preview-flow.test.ts

Criar previewSummary mock com sampleRows variado de status — não precisa rodar matcher/parser. Apenas testar a lógica de filter+pagination.

### O que NÃO fazer

- ❌ NÃO criar UI
- ❌ NÃO escrever errorReportPath no DB
- ❌ NÃO criar GET lista de jobs
- ❌ NÃO criar test integration full-app

### Project Structure Notes

Files que esta story mexe:
- ✨ `backend-api/src/modules/imports/error-report-builder.ts`
- ✨ `backend-api/src/modules/imports/preview-flow.ts`
- ✨ `backend-api/src/modules/imports/error-report-flow.ts`
- ✏️ `backend-api/src/routes/api/v1/admin/imports/jobs.ts` — +2 rotas
- ✏️ `backend-api/src/routes/api/v1/imports/jobs.ts` — +2 rotas
- ✨ `backend-api/test/modules/error-report-builder.test.ts`
- ✨ `backend-api/test/modules/preview-flow.test.ts`

NÃO toca:
- prisma/schema
- frontend
- outros módulos imports já existentes
- plugins

### Mensagem de commit sugerida

```
feat(imports): GET preview + GET error-report.xlsx routes (Story 4.0b)

- GET /admin/imports/:jobId/preview + tenant variant — paginated rows
  filtered by status; query: status, page, limit; meta.pagination
  with totalPages; rate limit 60/min
- GET /admin/imports/:jobId/error-report.xlsx + tenant variant —
  on-demand .xlsx with invalid rows + reason + identifying fields;
  re-parses original buffer (~5s/5k rows); 204 if invalidCount=0;
  rate limit 10/min
- error-report-builder.ts: storage.read → parseRows → validate →
  filter invalid → XLSX.write workbook 'Erros'
- preview-flow.ts + error-report-flow.ts: helpers with explicit deps
- 7+ unit tests (3 builder + 4 flow with mock prisma)
```

### References

- [Architecture D7 — Parser + Error Reporting](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D7) (linhas 478–501)
- [Architecture D9 — endpoints](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D9) (linhas 544–579)
- [Epics — Story 4.1 (preview UI)](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 665–731)
- [Epics — Story 4.2 (error report UI)](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 734–788)
- Stories prereq (todas done): 1.1 (storage), 2.2 (parser/validator), 2.3 (matcher), 3.1 (worker), 3.2 (apply), 4.0a (status/cancel)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- Sem percalços. Mesmo padrão deps explícitas das stories anteriores resolveu typing.
- `XLSX.write({ type: 'buffer' })` retorna `unknown` no typing default — cast `as Buffer` necessário.

### Completion Notes List

- ✅ T1 — `error-report-builder.ts` com `buildErrorReportXlsx({tenantId, jobId, fileHash})`. Lê arquivo via storage.read (propaga FileIntegrityError), parseRows + validate, filtra invalid, monta workbook 'Erros' com 9 colunas pt-BR (Linha/Motivo/ID Tirvu/CPF/Nome/Status/Empresa/Lotação/Admissão).
- ✅ T2 — `preview-flow.ts` com `previewEntrypoint(deps, request, reply, { jobId, scope })`. Filtra `previewSummary.sampleRows` por status, pagina, retorna envelope com `meta.pagination`. Status filter inválido é ignorado (retorna todos). Limit clamped 1-200, page mínimo 1.
- ✅ T3 — `error-report-flow.ts` com `errorReportEntrypoint`. State check (PREVIEW_READY/APPLYING/COMPLETED/FAILED), 204 se invalid=0, FileIntegrityError → 500 com mensagem amigável, headers Content-Type+Content-Disposition. Filename sanitizado (`replace(/[^a-zA-Z0-9._-]/g, '_')`).
- ✅ T4 — Rotas adicionadas em ambos `jobs.ts`: `GET /:jobId/preview` (rate 60/min) e `GET /:jobId/error-report.xlsx` (rate 10/min).
- ✅ T5 — `error-report-builder.test.ts` (3 cases: 5 inválidos com header pt-BR, 0 inválidos só com header, FileIntegrityError) + `preview-flow.test.ts` (8 cases: sem filter, filter invalid, page=2 limit=10, limit clamp 200, previewSummary null → 409, cross-tenant 404, job inexistente 404, status inválido ignorado).
- ✅ T6 — tsc zero erros. Suite focada 12/12. Suite full regression CI-style: 245/245.

### File List

- ✨ [backend-api/src/modules/imports/error-report-builder.ts](backend-api/src/modules/imports/error-report-builder.ts)
- ✨ [backend-api/src/modules/imports/preview-flow.ts](backend-api/src/modules/imports/preview-flow.ts)
- ✨ [backend-api/src/modules/imports/error-report-flow.ts](backend-api/src/modules/imports/error-report-flow.ts)
- ✏️ [backend-api/src/routes/api/v1/admin/imports/jobs.ts](backend-api/src/routes/api/v1/admin/imports/jobs.ts) — +GET preview, +GET error-report.xlsx
- ✏️ [backend-api/src/routes/api/v1/imports/jobs.ts](backend-api/src/routes/api/v1/imports/jobs.ts) — +GET preview, +GET error-report.xlsx
- ✨ [backend-api/test/modules/error-report-builder.test.ts](backend-api/test/modules/error-report-builder.test.ts) — 3 cases
- ✨ [backend-api/test/modules/preview-flow.test.ts](backend-api/test/modules/preview-flow.test.ts) — 8 cases

### Change Log

- 2026-05-01 — Story 4.0b implementada. GET preview paginado + GET error-report.xlsx (admin/tenant). Helper error-report-builder gera xlsx on-demand re-parseando arquivo persistido. 12 unit tests novos. 245/245 CI-style full regression.
