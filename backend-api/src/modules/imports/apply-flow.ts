// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { transition } from './import-job-service'
import { validateConfirmTenantName } from './apply-validators'
import { InvalidStateTransitionError } from './types'
import type { ApplyOptions } from './import-applier'
import { isUuid } from './utils'

export type ApplyScope = 'admin' | 'tenant'

export interface ApplyEntrypointInput {
  jobId: string
  scope: ApplyScope
}

interface ApplyBody {
  confirmTenantName?: string
  createWorkplaces?: string[]
  markAbsentAsPending?: boolean
  reactivateAll?: boolean
}

function envelope(
  data: unknown,
  error: { code: string; message: string } | null = null,
  meta: unknown = null,
) {
  return { data, error, meta }
}

export async function applyEntrypoint(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  input: ApplyEntrypointInput,
) {
  const user = request.user as {
    userId: string
    tenantId?: string
    role?: string
  }

  if (!isUuid(input.jobId)) {
    return reply
      .code(404)
      .send(envelope(null, { code: 'JOB_NOT_FOUND', message: 'Job não encontrado' }))
  }

  const job = await fastify.prisma.importJob.findUnique({
    where: { id: input.jobId },
    select: {
      id: true,
      tenantId: true,
      status: true,
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

  const tenant = await fastify.prisma.tenant.findUnique({
    where: { id: job.tenantId },
  })
  if (!tenant || !tenant.isActive) {
    return reply.code(400).send(
      envelope(null, {
        code: 'INVALID_TARGET_TENANT',
        message: 'Tenant alvo não encontrado ou inativo',
      }),
    )
  }

  const body = (request.body ?? {}) as ApplyBody
  const confirm = validateConfirmTenantName({
    tenantName: tenant.name,
    provided: body.confirmTenantName,
  })
  if (!confirm.ok) {
    return reply
      .code(400)
      .send(envelope(null, { code: confirm.code, message: confirm.message }))
  }

  if (job.status !== 'PREVIEW_READY') {
    return reply.code(409).send(
      envelope(null, {
        code: 'INVALID_JOB_STATE',
        message: `Job está em ${job.status}; apply requer PREVIEW_READY`,
      }),
    )
  }

  const options: ApplyOptions = {
    createWorkplaces: Array.isArray(body.createWorkplaces) ? body.createWorkplaces : [],
    markAbsentAsPending: !!body.markAbsentAsPending,
    reactivateAll: !!body.reactivateAll,
  }

  try {
    await transition(fastify.prisma, job.id, ['PREVIEW_READY'], 'APPLYING')
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      return reply.code(409).send(
        envelope(null, {
          code: 'INVALID_JOB_STATE',
          message: 'Job não está mais em PREVIEW_READY',
        }),
      )
    }
    throw err
  }

  const ipAddress = request.ip
  const userAgent = request.headers['user-agent'] ?? null

  await fastify.prisma.auditLog.create({
    data: {
      tenantId: job.tenantId,
      userId: user.userId,
      action: 'EMPLOYEE_IMPORT_JOB_APPLIED',
      resourceType: 'IMPORT_JOB',
      resourceId: job.id,
      newData: options as never,
      ip: ipAddress,
      userAgent,
    },
  })

  await fastify.tirvuImportQueue.add('apply', { jobId: job.id, options })

  fastify.log.info(
    { module: 'imports', importJobId: job.id, tenantId: job.tenantId, phase: 'apply' },
    'EMPLOYEE_IMPORT_JOB_APPLIED',
  )

  return reply
    .code(202)
    .send(envelope({ jobId: job.id, status: 'APPLYING' }))
}
