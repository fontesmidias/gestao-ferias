import test from 'node:test'
import assert from 'node:assert'
import { DeterministicMatcher } from '../../../src/modules/reconcile/matchers/deterministic-matcher'

const TENANT = '11111111-1111-1111-1111-111111111111'

/**
 * Mock leve de PrismaClient com $queryRaw configurável.
 * Captura os values do Prisma.sql tagged template para validar
 * que normalize foi aplicado ao input antes da query.
 */
function makePrismaMock(rows: Array<{ id: string; name: string }>) {
  let lastQueryParams: unknown[] = []
  const prisma = {
    async $queryRaw(query: unknown) {
      const sqlObj = query as { values?: unknown[] }
      lastQueryParams = sqlObj.values ?? []
      return rows
    },
  } as never

  return { prisma, getLastParams: () => lastQueryParams }
}

test('DeterministicMatcher.match()', async (t) => {
  await t.test('AC-3: kind unique quando exatamente 1 row', async () => {
    const { prisma } = makePrismaMock([{ id: 'wp-1', name: 'INEP - Sede' }])
    const m = new DeterministicMatcher(prisma)
    const result = await m.match(TENANT, 'INEP - Sede')
    assert.strictEqual(result.kind, 'unique')
    if (result.kind === 'unique') {
      assert.strictEqual(result.workplace.id, 'wp-1')
      assert.strictEqual(result.workplace.name, 'INEP - Sede')
    }
  })

  await t.test('AC-4: kind ambiguous quando 2+ rows', async () => {
    const { prisma } = makePrismaMock([
      { id: 'wp-1', name: 'INEP - Sede' },
      { id: 'wp-2', name: 'INEP - Sede' },
    ])
    const m = new DeterministicMatcher(prisma)
    const result = await m.match(TENANT, 'INEP - Sede')
    assert.strictEqual(result.kind, 'ambiguous')
    if (result.kind === 'ambiguous') {
      assert.strictEqual(result.candidates.length, 2)
    }
  })

  await t.test('AC-5: kind none quando 0 rows', async () => {
    const { prisma } = makePrismaMock([])
    const m = new DeterministicMatcher(prisma)
    const result = await m.match(TENANT, 'desconhecido')
    assert.strictEqual(result.kind, 'none')
  })

  await t.test('aplica normalize antes da query (lowercase + collapse)', async () => {
    const { prisma, getLastParams } = makePrismaMock([])
    const m = new DeterministicMatcher(prisma)
    await m.match(TENANT, 'INEP   -   SEDE')
    const params = getLastParams()
    assert.ok(
      params.includes('inep - sede'),
      `esperava 'inep - sede' nos params; got: ${JSON.stringify(params)}`,
    )
    assert.ok(
      params.includes(TENANT),
      `esperava tenantId nos params; got: ${JSON.stringify(params)}`,
    )
  })
})
