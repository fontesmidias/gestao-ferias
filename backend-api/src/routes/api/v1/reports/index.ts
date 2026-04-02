import { FastifyPluginAsync } from 'fastify'
import { ROIEngine } from '../../../../modules/finance/roi-engine'

const reports: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Relatório de Contingência Financeira (ROI) - Story 3.3
  fastify.get('/financial-contingency', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const { tenantId } = request.user as any

    // 1. Buscar todas as solicitações não rejeitadas do Tenant
    const requests = await fastify.prisma.vacationRequest.findMany({
      where: { 
        tenantId,
        status: { not: 'REJECTED' }
      },
      include: { employee: true }
    })

    // 2. Calcular impacto financeiro para cada solicitação
    const reportData = requests.map((req: any) => {
      const impact = ROIEngine.calculateImpact(
        req.employee.salary || 0,
        req.days
      )

      return {
        id: req.id,
        employeeName: req.employee.name,
        startDate: req.startDate,
        endDate: req.endDate,
        days: req.days,
        impact
      }
    })

    // 3. Agregação Geral (Dashboard ROI)
    const summary = reportData.reduce((acc: any, item: any) => {
      acc.totalDays += item.days
      acc.totalBaseAmount += item.impact.baseAmount
      acc.totalOneThirdBonus += item.impact.bonusOneThird
      acc.totalFgts += item.impact.fgts
      acc.totalReplacementCost += item.impact.replacementCost
      acc.totalContingency += item.impact.totalContingency
      return acc
    }, {
      totalDays: 0,
      totalBaseAmount: 0,
      totalOneThirdBonus: 0,
      totalFgts: 0,
      totalReplacementCost: 0,
      totalContingency: 0
    })

    return {
      summary,
      details: reportData
    }
  })
}

export default reports
