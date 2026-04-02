import { FastifyPluginAsync } from 'fastify'

const requestsRoutes: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  
  // 1. Criar Solicitação de Férias (PENDING) - Vem do Frontend (Drawer)
  fastify.post('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      tags: ['Vacations'],
      body: {
        type: 'object',
        required: ['employeeId', 'startDate', 'endDate', 'days'],
        properties: {
          employeeId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          days: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { employeeId, days } = request.body as any
    const { tenantId } = request.user as any
    
    // In a real scenario we'd do: fastify.prisma.vacationRequest.create()
    fastify.log.info({ employeeId, days, tenantId }, 'Nova solicitação de férias recebida e enviada ao RH.')
    
    // Simulating creation
    return reply.code(201).send({ status: 'PENDING', message: 'Solicitação enviada para avaliação do RH.' })
  })

  // 2. Aprovar Solicitação de Férias (RH Dashboard)
  fastify.patch('/:id/approve', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      tags: ['Vacations'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    
    // 1. Update status to APPROVED or SIGNED in DB
    // 2. Generate PDF Evidence
    // 3. Emit "VACATION_APPROVED" Webhook Event
    fastify.log.info(`Solicitação ${id} APROVADA pelo RH. Gerando Recibos...`)
    
    return { status: 'APPROVED', message: 'Aviso de férias gerado com sucesso. Assinaturas disparadas.' }
  })
}

export default requestsRoutes
