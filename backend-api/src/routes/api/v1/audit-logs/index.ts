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
  }, async (request) => {
    const { tenantId } = request.user as any
    const query = request.query as any

    const where: any = { tenantId }
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
