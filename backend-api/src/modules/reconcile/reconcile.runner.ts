import type { PrismaClient } from '@prisma/client'
import { AuditService } from '../shared/audit-service'
import { ReconcileService } from './reconcile.service'
import { ReconcileAuditAction } from './reconcile.types'

export const RECONCILE_BATCH_SIZE = 100

export interface RunInput {
  jobId: string
  tenantId: string
  operatorUserId: string
}

interface Counters {
  matched: number
  queued: number
  ignored: number
  errors: number
}

/**
 * Executa o loop em batches do reconcile sobre um ReconcileJob recém-criado
 * em status RUNNING. Recebe o jobId pronto (rota cria; runner apenas processa
 * e finaliza estado).
 *
 * Resiliência: erro por employee é capturado e contado em `errors` — não
 * interrompe o batch (NFR-REL-2). Exceção fatal externa marca FAILED.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export class ReconcileRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly service: ReconcileService,
  ) {}

  async run(input: RunInput): Promise<void> {
    const startedAt = Date.now()
    const counters: Counters = { matched: 0, queued: 0, ignored: 0, errors: 0 }
    let lastFailureReason: string | null = null

    const jobBefore = await this.prisma.reconcileJob.findFirstOrThrow({
      where: { id: input.jobId, tenantId: input.tenantId },
    })

    try {
      const total = await this.prisma.employee.count({
        where: { tenantId: input.tenantId, status: { not: 'INATIVO' } },
      })
      await this.prisma.reconcileJob.update({
        where: { id: input.jobId },
        data: { totalEmployees: total },
      })

      let cursor: string | undefined
      while (true) {
        const batch = await this.prisma.employee.findMany({
          where: { tenantId: input.tenantId, status: { not: 'INATIVO' } },
          orderBy: { id: 'asc' },
          take: RECONCILE_BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true },
        })
        if (batch.length === 0) break

        const batchStart = Date.now()
        for (const emp of batch) {
          try {
            const r = await this.service.runSingle({
              tenantId: input.tenantId,
              employeeId: emp.id,
              reconcileJobId: input.jobId,
              operatorUserId: input.operatorUserId,
            })
            switch (r.outcome) {
              case 'matched_deterministic':
                counters.matched++
                break
              case 'queued_ambiguous':
              case 'queued_low_confidence':
              case 'queued_no_match':
                counters.queued++
                break
              case 'skipped':
              case 'skipped_inactive':
              case 'no_legacy':
                counters.ignored++
                break
            }
          } catch (e) {
            counters.errors++
            const err = e instanceof Error ? e : new Error(String(e))
            lastFailureReason = err.message.slice(0, 500)
            // Log estruturado JSON sem PII (NFR-SEC-4, NFR-OBS-1).
            console.warn(
              JSON.stringify({
                module: 'reconcile',
                event: 'employee_failed',
                tenantId: input.tenantId,
                jobId: input.jobId,
                employeeId: emp.id,
                errorName: err.name,
              }),
            )
          }
        }

        await this.prisma.reconcileJob.update({
          where: { id: input.jobId },
          data: { ...counters, failureReason: lastFailureReason },
        })
        console.info(
          JSON.stringify({
            module: 'reconcile',
            event: 'batch_completed',
            tenantId: input.tenantId,
            jobId: input.jobId,
            batchSize: batch.length,
            ...counters,
            durationMs: Date.now() - batchStart,
          }),
        )

        cursor = batch[batch.length - 1].id
        if (batch.length < RECONCILE_BATCH_SIZE) break
      }

      const completed = await this.prisma.reconcileJob.update({
        where: { id: input.jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          ...counters,
          failureReason: lastFailureReason,
        },
      })

      await AuditService.log(this.prisma, {
        tenantId: input.tenantId,
        userId: input.operatorUserId,
        action: ReconcileAuditAction.RECONCILE,
        resourceId: input.jobId,
        resourceType: 'RECONCILE_JOB',
        previousData: jobBefore as unknown as object,
        newData: completed as unknown as object,
      })
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      const failed = await this.prisma.reconcileJob.update({
        where: { id: input.jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          failureReason: err.message.slice(0, 500),
          ...counters,
        },
      })
      await AuditService.log(this.prisma, {
        tenantId: input.tenantId,
        userId: input.operatorUserId,
        action: ReconcileAuditAction.RECONCILE,
        resourceId: input.jobId,
        resourceType: 'RECONCILE_JOB',
        previousData: jobBefore as unknown as object,
        newData: failed as unknown as object,
      })
    }
  }
}
