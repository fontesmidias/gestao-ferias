import jwt from '@fastify/jwt'
import fp from 'fastify-plugin'
import { FastifyReply, FastifyRequest } from 'fastify'

export default fp(async (fastify) => {
  fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'super-secret-development-only-key-12345'
  })

  // Decorator to verify JWT in routes
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.send(err)
    }
  })
})

// Typescript declaration for the new decorator
declare module 'fastify' {
  export interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
