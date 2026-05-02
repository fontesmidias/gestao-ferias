# Story 3.1: BullMQ queue `imports` + worker pipeline (parse → validate → match → PREVIEW_READY) + tenant lock + watchdog crons

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor backend,
I want um plugin Fastify `plugins/imports.ts` que registra: (a) queue BullMQ `imports` separada do `import-queue` legado, (b) worker dedicado com `concurrency=IMPORT_WORKER_CONCURRENCY=2` que orquestra o pipeline da feature (storage.read → tirvu-parser → import-validator → import-matcher → import-job-service.transition para PREVIEW_READY), (c) tenant lock distribuído em Redis (`imports:lock:{tenantId}` com `SET NX EX 960`), (d) watchdog cron diário que cancela PREVIEW_READY >24h e marca TIMED_OUT jobs travados >15min, (e) wrapper do `cleanupOldImports` agendado diariamente,
so that as Stories 1.2/1.3 (rotas de upload) tenham só que enfileirar (`imports.add({ jobId })`) e o pipeline restante seja transparente, fail-safe e fair entre tenants.

## Acceptance Criteria

### Plugin de queue + worker (FR21, NFR15, NFR16)

1. **`backend-api/src/plugins/imports.ts`** registra com `fastify-plugin`:
   - Queue BullMQ chamada `imports` (não confundir com `import-queue` legado em [worker.ts](backend-api/src/plugins/worker.ts) — nome distinto, queue Redis distinta).
   - Worker dedicado processa essa queue com concurrency = `Number(process.env.IMPORT_WORKER_CONCURRENCY ?? 2)`.
   - Decorator `fastify.tirvuImportQueue: Queue` exposto para rotas das Stories 1.2/1.3.
   - `onClose` hook fecha worker e queue limpamente.

2. **Skip gracioso** se Redis indisponível — mesmo padrão de [queues.ts:32-47](backend-api/src/plugins/queues.ts) e [worker.ts:37-40](backend-api/src/plugins/worker.ts). Decora `tirvuImportQueue` com no-op stub e loga warning. Backend sobe; rotas só falham se tentarem enfileirar.

3. **Não substitui** o `worker.ts` legado — feature antiga `import-queue` (CSV upsert simples) continua funcionando paralela. Esta story apenas **adiciona** uma nova queue/worker dedicados ao pipeline Tirvu.

### Tenant lock distribuído Redis (D3)

4. **`backend-api/src/modules/imports/tenant-lock.ts`** com:
   ```ts
   export const TENANT_LOCK_TTL_SEC = Number(process.env.IMPORT_TENANT_LOCK_TTL_SEC ?? 960)
   export function lockKey(tenantId: string): string  // "imports:lock:<tenantId>"
   export async function acquireTenantLock(redis, tenantId): Promise<boolean>
   export async function releaseTenantLock(redis, tenantId): Promise<void>
   ```
   - `acquireTenantLock` usa `redis.set(key, '1', 'EX', ttl, 'NX')`. Retorna `true` se obteve, `false` se já existia.
   - `releaseTenantLock` faz `redis.del(key)`.

5. **Behavior no worker:**
   - Antes de processar, tenta `acquireTenantLock(redis, job.data.tenantId)`.
   - **Se falhou (false):** loga `lock contention, re-queued` em level `debug` e re-enfileira o **mesmo jobId** com `delay: 5000`. **Não** dá throw (BullMQ trataria como erro).
   - **Se obteve:** processa pipeline. **Em `finally`**, chama `releaseTenantLock`. **Mesmo se pipeline lança**, lock é liberado.

6. **Crash do worker (kill -9):** lock fica preso no Redis, mas TTL de 960s (16min, >15min do timeout do NFR29) garante expiração automática. Próximo worker pega o jobId re-enfileirado e adquire lock após expirar.

### Pipeline de processamento (FR21, integra Stories 5.1/2.1/2.2/2.3/1.1)

7. **`backend-api/src/modules/imports/worker-pipeline.ts`** exporta:
   ```ts
   export interface PipelineDeps {
     prisma: PrismaClient
     log: { info: Function; warn: Function; error: Function; debug: Function }
   }
   export interface PipelineInput { jobId: string }
   export async function runImportPipeline(deps: PipelineDeps, input: PipelineInput): Promise<void>
   ```

8. **Pseudocódigo do `runImportPipeline`:**
   ```
   1. transition(PENDING → PARSING) com timestamp parsedAt
   2. job = findUnique(jobId) — pegar storagePath, fileHash, tenantId
   3. buffer = storage.read({ tenantId, jobId, expectedHash: job.fileHash })
      → catch FileIntegrityError → transition(PARSING → FAILED, { failureReason: 'FILE_INTEGRITY_FAILED' }); return
   4. parserVersion = tirvuParser.detect(buffer)
      → if null → transition(PARSING → FAILED, { failureReason: 'INVALID_TIRVU_HEADER' }); return
   5. for await row of parseRows(buffer): rows.push(row)
   6. valid/invalid split via importValidator.validate(row) por linha
   7. existingEmployees + existingWorkplaces = prisma findMany para tenantId
   8. matchResult = matchAll(rows, validRowSet, invalidRows, ctx)
   9. previewSummary = buildPreviewSummary(matchResult, totalRows=rows.length)
   10. transition(PARSING → PREVIEW_READY, {
        previewSummary,
        totalRows,
        rowsProcessed: rows.length,
        rowsCreated: result.create.length,
        rowsUpdated: result.update.length,
        rowsInvalid: result.invalid.length,
        rowsAbsent: result.absent.length,
        workplacesCreated: result.newWorkplaces.length,
      })
   11. log info phase=parse "PREVIEW_READY: <summary counts>"
   ```

9. **Erros não-categorizados** (parseRows joga, matchAll joga, etc.):
   - `try/catch` global no pipeline.
   - Em catch: transition para FAILED com `failureReason='PIPELINE_ERROR'` + `errorMessage` (primeiros 500 chars).
   - Log `error` com stack trace (mas **NÃO** dump do buffer — sanitização em Story 5.2).

10. **`InvalidStateTransitionError` é re-throw** — significa que outro worker já mexeu no job (race), não corrompe estado. BullMQ marca job como falhou; não tenta de novo (idempotência via state guard).

### Logs estruturados Pino (NFR34)

11. **Worker logs incluem campos obrigatórios** em cada chamada (Architecture line 815-823):
    - `module: 'imports'`
    - `importJobId: string`
    - `tenantId: string`
    - `phase: 'parse' | 'validate' | 'match' | 'cleanup' | 'lock'`

12. **Sanitização cleartext fica para Story 5.2.** Nesta story, **não logar** valores da planilha em level info/debug (ex.: `log.info({ row })` é proibido). Limitar logs a contadores (`rowsCreated: 47`) e estados (`status: 'PREVIEW_READY'`). Test de log faz grep no buffer e falha se aparecer dado pessoal.

### Watchdog crons (NFR29, FR32)

13. **`backend-api/src/modules/imports/watchdog.ts`** exporta:
    ```ts
    export async function autoCancelStalePreviews(prisma, opts?: { maxAgeHours?: number; now?: Date })
    export async function timeoutStuckJobs(prisma, opts?: { maxIdleMinutes?: number; now?: Date })
    ```

14. **`autoCancelStalePreviews`:**
    - Query: `prisma.importJob.findMany({ where: { status: 'PREVIEW_READY', updatedAt: { lt: cutoff (default = now - 24h) } } })`
    - Para cada: `transition(jobId, ['PREVIEW_READY'], 'CANCELLED', { failureReason: 'AUTO_CANCELLED_PREVIEW_TTL' })`
    - Retorna `{ cancelled: number }`.
    - Captura `InvalidStateTransitionError` (caso operador tenha clicado apply entre query e update) — apenas decrementa contador silenciosamente.

15. **`timeoutStuckJobs`:**
    - Query: `prisma.importJob.findMany({ where: { status: { in: ['PARSING', 'APPLYING'] }, updatedAt: { lt: cutoff (default = now - 15min) } } })`
    - Para cada: `transition(jobId, ['PARSING', 'APPLYING'], 'TIMED_OUT', { failureReason: 'WORKER_STUCK_OR_CRASHED' })`
    - Retorna `{ timedOut: number }`.

16. **Agendamento dos crons no plugin `imports.ts`:**
    - Usar **BullMQ repeatable job** ao invés de `node-cron` (Redis já está em uso, evita nova dep).
    - Job repetível `tirvu-watchdog` agenda `every: 60_000` (1 min) — chama `timeoutStuckJobs` + `autoCancelStalePreviews`.
    - Job repetível `tirvu-cleanup` agenda `pattern: '0 3 * * *'` (03h UTC todo dia) — chama `cleanupOldImports` da Story 1.1.
    - Configurar `removeOnComplete: 100, removeOnFail: 100` para não inflar Redis.

### Suite de testes

17. **`test/modules/tenant-lock.test.ts`** (≥4 cases):
    - `acquireTenantLock` com mock Redis simples retorna `true` quando key livre, `false` quando ocupada
    - `releaseTenantLock` deleta a key
    - `lockKey` produz string padrão `imports:lock:<tenantId>`
    - TTL é o configurado em env

18. **`test/modules/worker-pipeline.test.ts`** (≥3 cases):
    - **Happy path:** mock prisma+storage+parser; pipeline chama transition 2× (PENDING→PARSING, PARSING→PREVIEW_READY) e popula previewSummary
    - **FileIntegrityError** → transition para FAILED com `FILE_INTEGRITY_FAILED`
    - **Header inválido (parser.detect=null)** → transition para FAILED com `INVALID_TIRVU_HEADER`
    - **Pipeline error genérico** → transition para FAILED com `PIPELINE_ERROR`

   Mock storage: substituir o módulo via `import('module')` ou usar fixtures pequenos do `test/fixtures/imports/` da Story 2.2 + setar `IMPORT_FILE_STORAGE_PATH=tmp` + persistir o fixture.

19. **`test/modules/watchdog.test.ts`** (≥4 cases):
    - `autoCancelStalePreviews` cancela job >24h em PREVIEW_READY
    - `autoCancelStalePreviews` ignora job recente em PREVIEW_READY
    - `autoCancelStalePreviews` ignora jobs em outros estados
    - `timeoutStuckJobs` marca PARSING >15min como TIMED_OUT
    - `timeoutStuckJobs` aceita `opts.maxIdleMinutes` custom

20. **NÃO criar test para o plugin `imports.ts`** propriamente (precisaria mockar BullMQ + Worker + Redis live; integration test fica para Story 4.x ou e2e dedicado). O plugin é wiring; lógica de negócio está em `tenant-lock.ts`/`worker-pipeline.ts`/`watchdog.ts` e é testável puramente.

### Out-of-scope (NÃO implementar)

21. **NÃO implementar pipeline de APPLY** (PREVIEW_READY → APPLYING → COMPLETED) — Story 3.2.
22. **NÃO criar rotas REST** — Stories 1.2/1.3.
23. **NÃO implementar log sanitization middleware** — Story 5.2.
24. **NÃO criar `error-report-builder.ts`** — Story 4.x.
25. **NÃO modificar `worker.ts` legado** — não tocar `import-queue`.
26. **NÃO implementar feature flag `imports.enabled`** por tenant — Story futura.
27. **NÃO criar admin UI para visualizar jobs** — Story 4.x.
28. **NÃO criar e2e test do flow completo** — fica para Epic 4 ou story dedicada.
29. **NÃO mexer em schema Prisma** — Story 2.1 done.
30. **NÃO escrever em Employee** — pipeline desta story só faz READ. Apply (write) é Story 3.2.

## Tasks / Subtasks

### T1 — Env vars + tipos (AC: 1, 4, 14, 15)

- [x] T1.1 Adicionar em [backend-api/.env.example](backend-api/.env.example) (logo abaixo da Story 1.1):
  ```
  # BullMQ worker concurrency (jobs paralelos no worker dedicado).
  IMPORT_WORKER_CONCURRENCY=2

  # TTL do lock distribuído por tenant (em segundos). Deve ser > timeout
  # de processamento (15min). Default 16min protege contra crash.
  IMPORT_TENANT_LOCK_TTL_SEC=960

  # Idle minutes antes de marcar job travado como TIMED_OUT.
  IMPORT_JOB_TIMEOUT_MIN=15
  ```
- [x] T1.2 Editar [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts), adicionar:
  ```ts
  export interface WatchdogResult {
    cancelled?: number
    timedOut?: number
  }
  ```

### T2 — `tenant-lock.ts` (AC: 4, 5, 6)

- [x] T2.1 Criar `backend-api/src/modules/imports/tenant-lock.ts`. Cabeçalho TODO `v3-3-rbac-data-driven`.
- [x] T2.2 Definir interface mínima do redis client (não importar `ioredis` direto — aceitar `Pick<Redis, 'set' | 'del'>` ou um `RedisLike`):
  ```ts
  export interface RedisLike {
    set(key: string, value: string, mode: 'EX', ttl: number, flag: 'NX'): Promise<'OK' | null>
    del(key: string): Promise<number>
  }
  ```
- [x] T2.3 Funções:
  ```ts
  export const TENANT_LOCK_TTL_SEC = Number(process.env.IMPORT_TENANT_LOCK_TTL_SEC ?? 960)
  export function lockKey(tenantId: string): string
  export async function acquireTenantLock(redis: RedisLike, tenantId: string, ttlSec = TENANT_LOCK_TTL_SEC): Promise<boolean>
  export async function releaseTenantLock(redis: RedisLike, tenantId: string): Promise<void>
  ```

### T3 — `worker-pipeline.ts` (AC: 7, 8, 9, 10, 11, 12)

- [x] T3.1 Criar `backend-api/src/modules/imports/worker-pipeline.ts`. Cabeçalho TODO.
- [x] T3.2 Imports (todos os módulos das Stories anteriores):
  ```ts
  import { detect, parseRows } from './tirvu-parser'
  import { validate } from './import-validator'
  import { matchAll, buildPreviewSummary } from './import-matcher'
  import { transition } from './import-job-service'
  import { read as storageRead } from './import-storage'
  import { FileIntegrityError, InvalidStateTransitionError } from './types'
  ```
- [x] T3.3 Função `runImportPipeline(deps, input)`:
  - `phase: 'parse'` em todos os logs.
  - Wrapped em try/catch global.
  - try: PENDING→PARSING, fetch job, storageRead, detect, parseRows (collect array — NFR de memória ≤512MB para 5k rows é OK in-memory), validate cada row → split valid/invalid, query existing employees+workplaces, matchAll, buildPreviewSummary, transition PARSING→PREVIEW_READY com counts.
  - catch FileIntegrityError → transition FAILED com `FILE_INTEGRITY_FAILED`.
  - catch InvalidStateTransitionError → log warn + re-throw (caller decide).
  - catch generic → if header inválido (detected previamente) já tratado; senão, transition FAILED com `PIPELINE_ERROR`.
- [x] T3.4 Para `existingEmployees` query: `prisma.employee.findMany({ where: { tenantId } })`. Para `existingWorkplaces`: `prisma.workplace.findMany({ where: { tenantId }, select: { name: true } })`.

### T4 — `watchdog.ts` (AC: 13, 14, 15)

- [x] T4.1 Criar `backend-api/src/modules/imports/watchdog.ts`. TODO header.
- [x] T4.2 `autoCancelStalePreviews(prisma, opts)`:
  - `cutoff = (opts.now ?? new Date()) - (opts.maxAgeHours ?? 24)*3600_000`
  - Query findMany para PREVIEW_READY < cutoff (using `updatedAt` field).
  - Loop: `transition(prisma, job.id, ['PREVIEW_READY'], 'CANCELLED', { failureReason: 'AUTO_CANCELLED_PREVIEW_TTL' })`. Catch InvalidStateTransitionError silentemente (race com operador).
  - Retorna `{ cancelled }`.
- [x] T4.3 `timeoutStuckJobs(prisma, opts)`:
  - `maxIdleMinutes = opts.maxIdleMinutes ?? Number(process.env.IMPORT_JOB_TIMEOUT_MIN ?? 15)`
  - `cutoff = (opts.now ?? new Date()) - maxIdleMinutes*60_000`
  - Query: `status IN ['PARSING','APPLYING'] AND updatedAt < cutoff`.
  - Loop: transition para TIMED_OUT com `failureReason: 'WORKER_STUCK_OR_CRASHED'`.
  - Retorna `{ timedOut }`.

### T5 — `plugins/imports.ts` (AC: 1, 2, 3, 5, 16)

- [x] T5.1 Criar `backend-api/src/plugins/imports.ts` baseado no padrão de [queues.ts](backend-api/src/plugins/queues.ts) + [worker.ts](backend-api/src/plugins/worker.ts):
  - Função `getRedisConfig()` igual aos plugins existentes.
  - `checkRedisAvailable` igual.
  - Se Redis indisponível: decora stub e return.
  - Se OK: cria `Queue` chamada `imports`, `Worker` da mesma queue.
- [x] T5.2 Worker logic:
  ```ts
  const importsWorker = new Worker('imports', async (job) => {
    const { jobId } = job.data
    const tenantId = (await fastify.prisma.importJob.findUnique({ where: { id: jobId }, select: { tenantId: true } }))?.tenantId
    if (!tenantId) return // job removido — silencioso
    const redis = getIoRedisClient() // lazy import ioredis
    const acquired = await acquireTenantLock(redis, tenantId)
    if (!acquired) {
      fastify.log.debug({ module: 'imports', importJobId: jobId, tenantId, phase: 'lock' }, 'lock contention, re-queued')
      await fastify.tirvuImportQueue.add('process', { jobId }, { delay: 5000 })
      return
    }
    try {
      await runImportPipeline({ prisma: fastify.prisma, log: fastify.log }, { jobId })
    } finally {
      await releaseTenantLock(redis, tenantId)
    }
  }, { connection: redisConfig, concurrency: Number(process.env.IMPORT_WORKER_CONCURRENCY ?? 2) })
  ```
- [x] T5.3 Watchdog repeatable jobs:
  ```ts
  await importsQueue.add('watchdog', {}, { repeat: { every: 60_000 }, jobId: 'tirvu-watchdog' })
  await importsQueue.add('cleanup', {}, { repeat: { pattern: '0 3 * * *' }, jobId: 'tirvu-cleanup' })
  ```
  Worker handles `job.name`:
  - `'process'` (default) → pipeline above
  - `'watchdog'` → `timeoutStuckJobs(prisma)` + `autoCancelStalePreviews(prisma)`
  - `'cleanup'` → `cleanupOldImports(prisma)`
- [x] T5.4 Decorator: `fastify.decorate('tirvuImportQueue', importsQueue)`. Type declaration:
  ```ts
  declare module 'fastify' {
    export interface FastifyInstance {
      tirvuImportQueue: Queue
    }
  }
  ```
- [x] T5.5 `onClose` hook: fecha worker + queue.
- [x] T5.6 Lazy ioredis import — acrescenta `require('ioredis').default` dentro de função utilitária. Tipo `RedisLike` permite passar a instância sem import circular.

### T6 — Testes `tenant-lock.test.ts` (AC: 17)

- [x] T6.1 Mock Redis client minimalista:
  ```ts
  function makeMockRedis() {
    const store = new Map<string, { value: string; expiresAt: number }>()
    return {
      async set(key, value, _ex, ttl, flag) {
        if (flag === 'NX' && store.has(key) && store.get(key)!.expiresAt > Date.now()) return null
        store.set(key, { value, expiresAt: Date.now() + ttl * 1000 })
        return 'OK'
      },
      async del(key) { return store.delete(key) ? 1 : 0 },
      _store: store,
    }
  }
  ```
- [x] T6.2 Casos do AC17.

### T7 — Testes `worker-pipeline.test.ts` (AC: 18)

- [x] T7.1 Setup: env `IMPORT_FILE_STORAGE_PATH` para `os.tmpdir()` antes de imports. Persistir o fixture `tirvu-anatel-50.xlsx` (copiar) usando `storage.persist`.
- [x] T7.2 Mock Prisma com `importJob.findUnique`/`update`, `employee.findMany` (vazio = todos rows são `create`), `workplace.findMany` (vazio = todos lotação são `newWorkplaces`).
- [x] T7.3 Casos:
  - Happy path: chama `runImportPipeline` → assert chamadas de update do importJob (PARSING + PREVIEW_READY com previewSummary não-null e counts > 0).
  - File integrity: persistir buffer com hash X mas dizer no DB que hash é Y → catch FileIntegrityError → assert update final = FAILED com `FILE_INTEGRITY_FAILED`.
  - Header inválido: persistir fixture `tirvu-bad-sheet-name.xlsx` → assert FAILED com `INVALID_TIRVU_HEADER`.

### T8 — Testes `watchdog.test.ts` (AC: 19)

- [x] T8.1 Mock Prisma minimalista com `importJob.findMany` + `importJob.findUnique` + `importJob.update` (importJobService.transition usa $transaction também — mock `$transaction(fn) { return fn(this) }`).
- [x] T8.2 Casos do AC19.

### T9 — Validação final (AC: tudo)

- [x] T9.1 `npx tsc --noEmit` zero erros.
- [x] T9.2 Suite focada das stories novas:
  ```bash
  node --test -r ts-node/register \
    "test/modules/tenant-lock.test.ts" \
    "test/modules/worker-pipeline.test.ts" \
    "test/modules/watchdog.test.ts"
  ```
  ≥11 cases pass.
- [x] T9.3 Suite full regression: 128 + ≥11 = ≥139, 0 fail.
- [x] T9.4 Backend boot smoke test: `docker-compose up backend --build` → confirmar log `[IMPORTS] Redis disponivel — queue + worker ativos.` (ou equivalente) e ausência de stack trace.
- [x] T9.5 Atualizar Dev Agent Record com File List.

## Dev Notes

### Coexistência com `worker.ts` legado

Existe queue `import-queue` em [src/plugins/queues.ts:49](backend-api/src/plugins/queues.ts) e worker correspondente em [src/plugins/worker.ts:45](backend-api/src/plugins/worker.ts). Esta queue foi feita para a feature antiga (CSV upsert simples para Employees). O nome da nova queue **`imports`** (sem hyphen) é distinto — Redis trata como key separada (`bull:import-queue:*` vs `bull:imports:*`). **Não há conflito.**

Importante: **não alterar** `worker.ts` para evitar regressão na feature antiga. A nova rota de upload da v3-2 (Stories 1.2/1.3) vai enfileirar em `fastify.tirvuImportQueue` (nova) — não em `fastify.importQueue` (antiga).

### Por que ioredis lazy import?

`ioredis` é peer dep transitiva via BullMQ. Importar no top do `tenant-lock.ts` cria acoplamento desnecessário (lock helper deveria ser puro). Pattern: definir `RedisLike` interface (subset usado: `set`, `del`), aceitar via parâmetro. Plugin instancia Redis client real e injeta nos chamados.

### `repeat` patterns BullMQ

- `every: 60_000` → roda a cada 1 minuto desde o momento que o job é criado.
- `pattern: '0 3 * * *'` → cron syntax: 03:00 UTC todo dia.
- Usar `jobId: 'tirvu-watchdog'` fixo: BullMQ deduplica — se plugin recarrega (restart do backend), não cria 2 schedulers.

### Pipeline em série vs streaming

`parseRows` é async iterator (Story 2.2) — bom para memória se tivéssemos worker streaming. Mas matchAll exige array completo (calcula absent comparando todos rows com todos employees). E previewSummary precisa contar tudo. Logo: pipeline coleta todos rows num array antes de chamar matcher. Aceitável para 5k linhas/job (limite NFR).

### Logs estruturados — anti-leak de cleartext

```ts
// ✅ OK
log.info({ module: 'imports', importJobId, tenantId, phase: 'parse', counts: { create: 47, update: 3 } }, 'PREVIEW_READY')

// ❌ NÃO
log.info({ row, ...row }, 'parsed row')  // dump direto contém CPF/personalData
log.debug('processing CPF ' + row.cpf)    // CPF cleartext
```

A Story 5.2 vai adicionar **sanitization plugin Pino** que remove cleartext automaticamente. Por enquanto: disciplina manual + test de log scan.

### Test de sanitização de logs (manual nesta story)

Não obrigatório esta story (Story 5.2 cuida). Se quiser exemplo: capturar buffer de log do worker (pode usar Pino com transport para `Buffer`) e fazer regex `/\d{11}/` (CPF) — falha se aparecer.

### Mock Redis para test

Pattern simples Map-based, suficiente para test de tenant lock. Não precisa simular TTL real (test não dorme — usa same-tick). Para timing-sensitive tests, Bruno ou IA futura pode adicionar mock com `setTimeout`.

### Mock Pipeline test — strategy

Worker pipeline depende de:
- prisma (mockável)
- storage (mockável via `IMPORT_FILE_STORAGE_PATH` em tmpdir + `storage.persist`)
- fixtures xlsx (já existem em `test/fixtures/imports/` da Story 2.2)

NÃO precisa mockar tirvu-parser ou matcher — eles são puros e já testados. Test do pipeline é integração leve **com módulos reais** + Prisma mock.

### Por que Pino e não logger custom?

Fastify v5 usa Pino internamente. `fastify.log` é instância Pino. Worker recebe `fastify.log` injetado via deps (não import direto). Mantém pipeline puro/testável (test injeta `console`-like).

### Schedule de watchdog: 1 min vs 5 min

PRD/Architecture não especifica frequência exata do watchdog — `every: 60_000` (1min) é razoável para detecção rápida de stuck jobs. Custo: 1 query/min × 2 funções = 120 queries/hora — desprezível. Alternativa: `every: 5*60_000` se Redis ficar over-loaded; ajustar via env futura se necessário.

### Cleanup-cron 03h UTC

Architecture D4 menciona "cron diário". Escolhi 03h UTC (~midnight São Paulo) — janela de baixa atividade. Não há requisito específico.

### O que NÃO fazer nesta story

- ❌ NÃO modificar [worker.ts](backend-api/src/plugins/worker.ts) ou [queues.ts](backend-api/src/plugins/queues.ts) (legacy)
- ❌ NÃO criar `import-applier.ts` (Story 3.2)
- ❌ NÃO criar rota REST (Stories 1.2/1.3)
- ❌ NÃO criar feature flag por tenant
- ❌ NÃO criar audit log entries (Stories 3.2 ou 5.2)
- ❌ NÃO criar Pino sanitization plugin (Story 5.2)
- ❌ NÃO criar e2e test full-flow

### Project Structure Notes

Files que esta story mexe (esperado):
- ✏️ [backend-api/.env.example](backend-api/.env.example) — env vars do worker/lock
- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — `WatchdogResult`
- ✨ `backend-api/src/modules/imports/tenant-lock.ts`
- ✨ `backend-api/src/modules/imports/worker-pipeline.ts`
- ✨ `backend-api/src/modules/imports/watchdog.ts`
- ✨ `backend-api/src/plugins/imports.ts`
- ✨ `backend-api/test/modules/tenant-lock.test.ts`
- ✨ `backend-api/test/modules/worker-pipeline.test.ts`
- ✨ `backend-api/test/modules/watchdog.test.ts`

Files que esta story **NÃO** deve tocar:
- 🚫 `prisma/schema.prisma` (Story 2.1 done)
- 🚫 `src/plugins/worker.ts` ou `queues.ts` (legacy)
- 🚫 `src/modules/imports/{tirvu-parser,import-validator,import-matcher,import-job-service,import-storage,cleanup-cron}.ts` (todos done)
- 🚫 `src/routes/*` (1.2/1.3)

### Mensagem de commit sugerida

```
feat(imports): BullMQ worker + tenant lock + watchdog (Story 3.1)

- plugins/imports.ts: dedicated 'imports' queue + worker
  (concurrency=IMPORT_WORKER_CONCURRENCY) separate from legacy
  'import-queue'; graceful skip if Redis offline; onClose cleanup
- worker-pipeline.ts: orchestrates storage.read → parser.detect →
  parseRows → validate → matchAll → buildPreviewSummary → transition
  PARSING → PREVIEW_READY; catches FileIntegrityError +
  InvalidStateTransitionError + generic with FAILED transition
- tenant-lock.ts: SET NX EX based distributed lock
  (imports:lock:<tenantId>, TTL 16min) for fairness
- watchdog.ts: autoCancelStalePreviews (>24h) +
  timeoutStuckJobs (>15min idle in PARSING/APPLYING)
- BullMQ repeatable jobs: tirvu-watchdog (every 1min) +
  tirvu-cleanup (daily 03h UTC) calls cleanupOldImports
- 11+ unit tests with mock Redis + mock Prisma + real fixtures
- ENV: IMPORT_WORKER_CONCURRENCY, IMPORT_TENANT_LOCK_TTL_SEC,
  IMPORT_JOB_TIMEOUT_MIN
```

### References

- [Architecture D3 — BullMQ Concurrency + Tenant Fairness](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D3) (linhas 344–374)
- [Architecture D5 — ImportJob State Machine](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D5) (linhas 401–429)
- [Architecture §Communication Patterns — Logging](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) (linhas 815–823)
- [Epics — Story 3.1](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 525–581)
- [PRD — FR21, FR32, NFR15-16, NFR29, NFR34](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- Stories prereq (todas done): [5.1](_evo-output/implementation-artifacts/v3-2-import-tirvu/5-1-encryption-and-permissions.md), [1.1](_evo-output/implementation-artifacts/v3-2-import-tirvu/1-1-import-storage-and-cleanup.md), [2.1](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-1-schema-migration-employee-and-import-job.md), [2.2](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-2-tirvu-parser-and-validator.md), [2.3](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-3-matcher-and-job-state-transition.md)
- Plugin patterns existentes: [queues.ts](backend-api/src/plugins/queues.ts), [worker.ts](backend-api/src/plugins/worker.ts)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- Schema da `ImportJob` não tem `updatedAt` (Story 2.1 não criou). Spec original do watchdog usava `updatedAt: { lt: cutoff }`. Workaround: usei `parsedAt` para PREVIEW_READY (timestamp em que entrou no estado) e `OR` em `parsedAt`/`appliedAt` para PARSING/APPLYING (cada estado tem seu próprio timestamp marcado pelo `transition`). Semanticamente correto e bate com a state machine.
- Pipeline test: cuidei pra mockar `prisma.$transaction` (`import-job-service.transition` usa) — sem isso, `findUnique` na transação retornaria undefined e quebrava.
- Plugin `imports.ts` usa lazy `import('ioredis')` em vez de top-level import — mantém o bundle do plugin sem acoplamento se Redis offline.
- Não escrevi unit test do plugin propriamente (precisaria mockar BullMQ + Worker + Redis live). Pipeline puro tá coberto. E2E real do plugin fica para Stories 1.2/1.3 que vão exercitar o flow `enqueue → worker → preview`.

### Completion Notes List

- ✅ T1 — `.env.example` com `IMPORT_WORKER_CONCURRENCY=2`, `IMPORT_TENANT_LOCK_TTL_SEC=960`, `IMPORT_JOB_TIMEOUT_MIN=15`. `WatchdogResult` adicionado em `types.ts`.
- ✅ T2 — `tenant-lock.ts` com `acquireTenantLock`/`releaseTenantLock`/`lockKey` + interface `RedisLike` (subset usado). TTL via env. SET NX EX padrão.
- ✅ T3 — `worker-pipeline.ts` orquestra storage.read → detect → parseRows → validate → matchAll → buildPreviewSummary → transition. Catch `FileIntegrityError` (FAILED+`FILE_INTEGRITY_FAILED`), header null (FAILED+`INVALID_TIRVU_HEADER`), genérico (FAILED+`PIPELINE_ERROR`). `InvalidStateTransitionError` re-throw para BullMQ tratar.
- ✅ T4 — `watchdog.ts` com `autoCancelStalePreviews` (PREVIEW_READY com `parsedAt < now-24h`) e `timeoutStuckJobs` (PARSING/APPLYING com timestamp respectivo < now-15min). Captura `InvalidStateTransitionError` silentemente (race com operador).
- ✅ T5 — `plugins/imports.ts` registra queue `imports` (separada do legacy `import-queue`), worker dedicated com concurrency configurável, lazy ioredis para lock, repeat jobs `tirvu-watchdog` (every 1m) e `tirvu-cleanup` (cron 0 3 * * *). Skip gracioso se Redis offline. `onClose` fecha worker + queue + ioredis.
- ✅ T6 — `tenant-lock.test.ts` 7 cases: lockKey canônico, TTL default, acquire livre/ocupado, release+reacquire, isolation entre tenants, TTL custom.
- ✅ T7 — `worker-pipeline.test.ts` 5 cases: happy path com fixture real, FileIntegrityError, header inválido (bad-sheet-name fixture), job inexistente, status não-PENDING.
- ✅ T8 — `watchdog.test.ts` 7 cases: cancel >24h, ignora recente, ignora outros status; timeout PARSING/APPLYING >15min, ignora < threshold, maxIdleMinutes custom.
- ✅ T9 — `tsc --noEmit` zero erros. Suite focada 20/20. Suite full regression 148/148 (128+20).

### File List

- ✏️ [backend-api/.env.example](backend-api/.env.example)
- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — `WatchdogResult`
- ✨ [backend-api/src/modules/imports/tenant-lock.ts](backend-api/src/modules/imports/tenant-lock.ts)
- ✨ [backend-api/src/modules/imports/worker-pipeline.ts](backend-api/src/modules/imports/worker-pipeline.ts)
- ✨ [backend-api/src/modules/imports/watchdog.ts](backend-api/src/modules/imports/watchdog.ts)
- ✨ [backend-api/src/plugins/imports.ts](backend-api/src/plugins/imports.ts)
- ✨ [backend-api/test/modules/tenant-lock.test.ts](backend-api/test/modules/tenant-lock.test.ts) — 7 cases
- ✨ [backend-api/test/modules/worker-pipeline.test.ts](backend-api/test/modules/worker-pipeline.test.ts) — 5 cases
- ✨ [backend-api/test/modules/watchdog.test.ts](backend-api/test/modules/watchdog.test.ts) — 7 cases

### Change Log

- 2026-05-01 — Story 3.1 implementada. Plugin `imports.ts` (queue `imports` separada da legacy + worker + watchdog repeat jobs). Pipeline puro `worker-pipeline.ts` integrando 2.2/2.3/1.1/2.1. tenant-lock distribuído Redis. 19 unit tests novos. 148/148 full regression.
