// TODO(v3-3-rbac-data-driven): rota usa requirePermission('import.run')
// via mapa estático (Story 5.1). Migrar para data-driven em v3-3.

import type { FastifyPluginAsync } from 'fastify'
import { applyEntrypoint } from '../../../../../modules/imports/apply-flow'
import { cancelEntrypoint } from '../../../../../modules/imports/cancel-flow'
import { statusEntrypoint } from '../../../../../modules/imports/status-flow'

const ADMIN_GUARD = (fastify: Parameters<FastifyPluginAsync>[0]) => [
  fastify.requireAuth,
  fastify.requireSuperAdmin,
  fastify.requirePermission('import.run'),
]

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:jobId',
    {
      onRequest: ADMIN_GUARD(fastify),
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }
      return statusEntrypoint(
        { prisma: fastify.prisma },
        request as never,
        reply as never,
        { jobId, scope: 'admin' },
      )
    },
  )

  fastify.post(
    '/:jobId/apply',
    {
      onRequest: ADMIN_GUARD(fastify),
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }
      return applyEntrypoint(fastify, request, reply, { jobId, scope: 'admin' })
    },
  )

  fastify.post(
    '/:jobId/cancel',
    {
      onRequest: ADMIN_GUARD(fastify),
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }
      return cancelEntrypoint(
        { prisma: fastify.prisma, log: fastify.log },
        request as never,
        reply as never,
        { jobId, scope: 'admin' },
      )
    },
  )
}

export default route
