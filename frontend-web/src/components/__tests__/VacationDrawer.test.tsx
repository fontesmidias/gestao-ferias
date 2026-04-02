import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import VacationDrawer from '../VacationDrawer'

// Mock the lucide-react icons so they don't cause issues in JSDOM
vi.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x">X</div>,
  Calendar: () => <div data-testid="icon-calendar">C</div>,
  AlertTriangle: () => <div data-testid="icon-alert">A</div>,
  CheckCircle2: () => <div data-testid="icon-check">Ch</div>,
  DollarSign: () => <div data-testid="icon-dollar">$</div>
}))

describe('VacationDrawer Component', () => {
  const mockEmployee = {
    name: 'Ana Oliveira',
    position: 'Software Engineer',
    balance: 30,
    salary: 12500
  }

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    employee: mockEmployee
  }

  it('should render correctly when open', () => {
    render(<VacationDrawer {...defaultProps} />)
    
    expect(screen.getByText('Ana Oliveira')).toBeInTheDocument()
    expect(screen.getByText('30 dias')).toBeInTheDocument()
    expect(screen.getByText('R$ 12.500')).toBeInTheDocument()
  })

  it('should not render when isOpen is false', () => {
    const { container } = render(<VacationDrawer {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('should validate CLT Art. 134 rules (Fridays blocked)', () => {
    render(<VacationDrawer {...defaultProps} />)
    
    const startDateInput = screen.getByLabelText(/Data de Início/i)
    const endDateInput = screen.getByLabelText(/Data de Término/i)
    
    // Simulate Friday 08/05/2026
    fireEvent.change(startDateInput, { target: { value: '2026-05-08' } })
    fireEvent.change(endDateInput, { target: { value: '2026-05-20' } })

    expect(screen.getByText(/As férias não podem iniciar em quintas ou sextas/i)).toBeInTheDocument()
    
    // Check if Confirm button is disabled
    const button = screen.getByRole('button', { name: /Enviar para Avaliação do RH/i })
    expect(button).toBeDisabled()
  })

  it('should allow valid dates and show success message', () => {
    render(<VacationDrawer {...defaultProps} />)
    
    const startDateInput = screen.getByLabelText(/Data de Início/i)
    const endDateInput = screen.getByLabelText(/Data de Término/i)
    
    // Simulate Monday 11/05/2026
    fireEvent.change(startDateInput, { target: { value: '2026-05-11' } })
    // Minimum 5 days
    fireEvent.change(endDateInput, { target: { value: '2026-05-20' } })

    expect(screen.getByText(/Período válido conforme as regras da CLT/i)).toBeInTheDocument()
    
    const button = screen.getByRole('button', { name: /Enviar para Avaliação do RH/i })
    expect(button).not.toBeDisabled()
  })
})
