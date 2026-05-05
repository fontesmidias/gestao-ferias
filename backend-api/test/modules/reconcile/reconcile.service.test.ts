import test from 'node:test'
import assert from 'node:assert'
import {
  ReconcileService,
  ReconcileEmployeeNotFoundError,
} from '../../../src/modules/reconcile/reconcile.service'
import type { MatchResult, Suggestion } from '../../../src/modules/reconcile/reconcile.types'

const TENANT = '11111111-1111-1111-1111-111111111111'
const EMPLOYEE = '22222222-2222-2222-2222-222222222222'
const JOB = '33333333-3333-3333-3333-333333333333'
const OPERATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const WORKPLACE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const POSITION = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

interface EmployeeRow {
  id: string
  tenantId: string
  workplace: string | null
  workplaceId: string | null
  hireDate: Date
  status: string
}

function makeMocks(opts: {
  employee?: Partial<EmployeeRow> | null
  matchResult?: MatchResult
  suggestions?: Suggestion[]
  hasPosition?: boolean
}) {
  const employee: EmployeeRow | null =
    opts.employee === null
      ? null
      : {
          id: EMPLOYEE,
          tenantId: TENANT,
          workplace: 'INEP - Sede',
          workplaceId: null,
          hireDate: new Date('2024-01-15'),
          status: 'ATIVO',
          ...(opts.employee ?? {}),
        }

  const calls = {
    enqueueCalls: [] as Array<{ workplaceNameRaw: string; suggestions: unknown }>,
    upsertCalls: [] as Array<{ source: string; positionId: string }>,
    employeeUpdates: [] as Array<{ workplaceId: string }>,
  }

  const prisma = {
    employee: {
      async findFirst() {
        return employee
      },
      async update({ data }: { data: { workplaceId?: string } }) {
        if (data.workplaceId) calls.employeeUpdates.push({ workplaceId: data.workplaceId })
        return employee
      },
    },
    workplacePosition: {
      async findFirst() {
        return opts.hasPosition === false
          ? null
          : { id: POSITION, tenantId: TENANT, workplaceId: WORKPLACE }
      },
      async create({ data }: { data: { workplaceId: string } }) {
        return { id: POSITION, tenantId: TENANT, workplaceId: data.workplaceId }
      },
    },
  } as never

  const allocationService = {
    async upsertFromImport(input: { workplacePositionId: string; source: string }) {
      calls.upsertCalls.push({ source: input.source, positionId: input.workplacePositionId })
      return { kind: 'created' as const, allocationId: 'alloc-1' }
    },
  } as never

  const queueService = {
    async enqueue(input: { workplaceNameRaw: string; suggestions: unknown }) {
      calls.enqueueCalls.push({
        workplaceNameRaw: input.workplaceNameRaw,
        suggestions: input.suggestions,
      })
      return { id: 'q-1' } as never
    },
  } as never

  const deterministic = {
    async match(): Promise<MatchResult> {
      return opts.matchResult ?? { kind: 'none' }
    },
  } as never

  const fuzzy = {
    async suggest(): Promise<Suggestion[]> {
      return opts.suggestions ?? []
    },
  } as never

  const svc = new ReconcileService(prisma, allocationService, queueService, deterministic, fuzzy)
  return { svc, calls }
}

test('ReconcileService.runSingle', async (t) => {
  await t.test('AC-2: skipped quando workplaceId já set', async () => {
    const { svc, calls } = makeMocks({
      employee: { workplaceId: WORKPLACE },
    })
    const r = await svc.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.deepStrictEqual(r, { outcome: 'skipped' })
    assert.strictEqual(calls.upsertCalls.length, 0)
    assert.strictEqual(calls.enqueueCalls.length, 0)
  })

  await t.test('AC-3: no_legacy quando workplace null/empty', async () => {
    const { svc } = makeMocks({ employee: { workplace: null } })
    const r = await svc.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.deepStrictEqual(r, { outcome: 'no_legacy' })

    const { svc: svc2 } = makeMocks({ employee: { workplace: '   ' } })
    const r2 = await svc2.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.deepStrictEqual(r2, { outcome: 'no_legacy' })
  })

  await t.test('AC-4: skipped_inactive quando status=INATIVO', async () => {
    const { svc } = makeMocks({ employee: { status: 'INATIVO' } })
    const r = await svc.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.deepStrictEqual(r, { outcome: 'skipped_inactive' })
  })

  await t.test('AC-5: matched_deterministic chama upsert + atualiza employee.workplaceId', async () => {
    const { svc, calls } = makeMocks({
      matchResult: { kind: 'unique', workplace: { id: WORKPLACE, name: 'INEP - Sede' } },
    })
    const r = await svc.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.strictEqual(r.outcome, 'matched_deterministic')
    if (r.outcome === 'matched_deterministic') {
      assert.strictEqual(r.workplaceId, WORKPLACE)
      assert.strictEqual(r.allocationKind, 'created')
    }
    assert.strictEqual(calls.upsertCalls.length, 1)
    assert.strictEqual(calls.upsertCalls[0].source, 'V3.3_RECONCILE')
    assert.strictEqual(calls.employeeUpdates.length, 1)
    assert.strictEqual(calls.employeeUpdates[0].workplaceId, WORKPLACE)
    assert.strictEqual(calls.enqueueCalls.length, 0)
  })

  await t.test('AC-6: queued_ambiguous chama fuzzy + enqueue com sugestões', async () => {
    const { svc, calls } = makeMocks({
      matchResult: {
        kind: 'ambiguous',
        candidates: [
          { id: 'wp-a', name: 'INEP A' },
          { id: 'wp-b', name: 'INEP B' },
        ],
      },
      suggestions: [{ id: 'wp-a', name: 'INEP A', score: 0.9 }],
    })
    const r = await svc.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.deepStrictEqual(r, { outcome: 'queued_ambiguous' })
    assert.strictEqual(calls.upsertCalls.length, 0)
    assert.strictEqual(calls.enqueueCalls.length, 1)
    assert.deepStrictEqual(calls.enqueueCalls[0].suggestions, [
      { id: 'wp-a', name: 'INEP A', score: 0.9 },
    ])
  })

  await t.test('AC-7: queued_low_confidence quando none + top score >= 0.7', async () => {
    const { svc, calls } = makeMocks({
      matchResult: { kind: 'none' },
      suggestions: [{ id: 'wp-x', name: 'Algo Parecido', score: 0.85 }],
    })
    const r = await svc.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.deepStrictEqual(r, { outcome: 'queued_low_confidence' })
    assert.strictEqual(calls.enqueueCalls.length, 1)
    assert.deepStrictEqual(calls.enqueueCalls[0].suggestions, [
      { id: 'wp-x', name: 'Algo Parecido', score: 0.85 },
    ])
  })

  await t.test('AC-7: queued_no_match quando none + score < 0.7 (suggestions=[])', async () => {
    const { svc, calls } = makeMocks({
      matchResult: { kind: 'none' },
      suggestions: [{ id: 'wp-x', name: 'Algo Distante', score: 0.4 }],
    })
    const r = await svc.runSingle({
      tenantId: TENANT, employeeId: EMPLOYEE, reconcileJobId: JOB, operatorUserId: OPERATOR,
    })
    assert.deepStrictEqual(r, { outcome: 'queued_no_match' })
    assert.strictEqual(calls.enqueueCalls.length, 1)
    assert.deepStrictEqual(calls.enqueueCalls[0].suggestions, [])
  })

  await t.test('AC-1: lança ReconcileEmployeeNotFoundError quando employee não existe', async () => {
    const { svc } = makeMocks({ employee: null })
    await assert.rejects(
      () =>
        svc.runSingle({
          tenantId: TENANT,
          employeeId: EMPLOYEE,
          reconcileJobId: JOB,
          operatorUserId: OPERATOR,
        }),
      ReconcileEmployeeNotFoundError,
    )
  })
})
