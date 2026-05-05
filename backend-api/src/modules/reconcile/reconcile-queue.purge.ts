/**
 * Cron in-process para purge LGPD: remove itens RESOLVED/IGNORED há > 90 dias.
 * Ativado via env flag RECONCILE_QUEUE_PURGE_ENABLED=true em produção.
 *
 * Implementação real virá na Story 3.2.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#FR17
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#NFR-COMP-3
 */
export function registerReconcileQueuePurge(): void {
  // TODO Story 3.2: registrar cron diário (3h UTC) que apaga
  // itens com state IN ('RESOLVED','IGNORED') AND resolved_at < now - 90 days.
  // Auditoria preservada (apenas tabela queue é purgada).
}
