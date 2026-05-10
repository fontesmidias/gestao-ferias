# V3.4 — Relatório Overnight V3 (Caminho 1: D + E + F + G)

**Data:** 2026-05-08 (madrugada → manhã)
**Executor:** EVO Master + Claude Opus 4.7
**Solicitação:** Bruno escolheu Caminho 1 — todos os 6 itens + roadmap DB
**Resultado:** ✅ 18 stories implementadas, 4 commits, 100% testes verdes

---

## TL;DR — O que mudou

Quando você acordar:

1. **Matrícula importa correto.** O bug do mapper (que descartava silenciosamente a coluna 11 do XLSX Tirvu) foi corrigido. Para popular nos 1045 colaboradores existentes sem deletar nada, criei o endpoint **`POST /admin/employees/registration/backfill`** — basta re-fazer o upload do MESMO XLSX Tirvu e ele só atualiza `Employee.registration` por match CPF. Idempotente.

2. **Lixeira agora é cancelamento de verdade.** Status novo `CANCELLED` separado de `REJECTED`. Lixeira → CANCELLED (não exige motivo, libera saldo). Reprovar → REJECTED (com motivo formal CLT). O bug do saldo travado após "excluir" está resolvido.

3. **Página renomeada.** `Aprovações` virou **`Programação de Férias`** no sidebar e no heading. URL `/approvals` mantida (compatível com bookmarks).

4. **Filtros de chip com contadores** na top-bar de Programação de Férias: Pendentes / Aprovadas / Assinadas / Concluídas / Devolvidas / Reprovadas / Canceladas. Filtro "Origem da solicitação" (Programada pelo RH / Pedido do colaborador). Busca livre cobre nome, matrícula e dispatchNote.

5. **Coluna "Despacho / Motivo"** sempre visível na tabela. Mostra o texto do RH em cada linha.

6. **Importer de Salários (Dexion).** Botão verde **`$ Salários`** no `/employees`. Upload do XLSX → tela de divergências em 3 abas (Divergentes / Sem mudança / Sem match) com Δ R$ e %. Operador delibera (selecionar todos / individual) → "Aplicar N salários".

7. **Edição em massa.** Checkbox em cada linha do `/employees`. Quando há ≥1 selecionado, aparece botão **"Editar N"**. Modal escolhe campo (salary/isFerista/status/position/shift) + valor, com confirm preview.

8. **Filtro "Cargo"** na toolbar do `/employees`. Útil para selecionar todos os "Recepcionista" e editar salário em massa, por exemplo.

9. **Roadmap V3.5** documentado com plano de refactor das colunas string (branch/department/shift/unionName) para FKs.

---

## Para deployar na VPS

Mesmo procedimento dos turnos anteriores:

1. Portainer → Stacks → editar → **Re-pull image and redeploy**
2. Update the stack

**Sem migration.** **Sem novo env var.** O status `CANCELLED` é uma string nova mas o schema já permite (`status` é `String`).

### Pós-deploy: backfill matrícula nos 1045 existentes

Uma única chamada via UI (sem botão dedicado ainda — tem que ser via curl ou Postman):

```bash
JWT="cole_seu_jwt_admin"
curl -X POST \
  -H "Authorization: Bearer $JWT" \
  -F "file=@docs/exemplo/Colaboradores, para fins de validação.xlsx" \
  https://ferias.unibot.com.br/api/v1/admin/employees/registration/backfill
```

Resposta esperada (~ms a alguns segundos):
```json
{
  "data": {
    "summary": {
      "total": 50,           // nº de linhas no XLSX
      "updated": 49,         // populou matrícula
      "unchanged": 0,
      "unmatched": 1,        // CPF do XLSX que não bate com nenhum no sistema
      "invalid": 0
    },
    "results": [...]
  }
}
```

Após isso: matrícula aparece em `/employees` e em todos os modais. Importer de salários (Dexion) vai conseguir matchar pela matrícula.

---

## Mapa de commits

```
19be46d fix(employees+vacations): matricula importer + lixeira CANCELLED + backfill (V3.4 FASE D)
3fb4095 feat(approvals): rename + filtros chips + despacho visivel (V3.4 FASE E)
c1f002b feat(employees): import salarios Dexion + edicao em massa + filtro cargo (V3.4 FASE F)
```

---

## Stories detalhadas

### FASE D — Bugs críticos (commit `19be46d`)

#### D1: Importer Tirvu — matrícula
**Causa-raiz:** `mapRowToEmployeePatch` em [import-matcher.ts:131](backend-api/src/modules/imports/import-matcher.ts#L131) listava 13 campos, mas `matricula` (coluna 11 do XLSX) não estava — mapper descartava silenciosamente.

**Fix:**
- Helper `normalizeMatricula(value)` em [matricula.ts](backend-api/src/modules/imports/matricula.ts) — strip de zeros à esquerda, retorno consistente entre Tirvu e Dexion.
- `EmployeePatch` ganhou `registration` em [types.ts](backend-api/src/modules/imports/types.ts).
- `DIFF_FIELDS` inclui `registration` para que re-imports detectem mudança.
- Mapper agora popula: `if (row.matricula) patch.registration = normalizeMatricula(row.matricula)`.

#### D1.5: Endpoint backfill
[`POST /admin/employees/registration/backfill`](backend-api/src/routes/api/v1/admin/employees/registration-backfill.ts):
- Re-aplica XLSX Tirvu, match por CPF, popula `Employee.registration` quando vazio ou divergente.
- AuditLog `REGISTRATION_BACKFILL` por employee atualizado.
- Idempotente: re-upload do mesmo arquivo = no-op em todas as linhas.

#### D1.7: Matrícula visível
- `ProgramVacationModal`: card mostra `Matr. NNNN` no header, e badge azul-claro `[NNNN]` em cada item da busca de colaborador.
- `/employees`: já mostrava matrícula; agora vai aparecer (depois do D1 popular).

#### D2 + D4: Bug lixeira + refresh
- `confirmAction` em [approvals/page.tsx](frontend-web/src/app/approvals/page.tsx) trata explicitamente `err?.body?.error?.message` (em vez de só `err.message`).
- `submitting` state evita clique duplo + disable do botão.
- UI nunca pinta status sem confirmar com backend.

#### D3: Status `CANCELLED` separado de `REJECTED`
- Schema `VacationRequest.status` agora aceita `CANCELLED` (string, sem migration).
- Lixeira no front muda para `payload.status = 'CANCELLED'` + `dispatchNote = 'Cancelada em DD/MM'` (auto-preenchido).
- Backend [PATCH /vacations/:id](backend-api/src/routes/api/v1/vacations/index.ts) permite CANCELLED sem dispatchNote (REJECTED continua exigindo).
- Filtros `{ not: 'REJECTED' }` viraram `{ notIn: ['REJECTED', 'CANCELLED'] }` em `vacations`, `reports`.
- `VacationEngine.calculatePeriodsWithUsage`: REJECTED e CANCELLED **não** estão em `COUNTING_STATUSES` → saldo é restaurado após cancelamento. **Resolve queixa principal: "apos eu excluir, aquele saldo esteja disponível novamente para o colaborador"**.

### FASE E — Rename + filtros + UX (commit `3fb4095`)

#### E1: Rename
- `pt-BR.json`: `sidebar.approvals` = "Programação de Férias".
- Heading da página atualizada.
- URL `/approvals` mantida.

#### E2: Filtros multi-faceta
- Top-bar com **chips clicáveis** de status (8 chips: Todos + 7 status). Cores semânticas por status (verde aprovado, rosa reprovado, slate cancelado, etc).
- Cada chip mostra contador `(N)` calculado dinâmico.
- Select "Origem da solicitação": Todas / Programada pelo RH / Pedido do colaborador. Detecção via prefix do `dispatchNote` ("Programada" ou "Plano importado").
- Busca livre estendida: cobre nome, matrícula e dispatchNote.

#### E3: Coluna Despacho/Motivo
- Nova coluna na tabela, sempre visível. Texto "— sem despacho —" italico quando vazio. Tooltip ao truncar.

**Bonus separação de ações:** lixeira (`Trash2` cinza, "Cancelar — libera saldo") e reprovar (`ShieldAlert` vermelho, "Reprovar — exige motivo formal") agora são botões DIFERENTES. Resolve confusão "lixeirinha estava eliminar ou reprovar".

### FASE F — Importer Dexion + edição em massa (commit `c1f002b`)

#### F1: DexionParser
[`dexion-parser.ts`](backend-api/src/modules/imports/dexion-parser.ts):
- Lê XLSX (mesmo com extensão `.XLS` — confirmado XLSX legível).
- Detecta linhas de dado válidas via padrão (col 1 numérica + col 3 string + col 10 numérica).
- Ignora cabeçalhos, separadores `"NNNN - LOTACAO"`, sumários `"N trabalhadores cujos salários totalizam R$ X"`, linhas vazias.
- 1262 linhas brutas → ~750 linhas de dado válidas (no XLSX exemplo).

#### F2: Endpoint preview
[`POST /admin/employees/salaries/preview`](backend-api/src/routes/api/v1/admin/employees/salaries.ts) (multipart):
- Upload + parse + match por matrícula normalizada (fallback CPF).
- Retorna 3 listas:
  - **`unchanged`**: salário Dexion === salário sistema (Δ < R$ 0.01).
  - **`divergent`**: diferente, com `delta` R$ e `deltaPct`.
  - **`unmatched`**: matrícula Dexion sem correspondência.
- **Não persiste**.

#### F3: Endpoint apply
[`POST /admin/employees/salaries/apply`](backend-api/src/routes/api/v1/admin/employees/salaries.ts):
- Body: `{ updates: [{ employeeId, newSalary }], source }`.
- Aplica seletivamente. AuditLog `SALARY_UPDATE_FROM_IMPORT` por employee.
- Idempotente.

#### F4: Modelo XLSX
[`GET /admin/employees/salaries/template`](backend-api/src/routes/api/v1/admin/employees/salaries.ts) — XLSX simples para upload manual.

#### F5: Tela de divergências
[`SalaryImportModal.tsx`](frontend-web/src/components/employees/SalaryImportModal.tsx):
- Step 1: upload.
- Step 2: 3 abas com contadores. Pré-seleciona divergentes por padrão.
- Tabela com Matrícula | Nome | Cargo Dexion | Salário atual | Salário Dexion | Δ R$ + Δ% (verde/vermelho) | Match (matrícula/CPF).
- Toolbar: "Selecionar todos" / "Desmarcar".
- Footer: "Aplicar N salário(s)" com confirm dialog.

#### F6: Bulk edit
- Endpoint [`PATCH /employees/bulk-edit`](backend-api/src/routes/api/v1/employees/index.ts) (ADMIN/SUPERADMIN). AuditLog `EMPLOYEE_BULK_EDIT` por employee modificado, com `previousData` e `newData`.
- [`BulkEditModal.tsx`](frontend-web/src/components/employees/BulkEditModal.tsx) — escolhe campo (salary/isFerista/status/position/shift) + valor + confirm dialog.
- Checkbox em cada linha do `/employees` + select-all no header. Botão "Editar N" só aparece com seleção ativa.

#### F7: Filtro Por Cargo
- Backend `GET /employees` aceita `?position=X`.
- Facets do summary expõe `positions[]`.
- UI: novo select "Cargo" entre "Status Base" e "Tipo".

### FASE G — Roadmap V3.5 (doc only)

[`_evo-output/planning-artifacts/v3-5-db-relacional/roadmap.md`](_evo-output/planning-artifacts/v3-5-db-relacional/roadmap.md):

- Mapa de campos string → FK propostos (Branch, Department, Shift, Union).
- 5 decisões pendentes de produto.
- Stories candidatas em 5 epics.
- Fluxo pós-MVP: retrospectiva → PRD → architecture → stories → dev.
- **Não executado** — espera V3.4 estabilizar primeiro.

---

## Decisões de produto assumidas (premissas do Caminho 1)

1. ✅ **Matrícula** = coluna 11 do XLSX Tirvu (Bruno corrigiu).
2. ✅ **Backfill** dos 1045 existentes via re-upload do XLSX Tirvu, match por CPF.
3. ✅ **Lixeira** → status `CANCELLED` (não conta saldo, sem motivo obrigatório). **Reprovar** mantém `REJECTED` com motivo CLT.
4. ✅ **Importer Dexion** = match por matrícula normalizada (zeros à esquerda removidos via Number coerce). Fallback por CPF.
5. ✅ **Divergências de salário** mostradas com Δ R$ + Δ%. Operador delibera por linha ou em massa.
6. ✅ **Sem match** (matrícula Dexion não bate): listado para inspeção, não cria automaticamente.
7. ✅ **Edição em massa** = preview obrigatório + AuditLog 1 entrada por employee.
8. ✅ **Cancelamento auto-preenche** dispatchNote = "Cancelada em DD/MM" (operador pode editar antes de confirmar).

---

## Validações executadas

- ✅ `npx tsc --noEmit` (backend + frontend): 0 erros
- ✅ `npx tsx --test test/modules/*.test.ts` (backend): 321/321 verde
- ✅ `npx vitest run` (frontend): 84/84 verde
- ✅ `npm run build` (frontend Next.js 16): build OK
- ✅ Push de 4 commits para `main`. CI vai publicar imagens GHCR.

---

## Próximo passo recomendado pelo EVO Master

Quando acordar e validar:

1. **Atualizar stack na Portainer** (re-pull image, redeploy).
2. **Rodar backfill** matrícula via curl com a planilha Tirvu original.
3. **Conferir matrícula** aparece em `/employees`.
4. **Importar salário Dexion**: clicar `$ Salários` em `/employees`, subir o XLS exemplo, ver tela de divergências, aplicar uns 5-10 e conferir auditoria.
5. **Testar lixeira**: em `Programação de Férias`, criar uma férias programada, clicar lixeira (Trash2 cinza), confirmar — saldo deve voltar imediatamente.
6. **Testar reprovação**: criar outra férias, clicar reprovar (ShieldAlert vermelho), digitar motivo, confirmar — saldo continua consumido enquanto status é REJECTED.

Se algo soar estranho, me reporta. Se quiser começar V3.5 (refactor DB) avise.

🧙 EVO Master — fim do turno overnight V3.
