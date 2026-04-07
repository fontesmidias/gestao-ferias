import { FastifyPluginAsync } from 'fastify'

const dashboard: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/metrics', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const tenantId = (request.user as any).tenantId

    // 1. Employee Composition KPIs (Active vs Leaves)
    const employeesAggr = await fastify.prisma.employee.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true }
    })
    
    let totalEmployees = 0;
    
    // Convert to dictionary format
    const composition = employeesAggr.reduce((acc, curr) => {
      acc[curr.status] = curr._count.id
      totalEmployees += curr._count.id;
      return acc
    }, {} as Record<string, number>)

    // 2. Pending Requests Metrics
    const pendingRequestsCount = await fastify.prisma.vacationRequest.count({
      where: { tenantId, status: 'PENDING' }
    })

    // 3. Approval Timeline (Vacations scheduled in the near future)
    // Here we query requests that are APPROVED and map them out by MM/YYYY
    const futureVacations = await fastify.prisma.vacationRequest.findMany({
      where: { 
        tenantId, 
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
      where: { tenantId },
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
