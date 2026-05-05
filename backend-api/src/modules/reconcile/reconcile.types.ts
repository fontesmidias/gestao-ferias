import type { Workplace } from '@prisma/client'

/**
 * Tipos compartilhados do módulo reconcile (V3.3).
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D1
 */

export type MatchResult =
  | { kind: 'unique'; workplace: Pick<Workplace, 'id' | 'name'> }
  | { kind: 'ambiguous'; candidates: Array<Pick<Workplace, 'id' | 'name'>> }
  | { kind: 'none' }

export type Suggestion = {
  id: string
  name: string
  score: number
}

export type UpsertResult =
  | { kind: 'noop'; allocationId: string }
  | { kind: 'created'; allocationId: string }
  | { kind: 'replaced'; allocationId: string; previousAllocationId: string }

export type ReconcileSummary = {
  jobId: string
  tenantId: string
  matched: number
  queued: number
  ignored: number
  errors: number
  durationMs: number
}

export type BatchResult = {
  batchParentId: string
  results: Array<{
    tenantId: string
    status: 'ok' | 'failed'
    jobId?: string
    error?: string
  }>
}

/**
 * Action enum values gravados em AuditLog para operações V3.3.
 * Mantido como const para permitir narrowing.
 */
export const ReconcileAuditAction = {
  RECONCILE: 'V3.3_RECONCILE',
  RECONCILE_BATCH: 'V3.3_RECONCILE_BATCH',
  IMPORT_TIRVU_ALLOCATE: 'IMPORT_TIRVU_ALLOCATE',
  RECONCILE_QUEUE_RESOLVE: 'RECONCILE_QUEUE_RESOLVE',
  RECONCILE_QUEUE_DEFER: 'RECONCILE_QUEUE_DEFER',
  RECONCILE_QUEUE_IGNORE: 'RECONCILE_QUEUE_IGNORE',
} as const

export type ReconcileAuditActionValue =
  (typeof ReconcileAuditAction)[keyof typeof ReconcileAuditAction]

/**
 * Outcome do `ReconcileService.runSingle` — discriminated union.
 * Story 1.5.
 */
export type RunSingleOutcome =
  | {
      outcome: 'matched_deterministic'
      workplaceId: string
      allocationKind: 'noop' | 'created' | 'replaced'
    }
  | { outcome: 'queued_ambiguous' }
  | { outcome: 'queued_low_confidence' }
  | { outcome: 'queued_no_match' }
  | { outcome: 'skipped' }
  | { outcome: 'skipped_inactive' }
  | { outcome: 'no_legacy' }

/** Score mínimo para considerar uma sugestão fuzzy "low confidence" (vs. "no match"). */
export const FUZZY_LOW_CONFIDENCE_THRESHOLD = 0.7
