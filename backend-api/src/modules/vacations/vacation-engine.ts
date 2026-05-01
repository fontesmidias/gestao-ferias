import { differenceInMonths, addYears, isAfter, startOfDay, getDay, differenceInDays } from 'date-fns'
import type { HolidayResolver } from '../holidays/holiday-resolver'

export interface VacationPeriod {
  startDate: Date;
  endDate: Date;
  concessiveEndDate: Date;
  daysOfRight: number;
  absences: number;
  status: 'AQUISITIVO' | 'CONCESSIVO' | 'VENCIDO' | 'QUITADO';
}

export type LegalBlockCode =
  | 'LEGAL_BLOCK_MIN_PERIOD'
  | 'LEGAL_BLOCK_INSUFFICIENT_BALANCE'
  | 'LEGAL_BLOCK_SUNDAY'
  | 'LEGAL_BLOCK_HOLIDAY_NATIONAL'
  | 'LEGAL_BLOCK_HOLIDAY_STATE'
  | 'LEGAL_BLOCK_HOLIDAY_MANUAL'
  | 'LEGAL_BLOCK_HOLIDAY_EVE'
  | 'LEGAL_BLOCK_FIRST_FRACTION_TOO_SHORT'
  | 'LEGAL_BLOCK_FRACTION_TOO_SHORT'
  | 'LEGAL_BLOCK_TOO_MANY_FRACTIONS'
  | 'LEGAL_BLOCK_TOTAL_EXCEEDS_PERIOD_DAYS'

export interface ValidationError {
  code: LegalBlockCode
  message: string
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[]; // legacy: lista de mensagens
  errorDetails?: ValidationError[]; // novo: códigos estruturados
}

/**
 * Fração de férias já existente no período aquisitivo do colaborador.
 * Usada para validar regras de fracionamento (CLT Art. 134 §1º).
 */
export interface ExistingFraction {
  startDate: Date
  endDate: Date
  days: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'SIGNED' | 'COMPLETED' | string
}

/** Retorno da análise de fracionamento — usado pelo frontend para guiar o usuário. */
export interface FractioningAnalysis {
  fractionsUsed: number      // frações ativas (não rejeitadas)
  daysUsed: number           // soma de dias das frações ativas
  daysRemaining: number      // saldo restante neste aquisitivo
  hasFractionWith14Plus: boolean  // já existe pelo menos uma fração ≥14 dias
  maxFractionsAllowed: number     // 3 (CLT)
  nextRequestMinDays: number      // mínimo permitido para a PRÓXIMA solicitação
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
   * Valida regras síncronas: domingo + saldo + fracionamento (CLT Art. 134 §1º Lei 13.467/2017).
   *
   * Regras de fracionamento (passa `existingFractions` + `periodDaysOfRight` para ativar):
   *  - Até 3 frações por período aquisitivo
   *  - Pelo menos UMA das frações deve ter ≥14 dias corridos
   *  - As demais frações devem ter ≥5 dias corridos
   *  - A soma das frações não pode exceder o direito do período aquisitivo
   *
   * Sem `existingFractions`, validação é simplificada (mínimo 5 dias).
   * Use validateRequestFull() para validação completa incluindo feriados.
   */
  static validateRequest(
    startDate: Date,
    endDate: Date,
    currentBalance: number,
    fractionContext?: {
      existingFractions: ExistingFraction[]   // outras solicitações no mesmo aquisitivo (PENDING/APPROVED/SIGNED/COMPLETED)
      periodDaysOfRight: number               // direito total do aquisitivo (geralmente 30)
    }
  ): ValidationResult {
    const errorDetails: ValidationError[] = []
    const daysRequested = differenceInDays(endDate, startDate) + 1

    // 1. Saldo disponível
    if (daysRequested > currentBalance) {
      errorDetails.push({
        code: 'LEGAL_BLOCK_INSUFFICIENT_BALANCE',
        message: `Saldo insuficiente. Dias solicitados: ${daysRequested}, Saldo disponível: ${currentBalance}`
      })
    }

    // 2. Bloqueio de início em domingo (Art. 134 § 3º — DSR)
    if (getDay(startDate) === 0) {
      errorDetails.push({
        code: 'LEGAL_BLOCK_SUNDAY',
        message: 'Início de férias não pode cair em domingo (CLT Art. 134 § 3º).'
      })
    }

    // 3. Regras de fracionamento (Art. 134 §1º Lei 13.467/2017)
    if (fractionContext) {
      const { existingFractions, periodDaysOfRight } = fractionContext
      const active = existingFractions.filter(f => f.status !== 'REJECTED')
      const fractionsAfterThis = active.length + 1
      const hasFractionWith14Plus = active.some(f => f.days >= 14) || daysRequested >= 14
      const totalDaysAfterThis = active.reduce((s, f) => s + f.days, 0) + daysRequested

      // 3.1 Soma das frações não pode exceder direito do aquisitivo
      if (totalDaysAfterThis > periodDaysOfRight) {
        errorDetails.push({
          code: 'LEGAL_BLOCK_TOTAL_EXCEEDS_PERIOD_DAYS',
          message: `A soma das frações (${totalDaysAfterThis} dias) ultrapassa o direito do período aquisitivo (${periodDaysOfRight} dias).`
        })
      }

      // 3.2 Limite de 3 frações
      if (fractionsAfterThis > 3) {
        errorDetails.push({
          code: 'LEGAL_BLOCK_TOO_MANY_FRACTIONS',
          message: `Máximo de 3 frações por período aquisitivo (CLT Art. 134 §1º). Você já tem ${active.length}.`
        })
      }

      // 3.3 Se ainda não há nenhuma fração ≥14 dias, ESTA solicitação tem que ser ≥14
      if (!hasFractionWith14Plus) {
        errorDetails.push({
          code: 'LEGAL_BLOCK_FIRST_FRACTION_TOO_SHORT',
          message: `A primeira fração de férias deve ter no mínimo 14 dias corridos (CLT Art. 134 §1º). Solicitado: ${daysRequested} dias.`
        })
      } else if (daysRequested < 5) {
        // 3.4 Demais frações ≥5 dias
        errorDetails.push({
          code: 'LEGAL_BLOCK_FRACTION_TOO_SHORT',
          message: `Frações além da primeira devem ter no mínimo 5 dias corridos (CLT Art. 134 §1º). Solicitado: ${daysRequested} dias.`
        })
      }
    } else {
      // Sem contexto de fracionamento: mínimo absoluto 5 dias
      if (daysRequested < 5) {
        errorDetails.push({
          code: 'LEGAL_BLOCK_MIN_PERIOD',
          message: 'O período mínimo de férias permitido é de 5 dias.'
        })
      }
    }

    return {
      isValid: errorDetails.length === 0,
      errors: errorDetails.map(e => e.message),
      errorDetails
    }
  }

  /**
   * Analisa o estado de fracionamento de um colaborador no período aquisitivo
   * para guiar o frontend (mostrar saldo, mínimo da próxima solicitação, etc.).
   */
  static analyzeFractioning(
    existingFractions: ExistingFraction[],
    periodDaysOfRight: number
  ): FractioningAnalysis {
    const active = existingFractions.filter(f => f.status !== 'REJECTED')
    const daysUsed = active.reduce((s, f) => s + f.days, 0)
    const daysRemaining = Math.max(0, periodDaysOfRight - daysUsed)
    const hasFractionWith14Plus = active.some(f => f.days >= 14)

    let nextRequestMinDays: number
    if (!hasFractionWith14Plus) {
      // Próxima TEM que ser ≥14 (a menos que reste menos que isso, situação de erro consistência)
      nextRequestMinDays = Math.min(14, daysRemaining)
    } else {
      nextRequestMinDays = Math.min(5, daysRemaining)
    }

    return {
      fractionsUsed: active.length,
      daysUsed,
      daysRemaining,
      hasFractionWith14Plus,
      maxFractionsAllowed: 3,
      nextRequestMinDays
    }
  }

  /**
   * Validação completa incluindo feriados (nacional, estadual, manual + véspera).
   * Requer HolidayResolver e tenantId para resolver feriados aplicáveis.
   * CLT Art. 134 § 3º.
   */
  static async validateRequestFull(
    startDate: Date,
    endDate: Date,
    currentBalance: number,
    opts: {
      tenantId: string
      resolver: HolidayResolver
      fractionContext?: { existingFractions: ExistingFraction[]; periodDaysOfRight: number }
    }
  ): Promise<ValidationResult> {
    const base = this.validateRequest(startDate, endDate, currentBalance, opts.fractionContext)
    const errorDetails: ValidationError[] = base.errorDetails ? [...base.errorDetails] : []

    // 4. Feriado no dia de início
    const holidayHit = await opts.resolver.isHoliday(startDate, opts.tenantId)
    if (holidayHit) {
      const codeMap: Record<string, LegalBlockCode> = {
        NATIONAL: 'LEGAL_BLOCK_HOLIDAY_NATIONAL',
        STATE: 'LEGAL_BLOCK_HOLIDAY_STATE',
        MANUAL: 'LEGAL_BLOCK_HOLIDAY_MANUAL',
      }
      errorDetails.push({
        code: codeMap[holidayHit.source],
        message: `Início de férias não pode cair em feriado: ${holidayHit.name} (CLT Art. 134 § 3º).`
      })
    }

    // 5. Véspera de feriado
    const eveHit = await opts.resolver.isHolidayEve(startDate, opts.tenantId)
    if (eveHit) {
      errorDetails.push({
        code: 'LEGAL_BLOCK_HOLIDAY_EVE',
        message: `Início de férias não pode cair na véspera do feriado "${eveHit.name}" (CLT Art. 134 § 3º).`
      })
    }

    return {
      isValid: errorDetails.length === 0,
      errors: errorDetails.map(e => e.message),
      errorDetails
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
