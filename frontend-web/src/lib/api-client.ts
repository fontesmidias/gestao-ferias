const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'

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

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    })

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
