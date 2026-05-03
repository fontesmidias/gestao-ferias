import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImportFailureView } from '../ImportFailureView'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

const baseProps = {
  mode: 'admin' as const,
  jobId: 'job-1',
  tenantName: 'Servi-Plus',
  appliedAt: '2026-05-02T10:00:00.000Z',
  completedAt: '2026-05-02T10:00:08.000Z',
  onRetry: () => {},
}

describe('ImportFailureView', () => {
  it('mostra microcopy específica para INVALID_TIRVU_HEADER', () => {
    render(
      <ImportFailureView
        {...baseProps}
        result="failed"
        failureReason="INVALID_TIRVU_HEADER"
      />,
    )
    expect(screen.getByText(/Layout do arquivo não reconhecido/)).toBeTruthy()
  })

  it('mostra microcopy específica para timed_out', () => {
    render(
      <ImportFailureView
        {...baseProps}
        result="timed_out"
        failureReason={null}
      />,
    )
    expect(screen.getByText(/ultrapassou o tempo limite/)).toBeTruthy()
  })

  it('fallback genérico inclui jobId quando reason é desconhecido', () => {
    render(
      <ImportFailureView
        {...baseProps}
        result="failed"
        failureReason="SOMETHING_WEIRD"
      />,
    )
    expect(screen.getByText(/ID do job: job-1/)).toBeTruthy()
  })

  it('renderiza botões "Baixar arquivo original" e "Tentar novamente"', () => {
    render(
      <ImportFailureView
        {...baseProps}
        result="failed"
        failureReason="FILE_CORRUPT"
      />,
    )
    expect(screen.getByRole('button', { name: /Baixar arquivo original/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy()
  })
})
