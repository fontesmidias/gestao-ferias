/**
 * Formata duração em ms para texto curto pt-BR.
 *  - < 1s        → "0s"
 *  - < 60s       → "Xs"
 *  - < 60min     → "Xm Ys"
 *  - >= 60min    → "Xh Ym"
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Calcula ETA em ms. Retorna null se não há dados suficientes. */
export function estimateRemainingMs(
  elapsedMs: number,
  processed: number,
  total: number,
): number | null {
  if (processed <= 0 || total <= 0 || elapsedMs <= 0) return null
  if (processed >= total) return 0
  const rate = elapsedMs / processed // ms por linha
  return Math.round(rate * (total - processed))
}
