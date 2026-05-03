import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImportSummaryView } from '../ImportSummaryView'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

const noop = () => {}

const baseProps = {
  mode: 'admin' as const,
  jobId: 'job-1',
  tenantId: '11111111-1111-1111-1111-111111111111',
  tenantName: 'Servi-Plus',
  appliedAt: '2026-05-02T10:00:00.000Z',
  completedAt: '2026-05-02T10:02:03.000Z',
  onNewImport: noop,
}

describe('ImportSummaryView', () => {
  it('renderiza título e cards finais', () => {
    render(
      <ImportSummaryView
        {...baseProps}
        rowsCreated={47}
        rowsUpdated={3}
        workplacesCreated={2}
        rowsInvalid={0}
        rowsAbsent={0}
        rowsReactivated={0}
      />,
    )
    expect(screen.getByText(/Importação concluída/)).toBeTruthy()
    expect(screen.getByText('47')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('botão "Baixar relatório" só aparece se rowsInvalid > 0', () => {
    const { rerender } = render(
      <ImportSummaryView
        {...baseProps}
        rowsCreated={47}
        rowsUpdated={3}
        workplacesCreated={2}
        rowsInvalid={0}
        rowsAbsent={0}
        rowsReactivated={0}
      />,
    )
    expect(screen.queryByText(/Baixar relatório/)).toBeNull()

    rerender(
      <ImportSummaryView
        {...baseProps}
        rowsCreated={47}
        rowsUpdated={3}
        workplacesCreated={2}
        rowsInvalid={5}
        rowsAbsent={0}
        rowsReactivated={0}
      />,
    )
    expect(screen.getByText(/Baixar relatório/)).toBeTruthy()
  })

  it('linha "candidatos a inativar" só aparece se rowsAbsent > 0', () => {
    const { rerender } = render(
      <ImportSummaryView
        {...baseProps}
        rowsCreated={47}
        rowsUpdated={3}
        workplacesCreated={2}
        rowsInvalid={0}
        rowsAbsent={0}
        rowsReactivated={0}
      />,
    )
    expect(screen.queryByText(/candidatos a inativar/i)).toBeNull()

    rerender(
      <ImportSummaryView
        {...baseProps}
        rowsCreated={47}
        rowsUpdated={3}
        workplacesCreated={2}
        rowsInvalid={0}
        rowsAbsent={3}
        rowsReactivated={0}
      />,
    )
    expect(screen.getByText(/candidatos a inativar/i)).toBeTruthy()
  })

  it('linha de reativação só aparece com rowsReactivated > 0', () => {
    render(
      <ImportSummaryView
        {...baseProps}
        rowsCreated={47}
        rowsUpdated={3}
        workplacesCreated={2}
        rowsInvalid={0}
        rowsAbsent={0}
        rowsReactivated={1}
      />,
    )
    expect(screen.getByText(/colaborador reativado/i)).toBeTruthy()
  })
})
