import type { FastifyPluginAsync } from 'fastify'
import {
  ReconcileQueueService,
  ReconcileQueueInvalidStateError,
  ReconcileQueueNotFoundError,
} from '../../../../../modules/reconcile/reconcile-queue.service'
import { WorkplaceAllocationService } from '../../../../../modules/workplaces/workplace-allocation.service'

const route: FastifyPluginAsync = async (fastify) => {
  const allocationService = new WorkplaceAllocationService(fastify.prisma)
  const queueService = new ReconcileQueueService(fastify.prisma, allocationService)

  // GET /api/v1/admin/workplace-reconcile-queue
  fastify.get(
    '/',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              enum: ['PENDING', 'DEFERRED', 'RESOLVED', 'IGNORED'],
            },
            jobId: { type: 'string', format: 'uuid' },
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

      const query = request.query as {
        state?: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
        jobId?: string
        page?: number
        pageSize?: number
      }

      const result = await queueService.list({
        tenantId: user.tenantId,
        state: query.state,
        jobId: query.jobId,
        page: query.page,
        pageSize: query.pageSize,
      })

      return {
        data: result.items,
        error: null,
        meta: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          readOnly: user.role === 'AUDITOR',
        },
      }
    },
  )

  // POST /api/v1/admin/workplace-reconcile-queue/:id/resolve
  fastify.post(
    '/:id/resolve',
    {
      onRequest: [fastify.requireAuth, fastify.requireAdmin],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['action'],
          properties: {
            action: {
              type: 'string',
              enum: ['link', 'create', 'defer', 'ignore'],
            },
            workplaceId: { type: 'string', format: 'uuid' },
            workplaceName: { type: 'string', minLength: 1 },
            workplacePositionRole: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { userId: string; tenantId?: string }
      if (!user.tenantId) {
        return reply.code(400).send({
          data: null,
          error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
        })
      }

      const { id } = request.params as { id: string }
      const body = request.body as {
        action: 'link' | 'create' | 'defer' | 'ignore'
        workplaceId?: string
        workplaceName?: string
        workplacePositionRole?: string
      }

      if (body.action === 'link' && !body.workplaceId) {
        return reply.code(400).send({
          data: null,
          error: {
            code: 'MISSING_WORKPLACE_ID',
            message: 'workplaceId obrigatório para action=link',
          },
        })
      }
      if (body.action === 'create' && !body.workplaceName) {
        return reply.code(400).send({
          data: null,
          error: {
            code: 'MISSING_WORKPLACE_NAME',
            message: 'workplaceName obrigatório para action=create',
          },
        })
      }

      try {
        const updated = await queueService.resolve({
          id,
          tenantId: user.tenantId,
          operatorUserId: user.userId,
          action: body.action,
          workplaceId: body.workplaceId,
          workplaceName: body.workplaceName,
          workplacePositionRole: body.workplacePositionRole,
        })
        return { data: updated, error: null, meta: null }
      } catch (err) {
        if (err instanceof ReconcileQueueInvalidStateError) {
          return reply.code(409).send({
            data: null,
            error: { code: err.code, message: err.message },
          })
        }
        if (err instanceof ReconcileQueueNotFoundError) {
          return reply.code(404).send({
            data: null,
            error: { code: err.code, message: err.message },
          })
        }
        throw err
      }
    },
  )
}

export default route
