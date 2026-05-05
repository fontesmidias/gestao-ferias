// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { TirvuRow, ValidationResult } from './types'
import { isCpfValid, parseCpfNoMask } from './utils'

// Status do colaborador é campo LIVRE — Tirvu/sistemas externos podem usar
// "ATESTADO MÉDICO", "LICENÇA MATERNIDADE", "FÉRIAS", "AFASTADO INSS", etc.
// Validação restrita criava falso-negativos no import. Mantemos só "ausência".
// Decisão 2026-05-04: deixar passar e o RH ajusta depois se quiser.

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

  // status — campo livre. Só rejeita se vier vazio (raro).
  const statusTrim = row.status ? row.status.trim() : ''
  if (!statusTrim) {
    errors.push('Status do colaborador ausente')
  }

  // birthDate (nascimento) — opcional. Antes barrava < 14 ou > 120 anos, o que
  // criava falsos-negativos quando a origem (Tirvu) tinha digitação errada.
  // Decisão 2026-05-04: importa do jeito que veio; RH corrige depois se quiser.
  // Mantemos apenas a checagem de formato (string não-parseada → erro de fato).
  if (row.nascimento !== null && typeof row.nascimento === 'string') {
    errors.push(`Data de nascimento "${row.nascimento}" não está em formato dd/MM/yyyy`)
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
