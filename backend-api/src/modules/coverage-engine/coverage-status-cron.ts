import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'

export interface TransitionResult {
  toActive: number
  toCompleted: number
  durationMs: number
}

/**
 * V3.4 FASE H2: transicao automatica de CoverageAssignment.status conforme datas.
 *
 * Regras (cron determinista, sem AuditLog porque nao ha usuario humano):
 * - PLANNED -> ACTIVE quando startDate <= now AND endDate >= now
 * - PLANNED|ACTIVE -> COMPLETED quando endDate < now
 *
 * Operador pode reverter via PATCH /coverages/:id se a transicao automatica
 * estiver errada (ex: cobertura cancelada antes de comecar).
 */
export async function transitionCoverageStatuses(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<TransitionResult> {
  const start = Date.now()
  const a = await prisma.coverageAssignment.updateMany({
    where: { status: 'PLANNED', startDate: { lte: now }, endDate: { gte: now } },
    data: { status: 'ACTIVE' },
  })
  const c = await prisma.coverageAssignment.updateMany({
    where: { status: { in: ['PLANNED', 'ACTIVE'] }, endDate: { lt: now } },
    data: { status: 'COMPLETED' },
  })
  return { toActive: a.count, toCompleted: c.count, durationMs: Date.now() - start }
}

/**
 * Registra cron in-process. Default: enabled, intervalo 6h.
 * Desabilitar com COVERAGE_STATUS_CRON_ENABLED=false.
 * Ajustar via COVERAGE_STATUS_CRON_INTERVAL_HOURS (default 6).
 *
 * Roda uma vez no boot para "catch up" antes do primeiro tick periodico.
 */
export function registerCoverageStatusCron(fastify: FastifyInstance): void {
  if (process.env.COVERAGE_STATUS_CRON_ENABLED === 'false') return

  const intervalH = Number(process.env.COVERAGE_STATUS_CRON_INTERVAL_HOURS ?? 6)
  const intervalMs = Math.max(1, intervalH) * 60 * 60 * 1000

  const tick = async () => {
    try {
      const r = await transitionCoverageStatuses(fastify.prisma)
      if (r.toActive > 0 || r.toCompleted > 0) {
        fastify.log.info(
          { module: 'coverage', event: 'status_tick', toActive: r.toActive, toCompleted: r.toCompleted, durationMs: r.durationMs },
          'coverage status transitions applied',
        )
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      fastify.log.error(
        { module: 'coverage', event: 'status_tick_failed', errorName: e.name, errorMessage: e.message },
        'coverage status cron tick failed',
      )
    }
  }

  // Catch-up no boot (assincrono — nao bloqueia ready).
  void tick()

  const timer = setInterval(tick, intervalMs)
  fastify.addHook('onClose', () => {
    clearInterval(timer)
  })
}
