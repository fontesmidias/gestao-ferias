import { Prisma, type PrismaClient } from '@prisma/client'
import { AuditService } from '../shared/audit-service'
import type { UpsertResult } from '../reconcile/reconcile.types'

export interface UpsertFromImportInput {
  tenantId: string
  employeeId: string
  /** ID do operador humano (USER) que dispara a operação. Necessário para AuditLog. */
  operatorUserId: string
  workplacePositionId: string
  /** Data de início da allocation (tipicamente Employee.hireDate — preserva CLT NFR-COMP-1). */
  startDate: Date
  /**
   * AuditLog action a registrar. Valores válidos:
   *   'V3.3_RECONCILE' | 'IMPORT_TIRVU_ALLOCATE' | 'RECONCILE_QUEUE_RESOLVE' | etc.
   * Ver ReconcileAuditAction em reconcile.types.ts.
   */
  source: string
}

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
 * Comportamento:
 * - Sem allocation ACTIVE → cria nova → 'created' + AuditLog
 * - Allocation ACTIVE no mesmo posto → 'noop' (sem auditoria)
 * - Allocation ACTIVE em posto diferente → encerra anterior + cria nova → 'replaced' + AuditLog
 * - P2002 (race UNIQUE) → busca existente + retorna 'noop'
 *
 * Garante:
 *   - Idempotência forte (UNIQUE partial em workplace_allocations + check aplicacional — D2)
 *   - CLT (startDate vem do caller, tipicamente Employee.hireDate — NFR-COMP-1)
 *   - Encerramento de allocation antiga em transição de posto, sem DELETE (FR23, NFR-COMP-2)
 *   - AuditLog em cada gravação com previousData/newData (FR36)
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D2
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#Enforcement-Guidelines
 */
export class WorkplaceAllocationService {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertFromImport(input: UpsertFromImportInput): Promise<UpsertResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workplaceAllocation.findFirst({
        where: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          status: 'ACTIVE',
        },
      })

      // Branch 1: mesma posição → no-op (idempotência forte, sem audit)
      if (existing && existing.workplacePositionId === input.workplacePositionId) {
        return { kind: 'noop' as const, allocationId: existing.id }
      }

      // Branch 2: posição diferente → encerrar anterior + criar nova
      if (existing && existing.workplacePositionId !== input.workplacePositionId) {
        const closedAt = new Date()
        const closed = await tx.workplaceAllocation.update({
          where: { id: existing.id },
          data: { status: 'ENDED', endDate: closedAt, updatedAt: closedAt },
        })

        const created = await tx.workplaceAllocation.create({
          data: {
            tenantId: input.tenantId,
            employeeId: input.employeeId,
            workplacePositionId: input.workplacePositionId,
            startDate: input.startDate,
            status: 'ACTIVE',
          },
        })

        await AuditService.log(tx as unknown as PrismaClient, {
          tenantId: input.tenantId,
          userId: input.operatorUserId,
          action: input.source,
          resourceId: created.id,
          resourceType: 'WORKPLACE_ALLOCATION',
          previousData: closed as unknown as object,
          newData: created as unknown as object,
        })

        return {
          kind: 'replaced' as const,
          allocationId: created.id,
          previousAllocationId: existing.id,
        }
      }

      // Branch 3: sem allocation existente → criar nova; capturar P2002 como rede de segurança
      try {
        const created = await tx.workplaceAllocation.create({
          data: {
            tenantId: input.tenantId,
            employeeId: input.employeeId,
            workplacePositionId: input.workplacePositionId,
            startDate: input.startDate,
            status: 'ACTIVE',
          },
        })

        await AuditService.log(tx as unknown as PrismaClient, {
          tenantId: input.tenantId,
          userId: input.operatorUserId,
          action: input.source,
          resourceId: created.id,
          resourceType: 'WORKPLACE_ALLOCATION',
          previousData: null,
          newData: created as unknown as object,
        })

        return { kind: 'created' as const, allocationId: created.id }
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Race condition: outra transação criou primeiro. Idempotência: retorna noop.
          const racedExisting = await tx.workplaceAllocation.findFirst({
            where: {
              tenantId: input.tenantId,
              employeeId: input.employeeId,
              workplacePositionId: input.workplacePositionId,
              status: 'ACTIVE',
            },
          })
          if (!racedExisting) throw err // estado inconsistente — propaga
          return { kind: 'noop' as const, allocationId: racedExisting.id }
        }
        throw err
      }
    })
  }
}
