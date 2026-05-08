import type { FastifyPluginAsync } from 'fastify'
import { parseISO, differenceInDays } from 'date-fns'
import { VacationEngine } from '../../../../../modules/vacations/vacation-engine'

/**
 * V3.4 MVP M4: Admin programa férias diretamente em nome do colaborador.
 *
 * Operação Green House: RH já sabe quem entra de férias nos próximos meses
 * (planilha manual). Não faz sentido forçar workflow PENDING→APPROVED.
 * Endpoint cria VacationRequest direto APPROVED com auditoria.
 *
 * Validações:
 * - Anti-overlap (M6): mesmo employee não pode ter outra VacationRequest em
 *   status APPROVED/PENDING/SIGNED no mesmo período.
 * - Saldo CLT (M7): valida via VacationEngine; com flag overrideBalance=true
 *   o ADMIN pode forçar criação (registrado em AuditLog).
 * - Regras CLT do VacationEngine (Art. 134): aplicadas igual ao endpoint público.
 */

const programmedVacations: FastifyPluginAsync = async (fastify) => {
  fastify.post('/programmed', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['employeeId', 'startDate', 'endDate'],
        properties: {
          employeeId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          dispatchNote: { type: 'string' },
          overrideBalance: { type: 'boolean', default: false },
          overrideOverlap: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({
        data: null,
        error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' },
      })
    }

    const body = request.body as {
      employeeId: string
      startDate: string
      endDate: string
      dispatchNote?: string
      overrideBalance?: boolean
      overrideOverlap?: boolean
    }

    const start = parseISO(body.startDate)
    const end = parseISO(body.endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return reply.code(400).send({
        data: null,
        error: { code: 'INVALID_DATES', message: 'Datas inválidas.' },
      })
    }
    if (end < start) {
      return reply.code(400).send({
        data: null,
        error: { code: 'INVALID_RANGE', message: 'endDate deve ser >= startDate.' },
      })
    }
    const days = differenceInDays(end, start) + 1

    const employee = await fastify.prisma.employee.findFirst({
      where: { id: body.employeeId, tenantId: user.tenantId },
    })
    if (!employee) {
      return reply.code(404).send({
        data: null,
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Colaborador não encontrado.' },
      })
    }

    // M6: anti-overlap — outras férias APPROVED/PENDING/SIGNED do mesmo employee
    // que sobreponham o período pedido.
    const conflicting = await fastify.prisma.vacationRequest.findMany({
      where: {
        tenantId: user.tenantId,
        employeeId: body.employeeId,
        status: { in: ['APPROVED', 'PENDING', 'SIGNED', 'COMPLETED'] },
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    })
    if (conflicting.length > 0 && !body.overrideOverlap) {
      return reply.code(409).send({
        data: null,
        error: {
          code: 'VACATION_OVERLAP',
          message: 'Colaborador já possui férias sobrepondo este período.',
          conflicts: conflicting,
        },
      })
    }

    // M7: validação CLT + saldo. Se !overrideBalance, bloqueia. Caso contrário audita.
    const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
    const totalBalance = periods.reduce((acc, p) => acc + p.daysOfRight, 0)
    const targetPeriod = periods.find(p => start >= p.startDate && start < p.endDate)
    const periodDaysOfRight = targetPeriod?.daysOfRight ?? 30
    const existingRequests = await fastify.prisma.vacationRequest.findMany({
      where: {
        employeeId: body.employeeId,
        tenantId: user.tenantId,
        status: { not: 'REJECTED' },
        startDate: { gte: targetPeriod?.startDate ?? new Date(0) },
        endDate: { lt: targetPeriod?.endDate ?? new Date('2999-12-31') },
      },
      select: { startDate: true, endDate: true, days: true, status: true },
    })
    const validation = await VacationEngine.validateRequestFull(start, end, totalBalance, {
      tenantId: user.tenantId,
      resolver: fastify.holidayResolver,
      fractionContext: {
        existingFractions: existingRequests,
        periodDaysOfRight,
      },
    })
    if (!validation.isValid && !body.overrideBalance) {
      return reply.code(422).send({
        data: null,
        error: {
          code: 'CLT_VIOLATION',
          message: 'A solicitação viola regras da CLT (Art. 134).',
          details: validation.errors,
          codes: validation.errorDetails?.map(e => e.code),
        },
      })
    }

    // Cria APPROVED com dispatchNote indicando origem.
    const note = body.dispatchNote?.trim() || 'Programada pelo RH'
    const created = await fastify.prisma.vacationRequest.create({
      data: {
        tenantId: user.tenantId,
        employeeId: body.employeeId,
        startDate: start,
        endDate: end,
        days,
        status: 'APPROVED',
        dispatchNote: note,
      },
    })

    await fastify.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        action: 'VACATION_PROGRAMMED',
        resourceType: 'VACATION_REQUEST',
        resourceId: created.id,
        newData: {
          employeeId: body.employeeId,
          startDate: body.startDate,
          endDate: body.endDate,
          days,
          dispatchNote: note,
          overrideBalance: body.overrideBalance ?? false,
          overrideOverlap: body.overrideOverlap ?? false,
          conflicts: conflicting.length,
          cltWarnings: validation.isValid ? [] : validation.errors,
        } as never,
      },
    })

    return reply.code(201).send({
      data: created,
      error: null,
      meta: {
        cltWarnings: validation.isValid ? [] : validation.errors,
        overlapDetected: conflicting.length > 0,
      },
    })
  })
}

export default programmedVacations
