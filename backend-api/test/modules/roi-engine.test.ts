import test from 'node:test'
import assert from 'node:assert'
import { ROIEngine } from '../../src/modules/finance/roi-engine'
import { Prisma } from '@prisma/client'

test('ROIEngine - Financial Impact Calculation', async (t) => {
  await t.test('Should correctly calculate 30 days of impact for a salary of 3000', () => {
    const impact = ROIEngine.calculateImpact(3000, 30)

    // Daily rate = 100, so 30 days = 3000
    assert.strictEqual(impact.baseAmount, 3000)
    
    // 1/3 Bonus = 1000
    assert.strictEqual(impact.bonusOneThird, 1000)
    
    // FGTS 8% on (3000 + 1000) = 320
    assert.strictEqual(impact.fgts, 320)
    
    // Replacement Cost (20% of base) = 600
    assert.strictEqual(impact.replacementCost, 600)

    // Total = 3000 + 1000 + 320 + 600 = 4920
    assert.strictEqual(impact.totalContingency, 4920)
  })

  await t.test('Should handle Prisma.Decimal types correctly', () => {
    const decimalSalary = new Prisma.Decimal('4500.50')
    const impact = ROIEngine.calculateImpact(decimalSalary, 15) // 15 days

    // Daily rate = 4500.5 / 30 = 150.0166...
    // 15 days base: 2250.25
    assert.strictEqual(impact.baseAmount, 2250.25)
    
    // 1/3 Bonus: 750.08
    assert.strictEqual(impact.bonusOneThird, 750.08)
  })

  await t.test('Should calculate 10 days of vacation correctly', () => {
    const impact = ROIEngine.calculateImpact(3000, 10)

    assert.strictEqual(impact.baseAmount, 1000)
    assert.strictEqual(impact.bonusOneThird, 333.33) // Rounded
    assert.strictEqual(impact.fgts, 106.67) // 8% of 1333.33
    assert.strictEqual(impact.replacementCost, 200) // 20% of 1000
    assert.strictEqual(impact.totalContingency, 1640)
  })

  await t.test('Should return all zeros for salary of 0', () => {
    const impact = ROIEngine.calculateImpact(0, 30)

    assert.strictEqual(impact.baseAmount, 0)
    assert.strictEqual(impact.bonusOneThird, 0)
    assert.strictEqual(impact.fgts, 0)
    assert.strictEqual(impact.replacementCost, 0)
    assert.strictEqual(impact.totalContingency, 0)
  })

  await t.test('Should match known values for salary 3000 and 30 days', () => {
    const impact = ROIEngine.calculateImpact(3000, 30)

    assert.strictEqual(impact.baseAmount, 3000)
    assert.strictEqual(impact.bonusOneThird, 1000)
    assert.strictEqual(impact.fgts, 320)
    assert.strictEqual(impact.replacementCost, 600)
  })

  await t.test('totalContingency should equal sum of all components', () => {
    const impact = ROIEngine.calculateImpact(5000, 20)

    const expectedTotal = impact.baseAmount + impact.bonusOneThird + impact.fgts + impact.replacementCost
    assert.strictEqual(impact.totalContingency, ROIEngine['round'](expectedTotal))
  })
})
