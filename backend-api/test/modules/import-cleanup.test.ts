import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

const TMP_ROOT = mkdtempSync(path.join(tmpdir(), 'gf-import-cleanup-test-'))
process.env.IMPORT_FILE_STORAGE_PATH = TMP_ROOT

const storage = require('../../src/modules/imports/import-storage') as typeof import('../../src/modules/imports/import-storage')
const cleanup = require('../../src/modules/imports/cleanup-cron') as typeof import('../../src/modules/imports/cleanup-cron')

interface JobFixture {
  id: string
  tenantId: string
  status: string
  createdAt: Date
  storagePath: string | null
  errorReportPath: string | null
}

function makeMockPrisma(jobs: JobFixture[]): {
  prisma: PrismaClient
  updates: { id: string; data: Record<string, unknown> }[]
} {
  const updates: { id: string; data: Record<string, unknown> }[] = []
  const prisma = {
    importJob: {
      async findMany(args: {
        where: {
          createdAt: { lt: Date }
          status: { in: string[] }
        }
        select: Record<string, boolean>
      }) {
        const cutoff = args.where.createdAt.lt
        const allowed = new Set(args.where.status.in)
        return jobs
          .filter((j) => j.createdAt < cutoff && allowed.has(j.status))
          .map((j) => ({
            id: j.id,
            tenantId: j.tenantId,
            storagePath: j.storagePath,
            errorReportPath: j.errorReportPath,
          }))
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        updates.push({ id: args.where.id, data: args.data })
        return { id: args.where.id }
      },
    },
  }
  return { prisma: prisma as unknown as PrismaClient, updates }
}

test('cleanup-cron', async (t) => {
  t.after(async () => {
    await rm(TMP_ROOT, { recursive: true, force: true })
  })

  await t.test('removeAllExpired remove arquivos >90d em estado terminal', async () => {
    const t1 = randomUUID()
    const t2 = randomUUID()
    const j1 = randomUUID()
    const j2 = randomUUID()
    await storage.persist({ tenantId: t1, jobId: j1, buffer: Buffer.from('old1'), filename: 'a' })
    await storage.persist({ tenantId: t2, jobId: j2, buffer: Buffer.from('old2'), filename: 'b' })

    const oldDate = new Date(Date.now() - 100 * 86_400_000)
    const fixtures: JobFixture[] = [
      {
        id: j1,
        tenantId: t1,
        status: 'COMPLETED',
        createdAt: oldDate,
        storagePath: `${TMP_ROOT}/${t1}/${j1}.xlsx`,
        errorReportPath: null,
      },
      {
        id: j2,
        tenantId: t2,
        status: 'FAILED',
        createdAt: oldDate,
        storagePath: `${TMP_ROOT}/${t2}/${j2}.xlsx`,
        errorReportPath: null,
      },
    ]
    const { prisma, updates } = makeMockPrisma(fixtures)
    const result = await cleanup.removeAllExpired(prisma, { retentionDays: 90 })

    assert.strictEqual(result.scanned, 2)
    assert.strictEqual(result.filesRemoved, 2)
    assert.strictEqual(result.dbUpdated, 2)
    assert.strictEqual(updates.length, 2)
  })

  await t.test('removeAllExpired ignora jobs em estado não-terminal', async () => {
    const oldDate = new Date(Date.now() - 100 * 86_400_000)
    const fixtures: JobFixture[] = [
      {
        id: randomUUID(),
        tenantId: randomUUID(),
        status: 'PARSING', // não-terminal
        createdAt: oldDate,
        storagePath: '/var/imports/x.xlsx',
        errorReportPath: null,
      },
    ]
    const { prisma } = makeMockPrisma(fixtures)
    const result = await cleanup.removeAllExpired(prisma, { retentionDays: 90 })
    assert.strictEqual(result.scanned, 0)
  })

  await t.test('removeAllExpired ignora jobs recentes mesmo terminais', async () => {
    const recent = new Date(Date.now() - 10 * 86_400_000)
    const fixtures: JobFixture[] = [
      {
        id: randomUUID(),
        tenantId: randomUUID(),
        status: 'COMPLETED',
        createdAt: recent,
        storagePath: '/var/imports/x.xlsx',
        errorReportPath: null,
      },
    ]
    const { prisma } = makeMockPrisma(fixtures)
    const result = await cleanup.removeAllExpired(prisma, { retentionDays: 90 })
    assert.strictEqual(result.scanned, 0)
  })

  await t.test('removeAllExpired skipa update se ambos paths já são null', async () => {
    const oldDate = new Date(Date.now() - 200 * 86_400_000)
    const fixtures: JobFixture[] = [
      {
        id: randomUUID(),
        tenantId: randomUUID(),
        status: 'CANCELLED',
        createdAt: oldDate,
        storagePath: null, // já nulo
        errorReportPath: null,
      },
    ]
    const { prisma, updates } = makeMockPrisma(fixtures)
    const result = await cleanup.removeAllExpired(prisma, { retentionDays: 90 })
    assert.strictEqual(result.scanned, 1)
    assert.strictEqual(result.dbUpdated, 0)
    assert.strictEqual(updates.length, 0)
  })

  await t.test('removeAllExpired aceita opts.now custom', async () => {
    const past = new Date('2026-01-01T00:00:00Z')
    const fixtures: JobFixture[] = [
      {
        id: randomUUID(),
        tenantId: randomUUID(),
        status: 'COMPLETED',
        createdAt: new Date('2025-09-01T00:00:00Z'),
        storagePath: '/var/imports/x.xlsx',
        errorReportPath: null,
      },
    ]
    const { prisma } = makeMockPrisma(fixtures)
    const result = await cleanup.removeAllExpired(prisma, { retentionDays: 90, now: past })
    assert.strictEqual(result.scanned, 1)
  })

  await t.test('cleanupOldImports é wrapper de removeAllExpired', async () => {
    const { prisma } = makeMockPrisma([])
    const result = await cleanup.cleanupOldImports(prisma)
    assert.strictEqual(result.scanned, 0)
    assert.strictEqual(result.filesRemoved, 0)
    assert.strictEqual(result.dbUpdated, 0)
  })
})
