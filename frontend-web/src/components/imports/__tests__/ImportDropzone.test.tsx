import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImportDropzone } from '../ImportDropzone'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe('ImportDropzone', () => {
  it('renderiza estado idle com instrução de drag', () => {
    render(<ImportDropzone onFile={() => {}} />)
    expect(screen.getByText(/Arraste o arquivo aqui/i)).toBeTruthy()
    expect(screen.getByText(/Apenas .xlsx, até 10 MB/i)).toBeTruthy()
  })

  it('exibe mensagem de tenant quando disabled', () => {
    render(<ImportDropzone disabled onFile={() => {}} />)
    expect(screen.getByText(/Selecione o tenant alvo primeiro/i)).toBeTruthy()
  })

  it('mostra progresso quando uploading=true', () => {
    render(<ImportDropzone uploading uploadProgress={42} onFile={() => {}} />)
    expect(screen.getByText(/Enviando arquivo… 42%/i)).toBeTruthy()
  })

  it('renderiza erro externo via prop', () => {
    render(<ImportDropzone externalError="Tamanho máximo 10MB." onFile={() => {}} />)
    expect(screen.getByText(/Tamanho máximo 10MB/i)).toBeTruthy()
  })

  it('input file aceita apenas .xlsx (atributo accept)', () => {
    const { container } = render(<ImportDropzone onFile={() => {}} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.accept).toContain('.xlsx')
  })
})
