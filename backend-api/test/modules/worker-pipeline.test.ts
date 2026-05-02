import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import type { ImportJob, PrismaClient } from '@prisma/client'

const TMP_ROOT = mkdtempSync(path.join(tmpdir(), 'gf-worker-pipeline-'))
process.env.IMPORT_FILE_STORAGE_PATH = TMP_ROOT

const pipeline = require('../../src/modules/imports/worker-pipeline') as typeof import('../../src/modules/imports/worker-pipeline')

const FIXTURES_DIR = path.join(__dirname, '../fixtures/imports')

interface MockJob {
  id: string
  tenantId: string
  status: string
  storagePath: string
  fileHash: string
  parsedAt: Date | null
  appliedAt: Date | null
  failureReason?: string | null
  totalRows?: number | null
  rowsProcessed?: number
  rowsCreated?: number
  rowsUpdated?: number
  rowsInvalid?: number
  rowsAbsent?: number
  workplacesCreated?: number
  previewSummary?: unknown
}

interface MockState {
  job: MockJob
  updates: { id: string; data: Record<string, unknown> }[]
}

function makeMockPrisma(initial: MockJob): {
  prisma: PrismaClient
  state: MockState
} {
  const state: MockState = { job: { ...initial }, updates: [] }
  const txClient = {
    importJob: {
      async findUnique({
        where: { id },
        select,
      }: {
        where: { id: string }
        select?: Record<string, boolean>
      }) {
        if (state.job.id !== id) return null
        if (!select) return { ...state.job } as unknown as ImportJob
        const subset: Record<string, unknown> = {}
        for (const k of Object.keys(select)) {
          subset[k] = (state.job as unknown as Record<string, unknown>)[k]
        }
        return subset as unknown as ImportJob
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        if (state.job.id !== id) throw new Error('not found')
        state.updates.push({ id, data })
        Object.assign(state.job, data)
        return { ...state.job } as unknown as ImportJob
      },
    },
    employee: {
      async findMany() {
        return []
      },
    },
    workplace: {
      async findMany() {
        return []
      },
    },
  }
  const prisma = {
    ...txClient,
    async $transaction<T>(fn: (t: typeof txClient) => Promise<T>): Promise<T> {
      return fn(txClient)
    },
  }
  return { prisma: prisma as unknown as PrismaClient, state }
}

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function persistFixture(
  tenantId: string,
  jobId: string,
  fixtureName: string,
): Promise<{ path: string; hash: string }> {
  const buffer = readFileSync(path.join(FIXTURES_DIR, fixtureName))
  const dir = path.join(TMP_ROOT, tenantId)
  mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `${jobId}.xlsx`)
  writeFileSync(target, buffer)
  return { path: target, hash: sha256(buffer) }
}

test('pipeline', async (t) => {
  t.after(async () => {
    await rm(TMP_ROOT, { recursive: true, force: true })
  })

  await t.test('happy path: PENDING → PARSING → PREVIEW_READY com previewSummary', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const { hash } = await persistFixture(tenantId, jobId, 'tirvu-anatel-50.xlsx')
    const { prisma, state } = makeMockPrisma({
      id: jobId,
      tenantId,
      status: 'PENDING',
      storagePath: `dummy`,
      fileHash: hash,
      parsedAt: null,
      appliedAt: null,
    })
    await pipeline.runImportPipeline({ prisma, log: silentLog }, { jobId })

    const statuses = state.updates.map((u) => (u.data as { status?: string }).status)
    assert.ok(statuses.includes('PARSING'))
    assert.ok(statuses.includes('PREVIEW_READY'))

    const finalUpdate = state.updates[state.updates.length - 1]
    assert.strictEqual((finalUpdate.data as { status: string }).status, 'PREVIEW_READY')
    assert.ok((finalUpdate.data as { previewSummary?: unknown }).previewSummary)
    const summary = (finalUpdate.data as { previewSummary: { totalRows: number } }).previewSummary
    assert.ok(summary.totalRows > 0)
  })

  await t.test('FileIntegrityError → FAILED com FILE_INTEGRITY_FAILED', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    await persistFixture(tenantId, jobId, 'tirvu-anatel-50.xlsx')
    const wrongHash = 'a'.repeat(64)
    const { prisma, state } = makeMockPrisma({
      id: jobId,
      tenantId,
      status: 'PENDING',
      storagePath: 'dummy',
      fileHash: wrongHash,
      parsedAt: null,
      appliedAt: null,
    })
    await pipeline.runImportPipeline({ prisma, log: silentLog }, { jobId })

    const finalUpdate = state.updates[state.updates.length - 1]
    assert.strictEqual((finalUpdate.data as { status: string }).status, 'FAILED')
    assert.strictEqual(
      (finalUpdate.data as { failureReason?: string }).failureReason,
      'FILE_INTEGRITY_FAILED',
    )
  })

  await t.test('Header inválido → FAILED com INVALID_TIRVU_HEADER', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const { hash } = await persistFixture(tenantId, jobId, 'tirvu-bad-sheet-name.xlsx')
    const { prisma, state } = makeMockPrisma({
      id: jobId,
      tenantId,
      status: 'PENDING',
      storagePath: 'dummy',
      fileHash: hash,
      parsedAt: null,
      appliedAt: null,
    })
    await pipeline.runImportPipeline({ prisma, log: silentLog }, { jobId })

    const finalUpdate = state.updates[state.updates.length - 1]
    assert.strictEqual((finalUpdate.data as { status: string }).status, 'FAILED')
    assert.strictEqual(
      (finalUpdate.data as { failureReason?: string }).failureReason,
      'INVALID_TIRVU_HEADER',
    )
  })

  await t.test('Job inexistente: pipeline retorna sem update', async () => {
    const { prisma, state } = makeMockPrisma({
      id: 'never-seen',
      tenantId: 'x',
      status: 'PENDING',
      storagePath: '',
      fileHash: '',
      parsedAt: null,
      appliedAt: null,
    })
    await pipeline.runImportPipeline({ prisma, log: silentLog }, { jobId: 'other-id' })
    assert.strictEqual(state.updates.length, 0)
  })

  await t.test('Job em status não-PENDING: pipeline ignora', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const { prisma, state } = makeMockPrisma({
      id: jobId,
      tenantId,
      status: 'COMPLETED',
      storagePath: 'dummy',
      fileHash: 'x'.repeat(64),
      parsedAt: null,
      appliedAt: null,
    })
    await pipeline.runImportPipeline({ prisma, log: silentLog }, { jobId })
    assert.strictEqual(state.updates.length, 0)
  })
})
