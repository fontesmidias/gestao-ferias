import test from 'node:test'
import assert from 'node:assert'
import { autoCancelStalePreviews, timeoutStuckJobs } from '../../src/modules/imports/watchdog'
import type { ImportJob, PrismaClient } from '@prisma/client'

interface FakeJob {
  id: string
  status: string
  parsedAt: Date | null
  appliedAt: Date | null
  failureReason?: string | null
}

function makeMockPrisma(jobs: FakeJob[]): {
  prisma: PrismaClient
  updates: { id: string; data: Record<string, unknown> }[]
} {
  const updates: { id: string; data: Record<string, unknown> }[] = []
  const prisma = {
    importJob: {
      async findMany(args: { where: any }) {
        const w = args.where
        return jobs.filter((j) => {
          if (w.status === 'PREVIEW_READY') {
            return j.status === 'PREVIEW_READY' && j.parsedAt && j.parsedAt < w.parsedAt.lt
          }
          if (w.OR) {
            return w.OR.some((c: any) => {
              if (c.status === 'PARSING') return j.status === 'PARSING' && j.parsedAt && j.parsedAt < c.parsedAt.lt
              if (c.status === 'APPLYING') return j.status === 'APPLYING' && j.appliedAt && j.appliedAt < c.appliedAt.lt
              return false
            })
          }
          return false
        }).map((j) => ({ id: j.id }))
      },
      async findUnique({ where: { id } }: { where: { id: string } }) {
        const j = jobs.find((x) => x.id === id)
        return j ? ({ ...j } as unknown as ImportJob) : null
      },
      async update({ where: { id }, data }: { where: { id: string }; data: any }) {
        updates.push({ id, data })
        const j = jobs.find((x) => x.id === id)
        if (j) Object.assign(j, data)
        return { ...j } as unknown as ImportJob
      },
    },
    async $transaction<T>(fn: (tx: typeof this) => Promise<T>): Promise<T> {
      return fn(this)
    },
  }
  return { prisma: prisma as unknown as PrismaClient, updates }
}

const NOW = new Date('2026-05-01T12:00:00Z')

test('autoCancelStalePreviews cancela PREVIEW_READY >24h', async () => {
  const oldDate = new Date(NOW.getTime() - 25 * 3_600_000)
  const { prisma, updates } = makeMockPrisma([
    { id: 'job-old', status: 'PREVIEW_READY', parsedAt: oldDate, appliedAt: null },
  ])
  const r = await autoCancelStalePreviews(prisma, { now: NOW })
  assert.strictEqual(r.cancelled, 1)
  const final = updates.find((u) => u.id === 'job-old')
  assert.ok(final)
  assert.strictEqual((final.data as any).status, 'CANCELLED')
  assert.strictEqual((final.data as any).failureReason, 'AUTO_CANCELLED_PREVIEW_TTL')
})

test('autoCancelStalePreviews ignora PREVIEW_READY recente', async () => {
  const recent = new Date(NOW.getTime() - 1 * 3_600_000)
  const { prisma } = makeMockPrisma([
    { id: 'job-fresh', status: 'PREVIEW_READY', parsedAt: recent, appliedAt: null },
  ])
  const r = await autoCancelStalePreviews(prisma, { now: NOW })
  assert.strictEqual(r.cancelled, 0)
})

test('autoCancelStalePreviews ignora outros status', async () => {
  const oldDate = new Date(NOW.getTime() - 100 * 3_600_000)
  const { prisma } = makeMockPrisma([
    { id: 'job-x', status: 'COMPLETED', parsedAt: oldDate, appliedAt: oldDate },
  ])
  const r = await autoCancelStalePreviews(prisma, { now: NOW })
  assert.strictEqual(r.cancelled, 0)
})

test('timeoutStuckJobs marca PARSING >15min como TIMED_OUT', async () => {
  const oldDate = new Date(NOW.getTime() - 30 * 60_000)
  const { prisma, updates } = makeMockPrisma([
    { id: 'job-stuck', status: 'PARSING', parsedAt: oldDate, appliedAt: null },
  ])
  const r = await timeoutStuckJobs(prisma, { now: NOW, maxIdleMinutes: 15 })
  assert.strictEqual(r.timedOut, 1)
  const final = updates.find((u) => u.id === 'job-stuck')
  assert.strictEqual((final!.data as any).status, 'TIMED_OUT')
  assert.strictEqual((final!.data as any).failureReason, 'WORKER_STUCK_OR_CRASHED')
})

test('timeoutStuckJobs marca APPLYING >15min como TIMED_OUT', async () => {
  const oldDate = new Date(NOW.getTime() - 30 * 60_000)
  const { prisma } = makeMockPrisma([
    { id: 'apply-stuck', status: 'APPLYING', parsedAt: new Date(NOW), appliedAt: oldDate },
  ])
  const r = await timeoutStuckJobs(prisma, { now: NOW, maxIdleMinutes: 15 })
  assert.strictEqual(r.timedOut, 1)
})

test('timeoutStuckJobs ignora jobs com idle < threshold', async () => {
  const recent = new Date(NOW.getTime() - 5 * 60_000)
  const { prisma } = makeMockPrisma([
    { id: 'fresh', status: 'PARSING', parsedAt: recent, appliedAt: null },
  ])
  const r = await timeoutStuckJobs(prisma, { now: NOW, maxIdleMinutes: 15 })
  assert.strictEqual(r.timedOut, 0)
})

test('timeoutStuckJobs aceita maxIdleMinutes custom', async () => {
  const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000)
  const { prisma } = makeMockPrisma([
    { id: 'a', status: 'PARSING', parsedAt: fiveMinAgo, appliedAt: null },
  ])
  const r = await timeoutStuckJobs(prisma, { now: NOW, maxIdleMinutes: 1 })
  assert.strictEqual(r.timedOut, 1)
})
