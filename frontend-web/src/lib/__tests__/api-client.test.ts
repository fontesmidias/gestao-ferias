import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage
const mockStorage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value },
  removeItem: (key: string) => { delete mockStorage[key] },
})

import { HttpClient } from '../api-client'

describe('HttpClient', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  })

  it('sends GET request with auth header when token exists', async () => {
    mockStorage['token'] = 'test-jwt-token'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' })
    })

    await HttpClient.get('/test')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/test')
    expect(opts.headers['Authorization']).toBe('Bearer test-jwt-token')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' })
    })

    await expect(HttpClient.get('/protected')).rejects.toThrow('Unauthorized')
  })

  it('sends POST with JSON body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ created: true })
    })

    await HttpClient.post('/items', { name: 'test' })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ name: 'test' })
  })
})
