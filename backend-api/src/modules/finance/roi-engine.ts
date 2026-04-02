import { Prisma } from '@prisma/client'

export interface FinancialImpact {
  baseAmount: number;
  bonusOneThird: number;
  fgts: number;
  replacementCost: number;
  totalContingency: number;
}

export class ROIEngine {
  /**
   * Calcula o impacto financeiro de um pedido de férias.
   * CLT: Salário + 1/3 Constitucional + Encargos.
   */
  static calculateImpact(salary: number | Prisma.Decimal, days: number): FinancialImpact {
    const dailyRate = Number(salary) / 30
    
    // 1. Pro-rata do valor base das férias (dias gozados)
    const baseAmount = dailyRate * days

    // 2. 1/3 Constitucional (Calculado sobre os dias de férias)
    const bonusOneThird = baseAmount / 3
    
    // 3. FGTS (8% sobre a remuneração das férias + 1/3)
    const fgts = (baseAmount + bonusOneThird) * 0.08

    // 4. Custo de Substituição (Mock para Story 3.3 - 20% de overhead operacional)
    const replacementCost = baseAmount * 0.20

    const totalContingency = baseAmount + bonusOneThird + fgts + replacementCost

    return {
      baseAmount: this.round(baseAmount),
      bonusOneThird: this.round(bonusOneThird),
      fgts: this.round(fgts),
      replacementCost: this.round(replacementCost),
      totalContingency: this.round(totalContingency)
    }
  }

  private static round(value: number): number {
    return Math.round(value * 100) / 100
  }
}
