import test from 'node:test'
import assert from 'node:assert'
import { validateConfirmTenantName } from '../../src/modules/imports/apply-validators'

test('validateConfirmTenantName — bate exato → ok', () => {
  const r = validateConfirmTenantName({ tenantName: 'Servi-Plus', provided: 'Servi-Plus' })
  assert.deepStrictEqual(r, { ok: true })
})

test('validateConfirmTenantName — divergente → CONFIRMATION_MISMATCH', () => {
  const r = validateConfirmTenantName({ tenantName: 'Servi-Plus', provided: 'Outro' })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'CONFIRMATION_MISMATCH')
})

test('validateConfirmTenantName — case-sensitive', () => {
  const r = validateConfirmTenantName({ tenantName: 'Servi-Plus', provided: 'servi-plus' })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'CONFIRMATION_MISMATCH')
})

test('validateConfirmTenantName — tenantName null → INVALID_TARGET_TENANT', () => {
  const r = validateConfirmTenantName({ tenantName: null, provided: 'X' })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'INVALID_TARGET_TENANT')
})

test('validateConfirmTenantName — provided null → CONFIRMATION_MISMATCH', () => {
  const r = validateConfirmTenantName({ tenantName: 'X', provided: null })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'CONFIRMATION_MISMATCH')
})
