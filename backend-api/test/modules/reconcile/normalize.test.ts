import test from 'node:test'
import assert from 'node:assert'
import { normalize } from '../../../src/modules/reconcile/matchers/normalize'

test('normalize()', async (t) => {
  await t.test('aplica lowercase', () => {
    assert.strictEqual(normalize('INEP'), 'inep')
  })

  await t.test('faz trim de whitespace leading/trailing', () => {
    assert.strictEqual(normalize('   inep   '), 'inep')
  })

  await t.test('faz collapse de whitespace múltiplo (inclui tab e quebra de linha)', () => {
    assert.strictEqual(normalize('inep   -   sede'), 'inep - sede')
    assert.strictEqual(normalize('inep\t-\nsede'), 'inep - sede')
  })

  await t.test('NFC: pré-compõe diacríticos canonicamente', () => {
    // 'á' decomposto NFD: 'a' (U+0061) + combining acute (U+0301)
    const nfd = 'área'
    const nfc = 'área' // 'á' pré-composto
    // Bytes diferem mas após normalize ambos viram 'á' canonicamente
    assert.strictEqual(normalize(nfd), normalize(nfc))
    assert.strictEqual(normalize(nfd), 'área')
  })

  await t.test('combinação completa: variantes do mesmo nome convergem', () => {
    const variants = [
      'INEP - Sede',
      'inep - sede',
      'INEP   -   Sede   ',
      'Inep - Sede',
      'INEP - SEDE',
    ]
    const expected = 'inep - sede'
    for (const v of variants) {
      assert.strictEqual(normalize(v), expected, `falhou para "${v}"`)
    }
  })

  await t.test('idempotência: normalize(normalize(x)) === normalize(x)', () => {
    const inputs = [
      'INEP - Sede',
      '  área   1  ',
      'CONFLITO  -  ALA-A',
      '\tÁREA\nCOMUM\t',
    ]
    for (const x of inputs) {
      const once = normalize(x)
      const twice = normalize(once)
      assert.strictEqual(twice, once, `idempotência falhou para "${x}"`)
    }
  })

  await t.test('string vazia normaliza para string vazia', () => {
    assert.strictEqual(normalize(''), '')
    assert.strictEqual(normalize('   '), '')
  })
})
