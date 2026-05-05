import test from 'node:test'
import assert from 'node:assert'
import { ReconcileRunner } from '../../../src/modules/reconcile/reconcile.runner'
import type { RunSingleOutcome } from '../../../src/modules/reconcile/reconcile.types'

const TENANT = '11111111-1111-1111-1111-111111111111'
const JOB = '33333333-3333-3333-3333-333333333333'
const OPERATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

interface JobRow {
  id: string
  tenantId: string
  status: string
  startedAt: Date | null
  completedAt: Date | null
  durationMs: number | null
  totalEmployees: number | null
  matched: number
  queued: number
  ignored: number
  errors: number
  failureReason: string | null
}

function makeMocks(opts: {
  employees: string[]
  outcomeFor: (id: string) => RunSingleOutcome | Error
}) {
  const job: JobRow = {
    id: JOB,
    tenantId: TENANT,
    status: 'RUNNING',
    startedAt: new Date(),
    completedAt: null,
    durationMs: null,
    totalEmployees: null,
    matched: 0,
    queued: 0,
    ignored: 0,
    errors: 0,
    failureReason: null,
  }
  const auditLogs: Array<{ action: string; resourceId: string; newDataStatus: string }> = []
  const runSingleCalls: string[] = []

  const prisma = {
    reconcileJob: {
      async findFirstOrThrow() {
        return { ...job }
      },
      async update({ data }: { data: Partial<JobRow> }) {
        Object.assign(job, data)
        return { ...job }
      },
    },
    employee: {
      async count() {
        return opts.employees.length
      },
      async findMany({
        take,
        cursor,
        skip,
      }: {
        take: number
        cursor?: { id: string }
        skip?: number
      }) {
        let startIdx = 0
        if (cursor) {
          const cursorIdx = opts.employees.indexOf(cursor.id)
          startIdx = cursorIdx + (skip ?? 0)
        }
        return opts.employees.slice(startIdx, startIdx + take).map((id) => ({ id }))
      },
    },
    auditLog: {
      async create({
        data,
      }: {
        data: { action: string; resourceId: string; newData: { status?: string } }
      }) {
        auditLogs.push({
          action: data.action,
          resourceId: data.resourceId,
          newDataStatus: data.newData?.status ?? '',
        })
        return data
      },
    },
  } as never

  const service = {
    async runSingle(input: { employeeId: string }): Promise<RunSingleOutcome> {
      runSingleCalls.push(input.employeeId)
      const r = opts.outcomeFor(input.employeeId)
      if (r instanceof Error) throw r
      return r
    },
  } as never

  return { prisma, service, state: { job, auditLogs, runSingleCalls } }
}

test('ReconcileRunner.run', async (t) => {
  await t.test(
    'AC-9: mix de outcomes acumula counters corretamente (matched=2, queued=1, ignored=1, errors=1)',
    async () => {
      const ids = ['e1', 'e2', 'e3', 'e4', 'e5']
      const { prisma, service, state } = makeMocks({
        employees: ids,
        outcomeFor: (id) => {
          if (id === 'e1') return { outcome: 'matched_deterministic', workplaceId: 'wp1', allocationKind: 'created' }
          if (id === 'e2') return { outcome: 'matched_deterministic', workplaceId: 'wp2', allocationKind: 'created' }
          if (id === 'e3') return { outcome: 'queued_ambiguous' }
          if (id === 'e4') return { outcome: 'no_legacy' }
          return new Error('boom on e5')
        },
      })
      const runner = new ReconcileRunner(prisma, service)
      await runner.run({ jobId: JOB, tenantId: TENANT, operatorUserId: OPERATOR })

      assert.strictEqual(state.runSingleCalls.length, 5)
      assert.strictEqual(state.job.matched, 2)
      assert.strictEqual(state.job.queued, 1)
      assert.strictEqual(state.job.ignored, 1)
      assert.strictEqual(state.job.errors, 1)
      assert.strictEqual(state.job.totalEmployees, 5)
    },
  )

  await t.test('AC-10: erro em um employee não para o batch (loop continua)', async () => {
    const ids = ['e1', 'e2', 'e3']
    const { prisma, service, state } = makeMocks({
      employees: ids,
      outcomeFor: (id) => {
        if (id === 'e2') return new Error('falha isolada')
        return { outcome: 'matched_deterministic', workplaceId: 'wp', allocationKind: 'created' }
      },
    })
    const runner = new ReconcileRunner(prisma, service)
    await runner.run({ jobId: JOB, tenantId: TENANT, operatorUserId: OPERATOR })

    assert.strictEqual(state.runSingleCalls.length, 3, 'todos foram visitados')
    assert.strictEqual(state.job.matched, 2)
    assert.strictEqual(state.job.errors, 1)
    assert.match(state.job.failureReason ?? '', /falha isolada/)
  })

  await t.test('AC-12: finaliza COMPLETED com durationMs > 0 e AuditLog gravado', async () => {
    const { prisma, service, state } = makeMocks({
      employees: ['e1'],
      outcomeFor: () => ({ outcome: 'matched_deterministic', workplaceId: 'wp', allocationKind: 'created' }),
    })
    const runner = new ReconcileRunner(prisma, service)
    await runner.run({ jobId: JOB, tenantId: TENANT, operatorUserId: OPERATOR })

    assert.strictEqual(state.job.status, 'COMPLETED')
    assert.notStrictEqual(state.job.completedAt, null)
    assert.ok((state.job.durationMs ?? -1) >= 0, 'durationMs preenchido')
    assert.strictEqual(state.auditLogs.length, 1)
    assert.strictEqual(state.auditLogs[0].action, 'V3.3_RECONCILE')
    assert.strictEqual(state.auditLogs[0].resourceId, JOB)
    assert.strictEqual(state.auditLogs[0].newDataStatus, 'COMPLETED')
  })

  await t.test('AC-11: totalEmployees é gravado após contagem inicial', async () => {
    const { prisma, service, state } = makeMocks({
      employees: ['e1', 'e2', 'e3', 'e4'],
      outcomeFor: () => ({ outcome: 'no_legacy' }),
    })
    const runner = new ReconcileRunner(prisma, service)
    await runner.run({ jobId: JOB, tenantId: TENANT, operatorUserId: OPERATOR })

    assert.strictEqual(state.job.totalEmployees, 4)
    assert.strictEqual(state.job.ignored, 4)
    assert.strictEqual(state.job.status, 'COMPLETED')
  })
})
