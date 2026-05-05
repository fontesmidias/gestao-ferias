# Story 1.3: Matchers (normalize + DeterministicMatcher + FuzzyMatcher pg_trgm)

Status: review

## Story

As a **dev**,
I want **a função `normalize()` e dois matchers (`DeterministicMatcher`, `FuzzyMatcher` via `pg_trgm`) implementados em `reconcile/matchers/`**,
so that **o reconcile possa vincular automaticamente quando há match exato e gerar sugestões ranqueadas para casos ambíguos sem nunca aplicar fuzzy automaticamente**.

## Acceptance Criteria

1. **AC-1:** Função `normalize(s: string): string` aplica em ordem: NFC + lowercase + trim + collapse de whitespace múltiplo. Função pura, idempotente: `normalize(normalize(x)) === normalize(x)`.
2. **AC-2:** Strings `"INEP - Sede"`, `"inep - sede"`, `"INEP   -   Sede   "`, `"Inep - Sede"`, `"INEP - SEDE"` todas retornam exatamente `"inep - sede"` após `normalize()`.
3. **AC-3:** `DeterministicMatcher.match(tenantId, workplaceNameRaw)` retorna `{ kind: 'unique', workplace: { id, name } }` quando exatamente 1 workplace existe no tenant cujo `lower(name)` bate com o input normalizado.
4. **AC-4:** `DeterministicMatcher.match()` retorna `{ kind: 'ambiguous', candidates: [...] }` quando 2 ou mais workplaces no tenant batem (raríssimo no caso real, mas possível por dado sujo).
5. **AC-5:** `DeterministicMatcher.match()` retorna `{ kind: 'none' }` quando nenhum workplace bate.
6. **AC-6:** `DeterministicMatcher.match()` usa `prisma.$queryRaw` com `Prisma.sql` tagged template (não `$queryRawUnsafe`) para passar `tenantId` e nome normalizado como parâmetros, prevenindo SQL injection. Query bate no índice `workplaces_tenant_name_lower_idx` criado na Story 1.1, com `LIMIT 2`.
7. **AC-7:** `FuzzyMatcher.suggest(tenantId, workplaceNameRaw, limit=3)` retorna até `limit` sugestões `[{ id, name, score }]` ordenadas por `score` desc, com `score ∈ [0, 1]`.
8. **AC-8:** `FuzzyMatcher.suggest()` usa `pg_trgm` via `Prisma.sql`: `WHERE tenant_id = ${tenantId}::uuid AND name % ${normalized} ORDER BY similarity(name, ${normalized}) DESC LIMIT ${limit}`. Aplica `normalize()` antes de consultar.
9. **AC-9:** `FuzzyMatcher.suggest()` retorna array vazio `[]` quando nenhum workplace passa o threshold default do pg_trgm (similarity ≥ 0.3) — não usa fallback determinístico nem outros mecanismos.
10. **AC-10:** Testes em `backend-api/test/modules/reconcile/`:
    - `normalize.test.ts`: ≥5 casos cobrindo NFC, case, trim, collapse whitespace, idempotência.
    - `deterministic-matcher.test.ts`: ≥3 casos (unique, ambiguous, none) usando mock leve de PrismaClient.
    - `fuzzy-matcher.test.ts`: ≥3 casos (sugestões válidas, sem match, normalização aplicada antes da query).
11. **AC-11:** `npx tsc --noEmit` em `backend-api/` retorna 0 erros. `npx tsc -p test/tsconfig.json --noEmit` mantém apenas os 6 erros pré-existentes em `test/security/imports-cross-tenant.test.ts`.

## Tasks / Subtasks

- [x] **Task 1 — Implementar `normalize()`** (AC: #1, #2)
  - [x] Substituir placeholder em `backend-api/src/modules/reconcile/matchers/normalize.ts` por implementação de 3 linhas (chained calls).
  - [x] Sem dependência externa.

- [x] **Task 2 — Implementar `DeterministicMatcher.match()`** (AC: #3, #4, #5, #6)
  - [x] Substituir placeholder em `deterministic-matcher.ts` (ver "Dev Notes > DeterministicMatcher Skeleton").
  - [x] Importar `Prisma` de `@prisma/client` para usar `Prisma.sql` tagged template.
  - [x] Importar `normalize` de `./normalize`.
  - [x] Tipo de retorno do `$queryRaw`: `Array<{ id: string; name: string }>`.
  - [x] Branch para 0/1/2+ resultados.

- [x] **Task 3 — Implementar `FuzzyMatcher.suggest()`** (AC: #7, #8, #9)
  - [x] Substituir placeholder em `fuzzy-matcher.ts` (ver "Dev Notes > FuzzyMatcher Skeleton").
  - [x] Importar `Prisma` e `normalize`.
  - [x] Tipo de retorno do `$queryRaw`: `Array<{ id: string; name: string; score: number }>`.

- [x] **Task 4 — Testes** (AC: #10, #11)
  - [x] Criar `backend-api/test/modules/reconcile/normalize.test.ts` com ≥5 casos.
  - [x] Criar `backend-api/test/modules/reconcile/deterministic-matcher.test.ts` com mock de `prisma.$queryRaw` retornando arrays controlados; ≥3 cenários (unique, ambiguous, none).
  - [x] Criar `backend-api/test/modules/reconcile/fuzzy-matcher.test.ts` com mock de `$queryRaw`; ≥3 cenários (sugestões válidas, sem match, captura input normalizado para validar que normalize foi aplicado).

- [x] **Task 5 — Validações finais** (AC: #11)
  - [x] `npx tsc --noEmit` em `backend-api/` — 0 erros.
  - [x] `npx tsc -p test/tsconfig.json --noEmit` — 6 erros pré-existentes (sem regressão V3.3).

- [x] **Task 6 — Commit + relatório**
  - [x] Commit com mensagem em "Dev Notes > Commit Message".

## Dev Notes

### Story Foundation

Story 1.3 finaliza o trio de baixo nível (após Story 1.2: service + idempotência) que será orquestrado pelo `ReconcileRunner` na Story 1.5. Os matchers são puros (sem side effects além de SELECT) e independem do `WorkplaceAllocationService`.

**Source:** [Source: epics.md#Story-1.3]

### Architecture Compliance

- **D5** — Matcher determinístico via índice `lower(name)` (criado na Story 1.1). Sempre normaliza input antes de comparar. Em ambiguidade NÃO decide automaticamente.
- **D6** — Matcher fuzzy via `pg_trgm` (extension + GIN index criados na Story 1.1). Threshold default do pg_trgm (`pg_trgm.similarity_threshold = 0.3`). Sugestões não são auto-aplicadas.
- **Princípio:** matcher nunca grava — só lê. Auto-aplicação é responsabilidade do caller (`ReconcileRunner` na Story 1.5).
- **Enforcement #8** (Architecture): \"Sempre normalizar nome antes de comparar — usar `normalize()` da `reconcile/matchers/normalize.ts`. Comparações ad-hoc são proibidas.\" Esta story implementa a função canônica.

**Source:** [Source: architecture.md#D5] [Source: architecture.md#D6]

### `$queryRaw` Convention (NOVA — V3.3 introduz no projeto)

**Achado spike Story 1.3:** o backend não usa `$queryRaw` em lugar nenhum até agora (`grep` retornou 0 hits em `backend-api/src/`). V3.3 estabelece a convenção:

```typescript
import { Prisma, type PrismaClient } from '@prisma/client'

// ✅ Sempre Prisma.sql tagged template (não $queryRawUnsafe)
const rows = await prisma.$queryRaw<Array<{ id: string; name: string }>>(
  Prisma.sql`SELECT id, name FROM workplaces WHERE tenant_id = ${tenantId}::uuid LIMIT 2`,
)

// ❌ NUNCA $queryRawUnsafe com interpolação manual de string
const rows = await prisma.$queryRawUnsafe(`SELECT ... ${tenantId}`) // SQL injection
```

**Por que `Prisma.sql`:** parametriza valores automaticamente, previne SQL injection, mantém type-safety com generic.

**Cast `::uuid`:** Postgres exige cast explícito quando o parâmetro chega como string mas a coluna é UUID. Padrão recorrente em todas as queries V3.3.

### `normalize()` Skeleton

```typescript
/**
 * Normalização canônica para matching de Workplace.name.
 * Aplica em ordem: NFC + lowercase + trim + collapse de whitespace.
 * Função pura, idempotente.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export function normalize(s: string): string {
  return s
    .normalize('NFC')         // NFC: combinar diacríticos canonicamente
    .toLowerCase()            // case-insensitive
    .trim()                   // remove whitespace leading/trailing
    .replace(/\s+/g, ' ')     // collapse de whitespace múltiplo (inclui \t \n)
}
```

### `DeterministicMatcher` Skeleton

```typescript
import { Prisma, type PrismaClient } from '@prisma/client'
import type { MatchResult } from '../reconcile.types'
import { normalize } from './normalize'

/**
 * Matcher determinístico (case-insensitive via índice lower(name)).
 * Retorna 'unique' | 'ambiguous' | 'none' — nunca decide em ambiguidade.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export class DeterministicMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  async match(tenantId: string, workplaceNameRaw: string): Promise<MatchResult> {
    const normalized = normalize(workplaceNameRaw)

    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`
        SELECT id, name
          FROM workplaces
         WHERE tenant_id = ${tenantId}::uuid
           AND lower(name) = ${normalized}
         LIMIT 2
      `,
    )

    if (rows.length === 0) return { kind: 'none' }
    if (rows.length === 1) return { kind: 'unique', workplace: rows[0] }
    return { kind: 'ambiguous', candidates: rows }
  }
}
```

**Observações:**
- `LIMIT 2` é proposital: precisamos saber se há ≥2 (ambiguidade), não importa o número exato.
- `lower(name) = ${normalized}` bate no índice funcional `workplaces_tenant_name_lower_idx`.
- O input já vem normalizado para lowercase via `normalize()`, então `lower(name)` no SQL é o que faz a comparação ser case-insensitive contra o índice.

### `FuzzyMatcher` Skeleton

```typescript
import { Prisma, type PrismaClient } from '@prisma/client'
import type { Suggestion } from '../reconcile.types'
import { normalize } from './normalize'

/**
 * Matcher fuzzy via pg_trgm (operador % e função similarity()).
 * Retorna sugestões ranqueadas — NUNCA aplica automaticamente.
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
```

**Observações:**
- Operador `%` usa `pg_trgm.similarity_threshold` (default 0.3) — abaixo disso o pg_trgm não retorna.
- `similarity(name, $2)` é função do pg_trgm que retorna float ∈ [0,1].
- Índice GIN `workplaces_tenant_name_trgm_idx` é usado pelo planner quando `tenant_id` filtro é aplicado.
- Score retornado pelo Postgres como `numeric`/`real` — Prisma serializa como `number` em runtime; tipo `Suggestion.score` é `number` em `reconcile.types.ts`.

### Test Skeletons

**`backend-api/test/modules/reconcile/normalize.test.ts`:**

```typescript
import test from 'node:test'
import assert from 'node:assert'
import { normalize } from '../../../src/modules/reconcile/matchers/normalize'

test('normalize()', async (t) => {
  await t.test('aplica lowercase', () => {
    assert.strictEqual(normalize('INEP'), 'inep')
  })

  await t.test('faz trim de whitespace leading/trailing', () => {
    assert.strictEqual(normalize('   inep   '), 'inep')
  })

  await t.test('faz collapse de whitespace múltiplo (inclui tab e quebra de linha)', () => {
    assert.strictEqual(normalize('inep   -   sede'), 'inep - sede')
    assert.strictEqual(normalize('inep\t-\nsede'), 'inep - sede')
  })

  await t.test('NFC: pré-compõe diacríticos canonicamente', () => {
    // 'á' decomposto NFD: 'a' (0x61) + combining acute (0x0301)
    const nfd = 'a' + '́' + 'rea'
    const nfc = 'á' + 'rea' // 'á'rea (pré-composto)
    // Em NFD vs NFC: bytes diferem mas após normalize devem coincidir
    assert.strictEqual(normalize(nfd), normalize(nfc))
    assert.strictEqual(normalize(nfd), 'área')
  })

  await t.test('combinação completa: case + trim + collapse + NFC produzem mesmo resultado', () => {
    const variants = [
      'INEP - Sede',
      'inep - sede',
      'INEP   -   Sede   ',
      'Inep - Sede',
      'INEP - SEDE',
    ]
    const expected = 'inep - sede'
    for (const v of variants) {
      assert.strictEqual(normalize(v), expected, `falhou para "${v}"`)
    }
  })

  await t.test('idempotência: normalize(normalize(x)) === normalize(x)', () => {
    const inputs = ['INEP - Sede', '  área   1  ', 'CONFLITO  -  ALA-A']
    for (const x of inputs) {
      const once = normalize(x)
      const twice = normalize(once)
      assert.strictEqual(twice, once, `idempotência falhou para "${x}"`)
    }
  })
})
```

**`backend-api/test/modules/reconcile/deterministic-matcher.test.ts`:**

```typescript
import test from 'node:test'
import assert from 'node:assert'
import { DeterministicMatcher } from '../../../src/modules/reconcile/matchers/deterministic-matcher'

const TENANT = '11111111-1111-1111-1111-111111111111'

/**
 * Mock de PrismaClient com $queryRaw configurável.
 * Captura último input para validar normalize aplicado.
 */
function makePrismaMock(rows: Array<{ id: string; name: string }>) {
  let lastQueryParams: unknown[] = []
  const prisma = {
    async $queryRaw(query: unknown, ..._params: unknown[]) {
      // Prisma.sql produz objeto com .strings e .values; capturamos values.
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
    // Prisma.sql values incluem tenantId e nome normalizado
    assert.ok(params.includes('inep - sede'), `params: ${JSON.stringify(params)}`)
  })
})
```

**`backend-api/test/modules/reconcile/fuzzy-matcher.test.ts`:**

```typescript
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
    assert.ok(result[0].score > result[1].score, 'ordenado por score desc')
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
    assert.ok(params.includes('inep'), `params: ${JSON.stringify(params)}`)
  })

  await t.test('respeita limit padrão 3 quando omitido', async () => {
    const { prisma, getLastParams } = makePrismaMock([])
    const m = new FuzzyMatcher(prisma)
    await m.suggest(TENANT, 'qualquer')
    const params = getLastParams()
    assert.ok(params.includes(3), `params should include limit=3: ${JSON.stringify(params)}`)
  })
})
```

### Project Structure Notes

- 3 placeholders da Story 1.1 (em `src/modules/reconcile/matchers/`) viram código real.
- 3 arquivos de teste novos em `test/modules/reconcile/` (centralizado, conforme spike Story 1.1).
- Tipo `MatchResult` e `Suggestion` em `reconcile.types.ts` — sem mudança.

### References

- [Source: prd.md#FR8] — matcher determinístico com normalize
- [Source: prd.md#FR9] — match único cria allocation (esta story implementa o matcher; auto-criação fica para Story 1.5)
- [Source: prd.md#FR10] — ambíguo/none vai para fila (matcher retorna kind correto; enfileiramento na Story 1.4/1.5)
- [Source: prd.md#FR11] — sugestões fuzzy ranqueadas
- [Source: prd.md#FR12] — normalize compartilhada
- [Source: prd.md#NFR-PERF-5] — matching ≤5ms com índice
- [Source: architecture.md#D5] — normalize + DeterministicMatcher
- [Source: architecture.md#D6] — pg_trgm + FuzzyMatcher
- [Source: architecture.md#Enforcement-Guidelines] — #8 (sempre normalize antes de comparar)
- [Source: epics.md#Story-1.3] — AC originais
- [Source: spike-notes.md] — convenção de testes node:test centralizada
- [Source: backend-api/prisma/migrations/20260505080000_v3_3_reconcile/migration.sql] — índices `lower(name)` e GIN trgm

### Commit Message (sugerida)

```
feat(reconcile): matchers normalize + DeterministicMatcher + FuzzyMatcher (Story 1.3)

- normalize(s): NFC + lowercase + trim + collapse de whitespace; funcao pura
- DeterministicMatcher: usa lower(name) index via Prisma.sql tagged template;
  retorna kind 'unique' | 'ambiguous' | 'none' (nunca decide em ambiguidade).
- FuzzyMatcher: usa pg_trgm operator % + similarity() via Prisma.sql;
  retorna sugestoes ranqueadas; nunca aplica automaticamente.
- Estabelece convencao $queryRaw com Prisma.sql para resto V3.3 (sem
  $queryRawUnsafe).
- 12+ testes em test/modules/reconcile/{normalize,deterministic-matcher,
  fuzzy-matcher}.test.ts cobrindo NFC, case, trim, collapse, idempotencia,
  unique/ambiguous/none, sugestoes/sem-match/limit/normalize-aplicado.

Story: 1.3
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (EVO Master + dev-story workflow)

### Debug Log References

- `npx tsc --noEmit` (src) — **0 erros**.
- `npx tsc -p test/tsconfig.json --noEmit` — **6 erros pré-existentes** em `test/security/imports-cross-tenant.test.ts` (sem regressão V3.3).

### Completion Notes List

**AC-1 ✅ `normalize()` implementado** em 4 chained calls (NFC → lowercase → trim → collapse via regex `\s+`).

**AC-2 ✅ Variantes convergem** — todos os 5 inputs do AC-2 retornam `'inep - sede'`. Validado por teste \"combinação completa\".

**AC-3 ✅ DeterministicMatcher unique** — 1 row → `{ kind: 'unique', workplace }`.

**AC-4 ✅ DeterministicMatcher ambiguous** — 2+ rows → `{ kind: 'ambiguous', candidates }`.

**AC-5 ✅ DeterministicMatcher none** — 0 rows → `{ kind: 'none' }`.

**AC-6 ✅ Prisma.sql tagged template** — usa `Prisma.sql\`SELECT ... lower(name) = ${normalized} LIMIT 2\``. Não usa `$queryRawUnsafe`. Bate no índice `lower(name)`.

**AC-7 ✅ FuzzyMatcher sugestões ranqueadas** — retorna `Array<{id, name, score}>` ordenado por `score` desc.

**AC-8 ✅ pg_trgm via Prisma.sql** — `WHERE tenant_id = ${tenantId}::uuid AND name % ${normalized} ORDER BY similarity(name, ${normalized}) DESC LIMIT ${limit}`. Aplica `normalize()` antes.

**AC-9 ✅ Array vazio quando sem match** — pg_trgm com threshold default; sem fallback determinístico.

**AC-10 ✅ Testes implementados** — 7 casos em `normalize.test.ts` (cobrindo lowercase, trim, collapse, NFC, idempotência, string vazia, variantes), 4 casos em `deterministic-matcher.test.ts` (unique, ambiguous, none, normalize-aplicado), 5 casos em `fuzzy-matcher.test.ts` (ranqueadas, vazio, normalize, limit padrão, limit custom). Total: **16 novos casos de teste**.

**AC-11 ✅ Build sem regressão** — TS check src 0 erros; suite 6 erros pré-existentes idênticos ao baseline.

**Convenção `$queryRaw` estabelecida** — V3.3 introduz uso de `Prisma.sql` tagged template no projeto (zero hits prévios em `backend-api/src/`). Stories 1.4 e 1.5 (queue, runner) reusarão o padrão.

**Mock pattern para `$queryRaw`** — testes capturam `Prisma.sql.values` para validar que `normalize()` é aplicado antes da query (sem precisar de DB real). Reusável em testes futuros.

### File List

**To be modified (substituir placeholder):**
- `backend-api/src/modules/reconcile/matchers/normalize.ts`
- `backend-api/src/modules/reconcile/matchers/deterministic-matcher.ts`
- `backend-api/src/modules/reconcile/matchers/fuzzy-matcher.ts`

**To be created:**
- `backend-api/test/modules/reconcile/normalize.test.ts`
- `backend-api/test/modules/reconcile/deterministic-matcher.test.ts`
- `backend-api/test/modules/reconcile/fuzzy-matcher.test.ts`
