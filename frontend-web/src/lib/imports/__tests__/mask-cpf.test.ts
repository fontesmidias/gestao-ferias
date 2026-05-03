import { describe, it, expect } from 'vitest'
import { maskCpf } from '../mask-cpf'

describe('maskCpf', () => {
  it('mascara CPF formatado', () => {
    expect(maskCpf('123.456.789-00')).toBe('***.456.78-XX')
  })
  it('mascara CPF só com dígitos', () => {
    expect(maskCpf('12345678900')).toBe('***.456.78-XX')
  })
  it('passthrough para input inválido', () => {
    expect(maskCpf('abc')).toBe('abc')
  })
  it('retorna em-dash para vazio/null', () => {
    expect(maskCpf(null)).toBe('—')
    expect(maskCpf('')).toBe('—')
  })
})
