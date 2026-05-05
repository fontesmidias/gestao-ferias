import type { PrismaClient } from '@prisma/client'
import type { Suggestion } from '../reconcile.types'

/**
 * Matcher fuzzy via pg_trgm (operador % e função similarity()).
 * Retorna sugestões ranqueadas — NUNCA aplica automaticamente.
 *
 * Implementação real virá na Story 1.3.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D6
 */
export class FuzzyMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  async suggest(
    tenantId: string,
    workplaceNameRaw: string,
    limit = 3,
  ): Promise<Suggestion[]> {
    void this.prisma
    void tenantId
    void workplaceNameRaw
    void limit
    throw new Error('FuzzyMatcher.suggest() not implemented yet — Story 1.3')
  }
}
