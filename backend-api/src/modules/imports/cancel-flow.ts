// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { PrismaClient } from '@prisma/client'
import { transition } from './import-job-service'
import { InvalidStateTransitionError } from './types'

export type CancelScope = 'admin' | 'tenant'

export interface CancelLogger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface CancelDeps {
  prisma: PrismaClient
  log: CancelLogger
}

export interface CancelRequest {
  user?: { userId: string; tenantId?: string; role?: string }
  ip: string
  headers: { [k: string]: string | string[] | undefined }
}

export interface CancelReply {
  code(c: number): CancelReply
  send(payload: unknown): CancelReply
}

export interface CancelEntrypointInput {
  jobId: string
  scope: CancelScope
}

function envelope(
  data: unknown,
  error: { code: string; message: string } | null = null,
  meta: unknown = null,
) {
  return { data, error, meta }
}

export async function cancelEntrypoint(
  deps: CancelDeps,
  request: CancelRequest,
  reply: CancelReply,
  input: CancelEntrypointInput,
): Promise<CancelReply> {
  const user = request.user as
    | { userId: string; tenantId?: string; role?: string }
    | undefined

  if (!user) {
    return reply
      .code(401)
      .send(envelope(null, { code: 'UNAUTHORIZED', message: 'Sessão inválida' }))
  }

  const job = await deps.prisma.importJob.findUnique({
    where: { id: input.jobId },
    select: { id: true, tenantId: true, status: true },
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

  try {
    await transition(deps.prisma, job.id, ['PREVIEW_READY'], 'CANCELLED', {
      failureReason: 'OPERATOR_CANCELLED',
    })
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      return reply.code(409).send(
        envelope(null, {
          code: 'INVALID_JOB_STATE',
          message: 'Job não pode mais ser cancelado',
        }),
      )
    }
    throw err
  }

  const ipAddress = request.ip
  const uaHeader = request.headers['user-agent']
  const userAgent =
    typeof uaHeader === 'string' ? uaHeader : Array.isArray(uaHeader) ? uaHeader[0] ?? null : null

  await deps.prisma.auditLog.create({
    data: {
      tenantId: job.tenantId,
      userId: user.userId,
      action: 'EMPLOYEE_IMPORT_JOB_CANCELLED',
      resourceType: 'IMPORT_JOB',
      resourceId: job.id,
      ip: ipAddress,
      userAgent,
    },
  })

  deps.log.info(
    { module: 'imports', importJobId: job.id, tenantId: job.tenantId, phase: 'cancel' },
    'EMPLOYEE_IMPORT_JOB_CANCELLED',
  )

  return reply
    .code(200)
    .send(envelope({ jobId: job.id, status: 'CANCELLED' }))
}
