import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImportApplyingView } from '../ImportApplyingView'

const APPLIED_AT = new Date(Date.now() - 30_000).toISOString()  // 30s ago

describe('ImportApplyingView', () => {
  it('renderiza progress e contagens', () => {
    render(
      <ImportApplyingView
        rowsProcessed={250}
        totalRows={1000}
        rowsCreated={200}
        rowsUpdated={40}
        rowsInvalid={5}
        rowsAbsent={5}
        appliedAt={APPLIED_AT}
      />,
    )
    expect(screen.getByText(/Aplicando importação/)).toBeTruthy()
    expect(screen.getByText(/Processadas:/)).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
  })

  it('ETA não aparece com menos de 100 rows processadas', () => {
    render(
      <ImportApplyingView
        rowsProcessed={50}
        totalRows={1000}
        rowsCreated={50}
        rowsUpdated={0}
        rowsInvalid={0}
        rowsAbsent={0}
        appliedAt={APPLIED_AT}
      />,
    )
    expect(screen.getByText(/Calculando…/)).toBeTruthy()
  })

  it('ETA aparece quando rowsProcessed >= 100', () => {
    render(
      <ImportApplyingView
        rowsProcessed={500}
        totalRows={1000}
        rowsCreated={500}
        rowsUpdated={0}
        rowsInvalid={0}
        rowsAbsent={0}
        appliedAt={APPLIED_AT}
      />,
    )
    // ETA exibida em formato "~Xs" ou "~Xm Ys".
    expect(screen.queryByText(/Calculando…/)).toBeNull()
    expect(screen.getByText(/^~/)).toBeTruthy()
  })

  it('cards de counts refletem props', () => {
    render(
      <ImportApplyingView
        rowsProcessed={100}
        totalRows={1000}
        rowsCreated={80}
        rowsUpdated={15}
        rowsInvalid={3}
        rowsAbsent={2}
        appliedAt={APPLIED_AT}
      />,
    )
    expect(screen.getByText('80')).toBeTruthy()
    expect(screen.getByText('15')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })
})
