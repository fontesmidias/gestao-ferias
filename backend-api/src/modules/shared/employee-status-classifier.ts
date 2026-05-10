/**
 * V3.4 Story 4.11: Single-Source-of-Truth de classificacao de status do
 * Employee. O status e free-form (Tirvu escreve "FERIAS", "AFASTADO INSS",
 * "LICENCA MATERNIDADE", "ATESTADO MEDICO", etc). Classificamos em 4 buckets
 * canonicos para o frontend contar corretamente sem regex duplicada.
 *
 * Antes: regex duplicada em dashboard/index.ts + employees/index.ts (summary).
 * Depois: ambos chamam classifyStatus().
 */

export type StatusBucket = 'ATIVO' | 'FERIAS' | 'AFASTADO' | 'INATIVO'

export function classifyStatus(rawStatus: string | null | undefined): StatusBucket {
  const upper = (rawStatus ?? '').toUpperCase().trim()
  if (upper === 'ATIVO') return 'ATIVO'
  if (/^F[EÉ]RIAS$/.test(upper)) return 'FERIAS'
  if (/AFASTAD|LICEN[ÇC]A|ATESTAD/.test(upper)) return 'AFASTADO'
  if (upper === 'INATIVO' || upper === 'DEMITIDO') return 'INATIVO'
  return 'INATIVO' // fallback: status desconhecido conta como inativo
}

export interface CompositionCounts {
  ATIVO: number
  FERIAS: number
  AFASTADO: number
  INATIVO: number
}

export function emptyComposition(): CompositionCounts {
  return { ATIVO: 0, FERIAS: 0, AFASTADO: 0, INATIVO: 0 }
}

/**
 * Aggrega counts por bucket dado um array `{ status, count }` (resultado
 * tipico de prisma.employee.groupBy({ by: ['status'] })).
 */
export function aggregateComposition(
  rows: Array<{ status: string | null | undefined; count: number }>,
): { composition: CompositionCounts; total: number } {
  const composition = emptyComposition()
  let total = 0
  for (const row of rows) {
    const bucket = classifyStatus(row.status)
    composition[bucket] += row.count
    total += row.count
  }
  return { composition, total }
}
