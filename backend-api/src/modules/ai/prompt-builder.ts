/**
 * PromptBuilder — módulo centralizado para montar contexto LLM com dados reais do tenant.
 * Story 4.1: Todas as rotas /predict/* usam dados reais consistentes e testáveis.
 */

export interface TenantContext {
  tenantName: string
  totalEmployees: number
  pendingRequests: number
  approvedRequests: number
  coverageGaps: number
  workplaces: { name: string; minStaff: number; currentStaff: number }[]
  feristasAvailable: number
  upcomingVacations: { employeeName: string; startDate: Date; endDate: Date; days: number }[]
}

export class PromptBuilder {
  /**
   * Consulta dados reais do tenant e monta o contexto para o LLM.
   */
  static async buildContext(prisma: any, tenantId: string): Promise<TenantContext> {
    const [tenant, totalEmployees, pendingRequests, approvedRequests, workplaces, coverageGaps, feristasAvailable, upcomingVacations] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      prisma.employee.count({ where: { tenantId, status: 'ATIVO' } }),
      prisma.vacationRequest.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.vacationRequest.count({ where: { tenantId, status: { in: ['APPROVED', 'SIGNED'] } } }),
      prisma.workplace.findMany({
        where: { tenantId },
        select: { name: true, minStaff: true, _count: { select: { employees: true } } }
      }),
      prisma.coverageAssignment.count({ where: { tenantId, status: 'PLANNED' } }),
      prisma.employee.count({ where: { tenantId, isFerista: true, status: 'ATIVO' } }),
      prisma.vacationRequest.findMany({
        where: {
          tenantId,
          status: { in: ['APPROVED', 'SIGNED'] },
          startDate: { gte: new Date() }
        },
        select: {
          startDate: true, endDate: true, days: true,
          employee: { select: { name: true } }
        },
        orderBy: { startDate: 'asc' },
        take: 20
      })
    ])

    return {
      tenantName: tenant?.name || 'Empresa',
      totalEmployees,
      pendingRequests,
      approvedRequests,
      coverageGaps,
      workplaces: workplaces.map((w: any) => ({
        name: w.name,
        minStaff: w.minStaff,
        currentStaff: w._count.employees
      })),
      feristasAvailable,
      upcomingVacations: upcomingVacations.map((v: any) => ({
        employeeName: v.employee.name,
        startDate: v.startDate,
        endDate: v.endDate,
        days: v.days
      }))
    }
  }

  /**
   * Monta o system prompt com contexto real do tenant.
   */
  static buildSystemPrompt(ctx: TenantContext): string {
    const workplacesInfo = ctx.workplaces.length > 0
      ? ctx.workplaces.map(w => `  - ${w.name} (mín: ${w.minStaff}, atual: ${w.currentStaff})`).join('\n')
      : '  - Nenhum posto cadastrado'

    const vacationsInfo = ctx.upcomingVacations.length > 0
      ? ctx.upcomingVacations.slice(0, 10).map(v =>
        `  - ${v.employeeName}: ${v.startDate.toISOString().split('T')[0]} a ${v.endDate.toISOString().split('T')[0]} (${v.days}d)`
      ).join('\n')
      : '  - Nenhuma férias agendada'

    return `Você é o Oráculo AI da plataforma GestãoFérias, especialista em gestão de férias para empresas de terceirização de mão de obra no Brasil.
Responda sempre em português, de forma objetiva e profissional.
Use os dados reais fornecidos para embasar suas respostas.
Quando não tiver dados suficientes, diga claramente.
Cite artigos da CLT quando relevante (Art. 130, 134, 137).

Dados atuais da empresa "${ctx.tenantName}":
- Total de colaboradores ativos: ${ctx.totalEmployees}
- Solicitações de férias pendentes: ${ctx.pendingRequests}
- Férias aprovadas/em andamento: ${ctx.approvedRequests}
- Coberturas planejadas: ${ctx.coverageGaps}
- Feristas disponíveis: ${ctx.feristasAvailable}
- Postos de trabalho:
${workplacesInfo}
- Próximas férias agendadas:
${vacationsInfo}

Baseado em ${ctx.approvedRequests} férias aprovadas, ${ctx.workplaces.length} postos e ${ctx.feristasAvailable} feristas disponíveis.`
  }

  /**
   * Monta o prompt de atribuição de fonte para a resposta.
   */
  static buildSourceAttribution(ctx: TenantContext): string {
    return `Baseado em ${ctx.approvedRequests} férias agendadas, ${ctx.workplaces.length} postos com ${ctx.coverageGaps} gaps, ${ctx.feristasAvailable} feristas disponíveis.`
  }
}
