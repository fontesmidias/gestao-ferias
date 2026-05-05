import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/api-client', () => ({
  HttpClient: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('@/components/AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('../reconcile/ReconcileProgressModal', () => ({
  ReconcileProgressModal: () => null,
}))

import { HttpClient } from '@/lib/api-client'
import { useAuth } from '@/components/AuthContext'
import { ReconcileBanner } from '../reconcile/ReconcileBanner'

const httpGet = HttpClient.get as ReturnType<typeof vi.fn>
const auth = useAuth as unknown as ReturnType<typeof vi.fn>

describe('ReconcileBanner', () => {
  beforeEach(() => {
    httpGet.mockReset()
    auth.mockReset()
  })

  it('exibe banner quando ADMIN tem pendingEmployees > 0', async () => {
    auth.mockReturnValue({ user: { role: 'ADMIN' } })
    httpGet.mockResolvedValue({
      data: { pendingEmployees: 42, hasRunningJob: false },
    })
    render(<ReconcileBanner />)
    await waitFor(() => {
      expect(screen.getByText(/vincular 42 colaboradores/i)).toBeTruthy()
    })
    expect(screen.getByText(/Iniciar reconciliação/i)).toBeTruthy()
  })

  it('oculto quando pendingEmployees === 0', async () => {
    auth.mockReturnValue({ user: { role: 'ADMIN' } })
    httpGet.mockResolvedValue({
      data: { pendingEmployees: 0, hasRunningJob: false },
    })
    const { container } = render(<ReconcileBanner />)
    await waitFor(() => expect(httpGet).toHaveBeenCalled())
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('oculto para AUDITOR (sem permissão de disparar)', async () => {
    auth.mockReturnValue({ user: { role: 'AUDITOR' } })
    httpGet.mockResolvedValue({
      data: { pendingEmployees: 10, hasRunningJob: false },
    })
    const { container } = render(<ReconcileBanner />)
    // Banner não renderiza independente do response
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('mostra "Ver progresso" quando hasRunningJob=true', async () => {
    auth.mockReturnValue({ user: { role: 'SUPERADMIN' } })
    httpGet.mockResolvedValue({
      data: {
        pendingEmployees: 5,
        hasRunningJob: true,
        runningJobId: 'job-1',
      },
    })
    render(<ReconcileBanner />)
    await waitFor(() => {
      expect(screen.getByText(/Reconciliação em andamento/i)).toBeTruthy()
    })
    expect(screen.getByText(/Ver progresso/i)).toBeTruthy()
  })
})
