import type { PrismaClient } from '@prisma/client'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * V3.5 Stories 5.2/5.3/5.4: resolvers genericos para Department/Shift/Union.
 * Mesmo padrao do ensureBranchFromImport (Story 5.1) / ensureWorkplaceFromImport (V3.3).
 *
 * Idempotente. Auto-cria com importedBy='AUTO_TIRVU'.
 */

async function ensureLookup(
  tx: TxClient,
  table: 'department' | 'shift' | 'union',
  tenantId: string,
  rawName: string | null | undefined,
): Promise<string | null> {
  if (!rawName) return null
  const name = rawName.trim()
  if (!name) return null

  const model = (tx as any)[table]
  const existing = await model.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) return existing.id

  try {
    const created = await model.create({
      data: { tenantId, name, importedBy: 'AUTO_TIRVU' },
      select: { id: true },
    })
    return created.id
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const r = await model.findFirst({
        where: { tenantId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      })
      return r?.id ?? null
    }
    throw err
  }
}

export const ensureDepartmentFromImport = (tx: TxClient, tenantId: string, name: string | null | undefined) =>
  ensureLookup(tx, 'department', tenantId, name)

export const ensureShiftFromImport = (tx: TxClient, tenantId: string, name: string | null | undefined) =>
  ensureLookup(tx, 'shift', tenantId, name)

export const ensureUnionFromImport = (tx: TxClient, tenantId: string, name: string | null | undefined) =>
  ensureLookup(tx, 'union', tenantId, name)
