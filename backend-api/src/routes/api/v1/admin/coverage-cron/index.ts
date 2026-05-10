import type { FastifyPluginAsync } from 'fastify'
import { runCoverageCronOnce } from '../../../../../modules/coverage-engine/coverage-status-cron'

/**
 * V3.4 FASE H3: gestao do cron de transicao de status de CoverageAssignment.
 *
 * GET /api/v1/admin/coverage-cron — config + ultima execucao
 * PATCH /api/v1/admin/coverage-cron — atualiza enabled/intervalHours
 * POST /api/v1/admin/coverage-cron/run — executa manualmente agora
 *
 * Apenas ADMIN/SUPERADMIN.
 */
const route: FastifyPluginAsync = async (fastify) => {
  const requireAdminRole = (role: string) => ['ADMIN', 'SUPERADMIN'].includes(role)

  fastify.get(
    '/',
    { onRequest: [fastify.requireAuth] },
    async (request, reply) => {
      const user = request.user as { role: string }
      if (!requireAdminRole(user.role)) {
        return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Acesso restrito.' } })
      }
      const cfg = await fastify.prisma.systemConfig.upsert({
        where: { id: 'singleton' },
        update: {},
        create: { id: 'singleton' },
        select: {
          coverageCronEnabled: true,
          coverageCronIntervalHours: true,
          coverageCronLastRunAt: true,
          coverageCronLastResult: true,
        },
      })
      return reply.send({
        data: {
          enabled: cfg.coverageCronEnabled,
          intervalHours: cfg.coverageCronIntervalHours,
          lastRunAt: cfg.coverageCronLastRunAt,
          lastResult: cfg.coverageCronLastResult,
        },
        error: null,
      })
    },
  )

  fastify.patch(
    '/',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            intervalHours: { type: 'integer', minimum: 1, maximum: 168 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { role: string }
      if (!requireAdminRole(user.role)) {
        return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Acesso restrito.' } })
      }
      const body = request.body as { enabled?: boolean; intervalHours?: number }
      if (body.enabled === undefined && body.intervalHours === undefined) {
        return reply.code(400).send({ data: null, error: { code: 'NO_CHANGES', message: 'Informe enabled e/ou intervalHours.' } })
      }
      const updated = await fastify.prisma.systemConfig.upsert({
        where: { id: 'singleton' },
        update: {
          ...(body.enabled !== undefined ? { coverageCronEnabled: body.enabled } : {}),
          ...(body.intervalHours !== undefined ? { coverageCronIntervalHours: body.intervalHours } : {}),
        },
        create: {
          id: 'singleton',
          coverageCronEnabled: body.enabled ?? true,
          coverageCronIntervalHours: body.intervalHours ?? 6,
        },
        select: {
          coverageCronEnabled: true,
          coverageCronIntervalHours: true,
          coverageCronLastRunAt: true,
          coverageCronLastResult: true,
        },
      })
      return reply.send({
        data: {
          enabled: updated.coverageCronEnabled,
          intervalHours: updated.coverageCronIntervalHours,
          lastRunAt: updated.coverageCronLastRunAt,
          lastResult: updated.coverageCronLastResult,
        },
        error: null,
      })
    },
  )

  fastify.post(
    '/run',
    { onRequest: [fastify.requireAuth] },
    async (request, reply) => {
      const user = request.user as { role: string }
      if (!requireAdminRole(user.role)) {
        return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Acesso restrito.' } })
      }
      const result = await runCoverageCronOnce(fastify)
      return reply.send({
        data: {
          ranAt: result.ranAt,
          toActive: result.toActive,
          toCompleted: result.toCompleted,
          durationMs: result.durationMs,
        },
        error: null,
      })
    },
  )
}

export default route
