import test from 'node:test'
import assert from 'node:assert'
import {
  ReconcileQueueService,
  ReconcileQueueInvalidStateError,
  ReconcileQueueNotFoundError,
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

  const allocationService = {
    async upsertFromImport(input: {
      workplacePositionId: string
      source: string
    }) {
      allocationCalls.push({
        source: input.source,
        positionId: input.workplacePositionId,
      })
      return {
        kind: 'created' as const,
        allocationId: `alloc-${allocationCalls.length}`,
      }
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
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return (
          queue.find((q) => {
            if (where.tenantId && q.tenantId !== where.tenantId) return false
            if (where.employeeId && q.employeeId !== where.employeeId) return false
            if (where.id && q.id !== where.id) return false
            if (where.state) {
              if (typeof where.state === 'string') return q.state === where.state
              if (typeof where.state === 'object') {
                const stateFilter = where.state as { in?: string[] }
                if (Array.isArray(stateFilter.in)) {
                  return stateFilter.in.includes(q.state)
                }
              }
            }
            return true
          }) ?? null
        )
      },
      async findMany({
        where,
        skip = 0,
        take = 20,
      }: {
        where: Partial<QueueRow>
        skip?: number
        take?: number
      }) {
        return queue
          .filter(
            (q) =>
              (!where.tenantId || q.tenantId === where.tenantId) &&
              (!where.state || q.state === where.state) &&
              (!where.reconcileJobId || q.reconcileJobId === where.reconcileJobId),
          )
          .slice(skip, skip + take)
      },
      async count({ where }: { where: Partial<QueueRow> }) {
        return queue.filter(
          (q) =>
            (!where.tenantId || q.tenantId === where.tenantId) &&
            (!where.state || q.state === where.state),
        ).length
      },
      async create({
        data,
      }: {
        data: Omit<
          QueueRow,
          'id' | 'createdAt' | 'resolvedToWorkplaceId' | 'resolvedByUserId' | 'resolvedAt'
        >
      }) {
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
      async update({
        where,
        data,
      }: {
        where: { id: string }
        data: Partial<QueueRow>
      }) {
        const idx = queue.findIndex((q) => q.id === where.id)
        if (idx < 0) throw new Error('not found')
        queue[idx] = { ...queue[idx], ...data }
        return queue[idx]
      },
    },
    workplacePosition: {
      async findFirst({
        where,
      }: {
        where: { tenantId: string; workplaceId: string }
      }) {
        return (
          positions.find(
            (p) => p.tenantId === where.tenantId && p.workplaceId === where.workplaceId,
          ) ?? null
        )
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

  await t.test('AC-1: enqueue idempotente — atualiza item existente', async () => {
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
    const res = await svc.list({
      tenantId: TENANT,
      state: 'PENDING',
      page: 1,
      pageSize: 10,
    })
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

  await t.test('AC-5: resolve create cria Workplace + Position + alocação', async () => {
    const { prisma, allocationService, state } = makeMocks([
      {
        id: 'q-1',
        tenantId: TENANT,
        reconcileJobId: JOB,
        employeeId: EMPLOYEE,
        workplaceNameRaw: 'NOVO POSTO',
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
      action: 'create',
      workplaceName: 'NOVO POSTO',
    })
    assert.strictEqual(updated.state, 'RESOLVED')
    assert.strictEqual(state.workplaces.length, 1)
    assert.strictEqual(state.workplaces[0].name, 'NOVO POSTO')
    // 1 position pré-existente do POSITION + 1 nova criada para o novo workplace
    assert.strictEqual(state.positions.length, 2)
    assert.strictEqual(state.allocationCalls.length, 1)
  })

  await t.test('AC-6: resolve defer transita state + audita', async () => {
    const { prisma, allocationService, state } = makeMocks([
      {
        id: 'q-1',
        tenantId: TENANT,
        reconcileJobId: JOB,
        employeeId: EMPLOYEE,
        workplaceNameRaw: 'X',
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
      action: 'defer',
    })
    assert.strictEqual(updated.state, 'DEFERRED')
    assert.strictEqual(state.allocationCalls.length, 0, 'defer não toca allocation')
    assert.strictEqual(state.auditLogs[0].action, 'RECONCILE_QUEUE_DEFER')
  })

  await t.test('AC-10: resolve em estado RESOLVED lança InvalidStateError', async () => {
    const { prisma, allocationService } = makeMocks([
      {
        id: 'q-1',
        tenantId: TENANT,
        reconcileJobId: JOB,
        employeeId: EMPLOYEE,
        workplaceNameRaw: 'X',
        state: 'RESOLVED',
        suggestions: null,
        resolvedToWorkplaceId: WORKPLACE,
        resolvedByUserId: OPERATOR,
        resolvedAt: new Date(),
        createdAt: new Date(),
      },
    ])
    const svc = new ReconcileQueueService(prisma, allocationService)
    await assert.rejects(
      () =>
        svc.resolve({
          id: 'q-1',
          tenantId: TENANT,
          operatorUserId: OPERATOR,
          action: 'defer',
        }),
      ReconcileQueueInvalidStateError,
    )
  })

  await t.test('AC-11: cross-tenant resolve lança NotFoundError', async () => {
    const { prisma, allocationService } = makeMocks([
      {
        id: 'q-1',
        tenantId: TENANT,
        reconcileJobId: JOB,
        employeeId: EMPLOYEE,
        workplaceNameRaw: 'X',
        state: 'PENDING',
        suggestions: null,
        resolvedToWorkplaceId: null,
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: new Date(),
      },
    ])
    const svc = new ReconcileQueueService(prisma, allocationService)
    await assert.rejects(
      () =>
        svc.resolve({
          id: 'q-1',
          tenantId: '99999999-9999-9999-9999-999999999999',
          operatorUserId: OPERATOR,
          action: 'defer',
        }),
      ReconcileQueueNotFoundError,
    )
  })
})
