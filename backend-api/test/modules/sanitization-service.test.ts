import test from 'node:test'
import assert from 'node:assert'
import { SanitizationService } from '../../src/modules/employees/sanitization-service'

test('SanitizationService', async (t) => {
  await t.test('sanitizeName should format to Title Case', () => {
    assert.strictEqual(SanitizationService.sanitizeName('BRUNO sANTOS'), 'Bruno Santos')
    assert.strictEqual(SanitizationService.sanitizeName('  ana oliveira  '), 'Ana Oliveira')
    assert.strictEqual(SanitizationService.sanitizeName(''), '')
  })

  await t.test('sanitizeCPF should keep only numbers', () => {
    assert.strictEqual(SanitizationService.sanitizeCPF('123.456.789-10'), '12345678910')
    assert.strictEqual(SanitizationService.sanitizeCPF('00011122233'), '00011122233')
    assert.strictEqual(SanitizationService.sanitizeCPF(''), '')
  })

  await t.test('sanitizeDate should parse standard ISO dates', () => {
    const rawDate = '2026-05-11T00:00:00.000Z'
    const d = SanitizationService.sanitizeDate(rawDate)
    assert.strictEqual(d.getFullYear(), 2026)
    assert.strictEqual(d.getMonth(), 4) // Zero-indexed (May)
    assert.strictEqual(d.getUTCDate(), 11)
  })

  await t.test('sanitizeDate should parse Brazilian date formats (dd/MM/yyyy)', () => {
    const d = SanitizationService.sanitizeDate('15/08/2025')
    assert.strictEqual(d.getFullYear(), 2025)
    assert.strictEqual(d.getMonth(), 7) // August
    assert.strictEqual(d.getDate(), 15)
  })

  await t.test('sanitizeDate should throw error for invalid dates', () => {
    assert.throws(
      () => SanitizationService.sanitizeDate('some-invalid-string'),
      { message: /Formato de data inválido/ }
    )
    
    assert.throws(
      () => SanitizationService.sanitizeDate(''),
      { message: /Data de admissão ausente/ }
    )
  })
})
