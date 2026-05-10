import { FastifyPluginAsync } from 'fastify'
import { classifyStatus } from '../../../../modules/shared/employee-status-classifier'

const dashboard: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/metrics', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          // V3.4: aceita ?quarter=YYYY-QN (ex: 2026-Q2). Default = trimestre atual.
          quarter: { type: 'string', pattern: '^\\d{4}-Q[1-4]$' },
        },
      },
    },
  }, async (request, reply) => {
    const { tenantId, role } = request.user as any
    const whereClause = role === 'SUPERADMIN' ? {} : { tenantId }
    const q = request.query as { quarter?: string }
    // Janela do trimestre selecionado para o timeline (composition e total agregam global).
    let quarterStart: Date
    let quarterEnd: Date
    if (q.quarter) {
      const [yStr, qStr] = q.quarter.split('-Q')
      const y = Number(yStr)
      const qn = Number(qStr)
      const monthStart = (qn - 1) * 3
      quarterStart = new Date(Date.UTC(y, monthStart, 1))
      quarterEnd = new Date(Date.UTC(y, monthStart + 3, 1) - 1)
    } else {
      const now = new Date()
      const qn = Math.floor(now.getUTCMonth() / 3)
      quarterStart = new Date(Date.UTC(now.getUTCFullYear(), qn * 3, 1))
      quarterEnd = new Date(Date.UTC(now.getUTCFullYear(), qn * 3 + 3, 1) - 1)
    }

    // 1. Employee Composition KPIs (Active vs Leaves)
    // Status é free-form (Tirvu escreve "FÉRIAS", "AFASTADO INSS", "LICENÇA
    // MATERNIDADE", "ATESTADO MÉDICO", etc). Classificamos em buckets para
    // que o frontend possa contar corretamente sem dependência de string exata.
    const employeesAggr = await fastify.prisma.employee.groupBy({
      by: ['status'],
      where: whereClause,
      _count: { id: true }
    })

    // V3.4 Story 4.11: classificacao via classifier compartilhado.
    let totalEmployees = 0
    const composition: Record<string, number> = { ATIVO: 0, FERIAS: 0, AFASTADO: 0, INATIVO: 0 }

    for (const row of employeesAggr) {
      const count = row._count.id
      totalEmployees += count
      const bucket = classifyStatus(row.status)
      composition[bucket] += count
      // Mantem chave bruta para debug/relatorios sem quebrar API.
      const upper = (row.status ?? '').toUpperCase().trim()
      if (upper && !(upper in composition)) composition[upper] = count
      else if (upper && upper !== bucket) composition[upper] = (composition[upper] ?? 0) + count
    }

    // 2. Pending Requests Metrics
    const pendingRequestsCount = await fastify.prisma.vacationRequest.count({
      where: { ...whereClause, status: 'PENDING' }
    })

    // 3. Approval Timeline — ferias APPROVED/SIGNED/COMPLETED dentro do trimestre selecionado.
    const futureVacations = await fastify.prisma.vacationRequest.findMany({
      where: {
        ...whereClause,
        status: { in: ['APPROVED', 'COMPLETED', 'SIGNED'] },
        startDate: { gte: quarterStart, lte: quarterEnd },
      },
      select: {
        startDate: true,
        days: true
      },
      orderBy: { startDate: 'asc' },
      take: 200 // Cap to prevent memory leaks if array is massive
    })

    // Grouping for Recharts: Count by "Month"
    const timelineData: Record<string, number> = {}
    futureVacations.forEach(v => {
      // YYYY-MM
      const monthLabel = v.startDate.toISOString().substring(0, 7)
      if (!timelineData[monthLabel]) timelineData[monthLabel] = 0
      timelineData[monthLabel] += 1
    })
    
    // Map object to Recharts array format [{ name: '2026-05', value: 12 }]
    const trendGraph = Object.keys(timelineData).map(k => ({
      name: k,
      value: timelineData[k]
    }))

    // 4. Recent Activity (Latest Audit logs)
    const recentActivity = await fastify.prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        user: { select: { name: true } }
      }
    })

    return {
      kpis: {
        totalEmployees,
        composition,
        pendingApprovals: pendingRequestsCount
      },
      trends: trendGraph,
      activity: recentActivity.map(act => ({
        id: act.id,
        user: act.user.name,
        action: act.action,
        date: act.createdAt
      }))
    }
  })
}

export default dashboard
