// Story 5.2 — Lógica pura de resolução de bankData no GET /employees/:id.
// Extraído da route para permitir unit-test isolado (sem Fastify+Prisma full).

import { decryptBankData } from '../imports/bank-data-encryption'
import { roleHasPermission } from '../auth/permissions'
import type { BankData } from '../imports/types'

export interface BankDataInput {
  // Prisma 7 retorna Uint8Array para Bytes; aceitamos ambos e convertemos.
  enc: Uint8Array | Buffer | null
  iv: Uint8Array | Buffer | null
  tag: Uint8Array | Buffer | null
}

function toBuffer(b: Uint8Array | Buffer | null): Buffer {
  if (b == null) return Buffer.alloc(0)
  return Buffer.isBuffer(b) ? b : Buffer.from(b)
}

export interface ResolveBankDataOptions {
  tenantId: string
  /** Header `X-Show-Bank-Data` parseado para boolean. */
  wantsUnmask: boolean
  /** Role do user para checar permission `bankData.view`. */
  role: string | undefined
  /** Injeta decrypt para tests; default usa o real. */
  decrypt?: typeof decryptBankData
}

export type ResolveBankDataResult =
  | { kind: 'omit' }                                                     // sem dados cadastrados E não pediu unmask
  | { kind: 'forbidden' }                                                // pediu unmask sem permission
  | { kind: 'masked'; data: { masked: true; last4: string; tipoPix: string | null; error?: 'unavailable' } }
  | { kind: 'unmasked'; data: BankData; shouldAudit: true }
  | { kind: 'decryptError' }                                             // falha decrypt em modo unmask

export function resolveBankDataField(
  input: BankDataInput,
  options: ResolveBankDataOptions,
): ResolveBankDataResult {
  const decrypt = options.decrypt ?? decryptBankData
  const has = input.enc != null && input.iv != null && input.tag != null

  if (options.wantsUnmask) {
    if (!roleHasPermission(options.role, 'bankData.view')) {
      return { kind: 'forbidden' }
    }
    if (!has) return { kind: 'omit' }
    try {
      const data = decrypt(
        { enc: toBuffer(input.enc), iv: toBuffer(input.iv), tag: toBuffer(input.tag) },
        options.tenantId,
      )
      return { kind: 'unmasked', data, shouldAudit: true }
    } catch {
      return { kind: 'decryptError' }
    }
  }

  // Modo mascarado (default).
  if (!has) return { kind: 'omit' }
  try {
    const data = decrypt(
      { enc: toBuffer(input.enc), iv: toBuffer(input.iv), tag: toBuffer(input.tag) },
      options.tenantId,
    )
    const contaDigits = String(data.conta ?? '').replace(/\D/g, '')
    const last4 = contaDigits.length >= 4 ? contaDigits.slice(-4) : 'XXXX'
    return {
      kind: 'masked',
      data: { masked: true, last4, tipoPix: data.tipoPix ?? null },
    }
  } catch {
    return {
      kind: 'masked',
      data: { masked: true, last4: '????', tipoPix: null, error: 'unavailable' },
    }
  }
}
