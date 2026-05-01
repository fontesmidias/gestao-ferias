import type { PrismaClient } from '@prisma/client'

export type CredentialKind = 'email' | 'whatsapp'

export interface ResolvedEmailCredential {
  id: string
  name: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string | null
  scope: 'ALL' | 'SPECIFIC'
}

export interface ResolvedWhatsappCredential {
  id: string
  name: string
  evoApiUrl: string
  evoApiKey: string
  evoInstanceName: string
  scope: 'ALL' | 'SPECIFIC'
}

export interface ConflictDetails {
  tenantId: string
  conflictingCredentials: { id: string; name: string; scope: 'ALL' | 'SPECIFIC' }[]
}

/**
 * Resolução e validação de credenciais multi-credencial (V3.1).
 *
 * Regra de unicidade: cada tenant deve ser coberto por NO MÁXIMO UMA credencial
 * ATIVA por tipo (email/whatsapp) considerando ALL e SPECIFIC.
 */

// --- EMAIL ---

export async function resolveEmailCredential(
  prisma: PrismaClient,
  tenantId: string
): Promise<ResolvedEmailCredential | null> {
  const candidates = await prisma.emailCredential.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: 'ALL' },
        { scope: 'SPECIFIC', tenantAssignments: { some: { tenantId } } }
      ]
    }
  })

  if (candidates.length === 0) return null
  // Conflito: deveria ter exatamente 1 (validação do upsert garante)
  const chosen = candidates.find(c => c.scope === 'SPECIFIC') ?? candidates[0]
  return {
    id: chosen.id,
    name: chosen.name,
    smtpHost: chosen.smtpHost,
    smtpPort: chosen.smtpPort,
    smtpUser: chosen.smtpUser,
    smtpPass: chosen.smtpPass,
    smtpFrom: chosen.smtpFrom,
    scope: chosen.scope as 'ALL' | 'SPECIFIC'
  }
}

export async function detectEmailConflicts(
  prisma: PrismaClient,
  draft: { id?: string; scope: 'ALL' | 'SPECIFIC'; isActive: boolean; tenantIds?: string[] }
): Promise<ConflictDetails[]> {
  if (!draft.isActive) return []

  const others = await prisma.emailCredential.findMany({
    where: {
      isActive: true,
      ...(draft.id ? { id: { not: draft.id } } : {})
    },
    include: { tenantAssignments: true }
  })

  const conflicts = new Map<string, { id: string; name: string; scope: 'ALL' | 'SPECIFIC' }[]>()
  const draftCovers = (tenantId: string): boolean => {
    if (draft.scope === 'ALL') return true
    return (draft.tenantIds || []).includes(tenantId)
  }

  // Para cada tenant existente no banco, ver se 2+ credenciais o cobrem
  const allTenants = await prisma.tenant.findMany({ select: { id: true } })
  for (const t of allTenants) {
    const matches: { id: string; name: string; scope: 'ALL' | 'SPECIFIC' }[] = []
    if (draftCovers(t.id)) matches.push({ id: draft.id || 'NEW', name: '(esta credencial)', scope: draft.scope })
    for (const o of others) {
      const oCovers =
        o.scope === 'ALL' ||
        (o.scope === 'SPECIFIC' && o.tenantAssignments.some(a => a.tenantId === t.id))
      if (oCovers) matches.push({ id: o.id, name: o.name, scope: o.scope as 'ALL' | 'SPECIFIC' })
    }
    if (matches.length > 1) {
      conflicts.set(t.id, matches)
    }
  }

  return Array.from(conflicts.entries()).map(([tenantId, conflictingCredentials]) => ({
    tenantId, conflictingCredentials
  }))
}

// --- WHATSAPP ---

export async function resolveWhatsappCredential(
  prisma: PrismaClient,
  tenantId: string
): Promise<ResolvedWhatsappCredential | null> {
  const candidates = await prisma.whatsappCredential.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: 'ALL' },
        { scope: 'SPECIFIC', tenantAssignments: { some: { tenantId } } }
      ]
    }
  })
  if (candidates.length === 0) return null
  const chosen = candidates.find(c => c.scope === 'SPECIFIC') ?? candidates[0]
  return {
    id: chosen.id,
    name: chosen.name,
    evoApiUrl: chosen.evoApiUrl,
    evoApiKey: chosen.evoApiKey,
    evoInstanceName: chosen.evoInstanceName,
    scope: chosen.scope as 'ALL' | 'SPECIFIC'
  }
}

export async function detectWhatsappConflicts(
  prisma: PrismaClient,
  draft: { id?: string; scope: 'ALL' | 'SPECIFIC'; isActive: boolean; tenantIds?: string[] }
): Promise<ConflictDetails[]> {
  if (!draft.isActive) return []
  const others = await prisma.whatsappCredential.findMany({
    where: { isActive: true, ...(draft.id ? { id: { not: draft.id } } : {}) },
    include: { tenantAssignments: true }
  })
  const conflicts = new Map<string, { id: string; name: string; scope: 'ALL' | 'SPECIFIC' }[]>()
  const draftCovers = (tenantId: string): boolean => {
    if (draft.scope === 'ALL') return true
    return (draft.tenantIds || []).includes(tenantId)
  }
  const allTenants = await prisma.tenant.findMany({ select: { id: true } })
  for (const t of allTenants) {
    const matches: { id: string; name: string; scope: 'ALL' | 'SPECIFIC' }[] = []
    if (draftCovers(t.id)) matches.push({ id: draft.id || 'NEW', name: '(esta credencial)', scope: draft.scope })
    for (const o of others) {
      const oCovers =
        o.scope === 'ALL' ||
        (o.scope === 'SPECIFIC' && o.tenantAssignments.some(a => a.tenantId === t.id))
      if (oCovers) matches.push({ id: o.id, name: o.name, scope: o.scope as 'ALL' | 'SPECIFIC' })
    }
    if (matches.length > 1) conflicts.set(t.id, matches)
  }
  return Array.from(conflicts.entries()).map(([tenantId, conflictingCredentials]) => ({
    tenantId, conflictingCredentials
  }))
}
