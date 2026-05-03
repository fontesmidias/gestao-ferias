// Tipos espelhados de backend-api/src/modules/imports/types.ts
// Duplicação intencional — frontend não importa do backend (pacotes separados).

export type ImportJobStatus =
  | 'PENDING'
  | 'PARSING'
  | 'PREVIEW_READY'
  | 'APPLYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'

export type RowCategory =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'reactivation'
  | 'invalid'
  | 'absent'

export interface DiffEntry {
  from: unknown
  to: unknown
}

export type Diff = Record<string, DiffEntry>

export interface PreviewRow {
  rowIndex: number
  status: RowCategory
  diff?: Diff | null
  errors?: string[] | null
  // Campos identificadores enviados pelo backend (Story 4.0b futura extensão).
  // Se o backend ainda não enviar, fallback para placeholders.
  name?: string | null
  cpf?: string | null
  workplace?: string | null
}

export interface PreviewCounts {
  create: number
  update: number
  unchanged: number
  reactivation: number
  invalid: number
  absent: number
}

export interface PreviewLite {
  totalRows: number
  counts: PreviewCounts
  newWorkplaces: string[]
}

export interface ImportJobStatusResponse {
  jobId: string
  tenantId: string
  status: ImportJobStatus
  filename: string | null
  fileSize: number | null
  totalRows: number | null
  rowsProcessed: number | null
  rowsCreated: number | null
  rowsUpdated: number | null
  rowsInvalid: number | null
  rowsAbsent: number | null
  workplacesCreated: number | null
  previewSummary: PreviewLite | null
  failureReason: string | null
  createdAt: string
  parsedAt: string | null
  appliedAt: string | null
  completedAt: string | null
}

export interface PreviewPageResponse {
  rows: PreviewRow[]
  counts: PreviewCounts
  newWorkplaces: string[]
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface UploadResult {
  jobId: string
  status: 'PENDING'
}

export type ImportMode = 'admin' | 'tenant'

export type NewWorkplacesMode = 'create-all' | 'decide-each'

export interface ApplyBody {
  confirmTenantName: string
  createWorkplaces?: string[]
  markAbsentAsPending?: boolean
  reactivateAll?: boolean
}

export interface ApplyResult {
  jobId: string
  status: 'APPLYING'
}
