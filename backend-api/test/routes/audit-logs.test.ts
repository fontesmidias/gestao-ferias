import test from 'node:test'
import assert from 'node:assert'
import route from '../../src/routes/api/v1/audit-logs/index'

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '99999999-9999-9999-9999-999999999999'

interface AuditLogRow {
  id: string
  tenantId: string
  userId: string
  action: string
  resourceType: string
  createdAt: Date
}

type Handler = (req: unknown, reply: unknown) => Promise<unknown> | unknown

interface RouteSpec {
  method: 'GET' | 'POST'
  url: string
  handler: Handler
}

async function buildHarness(initialLogs: AuditLogRow[] = []) {
  const logs = [...initialLogs]
  const prisma = {
    auditLog: {
      async findMany({
        where,
        take = 50,
      }: {
        where: { tenantId?: string; action?: string; resourceType?: string }
        take?: number
      }) {
        return logs
          .filter(
            (l) =>
              (!where.tenantId || l.tenantId === where.tenantId) &&
              (!where.action || l.action === where.action) &&
              (!where.resourceType || l.resourceType === where.resourceType),
          )
          .slice(0, take)
      },
    },
  }

  const routes: RouteSpec[] = []
  const fakeFastify = {
    prisma,
    requireAuth: () => {},
    requireAdmin: () => {},
    log: { error: () => {}, info: () => {}, warn: () => {} },
    get(url: string, _opts: unknown, handler: Handler) {
      routes.push({ method: 'GET', url, handler })
    },
  } as never

  await route(fakeFastify, {} as never)

  function find(method: 'GET' | 'POST', url: string): Handler {
    const r = routes.find((x) => x.method === method && x.url === url)
    if (!r) throw new Error(`Route não registrada: ${method} ${url}`)
    return r.handler
  }

  function makeReply() {
    let statusCode = 200
    let payload: unknown = null
    const reply = {
      code(c: number) {
        statusCode = c
        return reply
      },
      send(p: unknown) {
        payload = p
        return reply
      },
    }
    return {
      reply,
      get statusCode() {
        return statusCode
      },
      get payload() {
        return payload
      },
    }
  }

  return { find, makeReply }
}

const sampleLogs: AuditLogRow[] = [
  {
    id: '1', tenantId: TENANT_A, userId: 'u1',
    action: 'V3.3_RECONCILE', resourceType: 'RECONCILE_JOB',
    createdAt: new Date('2026-05-05T10:00:00Z'),
  },
  {
    id: '2', tenantId: TENANT_A, userId: 'u1',
    action: 'RECONCILE_QUEUE_RESOLVE', resourceType: 'WORKPLACE_RECONCILE_QUEUE',
    createdAt: new Date('2026-05-05T11:00:00Z'),
  },
  {
    id: '3', tenantId: TENANT_B, userId: 'u2',
    action: 'V3.3_RECONCILE', resourceType: 'RECONCILE_JOB',
    createdAt: new Date('2026-05-05T12:00:00Z'),
  },
]

test('audit-logs RBAC (Story 3.1)', async (t) => {
  await t.test('AC-1/T1: AUDITOR lista audit logs do próprio tenant', async () => {
    const { find, makeReply } = await buildHarness(sampleLogs)
    const get = find('GET', '/')
    const r = makeReply()
    const result = await get(
      { user: { tenantId: TENANT_A, role: 'AUDITOR' }, query: {} },
      r.reply,
    )
    const body = result as AuditLogRow[]
    assert.ok(Array.isArray(body), 'response é array (sem envelope no happy path)')
    assert.strictEqual(body.length, 2, 'apenas logs do TENANT_A')
    assert.ok(body.every((l) => l.tenantId === TENANT_A))
  })

  await t.test('AC-4/T2: AUDITOR cross-tenant: zero logs do outro tenant', async () => {
    const { find, makeReply } = await buildHarness(sampleLogs)
    const get = find('GET', '/')
    const r = makeReply()
    const result = await get(
      { user: { tenantId: TENANT_B, role: 'AUDITOR' }, query: {} },
      r.reply,
    )
    const body = result as AuditLogRow[]
    assert.strictEqual(body.length, 1)
    assert.strictEqual(body[0].tenantId, TENANT_B)
  })

  await t.test('AC-5/T3: USER recebe 403', async () => {
    const { find, makeReply } = await buildHarness(sampleLogs)
    const get = find('GET', '/')
    const r = makeReply()
    await get(
      { user: { tenantId: TENANT_A, role: 'USER' }, query: {} },
      r.reply,
    )
    assert.strictEqual(r.statusCode, 403)
    const body = r.payload as { error: { code: string } }
    assert.strictEqual(body.error.code, 'FORBIDDEN')
  })

  await t.test('AC-3/T4: AUDITOR filtra por action=V3.3_RECONCILE', async () => {
    const { find, makeReply } = await buildHarness(sampleLogs)
    const get = find('GET', '/')
    const r = makeReply()
    const result = await get(
      {
        user: { tenantId: TENANT_A, role: 'AUDITOR' },
        query: { action: 'V3.3_RECONCILE' },
      },
      r.reply,
    )
    const body = result as AuditLogRow[]
    assert.strictEqual(body.length, 1, 'apenas RECONCILE do TENANT_A')
    assert.strictEqual(body[0].action, 'V3.3_RECONCILE')
  })

  await t.test('AC-2: tenantId ausente no JWT retorna 400', async () => {
    const { find, makeReply } = await buildHarness(sampleLogs)
    const get = find('GET', '/')
    const r = makeReply()
    await get({ user: { role: 'AUDITOR' }, query: {} }, r.reply)
    assert.strictEqual(r.statusCode, 400)
    const body = r.payload as { error: { code: string } }
    assert.strictEqual(body.error.code, 'TENANT_REQUIRED')
  })
})
