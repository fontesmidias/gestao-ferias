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
}

export default tenants
