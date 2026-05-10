// V3.4 Story 4.13: classifier compartilhado no frontend (espelha backend
// modules/shared/employee-status-classifier.ts). Garante que badges, chips
// e contadores usem a mesma logica em qualquer pagina.

export type StatusBucket = 'ATIVO' | 'FERIAS' | 'AFASTADO' | 'INATIVO'

export function classifyStatus(rawStatus: string | null | undefined): StatusBucket {
  const upper = (rawStatus ?? '').toUpperCase().trim()
  if (upper === 'ATIVO') return 'ATIVO'
  if (/^F[EÉ]RIAS$/.test(upper)) return 'FERIAS'
  if (/AFASTAD|LICEN[ÇC]A|ATESTAD/.test(upper)) return 'AFASTADO'
  if (upper === 'INATIVO' || upper === 'DEMITIDO') return 'INATIVO'
  return 'INATIVO'
}

export const BUCKET_STYLES: Record<StatusBucket, { dot: string; bg: string; text: string; border: string; label: string }> = {
  ATIVO:    { dot: 'bg-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'ATIVO' },
  FERIAS:   { dot: 'bg-sky-500',     bg: 'bg-sky-500/20',     text: 'text-sky-400',     border: 'border-sky-500/30',     label: 'FÉRIAS' },
  AFASTADO: { dot: 'bg-amber-500',   bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/30',   label: 'AFASTADO' },
  INATIVO:  { dot: 'bg-rose-500',    bg: 'bg-rose-500/15',    text: 'text-rose-300',    border: 'border-rose-500/30',    label: 'INATIVO' },
}
