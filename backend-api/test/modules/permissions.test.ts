import test from 'node:test'
import assert from 'node:assert'
import {
  PERMISSION_TO_ROLES,
  isPermissionKey,
  roleHasPermission,
} from '../../src/modules/auth/permissions'

test('permissions mapa estático', async (t) => {
  await t.test('contém import.run com [SUPERADMIN, ADMIN]', () => {
    assert.deepStrictEqual([...PERMISSION_TO_ROLES['import.run']], ['SUPERADMIN', 'ADMIN'])
  })

  await t.test('contém bankData.view com [SUPERADMIN]', () => {
    assert.deepStrictEqual([...PERMISSION_TO_ROLES['bankData.view']], ['SUPERADMIN'])
  })

  await t.test('isPermissionKey reconhece keys válidas', () => {
    assert.strictEqual(isPermissionKey('import.run'), true)
    assert.strictEqual(isPermissionKey('bankData.view'), true)
  })

  await t.test('isPermissionKey rejeita keys inválidas', () => {
    assert.strictEqual(isPermissionKey('foo'), false)
    assert.strictEqual(isPermissionKey(''), false)
    assert.strictEqual(isPermissionKey('IMPORT.RUN'), false) // case-sensitive
  })

  await t.test('roleHasPermission — SUPERADMIN tem import.run', () => {
    assert.strictEqual(roleHasPermission('SUPERADMIN', 'import.run'), true)
  })

  await t.test('roleHasPermission — ADMIN tem import.run', () => {
    assert.strictEqual(roleHasPermission('ADMIN', 'import.run'), true)
  })

  await t.test('roleHasPermission — USER NÃO tem import.run', () => {
    assert.strictEqual(roleHasPermission('USER', 'import.run'), false)
  })

  await t.test('roleHasPermission — AUDITOR NÃO tem import.run', () => {
    assert.strictEqual(roleHasPermission('AUDITOR', 'import.run'), false)
  })

  await t.test('roleHasPermission — undefined role retorna false', () => {
    assert.strictEqual(roleHasPermission(undefined, 'import.run'), false)
  })

  await t.test('roleHasPermission — empty string retorna false', () => {
    assert.strictEqual(roleHasPermission('', 'import.run'), false)
  })

  await t.test('roleHasPermission — ADMIN NÃO tem bankData.view (only SUPERADMIN no MVP)', () => {
    assert.strictEqual(roleHasPermission('ADMIN', 'bankData.view'), false)
  })

  await t.test('roleHasPermission — SUPERADMIN tem bankData.view', () => {
    assert.strictEqual(roleHasPermission('SUPERADMIN', 'bankData.view'), true)
  })
})
