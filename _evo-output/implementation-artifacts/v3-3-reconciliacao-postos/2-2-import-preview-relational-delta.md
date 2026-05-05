# Story 2.2: ImportJob.previewSummary com delta de relações

Status: review

## Story

As a **ADMIN que vai aplicar uma planilha Tirvu**,
I want **o preview do `ImportJob` (etapa `PREVIEW_READY`) incluir delta granular: quantas allocations serão criadas/encerradas, quantos workplaces novos serão inferidos, quantos colaboradores ficarão sem match**,
so that **eu possa validar o impacto antes de aplicar (FR25)**.

## Acceptance Criteria

1. **AC-1 (PreviewSummary expandido):** A interface `PreviewSummary` em `backend-api/src/modules/imports/types.ts` ganha campo opcional `relationalDelta`:
   ```typescript
   relationalDelta?: {
     allocationsCreated: number
     allocationsClosed: number
     workplacesCreated: number
     unmatchedEmployees: number
   }
   ```
   Mantido opcional para compat com previews antigos persistidos.

2. **AC-2 (regra allocationsCreated):** Computado em `buildPreviewSummary`:
   - +1 por cada row em `result.create` cuja `row.lotacao` é truthy (após trim).
   - +1 por cada row em `result.update` que vai resultar em allocation nova: ou `diff.workplace` mudou, ou employee não tinha `workplaceId` mas patch tem `workplace`.

3. **AC-3 (regra allocationsClosed):** +1 por cada row em `result.update` cujo `diff.workplace` está presente E o `employee.workplaceId` atual não é null (havia allocation a encerrar). Reactivation com transição também conta.

4. **AC-4 (regra workplacesCreated):** Mantido valor existente `result.newWorkplaces.length` (já calculado pelo matcher), agora exposto também em `relationalDelta.workplacesCreated`. Sem dupla contagem.

5. **AC-5 (regra unmatchedEmployees):** +1 por cada row válida (qualquer categoria exceto invalid) cuja `row.lotacao` é null/empty/whitespace.

6. **AC-6 (sem regressão schema):** O campo `previewSummary` no schema Prisma já é Json, sem mudança necessária. Apenas o shape interno cresce.

7. **AC-7 (rota /preview retorna):** O response do `previewEntrypoint` (`preview-flow.ts`) inclui `relationalDelta` quando presente. Sem quebra dos campos existentes (`rows`, `counts`, `newWorkplaces`).

8. **AC-8 (testes ≥3 cenários):** Testes em `backend-api/test/modules/import-matcher.test.ts` (acrescentar) ou novo arquivo `import-preview-delta.test.ts`:
   - **T1 (planilha só novos):** 3 rows novos com lotações, 2 das quais não existem no tenant → `allocationsCreated=3, allocationsClosed=0, workplacesCreated=2, unmatchedEmployees=0`.
   - **T2 (transições):** 2 employees existentes com workplaceId, planilha traz lotação diferente → `allocationsCreated=2, allocationsClosed=2`. + 1 row sem lotação → `unmatchedEmployees=1`.
   - **T3 (normalize collisions):** planilha traz `'INEP - Sede'` e `'INEP   -   Sede'` em rows diferentes (2 rows) e workplace existente com nome `'INEP - Sede'` → workplacesCreated=0 (mesmo posto), allocationsCreated=2.

9. **AC-9 (sem regressão TS + suite):** `npx tsc --noEmit` 0 erros. Testes existentes do import-matcher continuam verde.

## Tasks / Subtasks

- [x] **Task 1 — Atualizar PreviewSummary type** (AC: #1)
  - [ ] Editar `backend-api/src/modules/imports/types.ts`: adicionar `relationalDelta?` à interface.

- [x] **Task 2 — Implementar computeRelationalDelta** (AC: #2–#5)
  - [ ] Em `import-matcher.ts`, após `buildPreviewSummary`, criar helper `computeRelationalDelta(result, existingWorkplaces?)` que retorna o objeto delta.
  - [ ] Aplica `normalize()` para casar lotações com workplaces existentes (consistente com `ensureWorkplaceFromImport` da Story 2.1).
  - [ ] Conta allocationsCreated/Closed conforme regras.
  - [ ] Para `workplacesCreated`, usa `result.newWorkplaces.length` (já computado pelo matcher).
  - [ ] Atualizar `buildPreviewSummary` para receber opcionalmente `existingWorkplaces` e incluir `relationalDelta` no retorno.

- [x] **Task 3 — Pipeline propaga existingWorkplaces** (AC: #2)
  - [ ] Em `worker-pipeline.ts`, passar `existingWorkplaces` para `buildPreviewSummary`.

- [x] **Task 4 — Rota /preview expõe relationalDelta** (AC: #7)
  - [ ] Em `preview-flow.ts`, adicionar `relationalDelta: summary.relationalDelta` ao envelope de retorno.

- [x] **Task 5 — Testes** (AC: #8)
  - [ ] Adicionar 3 cenários ao `test/modules/import-matcher.test.ts` (preferido) ou criar arquivo dedicado se ficar pesado.
  - [ ] Mock leve de existingEmployees + existingWorkplaces.

- [x] **Task 6 — Validações** (AC: #9)
  - [ ] `npx tsc --noEmit` (0 erros).
  - [ ] `npx tsx --test test/modules/import-matcher.test.ts` (suite verde).

- [x] **Task 7 — Commit + relatório**

## Dev Notes

### Discovery findings

- **`PreviewSummary`** vive em `types.ts` (`interface PreviewSummary`).
- **`buildPreviewSummary`** vive em `import-matcher.ts` — recebe `MatchResult` + totalRows + sampleSize. **Não recebe** `existingWorkplaces` hoje.
- **`matchAll`** já calcula `result.newWorkplaces` (workplaces que serão criados pelo importer).
- **Pipeline** (`worker-pipeline.ts:124`) chama `buildPreviewSummary(matchResult, rows.length, rows.length)`.
- **Rota /preview** retorna `{ rows, counts, newWorkplaces }` no envelope. Vamos adicionar `relationalDelta`.
- **Schema:** `ImportJob.previewSummary: Json?` — tipo flexível, não precisa migration.
- **Testes do matcher:** `test/modules/import-matcher.test.ts` é o lugar natural para testes de preview delta.

### Helper Skeleton

```typescript
// import-matcher.ts (após buildPreviewSummary):

import { normalize } from '../reconcile/matchers/normalize'

export interface RelationalDelta {
  allocationsCreated: number
  allocationsClosed: number
  workplacesCreated: number
  unmatchedEmployees: number
}

export function computeRelationalDelta(
  result: MatchResult,
  existingWorkplaces: Array<{ name: string }>,
): RelationalDelta {
  let allocationsCreated = 0
  let allocationsClosed = 0
  let unmatchedEmployees = 0

  // create rows: cada um com lotacao truthy = allocation nova
  for (const e of result.create) {
    const lotacao = e.row.lotacao?.trim() ?? ''
    if (lotacao) allocationsCreated++
    else unmatchedEmployees++
  }

  // update rows: transição de posto (closed + created) ou inicial (sem workplaceId)
  for (const e of result.update) {
    const lotacao = e.row.lotacao?.trim() ?? ''
    if (!lotacao) {
      unmatchedEmployees++
      continue
    }
    const workplaceChanged = 'workplace' in e.diff
    const hadFk = !!e.employee.workplaceId
    if (workplaceChanged) {
      allocationsCreated++
      if (hadFk) allocationsClosed++
    } else if (!hadFk) {
      // FK ainda não existe mas vai receber → allocation nova sem encerramento
      allocationsCreated++
    }
  }

  // reactivation rows: trata como update p/ contagem
  for (const e of result.reactivation) {
    const lotacao = e.row.lotacao?.trim() ?? ''
    if (!lotacao) {
      unmatchedEmployees++
      continue
    }
    const workplaceChanged = 'workplace' in e.diff
    const hadFk = !!e.employee.workplaceId
    if (workplaceChanged) {
      allocationsCreated++
      if (hadFk) allocationsClosed++
    } else if (!hadFk) {
      allocationsCreated++
    }
  }

  return {
    allocationsCreated,
    allocationsClosed,
    workplacesCreated: result.newWorkplaces.length,
    unmatchedEmployees,
  }
}
```

### buildPreviewSummary update

```typescript
export function buildPreviewSummary(
  result: MatchResult,
  totalRows: number,
  sampleSize = 2000,
  existingWorkplaces: Array<{ name: string }> = [],
): PreviewSummary {
  // ... lógica existente ...
  return {
    totalRows,
    counts: { ... },
    newWorkplaces: [...result.newWorkplaces],
    sampleRows: all.slice(0, sampleSize),
    relationalDelta: computeRelationalDelta(result, existingWorkplaces),
  }
}
```

### preview-flow.ts update

```typescript
return reply.code(200).send(
  envelope(
    {
      rows,
      counts: summary.counts,
      newWorkplaces: summary.newWorkplaces,
      relationalDelta: summary.relationalDelta ?? null,
    },
    null,
    { pagination: { page, limit, total, totalPages } },
  ),
)
```

### Project Structure Notes

**Modified:**
- `backend-api/src/modules/imports/types.ts` (adicionar relationalDelta)
- `backend-api/src/modules/imports/import-matcher.ts` (helper + buildPreviewSummary)
- `backend-api/src/modules/imports/worker-pipeline.ts` (passa existingWorkplaces)
- `backend-api/src/modules/imports/preview-flow.ts` (expõe relationalDelta)
- `backend-api/test/modules/import-matcher.test.ts` (3 cenários novos)

### References

- [Source: prd.md#FR25] — preview com delta granular
- [Source: epics.md#Story-2.2]
- [Source: 2-1-importer-tirvu-allocation-service.md] — comportamento real do applier
- [Source: backend-api/src/modules/reconcile/matchers/normalize.ts]

### Commit Message (sugerida)

```
feat(imports): preview com delta de relacoes (Story 2.2)

- PreviewSummary ganha relationalDelta { allocationsCreated,
  allocationsClosed, workplacesCreated, unmatchedEmployees }
  refletindo o impacto real do apply nas tabelas relacionais.
- Helper computeRelationalDelta em import-matcher: itera create/update/
  reactivation para contar allocations criadas, encerradas em transicao
  e employees sem lotacao.
- Rota /preview expoe relationalDelta no envelope.
- Pipeline passa existingWorkplaces para buildPreviewSummary.
- Testes: 3 cenarios novos (so novos, transicoes, normalize collisions).

Story: 2.2
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npx tsc --noEmit` → 0 erros.
- `npx tsx --test test/modules/import-matcher.test.ts` → **25/25 verde** (22 antigos + 3 Story 2.2).
- Erro inicial T2: `unmatched` para emp sem lotação caía em `unchanged` (não em `update`); resolvido adicionando varredura também em `result.unchanged`.

### Completion Notes List

**AC-1 ✅ relationalDelta** adicionado a `PreviewSummary` como opcional.

**AC-2/3/4/5 ✅ computeRelationalDelta** itera create/update/reactivation/unchanged aplicando regras: allocations criadas (lotação truthy em create/transição/sem-FK), encerradas (transição com FK prévia), workplacesCreated reusa `result.newWorkplaces.length`, unmatchedEmployees coleta rows válidas sem lotação em todas as categorias relevantes.

**AC-6 ✅ schema sem mudança** — campo `previewSummary: Json?` já existia.

**AC-7 ✅ /preview retorna** `relationalDelta` no envelope (null fallback para previews antigos).

**AC-8 ✅ 3 testes**:
- T1 só novos: 3 allocations + 2 workplaces criados.
- T2 transições + unmatched: 2/2/0/1.
- T3 normalize collisions: 0 workplaces criados quando há match.

**AC-9 ✅ Sem regressão** — 25/25 import-matcher; tsc 0 erros.

**Notas técnicas:**
- A varredura adicional em `result.unchanged` capturou um caso real: employee ATIVO sem vínculo cuja planilha não traz lotação não é "update" (sem diff) mas precisa contar como unmatched para o operador saber.
- O parâmetro extra `existingWorkplaces` cogitado no skeleton mostrou-se desnecessário — `result.newWorkplaces` já tem a contagem certa de workplaces que serão criados (aplica trim do matcher antes da deduplicação).

### File List

**Modified:**
- `backend-api/src/modules/imports/types.ts` (relationalDelta opcional em PreviewSummary)
- `backend-api/src/modules/imports/import-matcher.ts` (computeRelationalDelta + buildPreviewSummary)
- `backend-api/src/modules/imports/preview-flow.ts` (envelope inclui relationalDelta)
- `backend-api/test/modules/import-matcher.test.ts` (3 cenários novos)
