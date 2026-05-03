import { markActivity } from './session-activity'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null
  if (!refreshToken) return null

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })

    if (!response.ok) {
      // Refresh token inválido ou expirado — limpar tudo
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      return null
    }

    const data = await response.json()
    localStorage.setItem('token', data.token)
    localStorage.setItem('refreshToken', data.refreshToken)
    return data.token
  } catch {
    return null
  }
}

export class HttpClient {
  static async request(path: string, options: any = {}) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

    // Só incluímos Content-Type quando há body NÃO-FormData. Fastify reclama se vir
    // Content-Type: application/json sem body (ex: DELETE sem payload). E FormData o
    // navegador define o Content-Type com boundary correto automaticamente.
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
    const headers: Record<string, string> = { ...(options.headers || {}) }
    if (options.body !== undefined && !isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    let response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    })

    // Se receber 401, tentar refresh automático (exceto em rotas de auth)
    if (response.status === 401 && !path.startsWith('/auth/')) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`
        response = await fetch(`${API_URL}${path}`, {
          ...options,
          headers
        })
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      const err: any = new Error(error.message || 'Erro na requisição')
      err.status = response.status
      err.body = error // preserva payload completo (ex: { conflicts: [...] })
      throw err
    }

    // Marca atividade de sessão (FR-V31-SES-001 — idle timer reset)
    markActivity()

    return await response.json()
  }

  static get(path: string) { return this.request(path, { method: 'GET' }) }
  static post(path: string, body: any) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }) }
  static patch(path: string, body: any) { return this.request(path, { method: 'PATCH', body: JSON.stringify(body) }) }
  static delete(path: string) { return this.request(path, { method: 'DELETE' }) }

  /** Upload multipart (ex: logo). Não envia Content-Type — o navegador define o boundary. */
  static async upload(path: string, field: string, file: File) {
    const form = new FormData()
    form.append(field, file, file.name)
    return this.request(path, { method: 'POST', body: form })
  }

  /**
   * Upload multipart com progresso real via XMLHttpRequest.
   * fetch() não emite upload progress — XHR é necessário.
   * Inclui auth header + retry com refresh token em 401.
   */
  static async uploadWithProgress(
    path: string,
    formData: FormData,
    onProgress?: (pct: number) => void,
  ): Promise<unknown> {
    // Backend pode responder em duas formas:
    //  - Plano (legacy): { message: '...' } ou { error: '...' }
    //  - Envelope (rotas /imports): { data: null, error: { code, message }, meta: null }
    interface XhrResult {
      status: number
      body: {
        message?: string
        error?: string | { code?: string; message?: string }
      } & Record<string, unknown>
    }
    const send = (token: string | null): Promise<XhrResult> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_URL}${path}`)
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        if (onProgress) {
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100))
          }
        }
        xhr.onload = () => {
          let body: XhrResult['body']
          try { body = JSON.parse(xhr.responseText) } catch { body = { message: xhr.responseText || 'Erro desconhecido' } }
          resolve({ status: xhr.status, body })
        }
        xhr.onerror = () => reject(new Error('Falha de rede no upload'))
        xhr.onabort = () => reject(new Error('Upload cancelado'))
        xhr.send(formData)
      })

    let token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    let result = await send(token)

    if (result.status === 401) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        token = newToken
        result = await send(token)
      }
    }

    if (result.status < 200 || result.status >= 300) {
      const rawErr = result.body?.error
      const envelopeMsg = rawErr && typeof rawErr === 'object' ? rawErr.message : undefined
      const stringErr = typeof rawErr === 'string' ? rawErr : undefined
      const message = envelopeMsg ?? result.body?.message ?? stringErr ?? 'Erro no upload'
      const err = new Error(message) as Error & { status?: number; body?: unknown }
      err.status = result.status
      err.body = result.body
      throw err
    }

    markActivity()
    return result.body
  }
}
