// TODO(v3-3-rbac-data-driven): rota usa requirePermission('import.run')
// via mapa estático (Story 5.1). Migrar para data-driven em v3-3.

import type { FastifyPluginAsync } from 'fastify'
import { applyEntrypoint } from '../../../../../modules/imports/apply-flow'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/:jobId/apply',
    {
      onRequest: [
        fastify.requireAuth,
        fastify.requireSuperAdmin,
        fastify.requirePermission('import.run'),
      ],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }
      return applyEntrypoint(fastify, request, reply, { jobId, scope: 'admin' })
    },
  )
}

export default route
