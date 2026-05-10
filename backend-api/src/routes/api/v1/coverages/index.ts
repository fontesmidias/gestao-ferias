import { FastifyPluginAsync } from 'fastify'
import { parseISO } from 'date-fns'
import { coverageEventBus } from '../../../../modules/coverage-engine/tenant-event-bus'

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

    // V3.4 FASE C3: anti-overlap rigido. A mesma pessoa nao pode estar em
    // duas coberturas PLANNED/ACTIVE com periodos sobrepostos.
    const start = parseISO(data.startDate)
    const end = parseISO(data.endDate)
    const overlap = await fastify.prisma.coverageAssignment.findFirst({
      where: {
        tenantId,
        replacementEmployeeId: data.replacementEmployeeId,
        status: { in: ['PLANNED', 'ACTIVE'] },
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
      include: {
        workplacePosition: { select: { workplace: { select: { name: true } }, role: true } },
        vacationRequest: { select: { employee: { select: { name: true } } } },
      },
    })
    if (overlap) {
      return reply.code(409).send({
        data: null,
        error: {
          code: 'COVERAGE_OVERLAP',
          message: `${replacement.name} ja esta em outra cobertura nesse periodo (cobrindo ${overlap.vacationRequest.employee.name} em ${overlap.workplacePosition.workplace.name} / ${overlap.workplacePosition.role}).`,
          conflict: {
            id: overlap.id,
            startDate: overlap.startDate,
            endDate: overlap.endDate,
            workplace: overlap.workplacePosition.workplace.name,
            role: overlap.workplacePosition.role,
            coveringFor: overlap.vacationRequest.employee.name,
          },
        },
      })
    }

    const coverage = await fastify.prisma.coverageAssignment.create({
      data: {
        vacationRequestId: data.vacationRequestId,
        replacementEmployeeId: data.replacementEmployeeId,
        workplacePositionId: data.workplacePositionId,
        startDate: start,
        endDate: end,
        type: data.type,
        status: 'ACTIVE',
        cost: data.cost || null,
        tenantId
      },
      include: {
        replacementEmployee: { select: { id: true, name: true, employeeType: true, registration: true } },
        workplacePosition: { select: { id: true, role: true, workplace: { select: { id: true, name: true } } } },
        vacationRequest: { select: { id: true, startDate: true, endDate: true, employee: { select: { name: true, registration: true } } } }
      }
    })

    coverageEventBus.emit(tenantId, {
      type: 'coverage.created',
      coverageId: coverage.id,
      vacationRequestId: coverage.vacationRequestId,
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
        replacementEmployee: { select: { id: true, name: true, employeeType: true, registration: true } },
        workplacePosition: { select: { id: true, role: true, workplace: { select: { id: true, name: true } } } },
        vacationRequest: { select: { id: true, startDate: true, endDate: true, employee: { select: { name: true, registration: true } } } }
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

    coverageEventBus.emit(tenantId, { type: 'coverage.updated', coverageId: updated.id })
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
    coverageEventBus.emit(tenantId, { type: 'coverage.deleted', coverageId: id })
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

  // Story 2.4 / L3 — SSE de eventos de cobertura. Cliente assina e re-fetcha
  // dados em tempo real quando algo muda no tenant.
  fastify.get('/events', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const { tenantId } = request.user as any

    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders?.()

    // Hello inicial — útil para o frontend confirmar conexão.
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ tenantId })}\n\n`)

    const unsubscribe = coverageEventBus.subscribe(tenantId, (event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    })

    // Keep-alive ping a cada 30s para evitar proxy idle timeout.
    const ping = setInterval(() => {
      try { reply.raw.write(`: ping\n\n`) } catch { /* conexão fechou */ }
    }, 30_000)

    request.raw.on('close', () => {
      clearInterval(ping)
      unsubscribe()
    })
    // Não return — fastify mantém conexão aberta enquanto raw.end() não ocorrer.
    return reply
  })

  // KPIs do mês — Story 2.5
  // gapsTotal: férias aprovadas sem cobertura no mês
  // estimatedCoverageMonthCost: soma dos cost das coberturas que tocam o mês
  // availableFeristasCount: feristas ATIVOs sem cobertura sobreposta ao mês
  fastify.get('/kpis', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
        },
      },
    },
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const query = (request.query ?? {}) as { month?: string }

    // Default: mês corrente.
    const ref = query.month
      ? parseISO(`${query.month}-01`)
      : new Date()
    if (Number.isNaN(ref.getTime())) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Parâmetro month inválido (esperado YYYY-MM).' })
    }
    const monthStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0))
    const monthEnd = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1, 0, 0, 0) - 1)

    // 1. gapsTotal — férias aprovadas que se sobrepõem ao mês e não têm cobertura.
    const approvedVacations = await fastify.prisma.vacationRequest.findMany({
      where: {
        tenantId,
        status: { in: ['APPROVED', 'SIGNED'] },
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      select: { id: true, coverages: { select: { id: true } } },
    })
    const gapsTotal = approvedVacations.filter((v) => v.coverages.length === 0).length

    // 2. estimatedCoverageMonthCost — soma dos cost de coberturas (ACTIVE/PLANNED) sobrepostas ao mês.
    const monthCoverages = await fastify.prisma.coverageAssignment.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'PLANNED'] },
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      select: { cost: true },
    })
    const estimatedCoverageMonthCost = monthCoverages.reduce((acc, c) => {
      return acc + (c.cost ? Number(c.cost) : 0)
    }, 0)

    // 3. availableFeristasCount — feristas ATIVO sem cobertura sobreposta ao mês.
    const availableFeristasCount = await fastify.prisma.employee.count({
      where: {
        tenantId,
        isFerista: true,
        status: 'ATIVO',
        coveragesAsReplacement: {
          none: {
            startDate: { lte: monthEnd },
            endDate: { gte: monthStart },
            status: { in: ['PLANNED', 'ACTIVE'] },
          },
        },
      },
    })

    return {
      month: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
      gapsTotal,
      estimatedCoverageMonthCost,
      availableFeristasCount,
    }
  })

  // V3.4 FASE C5: Feristas livres num período (default próximos 30d). Útil
  // para o operador planejar antes de ter VacationRequest específica.
  fastify.get('/available-feristas', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { tenantId } = request.user as any
    const q = request.query as { from?: string; to?: string }
    const fromDate = q.from ? parseISO(q.from) : new Date()
    const toDate = q.to ? parseISO(q.to) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const feristas = await fastify.prisma.employee.findMany({
      where: {
        tenantId,
        isFerista: true,
        status: 'ATIVO',
      },
      select: {
        id: true, name: true, position: true, workplace: true, shift: true, salary: true,
        coveragesAsReplacement: {
          where: {
            status: { in: ['PLANNED', 'ACTIVE'] },
            startDate: { lte: toDate },
            endDate: { gte: fromDate },
          },
          select: { id: true, startDate: true, endDate: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return {
      data: {
        period: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
        feristas: feristas.map(f => ({
          id: f.id,
          name: f.name,
          position: f.position,
          workplace: f.workplace,
          shift: f.shift,
          coveragesInPeriod: f.coveragesAsReplacement.length,
          isFree: f.coveragesAsReplacement.length === 0,
        })),
      },
      error: null,
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
        position: true, shift: true,
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
      select: { id: true, name: true, cpf: true, salary: true, employeeType: true, isFerista: true,
        position: true, shift: true },
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

    // V3.4 FASE C2: ranking explicito por cargo. Familias hardcoded para Green
    // House — pode virar config por tenant depois. matchScore: 3=idêntico,
    // 2=mesma família, 1=qualquer ferista (ainda elegível pra cobrir).
    const targetRole = (allocation?.workplacePosition?.role || '').toLowerCase().trim()
    const ROLE_FAMILIES: Record<string, string[]> = {
      limpeza: ['servente', 'auxiliar de limpeza', 'auxiliar de servicos gerais', 'asg', 'copeira'],
      seguranca: ['vigilante', 'porteiro', 'controlador de acesso', 'brigadista'],
      recepcao: ['recepcionista', 'atendente', 'secretaria', 'tecnico em secretariado'],
      tecnico: ['tecnico', 'analista', 'operador'],
      motorista: ['motorista', 'condutor'],
    }
    const familyOf = (role: string): string | null => {
      const r = role.toLowerCase()
      for (const [family, members] of Object.entries(ROLE_FAMILIES)) {
        if (members.some(m => r.includes(m))) return family
        if (r.includes(family)) return family
      }
      return null
    }
    const targetFamily = familyOf(targetRole)
    const computeMatchScore = (candidatePosition: string | null | undefined): {
      score: number
      level: 'identical' | 'family' | 'any'
      reason: string
    } => {
      if (!targetRole) return { score: 1, level: 'any', reason: 'Sem cargo de referência no posto' }
      const cand = (candidatePosition || '').toLowerCase().trim()
      if (cand === targetRole) return { score: 3, level: 'identical', reason: `Cargo idêntico: ${candidatePosition}` }
      const candFamily = familyOf(cand)
      if (targetFamily && candFamily === targetFamily) {
        return { score: 2, level: 'family', reason: `Família ${targetFamily}: ${candidatePosition || 'cargo n/d'}` }
      }
      return { score: 1, level: 'any', reason: `Cargo diferente: ${candidatePosition || 'n/d'}` }
    }

    const feristasRanked = feristas.map(f => {
      const { coveragesAsReplacement, ...rest } = f
      const match = computeMatchScore(f.position)
      return {
        ...rest,
        estimatedCost: f.salary ? Number(f.salary) / 30 * vacation.days : null,
        type: 'FERISTA' as const,
        conflictFree: true,
        canChain: detectChaining(coveragesAsReplacement),
        match,
      }
    }).sort((a, b) => b.match.score - a.match.score)

    const intermitentesRanked = intermitentes.map(i => {
      const match = computeMatchScore(i.position)
      return {
        ...i,
        estimatedCost: i.salary ? Number(i.salary) / 30 * vacation.days : null,
        type: 'INTERMITENTE' as const,
        conflictFree: true,
        canChain: false,
        match,
      }
    }).sort((a, b) => b.match.score - a.match.score)

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
        } : null,
        targetFamily,
      },
      suggestions: {
        feristas: feristasRanked,
        intermitentes: intermitentesRanked,
      }
    }
  })
}

export default coverages
