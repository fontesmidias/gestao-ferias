import test from 'node:test'
import assert from 'node:assert'
import * as path from 'node:path'
import * as fs from 'node:fs'
import {
  detect,
  parseRows,
  TIRVU_V1_HEADER,
} from '../../src/modules/imports/tirvu-parser'

const FIX = (name: string) =>
  path.join(__dirname, '../fixtures/imports', name)

const readBuf = (name: string) => fs.readFileSync(FIX(name))

test('TIRVU_V1_HEADER tem 46 colunas', () => {
  assert.strictEqual(TIRVU_V1_HEADER.length, 46)
})

test('detect — fixture válido retorna tirvu-v1', () => {
  assert.strictEqual(detect(readBuf('tirvu-anatel-50.xlsx')), 'tirvu-v1')
})

test('detect — sheet com nome errado retorna null', () => {
  assert.strictEqual(detect(readBuf('tirvu-bad-sheet-name.xlsx')), null)
})

test('detect — header com 45 colunas retorna null', () => {
  assert.strictEqual(detect(readBuf('tirvu-invalid-header.xlsx')), null)
})

test('detect — buffer vazio retorna null', () => {
  assert.strictEqual(detect(Buffer.from([])), null)
})

test('detect — buffer não-xlsx retorna null', () => {
  assert.strictEqual(detect(Buffer.from('not an xlsx')), null)
})

test('parseRows — itera todas as linhas data do fixture', async () => {
  const collected = []
  for await (const row of parseRows(readBuf('tirvu-anatel-50.xlsx'))) {
    collected.push(row)
  }
  assert.ok(collected.length >= 1, 'pelo menos uma linha')
  assert.ok(collected.length <= 100, 'fixture pequeno (<100)')
})

test('parseRows — primeiro row tem 46+2 chaves (rowIndex, rawRowIndex)', async () => {
  for await (const row of parseRows(readBuf('tirvu-anatel-50.xlsx'))) {
    assert.strictEqual(Object.keys(row).length, 48)
    break
  }
})

test('parseRows — normalização: PCD? "NÃO" vira false', async () => {
  for await (const row of parseRows(readBuf('tirvu-anatel-50.xlsx'))) {
    if (row.tirvuId === '1364') {
      assert.strictEqual(row.pcd, false)
      return
    }
  }
  assert.fail('row tirvuId=1364 não encontrada')
})

test('parseRows — normalização: admissao dd/MM/yyyy vira Date', async () => {
  for await (const row of parseRows(readBuf('tirvu-anatel-50.xlsx'))) {
    if (row.tirvuId === '1364') {
      assert.ok(row.admissao instanceof Date, 'admissao deve ser Date')
      const d = row.admissao as Date
      assert.strictEqual(d.getUTCDate(), 1)
      assert.strictEqual(d.getUTCMonth(), 7) // August (0-indexed)
      assert.strictEqual(d.getUTCFullYear(), 2025)
      return
    }
  }
  assert.fail('row tirvuId=1364 não encontrada')
})

test('parseRows — célula null vira null', async () => {
  for await (const row of parseRows(readBuf('tirvu-anatel-50.xlsx'))) {
    if (row.tirvuId === '1364') {
      assert.strictEqual(row.demissao, null, 'demissao é null para ATIVO')
      return
    }
  }
})

test('parseRows — linhas vazias não são yielded', async () => {
  for await (const row of parseRows(readBuf('tirvu-anatel-50.xlsx'))) {
    const cells = [
      row.tirvuId, row.cpf, row.name, row.status, row.empresa,
    ].filter((v) => v !== null)
    assert.ok(cells.length > 0, `row ${row.rowIndex} não pode ser totalmente vazia`)
  }
})

test('parseRows — rowIndex começa em 1 e é contínuo', async () => {
  let expected = 1
  for await (const row of parseRows(readBuf('tirvu-anatel-50.xlsx'))) {
    assert.strictEqual(row.rowIndex, expected)
    expected++
  }
})

test('parseRows — sheet name errado: retorna iterator vazio', async () => {
  const collected = []
  for await (const row of parseRows(readBuf('tirvu-bad-sheet-name.xlsx'))) {
    collected.push(row)
  }
  assert.strictEqual(collected.length, 0)
})

test('parseRows — buffer corrupto: retorna iterator vazio (não lança)', async () => {
  const collected = []
  for await (const row of parseRows(Buffer.from('not-an-xlsx'))) {
    collected.push(row)
  }
  assert.strictEqual(collected.length, 0)
})
