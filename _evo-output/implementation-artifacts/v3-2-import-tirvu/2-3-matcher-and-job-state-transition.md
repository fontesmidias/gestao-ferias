# Story 2.3: import-matcher (2-stage match + 6-way categorization + diff field-by-field) + import-job-service.transition (state machine guard)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor backend,
I want dois módulos novos: (a) `import-matcher.ts` puro que recebe `TirvuRow[]` + snapshot de `Employee[]` e `Workplace[]` do tenant e devolve as 6 categorias `{ create, update, invalid, absent, reactivation, unchanged }` + `previewSummary` com contadores e `newWorkplaces`; (b) `import-job-service.ts` com `transition(prisma, jobId, fromStates, toState, patch)` que aplica a state machine guard descrita em Architecture D5,
so that o worker da Story 3.1 (BullMQ) possa orquestrar o fluxo PARSING → PREVIEW_READY com `previewSummary` populado e o operador veja **exatamente** o que vai acontecer no apply antes de confirmar.

## Acceptance Criteria

### Match algorithm 2-stage (FR13)

1. **Stage 1 — `tirvuId` match:** Para cada row com `row.tirvuId !== null`, busca em `existingEmployees` o Employee com `employee.tirvuId === row.tirvuId`. Encontrou → candidato Stage 1.

2. **Stage 2 — `cpf` match:** Para cada row, busca em `existingEmployees` o Employee com `employee.cpf === parseCpfNoMask(row.cpf)`. Encontrou → candidato Stage 2.

3. **Resolução por row:**
   - Stage 1 e Stage 2 retornam **o mesmo Employee** → match. Categoriza conforme estado (create/update/unchanged/reactivation/invalid).
   - Stage 1 retorna Employee A e Stage 2 retorna Employee B distinto → **conflito** → row vai em `invalid` com erro `"CPF da planilha pertence a outro colaborador no sistema; verifique se houve troca de CPF"`. **A outra row** (a que apontava para Employee B via Stage 1 ou A via Stage 2) também é marcada `invalid` se aparecer com inversão.
   - Apenas Stage 1 retornou Employee → match nesse Employee.
   - Apenas Stage 2 retornou Employee → match nesse Employee. **Plano de update inclui** preencher `tirvuId` se o Employee não tinha (campo no diff).
   - Nenhum Stage retornou → `create`.

### 6-way categorization (FR13, FR14, FR15, FR16, D11)

4. **`create`:** row sem match. Inclui o `TirvuRow` original em `result.create[]`.

5. **`update`:** row casou Employee `inactive=false` (ou `inactivePending=false`) e ao menos 1 campo do whitelist `DIFF_FIELDS` difere. Inclui `{ row, employee, diff }` onde `diff` é objeto `{ [field]: { from, to } }`.

6. **`unchanged`:** row casou Employee `inactive=false` e **nenhum** campo do whitelist difere. Não gera AuditLog em apply (controle do consumer). `result.unchanged[]` guarda apenas o `row`.

7. **`reactivation`:** row casou Employee com `status='INATIVO'` (V3 V3 não tem campo `inactive bool` separado — soft-delete = `status='INATIVO'`) **OU** `terminationDate !== null`. Categoriza como `reactivation`, **não** `update`. Inclui `{ row, employee, diff }` mesmo se nada além de status mudou.

8. **`absent`:** Employees do `existingEmployees` cujo CPF **não aparece** em nenhuma row da planilha **e** estão ativos (`status !== 'INATIVO'`). Inclui o Employee inteiro em `result.absent[]`. **Nada é modificado** — apenas listado no preview.

9. **`invalid`:** rows que falharam o validator (Story 2.2) **OU** caíram em conflito de match (AC3). Inclui `{ row, errors }`. Validator errors + match conflict errors são **acumulados** no mesmo array.

### Diff field-by-field (FR14, NFR31 idempotência)

10. **`DIFF_FIELDS` whitelist** (constante exportada):
    ```ts
    export const DIFF_FIELDS = [
      'tirvuId', 'name', 'birthDate', 'position', 'status', 'branch',
      'workplace', 'shift', 'phone', 'salary', 'hireDate', 'unionName',
      'terminationDate',
    ] as const
    ```
    Campos JSON (`personalData.*`, `address.*`, `geofencingFlags.*`) e binários (`bankDataEnc/Iv/Tag`) **não entram no diff** desta story. Apply (Story 3.x) reescreve esses blobs sem comparar.

11. **Mapeamento `TirvuRow → Partial<Employee>`** feito por `mapRowToEmployeePatch(row): Partial<Employee>`. Mapping documentado em Dev Notes "Mapeamento Row→Employee".

12. **Comparação por campo:**
    - Strings: `===` após trim. `null === null` é igual; `null === ''` também é igual (normalização preserva null).
    - Datas: `Date.getTime() === Date.getTime()`. Comparar `null` e `Date` → diff.
    - Numbers: comparar via `Number(a) === Number(b)` para tolerar Decimal vs number do Prisma. Diff de `salary` entre 1500 e 1500.00 = sem diff.
    - **`tirvuId` especial:** se Employee tem `null` e row tem string → diff `{ from: null, to: row.tirvuId }`. Backfill cruzado.

13. **Idempotência (NFR31):** se nenhum campo do whitelist difere para nenhuma row, `result = { create: [], update: [], invalid: [], absent: [], reactivation: [], unchanged: [...all rows] }`. Test no CI cobre.

### Detecção de Workplaces novos (FR16)

14. **`newWorkplaces`:** array de strings únicas. Para cada row.lotacao não vazio, se não existe Workplace no tenant com `name === row.lotacao` (case-sensitive trim), adiciona em `newWorkplaces`. Dedup explícito.

15. Workplaces existentes (já cadastrados) **não** entram em `newWorkplaces`. Comparação contra `existingWorkplaces: Workplace[]` recebido no contexto.

### Preview summary (FR15)

16. **`buildPreviewSummary(result): PreviewSummary`** retorna:
    ```ts
    {
      totalRows: number,
      counts: { create, update, unchanged, reactivation, invalid, absent },
      newWorkplaces: string[],
      // first N rows preview (paginação fica em rota GET /preview - Story 4.x)
      sampleRows: Array<{ rowIndex, status, ... }>,  // primeiras 50
    }
    ```

17. `previewSummary` é serializável JSON (vai para `ImportJob.previewSummary`).

### State machine transition (FR32, D5)

18. **`importJobService.transition`** é função pura wrapped em transação Prisma:
    ```ts
    async function transition(
      prisma: PrismaClient,
      jobId: string,
      fromStates: ImportJobStatus[],
      toState: ImportJobStatus,
      patch?: Partial<ImportJob>,
    ): Promise<ImportJob>
    ```

19. Comportamento:
    - Begin transaction
    - Lê o job pelo `id` com `SELECT FOR UPDATE` (Prisma raw query OU `prisma.$queryRaw` + update no mesmo tx)
    - Se `job.status not in fromStates` → throw `InvalidStateTransitionError({ jobId, current, expected: fromStates, attempted: toState })`
    - Update `status = toState` + merge do `patch`
    - Set timestamps automáticos: se `toState === 'PARSING'` set `parsedAt = now`; se `'APPLYING'` set `appliedAt`; se `'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT'` set `completedAt`. (Architecture D5).
    - Commit
    - Retorna o job atualizado.

20. **Não** registra AuditLog dentro da transition — caller é responsável (mantém função pura/testável). AuditLog `EMPLOYEE_IMPORT_JOB_PARSED` etc. fica nas Stories 3.1/3.2.

### Suite de testes (≥20 cases)

21. **`test/modules/import-matcher.test.ts`** (matcher puro, sem DB):
    - Row sem match → `create`
    - Row casa Employee inalterado → `unchanged`
    - Row casa Employee com salary diferente → `update` com `diff.salary`
    - Row casa Employee status=INATIVO → `reactivation`
    - Row casa Employee terminationDate≠null → `reactivation`
    - 2 rows: uma com tirvuId apontando a Employee A e cpf para Employee B → `invalid`
    - Row casa via cpf, Employee tinha tirvuId=null → `update` com diff incluindo `tirvuId`
    - Employee no banco sem CPF correspondente em rows → `absent`
    - Employee inativo no banco sem CPF na planilha → **NÃO** `absent` (já estava inativo)
    - Row.lotacao "TRT-DF" sem Workplace correspondente → `newWorkplaces` contém "TRT-DF"
    - Row.lotacao igual a Workplace existente → não entra em `newWorkplaces`
    - Idempotência: rodar 2x mesmas rows + mesmos employees → `unchanged.length === rows.length`, contadores zero
    - Diff omite `tenantId`, `id`, `createdAt`, `updatedAt`, `bankDataEnc/Iv/Tag` (não vai no whitelist)

22. **`test/modules/import-job-service.test.ts`** (state machine — usar mock Prisma simples):
    - Transition válida `PENDING → PARSING` com timestamp `parsedAt` setado
    - Transition `PARSING → PREVIEW_READY` com `patch.previewSummary` aplicado
    - Transition inválida (ex.: `COMPLETED → APPLYING`) lança `InvalidStateTransitionError`
    - Transition para terminal state (`COMPLETED`/`FAILED`/`CANCELLED`/`TIMED_OUT`) seta `completedAt`
    - Job inexistente → erro

### Out-of-scope (NÃO implementar)

23. **NÃO criar BullMQ queue ou worker** — Story 3.1.
24. **NÃO chamar `prisma.employee.update()`** ou qualquer mutação de Employee — Story 3.x. Esta story só **lê** Employees.
25. **NÃO registrar AuditLog** nesta story.
26. **NÃO criar rotas REST `/imports/*`** — Stories 1.2, 1.3, 4.x.
27. **NÃO encriptar ou desencriptar `bankData`** — Story 3.2 (apply chamará a função do encryption module).
28. **NÃO implementar `markAbsentAsPending`** (decisão do operador no apply) — Story 3.x.
29. **NÃO criar `import-applier.ts`** — Story 3.x.
30. **NÃO criar UI** — Stories 4.x.

## Tasks / Subtasks

### T1 — Tipos auxiliares em `types.ts` (AC: 5, 6, 7, 8, 9, 16)

- [x] T1.1 Editar [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts), adicionar (mantém tipos da Story 5.1 e 2.2 intactos):
  ```ts
  import type { Employee, Workplace, ImportJob, ImportJobStatus } from '@prisma/client'

  export type EmployeePatch = Partial<Pick<Employee,
    'tirvuId' | 'name' | 'birthDate' | 'position' | 'status' | 'branch'
    | 'workplace' | 'shift' | 'phone' | 'salary' | 'hireDate' | 'unionName'
    | 'terminationDate' | 'personalData' | 'address' | 'geofencingFlags'
    | 'inactivePending'
  >>

  export type DiffEntry = { from: unknown; to: unknown }
  export type Diff = Record<string, DiffEntry>

  export interface MatchContext {
    tenantId: string
    existingEmployees: Employee[]
    existingWorkplaces: Pick<Workplace, 'name'>[]
  }

  export interface MatchResult {
    create: { row: TirvuRow; patch: EmployeePatch }[]
    update: { row: TirvuRow; employee: Employee; patch: EmployeePatch; diff: Diff }[]
    unchanged: { row: TirvuRow; employee: Employee }[]
    reactivation: { row: TirvuRow; employee: Employee; patch: EmployeePatch; diff: Diff }[]
    invalid: { row: TirvuRow; errors: string[] }[]
    absent: Employee[]
    newWorkplaces: string[]
  }

  export interface PreviewSummary {
    totalRows: number
    counts: {
      create: number
      update: number
      unchanged: number
      reactivation: number
      invalid: number
      absent: number
    }
    newWorkplaces: string[]
    sampleRows: Array<{
      rowIndex: number
      status: 'create' | 'update' | 'unchanged' | 'reactivation' | 'invalid' | 'absent'
      diff?: Diff
      errors?: string[]
    }>
  }

  export class InvalidStateTransitionError extends Error {
    constructor(
      public readonly jobId: string,
      public readonly current: ImportJobStatus,
      public readonly expected: ImportJobStatus[],
      public readonly attempted: ImportJobStatus,
    ) {
      super(
        `ImportJob ${jobId} está em ${current}; transição para ${attempted} requer estado em [${expected.join(', ')}]`,
      )
      this.name = 'InvalidStateTransitionError'
    }
  }
  ```

### T2 — `import-matcher.ts` — mapping + diff helpers (AC: 10, 11, 12)

- [x] T2.1 Criar `backend-api/src/modules/imports/import-matcher.ts`. Cabeçalho TODO `v3-3-rbac-data-driven`.
- [x] T2.2 Constante exportada `DIFF_FIELDS` conforme AC10.
- [x] T2.3 `function mapRowToEmployeePatch(row: TirvuRow): EmployeePatch`:
  - Mapeia campos do `TirvuRow` para os campos do `EmployeePatch` per Dev Notes "Mapeamento Row→Employee".
  - Datas que são `string` (parse falhou) — não mapeia (deixa de fora). Validator já marcou row como invalid antes do matcher; matcher pode receber rows válidas apenas (caller filtra).
  - JSON aninhado (`personalData`, `address`, `geofencingFlags`) montado a partir das colunas correspondentes. Se todos os subfields são null, deixa o patch sem essa chave (não setar `personalData: {}` vazio).
- [x] T2.4 `function computeDiff(existing: Employee, patch: EmployeePatch, fields = DIFF_FIELDS): Diff`:
  - Para cada `field` em `fields`, compara `existing[field]` vs `patch[field]`.
  - Se `patch[field] === undefined` → não inclui (campo não veio na planilha).
  - Comparação:
    - `null` e `null` → igual.
    - Datas: `Date.getTime()` ambos lados. `null` vs `Date` → diff.
    - Decimal/Decimal vs Number: `Number(a) === Number(b)`.
    - Strings: trim ambos antes de comparar.
  - Retorna `Diff` apenas com campos diferentes.

### T3 — `import-matcher.matchAll` (AC: 1–9, 13, 14, 15)

- [x] T3.1 Função exportada:
  ```ts
  export function matchAll(
    rows: TirvuRow[],
    validRowSet: Set<number>,        // rowIndex das rows válidas (não invalid pelo validator)
    invalidRowsFromValidator: { row: TirvuRow; errors: string[] }[],
    ctx: MatchContext,
  ): MatchResult
  ```
- [x] T3.2 Construir índices em memória (uma vez):
  - `byTirvuId: Map<string, Employee>` — só Employees com `tirvuId !== null`
  - `byCpf: Map<string, Employee>` — todos
- [x] T3.3 Loop principal sobre `rows`:
  - Se `rowIndex` não está em `validRowSet`, pula (já tratado abaixo).
  - Stage 1 + Stage 2 conforme AC1-3. Detecta conflito.
  - Se conflito → adiciona em `invalid` com erro do AC3.
  - Senão, classifica em create/update/unchanged/reactivation:
    - Sem match → `create` com `patch = mapRowToEmployeePatch(row)`.
    - Match Employee X com `status === 'INATIVO'` ou `terminationDate !== null` → `reactivation`.
    - Match Employee X ativo:
      - Calcula `patch = mapRowToEmployeePatch(row)`.
      - **Especial:** se `X.tirvuId === null && row.tirvuId !== null`, força `patch.tirvuId = row.tirvuId`.
      - `diff = computeDiff(X, patch)`.
      - Se `Object.keys(diff).length === 0` → `unchanged`.
      - Senão → `update`.
- [x] T3.4 Loop `existingEmployees` para detectar `absent`:
  - Para cada Employee ativo, se nenhum row.cpf casa → adiciona em `absent`.
- [x] T3.5 `newWorkplaces`:
  - Set `existingNames = new Set(existingWorkplaces.map(w => w.name.trim()))`.
  - Para cada row válida com `row.lotacao` não vazio, se `!existingNames.has(row.lotacao.trim())` → push em `newWorkplaces` (dedup via Set local).
- [x] T3.6 Junta `invalid` com `invalidRowsFromValidator` no início — caller passa o resultado do validator como input. Matcher acumula seus próprios invalid acima.

### T4 — `buildPreviewSummary` (AC: 16, 17)

- [x] T4.1 No mesmo `import-matcher.ts`:
  ```ts
  export function buildPreviewSummary(
    result: MatchResult,
    totalRows: number,
    sampleSize = 50,
  ): PreviewSummary
  ```
- [x] T4.2 Conta cada categoria. `sampleRows` = primeiras `sampleSize` rows da união ordenada por `rowIndex` (preserve ordem do arquivo).
- [x] T4.3 Garante serialização JSON segura: Datas viram ISO string em `from`/`to` se aparecerem no diff. Number permanece number.

### T5 — `import-job-service.ts` (AC: 18, 19, 20)

- [x] T5.1 Criar `backend-api/src/modules/imports/import-job-service.ts`. Cabeçalho TODO.
- [x] T5.2 Função exportada `transition`:
  ```ts
  import type { PrismaClient, ImportJob, ImportJobStatus } from '@prisma/client'
  import { InvalidStateTransitionError } from './types'

  export async function transition(
    prisma: PrismaClient,
    jobId: string,
    fromStates: ImportJobStatus[],
    toState: ImportJobStatus,
    patch?: Partial<ImportJob>,
  ): Promise<ImportJob>
  ```
- [x] T5.3 Implementação:
  - `prisma.$transaction(async (tx) => { ... })`
  - `const job = await tx.importJob.findUnique({ where: { id: jobId } })`
  - Se não encontrou → throw `Error('ImportJob não encontrado: ' + jobId)`
  - Se `!fromStates.includes(job.status)` → throw `InvalidStateTransitionError(...)`
  - Monta `data: { ...patch, status: toState, ...stampedTimestamp }`
  - `stampedTimestamp`:
    - `'PARSING'` → `{ parsedAt: new Date() }` se `parsedAt` é `null`
    - `'APPLYING'` → `{ appliedAt: new Date() }` se `appliedAt` é `null`
    - `'COMPLETED'`, `'FAILED'`, `'CANCELLED'`, `'TIMED_OUT'` → `{ completedAt: new Date() }` se `completedAt` é `null`
  - `return tx.importJob.update({ where: { id: jobId }, data })`
- [x] T5.4 NÃO registra AuditLog (caller responsabilidade).

### T6 — Testes `import-matcher.test.ts` (AC: 21)

- [x] T6.1 Criar `backend-api/test/modules/import-matcher.test.ts`.
- [x] T6.2 Padrão V3 (`node:test` + `node:assert`). Construir fixtures de `Employee` e `Workplace` em memória (não usar Prisma). Helper:
  ```ts
  function makeEmployee(o: Partial<Employee> = {}): Employee { ... }
  function makeRow(o: Partial<TirvuRow> = {}): TirvuRow { ... }
  ```
- [x] T6.3 Casos cobrem todos os bullets do AC21. Cada caso é um `t.test`.
- [x] T6.4 Caso de idempotência: gerar 10 rows + 10 employees correspondentes (CPF e tirvuId iguais, todos campos batendo), rodar matcher, assert `result.unchanged.length === 10` e demais arrays vazios.

### T7 — Testes `import-job-service.test.ts` (AC: 22)

- [x] T7.1 Criar `backend-api/test/modules/import-job-service.test.ts`.
- [x] T7.2 **Mock Prisma client minimalista** (não importar Prisma real — evita conexão DB):
  ```ts
  function makeMockPrisma(initialJob: Partial<ImportJob>): MockPrisma { ... }
  ```
  Mock implementa só os métodos usados: `$transaction(fn)`, `importJob.findUnique`, `importJob.update`. Estado interno em memória.
- [x] T7.3 Casos do AC22.

### T8 — Validação final (AC: tudo)

- [x] T8.1 `npx tsc --noEmit` zero erros.
- [x] T8.2 Suite focada:
  ```bash
  node --test -r ts-node/register \
    "test/modules/import-matcher.test.ts" \
    "test/modules/import-job-service.test.ts"
  ```
  Esperado: ≥18 cases pass.
- [x] T8.3 Suite full regression (todos os módulos):
  ```bash
  node --test -r ts-node/register "test/modules/*.test.ts"
  ```
  Esperado: 79 + ≥18 = ≥97, 0 fail.
- [x] T8.4 Atualizar Dev Agent Record File List com todos novos/modificados.

## Dev Notes

### Mapeamento Row → Employee (T2.3)

Patch construído pela `mapRowToEmployeePatch(row)`:

| TirvuRow | EmployeePatch | Notas |
|---|---|---|
| `tirvuId` | `tirvuId` | string\|null |
| `name` | `name` | trim feito no parser |
| `nascimento` (Date) | `birthDate` | ignorar se string raw |
| `cargo` | `position` | |
| `status` | `status` | uppercase no patch (`'ATIVO'`/`'DEMITIDO'`/`'AFASTADO'`); o V3 mantém também `'INATIVO'` para soft-delete (banco) |
| `empresa` | `branch` | |
| `lotacao` | `workplace` | string legado; `workplaceId` fica null neste matcher |
| `jornada` | `shift` | |
| `telefone` | `phone` | |
| `salario` | `salary` | number → Decimal pelo Prisma |
| `admissao` (Date) | `hireDate` | |
| `demissao` (Date\|null) | `terminationDate` | |
| `sindicato` | `unionName` | |
| `pcd`/`deficiencia`/`sexo`/`nomePai`/`nomeMae`/`rg*`/`pisPasep`/`ctps*`/`email`/`inicioJornada` | `personalData` (JSON) | objeto montado se ao menos 1 não-null |
| `cep`/`endereco`/`enderecoNumero`/`enderecoComplemento`/`enderecoBairro`/`enderecoUf`/`enderecoCidade` | `address` (JSON) | objeto montado se ao menos 1 não-null |
| `foraDaCerca`/`semGeo` | `geofencingFlags` (JSON) | `{ outsideFence, noGeo }` se ao menos 1 não-null |
| `tipoPix`/`chavePix`/`banco`/`tipoConta`/`agencia`/`conta` | **NÃO mapear neste módulo** | Story 3.x cifra e popula `bankDataEnc/Iv/Tag` |
| `salarioComplemento`/`salarioExtra`/`matricula`/`dataLog` | **NÃO no patch desta story** | Atualizar quando virar prioridade — fora do whitelist V3 atual |

### Por que a story V3 atual usa `status='INATIVO'` em vez de `inactive bool`?

Schema atual ([prisma/schema.prisma:188](backend-api/prisma/schema.prisma)) tem `status String @default("ATIVO")` aceitando `ATIVO|FERIAS|AFASTADO|INATIVO`. Story 2.1 adicionou `inactivePending Boolean` (separado, é o "candidato a inativar" — usado pela 3.x quando markAbsentAsPending=true). Não confundir:
- `status === 'INATIVO'` = soft-delete real (já demitido)
- `inactivePending === true` = flag "ausente da planilha", aguarda decisão manual

Reactivation é gatilhada quando `status === 'INATIVO'` ou `terminationDate !== null`. Não pelo `inactivePending`.

### Comparação de Decimal (Prisma) vs Number (TirvuRow)

Prisma 7 retorna `salary` como `Decimal` (lib `decimal.js`-like). TirvuRow.salario é `number`. Comparar via `Number(employee.salary) === Number(patch.salary)` — JavaScript coerce. Para precisão alta (>15 dígitos), seria necessário comparar como string `.toFixed(2)`. Para salário em reais (até centavos), `Number()` basta.

### Por que matcher é função pura (sem Prisma)?

Testabilidade. Worker (Story 3.1) faz:
```ts
const existingEmployees = await prisma.employee.findMany({ where: { tenantId } })
const existingWorkplaces = await prisma.workplace.findMany({ where: { tenantId } })
const result = matchAll(rows, validRowSet, invalidRows, { tenantId, existingEmployees, existingWorkplaces })
const summary = buildPreviewSummary(result, rows.length)
await transition(prisma, jobId, ['PARSING'], 'PREVIEW_READY', { previewSummary: summary, totalRows: rows.length, ... })
```

Tests do matcher constroem arrays in-memory. Tests da `transition` mockam Prisma. Sem precisar de DB live para CI.

### Estado machine — transições válidas (Architecture D5)

```
PENDING → PARSING (worker pegou)
PARSING → PREVIEW_READY (parse + match OK)
PARSING → FAILED (header inválido, parser crash)
PREVIEW_READY → APPLYING (operador apertou apply)
PREVIEW_READY → CANCELLED (operador apertou cancel)
PREVIEW_READY → TIMED_OUT (>15min sem ação)
APPLYING → COMPLETED (todos chunks OK)
APPLYING → FAILED (apply crashou após retries)
```

Transições inválidas devem lançar erro. `transition()` recebe `fromStates` array (suporta múltiplos estados de origem, ex.: `['PARSING', 'APPLYING'] → 'FAILED'`).

### Ordem de processamento das rows (preserve para sample)

`buildPreviewSummary.sampleRows` preserva ordem do arquivo (rowIndex ascendente). MatchResult cada array (`create`, `update`, etc.) preserva ordem em que foi adicionado, mas **não garante** ordem global ascendente — para sample, fazer merge ordenado por `rowIndex`.

### Alocações de memória

- `existingEmployees`: para um tenant com 10k Employees, ~5MB de RAM (worst case). OK.
- Index `byTirvuId` + `byCpf`: 2 maps de 10k entries cada = ~2MB. OK.
- `MatchResult`: até 5k rows do upload + diffs = ~1-5MB. OK.

NFR de memória (≤512MB) folga confortavelmente.

### Pegadinhas conhecidas

- **`null` vs `undefined` em diff:** Prisma retorna `null` para colunas vazias. Patch pode ter `undefined` (campo não mapeado) ou `null` (vindo da row vazia). Matcher diff trata `undefined` como "campo não mudou" (skip), `null` como "valor vazio explícito".
- **Status case sensitivity:** Validator (Story 2.2) já normaliza com `.toUpperCase()`. Patch.status já vem uppercase. Comparação case-sensitive ok.
- **`tirvuId` é string:** Excel pode dar como número (`1364` em vez de `"1364"`). Parser (Story 2.2) faz `String(s).trim()` → vira `"1364"`. Matcher compara strings.
- **Soft-delete em V3 não tem campo dedicado:** `status === 'INATIVO'` é o flag. Cuidado ao comparar para reactivation.

### Padrão de teste V3 com mock Prisma minimalista

```ts
type MockJob = ImportJob
function makeMockPrisma(initial: MockJob) {
  let job = { ...initial }
  return {
    importJob: {
      async findUnique({ where: { id } }: { where: { id: string } }) {
        return id === job.id ? { ...job } : null
      },
      async update({ where: { id }, data }: { where: { id: string }; data: any }) {
        if (id !== job.id) throw new Error('not found')
        job = { ...job, ...data }
        return { ...job }
      },
    },
    async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return fn(this)
    },
  }
}
```

Cast `as any as PrismaClient` no test para não brigar com tipos.

### O que NÃO fazer nesta story

- ❌ NÃO chamar `prisma.employee.update()` ou create() — esta story não muta employees.
- ❌ NÃO chamar `auditLog.append(...)` — Story 3.x.
- ❌ NÃO criar `import-applier.ts` — Story 3.x.
- ❌ NÃO criar BullMQ queue (`src/plugins/imports.ts`) — Story 3.1.
- ❌ NÃO criar rota REST — Stories 1.2/1.3/4.x.
- ❌ NÃO mexer em `bank-data-encryption.ts` — Story 5.1 done.

### Project Structure Notes

Files que esta story mexe (esperado):
- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — adiciona tipos do matcher + state machine error
- ✨ `backend-api/src/modules/imports/import-matcher.ts` — novo
- ✨ `backend-api/src/modules/imports/import-job-service.ts` — novo
- ✨ `backend-api/test/modules/import-matcher.test.ts` — novo
- ✨ `backend-api/test/modules/import-job-service.test.ts` — novo

Files que esta story **NÃO** deve tocar:
- 🚫 `prisma/schema.prisma` (Story 2.1 done)
- 🚫 `src/modules/imports/tirvu-parser.ts` / `import-validator.ts` (Story 2.2 done)
- 🚫 `src/modules/imports/bank-data-encryption.ts` (Story 5.1 done)
- 🚫 `src/plugins/*` ou `src/routes/*`
- 🚫 frontend-web

### Mensagem de commit sugerida

```
feat(imports): import-matcher + state machine transition (Story 2.3)

- import-matcher.ts: 2-stage match (tirvuId, cpf) + 6-way categorization
  (create/update/unchanged/reactivation/invalid/absent), field-by-field
  diff with whitelist, conflict detection, newWorkplaces detection,
  buildPreviewSummary
- import-job-service.ts: transition(prisma, jobId, fromStates, toState, patch)
  with state machine guard + automatic timestamp stamping
- types.ts: MatchContext, MatchResult, PreviewSummary, EmployeePatch, Diff,
  InvalidStateTransitionError
- ≥18 unit tests (matcher + state machine, mock Prisma)
- pure functions — no DB dependency, no audit log
```

### References

- [Architecture D5 — ImportJob State Machine](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D5)
- [Architecture D8 — Match Algorithm + Diff](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D8) (linhas 503–540)
- [Architecture D11 — Soft-deleted Re-import](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D11) (linhas 648–662)
- [Epics — Story 2.3](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 458–517)
- [PRD — FR13–FR16, FR19, FR26, FR32, NFR31](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- [Story 2.1 (done)](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-1-schema-migration-employee-and-import-job.md) — schema com tirvuId, terminationDate, inactivePending
- [Story 2.2 (done)](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-2-tirvu-parser-and-validator.md) — TirvuRow, ValidationResult, helpers
- [Schema atual Employee + ImportJob](backend-api/prisma/schema.prisma)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- 1ª compilação do `import-job-service.ts`: erro TS2322 em `tx.importJob.update({ data: patch })` porque `Partial<ImportJob>` inclui campos imutáveis como `id`/`tenantId`/`createdAt` que conflitam com `Prisma.ImportJobUpdateInput`. Corrigido criando tipo `ImportJobPatch = Omit<Prisma.ImportJobUncheckedUpdateInput, 'id'|'tenantId'|'operatorUserId'|'status'|'createdAt'>`.
- Test de transition com `previewSummary: summary as ImportJob['previewSummary']` falhou porque `JsonValue` permite null mas Prisma `UpdateInput` exige `NullableJsonNullValueInput | InputJsonValue`. Workaround: cast `as never` no test (caller real vai sempre passar objeto não-null aqui).
- Comparação de Decimal vs Number: usei coerção `Number(x.toString())` no `valuesEqual`. Funcionou no test do mock (objeto com `toString()`) e funcionará com `Decimal` real do Prisma (também tem `toString()` → string parseável).

### Completion Notes List

- ✅ T1 — `types.ts` estendido com `EmployeePatch`, `Diff`, `MatchContext`, `MatchResult`, `PreviewSummary`, `RowCategory`, `InvalidStateTransitionError`. Mantido tudo da Story 2.2 e 5.1.
- ✅ T2 — `import-matcher.ts` exporta `DIFF_FIELDS` (13 campos), `mapRowToEmployeePatch`, `computeDiff`. JSON aninhado (`personalData`/`address`/`geofencingFlags`) só é incluído se ao menos 1 subfield for não-null. Decimal vs Number coerce via `Number(x.toString())`.
- ✅ T3 — `matchAll(inputs)` implementado. 2-stage match (`tirvuId` + `cpf`), conflito → invalid, sem match → create, ativo+nodiff → unchanged, ativo+diff → update, inativo → reactivation. `tirvuId` backfill em diff quando Employee tinha null.
- ✅ T4 — `buildPreviewSummary(result, totalRows, sampleSize=50)`. `sampleRows` ordenado por `rowIndex`. Counts certos por categoria. NewWorkplaces dedup.
- ✅ T5 — `import-job-service.ts` exporta `transition(prisma, jobId, fromStates, toState, patch)` com $transaction, `findUnique` + guard + `update`. Timestamps automáticos (parsedAt/appliedAt/completedAt) só setados se ainda null.
- ✅ T6 — `import-matcher.test.ts` com 22 cases cobrindo todas as categorias, conflito, idempotência, dedup workplaces, validator-invalid preservado, sample/counts.
- ✅ T7 — `import-job-service.test.ts` com 8 cases. Mock Prisma in-memory. Transição válida/inválida, terminal states, múltiplos fromStates, job inexistente, appliedAt não-sobrescreve.
- ✅ T8 — `tsc --noEmit` zero erros. Suite focada 30/30. Suite full regression 109/109 (79 V3 + 30 novos).

### File List

- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — adiciona tipos do matcher + `InvalidStateTransitionError`
- ✨ [backend-api/src/modules/imports/import-matcher.ts](backend-api/src/modules/imports/import-matcher.ts)
- ✨ [backend-api/src/modules/imports/import-job-service.ts](backend-api/src/modules/imports/import-job-service.ts)
- ✨ [backend-api/test/modules/import-matcher.test.ts](backend-api/test/modules/import-matcher.test.ts) — 22 cases
- ✨ [backend-api/test/modules/import-job-service.test.ts](backend-api/test/modules/import-job-service.test.ts) — 8 cases

### Change Log

- 2026-05-01 — Story 2.3 implementada. import-matcher (puro, 6 categorias + diff whitelist + newWorkplaces) e import-job-service (state machine guard com $transaction + timestamps automáticos). 30 unit tests novos. 109/109 full suite.
