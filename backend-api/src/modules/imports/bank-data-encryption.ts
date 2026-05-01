// AES-256-GCM com HKDF-SHA256 derivation por tenant.
// LGPD: bankData encriptado em repouso, IV único por registro, auth tag detecta tampering.
// Master key em env BANK_DATA_ENCRYPTION_KEY (32 bytes base64).
// TODO(v3-3-rbac-data-driven): mantém estável; encryption não muda quando RBAC virar data-driven.

import { hkdfSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { BankData, EncryptedBlob } from './types'

const RAW_KEY = process.env.BANK_DATA_ENCRYPTION_KEY
if (!RAW_KEY) {
  throw new Error(
    'BANK_DATA_ENCRYPTION_KEY is required. Generate with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"'
  )
}

const MASTER_KEY = Buffer.from(RAW_KEY, 'base64')
if (MASTER_KEY.length !== 32) {
  throw new Error(
    `BANK_DATA_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${MASTER_KEY.length}). Use base64-encoded 256-bit key.`
  )
}

const HKDF_INFO = Buffer.from('gestao-ferias.bankData', 'utf8')
const IV_LENGTH = 12 // GCM padrão (NIST SP 800-38D)
const KEY_LENGTH = 32 // AES-256

export function deriveTenantKey(tenantId: string): Buffer {
  const salt = Buffer.from(tenantId, 'utf8')
  const derived = hkdfSync('sha256', MASTER_KEY, salt, HKDF_INFO, KEY_LENGTH)
  return Buffer.from(derived)
}

export function encryptBankData(data: BankData, tenantId: string): EncryptedBlob {
  const key = deriveTenantKey(tenantId)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { enc, iv, tag }
}

export function decryptBankData(blob: EncryptedBlob, tenantId: string): BankData {
  const key = deriveTenantKey(tenantId)
  const decipher = createDecipheriv('aes-256-gcm', key, blob.iv)
  decipher.setAuthTag(blob.tag)
  const plaintext = Buffer.concat([decipher.update(blob.enc), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as BankData
}
