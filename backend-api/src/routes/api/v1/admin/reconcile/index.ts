import type { FastifyPluginAsync } from 'fastify'
import { WorkplaceAllocationService } from '../../../../../modules/workplaces/workplace-allocation.service'
import { ReconcileQueueService } from '../../../../../modules/reconcile/reconcile-queue.service'
import { DeterministicMatcher } from '../../../../../modules/reconcile/matchers/deterministic-matcher'
import { FuzzyMatcher } from '../../../../../modules/reconcile/matchers/fuzzy-matcher'
import { ReconcileService } from '../../../../../modules/reconcile/reconcile.service'
import { ReconcileRunner } from '../../../../../modules/reconcile/reconcile.runner'
import { AuditService } from '../../../../../modules/shared/audit-service'
import { ReconcileAuditAction } from '../../../../../modules/reconcile/reconcile.types'

const route: FastifyPluginAsync = async (fastify) => {
  const allocationService = new WorkplaceAllocationService(fastify.prisma)
  const queueService = new ReconcileQueueService(fastify.prisma, allocationService)
  const deterministic = new DeterministicMatcher(fastify.prisma)
  const fuzzy = new FuzzyMatcher(fastify.prisma)
  const service = new ReconcileService(
    fastify.prisma,
    allocationService,
    queueService,
    deterministic,
    fuzzy,
  )
  const runner = new ReconcileRunner(fastify.prisma, service)

  // POST /api/v1/admin/reconcile
  fastify.post(
    '/',
    { onRequest: [fastify.requireAuth, fastify.requireAdmin] },
    async (request, reply) => {
      const user = request.user as { userId: string; tenantId?: string }
      if (!user.tenantId) {
        return reply.code(400).send({
          data: null,
          error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
        })
      }

      const existing = await fastify.prisma.reconcileJob.findFirst({
        where: {
          tenantId: user.tenantId,
          status: { in: ['PENDING', 'RUNNING'] },
        },
      })
      if (existing) {
        return reply.code(409).send({
          data: null,
          error: {
            code: 'RECONCILE_JOB_ALREADY_RUNNING',
            message: 'Já existe reconciliação em execução para este tenant.',
          },
          meta: { existingJobId: existing.id },
        })
      }

      const job = await fastify.prisma.reconcileJob.create({
        data: {
          tenantId: user.tenantId,
          operatorUserId: user.userId,
          status: 'RUNNING',
          startedAt: new Date(),
          triggeredBy: 'ADMIN',
        },
      })

      await AuditService.log(fastify.prisma, {
        tenantId: user.tenantId,
        userId: user.userId,
        action: ReconcileAuditAction.RECONCILE,
        resourceId: job.id,
        resourceType: 'RECONCILE_JOB',
        previousData: null,
        newData: job as unknown as object,
      })

      const tenantId = user.tenantId
      const userId = user.userId
      setImmediate(() => {
        runner
          .run({ jobId: job.id, tenantId, operatorUserId: userId })
          .catch((err) =>
            fastify.log.error({ err, jobId: job.id }, 'reconcile runner fatal'),
          )
      })

      return reply
        .code(200)
        .send({
          data: { jobId: job.id, status: 'RUNNING' },
          error: null,
          meta: null,
        })
    },
  )

  // GET /api/v1/admin/reconcile/jobs
  fastify.get(
    '/jobs',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'],
            },
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { tenantId?: string; role: string }
      if (!user.tenantId) {
        return reply.code(400).send({
          data: null,
          error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
        })
      }
      if (!['ADMIN', 'AUDITOR', 'SUPERADMIN'].includes(user.role)) {
        return reply.code(403).send({
          data: null,
          error: { code: 'FORBIDDEN', message: 'Acesso restrito.' },
        })
      }

      const q = request.query as {
        status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
        page?: number
        pageSize?: number
      }
      const page = q.page ?? 1
      const pageSize = q.pageSize ?? 20
      const where = {
        tenantId: user.tenantId,
        ...(q.status ? { status: q.status } : {}),
      }

      const [items, total] = await Promise.all([
        fastify.prisma.reconcileJob.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        fastify.prisma.reconcileJob.count({ where }),
      ])

      return {
        data: items,
        error: null,
        meta: {
          total,
          page,
          pageSize,
          readOnly: user.role === 'AUDITOR',
        },
      }
    },
  )

  // GET /api/v1/admin/reconcile/jobs/:id
  fastify.get(
    '/jobs/:id',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { tenantId?: string; role: string }
      if (!user.tenantId) {
        return reply.code(400).send({
          data: null,
          error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
        })
      }
      if (!['ADMIN', 'AUDITOR', 'SUPERADMIN'].includes(user.role)) {
        return reply.code(403).send({
          data: null,
          error: { code: 'FORBIDDEN', message: 'Acesso restrito.' },
        })
      }

      const { id } = request.params as { id: string }
      const job = await fastify.prisma.reconcileJob.findFirst({
        where: { id, tenantId: user.tenantId },
      })
      if (!job) {
        return reply.code(404).send({
          data: null,
          error: { code: 'NOT_FOUND', message: 'Job não encontrado.' },
        })
      }

      const totalSeen = job.matched + job.queued + job.ignored + job.errors
      const progressPct =
        job.totalEmployees && job.totalEmployees > 0
          ? Math.round((totalSeen / job.totalEmployees) * 100)
          : 0

      return {
        data: { ...job, progressPct },
        error: null,
        meta: { readOnly: user.role === 'AUDITOR' },
      }
    },
  )
}

export default route
