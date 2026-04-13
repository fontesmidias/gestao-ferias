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

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
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
      throw new Error(error.message || 'Erro na requisição')
    }

    return await response.json()
  }

  static get(path: string) { return this.request(path, { method: 'GET' }) }
  static post(path: string, body: any) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }) }
  static patch(path: string, body: any) { return this.request(path, { method: 'PATCH', body: JSON.stringify(body) }) }
  static delete(path: string) { return this.request(path, { method: 'DELETE' }) }
}
