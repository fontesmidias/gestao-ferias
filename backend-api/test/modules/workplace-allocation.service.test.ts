import test from 'node:test'
import assert from 'node:assert'
import { Prisma } from '@prisma/client'
import { WorkplaceAllocationService } from '../../src/modules/workplaces/workplace-allocation.service'

const TENANT = '11111111-1111-1111-1111-111111111111'
const EMPLOYEE = '22222222-2222-2222-2222-222222222222'
const POSITION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const POSITION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OPERATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

interface AllocationRow {
  id: string
  tenantId: string
  employeeId: string
  workplacePositionId: string
  startDate: Date
  endDate: Date | null
  status: 'ACTIVE' | 'ENDED'
  createdAt: Date
  updatedAt: Date
}

interface AuditRow {
  action: string
  resourceId: string
  resourceType: string
  previousData: unknown
  newData: unknown
}

/**
 * Mock leve de PrismaClient. Mantém allocations + auditLogs em memória.
 * Suporta apenas os métodos usados pelo service em teste.
 */
function makePrismaMock(opts: {
  initialAllocations?: AllocationRow[]
} = {}) {
  const allocations: AllocationRow[] = opts.initialAllocations ?? []
  const auditLogs: AuditRow[] = []

  const tx = {
    workplaceAllocation: {
      async findFirst({ where }: { where: Partial<AllocationRow> }) {
        return (
          allocations.find(
            (a) =>
              (where.tenantId === undefined || a.tenantId === where.tenantId) &&
              (where.employeeId === undefined || a.employeeId === where.employeeId) &&
              (where.status === undefined || a.status === where.status) &&
              (where.workplacePositionId === undefined ||
                a.workplacePositionId === where.workplacePositionId),
          ) ?? null
        )
      },
      async create({
        data,
      }: {
        data: Omit<AllocationRow, 'id' | 'createdAt' | 'updatedAt' | 'endDate'> & {
          endDate?: Date | null
        }
      }) {
        const row: AllocationRow = {
          id: `alloc-${allocations.length + 1}`,
          tenantId: data.tenantId,
          employeeId: data.employeeId,
          workplacePositionId: data.workplacePositionId,
          startDate: data.startDate,
          endDate: data.endDate ?? null,
          status: data.status as 'ACTIVE' | 'ENDED',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        allocations.push(row)
        return row
      },
      async update({
        where,
        data,
      }: {
        where: { id: string }
        data: Partial<AllocationRow>
      }) {
        const idx = allocations.findIndex((a) => a.id === where.id)
        if (idx < 0) throw new Error(`alloc not found: ${where.id}`)
        const updated = { ...allocations[idx], ...data, updatedAt: new Date() }
        allocations[idx] = updated
        return updated
      },
    },
    auditLog: {
      async create({ data }: { data: AuditRow }) {
        auditLogs.push({
          action: data.action,
          resourceId: data.resourceId,
          resourceType: data.resourceType,
          previousData: data.previousData,
          newData: data.newData,
        })
        return data
      },
    },
  }

  const prisma = {
    ...tx,
    async $transaction<T>(fn: (txClient: typeof tx) => Promise<T>): Promise<T> {
      return fn(tx)
    },
  }

  return {
    prisma: prisma as never,
    state: {
      get allocations() {
        return allocations
      },
      get auditLogs() {
        return auditLogs
      },
    },
  }
}

test('WorkplaceAllocationService.upsertFromImport()', async (t) => {
  await t.test('AC-2: created — sem allocation existente cria nova', async () => {
    const { prisma, state } = makePrismaMock()
    const svc = new WorkplaceAllocationService(prisma)

    const result = await svc.upsertFromImport({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      operatorUserId: OPERATOR,
      workplacePositionId: POSITION_A,
      startDate: new Date('2024-01-15'),
      source: 'V3.3_RECONCILE',
    })

    assert.strictEqual(result.kind, 'created')
    assert.strictEqual(state.allocations.length, 1)
    assert.strictEqual(state.allocations[0].status, 'ACTIVE')
    assert.strictEqual(state.allocations[0].workplacePositionId, POSITION_A)
    assert.strictEqual(state.auditLogs.length, 1)
    assert.strictEqual(state.auditLogs[0].action, 'V3.3_RECONCILE')
    assert.strictEqual(state.auditLogs[0].resourceType, 'WORKPLACE_ALLOCATION')
  })

  await t.test('AC-3: noop mesma posição — não cria nem audita', async () => {
    const existing: AllocationRow = {
      id: 'alloc-pre',
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      workplacePositionId: POSITION_A,
      startDate: new Date('2024-01-01'),
      endDate: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { prisma, state } = makePrismaMock({ initialAllocations: [existing] })
    const svc = new WorkplaceAllocationService(prisma)

    const result = await svc.upsertFromImport({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      operatorUserId: OPERATOR,
      workplacePositionId: POSITION_A,
      startDate: new Date('2024-02-01'),
      source: 'V3.3_RECONCILE',
    })

    assert.strictEqual(result.kind, 'noop')
    assert.strictEqual(result.allocationId, 'alloc-pre')
    assert.strictEqual(state.allocations.length, 1, 'no new allocation')
    assert.strictEqual(state.auditLogs.length, 0, 'no audit on noop')
  })

  await t.test(
    'AC-4: replaced posição diferente — encerra anterior + cria nova + audita',
    async () => {
      const existing: AllocationRow = {
        id: 'alloc-pre',
        tenantId: TENANT,
        employeeId: EMPLOYEE,
        workplacePositionId: POSITION_A,
        startDate: new Date('2024-01-01'),
        endDate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const { prisma, state } = makePrismaMock({ initialAllocations: [existing] })
      const svc = new WorkplaceAllocationService(prisma)

      const result = await svc.upsertFromImport({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
        operatorUserId: OPERATOR,
        workplacePositionId: POSITION_B,
        startDate: new Date('2024-03-01'),
        source: 'IMPORT_TIRVU_ALLOCATE',
      })

      assert.strictEqual(result.kind, 'replaced')
      if (result.kind === 'replaced') {
        assert.strictEqual(result.previousAllocationId, 'alloc-pre')
      }
      assert.strictEqual(state.allocations.length, 2)
      assert.strictEqual(state.allocations[0].status, 'ENDED', 'previous ended')
      assert.notStrictEqual(state.allocations[0].endDate, null)
      assert.strictEqual(state.allocations[1].status, 'ACTIVE', 'new active')
      assert.strictEqual(state.auditLogs.length, 1)
      assert.strictEqual(state.auditLogs[0].action, 'IMPORT_TIRVU_ALLOCATE')
    },
  )

  await t.test('AC-5: audit registrado em created com previousData null', async () => {
    const { prisma, state } = makePrismaMock()
    const svc = new WorkplaceAllocationService(prisma)

    await svc.upsertFromImport({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      operatorUserId: OPERATOR,
      workplacePositionId: POSITION_A,
      startDate: new Date(),
      source: 'V3.3_RECONCILE',
    })

    assert.strictEqual(state.auditLogs.length, 1)
    assert.strictEqual(state.auditLogs[0].previousData, null)
    assert.notStrictEqual(state.auditLogs[0].newData, null)
  })

  await t.test('idempotência: 3× re-execuções produzem mesmo estado', async () => {
    const { prisma, state } = makePrismaMock()
    const svc = new WorkplaceAllocationService(prisma)

    const input = {
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      operatorUserId: OPERATOR,
      workplacePositionId: POSITION_A,
      startDate: new Date('2024-01-15'),
      source: 'V3.3_RECONCILE',
    }

    const r1 = await svc.upsertFromImport(input)
    const r2 = await svc.upsertFromImport(input)
    const r3 = await svc.upsertFromImport(input)

    assert.strictEqual(r1.kind, 'created')
    assert.strictEqual(r2.kind, 'noop')
    assert.strictEqual(r3.kind, 'noop')
    assert.strictEqual(state.allocations.length, 1, 'only one allocation across 3 calls')
    assert.strictEqual(state.auditLogs.length, 1, 'only one audit log across 3 calls')
  })

  await t.test('AC-7: P2002 em create é tratado como noop', async () => {
    const racedAllocation: AllocationRow = {
      id: 'alloc-raced',
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      workplacePositionId: POSITION_A,
      startDate: new Date(),
      endDate: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    let findFirstCalls = 0
    const auditLogs: AuditRow[] = []
    const txMock = {
      workplaceAllocation: {
        async findFirst() {
          findFirstCalls++
          if (findFirstCalls === 1) return null // primeira chamada (branch detection)
          return racedAllocation // segunda chamada (catch P2002)
        },
        async create() {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed',
            {
              code: 'P2002',
              clientVersion: 'test',
            },
          )
        },
        async update(): Promise<AllocationRow> {
          throw new Error('update should not be called in this scenario')
        },
      },
      auditLog: {
        async create({ data }: { data: AuditRow }) {
          auditLogs.push(data)
          return data
        },
      },
    }
    const prismaMock = {
      ...txMock,
      async $transaction<T>(fn: (tx: typeof txMock) => Promise<T>): Promise<T> {
        return fn(txMock)
      },
    } as never

    const svc = new WorkplaceAllocationService(prismaMock)
    const result = await svc.upsertFromImport({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      operatorUserId: OPERATOR,
      workplacePositionId: POSITION_A,
      startDate: new Date(),
      source: 'V3.3_RECONCILE',
    })

    assert.strictEqual(result.kind, 'noop')
    assert.strictEqual(result.allocationId, 'alloc-raced')
    assert.strictEqual(auditLogs.length, 0, 'no audit on noop after P2002')
    assert.strictEqual(findFirstCalls, 2, 'findFirst called twice (initial + catch)')
  })
})
