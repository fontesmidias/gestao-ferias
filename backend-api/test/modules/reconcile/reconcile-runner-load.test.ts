import test from 'node:test'
import assert from 'node:assert'
import { ReconcileRunner } from '../../../src/modules/reconcile/reconcile.runner'
import type { RunSingleOutcome } from '../../../src/modules/reconcile/reconcile.types'

const TENANT = '11111111-1111-1111-1111-111111111111'
const JOB = '33333333-3333-3333-3333-333333333333'
const OPERATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const N = 1000

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

function outcomeFor(id: string): RunSingleOutcome | Error {
  const i = Number(id.split('-')[1])
  const m = i % 20
  if (m < 12) return { outcome: 'matched_deterministic', workplaceId: 'wp', allocationKind: 'created' }
  if (m < 16) return { outcome: 'queued_ambiguous' }
  if (m < 18) return { outcome: 'queued_no_match' }
  if (m < 19) return { outcome: 'no_legacy' }
  return new Error('synthetic-fail')
}

function makeMocks() {
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
  const employees = Array.from({ length: N }, (_, i) => ({ id: `emp-${i}` }))
  let runSingleCount = 0

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
        return employees.length
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
          const cursorIdx = employees.findIndex((e) => e.id === cursor.id)
          startIdx = cursorIdx + (skip ?? 0)
        }
        return employees.slice(startIdx, startIdx + take)
      },
    },
    auditLog: {
      async create({ data }: { data: unknown }) {
        return data
      },
    },
  } as never

  const service = {
    async runSingle(input: { employeeId: string }): Promise<RunSingleOutcome> {
      runSingleCount++
      const r = outcomeFor(input.employeeId)
      if (r instanceof Error) throw r
      return r
    },
  } as never

  return { prisma, service, state: { job, get runSingleCount() { return runSingleCount } } }
}

test('Story 3.3 — load test: 1000 employees em ≤60s com counters corretos', async () => {
  const { prisma, service, state } = makeMocks()
  const runner = new ReconcileRunner(prisma, service)

  const start = Date.now()
  await runner.run({ jobId: JOB, tenantId: TENANT, operatorUserId: OPERATOR })
  const duration = Date.now() - start

  assert.strictEqual(state.runSingleCount, N, 'todos os 1000 employees foram processados')
  // Mix esperado para N=1000 com módulo 20 (50 ciclos):
  // matched: 12/20 * 1000 = 600
  // queued: (4+2)/20 * 1000 = 300
  // ignored (no_legacy): 1/20 * 1000 = 50
  // errors: 1/20 * 1000 = 50
  assert.strictEqual(state.job.matched, 600, 'matched=600')
  assert.strictEqual(state.job.queued, 300, 'queued=300')
  assert.strictEqual(state.job.ignored, 50, 'ignored=50')
  assert.strictEqual(state.job.errors, 50, 'errors=50')
  assert.strictEqual(state.job.totalEmployees, N)
  assert.strictEqual(state.job.status, 'COMPLETED', 'erros individuais não derrubam o batch (NFR-REL-2)')
  assert.ok(duration < 60_000, `duração ${duration}ms deve ser <60s (NFR-PERF-2 com margem CI)`)
})
