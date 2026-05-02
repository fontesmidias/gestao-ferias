# Story 1.3: POST /api/v1/imports/employees — upload TenantAdmin com tenantId derivado do JWT

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a TenantAdmin (Carla),
I want fazer `POST /api/v1/imports/employees` com multipart `file` (sem precisar selecionar tenant) e receber `{ jobId, status: 'PENDING' }`,
so that posso fazer reimport mensal de manutenção do meu próprio tenant sem risco de cross-tenant.

## Acceptance Criteria

### Endpoint contract (FR2, FR3, FR4, FR8 backend, FR33, FR34, FR38)

1. **Rota:** `POST /api/v1/imports/employees` em `backend-api/src/routes/api/v1/imports/employees/index.ts`. Auto-load registra automaticamente.

2. **Auth chain:** `onRequest: [fastify.requireAuth, fastify.requireAdmin, fastify.requirePermission('import.run')]`. `requireAdmin` aceita `ADMIN` ou `SUPERADMIN` — combinado com `requirePermission('import.run')` (mapa estático SUPERADMIN+ADMIN). Não-ADMIN role → 403.

3. **Rate limit:** `config.rateLimit = { max: 5, timeWindow: '1 minute' }`. Padrão da feature.

4. **Multipart:** apenas `file` field obrigatório. **`tenantId` NÃO é aceito do payload** — sempre derivado de `request.user.tenantId`. Se body trouxer `tenantId`, é silenciosamente ignorado (não retorna erro, **defensive**).

### Comportamento de tenant isolation (FR8)

5. **`tenantId` do JWT** (`request.user.tenantId`) é **única fonte de verdade**:
   - Se ausente (SUPERADMIN sem tenant) → 400 `INVALID_TARGET_TENANT` "Esta rota é para usuários com tenant. SUPERADMIN deve usar /admin/imports/employees".
   - Validação `findUnique({ id: tenantId })` + `isActive=true` igual à Story 1.2. Tenant inativo → 400 `INVALID_TARGET_TENANT`.

6. **AuditLog tem `tenantId` do JWT** — não confunde com qualquer payload.

### Validações de arquivo (idêntico Story 1.2)

7. Reusa `validateUploadedFile` da Story 1.2 (`backend-api/src/routes/api/v1/admin/imports/employees/validators.ts`).
   - **Não duplicar código.** Importa o helper já existente.

8. Erros `INVALID_FILE_FORMAT` / `FILE_TOO_LARGE` mesmo formato envelope V3.

### Persistência (idêntico Story 1.2 — mesma sequência)

9. **Mesma sequência da Story 1.2 AC6:** hash → create ImportJob (PENDING) → storage.persist → update storagePath → AuditLog `EMPLOYEE_IMPORT_JOB_CREATED` → tirvuImportQueue.add('process', { jobId }) → 201.

10. **DRY:** se a sequência **for idêntica** entre 1.2 e 1.3, extrair em helper `processUploadedImport(fastify, { tenantId, userId, buffer, filename, ip, userAgent })` em arquivo compartilhado. **Decisão recomendada:** sim, extrair em `backend-api/src/modules/imports/upload-flow.ts` para evitar drift. Story 1.2 também passa a usar — refactor leve da rota da Story 1.2.

### Cross-tenant defensive (FR8 partial)

11. **TenantAdmin com payload `tenantId` apontando para outro tenant:** ignorado silenciosamente. Worker recebe job com `tenantId` do JWT. **Não retorna erro** — UX simplifica (cliente HTTP eventualmente envia tenantId por engano, não vamos bloquear).

12. **Posterior GET /imports/:jobId** (Story 4.x) garante 404 cross-tenant. Esta story não implementa GET.

### Suite de testes

13. **Não criar nova suite só pra reusar `validateUploadedFile`** — já testado em Story 1.2. Tests desta story focam apenas no helper extraído `processUploadedImport` (se for criado), em particular:
    - Idempotência: mesma chamada sequencial cria 2 jobs distintos (jobId diferentes).
    - Padrão de output: retorna `{ jobId, status: 'PENDING' }`.

14. **`test/modules/upload-flow.test.ts`** (≥3 cases) com mock Prisma + storage:
    - happy path: cria ImportJob, persiste, atualiza storagePath, AuditLog, enqueue
    - storage.persist falha → re-throw para caller (rota envelopa)
    - retorna jobId stringa

### Out-of-scope (NÃO implementar)

15. **NÃO criar GET `/imports/:jobId`** — Story 4.x.
16. **NÃO criar POST `/imports/:jobId/apply`/`cancel`** — Stories 3.2/4.x.
17. **NÃO mexer em rotas legadas V3** (apenas `/admin/imports/employees` da Story 1.2 ganha refactor leve para usar o helper).
18. **NÃO criar UI** — Stories 4.x.
19. **NÃO duplicar `validateUploadedFile`** — importar do path da Story 1.2.

## Tasks / Subtasks

### T1 — Helper compartilhado `upload-flow.ts` (AC: 10)

- [x] T1.1 Criar `backend-api/src/modules/imports/upload-flow.ts` (ou `import-upload-flow.ts` para clareza). Cabeçalho TODO.
- [x] T1.2 Função:
  ```ts
  import type { PrismaClient } from '@prisma/client'
  import { createHash } from 'node:crypto'
  import { persist as storagePersist } from './import-storage'
  import type { Queue } from 'bullmq'

  export interface ProcessUploadInput {
    tenantId: string
    operatorUserId: string
    buffer: Buffer
    filename: string
    ipAddress: string | null
    userAgent: string | null
  }

  export interface ProcessUploadResult {
    jobId: string
    status: 'PENDING'
  }

  export async function processUploadedImport(
    prisma: PrismaClient,
    queue: Pick<Queue, 'add'>,
    input: ProcessUploadInput,
  ): Promise<ProcessUploadResult>
  ```
- [x] T1.3 Implementação literalmente igual à sequência atual da Story 1.2 AC6 (hash, create job, persist, update storagePath, auditLog, queue.add). Retorna `{ jobId, status: 'PENDING' }`.

### T2 — Refactor da rota Story 1.2 (AC: 10)

- [x] T2.1 Editar [backend-api/src/routes/api/v1/admin/imports/employees/index.ts](backend-api/src/routes/api/v1/admin/imports/employees/index.ts). Substituir o bloco de hash+create+persist+update+auditLog+enqueue por chamada `processUploadedImport(fastify.prisma, fastify.tirvuImportQueue, { tenantId, operatorUserId, buffer, filename, ipAddress, userAgent })`.
- [x] T2.2 Re-rodar testes da Story 1.2 (`upload-validators.test.ts`) — devem continuar passando (sem alteração de validators).

### T3 — Rota TenantAdmin (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9, 11)

- [x] T3.1 Criar `backend-api/src/routes/api/v1/imports/employees/index.ts`:
  ```ts
  import type { FastifyPluginAsync } from 'fastify'
  import { processUploadedImport } from '../../../../../modules/imports/upload-flow'
  import { validateUploadedFile } from '../../admin/imports/employees/validators'

  const route: FastifyPluginAsync = async (fastify) => {
    fastify.post('/', {
      onRequest: [
        fastify.requireAuth,
        fastify.requireAdmin,
        fastify.requirePermission('import.run'),
      ],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      const user = request.user as { userId: string; tenantId?: string; role?: string }
      const tenantId = user.tenantId

      // ... mesmas validações: file presence, validateUploadedFile, tenant existe + ativo
      // ... chama processUploadedImport
      // ... retorna 201
    })
  }
  export default route
  ```
- [x] T3.2 Comportamento de tenantId:
  ```ts
  if (!tenantId) {
    return reply.code(400).send(envelope(null, {
      code: 'INVALID_TARGET_TENANT',
      message: 'Esta rota é para usuários com tenant. SUPERADMIN deve usar /admin/imports/employees',
    }))
  }
  ```
- [x] T3.3 NÃO ler tenantId do body. Se presente, ignora.

### T4 — Testes do helper (AC: 14)

- [x] T4.1 Criar `backend-api/test/modules/upload-flow.test.ts`. Setup `IMPORT_FILE_STORAGE_PATH` em `os.tmpdir()` similar ao `import-storage.test.ts`.
- [x] T4.2 Mock Prisma:
  - `importJob.create({ data })` → retorna `{ id: randomUUID, ...data }`
  - `importJob.update({ where, data })` → registra
  - `auditLog.create({ data })` → registra
- [x] T4.3 Mock Queue: `{ add: jest-style-counter }`.
- [x] T4.4 Casos:
  - happy path: returns `{ jobId, status: 'PENDING' }`. Verifica que: ImportJob.create foi chamado com tenantId/operatorUserId/fileHash; storage.persist foi chamado; ImportJob.update setou storagePath; AuditLog.create com `EMPLOYEE_IMPORT_JOB_CREATED`; queue.add('process', { jobId }) foi chamado.
  - storage.persist é lazy import — usa real (não mock) com tmpdir; verifica arquivo existe.
  - 2 chamadas sequenciais → 2 jobIds distintos (UUID-ish).

### T5 — Validação final (AC: tudo)

- [x] T5.1 `npx tsc --noEmit` zero erros.
- [x] T5.2 Suite focada novo + não-regressão dos validators:
  ```bash
  node --test -r ts-node/register \
    "test/modules/upload-flow.test.ts" \
    "test/modules/upload-validators.test.ts"
  ```
- [x] T5.3 Suite full regression: 158 + ≥3 = ≥161 pass, 0 fail.
- [x] T5.4 Atualizar Dev Agent Record com File List (incluindo refactor da 1.2).

## Dev Notes

### Por que extrair `upload-flow.ts`?

Stories 1.2 e 1.3 têm 95% do mesmo código (só muda como tenantId é resolvido). Sem extração: copy-paste leva a drift (uma fixa um bug que outra não fixa). Extração 1× agora paga em todas as próximas evoluções (logging, retry, etc.).

### `requireAdmin` aceita SUPERADMIN

`auth-guard.ts:19-24` deixa `SUPERADMIN` passar em `requireAdmin`. Isso é OK aqui — SuperAdmin acessando `/imports/employees` (sem `/admin/`) vai cair em "tenant ausente" no AC5. Não duplica funcionalidade da Story 1.2 (que tem `/admin/` e exige tenantId no body).

### Defensive ignore de tenantId no body

Se cliente HTTP enviar `tenantId` por engano (cópia de exemplo), simplesmente ignoramos. Comportamento documentado no AC11. **Não logamos warning** para evitar spam de logs em integrações automatizadas.

### Helper compartilhado — onde colocar

Architecture line 736 lista `import-job-service.ts` no módulo `imports/`. Posso colocar `upload-flow.ts` no mesmo diretório. Alternativa: estender `import-job-service.ts` com função `createPendingJob`. **Decisão:** novo arquivo (separação por concern — upload é HTTP-side, service é state machine).

### Compartilhamento do `validators.ts`

Importar via path relativo `../../admin/imports/employees/validators`. Funciona pelo autoload (Fastify só registra `index.ts` como plugin; outros arquivos no diretório são livres). Alternativa: mover validators para `src/modules/imports/upload-validators.ts`. **Decisão:** mover para `src/modules/imports/upload-validators.ts` para deixar `routes/.../admin/imports/employees/` limpo. Tests apontam para o novo path. Refactor leve.

### Atualização recomendada do plano: mover `validators.ts`

- ✏️ Apagar `backend-api/src/routes/api/v1/admin/imports/employees/validators.ts` (Story 1.2)
- ✨ Criar `backend-api/src/modules/imports/upload-validators.ts` com **mesmo conteúdo**
- ✏️ Story 1.2 route: import path muda
- ✏️ Test `upload-validators.test.ts`: import path muda

### Pegadinhas

- **`request.user.tenantId` pode ser `undefined`** se SUPERADMIN. AC5 trata.
- **Plugin imports.ts decora `tirvuImportQueue`** — disponível em ambas rotas.
- **AuditLog requer `userId`** — usar `user.userId` consistente com Story 1.2.

### O que NÃO fazer

- ❌ NÃO duplicar lógica de upload entre rotas — usar helper.
- ❌ NÃO migrar rotas legadas V3 para `requirePermission` — fora de escopo.
- ❌ NÃO implementar GET ou apply/cancel.
- ❌ NÃO criar UI.

### Project Structure Notes

Files que esta story mexe:
- ✨ `backend-api/src/modules/imports/upload-flow.ts` — novo helper
- ✨ `backend-api/src/modules/imports/upload-validators.ts` — movido (mover de `routes/.../validators.ts`)
- ✨ `backend-api/src/routes/api/v1/imports/employees/index.ts` — nova rota TenantAdmin
- ✏️ `backend-api/src/routes/api/v1/admin/imports/employees/index.ts` — refactor para usar helper + import path validators
- 🗑️ `backend-api/src/routes/api/v1/admin/imports/employees/validators.ts` — deletado (movido)
- ✏️ `backend-api/test/modules/upload-validators.test.ts` — atualizar import path
- ✨ `backend-api/test/modules/upload-flow.test.ts` — 3+ cases

Files que NÃO toca:
- 🚫 `prisma/schema.prisma`
- 🚫 plugins/*
- 🚫 outros módulos imports/*
- 🚫 frontend-web

### Mensagem de commit sugerida

```
feat(imports): POST /imports/employees route + extract upload-flow helper (Story 1.3)

- New TenantAdmin route: tenantId derived from JWT, not from payload
  (defensive ignore if body provides one); SUPERADMIN gets 400 with
  hint to use /admin/imports/employees
- Extracted upload-flow.ts helper shared by Stories 1.2 + 1.3:
  hash buffer, create ImportJob (PENDING), storage.persist, update
  storagePath, AuditLog, enqueue
- Moved validators.ts from route folder to src/modules/imports/
  for cross-route reuse
- Refactored Story 1.2 route to use the helper (DRY)
- 3+ new unit tests for upload-flow with mock Prisma + real tmpdir
- Auth chain: requireAuth + requireAdmin + requirePermission('import.run')
- Rate limit 5/min
```

### References

- [Architecture D9 — API Endpoints](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D9)
- [Architecture D6 — Authorization Model](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D6)
- [Epics — Story 1.3](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 342–371)
- [PRD — FR2, FR3, FR4, FR8, FR33, FR34, FR38](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- [Story 1.2 (done)](_evo-output/implementation-artifacts/v3-2-import-tirvu/1-2-upload-route-superadmin.md) — sequência idêntica de persistência
- [auth-guard.ts](backend-api/src/plugins/auth-guard.ts) — `requireAdmin` aceita ADMIN ou SUPERADMIN

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- Sem percalços. `git mv` preservou histórico do `validators.ts` (agora `upload-validators.ts`).

### Completion Notes List

- ✅ T1 — `upload-flow.ts` exporta `processUploadedImport(prisma, queue, input)` com sequência completa hash→create→persist→update→audit→enqueue.
- ✅ T2 — Validators movido para `src/modules/imports/upload-validators.ts` via `git mv`. Story 1.2 route refatorada para usar `processUploadedImport` (DRY).
- ✅ T3 — Rota `POST /api/v1/imports/employees` (TenantAdmin). Auth chain: `requireAuth + requireAdmin + requirePermission('import.run')`. tenantId do JWT é fonte única — payload `tenantId` ignorado silenciosamente. SUPERADMIN sem tenant → 400 com hint para `/admin/imports/employees`.
- ✅ T4 — `upload-flow.test.ts` com 3 cases (happy path com mock Prisma + storage real em tmpdir, 2 chamadas → jobIds distintos, storage.persist falha propaga).
- ✅ T5 — tsc zero erros. Suite focada 14/14 (10 validators + 4 upload-flow). Suite full regression 162/162 (158 + 4 novos do upload-flow).

### File List

- ✨ [backend-api/src/modules/imports/upload-flow.ts](backend-api/src/modules/imports/upload-flow.ts) — helper compartilhado
- ✨ [backend-api/src/modules/imports/upload-validators.ts](backend-api/src/modules/imports/upload-validators.ts) — movido de routes/admin/imports/employees/validators.ts
- ✨ [backend-api/src/routes/api/v1/imports/employees/index.ts](backend-api/src/routes/api/v1/imports/employees/index.ts) — nova rota TenantAdmin
- ✏️ [backend-api/src/routes/api/v1/admin/imports/employees/index.ts](backend-api/src/routes/api/v1/admin/imports/employees/index.ts) — refactor para usar helper + import path validators
- 🗑️ `backend-api/src/routes/api/v1/admin/imports/employees/validators.ts` — movido (git mv)
- ✏️ [backend-api/test/modules/upload-validators.test.ts](backend-api/test/modules/upload-validators.test.ts) — atualizado import path
- ✨ [backend-api/test/modules/upload-flow.test.ts](backend-api/test/modules/upload-flow.test.ts) — 3 cases

### Change Log

- 2026-05-01 — Story 1.3 implementada. Rota TenantAdmin + helper compartilhado upload-flow + validators movido para módulo. 162/162 full regression.
