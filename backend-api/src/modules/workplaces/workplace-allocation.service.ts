import type { PrismaClient } from '@prisma/client'
import type { UpsertResult } from '../reconcile/reconcile.types'

/**
 * ÚNICO point-of-write para WorkplaceAllocation a partir de import ou reconcile.
 * Codifica Enforcement #1 da arquitetura V3.3.
 *
 * Toda gravação de WorkplaceAllocation originada de:
 *   - importer Tirvu (Story 2.1)
 *   - importer Postos / auto-criação de WorkplacePosition padrão (Story 2.3)
 *   - ReconcileService/Runner (Story 1.5)
 *   - ReconcileQueueService.resolve (Story 1.4)
 * DEVE passar por upsertFromImport().
 *
 * Garante:
 *   - Idempotência forte (UNIQUE partial em workplace_allocations + check aplicacional — D2)
 *   - CLT (startDate vem do caller, tipicamente Employee.hireDate — NFR-COMP-1)
 *   - Encerramento de allocation antiga em transição de posto, sem DELETE (FR23, NFR-COMP-2)
 *   - AuditLog em cada gravação com previousData/newData (FR36)
 *
 * Implementação real virá na Story 1.2.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D2
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#Enforcement-Guidelines
 */
export class WorkplaceAllocationService {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertFromImport(input: {
    tenantId: string
    employeeId: string
    workplacePositionId: string
    startDate: Date
    /**
     * AuditLog action a registrar. Valores válidos:
     *   'V3.3_RECONCILE' | 'IMPORT_TIRVU_ALLOCATE' | 'RECONCILE_QUEUE_RESOLVE'
     * Ver ReconcileAuditAction em reconcile.types.ts.
     */
    source: string
  }): Promise<UpsertResult> {
    void this.prisma
    void input
    throw new Error(
      'WorkplaceAllocationService.upsertFromImport() not implemented yet — Story 1.2',
    )
  }
}
