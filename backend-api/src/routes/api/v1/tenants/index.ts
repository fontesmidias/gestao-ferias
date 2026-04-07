import { FastifyPluginAsync } from 'fastify'

const tenants: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.post('/', {
    schema: {
      description: 'Cria um novo Tenant (Empresa)',
      tags: ['Tenants'],
      body: {
        type: 'object',
        required: ['name', 'cnpj'],
        properties: {
          name: { type: 'string', minLength: 3 },
          cnpj: { type: 'string', pattern: '^\\d{2}\\.?\\d{3}\\.?\\d{3}/?\\d{4}-?\\d{2}$' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { name, cnpj } = request.body as { name: string; cnpj: string }

    try {
      const tenant = await fastify.prisma.tenant.create({
        data: {
          name,
          cnpj: cnpj.replace(/\D/g, '') // Sanitização básica do CNPJ para o banco
        }
      })

      return reply.code(201).send({
        id: tenant.id,
        name: tenant.name,
        status: 'created'
      })
    } catch (error: any) {
      if (error.code === 'P2002') {
         return reply.status(409).send({ error: 'Conflict', message: 'Tenant ou Email já cadastrados.' })
      }
      throw error
    }
  })

  // Listar todos os tenants (Action apenas para SuperAdmin)
  fastify.get('/', async (request, reply) => {
    const tenants = await fastify.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return tenants
  })

  // Patch Settings (LLM, SMTP)
  fastify.patch('/settings', {
    onRequest: [async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.send(err)
      }
    }]
  }, async (request, reply) => {
    const user = request.user as any
    const payload = request.body as any
    
    // Admin Only
    if (user.role !== 'ADMIN') {
      return reply.code(403).send({ error: "Forbidden", message: "Apenas administradores podem alterar configurações." })
    }

    const { openaiKey, anthropicKey, geminiKey, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = payload
    
    const tenant = await fastify.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        openaiKey: openaiKey !== undefined ? openaiKey : undefined,
        anthropicKey: anthropicKey !== undefined ? anthropicKey : undefined,
        geminiKey: geminiKey !== undefined ? geminiKey : undefined,
        smtpHost: smtpHost !== undefined ? smtpHost : undefined,
        smtpPort: smtpPort !== undefined ? Number(smtpPort) : undefined,
        smtpUser: smtpUser !== undefined ? smtpUser : undefined,
        smtpPass: smtpPass !== undefined ? smtpPass : undefined,
        smtpFrom: smtpFrom !== undefined ? smtpFrom : undefined,
      }
    })

    return reply.send({ message: "Configurações atualizadas com sucesso." })
  })

  // Get Current Tenant Settings
  fastify.get('/settings', {
    onRequest: [async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.send(err)
      }
    }]
  }, async (request, reply) => {
    const user = request.user as any
    const tenant = await fastify.prisma.tenant.findUnique({
      where: { id: user.tenantId }
    })
    return tenant
  })
}

export default tenants
