import { FastifyPluginAsync } from 'fastify'
import { parseISO } from 'date-fns'

const coverages: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Criar cobertura
  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['vacationRequestId', 'replacementEmployeeId', 'workplacePositionId', 'startDate', 'endDate', 'type'],
        properties: {
          vacationRequestId: { type: 'string', format: 'uuid' },
          replacementEmployeeId: { type: 'string', format: 'uuid' },
          workplacePositionId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          type: { type: 'string', enum: ['INTERMITENTE', 'FERISTA'] },
          cost: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const data = request.body as any

    // Validar vacation request
    const vacation = await fastify.prisma.vacationRequest.findFirst({
      where: { id: data.vacationRequestId, tenantId }
    })
    if (!vacation) {
      return reply.code(404).send({ error: 'Not Found', message: 'Solicitação de férias não encontrada.' })
    }

    // Validar replacement employee
    const replacement = await fastify.prisma.employee.findFirst({
      where: { id: data.replacementEmployeeId, tenantId }
    })
    if (!replacement) {
      return reply.code(404).send({ error: 'Not Found', message: 'Colaborador substituto não encontrado.' })
    }

    // AC#Story 2.3: type FERISTA exige replacement com isFerista=true.
    if (data.type === 'FERISTA' && !replacement.isFerista) {
      return reply.code(422).send({
        error: 'Unprocessable Entity',
        code: 'INVALID_REPLACEMENT_FOR_TYPE',
        message: 'Cobertura do tipo FERISTA exige um colaborador com isFerista=true.',
      })
    }

    // Validar position
    const position = await fastify.prisma.workplacePosition.findFirst({
      where: { id: data.workplacePositionId, tenantId }
    })
    if (!position) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posição não encontrada.' })
    }

    const coverage = await fastify.prisma.coverageAssignment.create({
      data: {
        vacationRequestId: data.vacationRequestId,
        replacementEmployeeId: data.replacementEmployeeId,
        workplacePositionId: data.workplacePositionId,
        startDate: parseISO(data.startDate),
        endDate: parseISO(data.endDate),
        type: data.type,
        status: 'ACTIVE',
        cost: data.cost || null,
        tenantId
      },
      include: {
        replacementEmployee: { select: { id: true, name: true, employeeType: true } },
        workplacePosition: { select: { id: true, role: true, workplace: { select: { id: true, name: true } } } },
        vacationRequest: { select: { id: true, startDate: true, endDate: true, employee: { select: { name: true } } } }
      }
    })

    return reply.code(201).send(coverage)
  })

  // Listar coberturas (com filtros)
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          vacationRequestId: { type: 'string' },
          workplacePositionId: { type: 'string' },
          status: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { tenantId } = request.user as any
    const query = request.query as any

    const where: any = { tenantId }
    if (query.vacationRequestId) where.vacationRequestId = query.vacationRequestId
    if (query.workplacePositionId) where.workplacePositionId = query.workplacePositionId
    if (query.status) where.status = query.status
    if (query.from || query.to) {
      where.startDate = {}
      if (query.from) where.startDate.gte = parseISO(query.from)
      if (query.to) where.endDate = { lte: parseISO(query.to) }
    }

    return await fastify.prisma.coverageAssignment.findMany({
      where,
      include: {
        replacementEmployee: { select: { id: true, name: true, employeeType: true } },
        workplacePosition: { select: { id: true, role: true, workplace: { select: { id: true, name: true } } } },
        vacationRequest: { select: { id: true, startDate: true, endDate: true, employee: { select: { name: true } } } }
      },
      orderBy: { startDate: 'asc' }
    })
  })

  // Atualizar cobertura (status, custo)
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PLANNED', 'ACTIVE', 'COMPLETED'] },
          cost: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }
    const data = request.body as any

    const existing = await fastify.prisma.coverageAssignment.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Cobertura não encontrada.' })
    }

    const updated = await fastify.prisma.coverageAssignment.update({
      where: { id: existing.id },
      data: {
        status: data.status !== undefined ? data.status : undefined,
        cost: data.cost !== undefined ? data.cost : undefined,
      }
    })

    return updated
  })

  // Deletar cobertura planejada
  fastify.delete('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const existing = await fastify.prisma.coverageAssignment.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Cobertura não encontrada.' })
    }

    if (existing.status !== 'PLANNED') {
      return reply.code(409).send({ error: 'Conflict', message: 'Apenas coberturas com status PLANNED podem ser removidas.' })
    }

    await fastify.prisma.coverageAssignment.delete({ where: { id } })
    return { message: 'Cobertura removida com sucesso.' }
  })

  // Detectar gaps: postos sem cobertura no período
  fastify.get('/gaps', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { tenantId } = request.user as any
    const { from, to } = request.query as { from: string; to: string }
    const fromDate = parseISO(from)
    const toDate = parseISO(to)

    // 1. Buscar férias aprovadas que se sobreponham ao período
    const approvedVacations = await fastify.prisma.vacationRequest.findMany({
      where: {
        tenantId,
        status: { in: ['APPROVED', 'SIGNED'] },
        startDate: { lte: toDate },
        endDate: { gte: fromDate }
      },
      include: {
        employee: {
          select: {
            id: true, name: true, workplaceId: true,
            allocations: {
              where: { status: 'ACTIVE' },
              include: { workplacePosition: { include: { workplace: true } } }
            }
          }
        },
        coverages: true
      }
    })

    // 2. Identificar gaps — férias sem cobertura ou com cobertura parcial
    const gaps = approvedVacations
      .filter(v => v.coverages.length === 0)
      .map(v => {
        const allocation = v.employee.allocations[0]
        return {
          vacationRequestId: v.id,
          employeeName: v.employee.name,
          vacationStart: v.startDate,
          vacationEnd: v.endDate,
          days: v.days,
          workplace: allocation ? {
            id: allocation.workplacePosition.workplace.id,
            name: allocation.workplacePosition.workplace.name,
            positionId: allocation.workplacePosition.id,
            role: allocation.workplacePosition.role
          } : null,
          hasCoverage: false
        }
      })

    return {
      period: { from: fromDate, to: toDate },
      totalGaps: gaps.length,
      gaps
    }
  })

  // Sugerir cobertura: feristas disponíveis no período
  fastify.get('/suggestions', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        required: ['vacationRequestId'],
        properties: {
          vacationRequestId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { vacationRequestId } = request.query as { vacationRequestId: string }

    // 1. Buscar férias
    const vacation = await fastify.prisma.vacationRequest.findFirst({
      where: { id: vacationRequestId, tenantId },
      include: {
        employee: {
          include: {
            allocations: {
              where: { status: 'ACTIVE' },
              include: { workplacePosition: true }
            }
          }
        }
      }
    })

    if (!vacation) {
      return reply.code(404).send({ error: 'Not Found', message: 'Solicitação de férias não encontrada.' })
    }

    // 2. Buscar feristas disponíveis (isFerista=true, sem cobertura no período).
    // Inclui coverages adjacentes para detectChaining (Story 2.2 AC#chaining).
    const feristas = await fastify.prisma.employee.findMany({
      where: {
        tenantId,
        isFerista: true,
        status: 'ATIVO',
        coveragesAsReplacement: {
          none: {
            startDate: { lte: vacation.endDate },
            endDate: { gte: vacation.startDate },
            status: { in: ['PLANNED', 'ACTIVE'] }
          }
        }
      },
      select: {
        id: true, name: true, cpf: true, salary: true, employeeType: true, isFerista: true,
        coveragesAsReplacement: {
          where: { status: { in: ['PLANNED', 'ACTIVE'] } },
          select: { startDate: true, endDate: true },
        },
      },
    })

    // 3. Buscar intermitentes disponíveis (não-feristas intermitentes)
    const intermitentes = await fastify.prisma.employee.findMany({
      where: {
        tenantId,
        employeeType: 'INTERMITENTE',
        isFerista: false,
        status: 'ATIVO',
        coveragesAsReplacement: {
          none: {
            startDate: { lte: vacation.endDate },
            endDate: { gte: vacation.startDate },
            status: { in: ['PLANNED', 'ACTIVE'] }
          }
        }
      },
      select: { id: true, name: true, cpf: true, salary: true, employeeType: true, isFerista: true },
    })

    const allocation = vacation.employee.allocations[0]

    // Janela de encadeamento: cobertura existente "encosta" no período pedido
    // se sua endDate está até 7 dias antes da vacation.startDate ou sua startDate
    // está até 7 dias depois da vacation.endDate.
    const CHAIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
    const detectChaining = (existing: { startDate: Date; endDate: Date }[]): boolean => {
      const vStart = vacation.startDate.getTime()
      const vEnd = vacation.endDate.getTime()
      return existing.some((c) => {
        const gapBefore = vStart - c.endDate.getTime()
        const gapAfter = c.startDate.getTime() - vEnd
        return (gapBefore >= 0 && gapBefore <= CHAIN_WINDOW_MS) ||
               (gapAfter >= 0 && gapAfter <= CHAIN_WINDOW_MS)
      })
    }

    return {
      vacationRequest: {
        id: vacation.id,
        employeeName: vacation.employee.name,
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        days: vacation.days,
        position: allocation ? {
          positionId: allocation.workplacePosition.id,
          role: allocation.workplacePosition.role
        } : null
      },
      suggestions: {
        feristas: feristas.map(f => {
          const { coveragesAsReplacement, ...rest } = f
          return {
            ...rest,
            estimatedCost: f.salary ? Number(f.salary) / 30 * vacation.days : null,
            type: 'FERISTA' as const,
            // Filtro Prisma já exclui conflitos no período. canChain identifica
            // feristas com coberturas adjacentes (≤7d), úteis para encadear.
            conflictFree: true,
            canChain: detectChaining(coveragesAsReplacement),
          }
        }),
        intermitentes: intermitentes.map(i => ({
          ...i,
          estimatedCost: i.salary ? Number(i.salary) / 30 * vacation.days : null,
          type: 'INTERMITENTE' as const,
          conflictFree: true,
          canChain: false,
        }))
      }
    }
  })
}

export default coverages
