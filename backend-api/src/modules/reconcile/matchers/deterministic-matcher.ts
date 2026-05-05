import type { PrismaClient } from '@prisma/client'
import type { MatchResult } from '../reconcile.types'

/**
 * Matcher determinístico (case-insensitive via índice lower(name), NFC, trim, collapse).
 * Retorna 'unique' | 'ambiguous' | 'none' — nunca decide automaticamente em ambiguidade.
 *
 * Implementação real virá na Story 1.3.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export class DeterministicMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  async match(tenantId: string, workplaceNameRaw: string): Promise<MatchResult> {
    void this.prisma
    void tenantId
    void workplaceNameRaw
    throw new Error('DeterministicMatcher.match() not implemented yet — Story 1.3')
  }
}
