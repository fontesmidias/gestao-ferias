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

## V3.4 completo (deferido para depois do MVP)

Backlog ordenado, a ser detalhado em PRD/Architecture/UX antes da execução.

### Epic V3.4.1 — Wizard de planejamento de cobertura

- **Story 4.1:** Visualização timeline Gantt (próximos 90d) das férias
  programadas + coberturas planejadas, agrupada por posto/cargo.
- **Story 4.2:** Wizard "Casar cobertura": dada uma VacationRequest APPROVED,
  o sistema mostra feristas disponíveis (sem conflito) ordenados por adequação
  (cargo igual, escala compatível, proximidade geográfica se houver, custo).
- **Story 4.3:** Encadeamento automático de feristas para férias longas
  (30 dias = 2-3 feristas em sequência sem overlap).
- **Story 4.4:** "Atribuir cobertura em lote" — admin seleciona múltiplas férias
  do mês e o sistema sugere alocação ótima de feristas.

### Epic V3.4.2 — Validações sistêmicas anti-erro (lista do EVO Master)

- **Story 4.5:** UNIQUE constraint funcional: `CoverageAssignment` ACTIVE não
  pode sobrepor para o mesmo `coveringEmployeeId` (igual à V3.3 fez para
  Allocation). Migration aditiva.
- **Story 4.6:** Validação no backend ao criar VacationRequest: se colaborador
  é ferista de cobertura ACTIVE, bloqueia ou pede confirmação explícita.
- **Story 4.7:** Validação ao mover Allocation: se employee tem férias
  programadas, recalcular impacto na cobertura existente.
- **Story 4.8:** Política configurável por posto crítico: "Bloquear aprovação
  de férias se posto fica vago e não há cobertura planejada".
- **Story 4.9:** Detecção de feriado dentro de período de férias — calcular
  conforme CLT Art. 134 (feriado conta como dia útil de gozo).
- **Story 4.10:** Validação de fracionamento CLT (Art. 134 §1º): mín. 14 dias
  contínuos em um dos períodos quando fracionado.

### Epic V3.4.3 — Single-Source-of-Truth de KPIs

- **Story 4.11:** Centralizar lógica de classificação de status do colaborador
  (ATIVO/FÉRIAS/AFASTADO) em service compartilhado backend, eliminando regex
  duplicado em 4 lugares (dashboard, employees, summary, frontend).
- **Story 4.12:** Endpoint `/v1/operational-status` consolidado: dado um
  período (default = D0), retorna por colaborador o status efetivo
  (considerando VacationRequest APPROVED ativo, AFASTAMENTO, etc).
- **Story 4.13:** Dashboard, /employees e /coverage passam a consumir esse
  endpoint único — fim das divergências silenciosas entre páginas.

### Epic V3.4.4 — UX visual da timeline

- **Story 4.14:** Componente `<VacationTimeline>` com tracks por posto, blocos
  de férias coloridos por status (PROGRAMADA / EM ANDAMENTO / CONCLUÍDA),
  blocos de cobertura sobrepostos.
- **Story 4.15:** Drag-and-drop para reagendar férias (com validação CLT em
  tempo real).
- **Story 4.16:** Filtros: por posto, por gerente, por mês, "só mostrar postos
  com gap descoberto".

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
