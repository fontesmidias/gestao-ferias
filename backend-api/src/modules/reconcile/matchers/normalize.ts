/**
 * Normalização canônica para matching de Workplace.name.
 *
 * Aplica em ordem: NFC + lowercase + trim + collapse de whitespace múltiplo.
 * Função pura, idempotente: normalize(normalize(x)) === normalize(x).
 *
 * Usar SEMPRE antes de comparar nomes de workplace — comparações ad-hoc
 * (ex.: `a.toLowerCase() === b.toLowerCase()`) são proibidas (Enforcement #8).
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export function normalize(s: string): string {
  return s
    .normalize('NFC')      // NFC: combinar diacríticos canonicamente
    .toLowerCase()         // case-insensitive
    .trim()                // remove whitespace leading/trailing
    .replace(/\s+/g, ' ')  // collapse de whitespace múltiplo (inclui \t \n)
}
