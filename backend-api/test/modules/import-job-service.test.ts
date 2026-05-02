import test from 'node:test'
import assert from 'node:assert'
import { transition } from '../../src/modules/imports/import-job-service'
import {
  InvalidStateTransitionError,
  type ImportJob,
  type ImportJobStatus,
} from '../../src/modules/imports/types'
import type { PrismaClient } from '@prisma/client'

function makeJob(o: Partial<ImportJob> = {}): ImportJob {
  const now = new Date()
  return {
    id: 'job-1',
    tenantId: 'tenant-1',
    operatorUserId: 'user-1',
    status: 'PENDING',
    parserVersion: 'tirvu-v1',
    filename: 'x.xlsx',
    fileSize: 1024,
    fileHash: 'sha256-x',
    storagePath: '/var/imports/x.xlsx',
    totalRows: null,
    rowsProcessed: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsInvalid: 0,
    rowsAbsent: 0,
    workplacesCreated: 0,
    previewSummary: null,
    errorReportPath: null,
    failureReason: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    parsedAt: null,
    appliedAt: null,
    completedAt: null,
    ...o,
  }
}

function makeMockPrisma(initial: ImportJob): PrismaClient {
  let job: ImportJob | null = { ...initial }
  const tx = {
    importJob: {
      async findUnique({ where: { id } }: { where: { id: string } }) {
        return job && job.id === id ? { ...job } : null
      },
      async update({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) {
        if (!job || job.id !== id) throw new Error('not found')
        job = { ...job, ...(data as Partial<ImportJob>) } as ImportJob
        return { ...job }
      },
    },
  }
  const prisma = {
    ...tx,
    async $transaction<T>(fn: (t: typeof tx) => Promise<T>): Promise<T> {
      return fn(tx)
    },
  }
  return prisma as unknown as PrismaClient
}

test('transition válida PENDING → PARSING seta parsedAt', async () => {
  const prisma = makeMockPrisma(makeJob({ status: 'PENDING' }))
  const updated = await transition(prisma, 'job-1', ['PENDING'], 'PARSING')
  assert.strictEqual(updated.status, 'PARSING')
  assert.ok(updated.parsedAt instanceof Date, 'parsedAt deve ser Date')
})

test('transition PARSING → PREVIEW_READY com patch.previewSummary', async () => {
  const prisma = makeMockPrisma(makeJob({ status: 'PARSING', parsedAt: new Date() }))
  const summary = { totalRows: 50, counts: {} as Record<string, number> }
  const updated = await transition(prisma, 'job-1', ['PARSING'], 'PREVIEW_READY', {
    previewSummary: summary as never,
    totalRows: 50,
  })
  assert.strictEqual(updated.status, 'PREVIEW_READY')
  assert.strictEqual(updated.totalRows, 50)
  assert.deepStrictEqual(updated.previewSummary, summary)
})

test('transition inválida COMPLETED → APPLYING lança InvalidStateTransitionError', async () => {
  const prisma = makeMockPrisma(makeJob({ status: 'COMPLETED' }))
  await assert.rejects(
    () => transition(prisma, 'job-1', ['PREVIEW_READY'], 'APPLYING'),
    (err) => {
      assert.ok(err instanceof InvalidStateTransitionError)
      assert.strictEqual(err.current, 'COMPLETED')
      assert.strictEqual(err.attempted, 'APPLYING')
      return true
    },
  )
})

test('transition para terminal state seta completedAt', async () => {
  const states: ImportJobStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']
  for (const target of states) {
    const prisma = makeMockPrisma(makeJob({ status: 'APPLYING', appliedAt: new Date() }))
    const updated = await transition(prisma, 'job-1', ['APPLYING'], target)
    assert.strictEqual(updated.status, target)
    assert.ok(updated.completedAt instanceof Date, `completedAt setado para ${target}`)
  }
})

test('transition APPLYING seta appliedAt apenas se null', async () => {
  const prisma = makeMockPrisma(makeJob({ status: 'PREVIEW_READY' }))
  const updated = await transition(prisma, 'job-1', ['PREVIEW_READY'], 'APPLYING')
  assert.ok(updated.appliedAt instanceof Date)
})

test('transition não sobrescreve appliedAt já existente', async () => {
  const fixed = new Date('2026-04-01T12:00:00Z')
  const prisma = makeMockPrisma(makeJob({ status: 'PREVIEW_READY', appliedAt: fixed }))
  const updated = await transition(prisma, 'job-1', ['PREVIEW_READY'], 'APPLYING')
  assert.strictEqual((updated.appliedAt as Date).getTime(), fixed.getTime())
})

test('transition em job inexistente lança erro', async () => {
  const prisma = makeMockPrisma(makeJob())
  await assert.rejects(
    () => transition(prisma, 'job-nope', ['PENDING'], 'PARSING'),
    /não encontrado/,
  )
})

test('transition com múltiplos fromStates aceita qualquer um', async () => {
  const prisma = makeMockPrisma(makeJob({ status: 'PARSING' }))
  const updated = await transition(
    prisma,
    'job-1',
    ['PENDING', 'PARSING'],
    'FAILED',
    { failureReason: 'INVALID_TIRVU_HEADER' },
  )
  assert.strictEqual(updated.status, 'FAILED')
  assert.strictEqual(updated.failureReason, 'INVALID_TIRVU_HEADER')
})
