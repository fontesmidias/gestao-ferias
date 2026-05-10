import * as XLSX from 'xlsx'
import { normalizeMatricula } from './matricula'

/**
 * V3.4 Story 4.21: parser do XLS "Gestao Operacional" do Tirvu.
 *
 * Estrutura observada em docs/exemplo/Gestao Operacional - 2026-05-01 a 2026-05-10.xls:
 * Linha 0: header
 *   ["Status","ID","Motivo","Colaborador","Matricula","Posto","Substituto","Matricula",
 *    "Data Inicio Cobertura","Inicio da Vigencia","Fim da Vigencia","Aprov. Supervisor",
 *    "Observacoes","CID","CRM","Nome Medico"]
 * Linhas 1+: dados. Datas podem vir como Excel serial number OU string "28/04/2026".
 * Encoding ANSI/Win1252 (acentos quebrados nos titulos — dados de matricula/numeros OK).
 *
 * Foco: extrair registros com Motivo='FERIAS' (ou variantes) para criar VacationRequest
 * e CoverageAssignment quando ha substituto.
 */

export interface OperationalRecord {
  rowIndex: number
  status: string
  tirvuId: number | null
  motivo: string
  titularNome: string
  titularMatricula: string | null
  posto: string | null
  substitutoNome: string | null
  substitutoMatricula: string | null
  inicioVigencia: string | null // YYYY-MM-DD
  fimVigencia: string | null    // YYYY-MM-DD
  dataInicioCobertura: string | null
  observacoes: string | null
  semCobertura: boolean
}

export interface OperationalParseResult {
  records: OperationalRecord[]
  skippedRows: number
  vacationCount: number       // motivo=FERIAS
  withCoverageCount: number   // FERIAS com substituto
}

const COL_STATUS = 0
const COL_ID = 1
const COL_MOTIVO = 2
const COL_COLABORADOR = 3
const COL_MATRICULA_T = 4
const COL_POSTO = 5
const COL_SUBSTITUTO = 6
const COL_MATRICULA_S = 7
const COL_DATA_INICIO_COB = 8
const COL_INICIO_VIG = 9
const COL_FIM_VIG = 10
const COL_OBS = 12

/** Converte Excel serial date OU string dd/MM/yyyy para YYYY-MM-DD. */
function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial: dias desde 1900-01-01 (com bug do 1900 leap year, ja tratado pela lib)
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    // dd/MM/yyyy ou dd/MM/yyyy HH:mm:ss
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
    // ja em ISO?
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  }
  return null
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s === ' ') return null
  return s
}

/** Trata strings com encoding quebrado: "F�RIAS" → "FERIAS" (sem acento, uppercase). */
function normalizeMotivo(raw: string | null): string {
  if (!raw) return ''
  const upper = raw
    .toUpperCase()
    .replace(/[ÁÀÂÃÄÅ]/g, 'A')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÕÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/Ç/g, 'C')
    .replace(/[^\w\s]/g, '') // remove caractere de substituicao � (U+FFFD) e nao alfanumericos
    .trim()
  // O .xls do Tirvu exportado com encoding quebrado vira "FRIAS" (perde E).
  // Detecta o padrao e normaliza para FERIAS.
  if (upper === 'FRIAS') return 'FERIAS'
  return upper
}

export function parseTirvuOperational(buffer: Buffer): OperationalParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { records: [], skippedRows: 0, vacationCount: 0, withCoverageCount: 0 }
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false })

  const records: OperationalRecord[] = []
  let skipped = 0
  let vacationCount = 0
  let withCoverageCount = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!Array.isArray(row)) { skipped++; continue }
    const motivoRaw = clean(row[COL_MOTIVO])
    const colab = clean(row[COL_COLABORADOR])
    if (!motivoRaw || !colab) { skipped++; continue }

    const motivo = normalizeMotivo(motivoRaw)
    const tirvuId = typeof row[COL_ID] === 'number' ? (row[COL_ID] as number) : null
    const status = clean(row[COL_STATUS]) || 'desconhecido'
    const titularMatricula = normalizeMatricula(row[COL_MATRICULA_T])
    const posto = clean(row[COL_POSTO])
    const substituto = clean(row[COL_SUBSTITUTO])
    const substitutoMatricula = normalizeMatricula(row[COL_MATRICULA_S])
    const inicioVigencia = toIsoDate(row[COL_INICIO_VIG])
    const fimVigencia = toIsoDate(row[COL_FIM_VIG])
    const dataInicioCobertura = toIsoDate(row[COL_DATA_INICIO_COB])
    const obs = clean(row[COL_OBS])
    const semCobertura = !substituto || /SEM\s+COBERTURA/i.test(obs || '')

    const record: OperationalRecord = {
      rowIndex: i + 1,
      status,
      tirvuId,
      motivo,
      titularNome: colab,
      titularMatricula,
      posto,
      substitutoNome: substituto,
      substitutoMatricula,
      inicioVigencia,
      fimVigencia,
      dataInicioCobertura,
      observacoes: obs,
      semCobertura,
    }
    records.push(record)
    if (motivo === 'FERIAS') {
      vacationCount++
      if (!semCobertura && substituto && (substitutoMatricula || substitutoNome(substituto))) {
        withCoverageCount++
      }
    }
  }

  return { records, skippedRows: skipped, vacationCount, withCoverageCount }
}

function substitutoNome(s: string | null): boolean {
  return !!s && s.trim().length > 1
}
