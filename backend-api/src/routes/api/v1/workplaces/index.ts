import { FastifyPluginAsync } from 'fastify'

const workplaces: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Criar posto de trabalho
  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2 },
          address: { type: 'string' },
          client: { type: 'string' },
          minStaff: { type: 'integer', minimum: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { name, address, client, minStaff } = request.body as any

    const workplace = await fastify.prisma.workplace.create({
      data: {
        name,
        address: address || null,
        client: client || null,
        minStaff: minStaff || 1,
        tenantId
      }
    })

    return reply.code(201).send(workplace)
  })

  // Listar postos do tenant
  fastify.get('/', {
    onRequest: [fastify.requireAuth]
  }, async (request) => {
    const { tenantId } = request.user as any

    return await fastify.prisma.workplace.findMany({
      where: { tenantId },
      include: {
        positions: {
          include: {
            _count: { select: { allocations: { where: { status: 'ACTIVE' } } } }
          }
        },
        _count: { select: { employees: true } }
      },
      orderBy: { name: 'asc' }
    })
  })

  // Detalhes do posto com positions e alocações ativas
  fastify.get('/:id', {
    onRequest: [fastify.requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const workplace = await fastify.prisma.workplace.findFirst({
      where: { id, tenantId },
      include: {
        positions: {
          include: {
            allocations: {
              where: { status: 'ACTIVE' },
              include: { employee: { select: { id: true, name: true, cpf: true, employeeType: true } } }
            }
          }
        }
      }
    })

    if (!workplace) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posto não encontrado.' })
    }

    return workplace
  })

  // Atualizar posto
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          address: { type: 'string' },
          client: { type: 'string' },
          minStaff: { type: 'integer', minimum: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }
    const data = request.body as any

    const existing = await fastify.prisma.workplace.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posto não encontrado.' })
    }

    const updated = await fastify.prisma.workplace.update({
      where: { id: existing.id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        address: data.address !== undefined ? data.address : undefined,
        client: data.client !== undefined ? data.client : undefined,
        minStaff: data.minStaff !== undefined ? data.minStaff : undefined,
      }
    })

    return updated
  })

  // Deletar posto (apenas se sem alocações ativas)
  fastify.delete('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const existing = await fastify.prisma.workplace.findFirst({
      where: { id, tenantId },
      include: {
        positions: {
          include: { _count: { select: { allocations: { where: { status: 'ACTIVE' } } } } }
        }
      }
    })

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posto não encontrado.' })
    }

    const hasActiveAllocations = existing.positions.some((p: any) => p._count.allocations > 0)
    if (hasActiveAllocations) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Não é possível remover posto com alocações ativas. Desaloque os colaboradores primeiro.'
      })
    }

    // Deletar positions primeiro, depois o workplace
    await fastify.prisma.workplacePosition.deleteMany({ where: { workplaceId: id } })
    await fastify.prisma.workplace.delete({ where: { id } })

    return { message: 'Posto removido com sucesso.' }
  })
}

export default workplaces
