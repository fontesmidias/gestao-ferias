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
