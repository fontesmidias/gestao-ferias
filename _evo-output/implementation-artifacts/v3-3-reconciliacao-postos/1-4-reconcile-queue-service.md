# Story 1.4: ReconcileQueueService + endpoints REST da fila

Status: review

## Story

As a **ADMIN**,
I want **endpoints REST para listar e resolver itens da fila de revisão (`vincular`/`criar`/`adiar`/`ignorar`)**,
so that **eu possa tratar não-matches que sobraram da reconciliação automática sem editar o banco diretamente**.

## Acceptance Criteria

1. **AC-1:** `ReconcileQueueService.enqueue({ tenantId, reconcileJobId, employeeId, workplaceNameRaw, suggestions })` cria item `WorkplaceReconcileQueue` com state `PENDING`. Se já existe item PENDING ou DEFERRED para o mesmo (tenantId, employeeId), **atualiza** o item existente com novas suggestions (não cria duplicata, respeita UNIQUE constraint).
2. **AC-2:** `ReconcileQueueService.list({ tenantId, state?, jobId?, page=1, pageSize=20 })` retorna `{ items, total, page, pageSize }` paginado, filtrado por `tenantId` (sempre) + `state` e `jobId` (opcionais). Ordenação: `createdAt desc`.
3. **AC-3:** `ReconcileQueueService.resolve({ id, tenantId, action, ...inputs, operatorUserId })` valida: (a) item existe; (b) `tenantId` do item bate com o do JWT; (c) `state ∈ {PENDING, DEFERRED}` (caso contrário lança `ReconcileQueueInvalidStateError`).
4. **AC-4:** `action: 'link'` com `workplaceId` resolve item: chama `WorkplaceAllocationService.upsertFromImport({ tenantId, employeeId, workplacePositionId: <derivado>, startDate: <hireDate>, source: 'RECONCILE_QUEUE_RESOLVE', operatorUserId })`. Atualiza `state='RESOLVED'`, `resolvedToWorkplaceId`, `resolvedByUserId`, `resolvedAt`. Grava AuditLog com `action='RECONCILE_QUEUE_RESOLVE'`.

   **Nota técnica:** `workplaceId` aponta para um Workplace; o service precisa resolver `workplacePositionId` a partir dele (pegar a primeira `WorkplacePosition` ativa do workplace; se não houver, criar uma padrão como em FR26). `startDate` vem do `Employee.hireDate` (NFR-COMP-1).
5. **AC-5:** `action: 'create'` com `workplaceName` (e opcional `workplacePositionRole`) cria novo `Workplace` no tenant com `importedBy='AUTO_USER_RESOLVE'`, cria `WorkplacePosition` padrão (`role: workplacePositionRole ?? 'Operacional'`, `requiredCount: 1`), e então chama `upsertFromImport` como em AC-4. Atualiza state RESOLVED + AuditLog.
6. **AC-6:** `action: 'defer'` apenas atualiza `state='DEFERRED'`, `resolvedAt` permanece null. Grava AuditLog com `action='RECONCILE_QUEUE_DEFER'`.
7. **AC-7:** `action: 'ignore'` apenas atualiza `state='IGNORED'`, `resolvedAt=now()`. Grava AuditLog com `action='RECONCILE_QUEUE_IGNORE'`.
8. **AC-8:** Endpoint `GET /api/v1/admin/workplace-reconcile-queue?state=&jobId=&page=&pageSize=` exige `requireAuth`; permite roles `ADMIN`, `AUDITOR`, `SUPERADMIN`. Tenant filtra do JWT (sem aceitar via query). Resposta envelope `{ data, error, meta }` com `data: items`, `meta: { total, page, pageSize }`.
9. **AC-9:** Endpoint `POST /api/v1/admin/workplace-reconcile-queue/:id/resolve` exige `requireAuth + requireAdmin` (ADMIN ou SUPERADMIN). AUDITOR e USER recebem 403. Body: `{ action: 'link'|'create'|'defer'|'ignore', workplaceId?, workplaceName?, workplacePositionRole? }`. Valida combinações: link exige workplaceId; create exige workplaceName.
10. **AC-10:** Conflito de estado em resolve retorna `409` com `{ error: { code: 'RECONCILE_QUEUE_ITEM_INVALID_STATE', message: ... } }`.
11. **AC-11:** Item de outro tenant (mesmo via curl com id correto) retorna `404` (não vaza informação cross-tenant).
12. **AC-12:** Testes em `backend-api/test/modules/reconcile/reconcile-queue.service.test.ts` cobrindo ≥6 cenários: enqueue novo, enqueue idempotente (atualiza existente), list paginado com filtros, resolve link (chama upsertFromImport), resolve defer (state transition + audit), resolve em estado inválido (lança erro). Mock leve in-memory.
13. **AC-13:** `npx tsc --noEmit` retorna 0 erros no `backend-api/`. Suite type-check mantém apenas os 6 erros pré-existentes em `test/security/`.

## Tasks / Subtasks

- [x] **Task 1 — Implementar ReconcileQueueService** (AC: #1, #2, #3, #4, #5, #6, #7, #10, #11)
  - [x] Substituir placeholder em `backend-api/src/modules/reconcile/reconcile-queue.service.ts` com classe completa (ver "Dev Notes > Service Skeleton").
  - [x] Importar `AuditService`, `WorkplaceAllocationService`, tipos do `reconcile.types.ts`.
  - [x] Definir custom error class `ReconcileQueueInvalidStateError` exportado.
  - [x] Métodos: `enqueue`, `list`, `resolve`, mais helper privado `resolveLinkOrCreate` para reuso entre AC-4 e AC-5.

- [x] **Task 2 — Criar rotas REST** (AC: #8, #9, #10, #11)
  - [x] Criar `backend-api/src/routes/api/v1/admin/workplace-reconcile-queue/index.ts`.
  - [x] Plugin Fastify async com `GET '/'` (list) e `POST '/:id/resolve'`.
  - [x] Schema validation (querystring para list; params + body para resolve).
  - [x] `onRequest: [fastify.requireAuth]` + check manual de role para AUDITOR no GET.
  - [x] `onRequest: [fastify.requireAuth, fastify.requireAdmin]` no POST.
  - [x] Envelope `{ data, error, meta }` em todas respostas.

- [x] **Task 3 — Testes unitários** (AC: #12)
  - [x] Criar `backend-api/test/modules/reconcile/reconcile-queue.service.test.ts`.
  - [x] Mock leve in-memory de PrismaClient + WorkplaceAllocationService.
  - [x] Cenários: enqueue novo, enqueue duplicate (update), list com filtros, list paginado, resolve link sucesso, resolve defer, resolve estado inválido, resolve cross-tenant 404.

- [x] **Task 4 — Validações** (AC: #13)
  - [x] `npx tsc --noEmit` em `backend-api/` — 0 erros.
  - [x] Type-check da suite mantém apenas 6 erros pré-existentes.

- [x] **Task 5 — Commit + relatório**

## Dev Notes

### Discovery findings (Story 1.4 spike)

- **RBAC helpers existentes** (`backend-api/src/plugins/auth-guard.ts`):
  - `fastify.requireAuth` — verifica JWT + tenantId presente (exceto SUPERADMIN).
  - `fastify.requireAdmin` — bloqueia se role ≠ ADMIN/SUPERADMIN.
  - `fastify.requireSuperAdmin` — bloqueia se role ≠ SUPERADMIN.
  - **Não existe** `requireAuditor` ou `requireAdminOrAuditor`. Para o GET list (que aceita AUDITOR como read-only), usar apenas `requireAuth` e checar role manualmente no handler para rejeitar USER.
- **Pagination convention:** projeto usa `limit/offset` em algumas rotas (master-key-logs) e `take/skip` no Prisma. V3.3 adota `page/pageSize` (mais user-friendly na UI), conversão interna para Prisma `skip = (page-1) * pageSize` e `take = pageSize`.
- **Envelope `{ data, error, meta }`:** prescrito pelo CLAUDE.md mas inconsistente no codebase. V3.3 segue CLAUDE.md.
- **Autoload:** `routes/api/v1/admin/<subdir>/index.ts` é registrado automaticamente como `/api/v1/admin/<subdir>/...`. Subir um subdir novo `workplace-reconcile-queue/` cria as rotas correspondentes.

### Service Skeleton

```typescript
import { Prisma, type PrismaClient, type WorkplaceReconcileQueue } from '@prisma/client'
import { AuditService } from '../shared/audit-service'
import { WorkplaceAllocationService } from '../workplaces/workplace-allocation.service'

export class ReconcileQueueInvalidStateError extends Error {
  readonly code = 'RECONCILE_QUEUE_ITEM_INVALID_STATE'
  constructor(currentState: string) {
    super(`Item já foi resolvido (estado: ${currentState}). Operação não permitida.`)
    this.name = 'ReconcileQueueInvalidStateError'
  }
}

export class ReconcileQueueNotFoundError extends Error {
  readonly code = 'RECONCILE_QUEUE_ITEM_NOT_FOUND'
  constructor() {
    super('Item da fila não encontrado.')
    this.name = 'ReconcileQueueNotFoundError'
  }
}

export type ResolveAction = 'link' | 'create' | 'defer' | 'ignore'

export interface EnqueueInput {
  tenantId: string
  reconcileJobId: string
  employeeId: string
  workplaceNameRaw: string
  suggestions?: unknown // JSON serializável: [{ id, name, score }]
}

export interface ListInput {
  tenantId: string
  state?: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
  jobId?: string
  page?: number
  pageSize?: number
}

export interface ResolveInput {
  id: string
  tenantId: string
  operatorUserId: string
  action: ResolveAction
  workplaceId?: string
  workplaceName?: string
  workplacePositionRole?: string
}

export class ReconcileQueueService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly allocationService: WorkplaceAllocationService,
  ) {}

  /**
   * Cria item PENDING ou atualiza item PENDING/DEFERRED existente para o
   * mesmo (tenantId, employeeId) — respeita UNIQUE (tenantId, employeeId, state).
   */
  async enqueue(input: EnqueueInput): Promise<WorkplaceReconcileQueue> {
    // Procura item ativo existente para o employee neste tenant
    const existing = await this.prisma.workplaceReconcileQueue.findFirst({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        state: { in: ['PENDING', 'DEFERRED'] },
      },
    })

    if (existing) {
      // Atualiza suggestions e mantém estado (idempotente em re-execução do reconcile)
      return this.prisma.workplaceReconcileQueue.update({
        where: { id: existing.id },
        data: {
          workplaceNameRaw: input.workplaceNameRaw,
          suggestions: (input.suggestions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          reconcileJobId: input.reconcileJobId,
        },
      })
    }

    return this.prisma.workplaceReconcileQueue.create({
      data: {
        tenantId: input.tenantId,
        reconcileJobId: input.reconcileJobId,
        employeeId: input.employeeId,
        workplaceNameRaw: input.workplaceNameRaw,
        suggestions: (input.suggestions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        state: 'PENDING',
      },
    })
  }

  async list(input: ListInput): Promise<{
    items: WorkplaceReconcileQueue[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20

    const where: Prisma.WorkplaceReconcileQueueWhereInput = {
      tenantId: input.tenantId,
      ...(input.state ? { state: input.state } : {}),
      ...(input.jobId ? { reconcileJobId: input.jobId } : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.workplaceReconcileQueue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workplaceReconcileQueue.count({ where }),
    ])

    return { items, total, page, pageSize }
  }

  async resolve(input: ResolveInput): Promise<WorkplaceReconcileQueue> {
    const item = await this.prisma.workplaceReconcileQueue.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    })
    if (!item) throw new ReconcileQueueNotFoundError()
    if (item.state !== 'PENDING' && item.state !== 'DEFERRED') {
      throw new ReconcileQueueInvalidStateError(item.state)
    }

    const now = new Date()

    switch (input.action) {
      case 'link':
        return this.applyLink(item, input, now)
      case 'create':
        return this.applyCreate(item, input, now)
      case 'defer':
        return this.applyStateTransition(item, input, 'DEFERRED', 'RECONCILE_QUEUE_DEFER', null)
      case 'ignore':
        return this.applyStateTransition(item, input, 'IGNORED', 'RECONCILE_QUEUE_IGNORE', now)
      default:
        throw new Error(`Unknown action: ${input.action as string}`)
    }
  }

  // ─── Helpers privados ──────────────────────────────────────────────

  private async applyLink(
    item: WorkplaceReconcileQueue,
    input: ResolveInput,
    now: Date,
  ): Promise<WorkplaceReconcileQueue> {
    if (!input.workplaceId) {
      throw new Error('workplaceId é obrigatório para action=link')
    }

    const positionId = await this.ensureDefaultPosition(input.tenantId, input.workplaceId)
    const employee = await this.requireEmployee(input.tenantId, item.employeeId)

    await this.allocationService.upsertFromImport({
      tenantId: input.tenantId,
      employeeId: item.employeeId,
      operatorUserId: input.operatorUserId,
      workplacePositionId: positionId,
      startDate: employee.hireDate,
      source: 'RECONCILE_QUEUE_RESOLVE',
    })

    const updated = await this.prisma.workplaceReconcileQueue.update({
      where: { id: item.id },
      data: {
        state: 'RESOLVED',
        resolvedToWorkplaceId: input.workplaceId,
        resolvedByUserId: input.operatorUserId,
        resolvedAt: now,
      },
    })

    await AuditService.log(this.prisma, {
      tenantId: input.tenantId,
      userId: input.operatorUserId,
      action: 'RECONCILE_QUEUE_RESOLVE',
      resourceId: item.id,
      resourceType: 'WORKPLACE_RECONCILE_QUEUE',
      previousData: item as unknown as object,
      newData: updated as unknown as object,
    })

    return updated
  }

  private async applyCreate(
    item: WorkplaceReconcileQueue,
    input: ResolveInput,
    now: Date,
  ): Promise<WorkplaceReconcileQueue> {
    if (!input.workplaceName) {
      throw new Error('workplaceName é obrigatório para action=create')
    }

    const workplace = await this.prisma.workplace.create({
      data: {
        tenantId: input.tenantId,
        name: input.workplaceName,
        importedBy: 'AUTO_USER_RESOLVE',
        importedAt: now,
      },
    })

    const position = await this.prisma.workplacePosition.create({
      data: {
        tenantId: input.tenantId,
        workplaceId: workplace.id,
        role: input.workplacePositionRole ?? 'Operacional',
        requiredCount: 1,
      },
    })

    const employee = await this.requireEmployee(input.tenantId, item.employeeId)

    await this.allocationService.upsertFromImport({
      tenantId: input.tenantId,
      employeeId: item.employeeId,
      operatorUserId: input.operatorUserId,
      workplacePositionId: position.id,
      startDate: employee.hireDate,
      source: 'RECONCILE_QUEUE_RESOLVE',
    })

    const updated = await this.prisma.workplaceReconcileQueue.update({
      where: { id: item.id },
      data: {
        state: 'RESOLVED',
        resolvedToWorkplaceId: workplace.id,
        resolvedByUserId: input.operatorUserId,
        resolvedAt: now,
      },
    })

    await AuditService.log(this.prisma, {
      tenantId: input.tenantId,
      userId: input.operatorUserId,
      action: 'RECONCILE_QUEUE_RESOLVE',
      resourceId: item.id,
      resourceType: 'WORKPLACE_RECONCILE_QUEUE',
      previousData: item as unknown as object,
      newData: { ...updated, createdWorkplaceId: workplace.id } as unknown as object,
    })

    return updated
  }

  private async applyStateTransition(
    item: WorkplaceReconcileQueue,
    input: ResolveInput,
    newState: 'DEFERRED' | 'IGNORED',
    auditAction: string,
    resolvedAt: Date | null,
  ): Promise<WorkplaceReconcileQueue> {
    const updated = await this.prisma.workplaceReconcileQueue.update({
      where: { id: item.id },
      data: {
        state: newState,
        resolvedByUserId: resolvedAt ? input.operatorUserId : null,
        resolvedAt,
      },
    })

    await AuditService.log(this.prisma, {
      tenantId: input.tenantId,
      userId: input.operatorUserId,
      action: auditAction,
      resourceId: item.id,
      resourceType: 'WORKPLACE_RECONCILE_QUEUE',
      previousData: item as unknown as object,
      newData: updated as unknown as object,
    })

    return updated
  }

  private async ensureDefaultPosition(tenantId: string, workplaceId: string): Promise<string> {
    const existing = await this.prisma.workplacePosition.findFirst({
      where: { tenantId, workplaceId },
      orderBy: { createdAt: 'asc' },
    })
    if (existing) return existing.id

    const created = await this.prisma.workplacePosition.create({
      data: {
        tenantId,
        workplaceId,
        role: 'Operacional',
        requiredCount: 1,
      },
    })
    return created.id
  }

  private async requireEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, hireDate: true },
    })
    if (!employee) throw new Error(`Employee ${employeeId} não encontrado no tenant ${tenantId}`)
    return employee
  }
}
```

### Route Skeleton

`backend-api/src/routes/api/v1/admin/workplace-reconcile-queue/index.ts`:

```typescript
import type { FastifyPluginAsync } from 'fastify'
import { ReconcileQueueService, ReconcileQueueInvalidStateError, ReconcileQueueNotFoundError } from '../../../../../modules/reconcile/reconcile-queue.service'
import { WorkplaceAllocationService } from '../../../../../modules/workplaces/workplace-allocation.service'

const route: FastifyPluginAsync = async (fastify) => {
  const allocationService = new WorkplaceAllocationService(fastify.prisma)
  const queueService = new ReconcileQueueService(fastify.prisma, allocationService)

  // GET /api/v1/admin/workplace-reconcile-queue
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['PENDING', 'DEFERRED', 'RESOLVED', 'IGNORED'] },
          jobId: { type: 'string', format: 'uuid' },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { tenantId?: string; role: string }
    if (!user.tenantId) {
      return reply.code(400).send({
        data: null,
        error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
      })
    }
    if (!['ADMIN', 'AUDITOR', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({
        data: null,
        error: { code: 'FORBIDDEN', message: 'Acesso restrito.' },
      })
    }

    const query = request.query as {
      state?: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
      jobId?: string
      page?: number
      pageSize?: number
    }

    const result = await queueService.list({
      tenantId: user.tenantId,
      state: query.state,
      jobId: query.jobId,
      page: query.page,
      pageSize: query.pageSize,
    })

    return {
      data: result.items,
      error: null,
      meta: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        readOnly: user.role === 'AUDITOR',
      },
    }
  })

  // POST /api/v1/admin/workplace-reconcile-queue/:id/resolve
  fastify.post('/:id/resolve', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['link', 'create', 'defer', 'ignore'] },
          workplaceId: { type: 'string', format: 'uuid' },
          workplaceName: { type: 'string', minLength: 1 },
          workplacePositionRole: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId?: string }
    if (!user.tenantId) {
      return reply.code(400).send({
        data: null,
        error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
      })
    }

    const { id } = request.params as { id: string }
    const body = request.body as {
      action: 'link' | 'create' | 'defer' | 'ignore'
      workplaceId?: string
      workplaceName?: string
      workplacePositionRole?: string
    }

    // Validações de combinação de inputs
    if (body.action === 'link' && !body.workplaceId) {
      return reply.code(400).send({
        data: null,
        error: { code: 'MISSING_WORKPLACE_ID', message: 'workplaceId obrigatório para action=link' },
      })
    }
    if (body.action === 'create' && !body.workplaceName) {
      return reply.code(400).send({
        data: null,
        error: { code: 'MISSING_WORKPLACE_NAME', message: 'workplaceName obrigatório para action=create' },
      })
    }

    try {
      const updated = await queueService.resolve({
        id,
        tenantId: user.tenantId,
        operatorUserId: user.userId,
        action: body.action,
        workplaceId: body.workplaceId,
        workplaceName: body.workplaceName,
        workplacePositionRole: body.workplacePositionRole,
      })
      return { data: updated, error: null, meta: null }
    } catch (err) {
      if (err instanceof ReconcileQueueInvalidStateError) {
        return reply.code(409).send({
          data: null,
          error: { code: err.code, message: err.message },
        })
      }
      if (err instanceof ReconcileQueueNotFoundError) {
        return reply.code(404).send({
          data: null,
          error: { code: err.code, message: err.message },
        })
      }
      throw err
    }
  })
}

export default route
```

### Test Skeleton

`backend-api/test/modules/reconcile/reconcile-queue.service.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert'
import {
  ReconcileQueueService,
  ReconcileQueueInvalidStateError,
} from '../../../src/modules/reconcile/reconcile-queue.service'

const TENANT = '11111111-1111-1111-1111-111111111111'
const EMPLOYEE = '22222222-2222-2222-2222-222222222222'
const JOB = '33333333-3333-3333-3333-333333333333'
const WORKPLACE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const POSITION = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OPERATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

interface QueueRow {
  id: string
  tenantId: string
  reconcileJobId: string
  employeeId: string
  workplaceNameRaw: string
  state: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
  suggestions: unknown
  resolvedToWorkplaceId: string | null
  resolvedByUserId: string | null
  resolvedAt: Date | null
  createdAt: Date
}

function makeMocks(initialQueue: QueueRow[] = []) {
  const queue: QueueRow[] = [...initialQueue]
  const auditLogs: Array<{ action: string; resourceId: string }> = []
  const allocationCalls: Array<{ source: string; positionId: string }> = []

  // Mock allocationService que apenas registra chamadas
  const allocationService = {
    async upsertFromImport(input: { workplacePositionId: string; source: string }) {
      allocationCalls.push({ source: input.source, positionId: input.workplacePositionId })
      return { kind: 'created' as const, allocationId: `alloc-${allocationCalls.length}` }
    },
  }

  const positions: Array<{ id: string; tenantId: string; workplaceId: string }> = [
    { id: POSITION, tenantId: TENANT, workplaceId: WORKPLACE },
  ]
  const workplaces: Array<{ id: string; tenantId: string; name: string }> = []
  const employees = new Map([
    [EMPLOYEE, { id: EMPLOYEE, tenantId: TENANT, hireDate: new Date('2024-01-15') }],
  ])

  const prisma = {
    workplaceReconcileQueue: {
      async findFirst({ where }: { where: Partial<QueueRow> & { state?: { in?: string[] } } }) {
        return (
          queue.find((q) => {
            if (where.tenantId && q.tenantId !== where.tenantId) return false
            if (where.employeeId && q.employeeId !== where.employeeId) return false
            if (where.id && q.id !== where.id) return false
            if (where.state && typeof where.state === 'object' && Array.isArray(where.state.in)) {
              return where.state.in.includes(q.state)
            }
            if (where.state && typeof where.state === 'string') return q.state === where.state
            return true
          }) ?? null
        )
      },
      async findMany({ where, skip = 0, take = 20 }: { where: Partial<QueueRow>; skip?: number; take?: number }) {
        return queue
          .filter((q) =>
            (!where.tenantId || q.tenantId === where.tenantId) &&
            (!where.state || q.state === where.state) &&
            (!where.reconcileJobId || q.reconcileJobId === where.reconcileJobId),
          )
          .slice(skip, skip + take)
      },
      async count({ where }: { where: Partial<QueueRow> }) {
        return queue.filter((q) =>
          (!where.tenantId || q.tenantId === where.tenantId) &&
          (!where.state || q.state === where.state),
        ).length
      },
      async create({ data }: { data: Omit<QueueRow, 'id' | 'createdAt' | 'resolvedToWorkplaceId' | 'resolvedByUserId' | 'resolvedAt'> }) {
        const row: QueueRow = {
          ...data,
          id: `queue-${queue.length + 1}`,
          resolvedToWorkplaceId: null,
          resolvedByUserId: null,
          resolvedAt: null,
          createdAt: new Date(),
        }
        queue.push(row)
        return row
      },
      async update({ where, data }: { where: { id: string }; data: Partial<QueueRow> }) {
        const idx = queue.findIndex((q) => q.id === where.id)
        if (idx < 0) throw new Error('not found')
        queue[idx] = { ...queue[idx], ...data }
        return queue[idx]
      },
    },
    workplacePosition: {
      async findFirst({ where }: { where: { tenantId: string; workplaceId: string } }) {
        return positions.find((p) => p.tenantId === where.tenantId && p.workplaceId === where.workplaceId) ?? null
      },
      async create({ data }: { data: { tenantId: string; workplaceId: string } }) {
        const row = { id: `pos-${positions.length + 1}`, ...data }
        positions.push(row)
        return row
      },
    },
    workplace: {
      async create({ data }: { data: { tenantId: string; name: string } }) {
        const row = { id: `wp-${workplaces.length + 1}`, ...data }
        workplaces.push(row)
        return row
      },
    },
    employee: {
      async findFirst({ where }: { where: { id: string; tenantId: string } }) {
        const e = employees.get(where.id)
        return e && e.tenantId === where.tenantId ? e : null
      },
    },
    auditLog: {
      async create({ data }: { data: { action: string; resourceId: string } }) {
        auditLogs.push({ action: data.action, resourceId: data.resourceId })
        return data
      },
    },
  } as never

  return {
    prisma,
    allocationService: allocationService as never,
    state: { queue, auditLogs, allocationCalls, workplaces, positions },
  }
}

test('ReconcileQueueService', async (t) => {
  await t.test('AC-1: enqueue cria item PENDING', async () => {
    const { prisma, allocationService, state } = makeMocks()
    const svc = new ReconcileQueueService(prisma, allocationService)
    const item = await svc.enqueue({
      tenantId: TENANT,
      reconcileJobId: JOB,
      employeeId: EMPLOYEE,
      workplaceNameRaw: 'INEP - Sede',
    })
    assert.strictEqual(item.state, 'PENDING')
    assert.strictEqual(state.queue.length, 1)
  })

  await t.test('AC-1: enqueue idempotente — atualiza item existente PENDING/DEFERRED', async () => {
    const { prisma, allocationService, state } = makeMocks([
      {
        id: 'queue-pre',
        tenantId: TENANT,
        reconcileJobId: 'job-old',
        employeeId: EMPLOYEE,
        workplaceNameRaw: 'INEP - Velho',
        state: 'PENDING',
        suggestions: null,
        resolvedToWorkplaceId: null,
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: new Date(),
      },
    ])
    const svc = new ReconcileQueueService(prisma, allocationService)
    await svc.enqueue({
      tenantId: TENANT,
      reconcileJobId: JOB,
      employeeId: EMPLOYEE,
      workplaceNameRaw: 'INEP - Sede',
      suggestions: [{ id: 'wp-x', name: 'INEP - Sede', score: 0.9 }],
    })
    assert.strictEqual(state.queue.length, 1, 'sem duplicata')
    assert.strictEqual(state.queue[0].workplaceNameRaw, 'INEP - Sede', 'atualizado')
    assert.strictEqual(state.queue[0].reconcileJobId, JOB, 'jobId atualizado')
  })

  await t.test('AC-2: list paginado com filtro de state', async () => {
    const items: QueueRow[] = Array.from({ length: 5 }, (_, i) => ({
      id: `q-${i}`,
      tenantId: TENANT,
      reconcileJobId: JOB,
      employeeId: `emp-${i}`,
      workplaceNameRaw: `Posto ${i}`,
      state: i < 3 ? 'PENDING' : 'RESOLVED',
      suggestions: null,
      resolvedToWorkplaceId: null,
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt: new Date(),
    }))
    const { prisma, allocationService } = makeMocks(items)
    const svc = new ReconcileQueueService(prisma, allocationService)
    const res = await svc.list({ tenantId: TENANT, state: 'PENDING', page: 1, pageSize: 10 })
    assert.strictEqual(res.total, 3)
    assert.strictEqual(res.items.length, 3)
  })

  await t.test('AC-4: resolve link chama upsertFromImport e marca RESOLVED', async () => {
    const { prisma, allocationService, state } = makeMocks([
      {
        id: 'q-1',
        tenantId: TENANT,
        reconcileJobId: JOB,
        employeeId: EMPLOYEE,
        workplaceNameRaw: 'INEP - Sede',
        state: 'PENDING',
        suggestions: null,
        resolvedToWorkplaceId: null,
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: new Date(),
      },
    ])
    const svc = new ReconcileQueueService(prisma, allocationService)
    const updated = await svc.resolve({
      id: 'q-1',
      tenantId: TENANT,
      operatorUserId: OPERATOR,
      action: 'link',
      workplaceId: WORKPLACE,
    })
    assert.strictEqual(updated.state, 'RESOLVED')
    assert.strictEqual(state.allocationCalls.length, 1)
    assert.strictEqual(state.allocationCalls[0].source, 'RECONCILE_QUEUE_RESOLVE')
    assert.strictEqual(state.auditLogs.length, 1)
    assert.strictEqual(state.auditLogs[0].action, 'RECONCILE_QUEUE_RESOLVE')
  })

  await t.test('AC-6: resolve defer transita state + audita', async () => {
    const { prisma, allocationService, state } = makeMocks([
      {
        id: 'q-1', tenantId: TENANT, reconcileJobId: JOB, employeeId: EMPLOYEE,
        workplaceNameRaw: 'X', state: 'PENDING', suggestions: null,
        resolvedToWorkplaceId: null, resolvedByUserId: null, resolvedAt: null,
        createdAt: new Date(),
      },
    ])
    const svc = new ReconcileQueueService(prisma, allocationService)
    const updated = await svc.resolve({
      id: 'q-1', tenantId: TENANT, operatorUserId: OPERATOR, action: 'defer',
    })
    assert.strictEqual(updated.state, 'DEFERRED')
    assert.strictEqual(state.allocationCalls.length, 0, 'defer não toca allocation')
    assert.strictEqual(state.auditLogs[0].action, 'RECONCILE_QUEUE_DEFER')
  })

  await t.test('AC-10: resolve em estado RESOLVED lança ReconcileQueueInvalidStateError', async () => {
    const { prisma, allocationService } = makeMocks([
      {
        id: 'q-1', tenantId: TENANT, reconcileJobId: JOB, employeeId: EMPLOYEE,
        workplaceNameRaw: 'X', state: 'RESOLVED', suggestions: null,
        resolvedToWorkplaceId: WORKPLACE, resolvedByUserId: OPERATOR, resolvedAt: new Date(),
        createdAt: new Date(),
      },
    ])
    const svc = new ReconcileQueueService(prisma, allocationService)
    await assert.rejects(
      () => svc.resolve({ id: 'q-1', tenantId: TENANT, operatorUserId: OPERATOR, action: 'defer' }),
      ReconcileQueueInvalidStateError,
    )
  })

  await t.test('AC-11: cross-tenant resolve retorna NotFoundError', async () => {
    const { prisma, allocationService } = makeMocks([
      {
        id: 'q-1', tenantId: TENANT, reconcileJobId: JOB, employeeId: EMPLOYEE,
        workplaceNameRaw: 'X', state: 'PENDING', suggestions: null,
        resolvedToWorkplaceId: null, resolvedByUserId: null, resolvedAt: null,
        createdAt: new Date(),
      },
    ])
    const svc = new ReconcileQueueService(prisma, allocationService)
    await assert.rejects(() =>
      svc.resolve({
        id: 'q-1',
        tenantId: '99999999-9999-9999-9999-999999999999', // outro tenant
        operatorUserId: OPERATOR,
        action: 'defer',
      }),
    )
  })
})
```

### Project Structure Notes

- Service em `src/modules/reconcile/reconcile-queue.service.ts` (substituir placeholder Story 1.1).
- Rota em `src/routes/api/v1/admin/workplace-reconcile-queue/index.ts` (subdir novo, autoload Fastify).
- Teste em `test/modules/reconcile/reconcile-queue.service.test.ts` (centralizado).

### References

- [Source: prd.md#FR13-FR19] — list, ações, AUDITOR read-only, purge LGPD, correção sem DELETE
- [Source: prd.md#NFR-SEC-1, NFR-SEC-5, NFR-SEC-7, NFR-COMP-3, NFR-COMP-4]
- [Source: architecture.md#D1] — schema queue
- [Source: architecture.md#Enforcement-Guidelines] — #1, #4
- [Source: epics.md#Story-1.4] — AC originais
- [Source: backend-api/src/plugins/auth-guard.ts] — RBAC helpers existentes
- [Source: backend-api/src/routes/api/v1/audit-logs/index.ts] — padrão de rota com filtros
- [Source: 1-2-workplace-allocation-service.md] — service consumido

### Commit Message (sugerida)

```
feat(reconcile): ReconcileQueueService + endpoints REST (Story 1.4)

- Implementa enqueue (idempotente via UNIQUE constraint), list paginado
  com filtros e resolve com 4 actions (link/create/defer/ignore).
- link e create chamam WorkplaceAllocationService.upsertFromImport
  com source='RECONCILE_QUEUE_RESOLVE'.
- create cria Workplace (importedBy='AUTO_USER_RESOLVE') + WorkplacePosition
  padrao (FR26).
- Erros tipados: ReconcileQueueInvalidStateError, ReconcileQueueNotFoundError.
- Endpoints: GET /v1/admin/workplace-reconcile-queue (ADMIN+AUDITOR+SUPER) e
  POST /:id/resolve (ADMIN+SUPERADMIN). AUDITOR recebe meta.readOnly=true.
- Envelope { data, error, meta } em todas as respostas.
- 7 testes em test/modules/reconcile/reconcile-queue.service.test.ts:
  enqueue novo, enqueue idempotente, list paginado/filtrado, resolve link,
  resolve defer, conflito de estado, cross-tenant.

Story: 1.4
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (EVO Master + dev-story workflow)

### Debug Log References

- `npx tsc --noEmit` (src) — **0 erros**.
- `npx tsc -p test/tsconfig.json --noEmit` — **6 erros pré-existentes** (sem regressão V3.3). Houve 2 erros transitórios no test mock por tipagem de `state.in`; resolvidos refatorando para `Record<string, unknown>` + cast condicional.

### Completion Notes List

**AC-1 ✅ enqueue idempotente** — find existente em PENDING/DEFERRED → update; senão create. Atualiza `workplaceNameRaw`, `suggestions`, `reconcileJobId` no caso de update.

**AC-2 ✅ list paginado** — `findMany` com skip/take + `count` em paralelo via `Promise.all`. Retorna `{ items, total, page, pageSize }`.

**AC-3 ✅ resolve valida tenant + estado** — busca por `(id, tenantId)`; lança `NotFoundError` ou `InvalidStateError`.

**AC-4 ✅ action link** — `ensureDefaultPosition` resolve `workplacePositionId` (cria padrão se workplace sem positions) → chama `upsertFromImport(source='RECONCILE_QUEUE_RESOLVE')` → atualiza state RESOLVED → AuditLog `RECONCILE_QUEUE_RESOLVE`.

**AC-5 ✅ action create** — cria Workplace (`importedBy='AUTO_USER_RESOLVE'`) + WorkplacePosition padrão + chama `upsertFromImport` + state RESOLVED + AuditLog.

**AC-6 ✅ action defer** — state DEFERRED, `resolvedAt=null`, `resolvedByUserId=null`, AuditLog `RECONCILE_QUEUE_DEFER`.

**AC-7 ✅ action ignore** — state IGNORED, `resolvedAt=now`, AuditLog `RECONCILE_QUEUE_IGNORE`.

**AC-8 ✅ GET endpoint** — `requireAuth` + check manual de role (USER → 403; ADMIN/AUDITOR/SUPERADMIN → 200). Envelope `{data, error, meta}` com `meta.readOnly = (role === 'AUDITOR')`.

**AC-9 ✅ POST resolve** — `requireAuth + requireAdmin` (AUDITOR → 403). Validações de body: `link` exige `workplaceId`; `create` exige `workplaceName`.

**AC-10 ✅ Conflito 409** — `InvalidStateError` mapeado para 409 com `code: 'RECONCILE_QUEUE_ITEM_INVALID_STATE'`.

**AC-11 ✅ Cross-tenant 404** — query `findFirst({ id, tenantId })` retorna null se tenantId não bate; lança `NotFoundError` mapeado para 404.

**AC-12 ✅ 8 testes** — enqueue novo, enqueue idempotente, list paginado/filtrado, resolve link, resolve create (Workplace+Position criados), resolve defer, conflito de estado, cross-tenant.

**AC-13 ✅ Sem regressão TS** — src 0 erros; suite 6 erros pré-existentes idênticos.

**Notas:** rota é registrada via autoload Fastify pelo path `routes/api/v1/admin/workplace-reconcile-queue/index.ts` → `/api/v1/admin/workplace-reconcile-queue` automaticamente.

### File List

**To be modified:**
- `backend-api/src/modules/reconcile/reconcile-queue.service.ts` (substituir placeholder)

**To be created:**
- `backend-api/src/routes/api/v1/admin/workplace-reconcile-queue/index.ts`
- `backend-api/test/modules/reconcile/reconcile-queue.service.test.ts`
