/**
 * Mascara CPF mostrando apenas posições intermediárias.
 * Input aceita formatos com/sem pontuação. Output sempre `***.NNN.NN-XX`.
 * Se input inválido (não tem 11 dígitos), retorna o original (failsafe).
 */
export function maskCpf(input: string | null | undefined): string {
  if (!input) return '—'
  const digits = String(input).replace(/\D/g, '')
  if (digits.length !== 11) return String(input)
  // Mostra dígitos 4-6 e 7-8, mascara o resto.
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 8)}-XX`
}
