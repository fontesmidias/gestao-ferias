import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'

export interface TransitionResult {
  toActive: number
  toCompleted: number
  durationMs: number
  ranAt: Date
}

/**
 * V3.4 FASE H2/H3: transicao automatica de CoverageAssignment.status conforme datas.
 *
 * - PLANNED -> ACTIVE quando startDate <= now AND endDate >= now
 * - PLANNED|ACTIVE -> COMPLETED quando endDate < now
 *
 * Sem AuditLog (transicao deterministica). Reversivel via PATCH /coverages/:id.
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
  return { toActive: a.count, toCompleted: c.count, durationMs: Date.now() - start, ranAt: now }
}

async function loadConfig(prisma: PrismaClient) {
  const cfg = await prisma.systemConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
    select: {
      coverageCronEnabled: true,
      coverageCronIntervalHours: true,
      coverageCronLastRunAt: true,
      coverageCronLastResult: true,
    },
  })
  return cfg
}

async function persistResult(prisma: PrismaClient, r: TransitionResult): Promise<void> {
  await prisma.systemConfig.update({
    where: { id: 'singleton' },
    data: {
      coverageCronLastRunAt: r.ranAt,
      coverageCronLastResult: { toActive: r.toActive, toCompleted: r.toCompleted, durationMs: r.durationMs },
    },
  })
}

/**
 * Roda uma vez e persiste resultado em SystemConfig. Usado pelo cron e pelo
 * botao "Rodar agora" do front.
 */
export async function runCoverageCronOnce(fastify: FastifyInstance): Promise<TransitionResult> {
  const r = await transitionCoverageStatuses(fastify.prisma)
  await persistResult(fastify.prisma, r)
  if (r.toActive > 0 || r.toCompleted > 0) {
    fastify.log.info(
      { module: 'coverage', event: 'status_tick', toActive: r.toActive, toCompleted: r.toCompleted, durationMs: r.durationMs },
      'coverage status transitions applied',
    )
  }
  return r
}

/**
 * Registra cron in-process configurado via SystemConfig (DB).
 * Default: enabled=true, intervalo=6h.
 *
 * O scheduler le SystemConfig a cada tick para respeitar mudancas em runtime
 * (sem reboot). Se enabled=false, o tick e no-op.
 */
export function registerCoverageStatusCron(fastify: FastifyInstance): void {
  // No-op em test: setInterval mantem event loop vivo e trava `node --test`.
  if (process.env.NODE_ENV === 'test') return

  // Catch-up no boot (assincrono).
  void (async () => {
    try {
      const cfg = await loadConfig(fastify.prisma)
      if (cfg.coverageCronEnabled) {
        await runCoverageCronOnce(fastify)
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      fastify.log.error({ module: 'coverage', event: 'cron_boot_failed', errorName: e.name }, 'coverage cron boot failed')
    }
  })()

  // Heartbeat fixo a cada 15 min: respeita config dinamica (intervalo + enabled).
  // Como persistimos lastRunAt, decidimos rodar se delta >= intervalo.
  const HEARTBEAT_MS = 15 * 60 * 1000

  const tick = async () => {
    try {
      const cfg = await loadConfig(fastify.prisma)
      if (!cfg.coverageCronEnabled) return
      const intervalMs = Math.max(1, cfg.coverageCronIntervalHours) * 60 * 60 * 1000
      const last = cfg.coverageCronLastRunAt ? cfg.coverageCronLastRunAt.getTime() : 0
      if (Date.now() - last < intervalMs) return
      await runCoverageCronOnce(fastify)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      fastify.log.error({ module: 'coverage', event: 'cron_tick_failed', errorName: e.name }, 'coverage cron tick failed')
    }
  }

  const timer = setInterval(tick, HEARTBEAT_MS)
  // unref para nao manter event loop vivo se app.close() nao for chamado
  if (typeof timer.unref === 'function') timer.unref()
  fastify.addHook('onClose', () => {
    clearInterval(timer)
  })
}
