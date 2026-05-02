# Story 4.0a (backend slice da Epic 4): GET /imports/:jobId (status) + POST /imports/:jobId/cancel

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a frontend developer (Stories 4.1 e 4.2),
I want endpoints REST que: (a) retornam status + counts + previewSummary resumido do `ImportJob` (sem rows), (b) cancelam um job em PREVIEW_READY — ambos com versões SuperAdmin (`/admin/imports/:jobId/...`) e TenantAdmin (`/imports/:jobId/...`),
so that o flow controller do frontend (Story 4.1) possa puxar status (polling 2s) e oferecer botão "cancelar". Esta é a **primeira metade** do backend slice da Epic 4 (Story 4.0b cobre `/preview` paginado e `/error-report.xlsx`).

## Acceptance Criteria

### Storage de previewSummary com TODAS as rows (pré-req do GET preview da 4.0b)

1. **Atualizar `worker-pipeline.ts` (Story 3.1)** para passar `sampleSize: rows.length` em `buildPreviewSummary(matchResult, rows.length, rows.length)`. Resultado: `previewSummary.sampleRows` contém **todas** as N linhas. Postgres jsonb suporta — para 5k rows × ~10 props = ~5MB por job, aceitável.

2. **`buildPreviewSummary`** (Story 2.3) já aceita `sampleSize` como 3º parâmetro. Sem mudança no helper.

### GET `/imports/:jobId` (status endpoint)

3. **Rotas:**
   - `GET /api/v1/admin/imports/:jobId` (SUPERADMIN)
   - `GET /api/v1/imports/:jobId` (ADMIN do tenant do job)

4. **Auth chain:**
   - admin: `[requireAuth, requireSuperAdmin, requirePermission('import.run')]`
   - tenant: `[requireAuth, requireAdmin, requirePermission('import.run')]`

5. **Rate limit:** `config.rateLimit = { max: 60, timeWindow: '1 minute' }`. Polling 2s = 30 req/min — folga 2x.

6. **Response 200:**
   ```json
   {
     "data": {
       "jobId": "<uuid>",
       "tenantId": "<uuid>",
       "status": "PENDING|PARSING|PREVIEW_READY|APPLYING|COMPLETED|FAILED|CANCELLED|TIMED_OUT",
       "filename": "...",
       "fileSize": 123456,
       "totalRows": 1000,
       "rowsProcessed": 47,
       "rowsCreated": 0,
       "rowsUpdated": 0,
       "rowsInvalid": 0,
       "rowsAbsent": 0,
       "workplacesCreated": 0,
       "previewSummary": { "totalRows": 1000, "counts": {...}, "newWorkplaces": [...] },
       "failureReason": null,
       "createdAt": "2026-05-01T...",
       "parsedAt": null,
       "appliedAt": null,
       "completedAt": null
     },
     "error": null,
     "meta": null
   }
   ```

7. **`previewSummary.sampleRows` é OMITIDO** do payload (peso, frontend usa `/preview` da Story 4.0b para paginar). Apenas `totalRows`, `counts`, `newWorkplaces` ficam.

8. **Tenant scope:** se `scope='tenant' && job.tenantId !== request.user.tenantId` → 404 `JOB_NOT_FOUND` (não vazar existência). Se job não existe → 404 idêntico.

### POST `/imports/:jobId/cancel`

9. **Rotas:**
   - `POST /api/v1/admin/imports/:jobId/cancel` (SUPERADMIN)
   - `POST /api/v1/imports/:jobId/cancel` (ADMIN do tenant)

10. **Rate limit:** `{ max: 30, timeWindow: '1 minute' }`. Operação rara.

11. **Body:** vazio (ou ignorado).

12. **Comportamento:**
    - Tenant scope check (idem AC8).
    - `transition(prisma, jobId, ['PREVIEW_READY'], 'CANCELLED', { failureReason: 'OPERATOR_CANCELLED' })`
    - `prisma.auditLog.create` com `action: 'EMPLOYEE_IMPORT_JOB_CANCELLED'`, IP/UA.
    - Race com apply: `InvalidStateTransitionError` → 409 `INVALID_JOB_STATE`.

13. **Response 200:**
    ```json
    { "data": { "jobId": "<uuid>", "status": "CANCELLED" }, "error": null, "meta": null }
    ```

### Helpers extraídos (DRY)

14. **`backend-api/src/modules/imports/status-flow.ts`** com `statusEntrypoint(fastify, request, reply, { jobId, scope })`. Pattern espelha `apply-flow.ts`.

15. **`backend-api/src/modules/imports/cancel-flow.ts`** com `cancelEntrypoint(fastify, request, reply, { jobId, scope })`.

### Suite de testes

16. **Smoke tests por integração via Fastify inject são pesados** (need DB live). Pattern V3: helpers puros são extraídos e testados via mock Prisma. Para esta story, criar:
    - **`test/modules/cancel-flow.test.ts`** (≥3 cases): happy path, race InvalidStateTransitionError → 409, job inexistente → 404.
    - **NÃO criar test integration full-app**.
    - Status-flow é sobretudo construção de objeto + scope check — coberto via revisão de código + smoke manual.

### Out-of-scope (NÃO implementar nesta sub-story — fica para 4.0b)

17. **NÃO criar `GET /imports/:jobId/preview`** — Story 4.0b.
18. **NÃO criar `GET /imports/:jobId/error-report.xlsx`** — Story 4.0b.
19. **NÃO criar `error-report-builder.ts`** — Story 4.0b.
20. **NÃO mexer em UI** — Stories 4.1/4.2.
21. **NÃO criar GET lista de jobs** (`/imports` sem id).
22. **NÃO permitir cancel após APPLYING**.

## Tasks / Subtasks

### T1 — Atualizar `worker-pipeline.ts` (AC: 1)

- [x] T1.1 Editar [backend-api/src/modules/imports/worker-pipeline.ts](backend-api/src/modules/imports/worker-pipeline.ts): trocar `buildPreviewSummary(matchResult, rows.length)` por `buildPreviewSummary(matchResult, rows.length, rows.length)`.
- [x] T1.2 Conferir que test `worker-pipeline.test.ts` continua passando (sample assertion não bate exato com 50, mas com ≥1 — OK).

### T2 — `cancel-flow.ts` helper (AC: 12, 14, 15)

- [x] T2.1 Criar `backend-api/src/modules/imports/cancel-flow.ts`. TODO header.
- [x] T2.2 Função:
  ```ts
  export async function cancelEntrypoint(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply,
    input: { jobId: string; scope: 'admin' | 'tenant' },
  )
  ```
- [x] T2.3 Implementação:
  - findUnique job → 404 `JOB_NOT_FOUND`
  - se scope='tenant' e job.tenantId !== user.tenantId → 404
  - try transition `PREVIEW_READY → CANCELLED` com `failureReason: 'OPERATOR_CANCELLED'`
  - catch `InvalidStateTransitionError` → 409 `INVALID_JOB_STATE` "Job não pode mais ser cancelado"
  - AuditLog `EMPLOYEE_IMPORT_JOB_CANCELLED` com `tenantId, userId, resourceType: 'IMPORT_JOB', resourceId: job.id, ip, userAgent`
  - 200 envelope `{ jobId, status: 'CANCELLED' }`

### T3 — `status-flow.ts` helper (AC: 6, 7, 8, 14)

- [x] T3.1 Criar `backend-api/src/modules/imports/status-flow.ts`. TODO header.
- [x] T3.2 Função `statusEntrypoint(fastify, request, reply, { jobId, scope })`:
  - findUnique job com select de todos os campos do AC6
  - 404 se não existe ou scope mismatch
  - Constrói `previewSummaryLite = previewSummary ? { totalRows, counts, newWorkplaces } : null` (sem sampleRows)
  - 200 envelope com `data` montado conforme AC6

### T4 — Adicionar rotas em `jobs.ts` (AC: 3, 5, 9, 10)

- [x] T4.1 Editar [backend-api/src/routes/api/v1/admin/imports/jobs.ts](backend-api/src/routes/api/v1/admin/imports/jobs.ts) — adicionar antes/após o `apply`:
  ```ts
  fastify.get('/:jobId', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin, fastify.requirePermission('import.run')],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    return statusEntrypoint(fastify, request, reply, { jobId, scope: 'admin' })
  })
  fastify.post('/:jobId/cancel', {
    onRequest: [...],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    return cancelEntrypoint(fastify, request, reply, { jobId, scope: 'admin' })
  })
  ```
- [x] T4.2 Mesma adição em [backend-api/src/routes/api/v1/imports/jobs.ts](backend-api/src/routes/api/v1/imports/jobs.ts) com `requireAdmin` e `scope: 'tenant'`.

### T5 — Testes `cancel-flow.test.ts` (AC: 16)

- [x] T5.1 Criar `backend-api/test/modules/cancel-flow.test.ts`. Mock fastify + prisma minimalista.
- [x] T5.2 Casos:
  - happy path: PREVIEW_READY → CANCELLED, AuditLog criado, response 200
  - InvalidStateTransitionError (job já em outro estado) → 409
  - job inexistente → 404
  - scope='tenant' com tenantId diferente → 404 (não vaza existência)

### T6 — Validação final (AC: tudo)

- [x] T6.1 `npx tsc --noEmit` zero erros.
- [x] T6.2 Suite full regression: 177 + ≥3 = ≥180, 0 fail. Verificar que `worker-pipeline.test.ts` continua verde.
- [x] T6.3 Atualizar Dev Agent Record com File List.

## Dev Notes

### Por que armazenar todas as rows em previewSummary?

Decisão pragmática para MVP. Re-rodar match em cada request `/preview` (Story 4.0b) custaria parse+findMany+match (~5-10s) — péssima UX para tabela paginada. Armazenar uma vez na transition para PREVIEW_READY e paginar é instantâneo.

Custo: jsonb de até ~5MB por job. Postgres tem TOAST para campos grandes — sem impacto em queries que não selecionam o campo. Cleanup-cron remove jobs antigos após 90d.

### Tenant scope = 404 (não 403)

Architecture explícito: "não vazar existência cross-tenant". Tenant que tenta acessar job de outro tenant deve receber 404, mesma resposta de job inexistente.

### Por que rate limit 60/min em status?

Frontend Story 4.2 polla a cada 2s = 30 req/min. 60 dá folga 2x. Cliente normal nunca ultrapassa.

### Por que 30/min em cancel?

Operação semântica rara — cliente normal faz 1× por job. 30/min comporta sobre-clicks acidentais.

### Helper `cancelEntrypoint` mock test pattern

Não testo via Fastify inject (precisa app full + DB). Mock direto:
```ts
const fastify = {
  prisma: { ...mockPrisma },
  log: { info: () => {}, warn: () => {} }
}
const reply = {
  code(c) { this.statusCode = c; return this },
  send(payload) { this.payload = payload; return this },
  statusCode: 200, payload: undefined
}
const request = { user: { userId, tenantId, role }, ip: '...', headers: { 'user-agent': '...' } }
await cancelEntrypoint(fastify, request, reply, { jobId, scope })
assert(reply.statusCode === ...)
```

### `transition` retorna ImportJob ou lança

Reusa do Story 2.3. `InvalidStateTransitionError` é classe com `current/expected/attempted` — fácil discriminar do generic Error.

### O que NÃO fazer

- ❌ NÃO modificar UI
- ❌ NÃO criar /preview ou /error-report (Story 4.0b)
- ❌ NÃO criar GET lista de jobs
- ❌ NÃO permitir cancel mid-APPLYING
- ❌ NÃO migrar rotas legadas para `requirePermission`

### Project Structure Notes

Files que esta story mexe:
- ✏️ `backend-api/src/modules/imports/worker-pipeline.ts` — sampleSize=rows.length
- ✨ `backend-api/src/modules/imports/cancel-flow.ts`
- ✨ `backend-api/src/modules/imports/status-flow.ts`
- ✏️ `backend-api/src/routes/api/v1/admin/imports/jobs.ts` — +2 rotas (GET, cancel)
- ✏️ `backend-api/src/routes/api/v1/imports/jobs.ts` — +2 rotas
- ✨ `backend-api/test/modules/cancel-flow.test.ts`

NÃO toca:
- prisma/schema
- frontend
- outros módulos imports já existentes

### Mensagem de commit sugerida

```
feat(imports): GET status + POST cancel routes (Story 4.0a)

- GET /admin/imports/:jobId + GET /imports/:jobId — status with counts
  + previewSummary lite (sampleRows omitted to keep payload small);
  rate limit 60/min for polling
- POST /admin/imports/:jobId/cancel + tenant variant — PREVIEW_READY →
  CANCELLED with OPERATOR_CANCELLED reason + AuditLog
  EMPLOYEE_IMPORT_JOB_CANCELLED; rate limit 30/min
- Helpers status-flow.ts + cancel-flow.ts (mirror apply-flow.ts pattern)
- worker-pipeline.ts: sampleSize=rows.length so preview holds all rows
  (pre-req for /preview pagination in Story 4.0b)
- Tenant scope: 404 mismatch (not 403) to avoid cross-tenant existence
  leak
- 3+ unit tests for cancel-flow (race InvalidStateTransitionError, 404)
```

### References

- [Architecture D9 — endpoints](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D9)
- [Architecture D5 — state machine](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D5)
- [Architecture §Format Patterns — error codes](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) (linhas 793–807)
- [Epics — Story 4.1 (UI cancel button)](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md)
- Stories prereq (todas done): 1.2/1.3 (rotas upload), 2.1 (schema), 2.3 (matcher), 3.1 (worker), 3.2 (apply)
- Plugin patterns: [apply-flow.ts](backend-api/src/modules/imports/apply-flow.ts), [jobs.ts](backend-api/src/routes/api/v1/admin/imports/jobs.ts)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- Primeira versão de `cancel-flow.ts` e `status-flow.ts` usava `FastifyInstance.prisma` direto. ts-node compila por arquivo durante test runs e não enxerga as augmentations dos plugins (`declare module 'fastify'` em `src/plugins/*.ts`) → erro TS2339. Refatorado para receber `deps: { prisma, log }` explicitamente como parâmetro (mesmo padrão do `worker-pipeline.ts`/`apply-pipeline.ts`). Rotas passam `{ prisma: fastify.prisma, log: fastify.log }`. Bonus: helpers ficam mais testáveis (mock direto sem Fastify).

### Completion Notes List

- ✅ T1 — `worker-pipeline.ts`: `buildPreviewSummary(matchResult, rows.length, rows.length)` — sample agora contém todas as N rows. Pré-req do `/preview` paginado da Story 4.0b.
- ✅ T2 — `cancel-flow.ts` com `cancelEntrypoint(deps, request, reply, { jobId, scope })`. Validação 401 (sem user), 404 (não existe ou cross-tenant), 409 InvalidStateTransitionError, transition + AuditLog `EMPLOYEE_IMPORT_JOB_CANCELLED` com IP/UA, 200 envelope.
- ✅ T3 — `status-flow.ts` com `statusEntrypoint(deps, request, reply, { jobId, scope })`. Retorna shape completo com `previewSummary` lite (sampleRows omitido).
- ✅ T4 — Rotas adicionadas em `routes/api/v1/admin/imports/jobs.ts` (GET status + POST cancel — SUPERADMIN, rate limits 60/min e 30/min) e em `routes/api/v1/imports/jobs.ts` (mesmas, scope tenant).
- ✅ T5 — `cancel-flow.test.ts` com 5 cases: happy path, race InvalidStateTransitionError → 409, 404 not found, scope tenant cross-tenant → 404, scope admin ignora tenantId.
- ✅ T6 — tsc zero erros. Suite focada 5/5. Suite full regression 177 → 182 (177 existentes + 5 novos do cancel-flow). CI command `tsx --test` com env vars completas: 233/233.

### File List

- ✏️ [backend-api/src/modules/imports/worker-pipeline.ts](backend-api/src/modules/imports/worker-pipeline.ts) — sampleSize=rows.length
- ✨ [backend-api/src/modules/imports/cancel-flow.ts](backend-api/src/modules/imports/cancel-flow.ts)
- ✨ [backend-api/src/modules/imports/status-flow.ts](backend-api/src/modules/imports/status-flow.ts)
- ✏️ [backend-api/src/routes/api/v1/admin/imports/jobs.ts](backend-api/src/routes/api/v1/admin/imports/jobs.ts) — +GET status, +POST cancel
- ✏️ [backend-api/src/routes/api/v1/imports/jobs.ts](backend-api/src/routes/api/v1/imports/jobs.ts) — +GET status, +POST cancel
- ✨ [backend-api/test/modules/cancel-flow.test.ts](backend-api/test/modules/cancel-flow.test.ts) — 5 cases

### Change Log

- 2026-05-01 — Story 4.0a implementada. GET status + POST cancel (admin/tenant) com rate limit. Helpers refatorados para receber deps explícitas (compat ts-node test). previewSummary agora persiste todas as rows. 5 unit tests novos. 233/233 full regression CI-style.
