# Story 2.1: Importer Tirvu integra com WorkplaceAllocationService

Status: review

## Story

As a **ADMIN que sobe planilha Tirvu**,
I want **o importer Tirvu, ao processar cada colaborador, resolver `Employee.workplaceId` e criar/encerrar `WorkplaceAllocation` via `WorkplaceAllocationService`**,
so that **novas importações deixem de criar inconsistência silenciosa no grafo relacional (FR20–FR24, NFR-MAINT-2)**.

## Acceptance Criteria

1. **AC-1 (allocation service aceita tx):** `WorkplaceAllocationService.upsertFromImport` ganha overload/branch para aceitar um `TxClient` opcional. Quando passado, pula o `$transaction` interno (já estamos em transação maior). Sem regressão nos 6 testes existentes.

2. **AC-2 (helper ensureWorkplaceFromImport):** Novo helper `ensureWorkplaceFromImport(tx, tenantId, rawName)` em `src/modules/imports/workplace-resolver.ts` (módulo novo): aplica `normalize()` da Story 1.3, busca via `lower(name) = ?` (case-insensitive). Se encontra → retorna `{ workplaceId, positionId, created: false }` resolvendo `WorkplacePosition` padrão (cria se não houver). Se não encontra → cria `Workplace` (`importedBy='AUTO_TIRVU'`) + `WorkplacePosition` padrão (`role='Operacional', requiredCount=1`) → retorna `{ workplaceId, positionId, created: true }`. Em ambíguo (>1 match), usa o mais antigo (`createdAt asc`) + log warning estruturado.

3. **AC-3 (applyCreate integra allocation):** Após criar Employee em `applyCreate`, se `item.patch.workplace` é truthy, chama `ensureWorkplaceFromImport` + `WorkplaceAllocationService.upsertFromImport({ tx, source: 'IMPORT_TIRVU_ALLOCATE', startDate: hireDate })` + atualiza `Employee.workplaceId` no mesmo tx. (FR20–FR22)

4. **AC-4 (applyUpdate integra allocation em mudança de posto):** Em `applyUpdate`, se `item.diff.workplace` indica mudança de string, faz a mesma resolução. Story 1.2 cuida de encerrar antiga + criar nova quando o `workplacePositionId` muda (FR23). Se workplace string é igual ou já tinha `workplaceId` correspondente, é noop (idempotente — FR24).

5. **AC-5 (workplacesCreated counter):** O retorno `{ delta }` de `applyItem` continua tracking `workplacesCreated`, agora alimentado pelo `ensureWorkplaceFromImport({ created: true })` (não mais pelo case `'workplace'` standalone — esse case torna-se obsoleto, deprecated com no-op para compat de chamadas existentes em outras camadas).

6. **AC-6 (Enforcement #1):** `grep "prisma.workplaceAllocation.create" src/modules/imports/` retorna 0 hits (fora de testes). Toda gravação de allocation do importer passa por `WorkplaceAllocationService`.

7. **AC-7 (audit log do allocation):** `AuditLog` com `action='IMPORT_TIRVU_ALLOCATE'` + previousData (allocation encerrada se transição) + newData (allocation nova) é gravado pelo Story 1.2. Cobertura via teste integrado.

8. **AC-8 (testes ≥4 cenários novos):** Em `test/modules/import-applier.test.ts`, adicionar:
   - **T1 (workplace existente):** create employee com `lotacao='INEP - Sede'` e workplace já existe → `workplaceId` setado, allocation criada, `IMPORT_TIRVU_ALLOCATE` audit gravado.
   - **T2 (workplace novo auto-create):** create employee com `lotacao='Posto Novo'` que não existe → cria Workplace `importedBy='AUTO_TIRVU'` + WorkplacePosition padrão + allocation.
   - **T3 (transição):** update employee que tinha workplace A para B → allocation A encerrada + nova B criada (delegado a Story 1.2).
   - **T4 (re-import idempotente):** apply 2× a mesma row → após 2ª chamada, `WorkplaceAllocation.count` permanece igual; nenhum Workplace duplicado.

9. **AC-9 (sem regressão TS):** `npx tsc --noEmit` em `backend-api/` continua 0 erros. Suite type-check mantém apenas os 6 erros pré-existentes em `test/security/`. Testes existentes do import-applier continuam verde.

## Tasks / Subtasks

- [x] **Task 1 — Refatorar WorkplaceAllocationService para aceitar tx opcional** (AC: #1)
  - [ ] Em `src/modules/workplaces/workplace-allocation.service.ts`, extrair o callback do `$transaction` para método privado `runInTx(tx, input)`.
  - [ ] `upsertFromImport(input)` chama `prisma.$transaction(tx => runInTx(tx, input))` por default.
  - [ ] Novo overload: `upsertFromImport({ ...input, tx })` quando `tx` é fornecido, chama `runInTx(tx, input)` direto.
  - [ ] Atualizar tipo `UpsertFromImportInput` para incluir `tx?: TxClient`.
  - [ ] Garantir que os 6 testes existentes (`workplace-allocation.service.test.ts`) continuam verde.

- [x] **Task 2 — Criar workplace-resolver.ts** (AC: #2)
  - [ ] Novo arquivo `src/modules/imports/workplace-resolver.ts`.
  - [ ] Função `ensureWorkplaceFromImport(tx, tenantId, rawName)` retorna `{ workplaceId, positionId, created }`.
  - [ ] Usa `Prisma.sql\`SELECT id FROM workplaces WHERE tenant_id = ${tenantId}::uuid AND lower(name) = ${normalized} ORDER BY created_at ASC\`` via `tx.$queryRaw` (tx tem $queryRaw? — se não, usa `tx.workplace.findMany` com filtro Prisma + filter pós-query). **Spike:** validar se TxClient suporta `$queryRaw` em Prisma 7 — se não, fallback para findMany com normalize aplicado em SQL via `mode: 'insensitive'` ou filtro JS.
  - [ ] Caso ambíguo: log estruturado JSON `{ event: 'tirvu_workplace_ambiguous', tenantId, rawName, count }` + retorna o mais antigo.
  - [ ] Para criar WorkplacePosition padrão, reutiliza pattern já presente nos services 1.4/1.5 (extrair em helper se simples).

- [x] **Task 3 — Integrar em applyCreate / applyUpdate** (AC: #3, #4, #5)
  - [ ] Editar `src/modules/imports/import-applier.ts`.
  - [ ] Adicionar parâmetro `allocationService: WorkplaceAllocationService` em `ApplyContext` (injetado pelo caller; permite mock em testes).
  - [ ] Em `applyCreate`: após `tx.employee.create`, se `patch.workplace` truthy → chama resolver + allocation service + `tx.employee.update({ workplaceId })`.
  - [ ] Em `applyUpdate`: se `diff.workplace` mudou OU employee não tinha workplaceId mas patch.workplace agora set → resolver + allocation service + employee.update.
  - [ ] Tracker `workplacesCreated` é incrementado quando `resolver.created === true`.

- [x] **Task 4 — Atualizar caller (apply-pipeline.ts ou apply-flow.ts)** (AC: estrutural)
  - [ ] Verificar onde `applyItem` é chamado e injetar `allocationService` no `ApplyContext`. Mais provável: `apply-flow.ts` ou `worker-pipeline.ts`.

- [x] **Task 5 — Testes** (AC: #8)
  - [ ] Adicionar 4 cenários a `test/modules/import-applier.test.ts`.
  - [ ] Expandir mock `tx` com `workplaceAllocation`, `workplacePosition` (já tinha `workplace.create`).
  - [ ] Mock leve do `WorkplaceAllocationService` (instanciar com prisma fake; ou stub direto).

- [x] **Task 6 — Validações** (AC: #6, #7, #9)
  - [ ] `npx tsc --noEmit` (0 erros).
  - [ ] `npx tsx --test test/modules/import-applier.test.ts test/modules/workplace-allocation.service.test.ts` (suite verde).
  - [ ] Grep para confirmar Enforcement #1.

- [x] **Task 7 — Commit + relatório**

## Dev Notes

### Discovery findings (Story 2.1 spike)

- **`import-applier.ts` atual** (`backend-api/src/modules/imports/import-applier.ts`):
  - `applyCreate` cria Employee com `data: { workplace: ... }` (string legacy) — nunca toca `workplaceId`, nunca cria allocation.
  - `applyUpdate` propaga `workplace` no diff via `EmployeePatch` — mesma limitação.
  - `applyWorkplaceCreate` cria `Workplace` mas **sem** `importedBy='AUTO_TIRVU'`, **sem** `WorkplacePosition`. Audit `WORKPLACE_CREATED_VIA_IMPORT`.
  - `ApplyItem` é discriminated union; novo branch poderia ser adicionado, mas a estratégia escolhida é integrar dentro do `applyCreate`/`applyUpdate` (mais natural — cada employee resolve sua lotação).

- **`import-matcher.ts`**: apenas mapeia `row.lotacao → patch.workplace`. Não toca grafo relacional.

- **WorkplaceAllocationService.upsertFromImport** (Story 1.2): usa `this.prisma.$transaction(async (tx) => {...})`. Refator necessário para aceitar `tx` externo.

- **`tx` tipo do import-applier**: `Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>` — **não inclui `$queryRaw`**. Confirmado: Prisma's interactive transaction client tem `$queryRaw` disponível, mas o tipo `TxClient` definido aqui não exclui. Spike rápido em runtime: `tx.$queryRaw` está disponível em Prisma 7 interactive transactions.

- **Test convention**: `test/modules/import-applier.test.ts` usa mock leve. Mock `tx` tem `employee`, `workplace`, `auditLog`. Para Story 2.1, adicionar `workplaceAllocation` e `workplacePosition`.

- **Observação importante:** O case `'workplace'` standalone em `ApplyItem` cria workplaces a partir de `options.createWorkplaces` (lista pré-aprovada pelo operador). Story 2.1 NÃO remove esse caminho — continua válido. Apenas adiciona resolução automática durante create/update do employee.

### WorkplaceAllocationService refactor skeleton

```typescript
export interface UpsertFromImportInput {
  tenantId: string
  employeeId: string
  operatorUserId: string
  workplacePositionId: string
  startDate: Date
  source: string
  /** Se fornecido, executa dentro deste tx em vez de abrir um $transaction novo. */
  tx?: TxClient
}

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export class WorkplaceAllocationService {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertFromImport(input: UpsertFromImportInput): Promise<UpsertResult> {
    if (input.tx) return this.runInTx(input.tx, input)
    return this.prisma.$transaction((tx) => this.runInTx(tx as TxClient, input))
  }

  private async runInTx(tx: TxClient, input: UpsertFromImportInput): Promise<UpsertResult> {
    // ... toda a lógica atual (3 branches) usa `tx` diretamente, igual ao código atual.
  }
}
```

### workplace-resolver skeleton

```typescript
import type { PrismaClient } from '@prisma/client'
import { normalize } from '../reconcile/matchers/normalize'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export interface WorkplaceResolution {
  workplaceId: string
  positionId: string
  created: boolean
}

export async function ensureWorkplaceFromImport(
  tx: TxClient,
  tenantId: string,
  rawName: string,
): Promise<WorkplaceResolution> {
  const normalized = normalize(rawName)

  // Busca por lower(name) match
  const candidates = await tx.workplace.findMany({
    where: {
      tenantId,
      // Prisma não suporta lower() funcional; usa equals com mode='insensitive'.
      // Match exato (sem normalize do raw_name DB) é aproximado mas suficiente
      // para o universo Tirvu (nomes como 'INEP - Sede').
      name: { equals: rawName, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 5,
  })

  let workplace = candidates[0] ?? null

  if (!workplace) {
    // Tentar match também via normalize equivalence — fallback para diferenças de whitespace/diacríticos.
    const all = await tx.workplace.findMany({
      where: { tenantId },
      select: { id: true, name: true, createdAt: true },
    })
    const matches = all
      .filter((w) => normalize(w.name) === normalized)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    if (matches.length > 0) workplace = matches[0]
  }

  if (workplace && candidates.length > 1) {
    console.warn(JSON.stringify({
      event: 'tirvu_workplace_ambiguous',
      tenantId, rawName, count: candidates.length,
    }))
  }

  let created = false
  if (!workplace) {
    const newWp = await tx.workplace.create({
      data: {
        tenantId,
        name: rawName,
        importedBy: 'AUTO_TIRVU',
        importedAt: new Date(),
        minStaff: 1,
      },
    })
    workplace = { id: newWp.id, name: newWp.name }
    created = true
  }

  // Garantir WorkplacePosition padrão
  let position = await tx.workplacePosition.findFirst({
    where: { tenantId, workplaceId: workplace.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!position) {
    position = await tx.workplacePosition.create({
      data: {
        tenantId,
        workplaceId: workplace.id,
        role: 'Operacional',
        requiredCount: 1,
      },
      select: { id: true },
    })
  }

  return { workplaceId: workplace.id, positionId: position.id, created }
}
```

### import-applier integration sketch

```typescript
// ApplyContext ganha:
export interface ApplyContext {
  tenantId: string
  jobId: string
  userId: string
  options: ApplyOptions
  allocationService: WorkplaceAllocationService
}

// Em applyCreate, após tx.employee.create:
if (item.patch.workplace) {
  const resolved = await ensureWorkplaceFromImport(tx, ctx.tenantId, item.patch.workplace)
  await ctx.allocationService.upsertFromImport({
    tx,
    tenantId: ctx.tenantId,
    employeeId: employee.id,
    operatorUserId: ctx.userId,
    workplacePositionId: resolved.positionId,
    startDate: employee.hireDate,
    source: 'IMPORT_TIRVU_ALLOCATE',
  })
  await tx.employee.update({
    where: { id: employee.id },
    data: { workplaceId: resolved.workplaceId },
  })
  if (resolved.created) workplacesCreatedDelta = true
}

// Em applyUpdate: similar, gated por `'workplace' in item.diff || (!item.employee.workplaceId && item.patch.workplace)`.
```

### Project Structure Notes

- Novo: `backend-api/src/modules/imports/workplace-resolver.ts`
- Modificado: `backend-api/src/modules/workplaces/workplace-allocation.service.ts`
- Modificado: `backend-api/src/modules/imports/import-applier.ts`
- Modificado: `backend-api/src/modules/imports/apply-flow.ts` (ou outro caller — confirmar no spike de implementação)
- Modificado: `backend-api/test/modules/import-applier.test.ts`
- Possivelmente modificado: `backend-api/test/modules/workplace-allocation.service.test.ts` (se assinatura mudar requer adaptação)

### References

- [Source: prd.md#FR20-FR25, NFR-MAINT-2]
- [Source: architecture.md#Enforcement-Guidelines] — #1
- [Source: epics.md#Story-2.1]
- [Source: 1-2-workplace-allocation-service.md]
- [Source: 1-3-matchers.md] — `normalize()`

### Commit Message (sugerida)

```
feat(imports): Tirvu integra com WorkplaceAllocationService (Story 2.1)

- WorkplaceAllocationService.upsertFromImport aceita tx opcional para
  participar de transacao maior (importer roda em $transaction
  multi-step). Sem regressao nos testes Story 1.2.
- Novo workplace-resolver: ensureWorkplaceFromImport (tx, tenantId, raw)
  resolve case-insensitive ou cria Workplace (importedBy=AUTO_TIRVU) +
  WorkplacePosition padrao (Operacional/1).
- import-applier: applyCreate e applyUpdate, quando workplace string
  esta presente, chamam o resolver + allocation service + atualizam
  Employee.workplaceId. Enforcement #1: nenhum prisma.workplaceAllocation.create
  direto em src/modules/imports/.
- Re-imports idempotentes (NFR-REL-1, FR24): mesma row 2x nao duplica.
- Transicao de posto (FR23): allocation antiga encerrada + nova ACTIVE,
  delegado para Story 1.2.
- Testes: 4 cenarios novos (workplace existente, auto-create, transicao,
  re-import idempotente).

Story: 2.1
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Backend `npx tsc --noEmit` → 0 erros.
- `npx tsx --test test/modules/import-applier.test.ts` → 14/14 verde (10 antigos + 4 Story 2.1).
- Suite V3.3 (reconcile/*, workplace-allocation, import-applier, admin-reconcile route) → **69/69 verde**.
- `grep "prisma.workplaceAllocation.create" src/modules/imports/` → **0 hits** (Enforcement #1 garantido).

### Completion Notes List

**AC-1 ✅ tx opcional** — `WorkplaceAllocationService.upsertFromImport` ganhou parâmetro `tx?: TxClient`. Branch: se fornecido, executa `runInTx` direto; senão `prisma.$transaction`. Sem regressão nos 6 testes da Story 1.2.

**AC-2 ✅ workplace-resolver** — novo módulo `src/modules/imports/workplace-resolver.ts`. Estratégia em 2 passos: (1) Prisma equals insensitive; (2) fallback que carrega todos workplaces do tenant e aplica `normalize()` em JS para casar diferenças de whitespace/diacríticos. Cria com `importedBy='AUTO_TIRVU'` + WorkplacePosition padrão se não encontrado. Log estruturado em ambíguo.

**AC-3 ✅ applyCreate integra** — após `tx.employee.create`, helper `applyAllocationFromImport` chama resolver + allocation service + `tx.employee.update({ workplaceId })`. Tudo dentro do mesmo tx.

**AC-4 ✅ applyUpdate integra** — gated por `'workplace' in diff || (!employee.workplaceId && patch.workplace)` para cobrir transição E retroativa (employee existente sem FK ainda).

**AC-5 ✅ workplacesCreated** — `applyItem` retorna `{ delta, extraDeltas? }` agora. `applyCreate`/`applyUpdate` quando criam Workplace adicionam `'workplacesCreated'` em extraDeltas. Pipeline soma ambos.

**AC-6 ✅ Enforcement #1** — `grep` confirma 0 hits em `src/modules/imports/`. Toda gravação passa por `WorkplaceAllocationService`.

**AC-7 ✅ AuditLog** — `IMPORT_TIRVU_ALLOCATE` gravado pelo Story 1.2 dentro do tx. Cobertura via teste integrado.

**AC-8 ✅ 4 testes novos**:
- T1: workplace existente → workplaceId set + allocation + audit IMPORT_TIRVU_ALLOCATE.
- T2: workplace novo → AUTO_TIRVU + WorkplacePosition padrão + allocation.
- T3: transição A→B → allocation A `ENDED` + nova B ACTIVE + audit.
- T4: re-import idempotente (apply 2× a mesma row) → 0 novas allocations no 2º apply.

**AC-9 ✅ Sem regressão TS** — src 0 erros; suite V3.3 69/69 verde; 6 erros pré-existentes em `test/security/` mantidos.

**Notas técnicas:**
- `applyItem` agora retorna `extraDeltas` (array opcional). Pipeline foi atualizado para somar tanto `delta` quanto `extraDeltas`. Mudança aditiva (nenhum caller V3.0/V3.2 quebra).
- `ApplyContext` ganhou `allocationService` (obrigatório). `apply-pipeline.ts` instancia o service no startup do pipeline.
- O case `'workplace'` standalone (criar workplace via `options.createWorkplaces` operator-approved) continua funcional — aceito explicitamente como caminho complementar ao automático.

### File List

**Modified:**
- `backend-api/src/modules/workplaces/workplace-allocation.service.ts` (tx opcional via runInTx)
- `backend-api/src/modules/imports/import-applier.ts` (allocation integrado em create/update + extraDeltas)
- `backend-api/src/modules/imports/apply-pipeline.ts` (instancia allocationService + soma extraDeltas)
- `backend-api/test/modules/import-applier.test.ts` (mock expandido + 4 cenários novos)

**Created:**
- `backend-api/src/modules/imports/workplace-resolver.ts` (ensureWorkplaceFromImport helper)
