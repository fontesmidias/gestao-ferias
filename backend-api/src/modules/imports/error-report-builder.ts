// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import * as XLSX from 'xlsx'
import { read as storageRead } from './import-storage'
import { parseRows } from './tirvu-parser'
import { validate } from './import-validator'

export interface BuildErrorReportInput {
  tenantId: string
  jobId: string
  fileHash: string
}

export interface BuildErrorReportResult {
  buffer: Buffer
  invalidCount: number
}

const HEADER = [
  'Linha',
  'Motivo',
  'ID Tirvu',
  'CPF',
  'Nome',
  'Status',
  'Empresa',
  'Lotação',
  'Admissão',
] as const

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatDateBR(value: Date | string | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) {
    return `${pad2(value.getUTCDate())}/${pad2(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`
  }
  return String(value)
}

export async function buildErrorReportXlsx(
  input: BuildErrorReportInput,
): Promise<BuildErrorReportResult> {
  const buffer = await storageRead({
    tenantId: input.tenantId,
    jobId: input.jobId,
    expectedHash: input.fileHash,
  })

  const body: (string | number)[][] = []

  for await (const row of parseRows(buffer)) {
    const result = validate(row)
    if (result.status !== 'invalid') continue
    body.push([
      row.rowIndex,
      result.errors.join('; '),
      row.tirvuId ?? '',
      row.cpf ?? '',
      row.name ?? '',
      row.status ?? '',
      row.empresa ?? '',
      row.lotacao ?? '',
      formatDateBR(row.admissao),
    ])
  }

  const sheet = XLSX.utils.aoa_to_sheet([
    HEADER as unknown as (string | number)[],
    ...body,
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Erros')

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return { buffer: out, invalidCount: body.length }
}
