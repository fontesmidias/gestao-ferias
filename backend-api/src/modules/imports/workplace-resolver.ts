import type { PrismaClient } from '@prisma/client'
import { normalize } from '../reconcile/matchers/normalize'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export interface WorkplaceResolution {
  workplaceId: string
  positionId: string
  /** True se o Workplace foi criado nesta operação (vs. encontrado existente). */
  created: boolean
}

/**
 * Resolve um Workplace a partir do nome bruto vindo da planilha Tirvu.
 * Aplica normalize() (NFC + lowercase + trim + collapse whitespace) para casar
 * variações de digitação. Em caso de ambíguo (>1 match), usa o mais antigo.
 *
 * Se nenhum Workplace casa, cria com `importedBy='AUTO_TIRVU'` + WorkplacePosition
 * padrão (`role='Operacional'`, `requiredCount=1`) — Story 2.1, FR21.
 *
 * V3.4 MVP M2: aceita `role` opcional. Quando fornecido, busca/cria a
 * WorkplacePosition específica para esse cargo no Workplace, em vez de retornar
 * a primeira disponível. Isso garante que cada (posto, cargo) único do Tirvu
 * vire uma WorkplacePosition real, refletindo a estrutura operacional.
 *
 * Sempre retorna `positionId` válido, criando WorkplacePosition padrão quando
 * o Workplace existente não tem posições (cobre Workplaces V3.0 importados sem
 * cargo).
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md#FR21
 */
export async function ensureWorkplaceFromImport(
  tx: TxClient,
  tenantId: string,
  rawName: string,
  role?: string | null,
): Promise<WorkplaceResolution> {
  const normalized = normalize(rawName)

  // Busca por insensitive match primeiro (Prisma equals + mode insensitive)
  const candidates = await tx.workplace.findMany({
    where: { tenantId, name: { equals: rawName, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 5,
  })

  let workplace = candidates[0] ?? null

  // Fallback: aplicar normalize() em todos os workplaces do tenant (cobre
  // diferenças de whitespace/diacríticos que insensitive equals não resolve).
  if (!workplace) {
    const all = await tx.workplace.findMany({
      where: { tenantId },
      select: { id: true, name: true, createdAt: true },
    })
    const matches = all
      .filter((w) => normalize(w.name) === normalized)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    if (matches.length > 0) {
      workplace = { id: matches[0].id, name: matches[0].name }
      if (matches.length > 1) {
        console.warn(
          JSON.stringify({
            event: 'tirvu_workplace_ambiguous',
            tenantId,
            rawName,
            count: matches.length,
          }),
        )
      }
    }
  } else if (candidates.length > 1) {
    console.warn(
      JSON.stringify({
        event: 'tirvu_workplace_ambiguous',
        tenantId,
        rawName,
        count: candidates.length,
      }),
    )
  }

  let created = false
  if (!workplace) {
    const newWp = await tx.workplace.create({
      data: {
        tenantId,
        name: rawName,
        importedBy: 'AUTO_TIRVU',
        importedAt: new Date(),
        minStaff: 1,
      },
    })
    workplace = { id: newWp.id, name: newWp.name }
    created = true
  }

  // V3.4 MVP M2: se um role específico foi passado, materializa Position por (posto, cargo).
  const trimmedRole = role?.trim() || null
  let position: { id: string } | null = null

  if (trimmedRole) {
    // Match case-insensitive na role para evitar duplicatas por capitalização diferente.
    position = await tx.workplacePosition.findFirst({
      where: { tenantId, workplaceId: workplace.id, role: { equals: trimmedRole, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!position) {
      position = await tx.workplacePosition.create({
        data: {
          tenantId,
          workplaceId: workplace.id,
          role: trimmedRole,
          requiredCount: 1,
        },
        select: { id: true },
      })
    }
  } else {
    // Sem role: comportamento legado — primeira Position do Workplace ou cria default.
    position = await tx.workplacePosition.findFirst({
      where: { tenantId, workplaceId: workplace.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!position) {
      position = await tx.workplacePosition.create({
        data: {
          tenantId,
          workplaceId: workplace.id,
          role: 'Operacional',
          requiredCount: 1,
        },
        select: { id: true },
      })
    }
  }

  return { workplaceId: workplace.id, positionId: position.id, created }
}
