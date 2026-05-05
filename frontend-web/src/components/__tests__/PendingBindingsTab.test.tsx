import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/api-client', () => ({
  HttpClient: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('@/components/AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { HttpClient } from '@/lib/api-client'
import { useAuth } from '@/components/AuthContext'
import { PendingBindingsTab, type QueueItem } from '../reconcile/PendingBindingsTab'

const httpGet = HttpClient.get as ReturnType<typeof vi.fn>
const httpPost = HttpClient.post as ReturnType<typeof vi.fn>
const auth = useAuth as unknown as ReturnType<typeof vi.fn>

const sampleItems: QueueItem[] = [
  {
    id: 'q1',
    workplaceNameRaw: 'INEP - Sede',
    state: 'PENDING',
    suggestions: [
      { id: 'wp-a', name: 'INEP Sede', score: 0.95 },
      { id: 'wp-b', name: 'INEP Anexo', score: 0.7 },
    ],
    employee: { id: 'e1', name: 'Maria Silva' },
    createdAt: '2026-05-05T10:00:00Z',
  },
  {
    id: 'q2',
    workplaceNameRaw: 'Local Desconhecido',
    state: 'PENDING',
    suggestions: [],
    employee: { id: 'e2', name: 'João Souza' },
    createdAt: '2026-05-05T11:00:00Z',
  },
]

describe('PendingBindingsTab', () => {
  beforeEach(() => {
    httpGet.mockReset()
    httpPost.mockReset()
    auth.mockReset()
  })

  it('renderiza lista com nomes, posto raw e sugestões', async () => {
    auth.mockReturnValue({ user: { role: 'ADMIN' } })
    httpGet.mockResolvedValue({
      data: sampleItems,
      meta: { total: 2, page: 1, pageSize: 20, readOnly: false },
    })
    render(<PendingBindingsTab />)
    await waitFor(() => expect(screen.getByText('Maria Silva')).toBeTruthy())
    expect(screen.getByText('João Souza')).toBeTruthy()
    expect(screen.getByText('INEP - Sede')).toBeTruthy()
    expect(screen.getByText(/INEP Sede/)).toBeTruthy()
    expect(screen.getByText(/95%/)).toBeTruthy()
  })

  it('click em sugestão dispara POST resolve com action=link', async () => {
    auth.mockReturnValue({ user: { role: 'ADMIN' } })
    httpGet.mockResolvedValue({
      data: sampleItems,
      meta: { total: 2, page: 1, pageSize: 20, readOnly: false },
    })
    httpPost.mockResolvedValue({ data: {}, error: null, meta: null })
    render(<PendingBindingsTab />)
    await waitFor(() => expect(screen.getByText('Maria Silva')).toBeTruthy())
    const linkBtn = screen.getAllByTitle(/Vincular ao posto sugerido/i)[0]
    fireEvent.click(linkBtn)
    await waitFor(() => expect(httpPost).toHaveBeenCalled())
    expect(httpPost).toHaveBeenCalledWith(
      '/admin/workplace-reconcile-queue/q1/resolve',
      { action: 'link', workplaceId: 'wp-a' },
    )
  })

  it('AUDITOR não vê botões de ação', async () => {
    auth.mockReturnValue({ user: { role: 'AUDITOR' } })
    httpGet.mockResolvedValue({
      data: sampleItems,
      meta: { total: 2, page: 1, pageSize: 20, readOnly: true },
    })
    render(<PendingBindingsTab />)
    await waitFor(() => expect(screen.getByText('Maria Silva')).toBeTruthy())
    expect(screen.queryByText(/Criar novo posto/i)).toBeNull()
    expect(screen.queryByText(/Adiar/)).toBeNull()
    expect(screen.queryByText(/Ignorar/)).toBeNull()
    // Sugestões aparecem como botões (visualização) mas com disabled
    const linkBtns = screen.getAllByTitle(/Apenas visualização/i)
    expect(linkBtns.length).toBeGreaterThan(0)
    expect((linkBtns[0] as HTMLButtonElement).disabled).toBe(true)
  })

  it('mudança de filtro dispara novo GET com state correto', async () => {
    auth.mockReturnValue({ user: { role: 'ADMIN' } })
    httpGet.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, readOnly: false },
    })
    render(<PendingBindingsTab />)
    await waitFor(() => expect(httpGet).toHaveBeenCalledWith(expect.stringContaining('state=PENDING')))
    httpGet.mockClear()
    fireEvent.change(screen.getByLabelText(/Filtro/i), { target: { value: 'IGNORED' } })
    await waitFor(() =>
      expect(httpGet).toHaveBeenCalledWith(expect.stringContaining('state=IGNORED')),
    )
  })

  it('action defer chama POST com action=defer', async () => {
    auth.mockReturnValue({ user: { role: 'ADMIN' } })
    httpGet.mockResolvedValue({
      data: [sampleItems[1]],
      meta: { total: 1, page: 1, pageSize: 20, readOnly: false },
    })
    httpPost.mockResolvedValue({ data: {}, error: null, meta: null })
    render(<PendingBindingsTab />)
    await waitFor(() => expect(screen.getByText('João Souza')).toBeTruthy())
    fireEvent.click(screen.getByText(/Adiar/))
    await waitFor(() => expect(httpPost).toHaveBeenCalled())
    expect(httpPost).toHaveBeenCalledWith(
      '/admin/workplace-reconcile-queue/q2/resolve',
      { action: 'defer' },
    )
  })
})
