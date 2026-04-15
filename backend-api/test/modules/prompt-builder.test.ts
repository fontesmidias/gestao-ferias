import test from 'node:test'
import assert from 'node:assert'
import { PromptBuilder, TenantContext } from '../../src/modules/ai/prompt-builder'

function makeTenantContext(overrides?: Partial<TenantContext>): TenantContext {
  return {
    tenantName: 'Green House',
    totalEmployees: 120,
    pendingRequests: 5,
    approvedRequests: 10,
    coverageGaps: 3,
    workplaces: [
      { name: 'Posto Central', minStaff: 10, currentStaff: 8 },
      { name: 'Posto Norte', minStaff: 6, currentStaff: 6 },
    ],
    feristasAvailable: 4,
    upcomingVacations: [
      {
        employeeName: 'João Silva',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-15'),
        days: 15,
      },
      {
        employeeName: 'Maria Santos',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-10'),
        days: 10,
      },
    ],
    ...overrides,
  }
}

test('PromptBuilder - buildSystemPrompt', async (t) => {
  await t.test('Should contain tenant name in prompt', () => {
    const ctx = makeTenantContext()
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('Green House'))
  })

  await t.test('Should contain employee count in prompt', () => {
    const ctx = makeTenantContext({ totalEmployees: 250 })
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('250'))
  })

  await t.test('Should contain workplace names and staff info', () => {
    const ctx = makeTenantContext()
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('Posto Central'))
    assert.ok(prompt.includes('Posto Norte'))
    assert.ok(prompt.includes('mín: 10'))
    assert.ok(prompt.includes('atual: 8'))
  })

  await t.test('Should contain feristas available count', () => {
    const ctx = makeTenantContext({ feristasAvailable: 7 })
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('7'))
  })

  await t.test('Should contain upcoming vacation employee names', () => {
    const ctx = makeTenantContext()
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('João Silva'))
    assert.ok(prompt.includes('Maria Santos'))
  })

  await t.test('Should show fallback when no workplaces exist', () => {
    const ctx = makeTenantContext({ workplaces: [] })
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('Nenhum posto cadastrado'))
  })

  await t.test('Should show fallback when no upcoming vacations', () => {
    const ctx = makeTenantContext({ upcomingVacations: [] })
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('Nenhuma férias agendada'))
  })

  await t.test('Should contain pending and approved requests counts', () => {
    const ctx = makeTenantContext({ pendingRequests: 12, approvedRequests: 25 })
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('12'))
    assert.ok(prompt.includes('25'))
  })

  await t.test('Should contain CLT article references', () => {
    const ctx = makeTenantContext()
    const prompt = PromptBuilder.buildSystemPrompt(ctx)

    assert.ok(prompt.includes('CLT'))
    assert.ok(prompt.includes('130'))
    assert.ok(prompt.includes('134'))
    assert.ok(prompt.includes('137'))
  })
})

test('PromptBuilder - buildSourceAttribution', async (t) => {
  await t.test('Should contain approved requests count', () => {
    const ctx = makeTenantContext({ approvedRequests: 15 })
    const attribution = PromptBuilder.buildSourceAttribution(ctx)

    assert.ok(attribution.includes('15 férias agendadas'))
  })

  await t.test('Should contain workplace count and gaps', () => {
    const ctx = makeTenantContext({ coverageGaps: 5 })
    const attribution = PromptBuilder.buildSourceAttribution(ctx)

    assert.ok(attribution.includes('2 postos'))
    assert.ok(attribution.includes('5 gaps'))
  })

  await t.test('Should contain feristas available count', () => {
    const ctx = makeTenantContext({ feristasAvailable: 3 })
    const attribution = PromptBuilder.buildSourceAttribution(ctx)

    assert.ok(attribution.includes('3 feristas disponíveis'))
  })

  await t.test('Should return a single-line string', () => {
    const ctx = makeTenantContext()
    const attribution = PromptBuilder.buildSourceAttribution(ctx)

    assert.strictEqual(attribution.split('\n').length, 1)
  })
})
