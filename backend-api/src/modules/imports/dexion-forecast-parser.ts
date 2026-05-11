import * as XLSX from 'xlsx'
import { normalizeMatricula } from './matricula'

/**
 * V3.4 Story 4.22: parser do XLS "Relação de Previsão de Férias" do Dexion.
 *
 * Estrutura observada em docs/exemplo/Relacao de Previsao de Ferias.XLS:
 *
 * Linhas 0-4: cabeçalho (titulo, empresa, modelo, coluna headers).
 * Linha 5+: blocos de 3-4 linhas por colaborador:
 *   - Linha N (dado): [matricula(0), null, nome(2), null, lotacaoId(4), null, null,
 *                       salario(7), null, admissao(9), ultimaFerias(10),
 *                       aquisitivoRange(11), null, null, gozoAteFlag(14),
 *                       null, null, dias(17), null, null]
 *   - Linha N+1 (periodo aquisitivo seguinte, mesma estrutura mas sem matrícula/nome)
 *   - Linha N+2 (cargo): col 2 tem cargo (BRIGADISTA, AGENTE...), col 18 "____ /____ /____"
 *   - Linha N+3 (opcional): mais um periodo aquisitivo
 *
 * "Início das Últimas Férias" (col 10) = data string "DD/MM/YYYY" da ULTIMA VEZ que
 * o colaborador gozou férias. Útil para detectar gozos que o sistema não conhece.
 *
 * "Gozo Até" (col 14) com sufixo " V" significa VENCIDO (limite legal ultrapassado).
 */

export interface DexionPeriod {
  aquisitivoStart: string // YYYY-MM-DD
  aquisitivoEnd: string   // YYYY-MM-DD
  gozoAte: string         // YYYY-MM-DD
  vencido: boolean
  dias: number
}

export interface DexionForecastRecord {
  rowIndex: number
  matricula: string
  nome: string
  cargo: string | null
  lotacaoId: number | null
  salario: number | null
  admissao: string | null         // YYYY-MM-DD
  ultimaFerias: string | null     // YYYY-MM-DD do INÍCIO da última gozada
  ultimaFeriasDias: number | null // se conseguir inferir
  periodos: DexionPeriod[]
}

export interface DexionForecastParseResult {
  records: DexionForecastRecord[]
  skippedRows: number
  totalEmployees: number
  totalPeriods: number
  vencidosCount: number
}

function parseBrDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string') {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return null
}

function parseAquisitivoRange(v: unknown): { start: string; end: string } | null {
  if (typeof v !== 'string') return null
  // Formato "15/02/2025 a 14/02/2026"
  const m = v.match(/^(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i)
  if (!m) return null
  const start = parseBrDate(m[1])
  const end = parseBrDate(m[2])
  return start && end ? { start, end } : null
}

function parseGozoAte(v: unknown): { date: string; vencido: boolean } | null {
  if (typeof v !== 'string') {
    const d = parseBrDate(v)
    return d ? { date: d, vencido: false } : null
  }
  const trimmed = v.trim()
  const vencido = / V\s*$/i.test(trimmed)
  const dateStr = trimmed.replace(/\s+V\s*$/i, '').trim()
  const date = parseBrDate(dateStr)
  return date ? { date, vencido } : null
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s === ' ') return null
  return s
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const s = v.replace(/[\s.]/g, '').replace(',', '.')
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const COL_MATRICULA = 0
const COL_NOME = 2
const COL_LOTACAO = 4
const COL_SALARIO = 7
const COL_ADMISSAO = 9
const COL_ULTIMA_FERIAS = 10
const COL_AQUISITIVO = 11
const COL_GOZO_ATE = 14
const COL_DIAS = 17

export function parseDexionForecast(buffer: Buffer): DexionForecastParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { records: [], skippedRows: 0, totalEmployees: 0, totalPeriods: 0, vencidosCount: 0 }
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false })

  const records: DexionForecastRecord[] = []
  let skipped = 0
  let totalPeriods = 0
  let vencidosCount = 0
  let currentRecord: DexionForecastRecord | null = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!Array.isArray(row)) { skipped++; continue }

    const matRaw = row[COL_MATRICULA]
    const nomeRaw = row[COL_NOME]
    const matricula = normalizeMatricula(matRaw)

    // Linha de dado principal (tem matricula numerica + nome string)
    if (matricula && typeof nomeRaw === 'string' && nomeRaw.trim().length >= 2) {
      // Fecha record anterior
      if (currentRecord) records.push(currentRecord)

      currentRecord = {
        rowIndex: i + 1,
        matricula,
        nome: nomeRaw.trim(),
        cargo: null,
        lotacaoId: toNumberOrNull(row[COL_LOTACAO]),
        salario: toNumberOrNull(row[COL_SALARIO]),
        admissao: parseBrDate(row[COL_ADMISSAO]),
        ultimaFerias: parseBrDate(row[COL_ULTIMA_FERIAS]),
        ultimaFeriasDias: null,
        periodos: [],
      }

      // Tenta extrair primeiro período dessa linha
      const range = parseAquisitivoRange(row[COL_AQUISITIVO])
      const gozo = parseGozoAte(row[COL_GOZO_ATE])
      const dias = toNumberOrNull(row[COL_DIAS])
      if (range && gozo) {
        currentRecord.periodos.push({
          aquisitivoStart: range.start,
          aquisitivoEnd: range.end,
          gozoAte: gozo.date,
          vencido: gozo.vencido,
          dias: dias ?? 30,
        })
        totalPeriods++
        if (gozo.vencido) vencidosCount++
      }
      continue
    }

    // Linha de continuação (período aquisitivo adicional ou linha de cargo)
    if (currentRecord) {
      const range = parseAquisitivoRange(row[COL_AQUISITIVO])
      const gozo = parseGozoAte(row[COL_GOZO_ATE])
      const dias = toNumberOrNull(row[COL_DIAS])
      if (range && gozo) {
        currentRecord.periodos.push({
          aquisitivoStart: range.start,
          aquisitivoEnd: range.end,
          gozoAte: gozo.date,
          vencido: gozo.vencido,
          dias: dias ?? 30,
        })
        totalPeriods++
        if (gozo.vencido) vencidosCount++
        continue
      }
      // Linha de cargo: tem string no col 2 mas nao tem matricula
      const cargoCandidate = clean(row[COL_NOME])
      if (cargoCandidate && !matRaw) {
        currentRecord.cargo = cargoCandidate
        continue
      }
    }

    skipped++
  }

  if (currentRecord) records.push(currentRecord)

  return {
    records,
    skippedRows: skipped,
    totalEmployees: records.length,
    totalPeriods,
    vencidosCount,
  }
}
