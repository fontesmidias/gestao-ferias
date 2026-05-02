import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

// Setup env BEFORE module is loaded
const TMP_ROOT = mkdtempSync(path.join(tmpdir(), 'gf-import-storage-test-'))
process.env.IMPORT_FILE_STORAGE_PATH = TMP_ROOT

// Lazy require pattern (V3 padrão)
const storage = require('../../src/modules/imports/import-storage') as typeof import('../../src/modules/imports/import-storage')
const types = require('../../src/modules/imports/types') as typeof import('../../src/modules/imports/types')

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

test('import-storage', async (t) => {
  t.after(async () => {
    await rm(TMP_ROOT, { recursive: true, force: true })
  })

  await t.test('persist cria diretório + arquivo, retorna metadata', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const buffer = Buffer.from('hello world')
    const result = await storage.persist({ tenantId, jobId, buffer, filename: 'foo.xlsx' })

    assert.ok(result.storagePath.endsWith(`${jobId}.xlsx`))
    assert.strictEqual(result.fileSize, buffer.length)
    assert.strictEqual(result.fileHash, sha256(buffer))
    assert.strictEqual(result.fileHash.length, 64)
    assert.match(result.fileHash, /^[0-9a-f]+$/)

    const onDisk = readFileSync(result.storagePath)
    assert.deepStrictEqual(onDisk, buffer)
  })

  await t.test('persist 2× sobrescreve sem erro', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    await storage.persist({ tenantId, jobId, buffer: Buffer.from('a'), filename: 'a' })
    const r2 = await storage.persist({ tenantId, jobId, buffer: Buffer.from('bb'), filename: 'b' })
    assert.strictEqual(r2.fileSize, 2)
  })

  await t.test('persist com tenantId não-UUID lança', async () => {
    await assert.rejects(
      () =>
        storage.persist({
          tenantId: 'not-a-uuid',
          jobId: randomUUID(),
          buffer: Buffer.from(''),
          filename: 'x',
        }),
      /tenantId must be UUID/,
    )
  })

  await t.test('persist com jobId não-UUID lança', async () => {
    await assert.rejects(
      () =>
        storage.persist({
          tenantId: randomUUID(),
          jobId: '../etc/passwd',
          buffer: Buffer.from(''),
          filename: 'x',
        }),
      /jobId must be UUID/,
    )
  })

  await t.test('read retorna buffer original quando hash bate', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const buffer = Buffer.from('integrity-ok')
    const r = await storage.persist({ tenantId, jobId, buffer, filename: 'x' })
    const got = await storage.read({ tenantId, jobId, expectedHash: r.fileHash })
    assert.deepStrictEqual(got, buffer)
  })

  await t.test('read lança FileIntegrityError quando hash divergente', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    await storage.persist({ tenantId, jobId, buffer: Buffer.from('original'), filename: 'x' })
    await assert.rejects(
      () => storage.read({ tenantId, jobId, expectedHash: 'a'.repeat(64) }),
      (err) => {
        assert.ok(err instanceof types.FileIntegrityError)
        assert.strictEqual(err.tenantId, tenantId)
        assert.strictEqual(err.jobId, jobId)
        return true
      },
    )
  })

  await t.test('read em arquivo inexistente lança ENOENT', async () => {
    await assert.rejects(
      () =>
        storage.read({
          tenantId: randomUUID(),
          jobId: randomUUID(),
          expectedHash: 'x'.repeat(64),
        }),
      (err) => (err as NodeJS.ErrnoException).code === 'ENOENT',
    )
  })

  await t.test('removeForJob remove arquivo existente', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const r = await storage.persist({
      tenantId,
      jobId,
      buffer: Buffer.from('to-remove'),
      filename: 'x',
    })
    await storage.removeForJob({ tenantId, jobId })
    await assert.rejects(
      () => storage.read({ tenantId, jobId, expectedHash: r.fileHash }),
      (err) => (err as NodeJS.ErrnoException).code === 'ENOENT',
    )
  })

  await t.test('removeForJob em arquivo inexistente é silencioso', async () => {
    await storage.removeForJob({ tenantId: randomUUID(), jobId: randomUUID() })
    // Sem assert — se não lançou, OK.
  })

  await t.test('pathForErrors retorna path com sufixo -errors.xlsx', () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const p = storage.pathForErrors(tenantId, jobId)
    assert.ok(p.endsWith(`${jobId}-errors.xlsx`))
  })

  await t.test('pathForErrors valida UUID', () => {
    assert.throws(() => storage.pathForErrors('bad', randomUUID()), /tenantId must be UUID/)
  })
})
