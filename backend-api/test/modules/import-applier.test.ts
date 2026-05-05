import test from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

// encryption module exige env antes do import
process.env.BANK_DATA_ENCRYPTION_KEY ??= '5JtP44Gz4XwhPUi0NCxOOeqgdZtZ18FrQsXkuiXYvwg='

const applier = require('../../src/modules/imports/import-applier') as typeof import('../../src/modules/imports/import-applier')
import type { ApplyContext, ApplyItem, ApplyOptions } from '../../src/modules/imports/import-applier'
import type { Employee, TirvuRow } from '../../src/modules/imports/types'

interface TxCalls {
  employeeCreates: { id: string; data: Record<string, unknown> }[]
  employeeUpdates: { id: string; data: Record<string, unknown> }[]
  workplaceCreates: { id: string; data: Record<string, unknown> }[]
  workplacePositionCreates: { id: string; data: Record<string, unknown> }[]
  workplaceAllocations: { id: string; data: Record<string, unknown> }[]
  workplaceAllocationUpdates: { id: string; data: Record<string, unknown> }[]
  auditLogs: Record<string, unknown>[]
}

function makeMockTx(opts: {
  existingWorkplaces?: Array<{ id: string; name: string; createdAt: Date }>
  existingPositions?: Array<{ id: string; tenantId: string; workplaceId: string; createdAt: Date }>
  existingAllocations?: Array<{
    id: string
    tenantId: string
    employeeId: string
    workplacePositionId: string
    status: string
  }>
} = {}) {
  const calls: TxCalls = {
    employeeCreates: [],
    employeeUpdates: [],
    workplaceCreates: [],
    workplacePositionCreates: [],
    workplaceAllocations: [],
    workplaceAllocationUpdates: [],
    auditLogs: [],
  }
  const workplaces = [...(opts.existingWorkplaces ?? [])]
  const positions = [...(opts.existingPositions ?? [])]
  const allocations = [...(opts.existingAllocations ?? [])]

  const tx = {
    employee: {
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        calls.employeeCreates.push({ id, data })
        return { id, ...data }
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        calls.employeeUpdates.push({ id, data })
        return { id, ...data }
      },
    },
    workplace: {
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        const row = { id, name: data.name as string, createdAt: new Date() }
        workplaces.push(row)
        calls.workplaceCreates.push({ id, data })
        return { id, ...data }
      },
      async findMany({
        where,
      }: {
        where: { tenantId: string; name?: { equals: string; mode?: string } }
      }) {
        return workplaces.filter((w) => {
          if (where.name?.equals) {
            return w.name.toLowerCase() === where.name.equals.toLowerCase()
          }
          return true
        })
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
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        const row = {
          id,
          tenantId: data.tenantId as string,
          workplaceId: data.workplaceId as string,
          createdAt: new Date(),
        }
        positions.push(row)
        calls.workplacePositionCreates.push({ id, data })
        return { id, ...data }
      },
    },
    workplaceAllocation: {
      async findFirst({
        where,
      }: {
        where: {
          tenantId: string
          employeeId: string
          status?: string
          workplacePositionId?: string
        }
      }) {
        return (
          allocations.find(
            (a) =>
              a.tenantId === where.tenantId &&
              a.employeeId === where.employeeId &&
              (!where.status || a.status === where.status) &&
              (!where.workplacePositionId ||
                a.workplacePositionId === where.workplacePositionId),
          ) ?? null
        )
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        const row = {
          id,
          tenantId: data.tenantId as string,
          employeeId: data.employeeId as string,
          workplacePositionId: data.workplacePositionId as string,
          status: (data.status as string) ?? 'ACTIVE',
        }
        allocations.push(row)
        calls.workplaceAllocations.push({ id, data })
        return { id, ...data }
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        const idx = allocations.findIndex((a) => a.id === id)
        if (idx >= 0) {
          allocations[idx] = { ...allocations[idx], status: (data.status as string) ?? allocations[idx].status }
        }
        calls.workplaceAllocationUpdates.push({ id, data })
        return { id, ...data }
      },
    },
    auditLog: {
      async create({ data }: { data: Record<string, unknown> }) {
        calls.auditLogs.push(data)
        return { id: randomUUID(), ...data }
      },
    },
  }
  // Fake allocationService: usa o mesmo tx (já que upsertFromImport aceita tx).
  const allocationService = {
    async upsertFromImport(input: Record<string, unknown>) {
      // Reproduz comportamento simplificado: cria nova allocation se não existe
      // ACTIVE para o employee; em transição, encerra e cria nova.
      const txAny = tx as never as {
        workplaceAllocation: {
          findFirst: (a: {
            where: {
              tenantId: string
              employeeId: string
              status?: string
            }
          }) => Promise<{ id: string; workplacePositionId: string } | null>
          create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }>
          update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }>
        }
        auditLog: { create: (a: { data: Record<string, unknown> }) => Promise<unknown> }
      }
      const existing = await txAny.workplaceAllocation.findFirst({
        where: {
          tenantId: input.tenantId as string,
          employeeId: input.employeeId as string,
          status: 'ACTIVE',
        },
      })
      if (existing && existing.workplacePositionId === input.workplacePositionId) {
        return { kind: 'noop' as const, allocationId: existing.id }
      }
      if (existing && existing.workplacePositionId !== input.workplacePositionId) {
        await txAny.workplaceAllocation.update({
          where: { id: existing.id },
          data: { status: 'ENDED', endDate: new Date() },
        })
        const created = await txAny.workplaceAllocation.create({
          data: {
            tenantId: input.tenantId,
            employeeId: input.employeeId,
            workplacePositionId: input.workplacePositionId,
            startDate: input.startDate,
            status: 'ACTIVE',
          },
        })
        await txAny.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: input.operatorUserId,
            action: input.source,
            resourceType: 'WORKPLACE_ALLOCATION',
            resourceId: created.id,
          },
        })
        return { kind: 'replaced' as const, allocationId: created.id, previousAllocationId: existing.id }
      }
      const created = await txAny.workplaceAllocation.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          workplacePositionId: input.workplacePositionId,
          startDate: input.startDate,
          status: 'ACTIVE',
        },
      })
      await txAny.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.operatorUserId,
          action: input.source,
          resourceType: 'WORKPLACE_ALLOCATION',
          resourceId: created.id,
        },
      })
      return { kind: 'created' as const, allocationId: created.id }
    },
  }
  return { tx: tx as never, calls, allocationService: allocationService as never }
}

const TENANT = randomUUID()
const JOB_ID = randomUUID()
const USER_ID = randomUUID()

const optsAll: ApplyOptions = {
  createWorkplaces: ['ANATEL'],
  markAbsentAsPending: true,
  reactivateAll: true,
}
const optsConservative: ApplyOptions = {
  createWorkplaces: [],
  markAbsentAsPending: false,
  reactivateAll: false,
}

const ctx = (
  options: ApplyOptions,
  allocationService: unknown = { upsertFromImport: async () => ({ kind: 'noop', allocationId: 'a' }) },
): ApplyContext => ({
  tenantId: TENANT,
  jobId: JOB_ID,
  userId: USER_ID,
  options,
  allocationService: allocationService as never,
})

function makeRow(o: Partial<TirvuRow> = {}): TirvuRow {
  return {
    rowIndex: 1,
    rawRowIndex: 1,
    tirvuId: '1001',
    cpf: '03670788131',
    name: 'Fulano',
    matricula: null,
    sexo: null,
    nascimento: null,
    email: null,
    telefone: null,
    pcd: null,
    deficiencia: null,
    nomePai: null,
    nomeMae: null,
    rgNumero: null,
    rgOrgao: null,
    rgDataEmissao: null,
    pisPasep: null,
    ctpsNumero: null,
    ctpsSerie: null,
    status: 'ATIVO',
    empresa: 'GH',
    lotacao: 'ANATEL',
    admissao: new Date(Date.UTC(2024, 0, 15)),
    demissao: null,
    cargo: 'Aux',
    jornada: '12x36',
    inicioJornada: null,
    sindicato: null,
    foraDaCerca: null,
    semGeo: null,
    cep: null,
    endereco: null,
    enderecoNumero: null,
    enderecoComplemento: null,
    enderecoBairro: null,
    enderecoUf: null,
    enderecoCidade: null,
    salario: 1500,
    salarioComplemento: null,
    salarioExtra: null,
    tipoPix: null,
    chavePix: null,
    banco: null,
    tipoConta: null,
    agencia: null,
    conta: null,
    dataLog: null,
    ...o,
  }
}

function makeEmp(o: Partial<Employee> = {}): Employee {
  const now = new Date()
  return {
    id: 'emp-1',
    name: 'Fulano',
    cpf: '03670788131',
    registration: null,
    birthDate: null,
    position: 'Aux',
    employeeType: 'EFETIVO',
    isFerista: false,
    status: 'ATIVO',
    branch: 'GH',
    department: null,
    workplace: 'ANATEL',
    workplaceId: null,
    shift: '12x36',
    phone: null,
    salary: 1500 as unknown as Employee['salary'],
    hireDate: new Date(Date.UTC(2024, 0, 15)),
    balanceOffset: 0,
    userId: null,
    tenantId: TENANT,
    tirvuId: '1001',
    personalData: null,
    address: null,
    bankDataEnc: null,
    bankDataIv: null,
    bankDataTag: null,
    unionName: null,
    geofencingFlags: null,
    inactivePending: false,
    terminationDate: null,
    createdAt: now,
    updatedAt: now,
    ...o,
  }
}

test('applyCreate sem bankData → bankDataEnc null', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = {
    kind: 'create',
    row: makeRow(),
    patch: { name: 'Fulano', hireDate: new Date(Date.UTC(2024, 0, 15)) } as never,
  }
  await applier.applyItem(tx, item, ctx(optsConservative))

  assert.strictEqual(calls.employeeCreates.length, 1)
  const created = calls.employeeCreates[0].data
  assert.strictEqual(created.tenantId, TENANT)
  assert.strictEqual(created.cpf, '03670788131')
  assert.strictEqual(created.bankDataEnc, undefined)

  assert.strictEqual(calls.auditLogs.length, 1)
  assert.strictEqual(calls.auditLogs[0].action, 'EMPLOYEE_IMPORT_CREATE')
  const newData = calls.auditLogs[0].newData as { hasBankData: boolean }
  assert.strictEqual(newData.hasBankData, false)
})

test('applyCreate com bankData → encripta e oculta cleartext', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = {
    kind: 'create',
    row: makeRow({ tipoPix: 'CPF', chavePix: '03670788131', banco: '001' }),
    patch: { name: 'Fulano', hireDate: new Date(Date.UTC(2024, 0, 15)) } as never,
  }
  await applier.applyItem(tx, item, ctx(optsConservative))

  const created = calls.employeeCreates[0].data
  assert.ok(Buffer.isBuffer(created.bankDataEnc), 'bankDataEnc deve ser Buffer')
  assert.ok(Buffer.isBuffer(created.bankDataIv))
  assert.ok(Buffer.isBuffer(created.bankDataTag))

  // AuditLog não vaza cleartext
  const auditNewData = JSON.stringify(calls.auditLogs[0].newData)
  assert.ok(!auditNewData.includes('03670788131'), 'CPF cleartext NÃO deve aparecer no audit')
  const audit = calls.auditLogs[0].newData as { hasBankData: boolean }
  assert.strictEqual(audit.hasBankData, true)
})

test('applyUpdate atualiza apenas campos do diff', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = {
    kind: 'update',
    row: makeRow({ salario: 1700 }),
    employee: makeEmp(),
    patch: {
      salary: 1700 as unknown as Employee['salary'],
      name: 'Fulano',
    } as never,
    diff: { salary: { from: 1500, to: 1700 } },
  }
  await applier.applyItem(tx, item, ctx(optsConservative))

  assert.strictEqual(calls.employeeUpdates.length, 1)
  const data = calls.employeeUpdates[0].data
  assert.strictEqual(Object.keys(data).length, 1)
  assert.strictEqual((data as { salary: number }).salary, 1700)

  const audit = calls.auditLogs[0]
  assert.strictEqual(audit.action, 'EMPLOYEE_IMPORT_UPDATE')
  assert.deepStrictEqual(audit.previousData, { salary: 1500 })
})

test('applyReactivation com reactivateAll=false → skip', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = {
    kind: 'reactivation',
    row: makeRow(),
    employee: makeEmp({ status: 'INATIVO', terminationDate: new Date() }),
    patch: { name: 'Fulano' } as never,
    diff: { status: { from: 'INATIVO', to: 'ATIVO' } },
  }
  const r = await applier.applyItem(tx, item, ctx(optsConservative))
  assert.strictEqual(r.delta, null)
  assert.strictEqual(calls.employeeUpdates.length, 0)
  assert.strictEqual(calls.auditLogs.length, 0)
})

test('applyReactivation com reactivateAll=true → reativa', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = {
    kind: 'reactivation',
    row: makeRow(),
    employee: makeEmp({ status: 'INATIVO', terminationDate: new Date() }),
    patch: { name: 'Fulano' } as never,
    diff: {},
  }
  await applier.applyItem(tx, item, ctx(optsAll))
  assert.strictEqual(calls.employeeUpdates.length, 1)
  const data = calls.employeeUpdates[0].data
  assert.strictEqual((data as { status: string }).status, 'ATIVO')
  assert.strictEqual(calls.auditLogs[0].action, 'EMPLOYEE_IMPORT_REACTIVATE')
})

test('applyAbsent com markAbsentAsPending=false → skip', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = { kind: 'absent', employee: makeEmp() }
  const r = await applier.applyItem(tx, item, ctx(optsConservative))
  assert.strictEqual(r.delta, null)
  assert.strictEqual(calls.employeeUpdates.length, 0)
})

test('applyAbsent com markAbsentAsPending=true → flag', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = { kind: 'absent', employee: makeEmp() }
  await applier.applyItem(tx, item, ctx(optsAll))
  assert.strictEqual(calls.employeeUpdates.length, 1)
  assert.strictEqual(
    (calls.employeeUpdates[0].data as { inactivePending: boolean }).inactivePending,
    true,
  )
  assert.strictEqual(calls.auditLogs[0].action, 'EMPLOYEE_IMPORT_FLAG_INACTIVE_PENDING')
})

test('applyInvalid → apenas AuditLog', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = {
    kind: 'invalid',
    row: makeRow(),
    errors: ['CPF inválido', 'Nome ausente'],
  }
  await applier.applyItem(tx, item, ctx(optsConservative))
  assert.strictEqual(calls.employeeCreates.length, 0)
  assert.strictEqual(calls.employeeUpdates.length, 0)
  assert.strictEqual(calls.auditLogs.length, 1)
  assert.strictEqual(calls.auditLogs[0].action, 'EMPLOYEE_IMPORT_INVALID')
  assert.strictEqual(calls.auditLogs[0].reason, 'CPF inválido')
  assert.strictEqual(calls.auditLogs[0].resourceType, 'IMPORT_JOB')
})

test('applyWorkplaceCreate → cria Workplace + AuditLog', async () => {
  const { tx, calls } = makeMockTx()
  const item: ApplyItem = { kind: 'workplace', name: 'TRT-DF' }
  await applier.applyItem(tx, item, ctx(optsAll))
  assert.strictEqual(calls.workplaceCreates.length, 1)
  const created = calls.workplaceCreates[0].data
  assert.strictEqual(created.name, 'TRT-DF')
  assert.strictEqual(created.tenantId, TENANT)
  assert.strictEqual(created.minStaff, 1)
  assert.strictEqual(calls.auditLogs[0].action, 'WORKPLACE_CREATED_VIA_IMPORT')
})

test('applyItem retorna delta correto por kind', async () => {
  const { tx } = makeMockTx()
  const wpItem: ApplyItem = { kind: 'workplace', name: 'X' }
  const r = await applier.applyItem(tx, wpItem, ctx(optsAll))
  assert.strictEqual(r.delta, 'workplacesCreated')
})

// ──────────────────────────────────────────────────────────────────────
// Story 2.1: Tirvu integra com WorkplaceAllocationService
// ──────────────────────────────────────────────────────────────────────

test('Story 2.1 — applyCreate com workplace existente: vincula workplaceId + cria allocation', async () => {
  const wpId = randomUUID()
  const posId = randomUUID()
  const { tx, calls, allocationService } = makeMockTx({
    existingWorkplaces: [{ id: wpId, name: 'INEP - Sede', createdAt: new Date(2024, 0, 1) }],
    existingPositions: [{ id: posId, tenantId: TENANT, workplaceId: wpId, createdAt: new Date(2024, 0, 1) }],
  })
  const item: ApplyItem = {
    kind: 'create',
    row: makeRow({ lotacao: 'INEP - Sede' }),
    patch: {
      name: 'Maria',
      hireDate: new Date(Date.UTC(2024, 0, 15)),
      workplace: 'INEP - Sede',
    } as never,
  }
  const r = await applier.applyItem(tx, item, ctx(optsConservative, allocationService))
  assert.strictEqual(r.delta, 'created')
  assert.strictEqual(r.extraDeltas, undefined, 'workplace já existia, não conta como criado')

  // Employee.workplaceId atualizado
  const updates = calls.employeeUpdates
  assert.ok(
    updates.some((u) => (u.data as { workplaceId?: string }).workplaceId === wpId),
    'employee.workplaceId deve ter sido atualizado',
  )
  // Allocation criada
  assert.strictEqual(calls.workplaceAllocations.length, 1)
  assert.strictEqual(
    (calls.workplaceAllocations[0].data as { workplacePositionId: string }).workplacePositionId,
    posId,
  )
  // AuditLog IMPORT_TIRVU_ALLOCATE gravado
  assert.ok(
    calls.auditLogs.some((a) => a.action === 'IMPORT_TIRVU_ALLOCATE'),
    'AuditLog IMPORT_TIRVU_ALLOCATE deve estar presente',
  )
})

test('Story 2.1 — applyCreate auto-cria Workplace AUTO_TIRVU + WorkplacePosition padrão', async () => {
  const { tx, calls, allocationService } = makeMockTx()
  const item: ApplyItem = {
    kind: 'create',
    row: makeRow({ lotacao: 'Posto Novo' }),
    patch: {
      name: 'João',
      hireDate: new Date(Date.UTC(2024, 0, 15)),
      workplace: 'Posto Novo',
    } as never,
  }
  const r = await applier.applyItem(tx, item, ctx(optsConservative, allocationService))
  assert.strictEqual(r.delta, 'created')
  assert.deepStrictEqual(r.extraDeltas, ['workplacesCreated'], 'workplace novo conta')

  assert.strictEqual(calls.workplaceCreates.length, 1)
  const wp = calls.workplaceCreates[0].data
  assert.strictEqual(wp.importedBy, 'AUTO_TIRVU')
  assert.strictEqual(wp.name, 'Posto Novo')

  assert.strictEqual(calls.workplacePositionCreates.length, 1)
  const pos = calls.workplacePositionCreates[0].data
  assert.strictEqual(pos.role, 'Operacional')
  assert.strictEqual(pos.requiredCount, 1)

  assert.strictEqual(calls.workplaceAllocations.length, 1)
})

test('Story 2.1 — applyUpdate em transição de posto encerra alloc anterior + cria nova', async () => {
  const wpA = randomUUID()
  const posA = randomUUID()
  const wpB = randomUUID()
  const posB = randomUUID()
  const allocAtual = randomUUID()
  const employee = makeEmp({ id: 'emp-1', workplace: 'WP-A', workplaceId: wpA })
  const { tx, calls, allocationService } = makeMockTx({
    existingWorkplaces: [
      { id: wpA, name: 'WP-A', createdAt: new Date(2024, 0, 1) },
      { id: wpB, name: 'WP-B', createdAt: new Date(2024, 0, 2) },
    ],
    existingPositions: [
      { id: posA, tenantId: TENANT, workplaceId: wpA, createdAt: new Date(2024, 0, 1) },
      { id: posB, tenantId: TENANT, workplaceId: wpB, createdAt: new Date(2024, 0, 2) },
    ],
    existingAllocations: [
      {
        id: allocAtual,
        tenantId: TENANT,
        employeeId: 'emp-1',
        workplacePositionId: posA,
        status: 'ACTIVE',
      },
    ],
  })
  const item: ApplyItem = {
    kind: 'update',
    row: makeRow({ lotacao: 'WP-B' }),
    employee,
    patch: { workplace: 'WP-B' } as never,
    diff: { workplace: { from: 'WP-A', to: 'WP-B' } },
  }
  await applier.applyItem(tx, item, ctx(optsConservative, allocationService))

  // Allocation antiga foi encerrada
  assert.ok(
    calls.workplaceAllocationUpdates.some(
      (u) => u.id === allocAtual && (u.data as { status?: string }).status === 'ENDED',
    ),
    'allocation antiga deve ser encerrada',
  )
  // Nova allocation criada
  assert.strictEqual(calls.workplaceAllocations.length, 1)
  const newAlloc = calls.workplaceAllocations[0].data
  assert.strictEqual(newAlloc.workplacePositionId, posB)
  // AuditLog da transição
  assert.ok(calls.auditLogs.some((a) => a.action === 'IMPORT_TIRVU_ALLOCATE'))
})

test('Story 2.1 — re-import idempotente (mesma row 2× não duplica allocation)', async () => {
  const wpId = randomUUID()
  const posId = randomUUID()
  const { tx, calls, allocationService } = makeMockTx({
    existingWorkplaces: [{ id: wpId, name: 'INEP - Sede', createdAt: new Date(2024, 0, 1) }],
    existingPositions: [{ id: posId, tenantId: TENANT, workplaceId: wpId, createdAt: new Date(2024, 0, 1) }],
  })
  const item1: ApplyItem = {
    kind: 'create',
    row: makeRow({ lotacao: 'INEP - Sede' }),
    patch: {
      name: 'Maria',
      hireDate: new Date(Date.UTC(2024, 0, 15)),
      workplace: 'INEP - Sede',
    } as never,
  }
  await applier.applyItem(tx, item1, ctx(optsConservative, allocationService))
  const allocsAfter1 = calls.workplaceAllocations.length

  // 2ª vez — applyUpdate sem diff de workplace, mas como employee não tinha
  // workplaceId originalmente... vamos simular um update com diff de outro
  // campo (sem workplace) ou um update novo com mesmo workplace.
  const employee2 = makeEmp({
    workplace: 'INEP - Sede',
    workplaceId: wpId, // FK já populada após 1º import
  })
  const item2: ApplyItem = {
    kind: 'update',
    row: makeRow({ lotacao: 'INEP - Sede', salario: 1700 }),
    employee: employee2,
    patch: {
      salary: 1700 as unknown as Employee['salary'],
      workplace: 'INEP - Sede',
    } as never,
    diff: { salary: { from: 1500, to: 1700 } }, // workplace NÃO está no diff
  }
  await applier.applyItem(tx, item2, ctx(optsConservative, allocationService))

  // Allocation count permaneceu (sem novo create)
  assert.strictEqual(
    calls.workplaceAllocations.length,
    allocsAfter1,
    'segunda passagem não deve criar nova allocation',
  )
  // Workplace count permaneceu (sem novo create)
  assert.strictEqual(calls.workplaceCreates.length, 0, 'workplace não duplicado')
})
