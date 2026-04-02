import { differenceInMonths, addYears, isAfter, startOfDay, getDay, differenceInDays } from 'date-fns'

export interface VacationPeriod {
  startDate: Date;
  endDate: Date;
  concessiveEndDate: Date;
  daysOfRight: number;
  absences: number;
  status: 'AQUISITIVO' | 'CONCESSIVO' | 'VENCIDO' | 'QUITADO';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class VacationEngine {
  /**
   * Calcula os períodos de férias baseados na data de admissão e faltas.
   * CLT Art. 130
   */
  static calculatePeriods(hireDate: Date, absences: number = 0, balanceOffset: number = 0): VacationPeriod[] {
    const today = startOfDay(new Date())
    const periods: VacationPeriod[] = []

    let currentAquisitivoStart = startOfDay(hireDate)
    
    // Gerar períodos até o dia atual
    while (!isAfter(currentAquisitivoStart, today)) {
        const aquisitivoEnd = addYears(currentAquisitivoStart, 1)
        const concessiveEnd = addYears(aquisitivoEnd, 1)
        
        let days = this.getDaysFromAbsences(absences)
        
        // Se for o período aberto (atual), calcular proporcional 1/12
        let status: 'AQUISITIVO' | 'CONCESSIVO' | 'VENCIDO' | 'QUITADO' = 'AQUISITIVO'
        
        if (isAfter(today, concessiveEnd)) {
            status = 'VENCIDO'
        } else if (isAfter(today, aquisitivoEnd)) {
            status = 'CONCESSIVO'
        }

        // Proporcionalidade (Se o período ainda não fechou 12 meses)
        if (isAfter(aquisitivoEnd, today)) {
            const monthsWorked = differenceInMonths(today, currentAquisitivoStart)
            days = Math.floor((days / 12) * monthsWorked)
        }

        periods.push({
          startDate: currentAquisitivoStart,
          endDate: aquisitivoEnd,
          concessiveEndDate: concessiveEnd,
          daysOfRight: days,
          absences: absences,
          status
        })

        currentAquisitivoStart = aquisitivoEnd
    }

    return periods
  }

  /**
   * Valida uma solicitação de férias conforme Art. 134 CLT.
   */
  static validateRequest(startDate: Date, endDate: Date, currentBalance: number): ValidationResult {
    const errors: string[] = []
    const daysRequested = differenceInDays(endDate, startDate) + 1

    // 1. Verificação de Período Mínimo (Parcelamento 2017)
    // Uma parte não pode ser inferior a 14 dias calendários e as demais não podem ser inferiores a 5 dias.
    if (daysRequested < 5) {
      errors.push('O período mínimo de férias permitido é de 5 dias.')
    }

    // 2. Bloqueio de Início (Art. 134 § 3º)
    // É vedado o início das férias no período de dois dias que antecede feriado ou dia de descanso semanal remunerado.
    const startWeekDay = getDay(startDate) // 0=Dom, 5=Sex, 6=Sab
    if (startWeekDay === 4 || startWeekDay === 5) {
      errors.push('As férias não podem iniciar em quintas ou sextas-feiras (antecedendo o DSR).')
    }

    // 3. Verificação de Saldo Disponível
    if (daysRequested > currentBalance) {
      errors.push(`Saldo insuficiente. Dias solicitados: ${daysRequested}, Saldo disponível: ${currentBalance}`)
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Tabela Art. 130 CLT
   */
  private static getDaysFromAbsences(absences: number): number {
    if (absences <= 5) return 30
    if (absences <= 14) return 24
    if (absences <= 23) return 18
    if (absences <= 32) return 12
    return 0
  }
}
