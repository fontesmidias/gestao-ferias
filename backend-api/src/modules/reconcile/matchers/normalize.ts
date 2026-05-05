/**
 * Normalização canônica para matching de Workplace.name.
 *
 * Aplica em ordem: NFC + lowercase + trim + collapse de whitespace.
 * Função pura, idempotente.
 *
 * Implementação real virá na Story 1.3.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export function normalize(s: string): string {
  // TODO Story 1.3: implementar NFC + lower + trim + collapse de whitespace
  void s
  throw new Error('normalize() not implemented yet — Story 1.3')
}
