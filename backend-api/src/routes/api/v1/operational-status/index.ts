import type { FastifyPluginAsync } from 'fastify'
import { aggregateComposition, classifyStatus } from '../../../../modules/shared/employee-status-classifier'

/**
 * V3.4 Story 4.12: Single-Source-of-Truth de status operacional dos colaboradores.
 *
 * Consumido por dashboard, /employees e /coverage para evitar divergencias
 * silenciosas (cada pagina contava de um jeito antes).
 *
 * GET /v1/operational-status?date=YYYY-MM-DD (default = D0)
 *
 * Resposta:
 * {
 *   data: {
 *     date: '2026-05-10',
 *     total: 1045,
 *     composition: { ATIVO: 991, FERIAS: 36, AFASTADO: 16, INATIVO: 2 },
 *     coverage: { activeCoverages: 12, plannedCoverages: 4 },
 *     vacations: { ongoing: 36, upcoming30d: 18, pending: 5 }
 *   }
 * }
 */
const operationalStatus: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, role } = request.user as { tenantId?: string; role: string }
      const where = role === 'SUPERADMIN' && !tenantId ? {} : { tenantId: tenantId! }
      const q = request.query as { date?: string }
      const ref = q.date ? new Date(`${q.date}T12:00:00.000Z`) : new Date()
      if (Number.isNaN(ref.getTime())) {
        return reply.code(400).send({ data: null, error: { code: 'BAD_DATE', message: 'date invalido (YYYY-MM-DD).' } })
      }
      const dateIso = ref.toISOString().slice(0, 10)
      const in30d = new Date(ref.getTime() + 30 * 24 * 60 * 60 * 1000)

      // 1. Composicao por bucket via classifier compartilhado.
      const groupRows = await fastify.prisma.employee.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      })
      const { composition, total } = aggregateComposition(
        groupRows.map(r => ({ status: r.status, count: r._count.id })),
      )

      // 2. Coberturas ATIVAS/PLANEJADAS no momento.
      const [activeCoverages, plannedCoverages] = await Promise.all([
        fastify.prisma.coverageAssignment.count({
          where: { ...where, status: 'ACTIVE', startDate: { lte: ref }, endDate: { gte: ref } },
        }),
        fastify.prisma.coverageAssignment.count({
          where: { ...where, status: 'PLANNED', endDate: { gte: ref } },
        }),
      ])

      // 3. Ferias: em curso, proximas 30d, pendentes.
      const [ongoing, upcoming30d, pending] = await Promise.all([
        fastify.prisma.vacationRequest.count({
          where: {
            ...where,
            status: { in: ['APPROVED', 'SIGNED', 'COMPLETED'] },
            startDate: { lte: ref },
            endDate: { gte: ref },
          },
        }),
        fastify.prisma.vacationRequest.count({
          where: {
            ...where,
            status: { in: ['APPROVED', 'SIGNED'] },
            startDate: { gt: ref, lte: in30d },
          },
        }),
        fastify.prisma.vacationRequest.count({
          where: { ...where, status: 'PENDING' },
        }),
      ])

      return reply.send({
        data: {
          date: dateIso,
          total,
          composition,
          coverage: { activeCoverages, plannedCoverages },
          vacations: { ongoing, upcoming30d, pending },
        },
        error: null,
      })
    },
  )

  // Per-employee: status efetivo na data dada (ATIVO|FERIAS|AFASTADO|INATIVO)
  // considerando VacationRequest ativa naquela data.
  fastify.get(
    '/by-employee',
    {
      onRequest: [fastify.requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            limit: { type: 'integer', minimum: 1, maximum: 2000, default: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, role } = request.user as { tenantId?: string; role: string }
      const where = role === 'SUPERADMIN' && !tenantId ? {} : { tenantId: tenantId! }
      const q = request.query as { date?: string; limit?: number }
      const ref = q.date ? new Date(`${q.date}T12:00:00.000Z`) : new Date()
      const limit = q.limit ?? 500

      const employees = await fastify.prisma.employee.findMany({
        where,
        select: {
          id: true,
          name: true,
          registration: true,
          status: true,
          requests: {
            where: {
              status: { in: ['APPROVED', 'SIGNED', 'COMPLETED'] },
              startDate: { lte: ref },
              endDate: { gte: ref },
            },
            select: { id: true, startDate: true, endDate: true, status: true },
            take: 1,
          },
        },
        take: limit,
        orderBy: { name: 'asc' },
      })

      const items = employees.map(e => {
        const onVacation = e.requests.length > 0
        const baseBucket = classifyStatus(e.status)
        // Se tem ferias ativa, sobrepõe pra FERIAS (mesmo que status base nao tenha sido atualizado).
        const effective = onVacation ? 'FERIAS' : baseBucket
        return {
          id: e.id,
          name: e.name,
          registration: e.registration,
          rawStatus: e.status,
          effectiveStatus: effective,
          activeVacation: onVacation
            ? { id: e.requests[0].id, startDate: e.requests[0].startDate, endDate: e.requests[0].endDate, status: e.requests[0].status }
            : null,
        }
      })

      return reply.send({ data: { date: ref.toISOString().slice(0, 10), count: items.length, items }, error: null })
    },
  )
}

export default operationalStatus
