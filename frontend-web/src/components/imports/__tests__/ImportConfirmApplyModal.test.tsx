import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportConfirmApplyModal } from '../ImportConfirmApplyModal'
import type { PreviewCounts } from '@/lib/imports/types'

const COUNTS: PreviewCounts = {
  create: 47, update: 3, unchanged: 100, reactivation: 1, invalid: 2, absent: 5,
}

const noop = () => {}

describe('ImportConfirmApplyModal', () => {
  it('lista operações condicionais baseadas em counts', () => {
    render(
      <ImportConfirmApplyModal
        open
        mode="admin"
        tenantName="Servi-Plus"
        counts={COUNTS}
        newWorkplaces={['ANATEL']}
        newWorkplacesMode="create-all"
        onConfirm={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByText(/Criar 47 colaboradores/)).toBeTruthy()
    expect(screen.getByText(/Atualizar 3 colaboradores/)).toBeTruthy()
    expect(screen.getByText(/Reativar 1 colaborador/)).toBeTruthy()
    expect(screen.getByText(/Criar 1 lotação \(ANATEL\)/)).toBeTruthy()
    expect(screen.getByText(/Ignorar 2 linhas inválidas/)).toBeTruthy()
  })

  it('botão "Confirmar" disabled até nome bater (case-sensitive)', () => {
    render(
      <ImportConfirmApplyModal
        open
        mode="admin"
        tenantName="Servi-Plus"
        counts={COUNTS}
        newWorkplaces={[]}
        newWorkplacesMode="decide-each"
        onConfirm={noop}
        onClose={noop}
      />,
    )
    const confirmBtn = screen.getByRole('button', { name: /Confirmar e aplicar/ }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const input = screen.getByLabelText(/Para confirmar, digite/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'servi-plus' } })  // wrong case
    expect(confirmBtn.disabled).toBe(true)
    expect(screen.getByText(/O nome não confere/)).toBeTruthy()

    fireEvent.change(input, { target: { value: 'Servi-Plus' } })
    expect(confirmBtn.disabled).toBe(false)
  })

  it('TenantAdmin: pula confirm-typing, botão sempre habilitado', () => {
    render(
      <ImportConfirmApplyModal
        open
        mode="tenant"
        tenantName="Servi-Plus"
        counts={COUNTS}
        newWorkplaces={[]}
        newWorkplacesMode="decide-each"
        onConfirm={noop}
        onClose={noop}
      />,
    )
    expect(screen.queryByLabelText(/Para confirmar, digite/)).toBeNull()
    const confirmBtn = screen.getByRole('button', { name: /Confirmar e aplicar/ }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(false)
  })

  it('Esc fecha modal', () => {
    const onClose = vi.fn()
    render(
      <ImportConfirmApplyModal
        open
        mode="admin"
        tenantName="Servi-Plus"
        counts={COUNTS}
        newWorkplaces={[]}
        newWorkplacesMode="decide-each"
        onConfirm={noop}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('onConfirm recebe createWorkplaces conforme mode (create-all)', () => {
    const onConfirm = vi.fn()
    render(
      <ImportConfirmApplyModal
        open
        mode="tenant"
        tenantName="Servi-Plus"
        counts={COUNTS}
        newWorkplaces={['ANATEL', 'TRT-DF']}
        newWorkplacesMode="create-all"
        onConfirm={onConfirm}
        onClose={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e aplicar/ }))
    expect(onConfirm).toHaveBeenCalledWith({
      confirmTenantName: 'Servi-Plus',
      createWorkplaces: ['ANATEL', 'TRT-DF'],
    })
  })

  it('onConfirm com decide-each envia createWorkplaces vazio', () => {
    const onConfirm = vi.fn()
    render(
      <ImportConfirmApplyModal
        open
        mode="tenant"
        tenantName="Servi-Plus"
        counts={COUNTS}
        newWorkplaces={['ANATEL']}
        newWorkplacesMode="decide-each"
        onConfirm={onConfirm}
        onClose={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e aplicar/ }))
    expect(onConfirm).toHaveBeenCalledWith({
      confirmTenantName: 'Servi-Plus',
      createWorkplaces: [],
    })
  })
})
