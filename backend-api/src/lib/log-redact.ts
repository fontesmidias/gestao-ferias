// Pino redact paths + censor function (Story 5.2 — LGPD log sanitization).
//
// Aplicado globalmente em opts.logger (app.ts). Remove/mascara dados sensíveis
// ANTES da emissão de qualquer log do servidor — defesa em camadas para que
// PII jamais vaze para Datadog/Papertrail/stdout em prod.
//
// Wildcards Pino:
//  - 'foo'       → top-level
//  - '*.foo'     → 1 nível de nesting
//  - '*.*.foo'   → 2 níveis (Pino aceita)
// Para nesting profundo (>3), Pino usa pattern explícito por path. Como nossos
// dados raramente passam de 3 níveis em logs (req.body.employee.bankData),
// cobrimos top-level + 1-2 níveis.

const SENSITIVE_FIELDS = [
  'bankData',
  'chavePix',
  'agencia',
  'conta',
  'banco',
  'tipoPix',
  'tipoConta',
  'cpf',
  'rg',
  'pisPasep',
  'bankDataEnc',
  'bankDataIv',
  'bankDataTag',
] as const

// Gera paths em múltiplos níveis para cada campo sensível.
//
// Pino sintaxe importante:
//  - 'foo'        → top-level chave de objeto
//  - '*.foo'      → 1 nível, qualquer chave de objeto
//  - '[*].foo'    → 1 nível dentro de array
//  - '*[*].foo'   → 2 níveis: chave → array → foo
// Sem cobertura de arrays, logs como `{rows: [{cpf}]}` VAZAM o cpf raw.
function buildPaths(): string[] {
  const out = new Set<string>()
  for (const f of SENSITIVE_FIELDS) {
    out.add(f)
    // Object nesting (até 4 níveis).
    out.add(`*.${f}`)
    out.add(`*.*.${f}`)
    out.add(`*.*.*.${f}`)
    // Array nesting (top-level array + 1-3 níveis nested).
    out.add(`[*].${f}`)
    out.add(`*[*].${f}`)
    out.add(`*.*[*].${f}`)
    out.add(`*.*.*[*].${f}`)
    // Object → array → object → field (ex.: `ctx.rows[0].employee.cpf`)
    out.add(`*[*].*.${f}`)
    out.add(`*.*[*].*.${f}`)
    out.add(`*.*.*[*].*.${f}`)
  }
  // personalData.* — bloco aninhado dedicado.
  out.add('personalData')
  out.add('*.personalData')
  out.add('*.*.personalData')
  out.add('[*].personalData')
  out.add('*[*].personalData')
  // Removidos: paths `req.headers["x-show-bank-data"]` (Fastify default
  // request serializer não inclui custom headers; era dead code).
  return Array.from(out)
}

export const LOG_REDACT_PATHS: string[] = buildPaths()

const REDACTED = '[REDACTED]'

// Padrões de valores já-redactados — quando paths sobrepostos fazem Pino chamar
// censor múltiplas vezes para o mesmo valor, retornamos o valor mascarado para
// não cair em [REDACTED] na 2ª chamada (CPF mascarado já não é 11-dígitos).
const MASKED_CPF_RE = /^\*\*\*\.\*\*\*\.\d{3}-XX$/

/**
 * Censor function recebida pelo Pino.
 *
 * Pino chama com (value, path[]) onde path é array de strings.
 * Para CPF mantemos 3 dígitos do meio (***.***.XXX-XX) — útil para suporte
 * sem violar minimização. Outros campos viram '[REDACTED]'.
 */
export function logRedactCensor(value: unknown, path: string[]): unknown {
  const last = path[path.length - 1]

  // Idempotência: já-mascarado passa direto.
  if (typeof value === 'string') {
    if (value === REDACTED) return REDACTED
    if (MASKED_CPF_RE.test(value)) return value
  }

  if (last === 'cpf' && typeof value === 'string') {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 11) {
      return `***.***.${digits.slice(6, 9)}-XX`
    }
  }

  return REDACTED
}

