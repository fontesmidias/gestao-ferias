import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { ImportService } from '../../../../modules/employees/import-service'
import { AuditService } from '../../../../modules/shared/audit-service'
import { VacationEngine } from '../../../../modules/vacations/vacation-engine'

const employees: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Download template de importacao
  fastify.get('/import/template', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const buffer = ImportService.generateEmployeeTemplate()
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="modelo-colaboradores.xlsx"')
      .send(buffer)
  })

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
      const rawData = await ImportService.parseFile(buffer, extension)
      const tenantId = (request.user as any).tenantId

      // Tentar enfileirar no Redis; se indisponivel, processar sincrono
      try {
        const job = await fastify.importQueue.add('process-import', {
          rawData, tenantId, uploadedBy: (request.user as any).userId
        })
        return { message: 'Arquivo recebido e enfileirado para processamento.', jobId: job.id, rowCount: rawData.length }
      } catch {
        // Fallback sincrono (sem Redis)
        const { SanitizationService } = await import('../../../../modules/employees/sanitization-service.js')
        let success = 0, errors = 0
        for (const row of rawData) {
          try {
            const cpf = SanitizationService.sanitizeCPF(row.cpf)
            const hireDate = SanitizationService.sanitizeDate(row.hireDate)
            const name = SanitizationService.sanitizeName(row.name)
            await fastify.prisma.employee.upsert({
              where: { cpf_tenantId: { cpf, tenantId } },
              update: { name, hireDate, phone: row.phone || undefined, position: row.position || undefined,
                employeeType: row.employeeType || undefined, branch: row.branch || undefined,
                department: row.department || undefined, workplace: row.workplace || undefined,
                shift: row.shift || undefined, salary: row.salary ? parseFloat(row.salary) : undefined,
                registration: row.registration || undefined },
              create: { name, cpf, hireDate, tenantId, phone: row.phone || null,
                position: row.position || 'Colaborador', employeeType: row.employeeType || 'EFETIVO',
                branch: row.branch || null, department: row.department || null,
                workplace: row.workplace || null, shift: row.shift || null,
                salary: row.salary ? parseFloat(row.salary) : 0, registration: row.registration || null }
            })
            success++
          } catch { errors++ }
        }
        return { message: `Importacao concluida: ${success} processados, ${errors} erros.`, rowCount: rawData.length, success, errors }
      }
    } catch (error: any) {
      request.log.error(error)
      return reply.code(400).send({ error: 'Import Error', message: error.message })
    }
  })

  // Criar funcionário manualmente
  fastify.post('/', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const tenantId = (request.user as any).tenantId
    const data = request.body as any
    
    // Minimal validation
    if (!data.name || !data.cpf || !data.hireDate) {
       return reply.code(400).send({ error: 'Campos obrigatórios: name, cpf, hireDate' })
    }

    try {
      const emp = await fastify.prisma.employee.create({
        data: {
          tenantId,
          name: data.name,
          cpf: data.cpf,
          registration: data.registration || undefined,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          position: data.position || 'Colaborador',
          status: data.status || 'ATIVO',
          branch: data.branch || undefined,
          department: data.department || undefined,
          workplace: data.workplace || undefined,
          shift: data.shift || undefined,
          salary: data.salary || 0,
          hireDate: new Date(data.hireDate),
          phone: data.phone || null,
          employeeType: data.employeeType || 'EFETIVO',
          isFerista: data.isFerista || false,
        }
      })
      return reply.code(201).send(emp)
    } catch (err: any) {
      return reply.code(400).send({ error: 'Erro ao criar colaborador', message: err.message })
    }
  })

  // Editar colaborador
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cpf: { type: 'string' },
          phone: { type: 'string' },
          position: { type: 'string' },
          employeeType: { type: 'string' },
          isFerista: { type: 'boolean' },
          status: { type: 'string' },
          branch: { type: 'string' },
          department: { type: 'string' },
          workplace: { type: 'string' },
          shift: { type: 'string' },
          salary: { type: 'number' },
          registration: { type: 'string' },
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as any
    const data = request.body as any

    const existing = await fastify.prisma.employee.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const updated = await fastify.prisma.employee.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        cpf: data.cpf !== undefined ? data.cpf : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        position: data.position !== undefined ? data.position : undefined,
        employeeType: data.employeeType !== undefined ? data.employeeType : undefined,
        isFerista: data.isFerista !== undefined ? data.isFerista : undefined,
        status: data.status !== undefined ? data.status : undefined,
        branch: data.branch !== undefined ? data.branch : undefined,
        department: data.department !== undefined ? data.department : undefined,
        workplace: data.workplace !== undefined ? data.workplace : undefined,
        shift: data.shift !== undefined ? data.shift : undefined,
        salary: data.salary !== undefined ? data.salary : undefined,
        registration: data.registration !== undefined ? data.registration : undefined,
      }
    })

    return updated
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

    const employee = await fastify.prisma.employee.findFirst({
      where: { id, tenantId }
    })

    if (!employee) {
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

  // Saldo de férias calculado (CLT)
  fastify.get('/:id/balance', {
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

    const employee = await fastify.prisma.employee.findFirst({ where: { id, tenantId } })
    if (!employee) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado.' })
    }

    const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
    const usedDays = await fastify.prisma.vacationRequest.aggregate({
      where: { employeeId: id, tenantId, status: { in: ['APPROVED', 'SIGNED', 'COMPLETED'] } },
      _sum: { days: true }
    })

    const totalRight = periods.reduce((acc, p) => acc + p.daysOfRight, 0)
    const totalUsed = usedDays._sum.days || 0

    return {
      employeeId: id,
      employeeName: employee.name,
      hireDate: employee.hireDate,
      balanceOffset: employee.balanceOffset,
      totalDaysOfRight: totalRight,
      totalDaysUsed: totalUsed,
      availableBalance: totalRight - totalUsed,
      periods
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

    // 1. Verificar funcionário e tenant (isolamento garantido na query)
    const employee = await fastify.prisma.employee.findFirst({
      where: { id, tenantId }
    })

    if (!employee) {
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
