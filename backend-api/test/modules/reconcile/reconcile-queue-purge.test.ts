import test from 'node:test'
import assert from 'node:assert'
import { purgeOldQueueItems } from '../../../src/modules/reconcile/reconcile-queue.purge'

interface QueueRow {
  id: string
  state: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
  resolvedAt: Date | null
}

function makePrisma(rows: QueueRow[]) {
  const data = [...rows]
  const prisma = {
    workplaceReconcileQueue: {
      async deleteMany({
        where,
      }: {
        where: {
          state: { in: string[] }
          resolvedAt: { lt: Date }
        }
      }) {
        const before = data.length
        const states = where.state.in
        const cutoff = where.resolvedAt.lt
        for (let i = data.length - 1; i >= 0; i--) {
          const r = data[i]
          if (states.includes(r.state) && r.resolvedAt && r.resolvedAt < cutoff) {
            data.splice(i, 1)
          }
        }
        return { count: before - data.length }
      },
    },
  }
  return { prisma: prisma as never, data }
}

const NOW = new Date('2026-05-05T00:00:00Z')

test('Story 3.2 — apaga RESOLVED/IGNORED >90d', async () => {
  const old1 = new Date('2026-01-01T00:00:00Z') // ~125 dias atrás
  const recent = new Date('2026-04-15T00:00:00Z') // ~20 dias atrás
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'RESOLVED', resolvedAt: old1 },
    { id: 'q2', state: 'IGNORED', resolvedAt: old1 },
    { id: 'q3', state: 'RESOLVED', resolvedAt: recent },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW })
  assert.strictEqual(r.deleted, 2)
  assert.strictEqual(data.length, 1)
  assert.strictEqual(data[0].id, 'q3')
})

test('Story 3.2 — mantém items recentes (<90d)', async () => {
  const recent = new Date('2026-04-15T00:00:00Z')
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'RESOLVED', resolvedAt: recent },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW })
  assert.strictEqual(r.deleted, 0)
  assert.strictEqual(data.length, 1)
})

test('Story 3.2 — não toca PENDING/DEFERRED mesmo com resolvedAt antigo', async () => {
  const old = new Date('2025-01-01T00:00:00Z')
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'PENDING', resolvedAt: old },
    { id: 'q2', state: 'DEFERRED', resolvedAt: old },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW })
  assert.strictEqual(r.deleted, 0)
  assert.strictEqual(data.length, 2)
})

test('Story 3.2 — custom retentionDays=30', async () => {
  const fortyDaysOld = new Date(NOW.getTime() - 40 * 86_400_000)
  const tenDaysOld = new Date(NOW.getTime() - 10 * 86_400_000)
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'RESOLVED', resolvedAt: fortyDaysOld },
    { id: 'q2', state: 'IGNORED', resolvedAt: tenDaysOld },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW, retentionDays: 30 })
  assert.strictEqual(r.deleted, 1, 'apenas q1 (>30d) é apagado')
  assert.strictEqual(data.length, 1)
  assert.strictEqual(data[0].id, 'q2')
})
