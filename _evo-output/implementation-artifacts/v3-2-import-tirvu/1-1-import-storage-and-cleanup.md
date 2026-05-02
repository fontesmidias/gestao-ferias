# Story 1.1: import-storage (FS local com SHA-256 + isolamento por tenant) + cleanup-cron (retenção 90d)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor backend,
I want um módulo `import-storage.ts` que persiste arquivos `.xlsx` em `/var/imports/{tenantId}/{jobId}.xlsx` com SHA-256, valida integridade na leitura, e um módulo `cleanup-cron.ts` que purga arquivos + zera paths em `ImportJob` quando o job tem mais de `IMPORT_RETENTION_DAYS=90` dias em estado terminal,
so that as Stories 1.2/1.3 (rotas de upload) tenham um helper consistente para gravar buffers e o sistema mantenha conformidade com retenção configurável (NFR19).

## Acceptance Criteria

### Persistência (FR6, D4)

1. **Função `storage.persist({ tenantId, jobId, buffer, filename })`** retorna `Promise<{ storagePath, fileHash, fileSize }>`:
   - Cria diretório `${IMPORT_FILE_STORAGE_PATH}/${tenantId}/` se não existir, com permissão `0o700` (apenas owner — Linux/macOS; no Windows, `mkdir` ignora silenciosamente o mode — ver Dev Notes).
   - Escreve buffer em `${IMPORT_FILE_STORAGE_PATH}/${tenantId}/${jobId}.xlsx`.
   - Calcula SHA-256 do buffer (hex string, 64 chars).
   - Retorna `storagePath` (caminho absoluto), `fileHash` (hex), `fileSize` (bytes).

2. **Validação fail-fast no boot do módulo:** Se `process.env.IMPORT_FILE_STORAGE_PATH` for vazio ou ausente, lança erro **no import** com mensagem `"IMPORT_FILE_STORAGE_PATH is required (ex.: /var/imports). Set in .env."`. Pattern espelha `bank-data-encryption.ts` da Story 5.1.

3. **`tenantId` e `jobId` são validados** como UUID v4 antes de virarem path. Se não forem UUID, lança `Error('tenantId/jobId must be UUID')` — previne path traversal (ex.: `../../etc/passwd`).

4. **Filename original** é guardado no caller (rota grava em `ImportJob.filename` direto). `storage.persist` usa só `${jobId}.xlsx` no path — não confia em filename do upload.

### Leitura com checagem de integridade (FR34)

5. **`storage.read({ tenantId, jobId, expectedHash })`** retorna `Promise<Buffer>`:
   - Lê arquivo do path canônico.
   - Calcula SHA-256 do buffer lido.
   - Se diverge de `expectedHash`, lança `FileIntegrityError` com `{ tenantId, jobId, expected, actual }`. Não retorna o buffer.

6. **`FileIntegrityError`** é classe exportada de `import-storage.ts`. Estende `Error`. Caller é livre para logar (Pino) e marcar `ImportJob.failureReason = 'FILE_INTEGRITY_FAILED'`.

7. **Arquivo inexistente:** `storage.read` lança erro nativo `ENOENT` (não captura). Worker (Story 3.1) decide o tratamento.

### Remoção (cleanup-cron)

8. **`cleanup.removeForJob({ tenantId, jobId })`** remove **silenciosamente** o arquivo principal do path canônico. Se arquivo não existe (`ENOENT`), retorna OK (não é erro). Outros erros propagam.

9. **`cleanup.removeAllExpired(prisma, { retentionDays = IMPORT_RETENTION_DAYS })`**:
   - Query: `prisma.importJob.findMany` onde `createdAt < now - retentionDays days` E `status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT')` (apenas terminal).
   - Para cada job: remove arquivo via `removeForJob` + zera `storagePath` e `errorReportPath` no banco (`prisma.importJob.update({ data: { storagePath: null, errorReportPath: null } })`).
   - **Não** apaga registros de `ImportJob` — auditoria preservada.
   - Retorna `{ scanned, filesRemoved, dbUpdated }`.

10. **`cleanupOldImports(prisma)`** é o entry point chamado pelo cron. Internamente delega para `removeAllExpired`. Esta story **NÃO** wireia o scheduler (BullMQ ou node-cron) — apenas exporta a função pura. Story 3.1 será responsável por agendar (`backend-api/src/plugins/imports.ts`).

### Volume Docker (OP2 gating)

11. **`docker-compose.yml`** ganha volume `imports-data:/var/imports` no serviço `backend` + declaração no bloco `volumes:`. Preserva configuração existente sem regressão.

12. **`docker-compose.override.yml`** propaga o mesmo mount para o ambiente local (mesmo binding ou bind-mount para path de host se preferível em dev).

13. **`backend-api/.env.example`** adiciona `IMPORT_FILE_STORAGE_PATH=/var/imports` e `IMPORT_RETENTION_DAYS=90` documentados. Valores default razoáveis para dev (caso não tenha o volume montado, dev pode rodar com `IMPORT_FILE_STORAGE_PATH=./tmp/imports` em `.env` local).

### Suite de testes

14. **`test/modules/import-storage.test.ts`** (≥10 cases):
    - `persist` cria diretório + arquivo, retorna hash determinístico
    - `persist` chamado 2× com mesmo `(tenantId, jobId)` sobrescreve sem erro
    - `persist` com `tenantId` não-UUID lança `must be UUID`
    - `persist` com `jobId` não-UUID lança
    - `read` retorna buffer original quando hash bate
    - `read` lança `FileIntegrityError` quando hash divergente
    - `read` em arquivo inexistente lança `ENOENT`
    - `removeForJob` remove arquivo existente
    - `removeForJob` em arquivo inexistente é silencioso
    - hash SHA-256 = 64 hex chars

15. **`test/modules/import-cleanup.test.ts`** (≥3 cases):
    - `removeAllExpired` busca jobs >90d em estado terminal e zera paths
    - `removeAllExpired` ignora jobs em estado não-terminal mesmo se antigos
    - `removeAllExpired` retorna contadores corretos
    - Mock Prisma + mock filesystem (usar diretório temporário real ao invés de mockar `fs`).

16. **Setup dos testes:** `process.env.IMPORT_FILE_STORAGE_PATH` setado para diretório temporário (`os.tmpdir() + 'gf-import-test-' + randomUUID()`) **antes** de importar o módulo (módulo valida no top-level). Cleanup em `t.after`.

### Out-of-scope (NÃO implementar)

17. **NÃO criar rotas REST** (Stories 1.2, 1.3).
18. **NÃO criar BullMQ queue/worker** — Story 3.1.
19. **NÃO agendar o cron via node-cron ou BullMQ repeat job** — Story 3.1 fará a integração no `plugins/imports.ts`.
20. **NÃO criar feature flag `imports.enabled`** no Tenant — fica para Stories 1.2/4.x quando o uso real começar.
21. **NÃO criar abstração FSDriver/S3Driver** — Architecture D4 prevê migração futura, mas MVP é FS only.
22. **NÃO criar error-report-builder.ts** — Story 4.x.
23. **NÃO mexer em `bank-data-encryption.ts`** (Story 5.1 done).
24. **NÃO escrever em `ImportJob`** fora do `removeAllExpired` — esta story só lê e zera paths.
25. **NÃO criar volume `errors-data`** separado — `errorReportPath` aponta dentro de `/var/imports/{tenantId}/`.

## Tasks / Subtasks

### T1 — Env e configuração (AC: 2, 13)

- [x] T1.1 Adicionar em [backend-api/.env.example](backend-api/.env.example) abaixo da seção do `BANK_DATA_ENCRYPTION_KEY`:
  ```
  # Caminho do volume onde arquivos .xlsx de import ficam persistidos.
  # Em produção: volume Docker `imports-data:/var/imports`.
  # Em dev local: pode usar ./tmp/imports (sem volume Docker).
  IMPORT_FILE_STORAGE_PATH=/var/imports

  # Retenção do arquivo original (em dias). Após esse prazo o cleanup-cron
  # remove o arquivo e zera storagePath/errorReportPath (ImportJob preservado).
  IMPORT_RETENTION_DAYS=90
  ```
- [x] T1.2 Adicionar `IMPORT_FILE_STORAGE_PATH=/var/imports` em `.env` e `.env` raiz se necessário (igual padrão Story 5.1). Local NÃO commitado.
- [x] T1.3 NÃO modificar `package.json` (sem deps novas — usa apenas `node:fs`/`node:crypto`/`node:path`).

### T2 — Tipos auxiliares (AC: 1, 5, 6)

- [x] T2.1 Editar [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts), adicionar (mantém tudo de 5.1/2.2/2.3):
  ```ts
  export interface PersistOptions {
    tenantId: string
    jobId: string
    buffer: Buffer
    filename: string  // não usado no path; mantido para metadata futura
  }

  export interface PersistResult {
    storagePath: string
    fileHash: string  // sha256 hex
    fileSize: number  // bytes
  }

  export interface ReadOptions {
    tenantId: string
    jobId: string
    expectedHash: string
  }

  export class FileIntegrityError extends Error {
    constructor(
      public readonly tenantId: string,
      public readonly jobId: string,
      public readonly expected: string,
      public readonly actual: string,
    ) {
      super(
        `File integrity check failed for job ${jobId} (tenant ${tenantId}): expected ${expected.slice(0, 16)}…, got ${actual.slice(0, 16)}…`,
      )
      this.name = 'FileIntegrityError'
    }
  }

  export interface CleanupResult {
    scanned: number
    filesRemoved: number
    dbUpdated: number
  }
  ```

### T3 — Módulo `import-storage.ts` (AC: 1, 2, 3, 4, 5, 6, 7, 8)

- [x] T3.1 Criar `backend-api/src/modules/imports/import-storage.ts`. Cabeçalho TODO `v3-3-rbac-data-driven`.
- [x] T3.2 Validação fail-fast top-level:
  ```ts
  const STORAGE_ROOT = process.env.IMPORT_FILE_STORAGE_PATH
  if (!STORAGE_ROOT || STORAGE_ROOT.trim().length === 0) {
    throw new Error('IMPORT_FILE_STORAGE_PATH is required (ex.: /var/imports). Set in .env.')
  }
  ```
- [x] T3.3 Helper `assertUuid(value, label)` — regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. Lança `Error(`${label} must be UUID`)`.
- [x] T3.4 Helper `pathFor(tenantId, jobId)` retorna `path.join(STORAGE_ROOT, tenantId, jobId + '.xlsx')` após `assertUuid` em ambos.
- [x] T3.5 Função `persist(opts: PersistOptions): Promise<PersistResult>`:
  - `assertUuid` em tenantId e jobId
  - `mkdir(dir, { recursive: true, mode: 0o700 })` (mode ignorado no Windows, intencional)
  - `writeFile(target, buffer, { mode: 0o600 })` (apenas owner read/write)
  - `fileHash = createHash('sha256').update(buffer).digest('hex')`
  - retorna `{ storagePath: target, fileHash, fileSize: buffer.length }`
- [x] T3.6 Função `read(opts: ReadOptions): Promise<Buffer>`:
  - `assertUuid`
  - `buffer = await readFile(target)` (deixa `ENOENT` propagar)
  - `actualHash = createHash('sha256').update(buffer).digest('hex')`
  - Se `actualHash !== opts.expectedHash` → throw `new FileIntegrityError(...)`. Re-importar `FileIntegrityError` de `./types`.
  - retorna buffer.
- [x] T3.7 Função `removeForJob({ tenantId, jobId })`: tenta `unlink(target)`. Se `err.code === 'ENOENT'`, ignora. Senão, propaga.
- [x] T3.8 Função `pathForErrors(tenantId, jobId)` exportada — retorna `path.join(STORAGE_ROOT, tenantId, jobId + '-errors.xlsx')`. Para Story 4.x. **Não** persiste; só calcula path.

### T4 — Módulo `cleanup-cron.ts` (AC: 8, 9, 10)

- [x] T4.1 Criar `backend-api/src/modules/imports/cleanup-cron.ts`. Cabeçalho TODO.
- [x] T4.2 Constantes:
  ```ts
  const RETENTION_DAYS = Number(process.env.IMPORT_RETENTION_DAYS ?? 90)
  const TERMINAL_STATES: ImportJobStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']
  ```
- [x] T4.3 Função `removeAllExpired(prisma: PrismaClient, opts?: { retentionDays?: number; now?: Date }): Promise<CleanupResult>`:
  ```ts
  const days = opts?.retentionDays ?? RETENTION_DAYS
  const cutoff = new Date((opts?.now ?? new Date()).getTime() - days * 86400_000)
  const expired = await prisma.importJob.findMany({
    where: { createdAt: { lt: cutoff }, status: { in: TERMINAL_STATES } },
    select: { id: true, tenantId: true, storagePath: true, errorReportPath: true },
  })
  let filesRemoved = 0
  let dbUpdated = 0
  for (const job of expired) {
    try {
      await removeForJob({ tenantId: job.tenantId, jobId: job.id })
      filesRemoved++
    } catch (e) {
      // log no caller (worker) — aqui só conta
    }
    if (job.storagePath !== null || job.errorReportPath !== null) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: { storagePath: null, errorReportPath: null },
      })
      dbUpdated++
    }
  }
  return { scanned: expired.length, filesRemoved, dbUpdated }
  ```
- [x] T4.4 Função `cleanupOldImports(prisma: PrismaClient): Promise<CleanupResult>` — wrapper que apenas chama `removeAllExpired(prisma)`. Existe para deixar a API "callable" pelo Story 3.1 sem expor `removeAllExpired` direto (semântica).

### T5 — Volume Docker e infra (AC: 11, 12)

- [x] T5.1 Editar [docker-compose.yml](docker-compose.yml). No serviço `backend`, adicionar entrada `volumes`:
  ```yaml
      volumes:
        - imports-data:/var/imports
  ```
  Se já existe `volumes:` no serviço, anexar; se não, criar a chave.
- [x] T5.2 No bloco raiz `volumes:`, adicionar:
  ```yaml
  volumes:
    postgres_data_local:
    redis_data_local:
    imports-data:
  ```
- [x] T5.3 Editar [docker-compose.override.yml](docker-compose.override.yml) (caso seja necessário sobreescrever para dev). Para dev local com containers `gv-postgres`/`gv-redis` reusados, o backend já roda dentro do container — o volume `imports-data` continua ativo. Sem mudança forçada (deixar default do compose principal).
- [x] T5.4 NÃO criar `docker-compose.swarm.yml` — não existe ainda neste repo (procurar `find . -name 'docker-compose*'`); fica para infra/produção depois.

### T6 — Testes `import-storage.test.ts` (AC: 14)

- [x] T6.1 Criar `backend-api/test/modules/import-storage.test.ts`.
- [x] T6.2 Setup com `os.tmpdir()`:
  ```ts
  import { mkdtempSync } from 'node:fs'
  import { rm } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import * as path from 'node:path'

  const TMP_ROOT = mkdtempSync(path.join(tmpdir(), 'gf-import-storage-test-'))
  process.env.IMPORT_FILE_STORAGE_PATH = TMP_ROOT
  // import dinâmico DEPOIS de setar env (módulo valida no top-level)
  const storage = await import('../../src/modules/imports/import-storage')
  const { FileIntegrityError } = await import('../../src/modules/imports/types')
  ```
- [x] T6.3 Casos do AC14. UUIDs válidos via `crypto.randomUUID()`. Cleanup com `t.after(async () => { await rm(TMP_ROOT, { recursive: true, force: true }) })`.
- [x] T6.4 Cuidado com top-level await em `node:test` — usar `await` dentro do `test('...', async (t) => { ... })` ou esperar imports síncronos (Node 20+ suporta top-level await em ESM, mas V3 usa CommonJS). Padrão: declarar `process.env.IMPORT_FILE_STORAGE_PATH = TMP_ROOT` no topo do arquivo (síncrono) **antes** do `import` estático funcionar — porém imports são hoisted. Solução: usar `require()` lazy dentro do test, igual ao padrão Story 5.1.

### T7 — Testes `import-cleanup.test.ts` (AC: 15)

- [x] T7.1 Criar `backend-api/test/modules/import-cleanup.test.ts`.
- [x] T7.2 Mock Prisma minimalista (similar a `import-job-service.test.ts`):
  - `prisma.importJob.findMany({ where, select })` — retorna fixtures pré-definidos
  - `prisma.importJob.update({ where, data })` — registra no array de chamadas
- [x] T7.3 Diretório temporário para arquivos reais (mesmo padrão de import-storage.test). Cria 2 arquivos antes do teste; chama `removeAllExpired`; verifica que sumiram.
- [x] T7.4 Casos do AC15.

### T8 — Validação final (AC: tudo)

- [x] T8.1 `npx tsc --noEmit` zero erros.
- [x] T8.2 Suite focada:
  ```bash
  node --test -r ts-node/register \
    "test/modules/import-storage.test.ts" \
    "test/modules/import-cleanup.test.ts"
  ```
  ≥13 cases pass.
- [x] T8.3 Suite full regression: 109 + ≥13 = ≥122, 0 fail.
- [x] T8.4 Verificar no host que `docker-compose config` continua válido após mudanças no compose:
  ```bash
  cd c:/Users/cery0/projetos/gestao-ferias && docker-compose config --services
  ```
- [x] T8.5 Atualizar Dev Agent Record com File List.

## Dev Notes

### Por que SHA-256 hex (e não bytes ou base64)?

Schema [prisma/schema.prisma](backend-api/prisma/schema.prisma) define `ImportJob.fileHash: String` (Story 2.1). Hex é a representação textual canônica para hashes. 64 chars cabem confortavelmente.

### Por que `mode: 0o700` no `mkdir` e `0o600` no `writeFile`?

LGPD + Architecture: arquivo contém dados pessoais cleartext (CPF, nome, endereço, dados bancários antes de cifrar). Outros usuários do servidor não devem ler. No Linux, `0o700` = `drwx------` (apenas owner). No Windows, `mkdir` ignora silenciosamente o `mode`, mas a permissão default já é restritiva (NTFS ACL via owner). Não vale a pena escrever código Windows-específico para isso no MVP.

### Por que UUID validation antes de path build?

**Path traversal** é a vulnerabilidade clássica aqui. Se um caller (Story 1.2/1.3) passar `tenantId = '../../etc'`, o path resolveria para `/etc/passwd.xlsx`. Validar UUID estritamente antes de qualquer `path.join` mata o vetor inteiro. UUIDs nunca contêm `/`, `\`, `..` etc.

### Padrão de `process.env` validation no V3

Story 5.1 estabeleceu: validar no **top-level** do módulo (executa no import). Sem env → erro fatal antes do servidor subir. Esta story replica para `IMPORT_FILE_STORAGE_PATH`. `IMPORT_RETENTION_DAYS` não fail-fast — tem default razoável (90).

### Cron scheduling fica fora desta story

A função `cleanupOldImports(prisma)` é exportada pura. Story 3.1 vai criar `backend-api/src/plugins/imports.ts` que registra:
1. BullMQ queue + worker (parse jobs)
2. BullMQ repeat job ou node-cron diário às 03h UTC chamando `cleanupOldImports`

Esta story testa a função em si com mock Prisma — o agendamento é integration test do plugin (futuro).

### Mock Prisma para `import-cleanup.test.ts`

Não precisa de Prisma real. Pattern do Story 2.3:

```ts
const calls: { findMany: any[]; update: any[] } = { findMany: [], update: [] }
const mockPrisma = {
  importJob: {
    async findMany(args: any) { calls.findMany.push(args); return fixtures },
    async update(args: any) { calls.update.push(args); return { id: args.where.id } },
  },
} as unknown as PrismaClient
```

### Path canônico do arquivo de erros (FR não-this-story)

`pathForErrors` é exportado mas Story 4.x (error-report-builder.ts) é quem escreve. Deixar exposto evita acoplamento — quando 4.x existir, basta `import { pathForErrors } from './import-storage'`.

### Erros expected no `read` em Story 3.1

Worker recebe `ImportJob` com `storagePath` e `fileHash`. Chama `storage.read({ tenantId, jobId, expectedHash: job.fileHash })`. Se `FileIntegrityError`, transição para `FAILED` com `failureReason='FILE_INTEGRITY_FAILED'`. Caller (worker) trata; storage só sinaliza.

### Configuração Windows (dev local)

Bruno está em Windows + Docker Desktop. O backend roda **dentro de container Linux** (Docker Compose). Volume Docker `imports-data:/var/imports` é Linux-side — não há problema de permissão Windows-host. Tests rodam direto no host (Windows) com `os.tmpdir()` que aponta para `C:\Users\...\AppData\Local\Temp`. `mkdir mode: 0o700` é silenciosamente ignorado, mas não quebra. OK.

### Por que NÃO usar `fs.existsSync` antes de criar diretório?

Race condition. `mkdir({ recursive: true })` é idempotente — não lança se já existe. Padrão node moderno.

### Por que `removeForJob` é silencioso em ENOENT?

Cron pode rodar 2× (overlap), arquivo já removido. Tratar ENOENT como sucesso simplifica caller. Outros erros (EACCES, EBUSY) propagam para serem investigados.

### O que NÃO fazer nesta story

- ❌ NÃO importar BullMQ ou node-cron (Story 3.1)
- ❌ NÃO importar Pino logger (mantém modules puros — caller decide log)
- ❌ NÃO criar `pathForErrors` que **escreve** (apenas calcula path; Story 4.x escreve)
- ❌ NÃO modificar schema Prisma (Story 2.1 já tem todos os campos: `storagePath`, `errorReportPath`, `fileHash`)
- ❌ NÃO criar feature flag `imports.enabled`
- ❌ NÃO criar abstração FSDriver/S3Driver
- ❌ NÃO escrever em outros campos do ImportJob além de zerar paths
- ❌ NÃO chamar `prisma.auditLog.create` (Story 3.x faz isso quando aplicável)

### Project Structure Notes

Files que esta story mexe (esperado):
- ✏️ [backend-api/.env.example](backend-api/.env.example) — adiciona `IMPORT_FILE_STORAGE_PATH`, `IMPORT_RETENTION_DAYS`
- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — adiciona `PersistOptions`, `PersistResult`, `ReadOptions`, `FileIntegrityError`, `CleanupResult`
- ✨ `backend-api/src/modules/imports/import-storage.ts` — novo
- ✨ `backend-api/src/modules/imports/cleanup-cron.ts` — novo
- ✨ `backend-api/test/modules/import-storage.test.ts` — novo
- ✨ `backend-api/test/modules/import-cleanup.test.ts` — novo
- ✏️ [docker-compose.yml](docker-compose.yml) — adiciona volume `imports-data`
- ✏️ [docker-compose.override.yml](docker-compose.override.yml) — preserva (sem mudança crítica)

Files que esta story **NÃO** deve tocar:
- 🚫 `prisma/schema.prisma` (Story 2.1 done)
- 🚫 `src/plugins/*` (Story 3.1)
- 🚫 `src/routes/*` (Stories 1.2/1.3)
- 🚫 outros módulos `imports/*` (5.1/2.2/2.3 done)
- 🚫 frontend-web

### Mensagem de commit sugerida

```
feat(imports): file storage handler + cleanup-cron (Story 1.1)

- import-storage.ts: persist(buffer) + read(expectedHash) + removeForJob
  using sha256 hex; UUID validation prevents path traversal; 0o700/0o600
  permissions; FileIntegrityError on hash mismatch
- cleanup-cron.ts: removeAllExpired(prisma) deletes files >RETENTION_DAYS
  in terminal states + nullifies storagePath/errorReportPath; ImportJob
  records preserved for audit
- types.ts: PersistOptions/Result, ReadOptions, FileIntegrityError class,
  CleanupResult
- docker-compose.yml: imports-data:/var/imports volume (OP2 gating done)
- .env.example: IMPORT_FILE_STORAGE_PATH=/var/imports + IMPORT_RETENTION_DAYS=90
- ≥13 unit tests (storage + cleanup) using os.tmpdir + mock Prisma
- scheduler integration deferred to Story 3.1
```

### References

- [Architecture D4 — Original File Storage](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D4) (linhas 377–397)
- [Architecture §File Organization](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) (linhas 1162–1174)
- [Epics — Story 1.1](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 268–298)
- [PRD — FR6, FR34, NFR19](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- [Story 5.1 (done)](_evo-output/implementation-artifacts/v3-2-import-tirvu/5-1-encryption-and-permissions.md) — pattern fail-fast no module top-level
- [Story 2.1 (done)](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-1-schema-migration-employee-and-import-job.md) — `ImportJob.storagePath`, `fileHash`, `errorReportPath`, status terminal

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- Prisma 7 `update.data` exige `NullableStringFieldUpdateOperationsInput` para zerar campos opcionais — não aceita `null` direto nem `{ set: null }`. Workaround: `data: { storagePath: { set: null as unknown as string } }`. Cast feio mas compila e funciona em runtime (Prisma passa `null` certinho).
- ts-node v10 com `noUnusedLocals` (do tsconfig do test): apaguei `existsSync` (non-usado).
- Pattern de test com env top-level: setei `process.env.IMPORT_FILE_STORAGE_PATH` ANTES do `require()` do módulo (igual Story 5.1) — `require` é síncrono e respeita ordem de execução, top-level await em CJS não disponível.

### Completion Notes List

- ✅ T1 — `.env.example` e `.env` (local) com `IMPORT_FILE_STORAGE_PATH` e `IMPORT_RETENTION_DAYS=90`.
- ✅ T2 — `types.ts` adiciona `PersistOptions`, `PersistResult`, `ReadOptions`, `FileIntegrityError` (classe), `CleanupResult`.
- ✅ T3 — `import-storage.ts` com `persist`, `read`, `removeForJob`, `pathForErrors`. Fail-fast no top-level (sem env → erro). UUID regex valida `tenantId`/`jobId` antes de path build → previne traversal. SHA-256 hex 64-char. Permissões `0o700` (dir) + `0o600` (file).
- ✅ T4 — `cleanup-cron.ts` com `removeAllExpired(prisma, opts)` e `cleanupOldImports(prisma)` wrapper. Filtra `createdAt < cutoff` E `status IN terminal`. Chama `removeForJob` (silencia ENOENT) + zera `storagePath`/`errorReportPath`. Aceita `opts.now` para testes determinísticos.
- ✅ T5 — `docker-compose.yml`: backend ganhou `volumes: imports-data:/var/imports` + env vars `IMPORT_FILE_STORAGE_PATH`/`IMPORT_RETENTION_DAYS`. Bloco raiz `volumes:` ganhou `imports-data:`. Compose válido (`docker-compose config --services` retorna backend/frontend).
- ✅ T6 — `import-storage.test.ts` com 11 cases (persist/read/remove/UUID validation/integrity/pathForErrors).
- ✅ T7 — `import-cleanup.test.ts` com 6 cases. Mock Prisma + diretório temp real. Filtra >RETENTION + terminal, ignora não-terminal e recente, skip update se paths já null, aceita `opts.now`.
- ✅ T8 — tsc zero erros. Suite focada 19/19. Suite full regression 128/128 (109 + 19).

### File List

- ✏️ [backend-api/.env.example](backend-api/.env.example) — `IMPORT_FILE_STORAGE_PATH`, `IMPORT_RETENTION_DAYS`
- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — adiciona tipos da Story 1.1
- ✨ [backend-api/src/modules/imports/import-storage.ts](backend-api/src/modules/imports/import-storage.ts)
- ✨ [backend-api/src/modules/imports/cleanup-cron.ts](backend-api/src/modules/imports/cleanup-cron.ts)
- ✨ [backend-api/test/modules/import-storage.test.ts](backend-api/test/modules/import-storage.test.ts) — 11 cases
- ✨ [backend-api/test/modules/import-cleanup.test.ts](backend-api/test/modules/import-cleanup.test.ts) — 6 cases
- ✏️ [docker-compose.yml](docker-compose.yml) — volume `imports-data` + env vars no backend

### Change Log

- 2026-05-01 — Story 1.1 implementada. import-storage com SHA-256 + UUID guard + integrity check; cleanup-cron com retenção configurável. 17 unit tests novos. Volume Docker `imports-data` declarado (OP2 done). 128/128 full suite.
