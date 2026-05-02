import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ImportJob, PrismaClient } from '@prisma/client'
import type { Queue } from 'bullmq'

const TMP_ROOT = mkdtempSync(path.join(tmpdir(), 'gf-upload-flow-'))
process.env.IMPORT_FILE_STORAGE_PATH = TMP_ROOT

const flow = require('../../src/modules/imports/upload-flow') as typeof import('../../src/modules/imports/upload-flow')

interface PrismaCalls {
  jobsCreated: { data: Record<string, unknown> }[]
  jobsUpdated: { id: string; data: Record<string, unknown> }[]
  auditLogs: { data: Record<string, unknown> }[]
}

function makeMockPrisma(): { prisma: PrismaClient; calls: PrismaCalls } {
  const calls: PrismaCalls = {
    jobsCreated: [],
    jobsUpdated: [],
    auditLogs: [],
  }
  const prisma = {
    importJob: {
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        calls.jobsCreated.push({ data: { ...data, id } })
        return { id, ...data } as unknown as ImportJob
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        calls.jobsUpdated.push({ id, data })
        return { id, ...data } as unknown as ImportJob
      },
    },
    auditLog: {
      async create({ data }: { data: Record<string, unknown> }) {
        calls.auditLogs.push({ data })
        return { id: randomUUID(), ...data }
      },
    },
  }
  return { prisma: prisma as unknown as PrismaClient, calls }
}

function makeMockQueue() {
  const adds: { name: string; payload: unknown }[] = []
  const queue = {
    async add(name: string, payload: unknown) {
      adds.push({ name, payload })
      return { id: randomUUID() } as never
    },
  } as unknown as Pick<Queue, 'add'>
  return { queue, adds }
}

const TENANT_ID = randomUUID()

test('processUploadedImport', async (t) => {
  t.after(async () => {
    await rm(TMP_ROOT, { recursive: true, force: true })
  })

  await t.test('happy path: cria job, persiste, atualiza, audit, enfileira', async () => {
    const { prisma, calls } = makeMockPrisma()
    const { queue, adds } = makeMockQueue()

    const result = await flow.processUploadedImport(prisma, queue, {
      tenantId: TENANT_ID,
      operatorUserId: randomUUID(),
      buffer: Buffer.from('test-payload'),
      filename: 'serviplus.xlsx',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    })

    assert.strictEqual(result.status, 'PENDING')
    assert.match(
      result.jobId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )

    assert.strictEqual(calls.jobsCreated.length, 1)
    const created = calls.jobsCreated[0].data
    assert.strictEqual(created.tenantId, TENANT_ID)
    assert.strictEqual(created.status, 'PENDING')
    assert.strictEqual(created.parserVersion, 'tirvu-v1')
    assert.strictEqual(created.filename, 'serviplus.xlsx')
    assert.strictEqual(created.fileSize, 12)
    assert.strictEqual((created.fileHash as string).length, 64)
    assert.strictEqual(created.storagePath, '')
    assert.strictEqual(created.ipAddress, '127.0.0.1')

    assert.strictEqual(calls.jobsUpdated.length, 1)
    const updated = calls.jobsUpdated[0]
    assert.strictEqual(updated.id, result.jobId)
    assert.ok((updated.data.storagePath as string).endsWith(`${result.jobId}.xlsx`))

    assert.strictEqual(calls.auditLogs.length, 1)
    assert.strictEqual(calls.auditLogs[0].data.action, 'EMPLOYEE_IMPORT_JOB_CREATED')
    assert.strictEqual(calls.auditLogs[0].data.resourceType, 'IMPORT_JOB')
    assert.strictEqual(calls.auditLogs[0].data.resourceId, result.jobId)

    assert.strictEqual(adds.length, 1)
    assert.strictEqual(adds[0].name, 'process')
    assert.deepStrictEqual(adds[0].payload, { jobId: result.jobId })

    const persistedPath = updated.data.storagePath as string
    assert.ok(existsSync(persistedPath), 'arquivo deve existir em FS')
  })

  await t.test('2 chamadas sequenciais geram jobIds distintos', async () => {
    const { prisma } = makeMockPrisma()
    const { queue } = makeMockQueue()

    const r1 = await flow.processUploadedImport(prisma, queue, {
      tenantId: TENANT_ID,
      operatorUserId: randomUUID(),
      buffer: Buffer.from('a'),
      filename: 'a.xlsx',
      ipAddress: null,
      userAgent: null,
    })
    const r2 = await flow.processUploadedImport(prisma, queue, {
      tenantId: TENANT_ID,
      operatorUserId: randomUUID(),
      buffer: Buffer.from('b'),
      filename: 'b.xlsx',
      ipAddress: null,
      userAgent: null,
    })
    assert.notStrictEqual(r1.jobId, r2.jobId)
  })

  await t.test('storage.persist falha → erro propaga', async () => {
    const { prisma } = makeMockPrisma()
    const { queue } = makeMockQueue()
    await assert.rejects(
      () =>
        flow.processUploadedImport(prisma, queue, {
          tenantId: 'not-a-uuid',
          operatorUserId: randomUUID(),
          buffer: Buffer.from('x'),
          filename: 'x.xlsx',
          ipAddress: null,
          userAgent: null,
        }),
      /tenantId must be UUID/,
    )
  })
})
