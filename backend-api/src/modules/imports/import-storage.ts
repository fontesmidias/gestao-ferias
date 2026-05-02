// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import {
  FileIntegrityError,
  type PersistOptions,
  type PersistResult,
  type ReadOptions,
} from './types'

const STORAGE_ROOT = process.env.IMPORT_FILE_STORAGE_PATH

if (!STORAGE_ROOT || STORAGE_ROOT.trim().length === 0) {
  throw new Error(
    'IMPORT_FILE_STORAGE_PATH is required (ex.: /var/imports). Set in .env.',
  )
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} must be UUID`)
  }
}

function pathFor(tenantId: string, jobId: string): string {
  assertUuid(tenantId, 'tenantId')
  assertUuid(jobId, 'jobId')
  return path.join(STORAGE_ROOT as string, tenantId, `${jobId}.xlsx`)
}

export function pathForErrors(tenantId: string, jobId: string): string {
  assertUuid(tenantId, 'tenantId')
  assertUuid(jobId, 'jobId')
  return path.join(STORAGE_ROOT as string, tenantId, `${jobId}-errors.xlsx`)
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function persist(opts: PersistOptions): Promise<PersistResult> {
  const target = pathFor(opts.tenantId, opts.jobId)
  const dir = path.dirname(target)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(target, opts.buffer, { mode: 0o600 })
  return {
    storagePath: target,
    fileHash: sha256Hex(opts.buffer),
    fileSize: opts.buffer.length,
  }
}

export async function read(opts: ReadOptions): Promise<Buffer> {
  const target = pathFor(opts.tenantId, opts.jobId)
  const buffer = await readFile(target)
  const actual = sha256Hex(buffer)
  if (actual !== opts.expectedHash) {
    throw new FileIntegrityError(opts.tenantId, opts.jobId, opts.expectedHash, actual)
  }
  return buffer
}

export async function removeForJob({
  tenantId,
  jobId,
}: {
  tenantId: string
  jobId: string
}): Promise<void> {
  const target = pathFor(tenantId, jobId)
  try {
    await unlink(target)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
}
