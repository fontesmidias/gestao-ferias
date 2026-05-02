// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { ImportJobStatus, PrismaClient } from '@prisma/client'
import { removeForJob } from './import-storage'
import type { CleanupResult } from './types'

const RETENTION_DAYS_DEFAULT = Number(process.env.IMPORT_RETENTION_DAYS ?? 90)
const TERMINAL_STATES: ImportJobStatus[] = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]
const ONE_DAY_MS = 86_400_000

export interface CleanupOptions {
  retentionDays?: number
  now?: Date
}

export async function removeAllExpired(
  prisma: PrismaClient,
  opts: CleanupOptions = {},
): Promise<CleanupResult> {
  const days = opts.retentionDays ?? RETENTION_DAYS_DEFAULT
  const baseTime = (opts.now ?? new Date()).getTime()
  const cutoff = new Date(baseTime - days * ONE_DAY_MS)

  const expired = await prisma.importJob.findMany({
    where: {
      createdAt: { lt: cutoff },
      status: { in: TERMINAL_STATES },
    },
    select: {
      id: true,
      tenantId: true,
      storagePath: true,
      errorReportPath: true,
    },
  })

  let filesRemoved = 0
  let dbUpdated = 0

  for (const job of expired) {
    try {
      await removeForJob({ tenantId: job.tenantId, jobId: job.id })
      filesRemoved++
    } catch {
      // Caller (worker em Story 3.1) decide log; aqui apenas continua.
    }

    if (job.storagePath !== null || job.errorReportPath !== null) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          storagePath: { set: null as unknown as string },
          errorReportPath: { set: null as unknown as string },
        },
      })
      dbUpdated++
    }
  }

  return { scanned: expired.length, filesRemoved, dbUpdated }
}

export async function cleanupOldImports(
  prisma: PrismaClient,
): Promise<CleanupResult> {
  return removeAllExpired(prisma)
}
