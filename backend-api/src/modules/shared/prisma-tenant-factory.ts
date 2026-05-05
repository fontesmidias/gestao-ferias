import type { PrismaClient } from '@prisma/client'

/**
 * SPIKE FINDING (Story 1.1, 2026-05-05):
 * O projeto NÃO POSSUI Prisma extension de tenant isolation.
 * O plugin `backend-api/src/plugins/prisma.ts` apenas decora `fastify.prisma`
 * com PrismaClient padrão (com adapter PrismaPg). Tenant isolation é feito
 * MANUALMENTE em cada query via filtros `where: { tenantId }` derivados do JWT.
 *
 * Implicação para Story 4.1 (Phase 2 — batch super-admin):
 *   Não há "extension" para impersonar. O batch precisará receber `tenantId`
 *   explícito como parâmetro de cada chamada de service. Cada service método
 *   deve aceitar `tenantId` no input e propagar em todas as queries Prisma.
 *
 * Esta classe (placeholder) será expandida na Story 4.1 para um helper
 * que valide e propague tenantId em contexto super-admin (loop de execuções
 * single-tenant isoladas; falha em um tenant não cascata para outros).
 *
 * Em V3.3 Phase 1 (single-tenant), `tenantId` continua vindo do JWT em cada
 * rota e a convenção atual do projeto é mantida.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D7
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/epics.md#Story-4.1
 * @see _evo-output/implementation-artifacts/v3-3-reconciliacao-postos/spike-notes.md
 */
export class PrismaTenantFactory {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * @deprecated Story 4.1 — implementar contexto super-admin
   */
  forTenant(tenantId: string): PrismaClient {
    void this.prisma
    void tenantId
    throw new Error(
      'PrismaTenantFactory.forTenant() not implemented — Story 4.1 (Phase 2)',
    )
  }
}
