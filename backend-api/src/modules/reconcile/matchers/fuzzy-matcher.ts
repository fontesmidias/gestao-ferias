import { Prisma, type PrismaClient } from '@prisma/client'
import type { Suggestion } from '../reconcile.types'
import { normalize } from './normalize'

/**
 * Matcher fuzzy via pg_trgm (operador % e função similarity()).
 * Aplica normalize() ao input antes de consultar.
 *
 * Retorna sugestões ranqueadas por score desc — NUNCA aplica automaticamente
 * (FR11). Caller (UI ou ReconcileQueueService) decide o que fazer com as
 * sugestões.
 *
 * Operador % usa o threshold default do pg_trgm (pg_trgm.similarity_threshold
 * = 0.3 por default Postgres). Bate no índice GIN `workplaces_tenant_name_trgm_idx`
 * criado na Story 1.1.
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
    const normalized = normalize(workplaceNameRaw)

    return this.prisma.$queryRaw<Suggestion[]>(
      Prisma.sql`
        SELECT id, name, similarity(name, ${normalized}) AS score
          FROM workplaces
         WHERE tenant_id = ${tenantId}::uuid
           AND name % ${normalized}
         ORDER BY score DESC
         LIMIT ${limit}
      `,
    )
  }
}
