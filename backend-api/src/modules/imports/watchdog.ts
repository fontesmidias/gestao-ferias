// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { ImportJobStatus, PrismaClient } from '@prisma/client'
import { transition } from './import-job-service'
import { InvalidStateTransitionError } from './types'

const ONE_HOUR_MS = 3_600_000
const ONE_MIN_MS = 60_000
const PREVIEW_MAX_AGE_HOURS_DEFAULT = 24
const STUCK_STATES: ImportJobStatus[] = ['PARSING', 'APPLYING']

function getDefaultStuckMinutes(): number {
  return Number(process.env.IMPORT_JOB_TIMEOUT_MIN ?? 15)
}

export interface WatchdogOptions {
  now?: Date
}

export interface AutoCancelOptions extends WatchdogOptions {
  maxAgeHours?: number
}

export interface TimeoutOptions extends WatchdogOptions {
  maxIdleMinutes?: number
}

export async function autoCancelStalePreviews(
  prisma: PrismaClient,
  opts: AutoCancelOptions = {},
): Promise<{ cancelled: number }> {
  const maxAgeHours = opts.maxAgeHours ?? PREVIEW_MAX_AGE_HOURS_DEFAULT
  const baseTime = (opts.now ?? new Date()).getTime()
  const cutoff = new Date(baseTime - maxAgeHours * ONE_HOUR_MS)

  const stale = await prisma.importJob.findMany({
    where: {
      status: 'PREVIEW_READY',
      parsedAt: { lt: cutoff },
    },
    select: { id: true },
  })

  let cancelled = 0
  for (const job of stale) {
    try {
      await transition(prisma, job.id, ['PREVIEW_READY'], 'CANCELLED', {
        failureReason: 'AUTO_CANCELLED_PREVIEW_TTL',
      })
      cancelled++
    } catch (err) {
      if (err instanceof InvalidStateTransitionError) continue
      throw err
    }
  }

  return { cancelled }
}

export async function timeoutStuckJobs(
  prisma: PrismaClient,
  opts: TimeoutOptions = {},
): Promise<{ timedOut: number }> {
  const maxIdleMinutes = opts.maxIdleMinutes ?? getDefaultStuckMinutes()
  const baseTime = (opts.now ?? new Date()).getTime()
  const cutoff = new Date(baseTime - maxIdleMinutes * ONE_MIN_MS)

  const stuck = await prisma.importJob.findMany({
    where: {
      OR: [
        { status: 'PARSING', parsedAt: { lt: cutoff } },
        { status: 'APPLYING', appliedAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  })

  let timedOut = 0
  for (const job of stuck) {
    try {
      await transition(prisma, job.id, STUCK_STATES, 'TIMED_OUT', {
        failureReason: 'WORKER_STUCK_OR_CRASHED',
      })
      timedOut++
    } catch (err) {
      if (err instanceof InvalidStateTransitionError) continue
      throw err
    }
  }

  return { timedOut }
}
