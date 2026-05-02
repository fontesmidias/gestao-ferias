// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

export function trimOrNull(s: unknown): string | null {
  if (s === null || s === undefined) return null
  const v = String(s).trim()
  return v.length === 0 ? null : v
}

const DATE_BR_RE = /^([0-3]?\d)\/([01]?\d)\/(\d{4})$/

export function parseDateBR(input: unknown): Date | string | null {
  const raw = trimOrNull(input)
  if (raw === null) return null
  const m = raw.match(DATE_BR_RE)
  if (!m) return raw
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12) return raw
  if (day < 1 || day > 31) return raw
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return raw
  }
  return d
}

export function parseBoolBR(input: unknown): boolean | null {
  const raw = trimOrNull(input)
  if (raw === null) return null
  const v = raw.toLowerCase()
  if (v === 'sim' || v === 'true' || v === '1') return true
  if (v === 'não' || v === 'nao' || v === 'false' || v === '0') return false
  return null
}

export function parseNumberBR(input: unknown): number | null {
  const raw = trimOrNull(input)
  if (raw === null) return null
  if (typeof input === 'number' && Number.isFinite(input)) return input
  const cleaned = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseCpfNoMask(input: unknown): string | null {
  const raw = trimOrNull(input)
  if (raw === null) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length === 0 ? null : digits
}

export function isCpfValid(cpfDigits: string | null): boolean {
  if (!cpfDigits || cpfDigits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpfDigits)) return false

  const digits = cpfDigits.split('').map(Number)

  let sum = 0
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i)
  let d1 = (sum * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== digits[9]) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i)
  let d2 = (sum * 10) % 11
  if (d2 === 10) d2 = 0
  return d2 === digits[10]
}
