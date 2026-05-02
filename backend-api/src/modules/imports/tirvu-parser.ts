// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import * as XLSX from 'xlsx'
import type { ParserVersion, TirvuRow } from './types'
import { parseBoolBR, parseDateBR, parseNumberBR, trimOrNull } from './utils'

export const TIRVU_V1_HEADER = [
  'ID', 'CPF', 'Colaborador', 'PCD?', 'Deficiência',
  'Status', 'Empresa', 'Lotação', 'Admissão', 'Demissão',
  'Matrícula', 'Nascimento', 'Nome do Pai', 'Nome da Mãe', 'Cargo',
  'Jornada de Trabalho', 'Início na Jornada', 'Fora da Cerca?', 'Sem Geo?',
  'RG - Número', 'RG - Órgão Emissor', 'RG - Data Emissão',
  'PIS/Pasep', 'CTPS - Número', 'CTPS - Série', 'Sexo',
  'Telefone', 'E-mail',
  'CEP', 'Endereço', 'Endereço - Número', 'Endereço - Complemento',
  'Endereço - Bairro', 'Endereço - UF', 'Endereço - Cidade',
  'Sindicato', 'Salário', 'Salário - Complemento', 'Salário - Extra',
  'Tipo PIX', 'Chave PIX', 'Banco', 'Tipo de Conta', 'Agência', 'Conta',
  'Data Log',
] as const

const SHEET_NAME = 'Plan1'

function normHeader(s: unknown): string {
  return String(s ?? '').trim().toLowerCase()
}

function loadWorkbook(input: Buffer | XLSX.WorkBook): XLSX.WorkBook | null {
  if (Buffer.isBuffer(input)) {
    try {
      return XLSX.read(input, { type: 'buffer' })
    } catch {
      return null
    }
  }
  return input
}

function getSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  if (!wb.SheetNames.includes(SHEET_NAME)) return null
  return wb.Sheets[SHEET_NAME] ?? null
}

export function detect(input: Buffer | XLSX.WorkBook): ParserVersion | null {
  const wb = loadWorkbook(input)
  if (!wb) return null
  const sheet = getSheet(wb)
  if (!sheet) return null

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  })
  if (rows.length === 0) return null
  const header = rows[0]
  if (!Array.isArray(header) || header.length !== TIRVU_V1_HEADER.length) return null

  for (let i = 0; i < TIRVU_V1_HEADER.length; i++) {
    if (normHeader(header[i]) !== normHeader(TIRVU_V1_HEADER[i])) return null
  }
  return 'tirvu-v1'
}

function buildTirvuRow(raw: unknown[], rowIndex: number, rawRowIndex: number): TirvuRow {
  const cell = (i: number): unknown => (i < raw.length ? raw[i] : null)

  return {
    rowIndex,
    rawRowIndex,

    tirvuId: trimOrNull(cell(0)),
    cpf: trimOrNull(cell(1)),
    name: trimOrNull(cell(2)),
    pcd: parseBoolBR(cell(3)),
    deficiencia: trimOrNull(cell(4)),
    status: trimOrNull(cell(5)),
    empresa: trimOrNull(cell(6)),
    lotacao: trimOrNull(cell(7)),
    admissao: parseDateBR(cell(8)),
    demissao: parseDateBR(cell(9)),
    matricula: trimOrNull(cell(10)),
    nascimento: parseDateBR(cell(11)),
    nomePai: trimOrNull(cell(12)),
    nomeMae: trimOrNull(cell(13)),
    cargo: trimOrNull(cell(14)),
    jornada: trimOrNull(cell(15)),
    inicioJornada: parseDateBR(cell(16)),
    foraDaCerca: parseBoolBR(cell(17)),
    semGeo: parseBoolBR(cell(18)),
    rgNumero: trimOrNull(cell(19)),
    rgOrgao: trimOrNull(cell(20)),
    rgDataEmissao: parseDateBR(cell(21)),
    pisPasep: trimOrNull(cell(22)),
    ctpsNumero: trimOrNull(cell(23)),
    ctpsSerie: trimOrNull(cell(24)),
    sexo: trimOrNull(cell(25)),
    telefone: trimOrNull(cell(26)),
    email: trimOrNull(cell(27)),
    cep: trimOrNull(cell(28)),
    endereco: trimOrNull(cell(29)),
    enderecoNumero: trimOrNull(cell(30)),
    enderecoComplemento: trimOrNull(cell(31)),
    enderecoBairro: trimOrNull(cell(32)),
    enderecoUf: trimOrNull(cell(33)),
    enderecoCidade: trimOrNull(cell(34)),
    sindicato: trimOrNull(cell(35)),
    salario: parseNumberBR(cell(36)),
    salarioComplemento: parseNumberBR(cell(37)),
    salarioExtra: parseNumberBR(cell(38)),
    tipoPix: trimOrNull(cell(39)),
    chavePix: trimOrNull(cell(40)),
    banco: trimOrNull(cell(41)),
    tipoConta: trimOrNull(cell(42)),
    agencia: trimOrNull(cell(43)),
    conta: trimOrNull(cell(44)),
    dataLog: parseDateBR(cell(45)),
  }
}

function isRowEmpty(raw: unknown[]): boolean {
  for (const cell of raw) {
    if (cell === null || cell === undefined) continue
    if (String(cell).trim().length > 0) return false
  }
  return true
}

export async function* parseRows(
  input: Buffer | XLSX.WorkBook,
): AsyncIterableIterator<TirvuRow> {
  const wb = loadWorkbook(input)
  if (!wb) return
  const sheet = getSheet(wb)
  if (!sheet) return

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  })

  let rowIndex = 0
  for (let i = 1; i < rows.length; i++) {
    const raw = Array.isArray(rows[i]) ? (rows[i] as unknown[]) : []
    if (isRowEmpty(raw)) continue
    rowIndex++
    yield buildTirvuRow(raw, rowIndex, i)
  }
}
