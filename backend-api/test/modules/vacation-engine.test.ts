import test from 'node:test'
import assert from 'node:assert'
import { parseISO } from 'date-fns'
import { VacationEngine } from '../../src/modules/vacations/vacation-engine'

test('VacationEngine - CLT Art. 134 Validation', async (t) => {
  await t.test('Should block starting vacation on a Thursday', () => {
    // 2026-05-07 is a Thursday
    const startDate = parseISO('2026-05-07T09:00:00Z')
    const endDate = parseISO('2026-05-20T09:00:00Z')
    
    const result = VacationEngine.validateRequest(startDate, endDate, 30)
    
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('quintas ou sextas')))
  })

  await t.test('Should block starting vacation on a Friday', () => {
    // 2026-05-08 is a Friday
    const startDate = parseISO('2026-05-08T09:00:00Z')
    const endDate = parseISO('2026-05-20T09:00:00Z')
    
    const result = VacationEngine.validateRequest(startDate, endDate, 30)
    
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('quintas ou sextas')))
  })

  await t.test('Should allow starting vacation on a Monday', () => {
    // 2026-05-11 is a Monday
    const startDate = parseISO('2026-05-11T09:00:00Z')
    const endDate = parseISO('2026-05-20T09:00:00Z')
    
    const result = VacationEngine.validateRequest(startDate, endDate, 30)
    
    assert.strictEqual(result.isValid, true)
    assert.strictEqual(result.errors.length, 0)
  })

  await t.test('Should block requests fewer than 5 days', () => {
    const startDate = parseISO('2026-05-11T09:00:00Z') // Monday
    const endDate = parseISO('2026-05-14T09:00:00Z') // Thursday (4 days total)
    
    const result = VacationEngine.validateRequest(startDate, endDate, 30)
    
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('mínimo de férias permitido é de 5 dias')))
  })

  await t.test('Should block when requested days exceed balance', () => {
    const startDate = parseISO('2026-05-11T09:00:00Z') // Monday
    const endDate = parseISO('2026-05-30T09:00:00Z') // 20 days
    
    const result = VacationEngine.validateRequest(startDate, endDate, 15) // Only 15 days balance
    
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('Saldo insuficiente')))
  })
})

test('VacationEngine - CLT Art. 130 Balances', async (t) => {
  await t.test('Should calculate 30 days balance for 0 absences', () => {
    const hireDate = parseISO('2020-01-01T09:00:00Z')
    const periods = VacationEngine.calculatePeriods(hireDate, 0)
    
    // The first completed period should have 30 days
    assert.strictEqual(periods[0].daysOfRight, 30)
  })

  await t.test('Should reduce balance to 24 days for 6-14 absences', () => {
    const hireDate = parseISO('2020-01-01T09:00:00Z')
    const periods = VacationEngine.calculatePeriods(hireDate, 10) // 10 absences
    
    assert.strictEqual(periods[0].daysOfRight, 24)
  })

  await t.test('Should return 0 balance for more than 32 absences', () => {
    const hireDate = parseISO('2020-01-01T09:00:00Z')
    const periods = VacationEngine.calculatePeriods(hireDate, 35) // 35 absences
    
    assert.strictEqual(periods[0].daysOfRight, 0)
  })
})
