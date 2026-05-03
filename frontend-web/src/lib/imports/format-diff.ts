import { format } from 'date-fns'
import type { DiffEntry } from './types'

const DATE_FIELDS = new Set([
  'hireDate',
  'birthDate',
  'terminationDate',
  'admissao',
  'nascimento',
  'demissao',
])

const SALARY_FIELDS = new Set(['salary', 'salario'])

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(v: unknown): string {
  if (v == null) return '—'
  try {
    const d = v instanceof Date ? v : new Date(String(v))
    if (Number.isNaN(d.getTime())) return String(v)
    return format(d, 'dd/MM/yyyy')
  } catch {
    return String(v)
  }
}

export interface FormattedDiffField {
  field: string
  fromText: string
  toText: string
  delta?: string
}

export function formatDiffEntry(field: string, entry: DiffEntry): FormattedDiffField {
  if (SALARY_FIELDS.has(field)) {
    const from = Number(entry.from ?? 0)
    const to = Number(entry.to ?? 0)
    const fromText = formatBRL(from)
    const toText = formatBRL(to)
    let delta: string | undefined
    if (from !== 0 && Number.isFinite(from) && Number.isFinite(to)) {
      const pct = ((to - from) / from) * 100
      const sign = pct > 0 ? '+' : ''
      delta = `${sign}${pct.toFixed(1)}%`
    }
    return { field, fromText, toText, delta }
  }
  if (DATE_FIELDS.has(field)) {
    return { field, fromText: formatDate(entry.from), toText: formatDate(entry.to) }
  }
  return {
    field,
    fromText: entry.from == null ? '—' : String(entry.from),
    toText: entry.to == null ? '—' : String(entry.to),
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  cpf: 'CPF',
  salary: 'Salário',
  salario: 'Salário',
  position: 'Cargo',
  status: 'Status',
  workplace: 'Lotação',
  shift: 'Jornada',
  branch: 'Empresa',
  hireDate: 'Admissão',
  birthDate: 'Nascimento',
  terminationDate: 'Demissão',
  phone: 'Telefone',
  unionName: 'Sindicato',
  inactivePending: 'Pendente de inativação',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}
