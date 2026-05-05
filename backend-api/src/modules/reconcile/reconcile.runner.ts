import type { PrismaClient } from '@prisma/client'

/**
 * Executa reconcile em batches transacionais in-process (não BullMQ na Phase 1).
 * Atualiza ReconcileJob.matched/queued/ignored/errors a cada batch.
 *
 * Batches transacionais curtos (RECONCILE_BATCH_SIZE = 100 employees) garantem
 * online sem manutenção e crash-safety.
 *
 * Implementação real virá na Story 1.5.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D7
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#NFR-PERF-1
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#NFR-REL-2
 */
export class ReconcileRunner {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Executar o loop de batches do reconcile sobre um ReconcileJob existente.
   * Implementação real virá na Story 1.5.
   */
  async run(_jobId: string): Promise<void> {
    void this.prisma
    void _jobId
    throw new Error('ReconcileRunner.run() not implemented yet — Story 1.5')
  }
}

export const RECONCILE_BATCH_SIZE = 100
