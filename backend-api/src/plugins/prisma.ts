import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import fp from 'fastify-plugin'

// Use of fastify-plugin is required to be able
// to export the decorators to the outer scope
export default fp(async (fastify) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  await prisma.$connect()

  // Decorate fastify instance with prisma client
  fastify.decorate('prisma', prisma)

  // Disconnect prisma on server close
  fastify.addHook('onClose', async (server) => {
    await server.prisma.$disconnect()
  })
})

// When using .decorate you have to specify added properties for Typescript
declare module 'fastify' {
  export interface FastifyInstance {
    prisma: PrismaClient;
  }
}
