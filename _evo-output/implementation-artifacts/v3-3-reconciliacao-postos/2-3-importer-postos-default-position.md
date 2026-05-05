# Story 2.3: Importer de Postos auto-cria WorkplacePosition padrão

Status: review

## Story

As a **ADMIN que sobe planilha de Postos**,
I want **o importer de Postos auto-criar uma `WorkplacePosition` padrão (`role='Operacional'`, `requiredCount=1`) quando a planilha não traz coluna de cargo, e respeitar a coluna quando ela existe**,
so that **postos importados não nasçam estéreis (sem posições) e a tela `/workplaces` mostre `posições > 0` desde o primeiro import (FR26, FR27)**.

## Acceptance Criteria

1. **AC-1 (extração para service):** Lógica do handler `POST /v1/workplaces/import` é movida para um módulo testável `backend-api/src/modules/workplaces/import-workplaces.service.ts`. Função `importWorkplaces({ prisma, tenantId, rawData })` retorna `{ created, updated, positions, defaultsCreated }`. Handler vira fino — apenas parse + chama service + responde envelope.

2. **AC-2 (positions explícitas continuam funcionando):** Quando uma row do grupo tem `positionRole` truthy, cria `WorkplacePosition` com `role=row.positionRole`, `shiftPattern=row.positionShift`, `requiredCount=row.positionCount`. Não cria duplicata (mesmo role+shift no mesmo workplace).

3. **AC-3 (default position quando ausente):** Após processar todas as rows do grupo de um workplace **recém-criado**, se NENHUMA WorkplacePosition foi criada para aquele workplace (nem por essa importação, nem pré-existente), cria uma padrão: `role='Operacional', requiredCount=1, shiftPattern=null`. Conta em `defaultsCreated`.

4. **AC-4 (workplaces existentes):** Para workplace existente (caminho `updated++`) que **já possui** alguma WorkplacePosition (criada em import anterior ou manual), NÃO criar padrão automaticamente — respeita estado atual. Para workplace existente que **não possui** position e não recebeu position nesta importação, criar padrão (recover de imports anteriores que esqueceram).

5. **AC-5 (idempotência):** Re-importar a mesma planilha não duplica positions. Mesma lógica do existsPos atual + verificação adicional do default (não cria 2 padrões).

6. **AC-6 (response inclui defaultsCreated):** Response da rota informa `defaultsCreated` no objeto de retorno (ex.: `"Importação concluída: 5 postos criados, 2 atualizados, 7 posições adicionadas, 3 posições padrão criadas"`).

7. **AC-7 (testes ≥3 cenários):** Testes em `backend-api/test/modules/workplaces/import-workplaces.service.test.ts` (criar diretório):
   - **T1 (planilha sem cargo):** 2 workplaces novos sem positionRole → 2 positions padrão criadas.
   - **T2 (planilha com cargo):** 2 workplaces novos com positionRole → 2 positions explícitas, 0 default.
   - **T3 (planilha mista):** 3 workplaces (1 com cargo, 2 sem) → 1 position explícita + 2 default.
   - Bônus: re-import idempotente (mesma planilha 2× → contagem permanece).

8. **AC-8 (sem regressão):** `npx tsc --noEmit` 0 erros. Suite global continua verde (sem testes existentes desse importer; só Story 2.3 valida).

## Tasks / Subtasks

- [x] **Task 1 — Extrair service**
  - [ ] Criar `backend-api/src/modules/workplaces/import-workplaces.service.ts`.
  - [ ] Função `importWorkplaces({ prisma, tenantId, rawData })` retorna `{ created, updated, positions, defaultsCreated }`.
  - [ ] Mover toda a lógica de agrupamento + upsert + positions do handler para o service.
  - [ ] Helper `parseAnyDate` movido junto.
  - [ ] Type `RawWorkplace` reusado de `employees/import-service.ts` (re-export ou import).

- [x] **Task 2 — Default position logic** (AC: #3, #4)
  - [ ] Após processar todas rows do grupo de um workplace, contar quantas positions foram criadas pelo loop atual.
  - [ ] Se 0 positions criadas E workplace não tem positions pré-existentes (`prisma.workplacePosition.count({ where: { workplaceId, tenantId }})`) → criar padrão e incrementar `defaultsCreated`.

- [x] **Task 3 — Handler thin**
  - [ ] Refatorar `POST /v1/workplaces/import` em `backend-api/src/routes/api/v1/workplaces/index.ts` para chamar `importWorkplaces`.
  - [ ] Mensagem de retorno inclui `defaultsCreated` quando > 0.

- [x] **Task 4 — Testes** (AC: #7)
  - [ ] Criar `backend-api/test/modules/workplaces/import-workplaces.service.test.ts`.
  - [ ] Mock leve in-memory: `workplace.findFirst`, `workplace.create`, `workplace.update`, `workplacePosition.findFirst`, `workplacePosition.count`, `workplacePosition.create`.
  - [ ] 3 cenários + 1 bônus de idempotência.

- [x] **Task 5 — Validações** (AC: #8)
  - [ ] `npx tsc --noEmit` 0 erros.
  - [ ] `npx tsx --test test/modules/workplaces/import-workplaces.service.test.ts` verde.

- [x] **Task 6 — Commit + relatório**

## Dev Notes

### Discovery findings (Story 2.3 spike)

- **Handler atual:** `backend-api/src/routes/api/v1/workplaces/index.ts:17-153`. Lógica inline (~140 linhas) de parser + upsert + positions. Sem testes existentes (`backend-api/test/modules/workplaces/` ainda não existe).
- **`ImportService.parseWorkplaces`** (`backend-api/src/modules/employees/import-service.ts`): retorna `RawWorkplace[]` mapeado de CSV/XLSX. Tipo já tem `positionRole`, `positionShift`, `positionCount`.
- **Comportamento atual de positions** (linhas 120-140): só cria se `row.positionRole` truthy. Não tem fallback para criar padrão. Idempotência via `findFirst({ workplaceId, role, shiftPattern })`.
- **Estrutura por externalId/name:** Workplaces são agrupados por chave `ext:<id>` ou `name:<nome>`; cada grupo pode ter múltiplas rows (cada uma representando uma posição filha).

### Service Skeleton

```typescript
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

function parseAnyDate(raw?: string): Date | null {
  if (!raw) return null
  const m1 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m1) {
    const [, a, b, y, h, mi, s] = m1
    const day = Number(a), month = Number(b)
    const d = new Date(Date.UTC(Number(y), month - 1, day, Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0)))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function importWorkplaces(
  input: ImportWorkplacesInput,
): Promise<ImportWorkplacesResult> {
  const { prisma, tenantId, rawData } = input
  let created = 0, updated = 0, positions = 0, defaultsCreated = 0

  // Agrupa por externalId (chave forte) ou name
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
      : await prisma.workplace.findFirst({ where: { tenantId, name, externalId: null } })

    const wasNew = !workplace

    const upsertPayload = {
      tenantId, name, externalId,
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

    // Positions explícitas
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

    // Default position se workplace ainda não tem nenhuma
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
```

### Project Structure Notes

**Modified:**
- `backend-api/src/routes/api/v1/workplaces/index.ts` (handler thin)

**Created:**
- `backend-api/src/modules/workplaces/import-workplaces.service.ts`
- `backend-api/test/modules/workplaces/import-workplaces.service.test.ts`

### References

- [Source: prd.md#FR26, FR27]
- [Source: epics.md#Story-2.3]
- [Source: backend-api/src/routes/api/v1/workplaces/index.ts:17-153]

### Commit Message (sugerida)

```
feat(workplaces): importer auto-cria WorkplacePosition padrao (Story 2.3)

- Extrai logica do POST /v1/workplaces/import para
  modules/workplaces/import-workplaces.service.ts (testavel).
- Quando planilha nao traz positionRole para um workplace, cria
  WorkplacePosition padrao (Operacional, requiredCount=1) -- evita
  postos esterees na UI (FR26).
- Quando planilha traz positionRole, respeita o valor (sem duplicar
  com padrao -- FR27).
- Idempotencia preservada: re-import nao duplica positions nem defaults.
- Response inclui defaultsCreated.
- Testes: 3 cenarios + idempotencia (sem cargo, com cargo, mista).

Story: 2.3
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npx tsc --noEmit` → 0 erros.
- `npx tsx --test test/modules/workplaces/import-workplaces.service.test.ts` → **4/4 verde**.

### Completion Notes List

**AC-1 ✅ Service extraído** — `import-workplaces.service.ts` agora isola toda a lógica. Handler do POST /import vira ~10 linhas (parse + chama service + envelope).

**AC-2 ✅ positions explícitas** — quando `positionRole` truthy, cria com `role/shiftPattern/requiredCount` da planilha. `existsPos` impede duplicata.

**AC-3 ✅ default condicional** — só cria padrão se `createdInThisRun === 0` E `count(positions[workplaceId]) === 0`. Evita duplicar default em workplace existente.

**AC-4 ✅ workplaces existentes** — caminho `updated` herda mesma lógica; se já tem position alguma, default não é criado. Se não tem (ex.: workplace V3.0 importado antes da Story 2.3), recebe padrão (recover).

**AC-5 ✅ idempotência** — testada em T4: 2× a mesma planilha → 0 novas positions, 0 novos defaults, 0 novos workplaces.

**AC-6 ✅ defaultsCreated** — incluído em `ImportWorkplacesResult` e na message do response.

**AC-7 ✅ 4 testes** (3 da story + 1 idempotência bônus).

**AC-8 ✅ sem regressão** — tsc 0 erros.

### File List

**Modified:**
- `backend-api/src/routes/api/v1/workplaces/index.ts` (handler thin)

**Created:**
- `backend-api/src/modules/workplaces/import-workplaces.service.ts`
- `backend-api/test/modules/workplaces/import-workplaces.service.test.ts` (4 testes)
