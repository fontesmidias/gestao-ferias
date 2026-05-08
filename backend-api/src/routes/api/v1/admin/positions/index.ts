import type { FastifyPluginAsync } from 'fastify'
import { rematerializePositionsByRole } from '../../../../../modules/workplaces/position-rematerialization.service'

const positions: FastifyPluginAsync = async (fastify) => {
  // V3.4 MVP M3: re-materialização de Positions por (posto, cargo) para
  // tenants legados (V3.0/V3.3) onde o Reconcile criou apenas 1 Position
  // default por Workplace, empilhando colaboradores de cargos distintos.
  fastify.post('/rematerialize', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({
        data: null,
        error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' },
      })
    }
    if (!user.tenantId) {
      return reply.code(400).send({
        data: null,
        error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
      })
    }

    const stats = await rematerializePositionsByRole(
      fastify.prisma,
      user.tenantId,
      user.userId,
    )

    return { data: stats, error: null }
  })
}

export default positions
