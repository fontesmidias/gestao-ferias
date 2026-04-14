import { PrismaClient } from '@prisma/client'
import { ROIEngine } from '../finance/roi-engine'

export class CoverageEngine {
  /**
   * Dado um pedido de férias, retorna opções de cobertura com custo estimado.
   */
  static async getOptions(vacationRequestId: string, tenantId: string, prisma: PrismaClient) {
    const vacation = await prisma.vacationRequest.findFirst({
      where: { id: vacationRequestId, tenantId },
      include: {
        employee: {
          include: {
            allocations: {
              where: { status: 'ACTIVE' },
              include: { workplacePosition: { include: { workplace: true } } }
            }
          }
        }
      }
    })

    if (!vacation) return null

    const allocation = vacation.employee.allocations[0]

    // Feristas disponíveis no período
    const feristas = await prisma.employee.findMany({
      where: {
        tenantId,
        employeeType: 'FERISTA',
        status: 'ATIVO',
        coveragesAsReplacement: {
          none: {
            startDate: { lte: vacation.endDate },
            endDate: { gte: vacation.startDate },
            status: { in: ['PLANNED', 'ACTIVE'] }
          }
        }
      },
      select: { id: true, name: true, salary: true, employeeType: true }
    })

    // Intermitentes disponíveis
    const intermitentes = await prisma.employee.findMany({
      where: {
        tenantId,
        employeeType: 'INTERMITENTE',
        status: 'ATIVO',
        coveragesAsReplacement: {
          none: {
            startDate: { lte: vacation.endDate },
            endDate: { gte: vacation.startDate },
            status: { in: ['PLANNED', 'ACTIVE'] }
          }
        }
      },
      select: { id: true, name: true, salary: true, employeeType: true }
    })

    const mapWithCost = (emp: any) => ({
      ...emp,
      estimatedCost: emp.salary
        ? ROIEngine.calculateImpact(emp.salary, vacation.days).baseAmount
        : null,
    })

    return {
      vacationRequest: {
        id: vacation.id,
        employeeName: vacation.employee.name,
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        days: vacation.days,
        position: allocation ? {
          positionId: allocation.workplacePosition.id,
          role: allocation.workplacePosition.role,
          workplace: allocation.workplacePosition.workplace.name
        } : null
      },
      feristas: feristas.map(mapWithCost),
      intermitentes: intermitentes.map(mapWithCost),
    }
  }

  /**
   * Timeline de cobertura por posto em um período.
   */
  static async getTimeline(workplaceId: string, from: Date, to: Date, tenantId: string, prisma: PrismaClient) {
    const positions = await prisma.workplacePosition.findMany({
      where: { workplaceId, tenantId },
      include: {
        allocations: {
          where: { status: 'ACTIVE' },
          include: { employee: { select: { id: true, name: true } } }
        },
        coverages: {
          where: {
            startDate: { lte: to },
            endDate: { gte: from },
          },
          include: {
            replacementEmployee: { select: { id: true, name: true, employeeType: true } },
            vacationRequest: { select: { id: true, employee: { select: { name: true } } } }
          },
          orderBy: { startDate: 'asc' }
        }
      }
    })

    return positions.map(pos => ({
      positionId: pos.id,
      role: pos.role,
      requiredCount: pos.requiredCount,
      currentStaff: pos.allocations.map(a => a.employee),
      coverages: pos.coverages.map(c => ({
        id: c.id,
        replacedBy: c.replacementEmployee,
        replacing: c.vacationRequest.employee.name,
        startDate: c.startDate,
        endDate: c.endDate,
        type: c.type,
        status: c.status,
      }))
    }))
  }

  /**
   * Detecta encadeamento: períodos disponíveis de um ferista entre coberturas.
   */
  static async detectChaining(feristaId: string, tenantId: string, prisma: PrismaClient) {
    const coverages = await prisma.coverageAssignment.findMany({
      where: { replacementEmployeeId: feristaId, tenantId, status: { in: ['PLANNED', 'ACTIVE'] } },
      orderBy: { startDate: 'asc' },
      include: {
        workplacePosition: { include: { workplace: { select: { name: true } } } }
      }
    })

    const gaps: { from: Date; to: Date }[] = []
    for (let i = 0; i < coverages.length - 1; i++) {
      const current = coverages[i]
      const next = coverages[i + 1]
      if (next.startDate > current.endDate) {
        gaps.push({ from: current.endDate, to: next.startDate })
      }
    }

    return {
      feristaId,
      totalCoverages: coverages.length,
      coverages: coverages.map(c => ({
        id: c.id,
        workplace: c.workplacePosition.workplace.name,
        role: c.workplacePosition.role,
        startDate: c.startDate,
        endDate: c.endDate,
      })),
      availableGaps: gaps,
      canChain: gaps.length > 0
    }
  }
}
