# Story 1.5: ReconcileService + ReconcileRunner + rotas admin de disparo

Status: review

## Story

As a **ADMIN**,
I want **um endpoint `POST /v1/admin/reconcile` que dispare a reconciliação do meu tenant em batches transacionais e endpoints `GET /v1/admin/reconcile/jobs` e `GET /v1/admin/reconcile/jobs/:id` para acompanhar progresso**,
so that **eu possa acionar a operação de "make production honest" para o meu tenant e ver o resultado em tempo real, integrando os blocos das Stories 1.2 (allocation), 1.3 (matchers) e 1.4 (queue) em um vertical slice executável**.

## Acceptance Criteria

1. **AC-1 (runSingle por employee):** `ReconcileService.runSingle({ tenantId, employeeId, reconcileJobId, operatorUserId })` carrega o `Employee` (campos `workplace`, `workplaceId`, `hireDate`, `status`) filtrando por `tenantId`. Se o employee não existe no tenant, lança erro tipado `ReconcileEmployeeNotFoundError`. Retorna `Promise<RunSingleOutcome>` onde `RunSingleOutcome` é um discriminated union (ver Dev Notes).

2. **AC-2 (skip já vinculado):** Se `Employee.workplaceId IS NOT NULL`, retorna `{ outcome: 'skipped' }` — não toca em allocations, não enfileira (FR2 idempotência).

3. **AC-3 (skip sem legacy):** Se `Employee.workplace` é `null` ou string vazia (após `trim()`), retorna `{ outcome: 'no_legacy' }` — não enfileira nem toca allocations (FR5).

4. **AC-4 (skip INATIVO):** Se `Employee.status === 'INATIVO'`, retorna `{ outcome: 'skipped_inactive' }` antes de chamar matchers (FR5).

5. **AC-5 (matched_deterministic):** Quando `DeterministicMatcher.match(tenantId, normalize(workplace))` retorna `kind: 'unique'`, o service:
   - Resolve `workplacePositionId` da primeira `WorkplacePosition` do workplace (cria padrão `role='Operacional', requiredCount=1` se não houver — mesmo helper `ensureDefaultPosition` da Story 1.4).
   - Chama `WorkplaceAllocationService.upsertFromImport({ tenantId, employeeId, operatorUserId, workplacePositionId, startDate: hireDate, source: 'V3.3_RECONCILE' })`.
   - Atualiza `Employee.workplaceId` com o ID do workplace match.
   - Retorna `{ outcome: 'matched_deterministic', workplaceId, allocationKind }` onde `allocationKind` reflete o `UpsertResult.kind` (`noop|created|replaced`).

6. **AC-6 (queued_ambiguous):** Quando `DeterministicMatcher.match` retorna `kind: 'ambiguous'`, chama `FuzzyMatcher.suggest(tenantId, normalized, limit=3)` para ranking, enfileira via `ReconcileQueueService.enqueue({ tenantId, reconcileJobId, employeeId, workplaceNameRaw, suggestions })` e retorna `{ outcome: 'queued_ambiguous' }`. Não toca `Employee.workplaceId` nem allocations (FR10).

7. **AC-7 (queued_low_confidence | queued_no_match):** Quando `DeterministicMatcher.match` retorna `kind: 'none'`, chama `FuzzyMatcher.suggest(tenantId, normalized, limit=3)`:
   - Se top score >= 0.7 → enfileira com sugestões; retorna `{ outcome: 'queued_low_confidence' }`.
   - Senão (sem sugestões ou score < 0.7) → enfileira com `suggestions=[]`; retorna `{ outcome: 'queued_no_match' }`.
   Em ambos os casos, fila recebe item PENDING (FR11) e nada é vinculado automaticamente.

8. **AC-8 (Runner orquestração):** `ReconcileRunner.run({ tenantId, operatorUserId })` recebe um `reconcileJobId` recém-criado em `RUNNING` e itera sobre `Employee` do tenant em batches de `RECONCILE_BATCH_SIZE = 100` usando cursor (`take` + `cursor` Prisma). Filtra `status != 'INATIVO'` no `where` (otimização — evita carregar para filtrar in-memory).

9. **AC-9 (acumuladores):** Para cada employee, chama `runSingle` sequencialmente (não `Promise.all`). Acumula contadores por `outcome`:
   - `matched` += 1 quando `outcome='matched_deterministic'`.
   - `queued` += 1 quando `outcome` ∈ {`queued_ambiguous`, `queued_low_confidence`, `queued_no_match`}.
   - `ignored` += 1 quando `outcome` ∈ {`skipped`, `skipped_inactive`, `no_legacy`}.
   - `errors` += 1 quando `runSingle` lança.

10. **AC-10 (resiliência por employee — NFR-REL-2):** Erro em `runSingle` é capturado em `try/catch` interno do runner: contador `errors++`, último erro persistido como `ReconcileJob.failureReason` (string truncada a 500 chars, sem PII), log estruturado JSON `{ module: 'reconcile', event: 'employee_failed', tenantId, jobId, employeeId, errorName }`. Loop continua para o próximo employee.

11. **AC-11 (atualização periódica de progresso):** Ao final de cada batch, o runner faz `prisma.reconcileJob.update({ where: { id }, data: { matched, queued, ignored, errors } })`. `totalEmployees` é gravado uma vez no início do runner (após o `count`). Log estruturado JSON `{ module: 'reconcile', event: 'batch_completed', tenantId, jobId, batchSize, matched, queued, ignored, errors, durationMs }`.

12. **AC-12 (finalização happy path):** Ao terminar todos os batches sem exceção fatal, `ReconcileJob.status='COMPLETED'`, `completedAt=now`, `durationMs=now - startedAt`. AuditLog com `action='V3.3_RECONCILE'`, `resourceType='RECONCILE_JOB'`, `resourceId=jobId`, `previousData={status:'RUNNING',...}`, `newData={status:'COMPLETED',matched,queued,ignored,errors}`.

13. **AC-13 (finalização FAILED):** Em caso de exceção fatal (não capturada por employee — ex.: erro de conexão, timeout transacional irrecuperável), `ReconcileJob.status='FAILED'`, `completedAt=now`, `failureReason=e.message.substring(0,500)`. AuditLog com `action='V3.3_RECONCILE'` e `newData.status='FAILED'`. Errors individuais já contados em AC-10 não disparam FAILED — apenas exceções fora do `try/catch` por employee.

14. **AC-14 (POST /reconcile cria job):** `POST /v1/admin/reconcile` exige `requireAuth + requireAdmin`. Body vazio (ou `{}`). Antes de criar job, verifica se já existe `ReconcileJob` com `tenantId` do JWT e `status ∈ {PENDING, RUNNING}`; se sim, retorna `409 RECONCILE_JOB_ALREADY_RUNNING` com `{ data: null, error: { code, message }, meta: { existingJobId } }`.

15. **AC-15 (resposta imediata + dispatch async):** Quando aprovado, cria `ReconcileJob` com `status='RUNNING'`, `startedAt=now`, `triggeredBy='ADMIN'`, dispara `ReconcileRunner.run` em background via `setImmediate(() => runner.run(...).catch(logFatal))` e responde imediatamente com `200 { data: { jobId, status: 'RUNNING' }, error: null, meta: null }`. AuditLog `action='V3.3_RECONCILE'` com `newData.status='RUNNING'` é gravado antes da resposta (audit trail antes do retorno HTTP).

16. **AC-16 (GET /jobs/:id):** `GET /v1/admin/reconcile/jobs/:id` exige `requireAuth` + role ∈ {ADMIN, AUDITOR, SUPERADMIN}. Filtra `where: { id, tenantId: user.tenantId }` (USER recebe 403; outros tenants recebem 404 — não vaza). Retorna `{ data: { ...job, progressPct }, error: null, meta: { readOnly: role==='AUDITOR' } }` onde `progressPct = totalEmployees ? round((matched + queued + ignored + errors) / totalEmployees * 100) : 0`.

17. **AC-17 (GET /jobs lista):** `GET /v1/admin/reconcile/jobs?status=&page=&pageSize=` retorna lista paginada (mesmos roles do AC-16). Order by `createdAt desc`. Defaults: `page=1`, `pageSize=20`, `pageSize` máx 100.

18. **AC-18 (envelope):** Todas as respostas seguem `{ data, error, meta }` (CLAUDE.md). USER em qualquer GET → 403 com `{ error: { code: 'FORBIDDEN' } }`.

19. **AC-19 (testes do service):** `backend-api/test/modules/reconcile/reconcile.service.test.ts` cobre runSingle nos 7 outcomes: `matched_deterministic`, `queued_ambiguous`, `queued_low_confidence`, `queued_no_match`, `skipped` (já vinculado), `skipped_inactive`, `no_legacy`. ≥7 testes.

20. **AC-20 (testes do runner):** `backend-api/test/modules/reconcile/reconcile.runner.test.ts` cobre: (a) batch completo com mix de outcomes (acumuladores corretos); (b) erro em um employee não para o batch (NFR-REL-2); (c) job final marca `COMPLETED` com `durationMs > 0` e AuditLog gravado; (d) `totalEmployees` definido após contagem inicial. ≥4 testes.

21. **AC-21 (testes da rota):** `backend-api/test/routes/admin-reconcile.test.ts` cobre: (a) POST cria job e responde com `jobId` + `status:'RUNNING'`; (b) POST retorna 409 quando já existe RUNNING; (c) GET /:id retorna 404 quando job é de outro tenant; (d) GET lista respeita paginação. Mock leve in-memory; sem subir Fastify completo (instanciar handlers diretamente ou usar `fastify.inject`). ≥4 testes.

22. **AC-22 (sem regressão TS):** `npx tsc --noEmit` em `backend-api/` — 0 erros. Suite type-check mantém apenas os 6 erros pré-existentes em `test/security/`.

## Tasks / Subtasks

- [x] **Task 1 — Implementar `ReconcileService.runSingle`** (AC: #1–#7)
  - [x] Substituir placeholder em `src/modules/reconcile/reconcile.service.ts`.
  - [x] Definir `RunSingleOutcome` discriminated union em `reconcile.types.ts`.
  - [x] Definir error class `ReconcileEmployeeNotFoundError`.
  - [x] Injetar dependências no constructor: `prisma`, `allocationService`, `queueService`, `deterministicMatcher`, `fuzzyMatcher`.
  - [x] Implementar fluxo: load employee → guards → normalize → deterministic → branch (unique/ambiguous/none) → fuzzy se necessário → upsert+update employee.workplaceId OR enqueue → return outcome.
  - [x] Helper privado `ensureDefaultPosition(tenantId, workplaceId)` duplicado da Story 1.4 (aceitável; refator para shared fica como follow-up se precisar).

- [x] **Task 2 — Implementar `ReconcileRunner.run`** (AC: #8–#13)
  - [x] Substituir placeholder em `src/modules/reconcile/reconcile.runner.ts`.
  - [x] Constructor recebe `prisma` + `reconcileService`.
  - [x] Assinatura: `run({ jobId, tenantId, operatorUserId })`.
  - [x] Count inicial de Employees → grava `totalEmployees`.
  - [x] Loop com cursor pagination batches de 100.
  - [x] Try/catch por employee + acumuladores.
  - [x] Update + log estruturado por batch.
  - [x] COMPLETED ou FAILED com AuditLog em qualquer caso.

- [x] **Task 3 — Rotas REST `admin/reconcile/`** (AC: #14–#18)
- [x] **Task 4 — Testes do service** (AC: #19) — 8 testes (7 outcomes + AC-1 not-found).
- [x] **Task 5 — Testes do runner** (AC: #20) — 4 testes.
- [x] **Task 6 — Testes das rotas** (AC: #21) — 4 testes (mock fastify-like, sem subir Fastify).
- [x] **Task 7 — Validações finais** (AC: #22) — `tsc --noEmit` src 0 erros; suite 6 erros pré-existentes em `test/security/` (sem regressão).
- [x] **Task 8 — Commit + relatório**
  - [ ] Commit message conforme sugestão em "Dev Notes > Commit Message".

## Dev Notes

### Discovery findings (Story 1.5 spike)

- **`ReconcileJobStatus` enum atual:** `PENDING | RUNNING | COMPLETED | FAILED` (já criado na Story 1.1 — `prisma/schema.prisma:536-541`).
- **`ReconcileJob` shape:** id, tenantId, operatorUserId, status, parserVersion (default `reconcile-v1`), totalEmployees (nullable), matched, queued, ignored, errors, durationMs (nullable), failureReason (nullable), triggeredBy (default `ADMIN`), batchParentId (nullable), createdAt, startedAt, completedAt. (`schema.prisma:550-575`).
- **Async in-process pattern:** zero usos prévios de `setImmediate`/`queueMicrotask` em `backend-api/src/`. Story 1.5 introduz convenção: `setImmediate(() => runner.run(args).catch(err => fastify.log.error({err, jobId}, 'reconcile fatal')))`. Justificativa: descola execução do response loop sem subir BullMQ (D5 Phase 1 in-process).
- **Cursor pagination Prisma:** padrão `findMany({ take, cursor, skip: 1 })` com cursor sendo `{ id: lastId }`. Primeiro batch sem cursor.
- **Autoload Fastify:** rotas em `routes/api/v1/admin/<dir>/index.ts` viram `/api/v1/admin/<dir>/...` automaticamente. Suporte a sub-paths como `/jobs` dentro do plugin é via `fastify.get('/jobs', ...)`.
- **Convenção de testes de rota:** `test/routes/*.test.ts` usa mock direto de handlers (não Fastify completo), exceto raros casos com `app.inject`. Manter padrão.
- **AuditService.log assinatura:** `AuditService.log(prisma, { tenantId, userId, action, resourceId, resourceType, previousData?, newData? })` — ver Story 1.4.

### Type definitions a adicionar em `reconcile.types.ts`

```typescript
export type RunSingleOutcome =
  | { outcome: 'matched_deterministic'; workplaceId: string; allocationKind: 'noop' | 'created' | 'replaced' }
  | { outcome: 'queued_ambiguous' }
  | { outcome: 'queued_low_confidence' }
  | { outcome: 'queued_no_match' }
  | { outcome: 'skipped' }
  | { outcome: 'skipped_inactive' }
  | { outcome: 'no_legacy' }

export const FUZZY_LOW_CONFIDENCE_THRESHOLD = 0.7
```

### Service Skeleton (`reconcile.service.ts`)

```typescript
import type { PrismaClient } from '@prisma/client'
import { WorkplaceAllocationService } from '../workplaces/workplace-allocation.service'
import { ReconcileQueueService } from './reconcile-queue.service'
import { DeterministicMatcher } from './matchers/deterministic-matcher'
import { FuzzyMatcher } from './matchers/fuzzy-matcher'
import { normalize } from './matchers/normalize'
import { FUZZY_LOW_CONFIDENCE_THRESHOLD, type RunSingleOutcome } from './reconcile.types'

export class ReconcileEmployeeNotFoundError extends Error {
  readonly code = 'RECONCILE_EMPLOYEE_NOT_FOUND'
  constructor(employeeId: string) {
    super(`Employee ${employeeId} não encontrado no tenant.`)
    this.name = 'ReconcileEmployeeNotFoundError'
  }
}

export interface RunSingleInput {
  tenantId: string
  employeeId: string
  reconcileJobId: string
  operatorUserId: string
}

export class ReconcileService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly allocationService: WorkplaceAllocationService,
    private readonly queueService: ReconcileQueueService,
    private readonly deterministicMatcher: DeterministicMatcher,
    private readonly fuzzyMatcher: FuzzyMatcher,
  ) {}

  async runSingle(input: RunSingleInput): Promise<RunSingleOutcome> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId: input.tenantId },
      select: { id: true, workplace: true, workplaceId: true, hireDate: true, status: true },
    })
    if (!employee) throw new ReconcileEmployeeNotFoundError(input.employeeId)

    if (employee.workplaceId) return { outcome: 'skipped' }
    if (employee.status === 'INATIVO') return { outcome: 'skipped_inactive' }
    const raw = (employee.workplace ?? '').trim()
    if (!raw) return { outcome: 'no_legacy' }

    const normalized = normalize(raw)
    const det = await this.deterministicMatcher.match(input.tenantId, normalized)

    if (det.kind === 'unique') {
      const positionId = await this.ensureDefaultPosition(input.tenantId, det.workplace.id)
      const result = await this.allocationService.upsertFromImport({
        tenantId: input.tenantId,
        employeeId: employee.id,
        operatorUserId: input.operatorUserId,
        workplacePositionId: positionId,
        startDate: employee.hireDate,
        source: 'V3.3_RECONCILE',
      })
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: { workplaceId: det.workplace.id },
      })
      return { outcome: 'matched_deterministic', workplaceId: det.workplace.id, allocationKind: result.kind }
    }

    // ambiguous OR none → enqueue
    const suggestions = await this.fuzzyMatcher.suggest(input.tenantId, normalized, 3)

    if (det.kind === 'ambiguous') {
      await this.queueService.enqueue({
        tenantId: input.tenantId,
        reconcileJobId: input.reconcileJobId,
        employeeId: employee.id,
        workplaceNameRaw: raw,
        suggestions,
      })
      return { outcome: 'queued_ambiguous' }
    }

    // det.kind === 'none'
    const top = suggestions[0]?.score ?? 0
    if (top >= FUZZY_LOW_CONFIDENCE_THRESHOLD) {
      await this.queueService.enqueue({
        tenantId: input.tenantId,
        reconcileJobId: input.reconcileJobId,
        employeeId: employee.id,
        workplaceNameRaw: raw,
        suggestions,
      })
      return { outcome: 'queued_low_confidence' }
    }

    await this.queueService.enqueue({
      tenantId: input.tenantId,
      reconcileJobId: input.reconcileJobId,
      employeeId: employee.id,
      workplaceNameRaw: raw,
      suggestions: [],
    })
    return { outcome: 'queued_no_match' }
  }

  private async ensureDefaultPosition(tenantId: string, workplaceId: string): Promise<string> {
    const existing = await this.prisma.workplacePosition.findFirst({
      where: { tenantId, workplaceId },
      orderBy: { createdAt: 'asc' },
    })
    if (existing) return existing.id
    const created = await this.prisma.workplacePosition.create({
      data: { tenantId, workplaceId, role: 'Operacional', requiredCount: 1 },
    })
    return created.id
  }
}
```

### Runner Skeleton (`reconcile.runner.ts`)

```typescript
import type { PrismaClient } from '@prisma/client'
import { AuditService } from '../shared/audit-service'
import { ReconcileService } from './reconcile.service'

export const RECONCILE_BATCH_SIZE = 100

export interface RunInput {
  jobId: string
  tenantId: string
  operatorUserId: string
}

interface Counters { matched: number; queued: number; ignored: number; errors: number }

export class ReconcileRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly service: ReconcileService,
  ) {}

  async run(input: RunInput): Promise<void> {
    const startedAt = Date.now()
    const counters: Counters = { matched: 0, queued: 0, ignored: 0, errors: 0 }
    let lastFailureReason: string | null = null

    const jobBefore = await this.prisma.reconcileJob.findFirstOrThrow({
      where: { id: input.jobId, tenantId: input.tenantId },
    })

    try {
      const total = await this.prisma.employee.count({
        where: { tenantId: input.tenantId, status: { not: 'INATIVO' } },
      })
      await this.prisma.reconcileJob.update({
        where: { id: input.jobId },
        data: { totalEmployees: total },
      })

      let cursor: string | undefined
      while (true) {
        const batch = await this.prisma.employee.findMany({
          where: { tenantId: input.tenantId, status: { not: 'INATIVO' } },
          orderBy: { id: 'asc' },
          take: RECONCILE_BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true },
        })
        if (batch.length === 0) break

        const batchStart = Date.now()
        for (const emp of batch) {
          try {
            const r = await this.service.runSingle({
              tenantId: input.tenantId,
              employeeId: emp.id,
              reconcileJobId: input.jobId,
              operatorUserId: input.operatorUserId,
            })
            switch (r.outcome) {
              case 'matched_deterministic': counters.matched++; break
              case 'queued_ambiguous':
              case 'queued_low_confidence':
              case 'queued_no_match': counters.queued++; break
              case 'skipped':
              case 'skipped_inactive':
              case 'no_legacy': counters.ignored++; break
            }
          } catch (e) {
            counters.errors++
            const err = e instanceof Error ? e : new Error(String(e))
            lastFailureReason = err.message.slice(0, 500)
            console.warn(JSON.stringify({
              module: 'reconcile', event: 'employee_failed',
              tenantId: input.tenantId, jobId: input.jobId,
              employeeId: emp.id, errorName: err.name,
            }))
          }
        }

        await this.prisma.reconcileJob.update({
          where: { id: input.jobId },
          data: { ...counters, failureReason: lastFailureReason },
        })
        console.info(JSON.stringify({
          module: 'reconcile', event: 'batch_completed',
          tenantId: input.tenantId, jobId: input.jobId,
          batchSize: batch.length, ...counters,
          durationMs: Date.now() - batchStart,
        }))

        cursor = batch[batch.length - 1].id
        if (batch.length < RECONCILE_BATCH_SIZE) break
      }

      const completed = await this.prisma.reconcileJob.update({
        where: { id: input.jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          ...counters,
          failureReason: lastFailureReason,
        },
      })

      await AuditService.log(this.prisma, {
        tenantId: input.tenantId,
        userId: input.operatorUserId,
        action: 'V3.3_RECONCILE',
        resourceId: input.jobId,
        resourceType: 'RECONCILE_JOB',
        previousData: jobBefore as unknown as object,
        newData: completed as unknown as object,
      })
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      const failed = await this.prisma.reconcileJob.update({
        where: { id: input.jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          failureReason: err.message.slice(0, 500),
          ...counters,
        },
      })
      await AuditService.log(this.prisma, {
        tenantId: input.tenantId,
        userId: input.operatorUserId,
        action: 'V3.3_RECONCILE',
        resourceId: input.jobId,
        resourceType: 'RECONCILE_JOB',
        previousData: jobBefore as unknown as object,
        newData: failed as unknown as object,
      })
    }
  }
}
```

### Route Skeleton (`routes/api/v1/admin/reconcile/index.ts`)

```typescript
import type { FastifyPluginAsync } from 'fastify'
import { WorkplaceAllocationService } from '../../../../../modules/workplaces/workplace-allocation.service'
import { ReconcileQueueService } from '../../../../../modules/reconcile/reconcile-queue.service'
import { DeterministicMatcher } from '../../../../../modules/reconcile/matchers/deterministic-matcher'
import { FuzzyMatcher } from '../../../../../modules/reconcile/matchers/fuzzy-matcher'
import { ReconcileService } from '../../../../../modules/reconcile/reconcile.service'
import { ReconcileRunner } from '../../../../../modules/reconcile/reconcile.runner'
import { AuditService } from '../../../../../modules/shared/audit-service'

const route: FastifyPluginAsync = async (fastify) => {
  const allocationService = new WorkplaceAllocationService(fastify.prisma)
  const queueService = new ReconcileQueueService(fastify.prisma, allocationService)
  const deterministic = new DeterministicMatcher(fastify.prisma)
  const fuzzy = new FuzzyMatcher(fastify.prisma)
  const service = new ReconcileService(fastify.prisma, allocationService, queueService, deterministic, fuzzy)
  const runner = new ReconcileRunner(fastify.prisma, service)

  fastify.post('/', { onRequest: [fastify.requireAuth, fastify.requireAdmin] }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId?: string }
    if (!user.tenantId) {
      return reply.code(400).send({ data: null, error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' } })
    }

    const existing = await fastify.prisma.reconcileJob.findFirst({
      where: { tenantId: user.tenantId, status: { in: ['PENDING', 'RUNNING'] } },
    })
    if (existing) {
      return reply.code(409).send({
        data: null,
        error: { code: 'RECONCILE_JOB_ALREADY_RUNNING', message: 'Já existe reconciliação em execução.' },
        meta: { existingJobId: existing.id },
      })
    }

    const job = await fastify.prisma.reconcileJob.create({
      data: {
        tenantId: user.tenantId,
        operatorUserId: user.userId,
        status: 'RUNNING',
        startedAt: new Date(),
        triggeredBy: 'ADMIN',
      },
    })

    await AuditService.log(fastify.prisma, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'V3.3_RECONCILE',
      resourceId: job.id,
      resourceType: 'RECONCILE_JOB',
      previousData: null,
      newData: job as unknown as object,
    })

    setImmediate(() => {
      runner.run({ jobId: job.id, tenantId: user.tenantId!, operatorUserId: user.userId })
        .catch((err) => fastify.log.error({ err, jobId: job.id }, 'reconcile runner fatal'))
    })

    return reply.code(200).send({ data: { jobId: job.id, status: 'RUNNING' }, error: null, meta: null })
  })

  fastify.get('/jobs', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { tenantId?: string; role: string }
    if (!user.tenantId) return reply.code(400).send({ data: null, error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' } })
    if (!['ADMIN', 'AUDITOR', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Acesso restrito.' } })
    }

    const q = request.query as { status?: 'PENDING'|'RUNNING'|'COMPLETED'|'FAILED'; page?: number; pageSize?: number }
    const page = q.page ?? 1
    const pageSize = q.pageSize ?? 20
    const where = { tenantId: user.tenantId, ...(q.status ? { status: q.status } : {}) }

    const [items, total] = await Promise.all([
      fastify.prisma.reconcileJob.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      fastify.prisma.reconcileJob.count({ where }),
    ])

    return { data: items, error: null, meta: { total, page, pageSize, readOnly: user.role === 'AUDITOR' } }
  })

  fastify.get('/jobs/:id', {
    onRequest: [fastify.requireAuth],
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (request, reply) => {
    const user = request.user as { tenantId?: string; role: string }
    if (!user.tenantId) return reply.code(400).send({ data: null, error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' } })
    if (!['ADMIN', 'AUDITOR', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Acesso restrito.' } })
    }

    const { id } = request.params as { id: string }
    const job = await fastify.prisma.reconcileJob.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!job) return reply.code(404).send({ data: null, error: { code: 'NOT_FOUND', message: 'Job não encontrado.' } })

    const totalSeen = job.matched + job.queued + job.ignored + job.errors
    const progressPct = job.totalEmployees && job.totalEmployees > 0
      ? Math.round((totalSeen / job.totalEmployees) * 100)
      : 0

    return { data: { ...job, progressPct }, error: null, meta: { readOnly: user.role === 'AUDITOR' } }
  })
}

export default route
```

### Project Structure Notes

- Service em `src/modules/reconcile/reconcile.service.ts` (substituir placeholder Story 1.1).
- Runner em `src/modules/reconcile/reconcile.runner.ts` (substituir placeholder Story 1.1).
- Rota em `src/routes/api/v1/admin/reconcile/index.ts` (subdir novo, autoload Fastify).
- Tipos atualizados em `src/modules/reconcile/reconcile.types.ts` (adicionar `RunSingleOutcome` + `FUZZY_LOW_CONFIDENCE_THRESHOLD`).
- Testes em `test/modules/reconcile/{reconcile.service,reconcile.runner}.test.ts` e `test/routes/admin-reconcile.test.ts`.

### References

- [Source: prd.md#FR1-FR7, FR9-FR11, FR28, FR31] — disparo, idempotência, batches, matching, ignora INATIVO/sem workplace, AuditLog, relatório
- [Source: prd.md#NFR-PERF-1, NFR-REL-1, NFR-REL-2, NFR-REL-5, NFR-OBS-1, NFR-OBS-3, NFR-SEC-4]
- [Source: architecture.md#D5] — reconcile in-process Phase 1
- [Source: architecture.md#D6, Implementation Sequence] — service+runner+rota
- [Source: architecture.md#Enforcement-Guidelines] — #1 (allocation service único), #4 (audit), #6 (logs sem PII)
- [Source: epics.md#Story-1.5] — AC originais
- [Source: 1-1, 1-2, 1-3, 1-4 dedicated story files] — placeholders e dependências
- [Source: backend-api/prisma/schema.prisma:536-575] — enum + model ReconcileJob
- [Source: backend-api/src/plugins/auth-guard.ts] — RBAC helpers

### Commit Message (sugerida)

```
feat(reconcile): ReconcileService.runSingle + Runner + rotas admin (Story 1.5)

- ReconcileService.runSingle: 7 outcomes (matched_deterministic,
  queued_ambiguous, queued_low_confidence, queued_no_match, skipped,
  skipped_inactive, no_legacy) integrando matchers + queue + allocation.
- Auto-vincula Employee.workplaceId em match deterministico unique.
- ReconcileRunner.run: cursor pagination em batches de 100, accumula
  matched/queued/ignored/errors; resiliente a falhas individuais
  (NFR-REL-2); finaliza job COMPLETED ou FAILED com AuditLog.
- Logs estruturados JSON sem PII (NFR-SEC-4, NFR-OBS-1).
- Rotas: POST /v1/admin/reconcile (ADMIN+SUPER, 409 quando ja existe
  PENDING/RUNNING, dispatch via setImmediate), GET /v1/admin/reconcile/jobs
  e GET /v1/admin/reconcile/jobs/:id (ADMIN+AUDITOR+SUPER, progressPct).
- Erros tipados: ReconcileEmployeeNotFoundError.
- Testes: 7 cenarios de runSingle, 4 do runner, 4 das rotas.

Story: 1.5
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (EVO Master + dev-story workflow)

### Debug Log References

- `npx tsc --noEmit` (src) — **0 erros**.
- `npx tsc -p test/tsconfig.json --noEmit` — **6 erros pré-existentes** em `test/security/imports-cross-tenant.test.ts` (Buffer/Uint8Array, sem relação com V3.3). Sem regressão.
- `npx tsx --test test/modules/reconcile/*.test.ts test/routes/admin-reconcile.test.ts test/modules/workplace-allocation.service.test.ts` → **49/49 verde**.

### Completion Notes List

**AC-1 ✅ runSingle assinatura + ReconcileEmployeeNotFoundError** — service injeta `prisma`, `allocationService`, `queueService`, `deterministicMatcher`, `fuzzyMatcher`. Carrega employee filtrando por (id, tenantId).

**AC-2/3/4 ✅ Guards** — `skipped` (workplaceId já set), `no_legacy` (workplace null/empty após trim), `skipped_inactive` (status=INATIVO).

**AC-5 ✅ matched_deterministic** — `ensureDefaultPosition` cria padrão se workplace não tem WorkplacePosition; chama `upsertFromImport({ source: 'V3.3_RECONCILE' })`; atualiza `Employee.workplaceId`. Retorna `allocationKind` refletindo `noop|created|replaced`.

**AC-6 ✅ queued_ambiguous** — chama fuzzy + enqueue com sugestões.

**AC-7 ✅ queued_low_confidence | queued_no_match** — none + top score ≥ 0.7 enfileira com sugestões; senão enfileira com `[]`. Threshold em const `FUZZY_LOW_CONFIDENCE_THRESHOLD = 0.7`.

**AC-8 ✅ Runner cursor batches 100** — `findMany` com cursor + skip:1; `where: { tenantId, status: { not: 'INATIVO' } }`.

**AC-9 ✅ Acumuladores** — switch sobre outcome incrementa matched/queued/ignored.

**AC-10 ✅ Resiliência por employee** — try/catch interno; `failureReason` truncado a 500 chars; log estruturado JSON sem PII.

**AC-11 ✅ Update por batch + log** — atualiza counters + emite log `batch_completed`.

**AC-12 ✅ COMPLETED + AuditLog** — `durationMs = Date.now() - startedAt`; AuditLog com `previousData=jobBefore`, `newData=completed`.

**AC-13 ✅ FAILED em exceção fatal** — try/catch externo grava `status='FAILED'` + AuditLog.

**AC-14 ✅ POST 409 quando já existe RUNNING** — check `status ∈ {PENDING, RUNNING}` antes de criar; retorna `meta.existingJobId`.

**AC-15 ✅ POST 200 + dispatch async** — cria job RUNNING + AuditLog START; `setImmediate` dispara runner com `.catch(logFatal)`. Variáveis capturadas em closure (`tenantId`, `userId`) para evitar race com `request.user` desfocado.

**AC-16 ✅ GET /:id** — filtro por tenantId; 404 cross-tenant; `progressPct` calculado.

**AC-17 ✅ GET /jobs** — paginação `page/pageSize`, filtro `status`, order `createdAt desc`, `meta.readOnly` para AUDITOR.

**AC-18 ✅ Envelope** — `{ data, error, meta }` em todas respostas; USER → 403.

**AC-19 ✅ 8 testes do service** — 7 outcomes + ReconcileEmployeeNotFoundError.

**AC-20 ✅ 4 testes do runner** — mix, error-continues, COMPLETED+audit, totalEmployees.

**AC-21 ✅ 4 testes da rota** — Plugin instanciado com fake fastify (captura handlers via post/get; sem build/inject); cenários POST 200, POST 409, GET /:id 404 cross-tenant, GET lista AUDITOR readOnly.

**AC-22 ✅ Sem regressão TS** — src 0 erros; suite mantém apenas os 6 erros pré-existentes em `test/security/`.

**Notas técnicas:**
- `setImmediate` introduz convenção async in-process (zero usos prévios em src).
- Helper `ensureDefaultPosition` duplicado entre Story 1.4 (queue) e Story 1.5 (service). Aceito; potencial refactor para `reconcile/reconcile.shared.ts` em iteração futura.
- Logs estruturados via `console.info`/`console.warn` (sem PII). Quando integrarmos com Fastify logger no runner (passar `fastify.log`), será trivial.

### File List

**Modified:**
- `backend-api/src/modules/reconcile/reconcile.service.ts` (substituiu placeholder)
- `backend-api/src/modules/reconcile/reconcile.runner.ts` (substituiu placeholder)
- `backend-api/src/modules/reconcile/reconcile.types.ts` (adicionou RunSingleOutcome + FUZZY_LOW_CONFIDENCE_THRESHOLD)

**Created:**
- `backend-api/src/routes/api/v1/admin/reconcile/index.ts`
- `backend-api/test/modules/reconcile/reconcile.service.test.ts` (8 testes)
- `backend-api/test/modules/reconcile/reconcile.runner.test.ts` (4 testes)
- `backend-api/test/routes/admin-reconcile.test.ts` (4 testes)
