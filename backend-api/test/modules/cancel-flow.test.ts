import test from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { cancelEntrypoint } from '../../src/modules/imports/cancel-flow'
import type { ImportJob } from '../../src/modules/imports/types'

interface FakeJob {
  id: string
  tenantId: string
  status: string
  parsedAt: Date | null
  appliedAt: Date | null
}

function makeDeps(jobs: FakeJob[]) {
  const auditLogs: Record<string, unknown>[] = []
  const updates: { id: string; data: Record<string, unknown> }[] = []
  const tx = {
    importJob: {
      async findUnique({
        where: { id },
      }: {
        where: { id: string }
        select?: Record<string, boolean>
      }) {
        const j = jobs.find((x) => x.id === id)
        return j ? ({ ...j } as unknown as ImportJob) : null
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        updates.push({ id, data })
        const j = jobs.find((x) => x.id === id)
        if (j) Object.assign(j, data)
        return { ...j } as unknown as ImportJob
      },
    },
    auditLog: {
      async create({ data }: { data: Record<string, unknown> }) {
        auditLogs.push(data)
        return { id: randomUUID(), ...data }
      },
    },
  }
  const prisma = {
    ...tx,
    async $transaction<T>(fn: (t: typeof tx) => Promise<T>): Promise<T> {
      return fn(tx)
    },
  }
  const log = { info: () => {}, warn: () => {}, error: () => {} }
  return { deps: { prisma, log } as never, auditLogs, updates }
}

function makeReply() {
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    code(c: number) {
      this.statusCode = c
      return this
    },
    send(p: unknown) {
      this.payload = p
      return this
    },
  }
  return reply
}

const TENANT_A = randomUUID()
const TENANT_B = randomUUID()

test('cancelEntrypoint — happy path PREVIEW_READY → CANCELLED', async () => {
  const jobId = randomUUID()
  const { deps, auditLogs, updates } = makeDeps([
    { id: jobId, tenantId: TENANT_A, status: 'PREVIEW_READY', parsedAt: new Date(), appliedAt: null },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  }

  await cancelEntrypoint(deps, request as never, reply as never, {
    jobId,
    scope: 'tenant',
  })

  assert.strictEqual(reply.statusCode, 200)
  const env = reply.payload as { data: { jobId: string; status: string } }
  assert.strictEqual(env.data.status, 'CANCELLED')
  assert.strictEqual(updates[0].id, jobId)
  assert.strictEqual((updates[0].data as { status: string }).status, 'CANCELLED')
  assert.strictEqual(
    (updates[0].data as { failureReason: string }).failureReason,
    'OPERATOR_CANCELLED',
  )
  assert.strictEqual(auditLogs.length, 1)
  assert.strictEqual(auditLogs[0].action, 'EMPLOYEE_IMPORT_JOB_CANCELLED')
})

test('cancelEntrypoint — job em outro estado → 409 INVALID_JOB_STATE', async () => {
  const jobId = randomUUID()
  const { deps, auditLogs, updates } = makeDeps([
    { id: jobId, tenantId: TENANT_A, status: 'COMPLETED', parsedAt: new Date(), appliedAt: new Date() },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  }
  await cancelEntrypoint(deps, request as never, reply as never, {
    jobId,
    scope: 'tenant',
  })
  assert.strictEqual(reply.statusCode, 409)
  const env = reply.payload as { error: { code: string } }
  assert.strictEqual(env.error.code, 'INVALID_JOB_STATE')
  assert.strictEqual(updates.length, 0)
  assert.strictEqual(auditLogs.length, 0)
})

test('cancelEntrypoint — job inexistente → 404 JOB_NOT_FOUND', async () => {
  const { deps } = makeDeps([])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  }
  await cancelEntrypoint(deps, request as never, reply as never, {
    jobId: randomUUID(),
    scope: 'tenant',
  })
  assert.strictEqual(reply.statusCode, 404)
  const env = reply.payload as { error: { code: string } }
  assert.strictEqual(env.error.code, 'JOB_NOT_FOUND')
})

test('cancelEntrypoint — scope=tenant com tenantId diferente → 404 (não vaza existência)', async () => {
  const jobId = randomUUID()
  const { deps } = makeDeps([
    { id: jobId, tenantId: TENANT_A, status: 'PREVIEW_READY', parsedAt: new Date(), appliedAt: null },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_B, role: 'ADMIN' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  }
  await cancelEntrypoint(deps, request as never, reply as never, {
    jobId,
    scope: 'tenant',
  })
  assert.strictEqual(reply.statusCode, 404)
})

test('cancelEntrypoint — scope=admin não checa tenantId', async () => {
  const jobId = randomUUID()
  const { deps } = makeDeps([
    { id: jobId, tenantId: TENANT_A, status: 'PREVIEW_READY', parsedAt: new Date(), appliedAt: null },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_B, role: 'SUPERADMIN' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  }
  await cancelEntrypoint(deps, request as never, reply as never, {
    jobId,
    scope: 'admin',
  })
  assert.strictEqual(reply.statusCode, 200)
})
