import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'
import type {
  ApplyBody,
  ApplyResult,
  ImportJobStatusResponse,
  ImportMode,
  PaginationMeta,
  PreviewPageResponse,
  RowCategory,
  UploadResult,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'

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
    // Backend é GET /:jobId (sem sufixo /status). O sufixo errado causava 404
    // silencioso: upload OK + parse OK, mas a UI nunca via PREVIEW_READY.
    const env = await HttpClient.get(`${basePath(mode)}/${jobId}`)
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

  async apply(mode: ImportMode, jobId: string, body: ApplyBody): Promise<ApplyResult> {
    const env = await HttpClient.post(`${basePath(mode)}/${jobId}/apply`, body)
    return unwrap<ApplyResult>(env)
  },

  errorReportUrl(mode: ImportMode, jobId: string): string {
    return `${API_URL}${basePath(mode)}/${jobId}/error-report.xlsx`
  },

  /**
   * Download autenticado: fetch com Bearer + blob + trigger <a download>.
   * Browsers não enviam Authorization em <a href>, daí esse padrão.
   */
  async downloadErrorReport(mode: ImportMode, jobId: string): Promise<void> {
    const url = importsApi.errorReportUrl(mode, jobId)
    await downloadAuthenticated(url, 'import-erros.xlsx', { emptyMessage: 'Sem linhas inválidas para baixar.' })
  },

  /**
   * Stub: backend ainda não tem rota de download do arquivo original (Story 4.2 open question).
   * Tenta GET; se 404 → toast informando que não está disponível.
   */
  async downloadOriginal(mode: ImportMode, jobId: string): Promise<void> {
    const url = `${API_URL}${basePath(mode)}/${jobId}/file`
    try {
      await downloadAuthenticated(url, 'import-original.xlsx')
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status === 404) {
        toast.info('Download do arquivo original ainda não disponível neste ambiente.')
        return
      }
      throw err
    }
  },
}

interface DownloadOptions {
  /** Mensagem mostrada quando backend retorna 204 No Content. */
  emptyMessage?: string
}

async function downloadAuthenticated(
  url: string,
  fallbackFilename: string,
  opts: DownloadOptions = {},
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (res.status === 204) {
    if (opts.emptyMessage) toast.info(opts.emptyMessage)
    return
  }

  if (!res.ok) {
    const err = new Error(`Download falhou (HTTP ${res.status})`) as Error & { status?: number }
    err.status = res.status
    throw err
  }

  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') ?? ''
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const filename = m?.[1] ? decodeURIComponent(m[1]) : fallbackFilename

  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
