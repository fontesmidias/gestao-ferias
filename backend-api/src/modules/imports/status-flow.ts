// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { PrismaClient } from '@prisma/client'
import type { PreviewSummary } from './types'

export type StatusScope = 'admin' | 'tenant'

export interface StatusDeps {
  prisma: PrismaClient
}

export interface StatusRequest {
  user?: { userId: string; tenantId?: string; role?: string }
}

export interface StatusReply {
  code(c: number): StatusReply
  send(payload: unknown): StatusReply
}

export interface StatusEntrypointInput {
  jobId: string
  scope: StatusScope
}

function envelope(
  data: unknown,
  error: { code: string; message: string } | null = null,
  meta: unknown = null,
) {
  return { data, error, meta }
}

function liteSummary(full: PreviewSummary | null | undefined) {
  if (!full) return null
  return {
    totalRows: full.totalRows,
    counts: full.counts,
    newWorkplaces: full.newWorkplaces,
  }
}

export async function statusEntrypoint(
  deps: StatusDeps,
  request: StatusRequest,
  reply: StatusReply,
  input: StatusEntrypointInput,
): Promise<StatusReply> {
  const user = request.user

  if (!user) {
    return reply
      .code(401)
      .send(envelope(null, { code: 'UNAUTHORIZED', message: 'Sessão inválida' }))
  }

  const job = await deps.prisma.importJob.findUnique({
    where: { id: input.jobId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      filename: true,
      fileSize: true,
      totalRows: true,
      rowsProcessed: true,
      rowsCreated: true,
      rowsUpdated: true,
      rowsInvalid: true,
      rowsAbsent: true,
      workplacesCreated: true,
      previewSummary: true,
      failureReason: true,
      createdAt: true,
      parsedAt: true,
      appliedAt: true,
      completedAt: true,
    },
  })

  if (!job) {
    return reply
      .code(404)
      .send(envelope(null, { code: 'JOB_NOT_FOUND', message: 'Job não encontrado' }))
  }

  if (input.scope === 'tenant') {
    if (!user.tenantId || job.tenantId !== user.tenantId) {
      return reply
        .code(404)
        .send(envelope(null, { code: 'JOB_NOT_FOUND', message: 'Job não encontrado' }))
    }
  }

  return reply.code(200).send(
    envelope({
      jobId: job.id,
      tenantId: job.tenantId,
      status: job.status,
      filename: job.filename,
      fileSize: job.fileSize,
      totalRows: job.totalRows,
      rowsProcessed: job.rowsProcessed,
      rowsCreated: job.rowsCreated,
      rowsUpdated: job.rowsUpdated,
      rowsInvalid: job.rowsInvalid,
      rowsAbsent: job.rowsAbsent,
      workplacesCreated: job.workplacesCreated,
      previewSummary: liteSummary(job.previewSummary as PreviewSummary | null),
      failureReason: job.failureReason,
      createdAt: job.createdAt,
      parsedAt: job.parsedAt,
      appliedAt: job.appliedAt,
      completedAt: job.completedAt,
    }),
  )
}
