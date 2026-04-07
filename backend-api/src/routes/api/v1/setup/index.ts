import { FastifyPluginAsync } from 'fastify'
import * as bcrypt from 'bcryptjs'

const setupRoutes: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/status', async function (request, reply) {
    // Retorna se o sistema já foi inicializado (se existe 1 ou mais administradores)
    const usersCount = await fastify.prisma.user.count()
    return { initialized: usersCount > 0 }
  })

  fastify.post('/', async function (request, reply) {
    // 1. Barreira de Segurança Ouro: Só prossegue se o DB for Virgem
    const usersCount = await fastify.prisma.user.count()
    if (usersCount > 0) {
      return reply.code(403).send({ error: "Forbidden", message: "Setup completed. System already initialized." })
    }

    // 2. Transforma o payload em tipagem básica e aplica as regras
    const payload = request.body as any
    const { tenantName, cnpj, adminName, email, password } = payload

    if (!tenantName || !cnpj || !adminName || !email || !password) {
      return reply.code(400).send({ error: "Bad Request", message: "All fields are required: tenantName, cnpj, adminName, email, password" })
    }

    // Hash da senha do SuperAdmin
    const passwordHash = await bcrypt.hash(password, 10)

    try {
      // 3. Transação Atômica: Se falhar em um, não faz nada no outro
      const result = await fastify.prisma.$transaction(async (tx: any) => {
        // Criação da Master Company (Tenant)
        const tenant = await tx.tenant.create({
          data: {
            name: tenantName,
            cnpj: cnpj
          }
        })

        // Criação do Superadmin atrelado à Empresa Mestre
        const admin = await tx.user.create({
          data: {
            name: adminName,
            email: email,
            passwordHash: passwordHash,
            role: "ADMIN",
            tenantId: tenant.id
          }
        })

        return { tenant, admin }
      })

      fastify.log.info(`[SETUP] Sistema Inicializado. Um tenant [${result.tenant.id}] e um admin principal criados! A porta foi trancada.`)
      
      return reply.code(201).send({
        message: "System initialized successfully.",
        tenantId: result.tenant.id,
        adminId: result.admin.id
      })
      
    } catch (err: any) {
      fastify.log.error(`[SETUP ERROR] ${err.message}`)
      return reply.code(500).send({ error: "Internal Error", message: "Could not complete the setup." })
    }
  })
}

export default setupRoutes;
