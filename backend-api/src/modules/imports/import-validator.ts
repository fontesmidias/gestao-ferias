// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { TirvuRow, ValidationResult } from './types'
import { isCpfValid, parseCpfNoMask } from './utils'

const ALLOWED_STATUSES = new Set(['ATIVO', 'DEMITIDO', 'AFASTADO'])
const FOURTEEN_YEARS_MS = 14 * 365.25 * 24 * 60 * 60 * 1000

function endOfTodayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
}

export function validate(row: TirvuRow): ValidationResult {
  const errors: string[] = []

  // CPF
  const cpfDigits = parseCpfNoMask(row.cpf)
  if (cpfDigits === null) {
    errors.push('CPF ausente')
  } else if (!isCpfValid(cpfDigits)) {
    errors.push('CPF inválido (dígito verificador não confere)')
  }

  // name
  if (!row.name || row.name.trim().length === 0) {
    errors.push('Nome do colaborador ausente')
  }

  // hireDate (admissao)
  if (row.admissao === null) {
    errors.push('Data de admissão ausente')
  } else if (typeof row.admissao === 'string') {
    errors.push('Data de admissão fora do formato dd/MM/yyyy')
  } else if (row.admissao instanceof Date) {
    if (row.admissao.getTime() > endOfTodayUtc().getTime()) {
      errors.push('Data de admissão futura não é permitida')
    }
  }

  // status
  const statusUpper = row.status ? row.status.toUpperCase().trim() : null
  if (!statusUpper || !ALLOWED_STATUSES.has(statusUpper)) {
    errors.push('Status do colaborador inválido (esperado: ATIVO, DEMITIDO ou AFASTADO)')
  }

  // birthDate (nascimento) — opcional
  if (row.nascimento !== null) {
    if (typeof row.nascimento === 'string') {
      errors.push('Data de nascimento inválida')
    } else if (row.nascimento instanceof Date) {
      const ageMs = Date.now() - row.nascimento.getTime()
      if (ageMs < FOURTEEN_YEARS_MS) {
        errors.push('Data de nascimento implausível')
      }
    }
  }

  // terminationDate (demissao) — opcional
  if (row.demissao !== null) {
    if (typeof row.demissao === 'string') {
      errors.push('Data de demissão inválida')
    } else if (row.demissao instanceof Date && row.admissao instanceof Date) {
      if (row.demissao.getTime() < row.admissao.getTime()) {
        errors.push('Data de demissão anterior à admissão')
      }
    }
  }

  return {
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
  }
}
