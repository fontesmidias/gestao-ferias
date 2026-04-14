import { FastifyPluginAsync } from 'fastify'
import * as bcrypt from 'bcryptjs'

const setupRoutes: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/status', async function (request, reply) {
    const usersCount = await fastify.prisma.user.count()
    return { initialized: usersCount > 0 }
  })

  // Setup inicial: cria o SUPERADMIN (sem tenant)
  fastify.post('/', async function (request, reply) {
    const usersCount = await fastify.prisma.user.count()
    if (usersCount > 0) {
      return reply.code(403).send({ error: "Forbidden", message: "Sistema já inicializado." })
    }

    const { name, email, password } = request.body as any

    if (!name || !email || !password) {
      return reply.code(400).send({ error: "Bad Request", message: "Campos obrigatórios: name, email, password" })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    try {
      const superadmin = await fastify.prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'SUPERADMIN',
          tenantId: null
        }
      })

      fastify.log.info(`[SETUP] SuperAdmin criado: ${email}. Sistema inicializado.`)

      return reply.code(201).send({
        message: "Sistema inicializado com sucesso. SuperAdmin criado.",
        userId: superadmin.id
      })
    } catch (err: any) {
      fastify.log.error(`[SETUP ERROR] ${err.message}`)
      return reply.code(500).send({ error: "Internal Error", message: "Erro ao inicializar o sistema." })
    }
  })
}

export default setupRoutes
