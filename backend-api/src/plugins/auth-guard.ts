import fp from 'fastify-plugin'
import { FastifyReply, FastifyRequest } from 'fastify'

export default fp(async (fastify) => {
  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const user = request.user as { userId: string, tenantId?: string, role?: string }

      // SUPERADMIN pode não ter tenantId
      if (!user || (!user.tenantId && user.role !== 'SUPERADMIN')) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Tenant não identificado.' })
      }
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Sessão inválida ou expirada.' })
    }
  })

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { role: string }
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Acesso restrito ao RH.' })
    }
  })

  fastify.decorate('requireSuperAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { role: string }
    if (user.role !== 'SUPERADMIN') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Acesso restrito ao Super Administrador.' })
    }
  })
})

declare module 'fastify' {
  export interface FastifyInstance {
    requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
