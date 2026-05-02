import test from 'node:test'
import assert from 'node:assert'
import { validateUploadedFile } from '../../src/routes/api/v1/admin/imports/employees/validators'

test('validateUploadedFile — filename ausente → INVALID_FILE_FORMAT', () => {
  const r = validateUploadedFile({ filename: null, size: 100 })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'INVALID_FILE_FORMAT')
})

test('validateUploadedFile — filename vazio (whitespace) → INVALID_FILE_FORMAT', () => {
  const r = validateUploadedFile({ filename: '   ', size: 100 })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'INVALID_FILE_FORMAT')
})

test('validateUploadedFile — extensão .csv → INVALID_FILE_FORMAT', () => {
  const r = validateUploadedFile({ filename: 'foo.csv', size: 100 })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'INVALID_FILE_FORMAT')
})

test('validateUploadedFile — sem extensão → INVALID_FILE_FORMAT', () => {
  const r = validateUploadedFile({ filename: 'planilha', size: 100 })
  assert.strictEqual(r.ok, false)
})

test('validateUploadedFile — extensão .XLSX maiúscula → ok', () => {
  const r = validateUploadedFile({ filename: 'Foo.XLSX', size: 100 })
  assert.strictEqual(r.ok, true)
})

test('validateUploadedFile — extensão .Xlsx mista → ok', () => {
  const r = validateUploadedFile({ filename: 'tirvu.Xlsx', size: 100 })
  assert.strictEqual(r.ok, true)
})

test('validateUploadedFile — size <= 10MB → ok', () => {
  const r = validateUploadedFile({ filename: 'a.xlsx', size: 9_999_999 })
  assert.strictEqual(r.ok, true)
})

test('validateUploadedFile — size > 10MB → FILE_TOO_LARGE', () => {
  const r = validateUploadedFile({ filename: 'a.xlsx', size: 10_000_001 })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'FILE_TOO_LARGE')
})

test('validateUploadedFile — maxBytes custom respeitado', () => {
  const r = validateUploadedFile({ filename: 'a.xlsx', size: 5000, maxBytes: 4000 })
  assert.strictEqual(r.ok, false)
  if (!r.ok) assert.strictEqual(r.code, 'FILE_TOO_LARGE')
})

test('validateUploadedFile — happy path retorna { ok: true }', () => {
  const r = validateUploadedFile({ filename: 'serviplus.xlsx', size: 5_000_000 })
  assert.deepStrictEqual(r, { ok: true })
})
