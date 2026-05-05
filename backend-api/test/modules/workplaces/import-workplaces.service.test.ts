import test from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { importWorkplaces } from '../../../src/modules/workplaces/import-workplaces.service'
import type { RawWorkplace } from '../../../src/modules/employees/import-service'

const TENANT = randomUUID()

interface WorkplaceRow {
  id: string
  tenantId: string
  name: string
  externalId: string | null
}
interface PositionRow {
  id: string
  tenantId: string
  workplaceId: string
  role: string
  shiftPattern: string | null
  requiredCount: number
}

function makePrisma(opts: {
  workplaces?: WorkplaceRow[]
  positions?: PositionRow[]
} = {}) {
  const workplaces: WorkplaceRow[] = [...(opts.workplaces ?? [])]
  const positions: PositionRow[] = [...(opts.positions ?? [])]

  const prisma = {
    workplace: {
      async findFirst({
        where,
      }: {
        where: { tenantId: string; externalId?: string | null; name?: string }
      }) {
        return (
          workplaces.find(
            (w) =>
              w.tenantId === where.tenantId &&
              (where.externalId === undefined || w.externalId === where.externalId) &&
              (where.name === undefined || w.name === where.name),
          ) ?? null
        )
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row: WorkplaceRow = {
          id: randomUUID(),
          tenantId: data.tenantId as string,
          name: data.name as string,
          externalId: (data.externalId as string | null) ?? null,
        }
        workplaces.push(row)
        return row
      },
      async update({
        where,
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        const idx = workplaces.findIndex((w) => w.id === where.id)
        if (idx >= 0) {
          workplaces[idx] = { ...workplaces[idx], name: (data.name as string) ?? workplaces[idx].name }
        }
        return workplaces[idx]
      },
    },
    workplacePosition: {
      async findFirst({
        where,
      }: {
        where: {
          workplaceId: string
          role?: string
          shiftPattern?: string | null
        }
      }) {
        return (
          positions.find(
            (p) =>
              p.workplaceId === where.workplaceId &&
              (where.role === undefined || p.role === where.role) &&
              (where.shiftPattern === undefined ||
                p.shiftPattern === where.shiftPattern),
          ) ?? null
        )
      },
      async count({ where }: { where: { tenantId: string; workplaceId: string } }) {
        return positions.filter(
          (p) => p.tenantId === where.tenantId && p.workplaceId === where.workplaceId,
        ).length
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row: PositionRow = {
          id: randomUUID(),
          tenantId: data.tenantId as string,
          workplaceId: data.workplaceId as string,
          role: data.role as string,
          shiftPattern: (data.shiftPattern as string | null) ?? null,
          requiredCount: (data.requiredCount as number) ?? 1,
        }
        positions.push(row)
        return row
      },
    },
  }
  return { prisma: prisma as never, state: { workplaces, positions } }
}

test('Story 2.3 — planilha sem cargo: cria position padrão para cada workplace novo', async () => {
  const { prisma, state } = makePrisma()
  const rawData: RawWorkplace[] = [
    { name: 'Posto A' },
    { name: 'Posto B' },
  ]
  const r = await importWorkplaces({ prisma, tenantId: TENANT, rawData })
  assert.strictEqual(r.created, 2)
  assert.strictEqual(r.positions, 0, 'sem positionRole, nenhuma position explicit')
  assert.strictEqual(r.defaultsCreated, 2, 'cada workplace ganha padrão')
  assert.strictEqual(state.positions.length, 2)
  assert.ok(state.positions.every((p) => p.role === 'Operacional'))
})

test('Story 2.3 — planilha com cargo: respeita coluna, sem default', async () => {
  const { prisma, state } = makePrisma()
  const rawData: RawWorkplace[] = [
    { name: 'Posto A', positionRole: 'Vigia', positionCount: '2' },
    { name: 'Posto B', positionRole: 'Recepção', positionShift: '12x36' },
  ]
  const r = await importWorkplaces({ prisma, tenantId: TENANT, rawData })
  assert.strictEqual(r.created, 2)
  assert.strictEqual(r.positions, 2)
  assert.strictEqual(r.defaultsCreated, 0)
  assert.deepStrictEqual(
    state.positions.map((p) => p.role).sort(),
    ['Recepção', 'Vigia'],
  )
})

test('Story 2.3 — planilha mista: cargo onde tem, padrão onde não tem', async () => {
  const { prisma, state } = makePrisma()
  const rawData: RawWorkplace[] = [
    { name: 'Posto A', positionRole: 'Vigia' },
    { name: 'Posto B' }, // sem cargo → default
    { name: 'Posto C' }, // sem cargo → default
  ]
  const r = await importWorkplaces({ prisma, tenantId: TENANT, rawData })
  assert.strictEqual(r.created, 3)
  assert.strictEqual(r.positions, 1, '1 explícita (Vigia)')
  assert.strictEqual(r.defaultsCreated, 2, 'B e C ganharam padrão')
  assert.strictEqual(state.positions.length, 3)
})

test('Story 2.3 — re-import idempotente: mesma planilha 2× não duplica', async () => {
  const { prisma, state } = makePrisma()
  const rawData: RawWorkplace[] = [
    { name: 'Posto A', positionRole: 'Vigia' },
    { name: 'Posto B' }, // default
  ]
  await importWorkplaces({ prisma, tenantId: TENANT, rawData })
  const positionsAfter1 = state.positions.length
  const workplacesAfter1 = state.workplaces.length

  const r2 = await importWorkplaces({ prisma, tenantId: TENANT, rawData })
  assert.strictEqual(r2.created, 0, 'workplaces ja existem')
  assert.strictEqual(r2.updated, 2)
  assert.strictEqual(r2.positions, 0, 'positions explicit ja existem (idempotente)')
  assert.strictEqual(r2.defaultsCreated, 0, 'workplace B ja tem default — nao duplica')
  assert.strictEqual(state.positions.length, positionsAfter1)
  assert.strictEqual(state.workplaces.length, workplacesAfter1)
})
