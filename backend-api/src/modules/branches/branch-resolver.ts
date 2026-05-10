import type { PrismaClient } from '@prisma/client'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * V3.5 Story 5.1: resolve / auto-cria Branch a partir do nome string vindo do
 * importer Tirvu. Idempotente.
 *
 * Padrao igual ao ensureWorkplaceFromImport (V3.3).
 */
export async function ensureBranchFromImport(
  tx: TxClient,
  tenantId: string,
  rawName: string | null | undefined,
): Promise<string | null> {
  if (!rawName) return null
  const name = rawName.trim()
  if (!name) return null

  const existing = await tx.branch.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) return existing.id

  try {
    const created = await tx.branch.create({
      data: { tenantId, name, importedBy: 'AUTO_TIRVU' },
      select: { id: true },
    })
    return created.id
  } catch (err: any) {
    // P2002 unique violation: re-fetch (race)
    if (err?.code === 'P2002') {
      const r = await tx.branch.findFirst({
        where: { tenantId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      })
      return r?.id ?? null
    }
    throw err
  }
}
