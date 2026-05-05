import type { PrismaClient } from '@prisma/client'

/**
 * CRUD da WorkplaceReconcileQueue + ações de resolução (link/create/defer/ignore).
 * Centraliza auditoria e transição de estado.
 *
 * Implementação real virá na Story 1.4.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D1
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#FR13-FR19
 */
export class ReconcileQueueService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Enfileira um item de revisão (não-match ou ambiguidade).
   * Implementação real virá na Story 1.4.
   */
  async enqueue(_input: {
    tenantId: string
    reconcileJobId: string
    employeeId: string
    workplaceNameRaw: string
    suggestions?: unknown
  }): Promise<{ id: string }> {
    void this.prisma
    void _input
    throw new Error('ReconcileQueueService.enqueue() not implemented yet — Story 1.4')
  }
}
