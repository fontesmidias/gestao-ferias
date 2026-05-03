// V3 Conformance — Quick wins bundle Q1-Q7 (audit-2026-05-03).
// Cobre gaps de AC apontados pela auditoria contra `epics.md` v3-postos-cobertura-ai:
//   Q1: GET /workplaces paginação `{ data, meta }`
//   Q2: DELETE /workplaces/:id retorna 204
//   Q4: POST /coverages com type=FERISTA exige replacement.isFerista=true
//   Q5: GET /coverages/suggestions inclui conflictFree + canChain
//   Q6: PATCH /vacations REJECTED sem dispatchNote → 422
//   Q7: GET /audit-logs sem role ADMIN → 403

process.env.BANK_DATA_ENCRYPTION_KEY ??= '0+5mYyV8DG7BUSmJ6ugef35NARVs5HJ+TbogSnOD0D4='
process.env.JWT_SECRET ??= 'ci_test_secret_key_not_for_production'
process.env.IMPORT_FILE_STORAGE_PATH ??= '/tmp/imports-security-test'

import test from 'node:test'
import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

const appModule = require('../../src/app') as typeof import('../../src/app')

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })
  await fastify.register(fp(appModule.default))
  await fastify.ready()
  return fastify
}

function uniqCnpj(): string {
  const n = randomBytes(7).toString('hex').slice(0, 14).replace(/[a-f]/g, (c) =>
    String(((c.charCodeAt(0) - 'a'.charCodeAt(0)) % 10)),
  )
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12, 14)}`
}
function uniqEmail(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}@x.test`
}
function uniqCpf(): string {
  const n = randomBytes(6).toString('hex').replace(/[a-f]/g, '0').slice(0, 11)
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9, 11)}`
}

const PREFIX = 'V3QW-'

test('V3 conformance — quick wins Q1-Q7', async (t) => {
  const app = await buildApp()
  t.after(async () => { await app.close() })
  const prisma = app.prisma

  // Pre-cleanup defensivo de runs órfãos.
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const stale = await prisma.tenant.findMany({
      where: { name: { startsWith: PREFIX }, createdAt: { lt: oneHourAgo } },
      select: { id: true },
    })
    if (stale.length > 0) {
      const ids = stale.map((s) => s.id)
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.coverageAssignment.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.workplaceAllocation.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.vacationRequest.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.workplacePosition.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.workplace.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.employee.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.user.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
    }
  } catch { /* best-effort */ }

  // Setup tenant + admin + employee user.
  const tenant = await prisma.tenant.create({
    data: { name: `${PREFIX}${randomBytes(4).toString('hex')}`, cnpj: uniqCnpj() },
  })
  const adminUser = await prisma.user.create({
    data: { email: uniqEmail('admin'), role: 'ADMIN', tenantId: tenant.id, name: 'Admin Q' },
  })
  const employeeUser = await prisma.user.create({
    data: { email: uniqEmail('emp'), role: 'EMPLOYEE', tenantId: tenant.id, name: 'Emp Q' },
  })

  function token(u: { id: string; tenantId: string | null; role: string }): string {
    return app.jwt.sign({ userId: u.id, tenantId: u.tenantId, role: u.role })
  }
  const tokenAdmin = token(adminUser)
  const tokenEmployee = token(employeeUser)
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` })

  // Cleanup com try/catch.
  t.after(async () => {
    const safe = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn() } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[cleanup] ${label}:`, (e as Error).message)
      }
    }
    await safe('auditLog', () => prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('coverage', () => prisma.coverageAssignment.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('allocation', () => prisma.workplaceAllocation.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('vacation', () => prisma.vacationRequest.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('position', () => prisma.workplacePosition.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('workplace', () => prisma.workplace.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('employee', () => prisma.employee.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('user', () => prisma.user.deleteMany({ where: { tenantId: tenant.id } }))
    await safe('tenant', () => prisma.tenant.delete({ where: { id: tenant.id } }))
  })

  // ===== Q1: GET /workplaces paginação =====
  // Cria 3 workplaces para validar paginação com limit=2 → 2 itens, total=3.
  const wpIds: string[] = []
  for (let i = 0; i < 3; i++) {
    const wp = await prisma.workplace.create({
      data: { name: `${PREFIX}WP${i}-${randomBytes(2).toString('hex')}`, tenantId: tenant.id, minStaff: 1 },
    })
    wpIds.push(wp.id)
  }

  await t.test('Q1: GET /workplaces?page=1&limit=2 retorna { data, meta }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workplaces?page=1&limit=2', headers: auth(tokenAdmin) })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(Array.isArray(body.data), 'data deve ser array')
    assert.ok(body.meta, 'meta deve existir')
    assert.equal(body.meta.page, 1)
    assert.equal(body.meta.limit, 2)
    assert.ok(typeof body.meta.total === 'number' && body.meta.total >= 3, `total >= 3, got ${body.meta.total}`)
    assert.ok(body.data.length <= 2, `limit honored, got ${body.data.length}`)
  })

  // ===== Q2: DELETE /workplaces/:id retorna 204 =====
  await t.test('Q2: DELETE /workplaces/:id retorna 204 sem body', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workplaces/${wpIds[0]}`,
      headers: auth(tokenAdmin),
    })
    assert.equal(res.statusCode, 204, `Expected 204, got ${res.statusCode}: ${res.payload}`)
    assert.equal(res.payload, '', 'Body deve ser vazio em 204')
  })

  // Setup adicional para Q4/Q5/Q6: position + employees + vacation.
  const position = await prisma.workplacePosition.create({
    data: { workplaceId: wpIds[1], role: 'Vigilante', requiredCount: 1, tenantId: tenant.id },
  })
  const empOnVacation = await prisma.employee.create({
    data: {
      tenantId: tenant.id, name: 'Emp Original', cpf: uniqCpf(),
      hireDate: new Date('2020-01-01'),
      employeeType: 'EFETIVO', isFerista: false,
      salary: 3000,
    },
  })
  const empNotFerista = await prisma.employee.create({
    data: {
      tenantId: tenant.id, name: 'Não Ferista', cpf: uniqCpf(),
      hireDate: new Date('2020-01-01'),
      employeeType: 'EFETIVO', isFerista: false,
      salary: 3000,
    },
  })
  const empFerista = await prisma.employee.create({
    data: {
      tenantId: tenant.id, name: 'Ferista', cpf: uniqCpf(),
      hireDate: new Date('2020-01-01'),
      employeeType: 'EFETIVO', isFerista: true,
      salary: 3000,
    },
  })
  await prisma.workplaceAllocation.create({
    data: { tenantId: tenant.id, employeeId: empOnVacation.id, workplacePositionId: position.id, status: 'ACTIVE', startDate: new Date('2020-01-01') },
  })

  const vacation = await prisma.vacationRequest.create({
    data: {
      tenantId: tenant.id, employeeId: empOnVacation.id,
      startDate: new Date('2030-06-01'), endDate: new Date('2030-06-15'),
      days: 15, status: 'APPROVED',
    },
  })

  // ===== Q4: POST /coverages type=FERISTA com replacement.isFerista=false → 422 =====
  await t.test('Q4: POST /coverages type=FERISTA com replacement não-ferista → 422', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/coverages', headers: auth(tokenAdmin),
      payload: {
        vacationRequestId: vacation.id,
        replacementEmployeeId: empNotFerista.id,
        workplacePositionId: position.id,
        startDate: '2030-06-01', endDate: '2030-06-15',
        type: 'FERISTA',
      },
    })
    assert.equal(res.statusCode, 422, `Expected 422, got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.code, 'INVALID_REPLACEMENT_FOR_TYPE')
  })

  await t.test('Q4: POST /coverages type=FERISTA com replacement.isFerista=true → 201, status ACTIVE', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/coverages', headers: auth(tokenAdmin),
      payload: {
        vacationRequestId: vacation.id,
        replacementEmployeeId: empFerista.id,
        workplacePositionId: position.id,
        startDate: '2030-06-01', endDate: '2030-06-15',
        type: 'FERISTA',
      },
    })
    assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.status, 'ACTIVE', 'status default deve ser ACTIVE (Story 2.3 AC)')
    // Cleanup imediato.
    await prisma.coverageAssignment.delete({ where: { id: body.id } })
  })

  // ===== Q5: GET /coverages/suggestions retorna conflictFree + canChain =====
  await t.test('Q5: GET /coverages/suggestions inclui conflictFree e canChain', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/coverages/suggestions?vacationRequestId=${vacation.id}`,
      headers: auth(tokenAdmin),
    })
    assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.ok(body.suggestions?.feristas, 'feristas array deve existir')
    if (body.suggestions.feristas.length > 0) {
      const f = body.suggestions.feristas[0]
      assert.equal(f.conflictFree, true, 'feristas devem ter conflictFree=true')
      assert.ok(typeof f.canChain === 'boolean', 'feristas devem ter canChain boolean')
    }
    if (body.suggestions.intermitentes.length > 0) {
      const i = body.suggestions.intermitentes[0]
      assert.equal(i.conflictFree, true)
      assert.ok(typeof i.canChain === 'boolean')
    }
  })

  // ===== Q6: PATCH /vacations REJECTED sem dispatchNote → 422 =====
  await t.test('Q6: PATCH /vacations REJECTED sem dispatchNote → 422', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/vacations/${vacation.id}`,
      headers: auth(tokenAdmin),
      payload: { status: 'REJECTED' },
    })
    assert.equal(res.statusCode, 422, `Expected 422, got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.code, 'REJECTION_REASON_REQUIRED')
  })

  await t.test('Q6: PATCH /vacations REJECTED com dispatchNote vazio (whitespace) → 422', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/vacations/${vacation.id}`,
      headers: auth(tokenAdmin),
      payload: { status: 'REJECTED', dispatchNote: '   ' },
    })
    assert.equal(res.statusCode, 422)
  })

  // ===== Q7: GET /audit-logs sem role ADMIN → 403 =====
  await t.test('Q7: GET /audit-logs como EMPLOYEE → 403', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/audit-logs', headers: auth(tokenEmployee),
    })
    assert.equal(res.statusCode, 403, `Expected 403, got ${res.statusCode}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.error, 'Forbidden')
  })

  await t.test('Q7: GET /audit-logs como ADMIN → 200', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/audit-logs', headers: auth(tokenAdmin),
    })
    assert.equal(res.statusCode, 200)
  })

  // ===== M1 (Story 2.5): GET /coverages/kpis =====
  // Cria 1 cobertura ACTIVE em 2030-06 para popular gapsTotal/cost.
  const kpiCoverage = await prisma.coverageAssignment.create({
    data: {
      tenantId: tenant.id,
      vacationRequestId: vacation.id,
      replacementEmployeeId: empFerista.id,
      workplacePositionId: position.id,
      startDate: new Date('2030-06-05'),
      endDate: new Date('2030-06-10'),
      type: 'FERISTA',
      status: 'ACTIVE',
      cost: 600,
    },
  })

  await t.test('M1: GET /coverages/kpis?month=2030-06 retorna shape correto', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/coverages/kpis?month=2030-06',
      headers: auth(tokenAdmin),
    })
    assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.month, '2030-06')
    assert.ok(typeof body.gapsTotal === 'number')
    assert.ok(typeof body.estimatedCoverageMonthCost === 'number')
    assert.ok(typeof body.availableFeristasCount === 'number')
    // Custo deve incluir os 600 da cobertura criada acima.
    assert.ok(body.estimatedCoverageMonthCost >= 600,
      `cost >= 600, got ${body.estimatedCoverageMonthCost}`)
  })

  await t.test('M1: GET /coverages/kpis sem month → mês corrente, 200', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/coverages/kpis',
      headers: auth(tokenAdmin),
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.match(body.month, /^\d{4}-\d{2}$/)
  })

  await t.test('M1: GET /coverages/kpis com month inválido → 400', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/coverages/kpis?month=abc',
      headers: auth(tokenAdmin),
    })
    // Pattern do schema rejeita antes de chegar no handler.
    assert.equal(res.statusCode, 400)
  })

  // Cleanup KPI coverage (será garbage-collected pelo cleanup global, mas mantém isolamento).
  await prisma.coverageAssignment.delete({ where: { id: kpiCoverage.id } }).catch(() => {})

  // ===== M3 (Story 4.4): /predict/ask filtra perguntas fora de escopo =====
  await t.test('M3: POST /predict/ask com pergunta out-of-scope → 200, scope=out_of_scope, sem chamada LLM', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/predict/ask',
      headers: auth(tokenAdmin),
      payload: { question: 'Qual a previsão do tempo amanhã?' },
    })
    assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.scope, 'out_of_scope')
    assert.equal(body.provider, 'scope-filter')
    assert.equal(body.reason, 'out_of_scope')
    assert.ok(Array.isArray(body.supportedTopics) && body.supportedTopics.length > 0)
    assert.match(body.answer, /fora do escopo/i)
  })

  // ===== M2 (Story 6.3): POST /vacation-reminders/run dryRun =====
  // Cria 1 employee com hireDate 2 anos atrás → CONCESSIVO próximo do vencimento.
  const empReminder = await prisma.employee.create({
    data: {
      tenantId: tenant.id, name: 'Reminder Target',
      cpf: uniqCpf(),
      hireDate: new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000),
      employeeType: 'EFETIVO', isFerista: false, salary: 3000,
      status: 'ATIVO',
    },
  })

  await t.test('M2: POST /vacation-reminders/run dryRun=true não envia email mas detecta hits', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/vacation-reminders/run',
      headers: auth(tokenAdmin),
      payload: { dryRun: true, windowDays: 60 },
    })
    assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.ok(typeof body.scanned === 'number' && body.scanned >= 1)
    assert.equal(body.emailsSent, 0, 'dryRun não envia')
    assert.equal(body.emailsFailed, 0)
    assert.ok(Array.isArray(body.hits))
  })

  await t.test('M2: POST /vacation-reminders/run como EMPLOYEE → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/vacation-reminders/run',
      headers: auth(tokenEmployee),
      payload: { dryRun: true },
    })
    assert.equal(res.statusCode, 403)
  })

  await prisma.employee.delete({ where: { id: empReminder.id } }).catch(() => {})

  // ===== M4 (Story 4.3): /predict/coverage-forecast diferencia ferista efetivo =====
  await t.test('M4: GET /predict/coverage-forecast retorna split ferista efetivo / intermitente', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/predict/coverage-forecast',
      headers: auth(tokenAdmin),
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.ok(Array.isArray(body.forecast))
    assert.equal(body.forecast.length, 6, 'forecast cobre 6 meses')
    for (const m of body.forecast) {
      assert.ok(typeof m.feristaEfetivoPool === 'number')
      assert.ok(typeof m.feristaEfetivoCovers === 'number')
      assert.ok(typeof m.intermitentesNeeded === 'number')
      assert.ok(typeof m.estimatedIntermitenteCost === 'number')
      assert.ok(typeof m.estimatedSavedCost === 'number')
      // Invariante: covers + needed = uncovered
      assert.equal(
        m.feristaEfetivoCovers + m.intermitentesNeeded,
        m.uncoveredVacations,
        `covers + needed deve igualar uncovered no mes ${m.month}`,
      )
    }
    assert.ok(typeof body.avgIntermitenteSalary === 'number')
  })

  // ===== L2 (Story 4.5): /predict/ask/stream emite SSE =====
  await t.test('L2: POST /predict/ask/stream out-of-scope → SSE com tokens + meta + done', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/predict/ask/stream',
      headers: { ...auth(tokenAdmin), 'Content-Type': 'application/json' },
      payload: { question: 'Qual a previsão do tempo amanhã?' },
    })
    assert.equal(res.statusCode, 200)
    assert.match(String(res.headers['content-type'] ?? ''), /text\/event-stream/)
    const events = res.payload
      .split('\n\n')
      .map((p) => p.trim())
      .filter((p) => p.startsWith('data:'))
      .map((p) => JSON.parse(p.slice(5).trim()))
    const types = events.map((e) => e.type)
    assert.ok(types.includes('token'), 'deve haver pelo menos 1 token')
    assert.ok(types.includes('meta'), 'deve haver evento meta')
    assert.ok(types.includes('done'), 'deve haver evento done no fim')
    const meta = events.find((e) => e.type === 'meta')
    assert.equal(meta.scope, 'out_of_scope')
    assert.equal(meta.provider, 'scope-filter')
  })

  await t.test('M3: POST /predict/ask com cumprimento → 200, scope=out_of_scope, reason=greeting', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/predict/ask',
      headers: auth(tokenAdmin),
      payload: { question: 'boa tarde' },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.payload)
    assert.equal(body.scope, 'out_of_scope')
    assert.equal(body.reason, 'greeting')
    assert.match(body.answer, /Olá/)
  })
})
