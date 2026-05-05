import test from 'node:test'
import assert from 'node:assert'
import route from '../../src/routes/api/v1/admin/reconcile/index'

const TENANT = '11111111-1111-1111-1111-111111111111'
const USER = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

interface JobRow {
  id: string
  tenantId: string
  status: string
  totalEmployees: number | null
  matched: number
  queued: number
  ignored: number
  errors: number
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  durationMs: number | null
  failureReason: string | null
  triggeredBy: string
  operatorUserId: string
  parserVersion: string
  batchParentId: string | null
}

type Handler = (req: unknown, reply: unknown) => Promise<unknown> | unknown

interface RouteSpec {
  method: 'GET' | 'POST'
  url: string
  handler: Handler
}

interface EmployeeRow {
  id: string
  tenantId: string
  workplace: string | null
  workplaceId: string | null
  status: string
}

async function buildHarness(
  initialJobs: JobRow[] = [],
  initialEmployees: EmployeeRow[] = [],
) {
  const jobs: JobRow[] = [...initialJobs]
  const audit: Array<{ action: string; resourceId: string }> = []
  const employees: EmployeeRow[] = [...initialEmployees]

  const prisma = {
    reconcileJob: {
      async findFirst({
        where,
      }: {
        where: { id?: string; tenantId?: string; status?: { in?: string[] } | string }
      }) {
        return (
          jobs.find((j) => {
            if (where.id && j.id !== where.id) return false
            if (where.tenantId && j.tenantId !== where.tenantId) return false
            if (where.status) {
              if (typeof where.status === 'object' && Array.isArray(where.status.in)) {
                return where.status.in.includes(j.status)
              }
              if (typeof where.status === 'string') return j.status === where.status
            }
            return true
          }) ?? null
        )
      },
      async findMany({
        where,
        skip = 0,
        take = 20,
      }: {
        where: { tenantId?: string; status?: string }
        skip?: number
        take?: number
      }) {
        return jobs
          .filter(
            (j) =>
              (!where.tenantId || j.tenantId === where.tenantId) &&
              (!where.status || j.status === where.status),
          )
          .slice(skip, skip + take)
      },
      async count({ where }: { where: { tenantId?: string; status?: string } }) {
        return jobs.filter(
          (j) =>
            (!where.tenantId || j.tenantId === where.tenantId) &&
            (!where.status || j.status === where.status),
        ).length
      },
      async create({ data }: { data: Partial<JobRow> }) {
        const row: JobRow = {
          id: `job-${jobs.length + 1}`,
          tenantId: data.tenantId ?? TENANT,
          status: data.status ?? 'RUNNING',
          totalEmployees: null,
          matched: 0,
          queued: 0,
          ignored: 0,
          errors: 0,
          createdAt: new Date(),
          startedAt: data.startedAt ?? null,
          completedAt: null,
          durationMs: null,
          failureReason: null,
          triggeredBy: data.triggeredBy ?? 'ADMIN',
          operatorUserId: data.operatorUserId ?? USER,
          parserVersion: 'reconcile-v1',
          batchParentId: null,
        }
        jobs.push(row)
        return row
      },
      async findFirstOrThrow({ where }: { where: { id?: string } }) {
        const j = jobs.find((x) => x.id === where.id)
        if (!j) throw new Error('not found')
        return j
      },
      async update({ where, data }: { where: { id: string }; data: Partial<JobRow> }) {
        const idx = jobs.findIndex((j) => j.id === where.id)
        if (idx < 0) throw new Error('not found')
        jobs[idx] = { ...jobs[idx], ...data }
        return jobs[idx]
      },
    },
    employee: {
      async count({
        where,
      }: {
        where: {
          tenantId?: string
          workplace?: { not: null }
          workplaceId?: null
          status?: { not?: string } | string
        }
      }) {
        return employees.filter((e) => {
          if (where.tenantId && e.tenantId !== where.tenantId) return false
          if (where.workplace && e.workplace === null) return false
          if (where.workplaceId === null && e.workplaceId !== null) return false
          if (where.status && typeof where.status === 'object' && 'not' in where.status) {
            if (e.status === where.status.not) return false
          }
          return true
        }).length
      },
      async findMany() {
        return []
      },
    },
    auditLog: {
      async create({ data }: { data: { action: string; resourceId: string } }) {
        audit.push({ action: data.action, resourceId: data.resourceId })
        return data
      },
    },
  }

  const routes: RouteSpec[] = []
  const fakeFastify = {
    prisma,
    requireAuth: () => {},
    requireAdmin: () => {},
    log: { error: () => {}, info: () => {}, warn: () => {} },
    post(url: string, _opts: unknown, handler: Handler) {
      routes.push({ method: 'POST', url, handler })
    },
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

  return { find, makeReply, state: { jobs, audit } }
}

test('admin/reconcile route', async (t) => {
  await t.test('AC-15: POST cria job e responde 200 com { jobId, status: RUNNING }', async () => {
    const { find, makeReply, state } = await buildHarness()
    const post = find('POST', '/')
    const r = makeReply()
    await post(
      { user: { userId: USER, tenantId: TENANT } },
      r.reply,
    )
    assert.strictEqual(r.statusCode, 200)
    const body = r.payload as {
      data: { jobId: string; status: string }
      error: null
      meta: null
    }
    assert.strictEqual(body.error, null)
    assert.strictEqual(body.data.status, 'RUNNING')
    assert.ok(body.data.jobId)
    assert.strictEqual(state.jobs.length, 1)
    assert.strictEqual(state.audit.length, 1, 'audit log gravado antes do retorno')
    assert.strictEqual(state.audit[0].action, 'V3.3_RECONCILE')
  })

  await t.test('AC-14: POST retorna 409 quando já existe job RUNNING', async () => {
    const existing: JobRow = {
      id: 'job-existing',
      tenantId: TENANT,
      status: 'RUNNING',
      totalEmployees: null,
      matched: 0, queued: 0, ignored: 0, errors: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      durationMs: null,
      failureReason: null,
      triggeredBy: 'ADMIN',
      operatorUserId: USER,
      parserVersion: 'reconcile-v1',
      batchParentId: null,
    }
    const { find, makeReply, state } = await buildHarness([existing])
    const post = find('POST', '/')
    const r = makeReply()
    await post({ user: { userId: USER, tenantId: TENANT } }, r.reply)
    assert.strictEqual(r.statusCode, 409)
    const body = r.payload as {
      data: null
      error: { code: string }
      meta: { existingJobId: string }
    }
    assert.strictEqual(body.error.code, 'RECONCILE_JOB_ALREADY_RUNNING')
    assert.strictEqual(body.meta.existingJobId, 'job-existing')
    assert.strictEqual(state.jobs.length, 1, 'não criou novo job')
  })

  await t.test('AC-16: GET /:id retorna 404 quando job é de outro tenant', async () => {
    const otherTenantJob: JobRow = {
      id: 'job-x',
      tenantId: '99999999-9999-9999-9999-999999999999',
      status: 'COMPLETED',
      totalEmployees: 10,
      matched: 5, queued: 2, ignored: 3, errors: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 1000,
      failureReason: null,
      triggeredBy: 'ADMIN',
      operatorUserId: USER,
      parserVersion: 'reconcile-v1',
      batchParentId: null,
    }
    const { find, makeReply } = await buildHarness([otherTenantJob])
    const getOne = find('GET', '/jobs/:id')
    const r = makeReply()
    await getOne(
      {
        user: { tenantId: TENANT, role: 'ADMIN' },
        params: { id: 'job-x' },
      },
      r.reply,
    )
    assert.strictEqual(r.statusCode, 404)
    const body = r.payload as { error: { code: string } }
    assert.strictEqual(body.error.code, 'NOT_FOUND')
  })

  await t.test('AC-1: GET /preview retorna pendingEmployees + hasRunningJob', async () => {
    const employeesData: EmployeeRow[] = [
      { id: 'e1', tenantId: TENANT, workplace: 'INEP', workplaceId: null, status: 'ATIVO' },
      { id: 'e2', tenantId: TENANT, workplace: 'INEP', workplaceId: null, status: 'ATIVO' },
      { id: 'e3', tenantId: TENANT, workplace: 'INEP', workplaceId: 'wp-1', status: 'ATIVO' },
      { id: 'e4', tenantId: TENANT, workplace: null, workplaceId: null, status: 'ATIVO' },
      { id: 'e5', tenantId: TENANT, workplace: 'INEP', workplaceId: null, status: 'INATIVO' },
    ]
    const runningJob: JobRow = {
      id: 'job-running',
      tenantId: TENANT,
      status: 'RUNNING',
      totalEmployees: 2, matched: 0, queued: 0, ignored: 0, errors: 0,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null, durationMs: null, failureReason: null,
      triggeredBy: 'ADMIN', operatorUserId: USER,
      parserVersion: 'reconcile-v1', batchParentId: null,
    }
    const { find, makeReply } = await buildHarness([runningJob], employeesData)
    const getPreview = find('GET', '/preview')
    const r = makeReply()
    const result = await getPreview(
      { user: { tenantId: TENANT, role: 'ADMIN' } },
      r.reply,
    )
    const body = result as {
      data: { pendingEmployees: number; hasRunningJob: boolean; runningJobId?: string }
    }
    assert.strictEqual(body.data.pendingEmployees, 2, 'só conta workplace!=null && workplaceId=null && status!=INATIVO')
    assert.strictEqual(body.data.hasRunningJob, true)
    assert.strictEqual(body.data.runningJobId, 'job-running')
  })

  await t.test('AC-17: GET /jobs lista paginada respeita filtros e roles', async () => {
    const jobs: JobRow[] = [1, 2, 3].map((i) => ({
      id: `job-${i}`,
      tenantId: TENANT,
      status: i === 1 ? 'COMPLETED' : 'RUNNING',
      totalEmployees: 10, matched: 0, queued: 0, ignored: 0, errors: 0,
      createdAt: new Date(2026, 0, i),
      startedAt: new Date(),
      completedAt: i === 1 ? new Date() : null,
      durationMs: null, failureReason: null,
      triggeredBy: 'ADMIN', operatorUserId: USER,
      parserVersion: 'reconcile-v1', batchParentId: null,
    }))
    const { find, makeReply } = await buildHarness(jobs)
    const getList = find('GET', '/jobs')
    const r = makeReply()
    const result = await getList(
      {
        user: { tenantId: TENANT, role: 'AUDITOR' },
        query: { page: 1, pageSize: 10 },
      },
      r.reply,
    )
    const body = result as {
      data: JobRow[]
      meta: { total: number; readOnly: boolean }
    }
    assert.strictEqual(body.data.length, 3)
    assert.strictEqual(body.meta.total, 3)
    assert.strictEqual(body.meta.readOnly, true, 'AUDITOR → readOnly true')
  })
})
