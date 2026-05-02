// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { PrismaClient } from '@prisma/client'
import { detect, parseRows } from './tirvu-parser'
import { validate } from './import-validator'
import { matchAll, buildPreviewSummary } from './import-matcher'
import { transition } from './import-job-service'
import { read as storageRead } from './import-storage'
import {
  FileIntegrityError,
  InvalidStateTransitionError,
  type TirvuRow,
} from './types'

export interface PipelineLogger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
}

export interface PipelineDeps {
  prisma: PrismaClient
  log: PipelineLogger
}

export interface PipelineInput {
  jobId: string
}

function logCtx(jobId: string, tenantId: string, phase: string) {
  return { module: 'imports', importJobId: jobId, tenantId, phase }
}

export async function runImportPipeline(
  deps: PipelineDeps,
  input: PipelineInput,
): Promise<void> {
  const { prisma, log } = deps
  const { jobId } = input

  let tenantId = 'unknown'

  try {
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        storagePath: true,
        fileHash: true,
      },
    })
    if (!job) {
      log.warn({ module: 'imports', importJobId: jobId, phase: 'parse' }, 'job não encontrado')
      return
    }
    tenantId = job.tenantId

    if (job.status !== 'PENDING') {
      log.warn(logCtx(jobId, tenantId, 'parse'), `status atual ${job.status}, esperava PENDING`)
      return
    }

    await transition(prisma, jobId, ['PENDING'], 'PARSING')

    let buffer: Buffer
    try {
      buffer = await storageRead({
        tenantId,
        jobId,
        expectedHash: job.fileHash,
      })
    } catch (err) {
      if (err instanceof FileIntegrityError) {
        log.error(logCtx(jobId, tenantId, 'parse'), 'FileIntegrityError')
        await transition(prisma, jobId, ['PARSING'], 'FAILED', {
          failureReason: 'FILE_INTEGRITY_FAILED',
        })
        return
      }
      throw err
    }

    const parserVersion = detect(buffer)
    if (parserVersion === null) {
      log.error(logCtx(jobId, tenantId, 'parse'), 'INVALID_TIRVU_HEADER')
      await transition(prisma, jobId, ['PARSING'], 'FAILED', {
        failureReason: 'INVALID_TIRVU_HEADER',
      })
      return
    }

    const rows: TirvuRow[] = []
    for await (const row of parseRows(buffer)) {
      rows.push(row)
    }

    const validRowSet = new Set<number>()
    const invalidRowsFromValidator: { row: TirvuRow; errors: string[] }[] = []
    for (const row of rows) {
      const result = validate(row)
      if (result.status === 'valid') {
        validRowSet.add(row.rowIndex)
      } else {
        invalidRowsFromValidator.push({ row, errors: result.errors })
      }
    }

    const [existingEmployees, existingWorkplaces] = await Promise.all([
      prisma.employee.findMany({ where: { tenantId } }),
      prisma.workplace.findMany({ where: { tenantId }, select: { name: true } }),
    ])

    const matchResult = matchAll({
      rows,
      validRowSet,
      invalidRowsFromValidator,
      ctx: { tenantId, existingEmployees, existingWorkplaces },
    })

    const previewSummary = buildPreviewSummary(matchResult, rows.length, rows.length)

    await transition(prisma, jobId, ['PARSING'], 'PREVIEW_READY', {
      previewSummary: previewSummary as never,
      totalRows: rows.length,
      rowsProcessed: rows.length,
      rowsCreated: matchResult.create.length,
      rowsUpdated: matchResult.update.length,
      rowsInvalid: matchResult.invalid.length,
      rowsAbsent: matchResult.absent.length,
      workplacesCreated: matchResult.newWorkplaces.length,
    })

    log.info(
      {
        ...logCtx(jobId, tenantId, 'parse'),
        counts: previewSummary.counts,
        newWorkplaces: previewSummary.newWorkplaces.length,
      },
      'PREVIEW_READY',
    )
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      log.warn(
        { ...logCtx(jobId, tenantId, 'parse'), error: err.message },
        'state transition race detected',
      )
      throw err
    }
    const message =
      err instanceof Error
        ? err.message.slice(0, 500)
        : String(err).slice(0, 500)
    log.error(
      { ...logCtx(jobId, tenantId, 'parse'), error: message },
      'PIPELINE_ERROR',
    )
    try {
      await transition(prisma, jobId, ['PARSING', 'PENDING'], 'FAILED', {
        failureReason: 'PIPELINE_ERROR',
      })
    } catch (innerErr) {
      log.error(
        { ...logCtx(jobId, tenantId, 'parse'), error: String(innerErr).slice(0, 200) },
        'failed to transition job to FAILED',
      )
    }
  }
}
