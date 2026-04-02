import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { ImportService } from '../../../../modules/employees/import-service'
import { AuditService } from '../../../../modules/shared/audit-service'
import { VacationEngine } from '../../../../modules/vacations/vacation-engine'

const employees: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Rota para importar colaboradores via arquivo (CSV/Excel)
  fastify.post('/import', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin] // Requer login admin
  }, async (request, reply) => {
    const data = await request.file()
    
    if (!data) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Nenhum arquivo enviado.' })
    }

    const buffer = await data.toBuffer()
    const extension = data.filename.split('.').pop()?.toLowerCase() || ''

    try {
      // 1. Parsing do arquivo (Síncrono/Rápido para o Buffer)
      const rawData = await ImportService.parseFile(buffer, extension)

      // 2. Enfileirar para processamento assíncrono (Sanitização e Inserção)
      const job = await fastify.importQueue.add('process-import', {
        rawData,
        tenantId: (request.user as any).tenantId,
        uploadedBy: (request.user as any).userId
      })

      return {
        message: 'Arquivo recebido e enfileirado para processamento.',
        jobId: job.id,
        rowCount: rawData.length
      }
    } catch (error: any) {
      request.log.error(error)
      return reply.code(400).send({ error: 'Import Error', message: error.message })
    }
  })

  // Listar funcionários do Tenant atual (já com isolamento implícito no futuro)
  fastify.get('/', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const tenantId = (request.user as any).tenantId
    const employees = await fastify.prisma.employee.findMany({
      where: { tenantId }
    })
    return employees
  })

  // Detalhes do Funcionário + Saldo Calculado (Story 3.1)
  fastify.get('/:id', {
    onRequest: [fastify.requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as any

    const employee = await fastify.prisma.employee.findUnique({
      where: { id }
    })

    if (!employee || employee.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado.' })
    }

    // Calcular saldo via Motor de Regras CLT
    const vacationPeriods = VacationEngine.calculatePeriods(
      employee.hireDate,
      0, // TODO: Implementar registro de faltas na Story 2.x
      employee.balanceOffset
    )

    return {
      ...employee,
      vacationSummary: {
        totalDaysOfRight: vacationPeriods.reduce((acc, p) => acc + p.daysOfRight, 0),
        periods: vacationPeriods
      }
    }
  })

  // Ajuste manual de saldo de férias (RH Override)
  fastify.patch('/:id/balance', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        required: ['adjustment', 'reason'],
        properties: {
          adjustment: { type: 'integer' },
          reason: { type: 'string', minLength: 5 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { adjustment, reason } = request.body as { adjustment: number; reason: string }
    const { tenantId, userId } = request.user as any

    // 1. Verificar funcionário e tenant
    const employee = await fastify.prisma.employee.findUnique({
      where: { id }
    })

    if (!employee || employee.tenantId !== tenantId) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado neste Tenant.' })
    }

    const previousBalance = employee.balanceOffset

    // 2. Transação: Atualizar Saldo + Log de Auditoria
    const result = await fastify.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedEmployee = await tx.employee.update({
        where: { id },
        data: { balanceOffset: { increment: adjustment } }
      })

      await AuditService.log(tx as any, {
        tenantId,
        userId,
        action: 'MANUAL_BALANCE_ADJUSTMENT',
        resourceId: id,
        resourceType: 'EMPLOYEE',
        previousData: { balanceOffset: previousBalance },
        newData: { balanceOffset: updatedEmployee.balanceOffset },
        reason,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      })

      return updatedEmployee
    })

    return {
      message: 'Saldo ajustado com sucesso.',
      newBalanceOffset: result.balanceOffset
    }
  })
}

export default employees
