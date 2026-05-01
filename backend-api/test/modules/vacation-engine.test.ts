import test from 'node:test'
import assert from 'node:assert'
import { parseISO } from 'date-fns'
import { VacationEngine } from '../../src/modules/vacations/vacation-engine'

test('VacationEngine - CLT Art. 134 Validation', async (t) => {
  await t.test('Should block starting vacation on a Sunday', () => {
    // 2026-05-10 is a Sunday
    const startDate = parseISO('2026-05-10T09:00:00Z')
    const endDate = parseISO('2026-05-20T09:00:00Z')

    const result = VacationEngine.validateRequest(startDate, endDate, 30)

    assert.strictEqual(result.isValid, false)
    assert.ok(result.errorDetails?.some(e => e.code === 'LEGAL_BLOCK_SUNDAY'))
  })

  await t.test('Should allow starting vacation on a Friday (Sunday-only block)', () => {
    // 2026-05-08 é sexta — antes era bloqueada, agora permitida (regra refinada V3.1)
    const startDate = parseISO('2026-05-08T09:00:00Z')
    const endDate = parseISO('2026-05-20T09:00:00Z')

    const result = VacationEngine.validateRequest(startDate, endDate, 30)

    assert.strictEqual(result.isValid, true)
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

test('VacationEngine - CLT Art. 134 §1º Fracionamento (Lei 13.467/2017)', async (t) => {
  await t.test('Primeira fração com 14+ dias é permitida', () => {
    const start = parseISO('2026-05-11T12:00:00Z') // segunda
    const end = parseISO('2026-05-24T12:00:00Z')   // domingo (14 dias)
    const result = VacationEngine.validateRequest(start, end, 30, {
      existingFractions: [],
      periodDaysOfRight: 30
    })
    assert.strictEqual(result.isValid, true)
  })

  await t.test('Primeira fração com menos de 14 dias é bloqueada', () => {
    const start = parseISO('2026-05-11T12:00:00Z') // segunda
    const end = parseISO('2026-05-20T12:00:00Z')   // 10 dias
    const result = VacationEngine.validateRequest(start, end, 30, {
      existingFractions: [],
      periodDaysOfRight: 30
    })
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errorDetails?.some(e => e.code === 'LEGAL_BLOCK_FIRST_FRACTION_TOO_SHORT'))
  })

  await t.test('Segunda fração com 5+ dias é permitida quando 1ª teve 14+', () => {
    const start = parseISO('2026-08-10T12:00:00Z') // segunda
    const end = parseISO('2026-08-14T12:00:00Z')   // 5 dias
    const result = VacationEngine.validateRequest(start, end, 16, {
      existingFractions: [{
        startDate: parseISO('2026-05-11T12:00:00Z'),
        endDate: parseISO('2026-05-24T12:00:00Z'),
        days: 14,
        status: 'APPROVED'
      }],
      periodDaysOfRight: 30
    })
    assert.strictEqual(result.isValid, true)
  })

  await t.test('Segunda fração com menos de 5 dias é bloqueada', () => {
    const start = parseISO('2026-08-10T12:00:00Z')
    const end = parseISO('2026-08-12T12:00:00Z') // 3 dias
    const result = VacationEngine.validateRequest(start, end, 16, {
      existingFractions: [{
        startDate: parseISO('2026-05-11T12:00:00Z'),
        endDate: parseISO('2026-05-24T12:00:00Z'),
        days: 14,
        status: 'APPROVED'
      }],
      periodDaysOfRight: 30
    })
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errorDetails?.some(e => e.code === 'LEGAL_BLOCK_FRACTION_TOO_SHORT'))
  })

  await t.test('Quarta fração é bloqueada (máx 3)', () => {
    const start = parseISO('2026-12-07T12:00:00Z')
    const end = parseISO('2026-12-11T12:00:00Z')
    const result = VacationEngine.validateRequest(start, end, 30, {
      existingFractions: [
        { startDate: parseISO('2026-05-11'), endDate: parseISO('2026-05-24'), days: 14, status: 'APPROVED' },
        { startDate: parseISO('2026-08-10'), endDate: parseISO('2026-08-14'), days: 5, status: 'APPROVED' },
        { startDate: parseISO('2026-10-12'), endDate: parseISO('2026-10-16'), days: 5, status: 'APPROVED' }
      ],
      periodDaysOfRight: 30
    })
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errorDetails?.some(e => e.code === 'LEGAL_BLOCK_TOO_MANY_FRACTIONS'))
  })

  await t.test('Soma das frações excedendo direito do aquisitivo é bloqueada', () => {
    const start = parseISO('2026-08-10T12:00:00Z')
    const end = parseISO('2026-09-08T12:00:00Z') // 30 dias
    const result = VacationEngine.validateRequest(start, end, 30, {
      existingFractions: [{
        startDate: parseISO('2026-05-11'), endDate: parseISO('2026-05-24'), days: 14, status: 'APPROVED'
      }],
      periodDaysOfRight: 30
    })
    assert.strictEqual(result.isValid, false)
    assert.ok(result.errorDetails?.some(e => e.code === 'LEGAL_BLOCK_TOTAL_EXCEEDS_PERIOD_DAYS'))
  })

  await t.test('Frações REJEITADAS não contam para o limite', () => {
    const start = parseISO('2026-05-11T12:00:00Z')
    const end = parseISO('2026-05-24T12:00:00Z') // 14 dias
    const result = VacationEngine.validateRequest(start, end, 30, {
      existingFractions: [{
        startDate: parseISO('2026-03-01'), endDate: parseISO('2026-03-14'), days: 14, status: 'REJECTED'
      }],
      periodDaysOfRight: 30
    })
    // Como rejeitada não conta, esta vira a 1ª fração e tem 14 dias → válida
    assert.strictEqual(result.isValid, true)
  })

  await t.test('analyzeFractioning retorna estado correto inicial', () => {
    const a = VacationEngine.analyzeFractioning([], 30)
    assert.strictEqual(a.fractionsUsed, 0)
    assert.strictEqual(a.daysRemaining, 30)
    assert.strictEqual(a.hasFractionWith14Plus, false)
    assert.strictEqual(a.nextRequestMinDays, 14)
  })

  await t.test('analyzeFractioning após 1ª fração de 14d → mínimo da próxima vira 5', () => {
    const a = VacationEngine.analyzeFractioning([
      { startDate: new Date('2026-05-11'), endDate: new Date('2026-05-24'), days: 14, status: 'APPROVED' }
    ], 30)
    assert.strictEqual(a.fractionsUsed, 1)
    assert.strictEqual(a.daysUsed, 14)
    assert.strictEqual(a.daysRemaining, 16)
    assert.strictEqual(a.hasFractionWith14Plus, true)
    assert.strictEqual(a.nextRequestMinDays, 5)
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
