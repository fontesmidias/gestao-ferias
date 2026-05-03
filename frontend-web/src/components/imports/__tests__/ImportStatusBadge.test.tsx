import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImportStatusBadge } from '../ImportStatusBadge'
import type { RowCategory } from '@/lib/imports/types'

const cases: Array<{ status: RowCategory; label: string }> = [
  { status: 'create', label: 'Criar' },
  { status: 'update', label: 'Atualizar' },
  { status: 'invalid', label: 'Inválido' },
  { status: 'absent', label: 'Ausente' },
  { status: 'reactivation', label: 'Reativação' },
  { status: 'unchanged', label: 'Sem alterações' },
]

describe('ImportStatusBadge', () => {
  cases.forEach(({ status, label }) => {
    it(`renderiza label ${label} para status ${status}`, () => {
      render(<ImportStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeTruthy()
    })

    it(`expõe role status com aria-label para ${status}`, () => {
      const { container } = render(<ImportStatusBadge status={status} />)
      const badge = container.querySelector('[role="status"]')
      expect(badge).toBeTruthy()
      expect(badge?.getAttribute('aria-label')).toContain(label)
    })

    it(`renderiza ícone (svg) para ${status} — NFR22 redundância cor+ícone`, () => {
      const { container } = render(<ImportStatusBadge status={status} />)
      expect(container.querySelector('svg')).toBeTruthy()
    })
  })
})
