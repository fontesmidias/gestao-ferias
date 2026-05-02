// TODO(v3-3-rbac-data-driven): este módulo é parte da feature v3-2-import-tirvu.
// Tipos compartilhados entre os submódulos de imports.

export interface BankData {
  tipoPix?: string | null
  chavePix?: string | null
  banco?: string | null
  tipoConta?: string | null
  agencia?: string | null
  conta?: string | null
}

export interface EncryptedBlob {
  enc: Buffer
  iv: Buffer
  tag: Buffer
}

// ===========================================================================
// Story 2.2 — Parser tirvu-v1 + import-validator
// ===========================================================================

export type ParserVersion = 'tirvu-v1'

export interface TirvuRow {
  rowIndex: number
  rawRowIndex: number

  tirvuId: string | null
  cpf: string | null
  name: string | null
  matricula: string | null
  sexo: string | null
  nascimento: Date | string | null
  email: string | null
  telefone: string | null

  pcd: boolean | null
  deficiencia: string | null
  nomePai: string | null
  nomeMae: string | null
  rgNumero: string | null
  rgOrgao: string | null
  rgDataEmissao: Date | string | null
  pisPasep: string | null
  ctpsNumero: string | null
  ctpsSerie: string | null

  status: string | null
  empresa: string | null
  lotacao: string | null
  admissao: Date | string | null
  demissao: Date | string | null
  cargo: string | null
  jornada: string | null
  inicioJornada: Date | string | null
  sindicato: string | null

  foraDaCerca: boolean | null
  semGeo: boolean | null

  cep: string | null
  endereco: string | null
  enderecoNumero: string | null
  enderecoComplemento: string | null
  enderecoBairro: string | null
  enderecoUf: string | null
  enderecoCidade: string | null

  salario: number | null
  salarioComplemento: number | null
  salarioExtra: number | null

  tipoPix: string | null
  chavePix: string | null
  banco: string | null
  tipoConta: string | null
  agencia: string | null
  conta: string | null

  dataLog: Date | string | null
}

export interface ValidationResult {
  status: 'valid' | 'invalid'
  errors: string[]
}

// ===========================================================================
// Story 2.3 — import-matcher + import-job-service
// ===========================================================================

import type { Employee, Workplace, ImportJob, ImportJobStatus } from '@prisma/client'

export type EmployeePatch = Partial<
  Pick<
    Employee,
    | 'tirvuId'
    | 'name'
    | 'birthDate'
    | 'position'
    | 'status'
    | 'branch'
    | 'workplace'
    | 'shift'
    | 'phone'
    | 'salary'
    | 'hireDate'
    | 'unionName'
    | 'terminationDate'
    | 'personalData'
    | 'address'
    | 'geofencingFlags'
    | 'inactivePending'
  >
>

export type DiffEntry = { from: unknown; to: unknown }
export type Diff = Record<string, DiffEntry>

export interface MatchContext {
  tenantId: string
  existingEmployees: Employee[]
  existingWorkplaces: Pick<Workplace, 'name'>[]
}

export type RowCategory =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'reactivation'
  | 'invalid'
  | 'absent'

export interface MatchResult {
  create: { row: TirvuRow; patch: EmployeePatch }[]
  update: { row: TirvuRow; employee: Employee; patch: EmployeePatch; diff: Diff }[]
  unchanged: { row: TirvuRow; employee: Employee }[]
  reactivation: { row: TirvuRow; employee: Employee; patch: EmployeePatch; diff: Diff }[]
  invalid: { row: TirvuRow; errors: string[] }[]
  absent: Employee[]
  newWorkplaces: string[]
}

export interface PreviewSummary {
  totalRows: number
  counts: {
    create: number
    update: number
    unchanged: number
    reactivation: number
    invalid: number
    absent: number
  }
  newWorkplaces: string[]
  sampleRows: Array<{
    rowIndex: number
    status: RowCategory
    diff?: Diff
    errors?: string[]
  }>
}

export class InvalidStateTransitionError extends Error {
  public readonly jobId: string
  public readonly current: ImportJobStatus
  public readonly expected: ImportJobStatus[]
  public readonly attempted: ImportJobStatus

  constructor(
    jobId: string,
    current: ImportJobStatus,
    expected: ImportJobStatus[],
    attempted: ImportJobStatus,
  ) {
    super(
      `ImportJob ${jobId} está em ${current}; transição para ${attempted} requer estado em [${expected.join(', ')}]`,
    )
    this.name = 'InvalidStateTransitionError'
    this.jobId = jobId
    this.current = current
    this.expected = expected
    this.attempted = attempted
  }
}

export type { ImportJob, ImportJobStatus, Employee, Workplace }
