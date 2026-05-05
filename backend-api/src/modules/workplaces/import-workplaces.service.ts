import type { PrismaClient } from '@prisma/client'
import type { RawWorkplace } from '../employees/import-service'

export interface ImportWorkplacesInput {
  prisma: PrismaClient
  tenantId: string
  rawData: RawWorkplace[]
}

export interface ImportWorkplacesResult {
  created: number
  updated: number
  positions: number
  defaultsCreated: number
}

/**
 * Aceita "DD/MM/YYYY", "DD/MM/YYYY HH:mm:ss" e ISO. Heurística BR (DD/MM).
 * Story 2.3: extraído inline do handler para o service.
 */
function parseAnyDate(raw?: string | null): Date | null {
  if (!raw) return null
  const m1 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m1) {
    const [, a, b, y, h, mi, s] = m1
    const day = Number(a)
    const month = Number(b)
    const d = new Date(
      Date.UTC(
        Number(y),
        month - 1,
        day,
        Number(h ?? 0),
        Number(mi ?? 0),
        Number(s ?? 0),
      ),
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Importa Postos de Trabalho a partir de RawWorkplace[] (parseado por
 * ImportService.parseWorkplaces). FR26/FR27 (Story 2.3):
 * - Quando planilha NÃO traz positionRole para um workplace, cria
 *   WorkplacePosition padrão (`role='Operacional'`, `requiredCount=1`)
 *   para evitar posto estéril.
 * - Quando planilha traz positionRole, respeita o valor (sem duplicar
 *   criando padrão também).
 * - Idempotente: re-import não duplica positions nem defaults.
 */
export async function importWorkplaces(
  input: ImportWorkplacesInput,
): Promise<ImportWorkplacesResult> {
  const { prisma, tenantId, rawData } = input
  let created = 0
  let updated = 0
  let positions = 0
  let defaultsCreated = 0

  const grouped = new Map<string, RawWorkplace[]>()
  for (const row of rawData) {
    if (!row.name) continue
    const key = row.externalId ? `ext:${row.externalId}` : `name:${row.name}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  for (const [, rows] of grouped) {
    const first = rows[0]
    const externalId = first.externalId || null
    const name = first.name!

    let workplace = externalId
      ? await prisma.workplace.findFirst({ where: { tenantId, externalId } })
      : await prisma.workplace.findFirst({
          where: { tenantId, name, externalId: null },
        })

    const upsertPayload = {
      tenantId,
      name,
      externalId,
      legalName: first.legalName || null,
      cnpj: first.cnpj || null,
      client: first.client || null,
      responsible: first.responsible || null,
      phone: first.phone || null,
      email: first.email || null,
      cep: first.cep || null,
      street: first.street || null,
      number: first.number || null,
      complement: first.complement || null,
      neighborhood: first.neighborhood || null,
      city: first.city || null,
      state: first.state || null,
      address: first.address || null,
      contractStatus: first.contractStatus || null,
      minStaff: first.minStaff ? parseInt(first.minStaff) : 1,
      importedBy: first.importedBy || null,
      importedAt: parseAnyDate(first.importedAt),
    }

    if (workplace) {
      workplace = await prisma.workplace.update({
        where: { id: workplace.id },
        data: upsertPayload,
      })
      updated++
    } else {
      workplace = await prisma.workplace.create({ data: upsertPayload })
      created++
    }

    let createdInThisRun = 0
    for (const row of rows) {
      if (!row.positionRole) continue
      const existsPos = await prisma.workplacePosition.findFirst({
        where: {
          workplaceId: workplace.id,
          role: row.positionRole,
          shiftPattern: row.positionShift || null,
        },
      })
      if (existsPos) continue
      await prisma.workplacePosition.create({
        data: {
          workplaceId: workplace.id,
          role: row.positionRole,
          shiftPattern: row.positionShift || null,
          requiredCount: row.positionCount ? parseInt(row.positionCount) : 1,
          tenantId,
        },
      })
      positions++
      createdInThisRun++
    }

    // Default position quando o workplace fica sem nenhuma após import.
    if (createdInThisRun === 0) {
      const existingCount = await prisma.workplacePosition.count({
        where: { tenantId, workplaceId: workplace.id },
      })
      if (existingCount === 0) {
        await prisma.workplacePosition.create({
          data: {
            workplaceId: workplace.id,
            role: 'Operacional',
            shiftPattern: null,
            requiredCount: 1,
            tenantId,
          },
        })
        defaultsCreated++
      }
    }
  }

  return { created, updated, positions, defaultsCreated }
}
