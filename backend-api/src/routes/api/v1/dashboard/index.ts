import { FastifyPluginAsync } from 'fastify'

const dashboard: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/metrics', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const { tenantId, role } = request.user as any
    const whereClause = role === 'SUPERADMIN' ? {} : { tenantId }

    // 1. Employee Composition KPIs (Active vs Leaves)
    // Status é free-form (Tirvu escreve "FÉRIAS", "AFASTADO INSS", "LICENÇA
    // MATERNIDADE", "ATESTADO MÉDICO", etc). Classificamos em buckets para
    // que o frontend possa contar corretamente sem dependência de string exata.
    const employeesAggr = await fastify.prisma.employee.groupBy({
      by: ['status'],
      where: whereClause,
      _count: { id: true }
    })

    let totalEmployees = 0
    const composition: Record<string, number> = { ATIVO: 0, FERIAS: 0, AFASTADO: 0, INATIVO: 0 }

    for (const row of employeesAggr) {
      const count = row._count.id
      totalEmployees += count
      const upper = (row.status ?? '').toUpperCase().trim()
      let bucket: string
      if (upper === 'ATIVO') bucket = 'ATIVO'
      else if (/^F[EÉ]RIAS$/.test(upper)) bucket = 'FERIAS'
      else if (/AFASTAD|LICEN[ÇC]A|ATESTAD/.test(upper)) bucket = 'AFASTADO'
      else if (upper === 'INATIVO' || upper === 'DEMITIDO') bucket = 'INATIVO'
      else bucket = 'INATIVO'
      composition[bucket] = (composition[bucket] ?? 0) + count
      // Mantém também a chave bruta para debug/relatórios sem quebrar API.
      if (upper && !(upper in composition)) composition[upper] = count
      else if (upper && upper !== bucket) composition[upper] = (composition[upper] ?? 0) + count
    }

    // 2. Pending Requests Metrics
    const pendingRequestsCount = await fastify.prisma.vacationRequest.count({
      where: { ...whereClause, status: 'PENDING' }
    })

    // 3. Approval Timeline (Vacations scheduled in the near future)
    // Here we query requests that are APPROVED and map them out by MM/YYYY
    const futureVacations = await fastify.prisma.vacationRequest.findMany({
      where: {
        ...whereClause,
        status: { in: ['APPROVED', 'COMPLETED', 'SIGNED'] },
        startDate: { gte: new Date(new Date().setHours(0,0,0,0)) } // From today onwards
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
