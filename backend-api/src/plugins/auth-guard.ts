import fp from 'fastify-plugin'
import { FastifyReply, FastifyRequest } from 'fastify'

export default fp(async (fastify) => {
  // Pre-handler hook to enforce authentication and extract tenantId
  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 1. Verify JWT
      await request.jwtVerify()
      
      // 2. Validate user role if needed (request.user comes from jwt payload)
      const user = request.user as { userId: string, tenantId: string, role?: string }
      
      if (!user || !user.tenantId) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Tenant não identificado.' })
      }

      // 3. Optional: Verify in DB if user is still active
      // (This adds latency but is safer. For now, we trust the JWT)

    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Sessão inválida ou expirada.' })
    }
  })

  // Middleware to restrict access to ADMIN only
  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { role: string }
    if (user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Forbidden', message: 'Acesso restrito ao RH.' })
    }
  })
})

declare module 'fastify' {
  export interface FastifyInstance {
    requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
