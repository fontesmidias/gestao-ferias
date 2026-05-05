import test from 'node:test'
import assert from 'node:assert'
import { validate } from '../../src/modules/imports/import-validator'
import type { TirvuRow } from '../../src/modules/imports/types'

function makeRow(overrides: Partial<TirvuRow> = {}): TirvuRow {
  const base: TirvuRow = {
    rowIndex: 1,
    rawRowIndex: 1,
    tirvuId: '1234',
    cpf: '03670788131', // CPF válido (mod 11) — extraído do fixture exemplo
    name: 'Fulano de Tal',
    matricula: '1001',
    sexo: 'M',
    nascimento: new Date(Date.UTC(1990, 0, 1)),
    email: 'a@b.com',
    telefone: null,
    pcd: false,
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
    cargo: 'Auxiliar',
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
  return { ...base, ...overrides }
}

test('linha completa válida → status=valid, errors vazio', () => {
  const r = validate(makeRow())
  assert.deepStrictEqual(r, { status: 'valid', errors: [] })
})

test('CPF ausente', () => {
  const r = validate(makeRow({ cpf: null }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('CPF ausente'))
})

test('CPF dígito errado', () => {
  const r = validate(makeRow({ cpf: '11111111111' }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('CPF inválido (dígito verificador não confere)'))
})

test('CPF com máscara é normalizado e validado', () => {
  const r = validate(makeRow({ cpf: '036.707.881-31' }))
  assert.strictEqual(r.status, 'valid')
})

test('Name vazio', () => {
  const r = validate(makeRow({ name: '   ' }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('Nome do colaborador ausente'))
})

test('hireDate ausente', () => {
  const r = validate(makeRow({ admissao: null }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('Data de admissão ausente'))
})

test('hireDate como string raw (formato inválido)', () => {
  const r = validate(makeRow({ admissao: '2024-01-15' }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('Data de admissão fora do formato dd/MM/yyyy'))
})

test('hireDate futura', () => {
  const future = new Date(Date.UTC(new Date().getUTCFullYear() + 5, 0, 1))
  const r = validate(makeRow({ admissao: future }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('Data de admissão futura não é permitida'))
})

test('Status fora do enum', () => {
  const r = validate(makeRow({ status: 'INVALIDO' }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(
    r.errors.some((e) => e.includes('Status do colaborador "INVALIDO"')),
    `Esperava erro mencionando o status recebido. Recebeu: ${r.errors.join(' | ')}`,
  )
})

test('Status INATIVO aceito (Tirvu real)', () => {
  const r = validate(makeRow({ status: 'INATIVO' }))
  assert.strictEqual(r.status, 'valid')
})

test('Status FÉRIAS aceito', () => {
  const r = validate(makeRow({ status: 'FÉRIAS' }))
  assert.strictEqual(r.status, 'valid')
})

test('Status case-insensitive ativo', () => {
  const r = validate(makeRow({ status: 'ativo' }))
  assert.strictEqual(r.status, 'valid')
})

test('terminationDate antes de hireDate', () => {
  const r = validate(
    makeRow({
      admissao: new Date(Date.UTC(2024, 0, 15)),
      demissao: new Date(Date.UTC(2023, 0, 15)),
    }),
  )
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('Data de demissão anterior à admissão'))
})

test('Múltiplos erros simultâneos', () => {
  const r = validate(
    makeRow({
      cpf: '11111111111',
      name: '',
      status: 'XYZ',
      admissao: '15-01-2024',
    }),
  )
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.length >= 4, `esperava ≥4 erros, recebeu ${r.errors.length}`)
})

test('birthDate implausível (criança)', () => {
  const r = validate(makeRow({ nascimento: new Date(Date.UTC(2020, 0, 1)) }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(
    r.errors.some((e) => e.includes('idade < 14 anos') && e.includes('01/01/2020')),
    `Esperava erro com data parseada. Recebeu: ${r.errors.join(' | ')}`,
  )
})

test('birthDate implausível (idade > 120 anos)', () => {
  const r = validate(makeRow({ nascimento: new Date(Date.UTC(1850, 0, 1)) }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(
    r.errors.some((e) => e.includes('idade > 120 anos')),
    `Esperava erro idade > 120. Recebeu: ${r.errors.join(' | ')}`,
  )
})

test('birthDate como string raw', () => {
  const r = validate(makeRow({ nascimento: '13-04-1990' }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(
    r.errors.some((e) => e.includes('"13-04-1990"') && e.includes('dd/MM/yyyy')),
    `Esperava erro mencionando formato esperado. Recebeu: ${r.errors.join(' | ')}`,
  )
})

test('demissão como string raw', () => {
  const r = validate(makeRow({ demissao: 'invalida' }))
  assert.strictEqual(r.status, 'invalid')
  assert.ok(r.errors.includes('Data de demissão inválida'))
})
