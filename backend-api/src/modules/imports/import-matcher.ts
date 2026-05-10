// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type {
  Diff,
  EmployeePatch,
  Employee,
  MatchContext,
  MatchResult,
  PreviewSummary,
  RowCategory,
  TirvuRow,
} from './types'
import { parseCpfNoMask } from './utils'
import { normalizeMatricula } from './matricula'

export const DIFF_FIELDS = [
  'tirvuId',
  'name',
  'registration',
  'birthDate',
  'position',
  'status',
  'branch',
  'workplace',
  'shift',
  'phone',
  'salary',
  'hireDate',
  'unionName',
  'terminationDate',
] as const satisfies readonly (keyof EmployeePatch)[]

const CONFLICT_ERROR =
  'CPF da planilha pertence a outro colaborador no sistema; verifique se houve troca de CPF'

function isDate(v: unknown): v is Date {
  return v instanceof Date && !Number.isNaN(v.getTime())
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === undefined && b === undefined) return true
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (a === undefined || b === undefined) return false

  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime()
  if (isDate(a) || isDate(b)) return false

  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a as number)
    const nb = Number(b as number)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
    return false
  }
  // Decimal de Prisma vem como objeto com toString(); tentamos coerce
  if (typeof a === 'object' || typeof b === 'object') {
    const na = Number((a as { toString(): string }).toString())
    const nb = Number((b as { toString(): string }).toString())
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
    return JSON.stringify(a) === JSON.stringify(b)
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim()
  }
  return a === b
}

function jsonSerializable(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (isDate(v)) return v.toISOString()
  if (Array.isArray(v)) return v.map(jsonSerializable)
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = jsonSerializable(val)
    }
    return out
  }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v
  // Decimal-ish
  return Number((v as { toString(): string }).toString())
}

function buildPersonalData(row: TirvuRow): Record<string, unknown> | undefined {
  const fields: Record<string, unknown> = {}
  if (row.pcd !== null) fields.pcd = row.pcd
  if (row.deficiencia !== null) fields.deficiencia = row.deficiencia
  if (row.sexo !== null) fields.sexo = row.sexo
  if (row.nomePai !== null) fields.nomePai = row.nomePai
  if (row.nomeMae !== null) fields.nomeMae = row.nomeMae
  if (row.email !== null) fields.email = row.email

  const rg: Record<string, unknown> = {}
  if (row.rgNumero !== null) rg.numero = row.rgNumero
  if (row.rgOrgao !== null) rg.orgao = row.rgOrgao
  if (isDate(row.rgDataEmissao)) rg.dataEmissao = row.rgDataEmissao
  if (Object.keys(rg).length > 0) fields.rg = rg

  if (row.pisPasep !== null) fields.pisPasep = row.pisPasep

  const ctps: Record<string, unknown> = {}
  if (row.ctpsNumero !== null) ctps.numero = row.ctpsNumero
  if (row.ctpsSerie !== null) ctps.serie = row.ctpsSerie
  if (Object.keys(ctps).length > 0) fields.ctps = ctps

  if (isDate(row.inicioJornada)) fields.inicioJornada = row.inicioJornada

  return Object.keys(fields).length > 0 ? fields : undefined
}

function buildAddress(row: TirvuRow): Record<string, unknown> | undefined {
  const fields: Record<string, unknown> = {}
  if (row.cep !== null) fields.cep = row.cep
  if (row.endereco !== null) fields.logradouro = row.endereco
  if (row.enderecoNumero !== null) fields.numero = row.enderecoNumero
  if (row.enderecoComplemento !== null) fields.complemento = row.enderecoComplemento
  if (row.enderecoBairro !== null) fields.bairro = row.enderecoBairro
  if (row.enderecoUf !== null) fields.uf = row.enderecoUf
  if (row.enderecoCidade !== null) fields.cidade = row.enderecoCidade
  return Object.keys(fields).length > 0 ? fields : undefined
}

function buildGeofencingFlags(row: TirvuRow): Record<string, unknown> | undefined {
  if (row.foraDaCerca === null && row.semGeo === null) return undefined
  return {
    outsideFence: row.foraDaCerca,
    noGeo: row.semGeo,
  }
}

export function mapRowToEmployeePatch(row: TirvuRow): EmployeePatch {
  const patch: EmployeePatch = {}

  if (row.tirvuId !== null) patch.tirvuId = row.tirvuId
  if (row.name !== null) patch.name = row.name
  // V3.4 FASE D1: matrícula vem da coluna "Matrícula" do XLSX Tirvu (índice 10).
  // Normalizada (zeros à esquerda removidos) para casar com Dexion depois.
  if (row.matricula !== null) {
    const normalized = normalizeMatricula(row.matricula)
    if (normalized) patch.registration = normalized
  }
  if (isDate(row.nascimento)) patch.birthDate = row.nascimento
  if (row.cargo !== null) patch.position = row.cargo
  if (row.status !== null) patch.status = row.status.toUpperCase().trim()
  if (row.empresa !== null) patch.branch = row.empresa
  if (row.lotacao !== null) patch.workplace = row.lotacao
  if (row.jornada !== null) patch.shift = row.jornada
  if (row.telefone !== null) patch.phone = row.telefone
  if (row.salario !== null) {
    patch.salary = row.salario as unknown as EmployeePatch['salary']
  }
  if (isDate(row.admissao)) patch.hireDate = row.admissao
  if (row.sindicato !== null) patch.unionName = row.sindicato
  if (isDate(row.demissao)) patch.terminationDate = row.demissao

  const personalData = buildPersonalData(row)
  if (personalData) patch.personalData = personalData as EmployeePatch['personalData']

  const address = buildAddress(row)
  if (address) patch.address = address as EmployeePatch['address']

  const geofencingFlags = buildGeofencingFlags(row)
  if (geofencingFlags) {
    patch.geofencingFlags = geofencingFlags as EmployeePatch['geofencingFlags']
  }

  return patch
}

export function computeDiff(
  existing: Employee,
  patch: EmployeePatch,
  fields: readonly (keyof EmployeePatch)[] = DIFF_FIELDS,
): Diff {
  const diff: Diff = {}
  for (const field of fields) {
    const patchVal = (patch as Record<string, unknown>)[field as string]
    if (patchVal === undefined) continue
    const existingVal = (existing as unknown as Record<string, unknown>)[field as string]
    if (!valuesEqual(existingVal, patchVal)) {
      diff[field as string] = {
        from: jsonSerializable(existingVal ?? null),
        to: jsonSerializable(patchVal),
      }
    }
  }
  return diff
}

function isEmployeeInactive(emp: Employee): boolean {
  return emp.status === 'INATIVO' || emp.terminationDate !== null
}

export interface MatchAllInputs {
  rows: TirvuRow[]
  validRowSet: Set<number>
  invalidRowsFromValidator: { row: TirvuRow; errors: string[] }[]
  ctx: MatchContext
}

export function matchAll(inputs: MatchAllInputs): MatchResult {
  const { rows, validRowSet, invalidRowsFromValidator, ctx } = inputs

  const byTirvuId = new Map<string, Employee>()
  const byCpf = new Map<string, Employee>()
  for (const emp of ctx.existingEmployees) {
    if (emp.tirvuId) byTirvuId.set(emp.tirvuId, emp)
    if (emp.cpf) byCpf.set(emp.cpf, emp)
  }

  const result: MatchResult = {
    create: [],
    update: [],
    unchanged: [],
    reactivation: [],
    invalid: [...invalidRowsFromValidator],
    absent: [],
    newWorkplaces: [],
  }

  const matchedEmployeeIds = new Set<string>()

  for (const row of rows) {
    if (!validRowSet.has(row.rowIndex)) continue

    const stage1 = row.tirvuId ? byTirvuId.get(row.tirvuId) ?? null : null
    const cpfDigits = parseCpfNoMask(row.cpf)
    const stage2 = cpfDigits ? byCpf.get(cpfDigits) ?? null : null

    let target: Employee | null = null
    if (stage1 && stage2) {
      if (stage1.id === stage2.id) {
        target = stage1
      } else {
        result.invalid.push({ row, errors: [CONFLICT_ERROR] })
        continue
      }
    } else {
      target = stage1 ?? stage2
    }

    if (!target) {
      result.create.push({ row, patch: mapRowToEmployeePatch(row) })
      continue
    }

    matchedEmployeeIds.add(target.id)

    const patch = mapRowToEmployeePatch(row)
    if (target.tirvuId === null && row.tirvuId !== null) {
      patch.tirvuId = row.tirvuId
    }

    if (isEmployeeInactive(target)) {
      const diff = computeDiff(target, patch)
      result.reactivation.push({ row, employee: target, patch, diff })
      continue
    }

    const diff = computeDiff(target, patch)
    if (Object.keys(diff).length === 0) {
      result.unchanged.push({ row, employee: target })
    } else {
      result.update.push({ row, employee: target, patch, diff })
    }
  }

  for (const emp of ctx.existingEmployees) {
    if (matchedEmployeeIds.has(emp.id)) continue
    if (isEmployeeInactive(emp)) continue
    result.absent.push(emp)
  }

  const existingNames = new Set(
    ctx.existingWorkplaces.map((w) => w.name.trim()),
  )
  const newSeen = new Set<string>()
  for (const row of rows) {
    if (!validRowSet.has(row.rowIndex)) continue
    if (!row.lotacao) continue
    const name = row.lotacao.trim()
    if (name.length === 0) continue
    if (existingNames.has(name)) continue
    if (newSeen.has(name)) continue
    newSeen.add(name)
    result.newWorkplaces.push(name)
  }

  return result
}

export interface RelationalDelta {
  allocationsCreated: number
  allocationsClosed: number
  workplacesCreated: number
  unmatchedEmployees: number
}

/**
 * Story 2.2 (FR25): conta o impacto do apply nas tabelas relacionais
 * (WorkplaceAllocation + Workplace) baseado no MatchResult, sem tocar o banco.
 *
 * Allocations criadas:
 * - cada row em `create` com lotação truthy.
 * - cada row em `update`/`reactivation` que: (a) `diff.workplace` mudou OU
 *   (b) employee não tinha `workplaceId` mas patch traz lotação.
 *
 * Allocations encerradas:
 * - cada `update`/`reactivation` em transição (workplace mudou) E o employee
 *   já tinha `workplaceId` (havia allocation a encerrar).
 *
 * Workplaces criados:
 * - `result.newWorkplaces.length` (já calculado pelo matcher).
 *
 * Unmatched employees:
 * - cada row válida (create/update/reactivation) cuja lotação é vazia/null.
 */
export function computeRelationalDelta(result: MatchResult): RelationalDelta {
  let allocationsCreated = 0
  let allocationsClosed = 0
  let unmatchedEmployees = 0

  for (const e of result.create) {
    const lotacao = e.row.lotacao?.trim() ?? ''
    if (lotacao) allocationsCreated++
    else unmatchedEmployees++
  }

  for (const e of result.update) {
    const lotacao = e.row.lotacao?.trim() ?? ''
    if (!lotacao) {
      unmatchedEmployees++
      continue
    }
    const workplaceChanged = 'workplace' in e.diff
    const hadFk = !!e.employee.workplaceId
    if (workplaceChanged) {
      allocationsCreated++
      if (hadFk) allocationsClosed++
    } else if (!hadFk) {
      allocationsCreated++
    }
  }

  for (const e of result.reactivation) {
    const lotacao = e.row.lotacao?.trim() ?? ''
    if (!lotacao) {
      unmatchedEmployees++
      continue
    }
    const workplaceChanged = 'workplace' in e.diff
    const hadFk = !!e.employee.workplaceId
    if (workplaceChanged) {
      allocationsCreated++
      if (hadFk) allocationsClosed++
    } else if (!hadFk) {
      allocationsCreated++
    }
  }

  // unchanged rows ainda contam como unmatched se a planilha veio sem lotação
  // (employees ATIVOs sem vínculo continuam pendentes para reconciliação manual).
  for (const e of result.unchanged) {
    const lotacao = e.row.lotacao?.trim() ?? ''
    if (!lotacao) unmatchedEmployees++
  }

  return {
    allocationsCreated,
    allocationsClosed,
    workplacesCreated: result.newWorkplaces.length,
    unmatchedEmployees,
  }
}

export function buildPreviewSummary(
  result: MatchResult,
  totalRows: number,
  // Default 2000: cobre 99% dos tenants sem truncar; payload JSON aceitável.
  // Antes era 50 → frontend mostrava só 50 linhas mesmo com 1045+ no arquivo.
  sampleSize = 2000,
): PreviewSummary {
  const all: Array<{
    rowIndex: number
    status: RowCategory
    name?: string | null
    cpf?: string | null
    workplace?: string | null
    diff?: Diff
    errors?: string[]
  }> = []

  // Helper: pega campos de identificação da TirvuRow para o preview UI.
  const id = (row: { name?: string | null; cpf?: string | null; lotacao?: string | null }) => ({
    name: row.name ?? null,
    cpf: row.cpf ?? null,
    workplace: row.lotacao ?? null,
  })

  for (const e of result.create) {
    all.push({ rowIndex: e.row.rowIndex, status: 'create', ...id(e.row) })
  }
  for (const e of result.update) {
    all.push({ rowIndex: e.row.rowIndex, status: 'update', diff: e.diff, ...id(e.row) })
  }
  for (const e of result.unchanged) {
    all.push({ rowIndex: e.row.rowIndex, status: 'unchanged', ...id(e.row) })
  }
  for (const e of result.reactivation) {
    all.push({ rowIndex: e.row.rowIndex, status: 'reactivation', diff: e.diff, ...id(e.row) })
  }
  for (const e of result.invalid) {
    all.push({ rowIndex: e.row.rowIndex, status: 'invalid', errors: e.errors, ...id(e.row) })
  }

  all.sort((a, b) => a.rowIndex - b.rowIndex)

  return {
    totalRows,
    counts: {
      create: result.create.length,
      update: result.update.length,
      unchanged: result.unchanged.length,
      reactivation: result.reactivation.length,
      invalid: result.invalid.length,
      absent: result.absent.length,
    },
    newWorkplaces: [...result.newWorkplaces],
    sampleRows: all.slice(0, sampleSize),
    relationalDelta: computeRelationalDelta(result),
  }
}
