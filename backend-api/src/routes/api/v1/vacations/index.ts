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
      include: { employee: true }
    })
  })
}

export default vacations
