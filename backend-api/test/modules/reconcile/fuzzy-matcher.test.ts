import test from 'node:test'
import assert from 'node:assert'
import { FuzzyMatcher } from '../../../src/modules/reconcile/matchers/fuzzy-matcher'

const TENANT = '11111111-1111-1111-1111-111111111111'

function makePrismaMock(
  rows: Array<{ id: string; name: string; score: number }>,
) {
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

test('FuzzyMatcher.suggest()', async (t) => {
  await t.test('AC-7: retorna sugestões ranqueadas com score', async () => {
    const { prisma } = makePrismaMock([
      { id: 'wp-1', name: 'INEP - Sede', score: 0.92 },
      { id: 'wp-2', name: 'INEP - Anexo', score: 0.78 },
      { id: 'wp-3', name: 'INEP - Reserva', score: 0.55 },
    ])
    const m = new FuzzyMatcher(prisma)
    const result = await m.suggest(TENANT, 'INEP', 3)
    assert.strictEqual(result.length, 3)
    assert.strictEqual(result[0].id, 'wp-1')
    assert.strictEqual(result[0].score, 0.92)
    assert.ok(
      result[0].score >= result[1].score && result[1].score >= result[2].score,
      'ordenado por score desc',
    )
  })

  await t.test('AC-9: retorna [] quando pg_trgm não devolve nada', async () => {
    const { prisma } = makePrismaMock([])
    const m = new FuzzyMatcher(prisma)
    const result = await m.suggest(TENANT, 'totalmente-desconhecido')
    assert.deepStrictEqual(result, [])
  })

  await t.test('aplica normalize antes da query', async () => {
    const { prisma, getLastParams } = makePrismaMock([])
    const m = new FuzzyMatcher(prisma)
    await m.suggest(TENANT, 'INEP   ', 3)
    const params = getLastParams()
    assert.ok(
      params.includes('inep'),
      `esperava 'inep' normalizado nos params; got: ${JSON.stringify(params)}`,
    )
  })

  await t.test('respeita limit padrão 3 quando omitido', async () => {
    const { prisma, getLastParams } = makePrismaMock([])
    const m = new FuzzyMatcher(prisma)
    await m.suggest(TENANT, 'qualquer')
    const params = getLastParams()
    assert.ok(
      params.includes(3),
      `esperava limit=3 nos params; got: ${JSON.stringify(params)}`,
    )
  })

  await t.test('respeita limit customizado', async () => {
    const { prisma, getLastParams } = makePrismaMock([])
    const m = new FuzzyMatcher(prisma)
    await m.suggest(TENANT, 'qualquer', 10)
    const params = getLastParams()
    assert.ok(
      params.includes(10),
      `esperava limit=10 nos params; got: ${JSON.stringify(params)}`,
    )
  })
})
