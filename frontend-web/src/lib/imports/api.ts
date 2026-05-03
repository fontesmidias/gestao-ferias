import { HttpClient } from '@/lib/api-client'
import type {
  ImportJobStatusResponse,
  ImportMode,
  PaginationMeta,
  PreviewPageResponse,
  RowCategory,
  UploadResult,
} from './types'

// Backend usa envelope { data, error, meta } nas rotas /admin/imports e /imports.
// Helper simples para desempacotar.
interface Envelope<T> {
  data: T
  error: { code: string; message: string } | null
  meta?: { pagination?: PaginationMeta } | null
}

function unwrap<T>(env: Envelope<T>): T {
  if (env.error) {
    const err = new Error(env.error.message) as Error & { code?: string }
    err.code = env.error.code
    throw err
  }
  return env.data
}

function basePath(mode: ImportMode): string {
  return mode === 'admin' ? '/admin/imports' : '/imports'
}

export const importsApi = {
  async upload(
    mode: ImportMode,
    file: File,
    tenantId: string | null,
    onProgress?: (pct: number) => void,
  ): Promise<UploadResult> {
    const form = new FormData()
    form.append('file', file, file.name)
    if (mode === 'admin') {
      if (!tenantId) throw new Error('tenantId é obrigatório no modo admin')
      form.append('tenantId', tenantId)
    }
    const env = (await HttpClient.uploadWithProgress(
      `${basePath(mode)}/employees`,
      form,
      onProgress,
    )) as Envelope<UploadResult>
    return unwrap<UploadResult>(env)
  },

  async getStatus(mode: ImportMode, jobId: string): Promise<ImportJobStatusResponse> {
    const env = await HttpClient.get(`${basePath(mode)}/${jobId}/status`)
    return unwrap<ImportJobStatusResponse>(env)
  },

  async getPreview(
    mode: ImportMode,
    jobId: string,
    opts: { status?: RowCategory; page?: number; limit?: number } = {},
  ): Promise<{ data: PreviewPageResponse; pagination: PaginationMeta }> {
    const params = new URLSearchParams()
    if (opts.status) params.set('status', opts.status)
    if (opts.page) params.set('page', String(opts.page))
    if (opts.limit) params.set('limit', String(opts.limit))
    const qs = params.toString()
    const url = `${basePath(mode)}/${jobId}/preview${qs ? `?${qs}` : ''}`
    const env: Envelope<PreviewPageResponse> = await HttpClient.get(url)
    if (env.error) {
      const err = new Error(env.error.message) as Error & { code?: string }
      err.code = env.error.code
      throw err
    }
    return {
      data: env.data,
      pagination: env.meta?.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 0 },
    }
  },

  async cancel(mode: ImportMode, jobId: string): Promise<void> {
    const env = await HttpClient.post(`${basePath(mode)}/${jobId}/cancel`, {})
    unwrap(env)
  },

  errorReportUrl(mode: ImportMode, jobId: string): string {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'
    return `${apiUrl}${basePath(mode)}/${jobId}/error-report.xlsx`
  },
}
