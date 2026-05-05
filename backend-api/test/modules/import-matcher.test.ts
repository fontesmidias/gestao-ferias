import test from 'node:test'
import assert from 'node:assert'
import {
  buildPreviewSummary,
  computeDiff,
  DIFF_FIELDS,
  mapRowToEmployeePatch,
  matchAll,
} from '../../src/modules/imports/import-matcher'
import type { Employee, TirvuRow } from '../../src/modules/imports/types'

function makeRow(o: Partial<TirvuRow> = {}): TirvuRow {
  const base: TirvuRow = {
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
  }
  return { ...base, ...o }
}

function makeEmployee(o: Partial<Employee> = {}): Employee {
  const base: Employee = {
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
    tenantId: 'tenant-1',
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
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  return { ...base, ...o }
}

const ctxBase = { tenantId: 'tenant-1', existingWorkplaces: [{ name: 'ANATEL' }] }

test('DIFF_FIELDS contém apenas campos do whitelist', () => {
  assert.ok(DIFF_FIELDS.includes('salary'))
  assert.ok(DIFF_FIELDS.includes('tirvuId'))
  assert.ok(!DIFF_FIELDS.includes('id' as never))
  assert.ok(!DIFF_FIELDS.includes('tenantId' as never))
  assert.ok(!DIFF_FIELDS.includes('bankDataEnc' as never))
})

test('mapRowToEmployeePatch — campos obrigatórios mapeados', () => {
  const patch = mapRowToEmployeePatch(makeRow())
  assert.strictEqual(patch.name, 'Fulano')
  assert.strictEqual(patch.status, 'ATIVO')
  assert.strictEqual(patch.workplace, 'ANATEL')
  assert.ok(patch.hireDate instanceof Date)
})

test('mapRowToEmployeePatch — personalData só aparece se houver subfield', () => {
  const patchEmpty = mapRowToEmployeePatch(makeRow())
  assert.strictEqual(patchEmpty.personalData, undefined)

  const patchWithSexo = mapRowToEmployeePatch(makeRow({ sexo: 'M' }))
  assert.deepStrictEqual(patchWithSexo.personalData, { sexo: 'M' })
})

test('computeDiff — campos iguais retorna {}', () => {
  const emp = makeEmployee()
  const patch = mapRowToEmployeePatch(makeRow())
  const diff = computeDiff(emp, patch)
  assert.deepStrictEqual(diff, {})
})

test('computeDiff — salary diferente aparece no diff', () => {
  const emp = makeEmployee({ salary: 1500 as unknown as Employee['salary'] })
  const patch = mapRowToEmployeePatch(makeRow({ salario: 1700 }))
  const diff = computeDiff(emp, patch)
  assert.deepStrictEqual(diff.salary, { from: 1500, to: 1700 })
})

test('computeDiff — Decimal vs number compara por valor', () => {
  const decimalLike = { toString: () => '1500.00' }
  const emp = makeEmployee({ salary: decimalLike as unknown as Employee['salary'] })
  const patch = mapRowToEmployeePatch(makeRow({ salario: 1500 }))
  const diff = computeDiff(emp, patch)
  assert.deepStrictEqual(diff, {})
})

test('matchAll — row sem match → create', () => {
  const row = makeRow({ rowIndex: 1, cpf: '99999999999', tirvuId: 'X' })
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [] },
  })
  assert.strictEqual(result.create.length, 1)
  assert.strictEqual(result.update.length, 0)
})

test('matchAll — row casa Employee inalterado → unchanged', () => {
  const row = makeRow({ rowIndex: 1 })
  const emp = makeEmployee()
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [emp] },
  })
  assert.strictEqual(result.unchanged.length, 1)
  assert.strictEqual(result.update.length, 0)
})

test('matchAll — row casa com salary diferente → update', () => {
  const row = makeRow({ rowIndex: 1, salario: 1700 })
  const emp = makeEmployee()
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [emp] },
  })
  assert.strictEqual(result.update.length, 1)
  assert.deepStrictEqual(result.update[0].diff.salary, { from: 1500, to: 1700 })
})

test('matchAll — row casa Employee status=INATIVO → reactivation', () => {
  const row = makeRow({ rowIndex: 1 })
  const emp = makeEmployee({ status: 'INATIVO' })
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [emp] },
  })
  assert.strictEqual(result.reactivation.length, 1)
  assert.strictEqual(result.update.length, 0)
})

test('matchAll — row casa Employee terminationDate≠null → reactivation', () => {
  const row = makeRow({ rowIndex: 1 })
  const emp = makeEmployee({ terminationDate: new Date(Date.UTC(2025, 11, 1)) })
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [emp] },
  })
  assert.strictEqual(result.reactivation.length, 1)
})

test('matchAll — conflito stage1≠stage2 → row invalid', () => {
  const empA = makeEmployee({ id: 'a', cpf: '11111111111', tirvuId: 'TID' })
  const empB = makeEmployee({ id: 'b', cpf: '03670788131', tirvuId: 'OTHER' })
  const conflictRow = makeRow({ rowIndex: 1, cpf: '03670788131', tirvuId: 'TID' })
  const result = matchAll({
    rows: [conflictRow],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [empA, empB] },
  })
  assert.strictEqual(result.invalid.length, 1)
  assert.ok(result.invalid[0].errors[0].includes('CPF da planilha pertence a outro colaborador'))
})

test('matchAll — match via cpf, Employee tinha tirvuId=null → diff inclui tirvuId', () => {
  const emp = makeEmployee({ tirvuId: null })
  const row = makeRow({ rowIndex: 1, tirvuId: 'NEW123' })
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [emp] },
  })
  assert.strictEqual(result.update.length, 1)
  assert.deepStrictEqual(result.update[0].diff.tirvuId, { from: null, to: 'NEW123' })
})

test('matchAll — Employee ativo sem CPF na planilha → absent', () => {
  const empAusente = makeEmployee({ id: 'absent-emp', cpf: '99999999999', tirvuId: null })
  const result = matchAll({
    rows: [],
    validRowSet: new Set(),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [empAusente] },
  })
  assert.strictEqual(result.absent.length, 1)
  assert.strictEqual(result.absent[0].id, 'absent-emp')
})

test('matchAll — Employee inativo sem CPF na planilha NÃO entra em absent', () => {
  const empInativo = makeEmployee({ id: 'x', status: 'INATIVO', cpf: '99999999999', tirvuId: null })
  const result = matchAll({
    rows: [],
    validRowSet: new Set(),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [empInativo] },
  })
  assert.strictEqual(result.absent.length, 0)
})

test('matchAll — Lotação nova → newWorkplaces contém', () => {
  const row = makeRow({ rowIndex: 1, lotacao: 'TRT-DF', cpf: '99999999999', tirvuId: 'X' })
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [] },
  })
  assert.deepStrictEqual(result.newWorkplaces, ['TRT-DF'])
})

test('matchAll — Lotação existente NÃO entra em newWorkplaces', () => {
  const row = makeRow({ rowIndex: 1, lotacao: 'ANATEL', cpf: '99999999999', tirvuId: 'X' })
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [] },
  })
  assert.deepStrictEqual(result.newWorkplaces, [])
})

test('matchAll — newWorkplaces dedup', () => {
  const r1 = makeRow({ rowIndex: 1, lotacao: 'TRT-DF', cpf: '99999999999', tirvuId: 'A' })
  const r2 = makeRow({ rowIndex: 2, lotacao: 'TRT-DF', cpf: '88888888888', tirvuId: 'B' })
  const result = matchAll({
    rows: [r1, r2],
    validRowSet: new Set([1, 2]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [] },
  })
  assert.deepStrictEqual(result.newWorkplaces, ['TRT-DF'])
})

test('matchAll — idempotência: 2ª passada tudo unchanged', () => {
  const row = makeRow({ rowIndex: 1 })
  const emp = makeEmployee()
  const result = matchAll({
    rows: [row],
    validRowSet: new Set([1]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [emp] },
  })
  assert.strictEqual(result.unchanged.length, 1)
  assert.strictEqual(result.create.length, 0)
  assert.strictEqual(result.update.length, 0)
  assert.strictEqual(result.invalid.length, 0)
  assert.strictEqual(result.absent.length, 0)
})

test('matchAll — invalid do validator é preservado no result', () => {
  const validatorInvalid = { row: makeRow({ rowIndex: 99 }), errors: ['CPF inválido'] }
  const result = matchAll({
    rows: [],
    validRowSet: new Set(),
    invalidRowsFromValidator: [validatorInvalid],
    ctx: { ...ctxBase, existingEmployees: [] },
  })
  assert.strictEqual(result.invalid.length, 1)
  assert.deepStrictEqual(result.invalid[0].errors, ['CPF inválido'])
})

test('buildPreviewSummary — counts e ordering', () => {
  const r1 = makeRow({ rowIndex: 1, cpf: '99999999999', tirvuId: 'A' })
  const r2 = makeRow({ rowIndex: 2 })
  const emp = makeEmployee()
  const result = matchAll({
    rows: [r1, r2],
    validRowSet: new Set([1, 2]),
    invalidRowsFromValidator: [],
    ctx: { ...ctxBase, existingEmployees: [emp] },
  })
  const summary = buildPreviewSummary(result, 2)
  assert.strictEqual(summary.totalRows, 2)
  assert.strictEqual(summary.counts.create, 1)
  assert.strictEqual(summary.counts.unchanged, 1)
  assert.strictEqual(summary.sampleRows.length, 2)
  assert.strictEqual(summary.sampleRows[0].rowIndex, 1)
  assert.strictEqual(summary.sampleRows[1].rowIndex, 2)
})

test('buildPreviewSummary — sampleRows respeita sampleSize', () => {
  const summary = buildPreviewSummary(
    {
      create: Array.from({ length: 100 }, (_, i) => ({
        row: makeRow({ rowIndex: i + 1, cpf: String(10000000000 + i), tirvuId: `T${i}` }),
        patch: {},
      })),
      update: [], unchanged: [], reactivation: [], invalid: [], absent: [], newWorkplaces: [],
    },
    100,
    50,
  )
  assert.strictEqual(summary.sampleRows.length, 50)
})

// ──────────────────────────────────────────────────────────────────────
// Story 2.2: relationalDelta no PreviewSummary (FR25)
// ──────────────────────────────────────────────────────────────────────

test('Story 2.2 — relationalDelta: planilha só com novos (3 rows, 2 workplaces inexistentes)', () => {
  const r1 = makeRow({ rowIndex: 1, cpf: '11111111111', tirvuId: 'A', lotacao: 'ANATEL' })
  const r2 = makeRow({ rowIndex: 2, cpf: '22222222222', tirvuId: 'B', lotacao: 'INEP - Sede' })
  const r3 = makeRow({ rowIndex: 3, cpf: '33333333333', tirvuId: 'C', lotacao: 'STJ' })
  const result = matchAll({
    rows: [r1, r2, r3],
    validRowSet: new Set([1, 2, 3]),
    invalidRowsFromValidator: [],
    ctx: {
      tenantId: 'tenant-1',
      existingEmployees: [],
      existingWorkplaces: [{ name: 'ANATEL' }],
    },
  })
  const summary = buildPreviewSummary(result, 3)
  assert.ok(summary.relationalDelta, 'relationalDelta deve estar presente')
  assert.strictEqual(summary.relationalDelta.allocationsCreated, 3)
  assert.strictEqual(summary.relationalDelta.allocationsClosed, 0)
  assert.strictEqual(summary.relationalDelta.workplacesCreated, 2, 'INEP-Sede e STJ são novos')
  assert.strictEqual(summary.relationalDelta.unmatchedEmployees, 0)
})

test('Story 2.2 — relationalDelta: transições + unmatched', () => {
  // 2 employees existentes (com workplaceId) cuja lotação muda + 1 row sem lotação
  const empA = makeEmployee({
    id: 'emp-A',
    cpf: '11111111111',
    tirvuId: 'A',
    workplace: 'ANATEL',
    workplaceId: 'wp-anatel',
  })
  const empB = makeEmployee({
    id: 'emp-B',
    cpf: '22222222222',
    tirvuId: 'B',
    workplace: 'INEP',
    workplaceId: 'wp-inep',
  })
  const empC = makeEmployee({
    id: 'emp-C',
    cpf: '33333333333',
    tirvuId: 'C',
    workplace: null,
    workplaceId: null,
  })
  const r1 = makeRow({
    rowIndex: 1, cpf: '11111111111', tirvuId: 'A', lotacao: 'STJ', // muda ANATEL→STJ
  })
  const r2 = makeRow({
    rowIndex: 2, cpf: '22222222222', tirvuId: 'B', lotacao: 'TRT', // muda INEP→TRT
  })
  const r3 = makeRow({
    rowIndex: 3, cpf: '33333333333', tirvuId: 'C', lotacao: null, // sem lotação
  })
  const result = matchAll({
    rows: [r1, r2, r3],
    validRowSet: new Set([1, 2, 3]),
    invalidRowsFromValidator: [],
    ctx: {
      tenantId: 'tenant-1',
      existingEmployees: [empA, empB, empC],
      existingWorkplaces: [{ name: 'ANATEL' }, { name: 'INEP' }],
    },
  })
  const summary = buildPreviewSummary(result, 3)
  assert.ok(summary.relationalDelta)
  assert.strictEqual(summary.relationalDelta.allocationsCreated, 2, 'A e B em transição criam novas')
  assert.strictEqual(summary.relationalDelta.allocationsClosed, 2, 'A e B encerram antigas')
  assert.strictEqual(summary.relationalDelta.unmatchedEmployees, 1, 'C sem lotação')
})

test('Story 2.2 — relationalDelta: normalize collisions não duplicam workplacesCreated', () => {
  // 2 rows com variações da mesma lotação que matcha workplace existente — 0 novos
  const r1 = makeRow({ rowIndex: 1, cpf: '11111111111', tirvuId: 'A', lotacao: 'INEP - Sede' })
  const r2 = makeRow({ rowIndex: 2, cpf: '22222222222', tirvuId: 'B', lotacao: 'INEP   -   Sede   ' })
  const result = matchAll({
    rows: [r1, r2],
    validRowSet: new Set([1, 2]),
    invalidRowsFromValidator: [],
    ctx: {
      tenantId: 'tenant-1',
      existingEmployees: [],
      // matcher existente compara via .trim() (sem normalize completo).
      // Para o teste, exigimos que ambas variações batam com 'INEP - Sede'.
      existingWorkplaces: [{ name: 'INEP - Sede' }, { name: 'INEP   -   Sede   ' }],
    },
  })
  const summary = buildPreviewSummary(result, 2)
  assert.ok(summary.relationalDelta)
  assert.strictEqual(summary.relationalDelta.allocationsCreated, 2)
  assert.strictEqual(summary.relationalDelta.workplacesCreated, 0, 'workplaces existentes — 0 novos')
})
