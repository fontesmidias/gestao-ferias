import { Prisma, type PrismaClient } from '@prisma/client'
import type { MatchResult } from '../reconcile.types'
import { normalize } from './normalize'

/**
 * Matcher determinístico (case-insensitive via índice lower(name)).
 * Aplica normalize() ao input antes de comparar.
 *
 * Retorna 'unique' | 'ambiguous' | 'none' — nunca decide automaticamente
 * em caso de ambiguidade (FR10).
 *
 * Bate no índice funcional `workplaces_tenant_name_lower_idx` criado na
 * Story 1.1 (migration V3.3).
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export class DeterministicMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  async match(tenantId: string, workplaceNameRaw: string): Promise<MatchResult> {
    const normalized = normalize(workplaceNameRaw)

    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`
        SELECT id, name
          FROM workplaces
         WHERE tenant_id = ${tenantId}::uuid
           AND lower(name) = ${normalized}
         LIMIT 2
      `,
    )

    if (rows.length === 0) return { kind: 'none' }
    if (rows.length === 1) return { kind: 'unique', workplace: rows[0] }
    return { kind: 'ambiguous', candidates: rows }
  }
}
