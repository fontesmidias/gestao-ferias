import { FastifyPluginAsync } from 'fastify'
import { parseISO } from 'date-fns'

const auditLogs: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          resourceType: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request, reply) => {
    // Story 3.1 (FR39): AUDITOR pode consultar audit-logs do proprio tenant.
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

    const query = request.query as any
    const where: any = { tenantId: user.tenantId }
    if (query.action) where.action = query.action
    if (query.resourceType) where.resourceType = query.resourceType
    if (query.from || query.to) {
      where.createdAt = {}
      if (query.from) where.createdAt.gte = parseISO(query.from)
      if (query.to) where.createdAt.lte = parseISO(query.to)
    }

    return await fastify.prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit || 50
    })
  })
}

export default auditLogs
