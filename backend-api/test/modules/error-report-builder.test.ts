import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import * as XLSX from 'xlsx'

const TMP_ROOT = mkdtempSync(path.join(tmpdir(), 'gf-error-report-'))
process.env.IMPORT_FILE_STORAGE_PATH = TMP_ROOT

const builder = require('../../src/modules/imports/error-report-builder') as typeof import('../../src/modules/imports/error-report-builder')
const types = require('../../src/modules/imports/types') as typeof import('../../src/modules/imports/types')

const FIXTURES_DIR = path.join(__dirname, '../fixtures/imports')

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function persistFixture(tenantId: string, jobId: string, name: string): string {
  const buffer = readFileSync(path.join(FIXTURES_DIR, name))
  const dir = path.join(TMP_ROOT, tenantId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${jobId}.xlsx`), buffer)
  return sha256(buffer)
}

test('error-report-builder', async (t) => {
  t.after(async () => {
    await rm(TMP_ROOT, { recursive: true, force: true })
  })

  await t.test('fixture com 4 inválidos → invalidCount=4 e header em pt-BR', async () => {
    // Fixture tem 5 linhas problemáticas, mas após a decisão de 2026-05-04
    // (status como campo livre + idade implausível aceita), a linha com
    // status="INVALIDO" passou a ser considerada válida. Restam 4:
    //   - CPF DV inválido (11111111111)
    //   - Admissão futura (2099)
    //   - Nome vazio
    //   - Admissão fora do formato dd/MM/yyyy (2024-01-15)
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const fileHash = persistFixture(tenantId, jobId, 'tirvu-mixed-errors.xlsx')

    const r = await builder.buildErrorReportXlsx({ tenantId, jobId, fileHash })

    assert.strictEqual(r.invalidCount, 4)
    assert.ok(Buffer.isBuffer(r.buffer))
    assert.ok(r.buffer.length > 0)

    const wb = XLSX.read(r.buffer, { type: 'buffer' })
    assert.deepStrictEqual(wb.SheetNames, ['Erros'])
    const sheet = wb.Sheets['Erros']
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
    })
    assert.strictEqual(rows.length, 5) // header + 4 invalid
    assert.deepStrictEqual(rows[0], [
      'Linha',
      'Motivo',
      'ID Tirvu',
      'CPF',
      'Nome',
      'Status',
      'Empresa',
      'Lotação',
      'Admissão',
    ])
  })

  await t.test('fixture sem inválidos → invalidCount=0 e só header', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    const fileHash = persistFixture(tenantId, jobId, 'tirvu-anatel-50.xlsx')

    const r = await builder.buildErrorReportXlsx({ tenantId, jobId, fileHash })

    assert.strictEqual(r.invalidCount, 0)
    const wb = XLSX.read(r.buffer, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Erros'], {
      header: 1,
      defval: null,
    })
    assert.strictEqual(rows.length, 1) // só header
  })

  await t.test('fileHash incorreto → FileIntegrityError', async () => {
    const tenantId = randomUUID()
    const jobId = randomUUID()
    persistFixture(tenantId, jobId, 'tirvu-anatel-50.xlsx')

    await assert.rejects(
      () =>
        builder.buildErrorReportXlsx({
          tenantId,
          jobId,
          fileHash: 'a'.repeat(64),
        }),
      (err) => err instanceof types.FileIntegrityError,
    )
  })
})
