# Story 2.4: Testes de idempotência de re-import (Tirvu + Postos)

Status: review

## Story

As a **dev**,
I want **testes que validem que re-importar a mesma planilha (Tirvu ou Postos) não duplica allocations, não cria workplaces duplicados, e mantém o estado consistente**,
so that **operadores possam re-aplicar uma planilha sem medo de corromper dados (NFR-REL-1, FR24)**.

## Acceptance Criteria

1. **AC-1 (suite consolidada):** Novo arquivo `backend-api/test/modules/imports/import-idempotency.test.ts` reúne cenários de idempotência cross-cutting que reforçam Stories 2.1 (Tirvu allocation) e 2.3 (Postos default position) — sem duplicar testes simples já existentes.

2. **AC-2 (Tirvu multi-employee re-import):** 5 employees novos com lotações distintas (3 distintas, 2 repetidas) → após 1º apply: 5 employees, 3 workplaces (auto-criados), 5 allocations, 3 positions padrão. Após 2º apply do mesmo conjunto (já existindo): 0 deltas (todos os contadores incrementais zeram).

3. **AC-3 (Tirvu transição idempotente):** 1 employee inicialmente em workplace A. Re-import 1: employee migra A→B (allocation A encerrada, B criada). Re-import 2 (mesma planilha de B): nenhum delta (workplaceId=B já set, allocation B ACTIVE; noop).

4. **AC-4 (AuditLog idempotente):** No 2º re-import sem mudanças, count de `auditLog.create` chamadas com `action='IMPORT_TIRVU_ALLOCATE'` permanece o mesmo do 1º (apenas crowd noop, sem audit). Verificar que noop NÃO emite AuditLog.

5. **AC-5 (Postos com default position idempotente — reforço):** 3 workplaces (1 com cargo, 2 sem). 1º apply: 1 position explícita + 2 defaults. 2º apply: 0 novos workplaces, 0 novas positions, 0 novos defaults. Reforça Story 2.3 T4 com asserts mais estritos sobre AuditLog (se houver).

6. **AC-6 (sem regressão):** Suite global continua verde. `npx tsc --noEmit` 0 erros.

## Tasks / Subtasks

- [x] **Task 1 — Criar suite consolidada**
  - [ ] `backend-api/test/modules/imports/import-idempotency.test.ts`.
  - [ ] Reusar mock pattern `makeMockTx` do `import-applier.test.ts` (importar como helper compartilhado se prático, ou copiar fragments necessários).
  - [ ] Reusar mock `makePrisma` do `import-workplaces.service.test.ts` para cenários Postos.

- [x] **Task 2 — Cenário T1: Tirvu multi-employee re-import** (AC: #2)
  - [ ] 5 employees como `kind: 'create'` com lotações: A, A, B, B, C.
  - [ ] Roda `applyItem` para cada um → conta workplaces criados (A, B, C = 3), positions defaults (3), allocations (5).
  - [ ] Re-roda como `kind: 'update'` (mesmo CPF, employee agora existe com workplaceId set) → 0 deltas.

- [x] **Task 3 — Cenário T2: Tirvu transição idempotente** (AC: #3, #4)
  - [ ] Setup: 1 employee em wpA com allocation ACTIVE.
  - [ ] Apply 1: update item com diff `workplace: A→B` → allocation A=ENDED, B=ACTIVE, AuditLog 1.
  - [ ] Apply 2: re-run mesmo update item, mas employee state agora reflete pós-apply 1 (workplaceId=B, allocation B ACTIVE) → 0 novas allocations, 0 audits novos.

- [x] **Task 4 — Cenário T3: Postos idempotência reforçada** (AC: #5)
  - [ ] 3 RawWorkplace (1 com positionRole, 2 sem).
  - [ ] Apply 1: 3 created, 1 position, 2 defaults.
  - [ ] Apply 2 (mesmo array): 0 created, 3 updated, 0 positions, 0 defaults.

- [x] **Task 5 — Validações**
  - [ ] `npx tsc --noEmit` 0 erros.
  - [ ] `npx tsx --test test/modules/imports/import-idempotency.test.ts` verde.
  - [ ] Suite V3.3 inteira ainda verde.

- [x] **Task 6 — Commit + relatório**

## Dev Notes

### Discovery findings

- Stories 2.1 e 2.3 já têm 1 cenário cada de idempotência (mesma planilha 2×). Esta story acrescenta:
  - Multi-employee Tirvu (não testado nas anteriores).
  - Transição idempotente em 2 passos (Story 2.1 testa 1× transição; aqui validamos que repetir não move nada).
  - AuditLog noop em re-import de transição.
- Mock pattern já maduro em `import-applier.test.ts` e `import-workplaces.service.test.ts`. Para evitar duplicar, este teste pode duplicar pequenos fragments dos mocks (mais barato que extrair shared helper agora — refator opcional para 3.x).
- Não há banco real disponível em CI (`tenants.test.ts` precisa DB; vai falhar localmente). Esta story segue convenção mock-only.

### Test Skeleton

```typescript
// test/modules/imports/import-idempotency.test.ts
import test from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

process.env.BANK_DATA_ENCRYPTION_KEY ??= '5JtP44Gz4XwhPUi0NCxOOeqgdZtZ18FrQsXkuiXYvwg='

const applier = require('../../../src/modules/imports/import-applier') as typeof import('../../../src/modules/imports/import-applier')
import type { ApplyContext, ApplyItem, ApplyOptions } from '../../../src/modules/imports/import-applier'
import type { Employee, TirvuRow } from '../../../src/modules/imports/types'
import { importWorkplaces } from '../../../src/modules/workplaces/import-workplaces.service'
import type { RawWorkplace } from '../../../src/modules/employees/import-service'

// ... reuse makeMockTx, makeRow, makeEmp pattern do import-applier.test.ts ...
// ... reuse makePrisma do import-workplaces.service.test.ts ...

test('Story 2.4 — Tirvu multi-employee: 5 creates, depois re-run com 0 deltas', async () => {
  // 1º apply: 5 creates (lotações A, A, B, B, C)
  // assert: 5 employees, workplaces criados (A,B,C=3 distintos), 5 allocations
  // 2º apply: 5 updates, mesmas lotações, employees já com workplaceId
  // assert: 0 novos workplaces, 0 novas allocations, 0 novos audits IMPORT_TIRVU_ALLOCATE
})

test('Story 2.4 — Tirvu transição A→B idempotente em 2 passos', async () => {
  // setup employee@A com allocation A ACTIVE
  // apply 1: update workplace A→B → allocation A=ENDED, B=ACTIVE, audit 1
  // apply 2 (mesmo item, mas agora employee.workplaceId=B): noop
  // assert: 0 novas allocations no 2º, 0 novos audits no 2º
})

test('Story 2.4 — Postos idempotência reforçada: 2× mesma planilha = 0 deltas', async () => {
  // RawWorkplace[] com 1 cargo + 2 sem cargo
  // apply 1: 3 created, 1 position, 2 defaults
  // apply 2: 0 created, 3 updated, 0 positions, 0 defaults
})
```

### Project Structure Notes

**Created:**
- `backend-api/test/modules/imports/import-idempotency.test.ts`

### References

- [Source: prd.md#NFR-REL-1, FR24]
- [Source: epics.md#Story-2.4]
- [Source: 2-1-importer-tirvu-allocation-service.md] — T4 idempotência base
- [Source: 2-3-importer-postos-default-position.md] — T4 idempotência base

### Commit Message (sugerida)

```
test(imports): cenarios consolidados de idempotencia de re-import (Story 2.4)

Reune testes cross-cutting que reforcam Stories 2.1 e 2.3:
- Tirvu multi-employee re-import (5 employees, lotacoes repetidas) com
  0 deltas no 2 apply.
- Tirvu transicao A->B idempotente: re-aplicar a mesma transicao apos
  1a passagem nao move nada (NFR-REL-1).
- AuditLog: noop NAO emite IMPORT_TIRVU_ALLOCATE (defesa em profundidade).
- Postos idempotencia reforcada com asserts estritos.

Story: 2.4
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npx tsc --noEmit` → 0 erros.
- `npx tsx --test test/modules/imports/import-idempotency.test.ts` → **3/3 verde**.
- Suite V3.3 inteira (101 testes): verde.

### Completion Notes List

**AC-1 ✅ Suite consolidada** — `import-idempotency.test.ts` com mocks reusáveis (espelham padrões das Stories 2.1 e 2.3).

**AC-2 ✅ Tirvu multi-employee** — 5 employees com lotações A,A,B,B,C → 1º apply: 3 workplaces, 3 positions padrão, 5 allocations, 5 audits IMPORT_TIRVU_ALLOCATE. 2º apply (mesmas rows como update sem diff): 0 deltas em todos os contadores.

**AC-3 ✅ Transição idempotente** — workplace A→B no 1º apply gera workplace B + allocation B + audit; 2º apply mesma planilha (employee.workplaceId=B agora): 0 novas allocations, 0 updates, audit count inalterado.

**AC-4 ✅ AuditLog idempotente** — assertion explícita `auditCountAfter2 === auditCountAfter1` confirma que noop NÃO emite audit (Story 1.2 contract preservado).

**AC-5 ✅ Postos reforçado** — 3 workplaces (1 com cargo + 2 sem) → 1º apply: 3/1/2; 2º apply: 0/3/0/0 (created/updated/positions/defaultsCreated). Asserts estritos sobre tamanhos de state.workplaces e state.positions.

**AC-6 ✅ sem regressão** — tsc 0 erros, 101/101 V3.3 verde.

### File List

**Created:**
- `backend-api/test/modules/imports/import-idempotency.test.ts` (3 cenários)
