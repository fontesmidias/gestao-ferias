/**
 * V3.4 FASE D: Helper de normalização de matrícula compartilhado entre
 * importadores (Tirvu, Dexion) e queries de match.
 *
 * Regra de produto (decidida com Bruno em 2026-05-08):
 * - Matrícula é texto, mas pode vir com zeros à esquerda em sistemas externos
 *   (ex: Dexion exporta "001364" às vezes; Tirvu exporta "1364").
 * - Para casamento, comparamos sempre a forma normalizada: zeros à esquerda
 *   removidos, espaços trimados, vazia/null vira null.
 * - Para EXIBIÇÃO, gravamos sempre a forma normalizada (sem zeros à esquerda).
 *   Operador vê "1364" em todo lugar, indepedente da origem.
 */

export function normalizeMatricula(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  if (!str) return null
  // Remove zeros à esquerda mas preserva o resto literal.
  // Casos: "001364" -> "1364", "0" -> "0" (preserva único zero), "ABC123" -> "ABC123".
  const stripped = str.replace(/^0+(?=\d)/, '')
  return stripped
}

/**
 * Para queries Prisma onde precisamos casar com matrícula vinda de fora
 * (Dexion). Como o banco já guarda normalizada, basta normalizar a entrada.
 */
export function matriculaForLookup(value: unknown): string | null {
  return normalizeMatricula(value)
}
