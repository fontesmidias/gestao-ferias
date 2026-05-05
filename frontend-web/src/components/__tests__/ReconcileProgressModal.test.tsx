import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/api-client', () => ({
  HttpClient: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('@/lib/reconcile/use-reconcile-job', () => ({
  useReconcileJob: vi.fn(),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

import { HttpClient } from '@/lib/api-client'
import { useReconcileJob } from '@/lib/reconcile/use-reconcile-job'
import { ReconcileProgressModal } from '../reconcile/ReconcileProgressModal'

const httpPost = HttpClient.post as ReturnType<typeof vi.fn>
const useJob = useReconcileJob as unknown as ReturnType<typeof vi.fn>

describe('ReconcileProgressModal', () => {
  beforeEach(() => {
    httpPost.mockReset()
    useJob.mockReset()
  })

  it('exibe progresso e contadores enquanto RUNNING', async () => {
    httpPost.mockResolvedValue({ data: { jobId: 'j1', status: 'RUNNING' } })
    useJob.mockReturnValue({
      job: {
        id: 'j1',
        status: 'RUNNING',
        totalEmployees: 100,
        matched: 25,
        queued: 5,
        ignored: 2,
        errors: 0,
        durationMs: null,
        failureReason: null,
        progressPct: 32,
        startedAt: null,
        completedAt: null,
      },
      error: null,
      loading: false,
    })
    render(<ReconcileProgressModal open={true} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/colaboradores processados/i)).toBeTruthy())
    expect(screen.getByText('25')).toBeTruthy() // matched
    expect(screen.getByText('5')).toBeTruthy() // queued
    expect(screen.getByText(/32%/)).toBeTruthy()
    const bar = document.querySelector('[data-testid="progress-bar"]') as HTMLElement
    expect(bar?.style.width).toBe('32%')
  })

  it('exibe ReconcileSummaryReport quando status=COMPLETED', () => {
    useJob.mockReturnValue({
      job: {
        id: 'j2',
        status: 'COMPLETED',
        totalEmployees: 50,
        matched: 40,
        queued: 8,
        ignored: 2,
        errors: 0,
        durationMs: 154000,
        failureReason: null,
        progressPct: 100,
        startedAt: null,
        completedAt: '2026-05-05T10:00:00Z',
      },
      error: null,
      loading: false,
    })
    render(
      <ReconcileProgressModal
        open={true}
        onClose={() => {}}
        existingJobId="j2"
      />,
    )
    expect(screen.getByText(/Reconciliação concluída/i)).toBeTruthy()
    expect(screen.getByText(/Ver Pendências de Vínculo/i)).toBeTruthy()
    expect(screen.getByText('40')).toBeTruthy() // matched final
    expect(screen.getByText(/2m 34s/)).toBeTruthy() // 154000ms = 2m 34s
  })

  it('exibe failureReason quando status=FAILED', () => {
    useJob.mockReturnValue({
      job: {
        id: 'j3',
        status: 'FAILED',
        totalEmployees: null,
        matched: 0, queued: 0, ignored: 0, errors: 1,
        durationMs: 5000,
        failureReason: 'Connection lost',
        progressPct: 0,
        startedAt: null, completedAt: null,
      },
      error: null,
      loading: false,
    })
    render(
      <ReconcileProgressModal
        open={true}
        onClose={() => {}}
        existingJobId="j3"
      />,
    )
    expect(screen.getByText(/Reconcile falhou/i)).toBeTruthy()
    expect(screen.getByText(/Connection lost/i)).toBeTruthy()
  })
})
