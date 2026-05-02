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
  auditLogs: Record<string, unknown>[]
}

function makeMockTx() {
  const calls: TxCalls = {
    employeeCreates: [],
    employeeUpdates: [],
    workplaceCreates: [],
    auditLogs: [],
  }
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
        calls.workplaceCreates.push({ id, data })
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
  return { tx: tx as never, calls }
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

const ctx = (options: ApplyOptions): ApplyContext => ({
  tenantId: TENANT,
  jobId: JOB_ID,
  userId: USER_ID,
  options,
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
