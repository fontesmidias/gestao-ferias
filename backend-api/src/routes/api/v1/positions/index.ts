import { FastifyPluginAsync } from 'fastify'

const positions: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Criar posição no posto
  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['workplaceId', 'role'],
        properties: {
          workplaceId: { type: 'string', format: 'uuid' },
          role: { type: 'string', minLength: 2 },
          shiftPattern: { type: 'string' },
          requiredCount: { type: 'integer', minimum: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { workplaceId, role, shiftPattern, requiredCount } = request.body as any

    // Verificar que o workplace pertence ao tenant
    const workplace = await fastify.prisma.workplace.findFirst({ where: { id: workplaceId, tenantId } })
    if (!workplace) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posto não encontrado.' })
    }

    const position = await fastify.prisma.workplacePosition.create({
      data: {
        workplaceId,
        role,
        shiftPattern: shiftPattern || null,
        requiredCount: requiredCount || 1,
        tenantId
      }
    })

    return reply.code(201).send(position)
  })

  // Listar posições de um posto
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        required: ['workplaceId'],
        properties: {
          workplaceId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request) => {
    const { tenantId } = request.user as any
    const { workplaceId } = request.query as { workplaceId: string }

    return await fastify.prisma.workplacePosition.findMany({
      where: { workplaceId, tenantId },
      include: {
        allocations: {
          where: { status: 'ACTIVE' },
          include: { employee: { select: { id: true, name: true, employeeType: true } } }
        },
        _count: { select: { allocations: { where: { status: 'ACTIVE' } } } }
      },
      orderBy: { role: 'asc' }
    })
  })

  // Atualizar posição
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
          role: { type: 'string', minLength: 2 },
          shiftPattern: { type: 'string' },
          requiredCount: { type: 'integer', minimum: 1 },
          // V3.4 Story 4.8: posto critico exige cobertura ao aprovar ferias
          isCritical: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }
    const data = request.body as any

    const existing = await fastify.prisma.workplacePosition.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posição não encontrada.' })
    }

    const updated = await fastify.prisma.workplacePosition.update({
      where: { id: existing.id },
      data: {
        role: data.role !== undefined ? data.role : undefined,
        shiftPattern: data.shiftPattern !== undefined ? data.shiftPattern : undefined,
        requiredCount: data.requiredCount !== undefined ? data.requiredCount : undefined,
        isCritical: data.isCritical !== undefined ? data.isCritical : undefined,
      }
    })

    return updated
  })

  // Deletar posição (apenas se sem alocações ativas)
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

    const existing = await fastify.prisma.workplacePosition.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { allocations: { where: { status: 'ACTIVE' } } } } }
    })

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posição não encontrada.' })
    }

    if ((existing as any)._count.allocations > 0) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Não é possível remover posição com alocações ativas.'
      })
    }

    await fastify.prisma.workplacePosition.delete({ where: { id } })
    return { message: 'Posição removida com sucesso.' }
  })
}

export default positions
