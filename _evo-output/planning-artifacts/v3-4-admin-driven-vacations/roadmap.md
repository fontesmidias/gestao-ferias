# V3.4 — Admin-Driven Vacations & Cobertura Planejada

**Status:** roadmap (pre-PRD)
**Data de criação:** 2026-05-08
**Owner:** Bruno (fontesmidias) + EVO Master
**Decisão estratégica:** caminho 2 — MVP 3 dias agora + V3.4 completo depois

## Contexto

Após V3.3 (reconciliação postos×funcionários) entrar em produção e a Green House
ter os 1045 colaboradores corretamente vinculados aos postos, ficou claro que o
sistema não cobre o **workflow real da operação**:

- Hoje a Green House usa **planilha manual** com plano de férias dos próximos 2-3 meses.
- O sistema atual é **employee-driven** (colaborador solicita, RH aprova) mas a
  operação é **admin-driven** (RH já sabe quem entra, planeja cobertura, executa).
- Gap operacional crítico: sem UI de "programar férias em massa", planejamento
  manual continua na planilha externa e o sistema vira só backup.

Diagnóstico completo do EVO Master em sessão de 2026-05-08
(ver histórico de conversação se necessário).

---

## Inconsistências terminológicas mapeadas (pré-MVP)

Sistema mistura termos para o mesmo conceito:

| Conceito (canon) | Sinônimos atuais | Onde aparecem |
|---|---|---|
| **Posto** (Workplace) | "Posto de Serviço", "Lotação" | sidebar, /workplaces, filtros /employees, tooltip |
| **Cargo** (WorkplacePosition.role) | "Posição", "Função" | /workplaces ("1 posições"), /employees coluna, modais |

**Decisão:** adotar **"Posto"** + **"Cargo"** em toda a UI. Eliminar
"lotação", "posto de serviço" e "posição" da UI visível ao usuário.

---

## MVP de 3 dias (em execução agora)

Objetivo: destravar uso operacional real pela Green House sem esperar V3.4 completo.

### Dia 1 — Padronização + materialização correta de Positions por cargo

- **Story M1:** Substituir terminologia "lotação"/"posto de serviço"/"posição"
  por "posto"/"cargo" em toda UI visível (não-superadmin).
- **Story M2:** Refatorar reconcile e importer Tirvu para criar **1 WorkplacePosition por (posto, cargo)** com `requiredCount = COUNT(distinct employee)`. Idempotente.
- **Story M3:** Endpoint admin para re-materialização (`POST /admin/positions/rematerialize`) que roda sobre o tenant atual e corrige os 108 postos hoje com 1 Position default cada.
- **Resultado esperado:** 5º ANDAR vira "Recepcionista 2/2 · Servente 1/1 · Aux. Limpeza 1/1 · Aux. Serviços 1/1" em vez de "5/1".

### Dia 2 — UI "Programar férias" (admin-driven)

- **Story M4:** Backend `POST /admin/vacations/programmed` que cria VacationRequest
  direto em status `APPROVED` em nome de outro colaborador (RBAC: ADMIN/SUPERADMIN).
- **Story M5:** Botão "+ Programar férias" na página `/approvals` ou nova `/vacations/plan`,
  abrindo modal: selecionar colaborador → datas → motivo → confirmar.
- **Story M6:** Validação anti-overlap **mínima** no backend:
  - Mesmo colaborador não pode ter 2 VacationRequests APPROVED sobrepostas.
  - Bloqueio com erro 409 + mensagem clara apontando o conflito.
- **Story M7:** Validação básica de saldo CLT: bloquear se < 10 dias disponíveis,
  com override admin (auditado).

### Dia 3 — Importer de plano de férias

- **Story M8:** Modelo de planilha XLSX para plano de férias
  (matrícula/CPF + data início + data fim + dias + motivo opcional).
- **Story M9:** Importer dedicado em `/employees` (botão "Importar Plano de Férias")
  que reusa pipeline da V3.2 (preview → confirm → apply) gerando `VacationRequest`
  APPROVED idempotentes.
- **Story M10:** Idempotência do importer (UNIQUE em employee+startDate
  ou hash do row) para que re-import não duplique.
- **Story M11:** Auditoria: cada VacationRequest criado por importer registra
  `AuditLog.action = VACATION_PLAN_IMPORT`.

**Saída do MVP:** RH consegue substituir 100% da planilha manual pelo sistema.
Validação anti-overlap protege contra erros básicos. Ainda **não** há wizard
visual de cobertura nem timeline Gantt — esses ficam na V3.4 completa.

---

## V3.4 completo — Status auditado em 2026-05-10

Após o MVP overnight (FASES A-H entregues), auditoria do que JÁ está em
produção vs. o que falta. Backlog reorganizado por prioridade real.

Legenda: ✅ DONE · 🟡 PARTIAL · ❌ NOT_STARTED

### Epic V3.4.1 — Wizard de planejamento de cobertura

- ✅ **4.1** Timeline Gantt em `/coverage` agrupando férias × postos
  (`frontend-web/src/app/coverage/page.tsx` linhas 593–668). Janela toggle
  90d/mês. Falta apenas drag-drop (vê 4.15).
- 🟡 **4.2** Wizard "Casar cobertura": panel slide-in com ranking de feristas
  por cargo (identical/family/any), encadeamento, custo estimado. Cobre o
  caminho principal. Falta wizard multi-passo guiado tipo "stepper".
- 🟡 **4.3** Encadeamento: backend `detectChaining()` + badge "Encadeia" no
  modal já existem. Falta auto-cascade que cria 2-3 coberturas sequenciais
  numa única ação.
- ❌ **4.4** Atribuição em lote: hoje só status update bulk (`PATCH
  /vacations/bulk`). Falta selecionar várias férias e atribuir feristas
  ótimos em massa.

### Epic V3.4.2 — Validações anti-erro

- ❌ **4.5** UNIQUE partial index no DB para `CoverageAssignment` ACTIVE
  (hoje só validação aplicacional em coverages/index.ts:65). Race condition
  pode duplicar. **PRIORIDADE 1.**
- ❌ **4.6** Bloquear criar VacationRequest se colaborador tem
  `CoverageAssignment` ACTIVE no período. **PRIORIDADE 2.**
- ❌ **4.7** Recalcular cobertura impactada ao mover Allocation.
- ❌ **4.8** Política por posto crítico (bloquear férias se posto fica vago).
- ✅ **4.9** Feriado dentro de período (CLT Art. 134) já validado em
  `vacation-engine.ts:280` via `holidayResolver.isHoliday()`.
- ✅ **4.10** Fracionamento Art. 134 §1º (3 frações, ≥14d em uma delas)
  implementado em `vacation-engine.ts:validateRequest`.

### Epic V3.4.3 — Single-Source-of-Truth de KPIs

- 🟡 **4.11** Classificação ATIVO/FÉRIAS/AFASTADO duplicada em
  dashboard/index.ts:26-36 + coverage-engine + employees summary. Service
  centralizado falta. **PRIORIDADE 3.**
- ❌ **4.12** Endpoint `/v1/operational-status` consolidado.
- ❌ **4.13** Páginas consumirem o endpoint único.

### Epic V3.4.4 — UX timeline rica

- 🟡 **4.14** `<VacationTimeline>`: o Gantt de 4.1 já cobre o básico. Tracks
  por posto OK, falta só blocos de cobertura sobrepostos coloridos.
- ❌ **4.15** Drag-drop reagendar.
- ❌ **4.16** Filtros (posto/gerente/mês/só com gap).

---

## Próxima rodada (ordem recomendada)

1. **4.5** UNIQUE partial index `coverage_assignments_unique_active` —
   migration aditiva + catch P2002 no service. ~1h.
2. **4.6** Validação anti-overlap ao criar VacationRequest para ferista
   alocado. ~1h.
3. **4.11+4.12+4.13** SSoT operational-status: service + endpoint +
   refactor dashboard/employees/coverage pra consumir. ~3-4h.
4. **4.4** Bulk coverage assign — fácil reaproveitar /coverages/suggestions.
5. **4.8** Política posto crítico — flag em Workplace + check no approval.

V3.5 (DB normalização) fica para DEPOIS desta rodada — pré-condição era
"V3.4 estável" e ainda há os bugs de race condition acima.

---

## Decisões pendentes (precisam de PM antes de detalhar V3.4)

1. **Férias programadas pelo admin: status default é APPROVED ou PENDING?**
   - APPROVED: simula a planilha atual (decisão já tomada). Sem fricção.
   - PENDING: força workflow de aprovação mesmo para admin. Burocrático.
   - **Sugestão EVO Master:** APPROVED com `dispatchNote = "Programada pelo RH"`.

2. **Importer de plano de férias: idempotência por matrícula+data ou por hash do row?**
   - Por matrícula+data: mais robusto, mas se admin corrigir as datas vira nova entrada.
   - Por hash: detecta mudanças mas não permite "ajustar e re-importar".
   - **Sugestão EVO Master:** UNIQUE em (employee, startDate) + flag `--update-existing`.

3. **Quando admin programa férias para um ferista, o que acontece com as
   coberturas que ele tinha?**
   - Fail-fast: bloqueia se ferista tem cobertura ACTIVE no período.
   - Warning + confirmação: deixa criar mas alerta.
   - **Sugestão EVO Master:** fail-fast com erro 409 detalhando os conflitos.

4. **Timeline Gantt: render no servidor (export PDF) ou só client-side?**
   - Decisão de UX, não estrutural. Adiada para Fase UX da V3.4 completa.

5. **Materialização de Positions por cargo: roda automática no Reconcile
   ou só sob demanda via endpoint?**
   - Automática: zero fricção, mas re-roda em cada reconcile (custo OK,
     idempotente).
   - Sob demanda: admin clica "re-materializar" quando quiser.
   - **Sugestão EVO Master:** automática sempre (V3.3.1 hotfix do reconciler) +
     endpoint manual para tenants legados.

---

## Referências

- PRD V3.3: `_evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md`
- Architecture V3.3: `_evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md`
- Implementação V3.3: `_evo-output/implementation-artifacts/v3-3-reconciliacao-postos/`
- CLAUDE.md: regras V3.3 sobre importadores e reconciliação

## Próximos passos pós-MVP

Quando o MVP terminar e Green House estiver usando, EVO Master sugere:

1. **Retrospectiva curta** (`/evo-retrospective`) — o que funcionou, o que doeu
2. **PRD V3.4 completo** (`/evo-create-prd`) usando feedback real da operação
3. **UX Design das telas timeline/wizard** (`/evo-create-ux-design`)
4. **Architecture V3.4** (`/evo-create-architecture`) cobrindo as decisões 1-5 acima
5. **Stories detalhadas** (`/evo-create-epics-and-stories`)
6. **Execução story-by-story** (`/evo-dev-story`)
