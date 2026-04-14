import { FastifyPluginAsync } from 'fastify'
import { VacationEngine } from '../../../../modules/vacations/vacation-engine'
import { AuditService } from '../../../../modules/shared/audit-service'
import { WhatsAppService } from '../../../../modules/notifications/whatsapp-service'
import { differenceInDays, parseISO, format } from 'date-fns'

const vacations: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Criar solicitação de férias (Story 3.2)
  fastify.post('/', {
    onRequest: [fastify.requireAuth],
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

    // 1. Buscar funcionário e calcular saldo atual (com isolamento de tenant)
    const employee = await fastify.prisma.employee.findFirst({
      where: { id: employeeId, tenantId }
    })

    if (!employee) {
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
    onRequest: [fastify.requireAuth]
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
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { requestIds, status, dispatchNote } = request.body as any

    if (!Array.isArray(requestIds) || !status) {
       return reply.code(400).send({ error: 'Bad Request', message: 'ids e status são obrigatórios.' })
    }

    const { count } = await fastify.prisma.vacationRequest.updateMany({
      where: { id: { in: requestIds }, tenantId },
      data: { status, dispatchNote: dispatchNote || undefined }
    })

    return reply.send({ message: `Atualizados ${count} registros para ${status}.` })
  })

  // Edit / Approve Single Request
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as any
    const { status, dispatchNote, startDate, endDate } = request.body as any

    const existing = await fastify.prisma.vacationRequest.findFirst({ where: { id, tenantId } })
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

    // Update usando o ID verificado — tenant isolation garantida pelo findFirst acima
    const updated = await fastify.prisma.vacationRequest.update({
      where: { id: existing.id },
      data: updateData
    })

    // Audit log
    const { userId } = request.user as any
    await AuditService.log(fastify.prisma as any, {
      tenantId, userId,
      action: status === 'APPROVED' ? 'VACATION_APPROVED' : status === 'REJECTED' ? 'VACATION_REJECTED' : `VACATION_${status}`,
      resourceId: existing.id,
      resourceType: 'VACATION_REQUEST',
      previousData: { status: existing.status },
      newData: { status: updated.status },
      reason: dispatchNote || undefined,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    })

    // Notificação WhatsApp ao aprovar ou rejeitar
    if (updated.status === 'APPROVED' || updated.status === 'REJECTED') {
      try {
        const employee = await fastify.prisma.employee.findUnique({
          where: { id: existing.employeeId },
          select: { phone: true, name: true },
        })

        if (employee?.phone) {
          let message: string
          if (updated.status === 'APPROVED') {
            const startFormatted = format(updated.startDate, 'dd/MM/yyyy')
            const endFormatted = format(updated.endDate, 'dd/MM/yyyy')
            message = `Suas férias de ${startFormatted} a ${endFormatted} (${updated.days} dias) foram APROVADAS pelo RH.`
          } else {
            const motivo = updated.dispatchNote || 'Não informado'
            message = `Sua solicitação de férias foi REPROVADA. Motivo: ${motivo}`
          }

          // Envio assíncrono — não bloqueia a resposta da API
          WhatsAppService.sendMessage(tenantId, employee.phone, message, fastify.prisma as any)
            .catch((err: any) => fastify.log.error(`[WhatsApp] Falha ao notificar ${employee.name}: ${err.message}`))
        }
      } catch (whatsappErr: any) {
        fastify.log.error(`[WhatsApp] Erro ao preparar notificação: ${whatsappErr.message}`)
      }
    }

    return updated
  })
}

export default vacations
