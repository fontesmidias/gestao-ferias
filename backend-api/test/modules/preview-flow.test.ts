import test from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { previewEntrypoint } from '../../src/modules/imports/preview-flow'
import type { ImportJob, PreviewSummary, RowCategory } from '../../src/modules/imports/types'

interface FakeJob {
  id: string
  tenantId: string
  status: string
  previewSummary: PreviewSummary | null
}

function makeDeps(jobs: FakeJob[]) {
  const prisma = {
    importJob: {
      async findUnique({ where: { id } }: { where: { id: string } }) {
        const j = jobs.find((x) => x.id === id)
        return j ? ({ ...j } as unknown as ImportJob) : null
      },
    },
  }
  return { deps: { prisma } as never }
}

function makeReply() {
  return {
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
}

function makeSummary(rowsByStatus: Partial<Record<RowCategory, number>>): PreviewSummary {
  const sampleRows: PreviewSummary['sampleRows'] = []
  let i = 1
  for (const [status, n] of Object.entries(rowsByStatus)) {
    for (let k = 0; k < (n as number); k++) {
      sampleRows.push({ rowIndex: i++, status: status as RowCategory })
    }
  }
  return {
    totalRows: sampleRows.length,
    counts: {
      create: rowsByStatus.create ?? 0,
      update: rowsByStatus.update ?? 0,
      unchanged: rowsByStatus.unchanged ?? 0,
      reactivation: rowsByStatus.reactivation ?? 0,
      invalid: rowsByStatus.invalid ?? 0,
      absent: rowsByStatus.absent ?? 0,
    },
    newWorkplaces: ['ANATEL'],
    sampleRows,
  }
}

const TENANT_A = randomUUID()
const TENANT_B = randomUUID()
const JOB_ID = randomUUID()

test('preview — sem filtros: retorna todas as rows paginadas (page=1, limit=50)', async () => {
  const summary = makeSummary({ create: 30, update: 10, invalid: 5 })
  const { deps } = makeDeps([
    { id: JOB_ID, tenantId: TENANT_A, status: 'PREVIEW_READY', previewSummary: summary },
  ])
  const reply = makeReply()
  const request = { user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' } }

  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: JOB_ID,
    scope: 'tenant',
  })
  assert.strictEqual(reply.statusCode, 200)
  const env = reply.payload as {
    data: { rows: unknown[]; counts: { create: number } }
    meta: { pagination: { total: number; totalPages: number } }
  }
  assert.strictEqual(env.data.rows.length, 45)
  assert.strictEqual(env.meta.pagination.total, 45)
  assert.strictEqual(env.meta.pagination.totalPages, 1)
  assert.strictEqual(env.data.counts.create, 30)
})

test('preview — filter status=invalid retorna só invalid', async () => {
  const summary = makeSummary({ create: 10, invalid: 3 })
  const { deps } = makeDeps([
    { id: JOB_ID, tenantId: TENANT_A, status: 'COMPLETED', previewSummary: summary },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' },
    query: { status: 'invalid' },
  }

  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: JOB_ID,
    scope: 'tenant',
  })
  const env = reply.payload as {
    data: { rows: { status: string }[] }
    meta: { pagination: { total: number } }
  }
  assert.strictEqual(env.data.rows.length, 3)
  assert.ok(env.data.rows.every((r) => r.status === 'invalid'))
  assert.strictEqual(env.meta.pagination.total, 3)
})

test('preview — pagination: page=2, limit=10 retorna offset 10', async () => {
  const summary = makeSummary({ create: 25 })
  const { deps } = makeDeps([
    { id: JOB_ID, tenantId: TENANT_A, status: 'PREVIEW_READY', previewSummary: summary },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' },
    query: { page: '2', limit: '10' },
  }

  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: JOB_ID,
    scope: 'tenant',
  })
  const env = reply.payload as {
    data: { rows: { rowIndex: number }[] }
    meta: { pagination: { page: number; limit: number; total: number; totalPages: number } }
  }
  assert.strictEqual(env.data.rows.length, 10)
  assert.strictEqual(env.data.rows[0].rowIndex, 11)
  assert.strictEqual(env.meta.pagination.page, 2)
  assert.strictEqual(env.meta.pagination.totalPages, 3)
})

test('preview — limit clamped para 200 max', async () => {
  const summary = makeSummary({ create: 5 })
  const { deps } = makeDeps([
    { id: JOB_ID, tenantId: TENANT_A, status: 'PREVIEW_READY', previewSummary: summary },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' },
    query: { limit: '5000' },
  }
  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: JOB_ID,
    scope: 'tenant',
  })
  const env = reply.payload as { meta: { pagination: { limit: number } } }
  assert.strictEqual(env.meta.pagination.limit, 200)
})

test('preview — previewSummary null → 409 INVALID_JOB_STATE', async () => {
  const { deps } = makeDeps([
    { id: JOB_ID, tenantId: TENANT_A, status: 'PARSING', previewSummary: null },
  ])
  const reply = makeReply()
  const request = { user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' } }
  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: JOB_ID,
    scope: 'tenant',
  })
  assert.strictEqual(reply.statusCode, 409)
  assert.strictEqual((reply.payload as { error: { code: string } }).error.code, 'INVALID_JOB_STATE')
})

test('preview — cross-tenant scope=tenant → 404 (não vaza existência)', async () => {
  const summary = makeSummary({ create: 1 })
  const { deps } = makeDeps([
    { id: JOB_ID, tenantId: TENANT_A, status: 'PREVIEW_READY', previewSummary: summary },
  ])
  const reply = makeReply()
  const request = { user: { userId: randomUUID(), tenantId: TENANT_B, role: 'ADMIN' } }
  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: JOB_ID,
    scope: 'tenant',
  })
  assert.strictEqual(reply.statusCode, 404)
})

test('preview — job inexistente → 404', async () => {
  const { deps } = makeDeps([])
  const reply = makeReply()
  const request = { user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' } }
  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: randomUUID(),
    scope: 'tenant',
  })
  assert.strictEqual(reply.statusCode, 404)
})

test('preview — status filter inválido (ex: "foo") é ignorado, retorna todos', async () => {
  const summary = makeSummary({ create: 5, invalid: 2 })
  const { deps } = makeDeps([
    { id: JOB_ID, tenantId: TENANT_A, status: 'PREVIEW_READY', previewSummary: summary },
  ])
  const reply = makeReply()
  const request = {
    user: { userId: randomUUID(), tenantId: TENANT_A, role: 'ADMIN' },
    query: { status: 'foo' },
  }
  await previewEntrypoint(deps, request as never, reply as never, {
    jobId: JOB_ID,
    scope: 'tenant',
  })
  const env = reply.payload as { data: { rows: unknown[] } }
  assert.strictEqual(env.data.rows.length, 7)
})
