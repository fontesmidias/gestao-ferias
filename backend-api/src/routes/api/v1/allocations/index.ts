import { FastifyPluginAsync } from 'fastify'
import { ImportService } from '../../../../modules/employees/import-service'
import { SanitizationService } from '../../../../modules/employees/sanitization-service'

const allocations: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Download template de alocacoes
  fastify.get('/import/template', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const buffer = ImportService.generateAllocationTemplate()
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="modelo-alocacoes.xlsx"')
      .send(buffer)
  })

  // Importar alocacoes em massa
  fastify.post('/import', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'Bad Request', message: 'Nenhum arquivo enviado.' })

    const buffer = await data.toBuffer()
    const ext = data.filename.split('.').pop()?.toLowerCase() || ''
    const { tenantId } = request.user as any

    try {
      const rows = await ImportService.parseAllocations(buffer, ext)
      let created = 0; let errors = 0

      for (const row of rows) {
        try {
          if (!row.employeeCpf || !row.workplaceName || !row.positionRole) { errors++; continue }
          const cpf = SanitizationService.sanitizeCPF(row.employeeCpf)

          const employee = await fastify.prisma.employee.findFirst({ where: { cpf, tenantId } })
          if (!employee) { errors++; continue }

          const workplace = await fastify.prisma.workplace.findFirst({ where: { name: row.workplaceName, tenantId } })
          if (!workplace) { errors++; continue }

          const position = await fastify.prisma.workplacePosition.findFirst({
            where: { workplaceId: workplace.id, role: row.positionRole, tenantId }
          })
          if (!position) { errors++; continue }

          // Encerrar alocacao ativa anterior
          await fastify.prisma.workplaceAllocation.updateMany({
            where: { employeeId: employee.id, status: 'ACTIVE', tenantId },
            data: { status: 'ENDED', endDate: new Date() }
          })

          await fastify.prisma.workplaceAllocation.create({
            data: {
              employeeId: employee.id,
              workplacePositionId: position.id,
              startDate: SanitizationService.sanitizeDate(row.startDate),
              status: 'ACTIVE',
              tenantId,
            }
          })

          await fastify.prisma.employee.update({
            where: { id: employee.id },
            data: { workplaceId: workplace.id }
          })

          created++
        } catch { errors++ }
      }

      return { message: `Importacao concluida: ${created} alocacoes criadas, ${errors} erros.`, created, errors }
    } catch (error: any) {
      return reply.code(400).send({ error: 'Import Error', message: error.message })
    }
  })

  // Alocar colaborador em uma posição do posto
  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['employeeId', 'workplacePositionId', 'startDate'],
        properties: {
          employeeId: { type: 'string', format: 'uuid' },
          workplacePositionId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { employeeId, workplacePositionId, startDate } = request.body as any

    // Verificar employee pertence ao tenant
    const employee = await fastify.prisma.employee.findFirst({ where: { id: employeeId, tenantId } })
    if (!employee) {
      return reply.code(404).send({ error: 'Not Found', message: 'Colaborador não encontrado.' })
    }

    // Verificar position pertence ao tenant
    const position = await fastify.prisma.workplacePosition.findFirst({
      where: { id: workplacePositionId, tenantId },
      include: { workplace: true }
    })
    if (!position) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posição não encontrada.' })
    }

    // Verificar se o colaborador já tem alocação ativa
    const existingAllocation = await fastify.prisma.workplaceAllocation.findFirst({
      where: { employeeId, status: 'ACTIVE', tenantId }
    })
    if (existingAllocation) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Colaborador já possui alocação ativa. Desaloque antes de realocar.'
      })
    }

    const allocation = await fastify.prisma.workplaceAllocation.create({
      data: {
        employeeId,
        workplacePositionId,
        startDate: new Date(startDate),
        status: 'ACTIVE',
        tenantId
      },
      include: {
        employee: { select: { id: true, name: true } },
        workplacePosition: { select: { id: true, role: true, workplace: { select: { id: true, name: true } } } }
      }
    })

    // Atualizar workplaceId no employee para referência rápida
    await fastify.prisma.employee.update({
      where: { id: employeeId },
      data: { workplaceId: position.workplaceId }
    })

    return reply.code(201).send(allocation)
  })

  // Listar alocações (filtros: workplaceId, status)
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          workplaceId: { type: 'string', format: 'uuid' },
          status: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { tenantId } = request.user as any
    const { workplaceId, status } = request.query as any

    const where: any = { tenantId }
    if (status) where.status = status
    if (workplaceId) {
      where.workplacePosition = { workplaceId }
    }

    return await fastify.prisma.workplaceAllocation.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, cpf: true, employeeType: true } },
        workplacePosition: {
          select: { id: true, role: true, shiftPattern: true, workplace: { select: { id: true, name: true } } }
        }
      },
      orderBy: { startDate: 'desc' }
    })
  })

  // Desalocar colaborador (encerrar alocação)
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

    const allocation = await fastify.prisma.workplaceAllocation.findFirst({
      where: { id, tenantId, status: 'ACTIVE' }
    })

    if (!allocation) {
      return reply.code(404).send({ error: 'Not Found', message: 'Alocação ativa não encontrada.' })
    }

    const updated = await fastify.prisma.workplaceAllocation.update({
      where: { id: allocation.id },
      data: { endDate: new Date(), status: 'ENDED' }
    })

    // Limpar workplaceId do employee
    await fastify.prisma.employee.update({
      where: { id: allocation.employeeId },
      data: { workplaceId: null }
    })

    return { message: 'Colaborador desalocado com sucesso.', allocation: updated }
  })
}

export default allocations
