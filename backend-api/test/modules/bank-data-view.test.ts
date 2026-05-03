// Story 5.2 — Unit tests do resolveBankDataField (lógica pura).
//
// IMPORTANTE: BANK_DATA_ENCRYPTION_KEY precisa estar setada ANTES do require
// dos módulos (validação no top-level do bank-data-encryption). Em tsx/ESM,
// `import` é hoisted; usamos `require()` lazy para garantir ordem.

process.env.BANK_DATA_ENCRYPTION_KEY ??= '5JtP44Gz4XwhPUi0NCxOOeqgdZtZ18FrQsXkuiXYvwg='

import test from 'node:test'
import assert from 'node:assert'

const enc = require('../../src/modules/imports/bank-data-encryption') as typeof import('../../src/modules/imports/bank-data-encryption')
const view = require('../../src/modules/employees/bank-data-view') as typeof import('../../src/modules/employees/bank-data-view')
const { encryptBankData } = enc
const { resolveBankDataField } = view
type BankDataInput = import('../../src/modules/employees/bank-data-view').BankDataInput
type ResolveBankDataResult = import('../../src/modules/employees/bank-data-view').ResolveBankDataResult
type BankData = import('../../src/modules/imports/types').BankData

const TENANT_A = '11111111-1111-1111-1111-111111111111'

const SAMPLE_BANK: BankData = {
  tipoPix: 'CPF',
  chavePix: '12345678900',
  banco: '001',
  tipoConta: 'CC',
  agencia: '1234',
  conta: '987654321',
}

function realBlob(): BankDataInput {
  const blob = encryptBankData(SAMPLE_BANK, TENANT_A)
  return { enc: blob.enc, iv: blob.iv, tag: blob.tag }
}

function emptyBlob(): BankDataInput {
  return { enc: null, iv: null, tag: null }
}

test('default (sem unmask) com bankData → masked com last4 + tipoPix', () => {
  const r: ResolveBankDataResult = resolveBankDataField(realBlob(), {
    tenantId: TENANT_A, wantsUnmask: false, role: 'ADMIN',
  })
  assert.equal(r.kind, 'masked')
  if (r.kind === 'masked') {
    assert.equal(r.data.masked, true)
    assert.equal(r.data.last4, '4321')
    assert.equal(r.data.tipoPix, 'CPF')
  }
})

test('default (sem unmask) sem bankData → omit', () => {
  const r = resolveBankDataField(emptyBlob(), {
    tenantId: TENANT_A, wantsUnmask: false, role: 'ADMIN',
  })
  assert.equal(r.kind, 'omit')
})

test('unmask + role SUPERADMIN (tem bankData.view) → unmasked + shouldAudit', () => {
  const r = resolveBankDataField(realBlob(), {
    tenantId: TENANT_A, wantsUnmask: true, role: 'SUPERADMIN',
  })
  assert.equal(r.kind, 'unmasked')
  if (r.kind === 'unmasked') {
    assert.equal(r.shouldAudit, true)
    assert.deepEqual(r.data, SAMPLE_BANK)
  }
})

test('unmask + role ADMIN (sem bankData.view) → forbidden', () => {
  const r = resolveBankDataField(realBlob(), {
    tenantId: TENANT_A, wantsUnmask: true, role: 'ADMIN',
  })
  assert.equal(r.kind, 'forbidden')
})

test('unmask sem bankData → omit (não vaza 403 desnecessário)', () => {
  // Nota: spec diz que sem permission é forbidden ANTES de checar bankData.
  // Implementação atual checa permission primeiro, depois has bankData.
  // Caso permission OK e sem bankData → omit.
  const r = resolveBankDataField(emptyBlob(), {
    tenantId: TENANT_A, wantsUnmask: true, role: 'SUPERADMIN',
  })
  assert.equal(r.kind, 'omit')
})

test('unmask + decrypt falha (tag tampered) → decryptError', () => {
  const blob = realBlob()
  // Corrompe tag para forçar AES-GCM auth failure.
  const tag = Buffer.from(blob.tag as Uint8Array)
  tag[0] = tag[0] ^ 0xff
  const r = resolveBankDataField({ ...blob, tag }, {
    tenantId: TENANT_A, wantsUnmask: true, role: 'SUPERADMIN',
  })
  assert.equal(r.kind, 'decryptError')
})

test('default + decrypt falha (tampered) → masked com error: unavailable', () => {
  const blob = realBlob()
  const tag = Buffer.from(blob.tag as Uint8Array)
  tag[0] = tag[0] ^ 0xff
  const r = resolveBankDataField({ ...blob, tag }, {
    tenantId: TENANT_A, wantsUnmask: false, role: 'ADMIN',
  })
  assert.equal(r.kind, 'masked')
  if (r.kind === 'masked') {
    assert.equal(r.data.error, 'unavailable')
    assert.equal(r.data.last4, '????')
  }
})

test('header com role undefined + unmask → forbidden (defesa em profundidade)', () => {
  const r = resolveBankDataField(realBlob(), {
    tenantId: TENANT_A, wantsUnmask: true, role: undefined,
  })
  assert.equal(r.kind, 'forbidden')
})

test('conta com formatação não-numérica usa últimos 4 chars válidos', () => {
  const blob = encryptBankData(
    { ...SAMPLE_BANK, conta: '987-65' },
    TENANT_A,
  )
  const r = resolveBankDataField(
    { enc: blob.enc, iv: blob.iv, tag: blob.tag },
    { tenantId: TENANT_A, wantsUnmask: false, role: 'ADMIN' },
  )
  assert.equal(r.kind, 'masked')
  if (r.kind === 'masked') {
    // conta '987-65' digits = '98765' → last4 = '8765'
    assert.equal(r.data.last4, '8765')
  }
})

test('conta curta (<4 dígitos) usa fallback XXXX', () => {
  const blob = encryptBankData(
    { ...SAMPLE_BANK, conta: '12' },
    TENANT_A,
  )
  const r = resolveBankDataField(
    { enc: blob.enc, iv: blob.iv, tag: blob.tag },
    { tenantId: TENANT_A, wantsUnmask: false, role: 'ADMIN' },
  )
  assert.equal(r.kind, 'masked')
  if (r.kind === 'masked') {
    assert.equal(r.data.last4, 'XXXX')
  }
})
