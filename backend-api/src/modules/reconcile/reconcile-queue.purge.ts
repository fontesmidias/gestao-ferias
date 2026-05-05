import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'

const ONE_DAY_MS = 86_400_000
const RETENTION_DAYS_DEFAULT = 90

export interface PurgeOptions {
  retentionDays?: number
  now?: Date
}

export interface PurgeResult {
  deleted: number
  cutoff: Date
  durationMs: number
}

/**
 * Apaga itens da `WorkplaceReconcileQueue` no estado RESOLVED ou IGNORED
 * cujo `resolvedAt` é anterior ao cutoff (default: 90 dias).
 *
 * Apenas a tabela queue é tocada — `AuditLog` é preservado integralmente
 * (NFR-COMP-3: rastreabilidade da operação sobrevive ao purge LGPD).
 *
 * Items em PENDING/DEFERRED nunca são apagados (não têm `resolvedAt`),
 * mas o filtro explícito em `state` é defesa em profundidade.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#FR17
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#NFR-COMP-3
 */
export async function purgeOldQueueItems(
  prisma: PrismaClient,
  opts: PurgeOptions = {},
): Promise<PurgeResult> {
  const days = opts.retentionDays ?? RETENTION_DAYS_DEFAULT
  const baseTime = (opts.now ?? new Date()).getTime()
  const cutoff = new Date(baseTime - days * ONE_DAY_MS)
  const start = Date.now()

  const result = await prisma.workplaceReconcileQueue.deleteMany({
    where: {
      state: { in: ['RESOLVED', 'IGNORED'] },
      resolvedAt: { lt: cutoff },
    },
  })

  return { deleted: result.count, cutoff, durationMs: Date.now() - start }
}

/**
 * Registra cron in-process para purge LGPD diário. No-op se a env flag
 * `RECONCILE_QUEUE_PURGE_ENABLED` não está set como `'true'` (dev/test).
 *
 * Intervalo configurável via `RECONCILE_QUEUE_PURGE_INTERVAL_HOURS` (default 24h).
 */
export function registerReconcileQueuePurge(fastify: FastifyInstance): void {
  if (process.env.RECONCILE_QUEUE_PURGE_ENABLED !== 'true') return

  const intervalH = Number(
    process.env.RECONCILE_QUEUE_PURGE_INTERVAL_HOURS ?? 24,
  )
  const intervalMs = Math.max(1, intervalH) * 60 * 60 * 1000

  const tick = async () => {
    try {
      const r = await purgeOldQueueItems(fastify.prisma)
      fastify.log.info(
        {
          module: 'reconcile',
          event: 'purge_tick',
          deleted: r.deleted,
          durationMs: r.durationMs,
        },
        'reconcile queue purge tick',
      )
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      fastify.log.error(
        {
          module: 'reconcile',
          event: 'purge_failed',
          errorName: e.name,
        },
        'reconcile queue purge failed',
      )
    }
  }

  const timer = setInterval(tick, intervalMs)
  fastify.addHook('onClose', () => {
    clearInterval(timer)
  })
}
