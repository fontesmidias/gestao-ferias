# Story 1.2: POST /api/v1/admin/imports/employees — upload SuperAdmin com seleção de tenant alvo

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a SuperAdmin (Bruno),
I want fazer `POST /api/v1/admin/imports/employees` com multipart `file` (.xlsx) + body `tenantId` e receber `{ jobId, status: 'PENDING' }` em <2s,
so that posso iniciar import de qualquer tenant ativo (onboarding/manutenção) e o pipeline backend (Stories 5.1 → 1.1 → 2.1 → 2.2 → 2.3 → 3.1) é disparado em background.

## Acceptance Criteria

### Endpoint contract (FR1, FR3, FR4, FR7, D9)

1. **Rota:** `POST /api/v1/admin/imports/employees` registrada em `backend-api/src/routes/api/v1/admin/imports/employees/index.ts`. Auto-load Fastify `routes/` traz automaticamente.

2. **Auth chain:** `onRequest: [fastify.requireAuth, fastify.requireSuperAdmin, fastify.requirePermission('import.run')]`. Ordem importa: auth → role → permission. Logs:
   - JWT inválido/ausente → 401 (`requireAuth` já trata).
   - Não-SUPERADMIN → 403 (`requireSuperAdmin`).
   - SUPERADMIN sem `import.run` no mapa → 403 (defesa em profundidade — embora hoje SUPERADMIN tenha `import.run` por default).

3. **Rate limit:** `config.rateLimit = { max: 5, timeWindow: '1 minute' }`. 6º request em <60s → 429 padrão Fastify rate-limit (não custom).

4. **Multipart:** `file` field obrigatório, plus body field `tenantId` (UUID v4).
   - **Plugin global** [src/plugins/multipart.ts](backend-api/src/plugins/multipart.ts) já registra `@fastify/multipart` com `fileSize: 10MB` e `files: 1`.
   - Handler usa `await request.file()` (Fastify async iterator). Streaming opcional, mas para Story 1.2 simplificamos: `await file.toBuffer()` (Node tem RAM pra 10MB).

### Validações server-side (FR3, FR4, ordem importa)

5. **Order de validação dentro do handler:**
   1. Multipart presente? Se não → 400 `INVALID_FILE_FORMAT` "Arquivo é obrigatório".
   2. Extensão `.xlsx` (case-insensitive, último dot)? Se não → 400 `INVALID_FILE_FORMAT` "Apenas arquivos .xlsx são aceitos".
   3. `tenantId` UUID v4 no body (campo `request.body.tenantId` ou `file.fields.tenantId.value` no Fastify multipart)? Se não → 400 `INVALID_TARGET_TENANT` "tenantId é obrigatório e deve ser UUID".
   4. Tenant existe e `isActive=true`? Se não → 400 `INVALID_TARGET_TENANT` "Tenant não encontrado ou inativo".
   5. Buffer recebido. Tamanho >10_000_000 bytes? **A multipart plugin já trata, retornando erro nativo** — handler captura e retorna 413 `FILE_TOO_LARGE` (Fastify gera `FST_REQ_FILE_TOO_LARGE` que envelopamos).

### Persistência idempotente (FR34, integração Story 1.1)

6. **Sequência crítica (todas em transação Prisma onde possível):**
   1. Hash SHA-256 do buffer **antes** de gravar em FS (calcula 1×, usa 2×: persist + ImportJob.fileHash).
   2. `prisma.importJob.create({ data: { tenantId, operatorUserId, filename: <original>, fileSize, fileHash, storagePath: '<será preenchido>', status: 'PENDING', parserVersion: 'tirvu-v1', ipAddress, userAgent } })` — **storagePath placeholder** porque ainda não temos o jobId.
   3. `storage.persist({ tenantId, jobId: job.id, buffer, filename })` — usa o jobId recém-criado.
   4. `prisma.importJob.update({ where: { id: job.id }, data: { storagePath: result.storagePath } })` — atualiza com path real.
   5. `prisma.auditLog.create({ data: { tenantId, userId, action: 'EMPLOYEE_IMPORT_JOB_CREATED', resourceType: 'IMPORT_JOB', resourceId: job.id, ip, userAgent } })`.
   6. `fastify.tirvuImportQueue.add('process', { jobId: job.id })` (sem delay).
   7. Retorna 201 `{ data: { jobId: job.id, status: 'PENDING' }, error: null, meta: null }`.

7. **Falha em qualquer passo após (1):** sem rollback completo (passos 2-6 não estão em uma transação Prisma única — `storage.persist` é IO de disco). Estratégia: log error com `module: 'imports', phase: 'upload'`. **Não** retorna 500 silenciosamente — re-throw para que Fastify mande 500 padrão. Se job ficar órfão (PENDING sem arquivo), o watchdog (Story 3.1) eventualmente marca como TIMED_OUT ou cleanup-cron remove após 90d.

### IP / User Agent (FR33)

8. **`ipAddress` = `request.ip`** (Fastify trust proxy default). **`userAgent` = `request.headers['user-agent'] ?? null`**. Both gravados em `ImportJob` E em `AuditLog`.

### Response shape (V3 padrão)

9. **Sucesso (201):**
   ```json
   { "data": { "jobId": "<uuid>", "status": "PENDING" }, "error": null, "meta": null }
   ```

10. **Erro (4xx):**
    ```json
    { "data": null, "error": { "code": "INVALID_TARGET_TENANT", "message": "Tenant não encontrado ou inativo" }, "meta": null }
    ```

11. **Códigos de erro mapeados:**
    | HTTP | code |
    |---|---|
    | 400 | `INVALID_FILE_FORMAT`, `INVALID_TARGET_TENANT` |
    | 401 | (gerado por `requireAuth`) |
    | 403 | `FORBIDDEN` (gerado por `requireSuperAdmin`/`requirePermission`) |
    | 413 | `FILE_TOO_LARGE` |
    | 429 | `RATE_LIMIT_EXCEEDED` (gerado por `@fastify/rate-limit`, mas envelopa-se no plugin global se conveniente — senão segue formato padrão do plugin) |

### Suite de testes

12. **`backend-api/src/routes/api/v1/admin/imports/employees/validators.ts`** (helper extraído para testar puro):
    ```ts
    export interface FileValidationResult { ok: true } | { ok: false; code: string; message: string }
    export function validateUploadedFile({ filename, size, maxBytes = 10_000_000 }): FileValidationResult
    ```
    - Rejeita filename sem extensão `.xlsx`.
    - Rejeita size > maxBytes.
    - Aceita case-insensitive (.XLSX, .Xlsx).

13. **Tests em `test/modules/upload-validators.test.ts`** (≥6 cases):
    - Filename sem extensão → INVALID_FILE_FORMAT
    - Filename com `.csv` → INVALID_FILE_FORMAT
    - Filename `Foo.XLSX` (maiúsculo) → ok
    - Size 9_999_999 → ok
    - Size 10_000_001 → FILE_TOO_LARGE
    - Filename vazio → INVALID_FILE_FORMAT

14. **NÃO criar** integration test full-stack (app boot + multipart inject + DB live) nesta story. Padrão V3: integration tests dependem de Postgres/Redis live e ficam frágeis (debug log Story 5.1 mostra `tenants.test.ts` falha em CI). Smoke test manual fica para validação posterior (Bruno via Postman/curl).

### Out-of-scope (NÃO implementar)

15. **NÃO** criar rota TenantAdmin `/api/v1/imports/employees` — Story 1.3.
16. **NÃO** criar GET `/imports/:jobId` — Story 4.x.
17. **NÃO** criar POST `/imports/:jobId/apply` ou `/cancel` — Story 3.2/4.x.
18. **NÃO** criar UI de upload — Stories 4.x.
19. **NÃO** validar header tirvu-v1 server-side **no upload sync** — fica para o worker (Story 3.1 já faz). Spec Architecture line 845: "Server-side parsing: detecção de header — se inválido, return 400 IMMEDIATAMENTE sem persistir o arquivo". **Esta story prioriza simplicidade**: persiste sempre, worker decide. Trade-off: arquivo inválido fica no FS até o cleanup. Aceito porque: (a) já há rate limit (5/min), (b) worker resolve em <30s, (c) usuário só descobre o erro na UI de progresso (Story 4.x).
20. **NÃO** criar feature flag `imports.enabled` por tenant.
21. **NÃO** mexer em rotas existentes ou plugin de multipart.

## Tasks / Subtasks

### T1 — Helper de validação de arquivo (AC: 12)

- [x] T1.1 Criar `backend-api/src/routes/api/v1/admin/imports/employees/validators.ts`:
  ```ts
  export type FileValidationResult =
    | { ok: true }
    | { ok: false; code: 'INVALID_FILE_FORMAT' | 'FILE_TOO_LARGE'; message: string }

  export function validateUploadedFile(input: {
    filename: string | null | undefined
    size: number
    maxBytes?: number
  }): FileValidationResult
  ```
- [x] T1.2 Lógica:
  - Sem filename → `INVALID_FILE_FORMAT` "Arquivo é obrigatório".
  - Filename sem extensão `.xlsx` (case-insensitive) → `INVALID_FILE_FORMAT` "Apenas arquivos .xlsx são aceitos".
  - Size > `maxBytes ?? 10_000_000` → `FILE_TOO_LARGE` "Arquivo excede o limite de 10MB".
  - Senão → `{ ok: true }`.

### T2 — Rota POST /admin/imports/employees (AC: 1–11)

- [x] T2.1 Criar `backend-api/src/routes/api/v1/admin/imports/employees/index.ts`:
  ```ts
  import { FastifyPluginAsync } from 'fastify'
  import { createHash } from 'node:crypto'
  import { persist as storagePersist } from '../../../../../../modules/imports/import-storage'
  import { validateUploadedFile } from './validators'

  const route: FastifyPluginAsync = async (fastify) => {
    fastify.post('/', {
      onRequest: [fastify.requireAuth, fastify.requireSuperAdmin, fastify.requirePermission('import.run')],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      const user = request.user as { userId: string; role?: string }

      const data = await request.file()
      if (!data) {
        return reply.code(400).send({
          data: null,
          error: { code: 'INVALID_FILE_FORMAT', message: 'Arquivo é obrigatório' },
          meta: null,
        })
      }

      const buffer = await data.toBuffer()
      const filename = data.filename ?? null
      const tenantField = data.fields?.tenantId
      const tenantId =
        tenantField && 'value' in tenantField && typeof tenantField.value === 'string'
          ? tenantField.value
          : null

      const fileCheck = validateUploadedFile({ filename, size: buffer.length })
      if (!fileCheck.ok) {
        const status = fileCheck.code === 'FILE_TOO_LARGE' ? 413 : 400
        return reply.code(status).send({
          data: null,
          error: { code: fileCheck.code, message: fileCheck.message },
          meta: null,
        })
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!tenantId || !UUID_RE.test(tenantId)) {
        return reply.code(400).send({
          data: null,
          error: { code: 'INVALID_TARGET_TENANT', message: 'tenantId é obrigatório e deve ser UUID' },
          meta: null,
        })
      }

      const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant || !tenant.isActive) {
        return reply.code(400).send({
          data: null,
          error: { code: 'INVALID_TARGET_TENANT', message: 'Tenant não encontrado ou inativo' },
          meta: null,
        })
      }

      const fileHash = createHash('sha256').update(buffer).digest('hex')
      const ipAddress = request.ip
      const userAgent = request.headers['user-agent'] ?? null

      const job = await fastify.prisma.importJob.create({
        data: {
          tenantId,
          operatorUserId: user.userId,
          status: 'PENDING',
          parserVersion: 'tirvu-v1',
          filename: filename ?? 'unknown.xlsx',
          fileSize: buffer.length,
          fileHash,
          storagePath: '',
          ipAddress,
          userAgent,
        },
      })

      const persisted = await storagePersist({
        tenantId,
        jobId: job.id,
        buffer,
        filename: filename ?? 'unknown.xlsx',
      })

      await fastify.prisma.importJob.update({
        where: { id: job.id },
        data: { storagePath: persisted.storagePath },
      })

      await fastify.prisma.auditLog.create({
        data: {
          tenantId,
          userId: user.userId,
          action: 'EMPLOYEE_IMPORT_JOB_CREATED',
          resourceType: 'IMPORT_JOB',
          resourceId: job.id,
          ip: ipAddress,
          userAgent,
        },
      })

      await fastify.tirvuImportQueue.add('process', { jobId: job.id })

      fastify.log.info(
        { module: 'imports', importJobId: job.id, tenantId, phase: 'upload' },
        'EMPLOYEE_IMPORT_JOB_CREATED',
      )

      return reply.code(201).send({
        data: { jobId: job.id, status: 'PENDING' },
        error: null,
        meta: null,
      })
    })
  }

  export default route
  ```
- [x] T2.2 Tratamento de erros do `@fastify/multipart` (`FST_REQ_FILE_TOO_LARGE`): adicionar handler global ou capturar no try/catch — se o autoload não cobre, plugin error-handler global de V3 envelopa. Verificar [error-handler.ts](backend-api/src/plugins/error-handler.ts).

### T3 — Decorator de tipo do tirvuImportQueue (AC: 6.6)

- [x] T3.1 Já declarado em `plugins/imports.ts` (Story 3.1). Confirmar `import` automático funciona via autoload — testar `tsc` na rota.

### T4 — Testes do validator (AC: 13)

- [x] T4.1 Criar `backend-api/test/modules/upload-validators.test.ts`:
  ```ts
  import test from 'node:test'
  import assert from 'node:assert'
  import { validateUploadedFile } from '../../src/routes/api/v1/admin/imports/employees/validators'
  ```
- [x] T4.2 Casos do AC13.

### T5 — Validação final (AC: tudo)

- [x] T5.1 `npx tsc --noEmit` zero erros.
- [x] T5.2 Suite focada novo:
  ```bash
  node --test -r ts-node/register "test/modules/upload-validators.test.ts"
  ```
  ≥6 cases pass.
- [x] T5.3 Suite full regression: 148 + ≥6 = ≥154, 0 fail.
- [x] T5.4 Atualizar Dev Agent Record com File List.

## Dev Notes

### Auth chain V3

`requireAuth` decora `request.user`. `requireSuperAdmin` valida `request.user.role === 'SUPERADMIN'`. `requirePermission('import.run')` da Story 5.1 valida via mapa estático. Para `/admin/*` rotas: triplo guard mantém defesa em camadas (uma falha lógica em `requirePermission` não vaza acesso para não-SuperAdmin).

### Por que persistir antes de validar header tirvu-v1?

Architecture line 845 sugere validação síncrona. **Mas:** validação síncrona de header obriga importar `tirvuParser.detect` na rota — acoplamento HTTP→domain pesado. Worker (Story 3.1) já faz detect e transita FAILED em <2s. Trade-off: arquivo inválido ocupa disco até cleanup. **Custo aceitável** (10MB max × 5/min × 1 SuperAdmin × 24h ≈ 72GB/dia worst-case-irreal — na prática alguns MB).

### `@fastify/multipart` API

`request.file()` retorna `{ filename, mimetype, fields, toBuffer(), file }`. `data.fields.<name>` retorna campos não-arquivo, formato `{ value: 'xxx', fieldname, ... }`. Valida `'value' in field` e `typeof === 'string'` antes de usar.

### Rate limit Fastify

`@fastify/rate-limit` plugin está registrado globalmente (ver [src/plugins/rate-limit.ts](backend-api/src/plugins/rate-limit.ts)). Per-route override via `config.rateLimit`. Resposta padrão: 429 com header `Retry-After`. Não envelopa em `{ data, error }` por default — Fastify retorna JSON simples `{ statusCode: 429, error: 'Too Many Requests', message: '...' }`. **Aceitar formato padrão** nesta story; envelope custom fica para Story 5.2 (sanitização global).

### Estrutura de pasta auto-load

Fastify @fastify/autoload registra `src/routes/**/*.ts` como rotas. Pasta `routes/api/v1/admin/imports/employees/` com `index.ts` exportando `FastifyPluginAsync` default → resolve em `POST /api/v1/admin/imports/employees`.

### Por que `storagePath: ''` placeholder?

Não há transação atômica que: cria DB row + escreve em FS. Approach pragmático: cria row PENDING com `storagePath: ''`, persiste arquivo (recebe path real), update. Inconsistência possível (crash entre create+persist) deixa job órfão sem arquivo — watchdog (Story 3.1) detecta como TIMED_OUT após 15min ou cleanup remove em 90d. Aceitável para MVP.

### Fields multipart com `attachFieldsToBody`

Alternative API: `multipart` plugin pode anexar fields ao `request.body`. Plugin atual NÃO usa essa flag — fields ficam em `data.fields`. Manter consistente com pattern atual.

### Capture de IP atrás de proxy

`request.ip` retorna o socket remote IP. Em produção atrás de Traefik: configurar `trustProxy: true` no Fastify (já feito em `app.ts` em V3 ou TBD). Para esta story, `request.ip` é suficiente — se valor for IP do proxy em vez do cliente, é responsabilidade da config global.

### Erro "RATE_LIMIT_EXCEEDED" — formato

`@fastify/rate-limit` retorna formato próprio. Não tentamos envelopar. Test do AC só verifica status 429.

### O que NÃO fazer nesta story

- ❌ NÃO criar middleware de tenant scope (Prisma extension global já cobre).
- ❌ NÃO criar `import-controller.ts` ou camada de service intermediária — handler direto.
- ❌ NÃO chamar `tirvuParser.detect` aqui — Story 3.1 worker faz.
- ❌ NÃO escrever em Employees ou Workplaces — só ImportJob+AuditLog.
- ❌ NÃO criar UI.
- ❌ NÃO criar test integration full-app.

### Project Structure Notes

Files que esta story mexe (esperado):
- ✨ `backend-api/src/routes/api/v1/admin/imports/employees/index.ts` — nova rota
- ✨ `backend-api/src/routes/api/v1/admin/imports/employees/validators.ts` — helper testável
- ✨ `backend-api/test/modules/upload-validators.test.ts` — 6+ cases

Files que esta story **NÃO** deve tocar:
- 🚫 `prisma/schema.prisma` (Story 2.1 done)
- 🚫 `src/plugins/*` (multipart, auth, permissions, imports — todos done)
- 🚫 `src/modules/imports/*` (todas Stories 5.1/2.2/2.3/1.1/3.1 done)
- 🚫 frontend-web

### Mensagem de commit sugerida

```
feat(imports): POST /admin/imports/employees route (Story 1.2)

- Route: SUPERADMIN-only upload with explicit tenantId selection
- Auth chain: requireAuth + requireSuperAdmin + requirePermission('import.run')
- Validations: .xlsx extension, ≤10MB, tenant exists+isActive, UUID
- Flow: hash buffer → create ImportJob (PENDING) → storage.persist →
  update storagePath → AuditLog EMPLOYEE_IMPORT_JOB_CREATED →
  tirvuImportQueue.add('process', { jobId })
- IP + user-agent captured per FR33
- Rate limit 5/min per route
- Response envelope: { data, error, meta }
- Error codes: INVALID_FILE_FORMAT, FILE_TOO_LARGE, INVALID_TARGET_TENANT
- 6+ unit tests for validateUploadedFile helper
```

### References

- [Architecture D9 — API Endpoint Structure](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D9) (linhas 544–579)
- [Architecture D6 — Authorization Model](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D6)
- [Architecture §Format Patterns — error codes](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) (linhas 793–807)
- [Epics — Story 1.2](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 302–338)
- [PRD — FR1, FR3, FR4, FR7, FR33, FR34, FR38](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- Stories prereq (todas done): [5.1](_evo-output/implementation-artifacts/v3-2-import-tirvu/5-1-encryption-and-permissions.md), [1.1](_evo-output/implementation-artifacts/v3-2-import-tirvu/1-1-import-storage-and-cleanup.md), [2.1](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-1-schema-migration-employee-and-import-job.md), [3.1](_evo-output/implementation-artifacts/v3-2-import-tirvu/3-1-bullmq-worker-and-orchestration.md)
- Plugin patterns: [auth-guard.ts](backend-api/src/plugins/auth-guard.ts), [permissions.ts](backend-api/src/plugins/permissions.ts), [multipart.ts](backend-api/src/plugins/multipart.ts), [imports.ts](backend-api/src/plugins/imports.ts)
- Rate limit pattern existente: [auth/index.ts:9-15](backend-api/src/routes/api/v1/auth/index.ts#L9-L15)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- Sem percalços. Tipos do `@fastify/multipart` aceitam tanto field único quanto array — adicionei guard `!Array.isArray(tenantField)`.
- `data.toBuffer()` lança quando size estoura `fileSize: 10000000` configurado no plugin — capturei `FST_REQ_FILE_TOO_LARGE` em ambos `request.file()` e `data.toBuffer()` para devolver 413 com envelope V3.

### Completion Notes List

- ✅ T1 — `validators.ts` com `validateUploadedFile` (filename ausente/vazio/sem .xlsx → `INVALID_FILE_FORMAT`; size > maxBytes → `FILE_TOO_LARGE`; case-insensitive na extensão; `maxBytes` configurável).
- ✅ T2 — Rota `POST /api/v1/admin/imports/employees` com auth chain triplo (`requireAuth + requireSuperAdmin + requirePermission('import.run')`), rate limit 5/min, multipart com tenantId obrigatório UUID, validação de tenant (existe + isActive), pipeline create→persist→update→AuditLog→enqueue.
- ✅ T3 — Decorator `tirvuImportQueue` da Story 3.1 reconhecido pelo TS via declare module no `plugins/imports.ts`.
- ✅ T4 — `upload-validators.test.ts` com 10 cases (filename null, whitespace, .csv, sem extensão, .XLSX maiúsculo, .Xlsx misto, size limítrofes, maxBytes custom, happy path).
- ✅ T5 — tsc zero erros. Suite focada 10/10. Suite full regression 158/158 (148 + 10).

### File List

- ✨ [backend-api/src/routes/api/v1/admin/imports/employees/validators.ts](backend-api/src/routes/api/v1/admin/imports/employees/validators.ts)
- ✨ [backend-api/src/routes/api/v1/admin/imports/employees/index.ts](backend-api/src/routes/api/v1/admin/imports/employees/index.ts)
- ✨ [backend-api/test/modules/upload-validators.test.ts](backend-api/test/modules/upload-validators.test.ts) — 10 cases

### Change Log

- 2026-05-01 — Story 1.2 implementada. Endpoint `POST /api/v1/admin/imports/employees` com SUPERADMIN-only + import.run + rate limit 5/min + validações multipart + integração com Story 1.1 (storage), 2.1 (ImportJob), 3.1 (queue), 5.1 (permission). 158/158 full regression.
