// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { ImportJob, ImportJobStatus, Prisma, PrismaClient } from '@prisma/client'
import { InvalidStateTransitionError } from './types'

export type ImportJobPatch = Omit<
  Prisma.ImportJobUncheckedUpdateInput,
  'id' | 'tenantId' | 'operatorUserId' | 'status' | 'createdAt'
>


const TERMINAL_STATES: ImportJobStatus[] = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]

function buildTimestampPatch(
  toState: ImportJobStatus,
  job: ImportJob,
): ImportJobPatch {
  const now = new Date()
  if (toState === 'PARSING' && job.parsedAt === null) {
    return { parsedAt: now }
  }
  if (toState === 'APPLYING' && job.appliedAt === null) {
    return { appliedAt: now }
  }
  if (TERMINAL_STATES.includes(toState) && job.completedAt === null) {
    return { completedAt: now }
  }
  return {}
}

export async function transition(
  prisma: PrismaClient,
  jobId: string,
  fromStates: ImportJobStatus[],
  toState: ImportJobStatus,
  patch: ImportJobPatch = {},
): Promise<ImportJob> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.importJob.findUnique({ where: { id: jobId } })
    if (!job) {
      throw new Error(`ImportJob não encontrado: ${jobId}`)
    }
    if (!fromStates.includes(job.status)) {
      throw new InvalidStateTransitionError(
        jobId,
        job.status,
        fromStates,
        toState,
      )
    }
    const data = {
      ...patch,
      status: toState,
      ...buildTimestampPatch(toState, job),
    }
    return tx.importJob.update({ where: { id: jobId }, data })
  })
}
