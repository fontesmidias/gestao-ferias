import type { PrismaClient } from '@prisma/client'

/**
 * Orquestra reconcile single-tenant e (Phase 2) batch super-admin.
 * Cria ReconcileJob, delega execução ao Runner, retorna jobId.
 *
 * Implementação real virá na Story 1.5 (single-tenant) e Story 4.1 (batch super-admin).
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D7
 */
export class ReconcileService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Disparar reconcile single-tenant.
   * Implementação real virá na Story 1.5.
   */
  async runSingle(_input: { tenantId: string; operatorUserId: string }): Promise<{
    jobId: string
  }> {
    void this.prisma
    void _input
    throw new Error('ReconcileService.runSingle() not implemented yet — Story 1.5')
  }
}
