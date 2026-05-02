// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { PrismaClient } from '@prisma/client'
import { detect, parseRows } from './tirvu-parser'
import { validate } from './import-validator'
import { matchAll } from './import-matcher'
import { transition } from './import-job-service'
import { read as storageRead } from './import-storage'
import { applyItem, type ApplyItem, type ApplyOptions, type ApplyResult } from './import-applier'
import { InvalidStateTransitionError, type TirvuRow } from './types'
import type { PipelineLogger } from './worker-pipeline'

const CHUNK_SIZE = Number(process.env.IMPORT_CHUNK_SIZE ?? 100)

export interface ApplyPipelineDeps {
  prisma: PrismaClient
  log: PipelineLogger
  userId: string
}

export interface ApplyPipelineInput {
  jobId: string
  options: ApplyOptions
}

function logCtx(jobId: string, tenantId: string, phase: string) {
  return { module: 'imports', importJobId: jobId, tenantId, phase }
}

function buildItems(
  matchResult: ReturnType<typeof matchAll>,
  options: ApplyOptions,
): ApplyItem[] {
  const items: ApplyItem[] = []

  // Workplaces primeiro (Employees podem referenciar Lotação)
  for (const name of matchResult.newWorkplaces) {
    if (options.createWorkplaces.includes(name)) {
      items.push({ kind: 'workplace', name })
    }
  }

  for (const e of matchResult.create) {
    items.push({ kind: 'create', row: e.row, patch: e.patch })
  }
  for (const e of matchResult.update) {
    items.push({ kind: 'update', row: e.row, employee: e.employee, patch: e.patch, diff: e.diff })
  }
  for (const e of matchResult.reactivation) {
    items.push({
      kind: 'reactivation',
      row: e.row,
      employee: e.employee,
      patch: e.patch,
      diff: e.diff,
    })
  }
  for (const emp of matchResult.absent) {
    items.push({ kind: 'absent', employee: emp })
  }
  for (const e of matchResult.invalid) {
    items.push({ kind: 'invalid', row: e.row, errors: e.errors })
  }

  return items
}

export async function runApplyPipeline(
  deps: ApplyPipelineDeps,
  input: ApplyPipelineInput,
): Promise<void> {
  const { prisma, log, userId } = deps
  const { jobId, options } = input

  let tenantId = 'unknown'

  try {
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      select: { id: true, tenantId: true, status: true, fileHash: true },
    })
    if (!job) {
      log.warn({ module: 'imports', importJobId: jobId, phase: 'apply' }, 'job não encontrado')
      return
    }
    tenantId = job.tenantId

    if (job.status !== 'APPLYING') {
      log.warn(logCtx(jobId, tenantId, 'apply'), `status atual ${job.status}, esperava APPLYING`)
      return
    }

    const buffer = await storageRead({ tenantId, jobId, expectedHash: job.fileHash })

    const parserVersion = detect(buffer)
    if (parserVersion === null) {
      log.error(logCtx(jobId, tenantId, 'apply'), 'INVALID_TIRVU_HEADER no apply')
      await transition(prisma, jobId, ['APPLYING'], 'FAILED', {
        failureReason: 'INVALID_TIRVU_HEADER',
      })
      return
    }

    const rows: TirvuRow[] = []
    for await (const row of parseRows(buffer)) rows.push(row)

    const validRowSet = new Set<number>()
    const invalidRowsFromValidator: { row: TirvuRow; errors: string[] }[] = []
    for (const row of rows) {
      const r = validate(row)
      if (r.status === 'valid') validRowSet.add(row.rowIndex)
      else invalidRowsFromValidator.push({ row, errors: r.errors })
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

    const items = buildItems(matchResult, options)
    const ctx = { tenantId, jobId, userId, options }
    const result: ApplyResult = {
      created: 0,
      updated: 0,
      reactivated: 0,
      pendingMarked: 0,
      invalidLogged: 0,
      workplacesCreated: 0,
    }

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE)
      await prisma.$transaction(async (tx) => {
        for (const item of chunk) {
          const r = await applyItem(tx as unknown as PrismaClient, item, ctx)
          if (r.delta) result[r.delta]++
        }
      })
      await prisma.importJob.update({
        where: { id: jobId },
        data: { rowsProcessed: { increment: chunk.length } },
      })
    }

    await transition(prisma, jobId, ['APPLYING'], 'COMPLETED', {
      rowsCreated: result.created,
      rowsUpdated: result.updated,
      rowsInvalid: result.invalidLogged,
      rowsAbsent: result.pendingMarked,
      workplacesCreated: result.workplacesCreated,
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'EMPLOYEE_IMPORT_JOB_COMPLETED',
        resourceType: 'IMPORT_JOB',
        resourceId: jobId,
        newData: { ...result } as never,
      },
    })

    log.info(
      { ...logCtx(jobId, tenantId, 'apply'), result },
      'COMPLETED',
    )
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      log.warn(
        { ...logCtx(jobId, tenantId, 'apply'), error: err.message },
        'state transition race',
      )
      throw err
    }
    const message =
      err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500)
    log.error(
      { ...logCtx(jobId, tenantId, 'apply'), error: message },
      'APPLY_ERROR',
    )
    try {
      await transition(prisma, jobId, ['APPLYING'], 'FAILED', {
        failureReason: 'APPLY_ERROR',
      })
    } catch (innerErr) {
      log.error(
        { ...logCtx(jobId, tenantId, 'apply'), error: String(innerErr).slice(0, 200) },
        'failed to transition to FAILED',
      )
    }
  }
}
