import * as XLSX from 'xlsx'
import { normalizeMatricula } from './matricula'
import { parseCpfNoMask } from './utils'

/**
 * V3.4 FASE F1: parser do XLSX exportado pelo sistema Dexion.
 *
 * Formato observado em "docs/exemplo/Trabalhadores, de 10-05-2026.XLS":
 * - É XLSX legível mesmo com extensão .XLS.
 * - Linhas 0-1: título + empresa + data + folha. Linha 2: header.
 * - Linha 3+: alterna entre separadores de lotação ("0093 - DPU"),
 *   linhas de dado (matrícula numérica + nome + salário), e sumários
 *   ("4 trabalhadores cujos salários totalizam R$ X").
 *
 * Estratégia: ignora qualquer linha que não tenha PADRÃO DE DADO VÁLIDO
 * (col 1 numérica + col 3 string + col 10 numérica). Não depende de
 * detectar headers/separadores explicitamente — se não bate o padrão,
 * pula. Robusto a variações de empresa/folha/data.
 */

export interface DexionWorker {
  rowIndex: number
  matricula: string
  nome: string
  cargo: string | null
  salario: number
  cpf: string | null
  lotacao: string | null
}

export interface DexionParseResult {
  workers: DexionWorker[]
  skippedRows: number
}

const COL_MATRICULA = 1
const COL_NOME = 3
const COL_CARGO = 5
const COL_SALARIO = 10
const COL_CPF = 15

function isNumericLike(v: unknown): boolean {
  if (typeof v === 'number' && Number.isFinite(v)) return true
  if (typeof v === 'string') {
    const s = v.replace(/[\s.]/g, '').replace(',', '.')
    return /^\d+(\.\d+)?$/.test(s)
  }
  return false
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const s = v.replace(/[\s.]/g, '').replace(',', '.')
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

export function parseDexionWorkers(buffer: Buffer): DexionParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { workers: [], skippedRows: 0 }
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  const workers: DexionWorker[] = []
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!Array.isArray(row)) { skipped++; continue }
    const matRaw = row[COL_MATRICULA]
    const nomeRaw = row[COL_NOME]
    const salRaw = row[COL_SALARIO]

    // Padrão de linha de dado válida.
    if (!isNumericLike(matRaw)) { skipped++; continue }
    if (typeof nomeRaw !== 'string' || nomeRaw.trim().length < 2) { skipped++; continue }
    if (!isNumericLike(salRaw)) { skipped++; continue }

    const matricula = normalizeMatricula(matRaw)
    if (!matricula) { skipped++; continue }
    const salario = toNumber(salRaw)
    if (salario === null || salario < 0) { skipped++; continue }

    workers.push({
      rowIndex: i + 1, // 1-based para mostrar ao usuário
      matricula,
      nome: nomeRaw.trim(),
      cargo: toStringOrNull(row[COL_CARGO]),
      salario,
      cpf: parseCpfNoMask(toStringOrNull(row[COL_CPF])) || null,
      lotacao: null, // Dexion exporta lotação em separadores; não associada por linha de dado
    })
  }

  return { workers, skippedRows: skipped }
}
