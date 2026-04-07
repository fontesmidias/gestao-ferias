import { FastifyPluginAsync } from 'fastify'
import { VacationEngine } from '../../../../modules/vacations/vacation-engine'
import { differenceInDays, parseISO } from 'date-fns'

const vacations: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Criar solicitação de férias (Story 3.2)
  fastify.post('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['employeeId', 'startDate', 'endDate'],
        properties: {
          employeeId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string' },
          endDate: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { employeeId, startDate, endDate } = request.body as any
    const { tenantId } = request.user as any

    const start = parseISO(startDate)
    const end = parseISO(endDate)
    const days = differenceInDays(end, start) + 1

    // 1. Buscar funcionário e calcular saldo atual
    const employee = await fastify.prisma.employee.findUnique({
      where: { id: employeeId }
    })

    if (!employee || employee.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado.' })
    }

    const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
    const totalBalance = periods.reduce((acc, p) => acc + p.daysOfRight, 0)

    // 2. Validação Legal (Art. 134 CLT)
    const validation = VacationEngine.validateRequest(start, end, totalBalance)

    if (!validation.isValid) {
      return reply.code(400).send({
        error: 'Legal Block',
        message: 'A solicitação viola regras da CLT (Art. 134).',
        details: validation.errors
      })
    }

    // 3. Persistência
    const vacationRequest = await fastify.prisma.vacationRequest.create({
      data: {
        tenantId,
        employeeId,
        startDate: start,
        endDate: end,
        days,
        status: 'PENDING'
      }
    })

    return vacationRequest
  })

  // Listar solicitações do Tenant
  fastify.get('/', {
    onRequest: [fastify.authenticate]
  }, async (request) => {
    const { tenantId } = request.user as any
    return await fastify.prisma.vacationRequest.findMany({
      where: { tenantId },
      include: { employee: true },
      orderBy: { createdAt: 'desc' }
    })
  })

  // Bulk Status Update (Ação em Massa)
  fastify.patch('/bulk', {
    onRequest: [fastify.authenticate]
  }, async (request, reply) => {
    const { tenantId, role } = request.user as any
    const { requestIds, status, dispatchNote } = request.body as any

    if (role !== 'ADMIN') {
       return reply.code(403).send({ error: 'Forbidden', message: 'Apenas admins.' })
    }

    if (!Array.isArray(requestIds) || !status) {
       return reply.code(400).send({ error: 'Bad Request', message: 'ids e status são obrigatórios.' })
    }

    const { count } = await fastify.prisma.vacationRequest.updateMany({
      where: { id: { in: requestIds }, tenantId },
      data: { status, dispatchNote: dispatchNote || undefined }
    })

    // (Opcional: registrar AuditLog aqui no futuro)

    return reply.send({ message: `Atualizados ${count} registros para ${status}.` })
  })

  // Edit / Approve Single Request
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate]
  }, async (request, reply) => {
    const { tenantId, role } = request.user as any
    const { id } = request.params as any
    const { status, dispatchNote, startDate, endDate } = request.body as any

    if (role !== 'ADMIN') {
       return reply.code(403).send({ error: 'Forbidden', message: 'Apenas admins.' })
    }

    const existing = await fastify.prisma.vacationRequest.findUnique({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const updateData: any = { status, dispatchNote: dispatchNote !== undefined ? dispatchNote : undefined }
    
    // Admin is forcibly editing dates
    if (startDate && endDate) {
      updateData.originalStartDate = existing.originalStartDate || existing.startDate
      updateData.originalEndDate = existing.originalEndDate || existing.endDate
      updateData.startDate = parseISO(startDate)
      updateData.endDate = parseISO(endDate)
      updateData.days = differenceInDays(updateData.endDate, updateData.startDate) + 1
    }

    const updated = await fastify.prisma.vacationRequest.update({
      where: { id },
      data: updateData
    })

    return updated
  })
}

export default vacations
