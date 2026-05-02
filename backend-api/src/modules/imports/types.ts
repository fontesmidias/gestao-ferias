// TODO(v3-3-rbac-data-driven): este módulo é parte da feature v3-2-import-tirvu.
// Tipos compartilhados entre os submódulos de imports.

export interface BankData {
  tipoPix?: string | null
  chavePix?: string | null
  banco?: string | null
  tipoConta?: string | null
  agencia?: string | null
  conta?: string | null
}

export interface EncryptedBlob {
  enc: Buffer
  iv: Buffer
  tag: Buffer
}

// ===========================================================================
// Story 2.2 — Parser tirvu-v1 + import-validator
// ===========================================================================

export type ParserVersion = 'tirvu-v1'

export interface TirvuRow {
  rowIndex: number
  rawRowIndex: number

  tirvuId: string | null
  cpf: string | null
  name: string | null
  matricula: string | null
  sexo: string | null
  nascimento: Date | string | null
  email: string | null
  telefone: string | null

  pcd: boolean | null
  deficiencia: string | null
  nomePai: string | null
  nomeMae: string | null
  rgNumero: string | null
  rgOrgao: string | null
  rgDataEmissao: Date | string | null
  pisPasep: string | null
  ctpsNumero: string | null
  ctpsSerie: string | null

  status: string | null
  empresa: string | null
  lotacao: string | null
  admissao: Date | string | null
  demissao: Date | string | null
  cargo: string | null
  jornada: string | null
  inicioJornada: Date | string | null
  sindicato: string | null

  foraDaCerca: boolean | null
  semGeo: boolean | null

  cep: string | null
  endereco: string | null
  enderecoNumero: string | null
  enderecoComplemento: string | null
  enderecoBairro: string | null
  enderecoUf: string | null
  enderecoCidade: string | null

  salario: number | null
  salarioComplemento: number | null
  salarioExtra: number | null

  tipoPix: string | null
  chavePix: string | null
  banco: string | null
  tipoConta: string | null
  agencia: string | null
  conta: string | null

  dataLog: Date | string | null
}

export interface ValidationResult {
  status: 'valid' | 'invalid'
  errors: string[]
}
