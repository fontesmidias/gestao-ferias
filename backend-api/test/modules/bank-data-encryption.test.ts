// Setup: definir env var ANTES do import do módulo (que valida no top-level).
process.env.BANK_DATA_ENCRYPTION_KEY = '0+5mYyV8DG7BUSmJ6ugef35NARVs5HJ+TbogSnOD0D4='

import test from 'node:test'
import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import {
  deriveTenantKey,
  encryptBankData,
  decryptBankData,
} from '../../src/modules/imports/bank-data-encryption'
import type { BankData } from '../../src/modules/imports/types'

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'

function randomBankData(): BankData {
  return {
    tipoPix: 'CPF',
    chavePix: randomBytes(8).toString('hex'),
    banco: String(Math.floor(Math.random() * 999)).padStart(3, '0'),
    tipoConta: Math.random() > 0.5 ? 'CC' : 'CP',
    agencia: String(Math.floor(Math.random() * 9999)).padStart(4, '0'),
    conta: randomBytes(4).toString('hex'),
  }
}

test('bank-data-encryption', async (t) => {
  await t.test('roundtrip 100 random inputs', () => {
    for (let i = 0; i < 100; i++) {
      const data = randomBankData()
      const blob = encryptBankData(data, TENANT_A)
      const decrypted = decryptBankData(blob, TENANT_A)
      assert.deepStrictEqual(decrypted, data)
    }
  })

  await t.test('IV é único per record', () => {
    const data = randomBankData()
    const blob1 = encryptBankData(data, TENANT_A)
    const blob2 = encryptBankData(data, TENANT_A)
    assert.notDeepStrictEqual(blob1.iv, blob2.iv, 'IVs must differ between calls')
    assert.notDeepStrictEqual(blob1.enc, blob2.enc, 'ciphertext must differ when IVs differ')
  })

  await t.test('IV size is 12 bytes (GCM standard)', () => {
    const blob = encryptBankData(randomBankData(), TENANT_A)
    assert.strictEqual(blob.iv.length, 12)
    assert.strictEqual(blob.tag.length, 16)
  })

  await t.test('tampering detection — modify enc', () => {
    const blob = encryptBankData(randomBankData(), TENANT_A)
    blob.enc[0] ^= 0xff
    assert.throws(() => decryptBankData(blob, TENANT_A))
  })

  await t.test('tampering detection — modify iv', () => {
    const blob = encryptBankData(randomBankData(), TENANT_A)
    blob.iv[0] ^= 0xff
    assert.throws(() => decryptBankData(blob, TENANT_A))
  })

  await t.test('tampering detection — modify tag', () => {
    const blob = encryptBankData(randomBankData(), TENANT_A)
    blob.tag[0] ^= 0xff
    assert.throws(() => decryptBankData(blob, TENANT_A))
  })

  await t.test('tenantId isolation — decrypt with other tenant fails', () => {
    const data = randomBankData()
    const blob = encryptBankData(data, TENANT_A)
    assert.throws(() => decryptBankData(blob, TENANT_B))
  })

  await t.test('deriveTenantKey is deterministic', () => {
    const k1 = deriveTenantKey(TENANT_A)
    const k2 = deriveTenantKey(TENANT_A)
    assert.deepStrictEqual(k1, k2)
    assert.strictEqual(k1.length, 32)
  })

  await t.test('deriveTenantKey produces distinct keys per tenant', () => {
    const kA = deriveTenantKey(TENANT_A)
    const kB = deriveTenantKey(TENANT_B)
    assert.notDeepStrictEqual(kA, kB)
  })

  await t.test('roundtrip preserves null fields and partial data', () => {
    const partial: BankData = {
      tipoPix: 'CPF',
      chavePix: '036.707.881-31',
      banco: null,
      tipoConta: null,
      agencia: null,
      conta: null,
    }
    const blob = encryptBankData(partial, TENANT_A)
    assert.deepStrictEqual(decryptBankData(blob, TENANT_A), partial)
  })

  await t.test('roundtrip preserves empty object', () => {
    const empty: BankData = {}
    const blob = encryptBankData(empty, TENANT_A)
    assert.deepStrictEqual(decryptBankData(blob, TENANT_A), empty)
  })
})
