---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: 'complete'
completedAt: '2026-05-05'
inputDocuments:
  - _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md
  - _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md
  - CLAUDE.md
workflowType: 'epics-and-stories'
feature: 'v3-3-reconciliacao-postos'
date: '2026-05-05'
---

# gestao-ferias V3.3 (Reconciliação Postos×Funcionários) — Epic Breakdown

## Overview

Este documento decompõe os 45 FRs + 31 NFRs do [PRD V3.3](prd.md) e as 8 decisões arquiteturais D1–D8 do [Architecture V3.3](architecture.md) em epics e stories implementáveis. Phase 1 (MVP \"Make production honest\") é detalhada exaustivamente; Phase 2 (Growth/V3.3.1) e Phase 3 (Vision/V3.4+) recebem epics de alto nível para preservar visibilidade de roadmap.

## Requirements Inventory

### Functional Requirements

**Reconciliation Engine:**
- **FR1:** ADMIN do tenant pode disparar uma reconciliação retroativa que vincula colaboradores legados (com `Employee.workplace` string preenchido e sem `workplaceId`) ao posto correspondente, criando alocações ativas.
- **FR2:** O reconcile pode ser re-executado N vezes sobre o mesmo tenant sem criar duplicatas nem corromper vínculos já estabelecidos (idempotência).
- **FR3:** O reconcile processa colaboradores em batches transacionais, permitindo execução em produção viva sem bloquear outras operações.
- **FR4:** O reconcile preserva o histórico trabalhista usando `Employee.hireDate` como data de início da alocação criada (nunca a data da execução do job).
- **FR5:** Colaboradores com `status` em `INATIVO` ou sem `workplace` string preenchida são ignorados pelo reconcile (não geram fila nem allocation).
- **FR6:** Cada allocation criada pelo reconcile é registrada em `AuditLog` com identificação clara (`action: V3.3_RECONCILE`).
- **FR7:** A execução do reconcile retorna um relatório com totais: vínculos criados, itens enfileirados para revisão, colaboradores ignorados, duração e data/hora.

**Matching & Disambiguation:**
- **FR8:** O sistema possui um matcher determinístico que casa `Employee.workplace` (string) com `Workplace.name` no mesmo tenant aplicando normalização (case-insensitive, NFC, trim, collapse de whitespace).
- **FR9:** Quando o matcher determinístico encontra exatamente um posto correspondente, o vínculo é criado automaticamente.
- **FR10:** Quando o matcher encontra zero ou múltiplos postos correspondentes, o item é colocado em fila de revisão (nunca vinculado por adivinhação).
- **FR11:** O sistema gera sugestões fuzzy ranqueadas (com score de similaridade) para cada item da fila de revisão, mas nunca aplica essas sugestões automaticamente.
- **FR12:** O matching e a auto-criação de Workplace pelo importer aplicam exatamente a mesma normalização — garantindo que \"INEP - Sede\" e \"inep   sede\" sejam tratados como o mesmo posto.

**Review Queue Management:**
- **FR13:** ADMIN pode visualizar uma fila de \"Pendências de Vínculo\" listando colaboradores que ainda não têm posto vinculado, agrupada/filtrável por estado.
- **FR14:** ADMIN pode resolver um item da fila vinculando-o a um posto existente.
- **FR15:** ADMIN pode resolver um item da fila criando um novo `Workplace` na hora.
- **FR16:** ADMIN pode marcar um item como \"adiado\" para tratar depois, ou \"ignorado\" quando o colaborador não deve ter vínculo.
- **FR17:** Itens resolvidos ou ignorados há mais de 90 dias são automaticamente purgados da fila (LGPD), permanecendo apenas em `AuditLog`.
- **FR18:** AUDITOR pode visualizar a fila em modo read-only (sem ações).
- **FR19:** ADMIN pode corrigir um vínculo errado encerrando a allocation atual e criando uma nova — operação registrada em AuditLog, sem DELETE destrutivo.

**Importer Integration (Tirvu V3.3):**
- **FR20:** O importer Tirvu, ao processar uma linha de colaborador com `lotacao` preenchida, resolve `Employee.workplaceId` (FK) durante a importação — não apenas grava a string legada.
- **FR21:** O importer Tirvu cria automaticamente um `Workplace` quando o nome do posto da planilha não existe no tenant, marcando-o com `importedBy='AUTO_TIRVU'`.
- **FR22:** O importer Tirvu cria automaticamente uma `WorkplaceAllocation` ACTIVE para cada colaborador importado/atualizado com posto resolvido.
- **FR23:** Quando um colaborador já tinha allocation ativa e o posto muda na nova planilha, o importer encerra a allocation anterior e cria uma nova ACTIVE.
- **FR24:** Re-importar a mesma planilha Tirvu não duplica allocations nem cria novos workplaces para nomes que já existem.
- **FR25:** O preview do `ImportJob` (etapa `PREVIEW_READY`) inclui delta de relações: allocations criadas/encerradas, workplaces novos, colaboradores sem match.

**Importer Integration (Postos V3.3):**
- **FR26:** O importer de Postos cria automaticamente uma `WorkplacePosition` padrão quando a planilha não traz informação de cargo.
- **FR27:** Quando a planilha de Postos traz cargos explícitos, o importador respeita essa informação e não cria a posição padrão duplicada.

**Multi-tenant & RBAC:**
- **FR28:** O reconcile single-tenant infere o `tenantId` exclusivamente do JWT do operador.
- **FR29:** SUPERADMIN pode disparar reconciliação em batch para múltiplos tenants ou para todos (cada execução por tenant é isolada).
- **FR30:** Toda execução de reconcile super-admin é registrada com identificação de operador, IP, lista de tenants afetados e duração.
- **FR31:** USER e roles equivalentes a colaborador final não veem nenhum elemento de UI relacionado a reconcile.

**Workplace Visibility (UI):**
- **FR32:** A página `/workplaces` exibe um banner contextual quando o tenant tem colaboradores legados pendentes de reconciliação.
- **FR33:** Após reconcile, a página `/workplaces` exibe contadores reais (`alocados/necessários`, `posições`).
- **FR34:** Durante a execução do reconcile, o usuário recebe feedback de progresso em tempo real.
- **FR35:** Após o reconcile, o relatório-resumo é apresentado ao operador com totais e link direto para a fila de revisão.

**Audit & Telemetry:**
- **FR36:** Cada allocation criada por reconcile ou por importer Tirvu é gravada em `AuditLog` com `previousData` e `newData`.
- **FR37:** Cada resolução manual de item da fila é registrada em `AuditLog` com identificação do operador e da decisão.
- **FR38:** Logs estruturados (JSON) por batch incluem `tenantId`, `batchSize`, `matched`, `queued`, `errors`, `durationMs` — sem nomes de pessoas (LGPD).
- **FR39:** AUDITOR pode visualizar registros de auditoria de reconcile do próprio tenant.

**Migration & Schema Evolution:**
- **FR40:** A release V3.3 introduz uma migration aditiva que **não destrói** dados nem altera schema de forma quebrável.
- **FR41:** A release V3.3.1 (Phase 2) introduz uma constraint que torna `Employee.workplaceId` obrigatório para colaboradores `status='ATIVO'`, com pré-condição validada antes do deploy.
- **FR42:** O campo legado `Employee.workplace` é mantido durante toda a V3.3 e V3.3.x.

**Compatibility (Existing V3 Modules):**
- **FR43:** Após reconcile, o motor de cobertura (`/coverage`, V3.0) retorna sugestões reais sem nenhuma alteração no código do `CoverageEngine`.
- **FR44:** Após reconcile, prompts da AI (`/predict`, V3.0) recebem contexto real de alocações sem alteração no `PromptBuilder`.
- **FR45:** Sistemas de webhook, notificações, assinatura digital e PWA do colaborador (V3.0/V3.1) continuam funcionando inalterados.

### NonFunctional Requirements

**Performance:**
- **NFR-PERF-1:** Cada batch transacional do reconcile completa em ≤ 200ms p95.
- **NFR-PERF-2:** Reconcile completo de tenant com ~500 colaboradores e ~108 postos finaliza em ≤ 5 minutos online.
- **NFR-PERF-3:** Latência p95 de operações concorrentes não degrada mais que 10% durante execução do reconcile.
- **NFR-PERF-4:** Operações da rota admin respondem em ≤ 500ms p95 com até 1.000 itens na fila.
- **NFR-PERF-5:** Matching determinístico de 1 colaborador contra 200 workplaces executa em ≤ 5ms.
- **NFR-PERF-6:** Página `/workplaces` carrega em ≤ 1.5s p95 com 500 postos.

**Security:**
- **NFR-SEC-1:** Toda rota de reconcile exige JWT válido com role `ADMIN` ou `SUPERADMIN`.
- **NFR-SEC-2:** `tenantId` da operação é derivado do JWT; injetar via body/query é rejeitado.
- **NFR-SEC-3:** Todas as queries Prisma do reconcile passam pela extension de tenant isolation.
- **NFR-SEC-4:** Logs estruturados não contêm dados pessoais identificáveis.
- **NFR-SEC-5:** AuditLog com nomes/decisões só legível por `ADMIN`/`AUDITOR`/`SUPERADMIN`.
- **NFR-SEC-6:** Rate limiting na rota admin de reconcile: máximo 10 disparos por hora por usuário.
- **NFR-SEC-7:** Itens da `WorkplaceReconcileQueue` não armazenam CPF, dados bancários ou `personalData`.
- **NFR-SEC-8:** Nenhuma credencial externa é tocada pelo reconcile.

**Reliability:**
- **NFR-REL-1:** Reconcile idempotente — re-execução produz mesmo estado final (verificado por teste).
- **NFR-REL-2:** Falha em allocation individual não interrompe o batch.
- **NFR-REL-3:** Falha em reconcile de um tenant (batch super-admin) não cascata para outros.
- **NFR-REL-4:** Migration V3.3 trivialmente reversível.
- **NFR-REL-5:** Crash do processo durante reconcile não corrompe estado.
- **NFR-REL-6:** Disponibilidade da plataforma durante o reconcile: 100%.

**Compliance:**
- **NFR-COMP-1:** CLT — `WorkplaceAllocation.startDate` usa `Employee.hireDate`.
- **NFR-COMP-2:** CLT — corrigir vínculo nunca usa DELETE destrutivo: encerra+cria.
- **NFR-COMP-3:** LGPD — itens da fila resolvidos/ignorados >90d são purgados automaticamente.
- **NFR-COMP-4:** LGPD — fila e logs não armazenam CPF, dados bancários nem `personalData`.
- **NFR-COMP-5:** Preservação de histórico — campo `Employee.workplace` não é renomeado nem dropado em V3.3.x.
- **NFR-COMP-6:** Rastreabilidade — cada allocation criada tem `AuditLog` com `previousData`/`newData`.

**Maintainability:**
- **NFR-MAINT-1:** Cobertura de testes nos módulos novos ≥ 85% statements; suite global ≥ 350 verde.
- **NFR-MAINT-2:** `WorkplaceAllocationService.upsertFromImport()` é o único ponto de gravação de allocations a partir de import.
- **NFR-MAINT-3:** Princípio \"importadores escrevem no grafo relacional\" documentado no `CLAUDE.md`.
- **NFR-MAINT-4:** Convenções V3 mantidas: rotas `/api/v1/*`, respostas `{ data, error, meta }`, models Prisma com `tenantId` obrigatório.
- **NFR-MAINT-5:** Mudanças em `backend-api/src` ou `prisma/` durante desenvolvimento V3.3 acionam rebuild automático do container.

**Observability:**
- **NFR-OBS-1:** Cada execução do reconcile produz logs estruturados (JSON) com campos padronizados.
- **NFR-OBS-2:** Métricas exportáveis para stack Grafana/Prometheus da VPS.
- **NFR-OBS-3:** Frontend exibe progresso em tempo real durante reconcile.
- **NFR-OBS-4:** Tela `/workplaces` destaca visualmente postos com `importedBy='AUTO_*'` e workplaces sem positions.
- **NFR-OBS-5:** Suite de testes inclui ≥1 teste de carga sintético (~1.000 employees em batch).

### Additional Requirements

**Da Arquitetura V3.3 (decisões D1–D8 + 10 Enforcement Guidelines):**
- Migration V3.3 aditiva com índice `lower(name)`, tabelas `reconcile_jobs` + `workplace_reconcile_queue`, UNIQUE partial em `workplace_allocations` ACTIVE, `CREATE EXTENSION pg_trgm`, índice GIN trgm.
- `WorkplaceAllocationService` em `src/modules/workplaces/` como **único** point-of-write de allocations (Enforcement #1).
- Módulo novo `src/modules/reconcile/` com submódulo `matchers/` (normalize, deterministic, fuzzy).
- Rotas: `POST /v1/admin/reconcile`, `GET /v1/admin/reconcile/jobs/:id`, `GET /v1/admin/workplace-reconcile-queue`, `POST /v1/admin/workplace-reconcile-queue/:id/resolve`. Phase 2: `POST /v1/admin/reconcile/batch`.
- Helper `prismaTenantFactory.forTenant(tenantId)` para batch super-admin (Phase 2).
- Polling 2s via TanStack Query `refetchInterval` no frontend (não SSE).
- Reconcile in-process (não BullMQ na Phase 1).
- 6 AuditLog action enum values novos: `V3.3_RECONCILE`, `V3.3_RECONCILE_BATCH`, `IMPORT_TIRVU_ALLOCATE`, `RECONCILE_QUEUE_RESOLVE`, `RECONCILE_QUEUE_DEFER`, `RECONCILE_QUEUE_IGNORE`.
- Spike incluso na primeira story: localizar Prisma extension atual e validar interface `forTenant(tenantId)`; confirmar convenção de testes do módulo `imports/`.

**De Memórias do Projeto (engineering practices):**
- Commits frequentes durante implementação; cada story termina com commit + breve relatório ao usuário.
- Testar tudo localmente (Docker Compose) antes de deploy.
- Suite de testes existente (347 verde) deve permanecer verde após cada story; novos testes co-located com arquivos novos.

### FR Coverage Map

| FR | Epic |
|---|---|
| FR1 | Epic 1 — disparo de reconcile retroativo |
| FR2 | Epic 1 — idempotência do reconcile |
| FR3 | Epic 1 — batches transacionais |
| FR4 | Epic 1 — preserva hireDate como startDate |
| FR5 | Epic 1 — ignora INATIVO/sem workplace |
| FR6 | Epic 1 — AuditLog V3.3_RECONCILE |
| FR7 | Epic 1 — relatório-resumo |
| FR8 | Epic 1 — matcher determinístico com normalize |
| FR9 | Epic 1 — match único cria allocation |
| FR10 | Epic 1 — ambíguo/sem match vai para fila |
| FR11 | Epic 1 — sugestões fuzzy persistidas |
| FR12 | Epic 1 / Epic 2 — normalize compartilhada |
| FR13 | Epic 1 — UI fila com filtros por estado |
| FR14 | Epic 1 — ação \"vincular\" |
| FR15 | Epic 1 — ação \"criar novo posto\" |
| FR16 | Epic 1 — ações \"adiar\"/\"ignorar\" |
| FR17 | Epic 3 — purge LGPD 90d |
| FR18 | Epic 3 — AUDITOR read-only views |
| FR19 | Epic 1 — corrigir vínculo: encerrar+criar |
| FR20 | Epic 2 — Tirvu resolve workplaceId |
| FR21 | Epic 2 — Tirvu auto-cria Workplace |
| FR22 | Epic 2 — Tirvu cria WorkplaceAllocation |
| FR23 | Epic 2 — Tirvu encerra allocation antiga |
| FR24 | Epic 2 — re-import idempotente |
| FR25 | Epic 2 — preview com delta de relações |
| FR26 | Epic 2 — Postos auto-cria WorkplacePosition padrão |
| FR27 | Epic 2 — Postos respeita cargos explícitos |
| FR28 | Epic 1 — reconcile single-tenant via JWT |
| FR29 | Epic 4 (Phase 2) — batch super-admin |
| FR30 | Epic 4 (Phase 2) — auditoria batch |
| FR31 | Epic 1 — USER não vê UI de reconcile |
| FR32 | Epic 1 — banner em /workplaces |
| FR33 | Epic 1 — contadores reais pós-reconcile |
| FR34 | Epic 1 — progresso em tempo real (polling D8) |
| FR35 | Epic 1 — relatório-resumo na UI |
| FR36 | Epic 1 — AuditLog com previousData/newData |
| FR37 | Epic 1 — AuditLog para resoluções de fila |
| FR38 | Epic 1 — logs estruturados sem PII |
| FR39 | Epic 3 — AUDITOR vê audit logs do próprio tenant |
| FR40 | Epic 1 — migration aditiva V3.3 |
| FR41 | Epic 4 (Phase 2) — V3.3.1 NOT NULL condicional |
| FR42 | Epic 1 — campo legado preservado |
| FR43 | Epic 1 — CoverageEngine continua sem mudança |
| FR44 | Epic 1 — PromptBuilder continua sem mudança |
| FR45 | Epic 1 / Epic 2 — webhooks/PWA inalterados |

**Cobertura:** 100% dos 45 FRs mapeados (Phase 1: 42 FRs em Epics 1-3; Phase 2: 3 FRs em Epic 4).

NFRs distribuídos transversalmente — cada story dentro dos epics aplica os NFRs relevantes (Performance/Security/Reliability/Compliance/Maintainability/Observability).

## Epic List

### Epic 1: Reconciliação Retroativa de Colaboradores Legados (Phase 1 — MVP)

**User Outcome:** ADMIN dispara o reconcile do tenant em produção viva, acompanha progresso em tempo real, recebe relatório-resumo, e a tela `/workplaces` volta a mostrar números reais. Itens não-matched vão para fila de revisão (\"Pendências de Vínculo\") com ações vincular/criar/adiar/ignorar.

**Vertical slice completo:** migration aditiva → `WorkplaceAllocationService` (single point-of-write) → matchers (determinístico + fuzzy pg_trgm) → ReconcileService + Runner → rotas admin REST → UI banner + modal de progresso + relatório-resumo + aba Pendências.

**FRs cobertos:** FR1–FR16, FR19, FR28, FR31, FR32–FR38, FR40, FR42, FR43–FR45 (32 FRs).
**NFRs centrais:** PERF-1/2/3/5/6, SEC-1/2/3/4/6, REL-1/2/4/5/6, COMP-1/2/4/5/6, MAINT-2/4/5, OBS-1/3/4.

### Epic 2: Importações que Populam o Grafo Relacional (Phase 1 — MVP)

**User Outcome:** O importer Tirvu (employees) passa a resolver `Employee.workplaceId` + criar `WorkplaceAllocation` ao gravar; auto-cria `Workplace` quando o nome não existe; encerra allocation anterior em transição de posto; preview mostra delta de relações. O importer de Postos auto-cria `WorkplacePosition` padrão quando planilha não traz cargo. Re-imports são idempotentes.

**Vertical slice:** refactor `import-applier.ts` → integração com `WorkplaceAllocationService` → refactor rota import-postos → atualização de `ImportJob.previewSummary` → testes de re-import e transições.

**FRs cobertos:** FR20–FR27, FR12 (normalize compartilhada), FR45 (compatibilidade de webhooks).
**NFRs centrais:** PERF-1, REL-1, COMP-1/2/6, MAINT-2, OBS-1.

### Epic 3: Governança, Auditoria e Higiene Contínua (Phase 1 — MVP)

**User Outcome:** AUDITOR tem visualização read-only de fila e audit logs; sistema purga itens LGPD automaticamente após 90 dias; cobertura de testes ≥85% nos módulos novos; suite global mantida ≥350 verde; princípio \"importadores escrevem no grafo\" documentado em `CLAUDE.md`.

**Vertical slice:** AUDITOR views (read-only fila + audit) → cron in-process de purge LGPD → cobertura e2e + testes de carga sintético → atualização CLAUDE.md.

**FRs cobertos:** FR17, FR18, FR39.
**NFRs centrais:** SEC-5/7, COMP-3/4, MAINT-1/3, OBS-5.

### Epic 4: Reconciliação Super-Admin Multi-Tenant + Hardening de Schema (Phase 2 — V3.3.1, detalhamento adiado)

**User Outcome:** SUPERADMIN reconcilia múltiplos tenants em batch via card no painel super-admin; cada execução por tenant é isolada (falha em um não cascata); migration V3.3.1 ativa CHECK constraint condicional (`Employee.workplaceId` NOT NULL para `status='ATIVO'`) com pré-condição validável que aborta o deploy se houver outliers.

**FRs cobertos:** FR29, FR30, FR41.
**NFRs centrais:** SEC-1/3/5, REL-3, COMP-5.

**Status:** outline apenas. Stories detalhadas no momento de ativação da Phase 2.

### Epic 5: Visão Estratégica V3.4+ (Phase 3 — outline)

**User Outcome:** Drop completo do campo legado `Employee.workplace` (rename → drop em releases consecutivas após validação de cobertura completa); `WorkplacePosition` rico com `shiftPattern` estruturado, `requiredQualifications`, `salaryBand`; histórico de `WorkplaceAllocation` como time-series consultável (\"quem trabalhou no posto X em 2026-Q1?\"); plugin architecture de importers (Tirvu vira um adapter; produto aceita CSV/Senior/TOTVS/ERP custom escrevendo no mesmo `WorkplaceAllocationService`).

**FRs:** derivado de Phase 3/Vision do PRD (sem FRs numerados — outline).

**Status:** outline apenas. Reabrir como feature dedicada (`v3-4-evolucao-postos`) quando V3.3 estiver consolidado em produção.

---

## Epic 1: Reconciliação Retroativa de Colaboradores Legados

ADMIN dispara reconciliação retroativa em produção viva, vincula colaboradores legados (`Employee.workplace` string sem `workplaceId`) ao grafo relacional, acompanha progresso em tempo real, recebe relatório-resumo e resolve não-matches via fila de revisão. Vertical slice completo: schema → service → matchers → engine → rotas → UI.

### Story 1.1: Migration aditiva V3.3 + scaffold do módulo reconcile

As a **dev (Bruno)**,
I want **uma migration aditiva que prepare o schema para reconciliação (índices, tabelas novas, UNIQUE partial, pg_trgm) e o esqueleto do módulo `reconcile/` em backend-api**,
So that **as próximas stories tenham foundation pronta sem fricção e sem risco de migration destrutiva em produção**.

**Acceptance Criteria:**

**Given** o schema atual (V3.2) em `backend-api/prisma/schema.prisma`
**When** rodo `npx prisma migrate dev --name v3_3_reconcile`
**Then** uma migration aditiva é criada em `prisma/migrations/<ts>_v3_3_reconcile/migration.sql` contendo: índice `workplaces_tenant_name_lower_idx` em `lower(name)`, tabela `reconcile_jobs` (com enum `ReconcileJobStatus`), tabela `workplace_reconcile_queue` (com enum `ReconcileQueueState`), `CREATE UNIQUE INDEX workplace_allocations_unique_active_per_position WHERE status = 'ACTIVE'`, `CREATE EXTENSION IF NOT EXISTS pg_trgm`, índice GIN trgm em `workplaces (name gin_trgm_ops)`.
**And** os models `ReconcileJob`, `WorkplaceReconcileQueue` e os enums correspondentes existem em `schema.prisma` com mapeamento `@@map`/`@map` para snake_case.
**And** a migration roda local em ambiente Docker Compose limpo sem erros.

**Given** a migration aplicada
**When** rodo `npx prisma generate`
**Then** o Prisma Client expõe os modelos novos (`prisma.reconcileJob`, `prisma.workplaceReconcileQueue`).

**Given** a estrutura backend-api atual
**When** scaffolding o módulo `reconcile/`
**Then** os arquivos placeholder (vazios mas exportando classes/funções tipadas) existem em: `src/modules/reconcile/{reconcile.service.ts,reconcile.runner.ts,reconcile.types.ts}`, `src/modules/reconcile/matchers/{normalize.ts,deterministic-matcher.ts,fuzzy-matcher.ts}`, `src/modules/reconcile/{reconcile-queue.service.ts,reconcile-queue.purge.ts}`, `src/modules/workplaces/workplace-allocation.service.ts`.

**Given** a foundation de tenant isolation atual (Prisma extension)
**When** faço o spike de descoberta (≤30min)
**Then** o caminho do arquivo da extension está documentado em comentário no topo de `src/modules/shared/prisma-tenant-factory.ts` (criado ou já existente expandido) e a interface `forTenant(tenantId)` está stubada com TODO de implementação para Epic 4.

**Given** a convenção de testes do módulo `imports/` atual
**When** faço o spike (≤15min) inspecionando arquivos `*.test.ts` existentes
**Then** a convenção (co-located vs `__tests__/`) está documentada e replicada para o módulo `reconcile/`.

**Given** todos os arquivos criados
**When** rodo `npm run build` em `backend-api/`
**Then** TypeScript compila sem erro.

**Given** a suite atual com 347 testes verde
**When** rodo `npm run test`
**Then** todos os 347 testes continuam passando (nenhuma regressão).

---

### Story 1.2: WorkplaceAllocationService como único point-of-write

As a **dev**,
I want **um service `WorkplaceAllocationService.upsertFromImport()` que centralize toda gravação de `WorkplaceAllocation` proveniente de import ou reconcile, com idempotência forte e gravação de AuditLog**,
So that **importers e reconcile compartilhem a mesma invariante (CLT/LGPD/idempotência) e Enforcement #1 da arquitetura seja viável**.

**Acceptance Criteria:**

**Given** o service vazio criado na Story 1.1
**When** implemento `upsertFromImport({ tenantId, employeeId, workplacePositionId, startDate, source })`
**Then** o método retorna um discriminated union `UpsertResult = { kind: 'noop' | 'created' | 'replaced', allocationId }` e executa em uma transação Prisma única.

**Given** um Employee sem allocation ACTIVE
**When** `upsertFromImport` é chamado
**Then** uma `WorkplaceAllocation` ACTIVE é criada com `startDate` recebido (preserva `hireDate` quando o caller passa esse valor — NFR-COMP-1) e o resultado retorna `kind: 'created'`.

**Given** um Employee com allocation ACTIVE no MESMO `workplacePositionId`
**When** `upsertFromImport` é chamado
**Then** o método retorna `kind: 'noop'` sem criar nem alterar nada (idempotência forte — NFR-REL-1, FR2).

**Given** um Employee com allocation ACTIVE em `workplacePositionId` DIFERENTE
**When** `upsertFromImport` é chamado
**Then** a allocation atual é encerrada (`status='ENDED'`, `endDate=now`) e uma nova ACTIVE é criada — sem DELETE (FR23, NFR-COMP-2). Resultado retorna `kind: 'replaced'`.

**Given** uma chamada bem-sucedida que cria ou substitui allocation
**When** o service grava
**Then** um `AuditLog` é registrado com o valor de `action` recebido em `source` (ex.: `'V3.3_RECONCILE'`, `'IMPORT_TIRVU_ALLOCATE'`), `previousData` e `newData` apropriados (FR36).

**Given** a UNIQUE partial index criada na Story 1.1
**When** uma chamada simultânea tenta criar segunda allocation ACTIVE para o mesmo (employee, position)
**Then** o Postgres rejeita; o service captura o erro `P2002` Prisma e trata como `kind: 'noop'` (defesa em profundidade — D2).

**Given** o service implementado
**When** rodo testes co-located (`workplace-allocation.service.test.ts`)
**Then** os 5 cenários acima são cobertos individualmente, mais ≥1 teste de idempotência (re-execução 3× produz mesmo estado), totalizando ≥6 casos com cobertura ≥85% statements no arquivo do service.

**Given** o codebase atual
**When** rodo `grep -r "prisma.workplaceAllocation.create" src/`
**Then** o único hit (fora de testes) é o `workplace-allocation.service.ts` (Enforcement #1).

---

### Story 1.3: Matchers (normalize + determinístico + fuzzy)

As a **dev**,
I want **`normalize()` e dois matchers (`DeterministicMatcher`, `FuzzyMatcher` via `pg_trgm`) implementados em `reconcile/matchers/`**,
So that **o reconcile possa vincular automaticamente quando há match exato e gerar sugestões ranqueadas para casos ambíguos sem nunca aplicar fuzzy automaticamente**.

**Acceptance Criteria:**

**Given** uma string `"INEP   - Sede"` (com whitespace e diacríticos)
**When** chamo `normalize(s)`
**Then** retorna `"inep - sede"` (NFC + lowercase + trim + collapse de whitespace).

**Given** strings `"INEP - Sede"`, `"inep - sede"`, `"INEP   -   Sede   "`, `"Inep - Sede"`
**When** todas passam por `normalize`
**Then** todas retornam o mesmo valor `"inep - sede"` (idempotência da função pura).

**Given** um tenant com `Workplace.name = 'INEP - Sede'` e nenhum outro match
**When** `DeterministicMatcher.match(tenantId, 'inep - sede')` é chamado
**Then** retorna `{ kind: 'unique', workplace: { id, name } }` em ≤5ms p95 (NFR-PERF-5) usando o índice `lower(name)`.

**Given** um tenant com 2+ workplaces que normalizam para a mesma string
**When** `DeterministicMatcher.match(tenantId, 'inep')` retorna múltiplos
**Then** o método retorna `{ kind: 'ambiguous', candidates }` (FR10) e nunca decide automaticamente.

**Given** um tenant sem match exato
**When** `DeterministicMatcher.match` é chamado
**Then** retorna `{ kind: 'none' }` (sem fallback fuzzy implícito — sugestões fuzzy são responsabilidade separada).

**Given** um tenant com workplaces `'INEP - Sede'`, `'INEP - Anexo'`, `'INEP - Reserva'`
**When** `FuzzyMatcher.suggest(tenantId, 'inep', limit=3)` é chamado
**Then** retorna até 3 sugestões `[{ id, name, score }]` ordenadas por `score` desc, score ∈ [0, 1] (FR11) usando o índice GIN trgm.

**Given** sugestões geradas por `FuzzyMatcher`
**When** o caller as recebe
**Then** o caller é responsável por decidir o que fazer (persistir na queue, exibir na UI) — `FuzzyMatcher` nunca grava em `WorkplaceAllocation`.

**Given** os matchers implementados
**When** rodo testes co-located
**Then** ≥3 cenários por matcher (unique, ambiguous, none para determinístico; sugestões válidas + sem match + tie-break para fuzzy) com cobertura ≥85%.

---

### Story 1.4: ReconcileQueueService + endpoints REST da fila

As a **ADMIN**,
I want **endpoints REST para listar e resolver itens da fila de revisão (`vincular`/`criar`/`adiar`/`ignorar`)**,
So that **eu possa tratar não-matches que sobraram da reconciliação automática sem editar o banco diretamente**.

**Acceptance Criteria:**

**Given** o backend rodando com migration V3.3 aplicada
**When** chamo `GET /v1/admin/workplace-reconcile-queue?state=PENDING&page=1&pageSize=20` com JWT de ADMIN
**Then** retorna `{ data: [...], error: null, meta: { total, page, pageSize } }` listando itens da fila do tenant inferido pelo JWT (FR13, FR28), respeitando filtros e paginação.

**Given** um JWT de USER ou AUDITOR (não ADMIN)
**When** chamo `GET /v1/admin/workplace-reconcile-queue`
**Then** USER recebe 403; AUDITOR recebe `data` em modo read-only (sem ações habilitadas — validado por FR18 também na UI).

**Given** um item PENDING com `id`
**When** chamo `POST /v1/admin/workplace-reconcile-queue/:id/resolve` com body `{ action: 'link', workplaceId }`
**Then** o `ReconcileQueueService.resolve()` valida `state ∈ {PENDING, DEFERRED}`, chama `WorkplaceAllocationService.upsertFromImport({ source: 'RECONCILE_QUEUE_RESOLVE' })`, atualiza `state='RESOLVED'`, registra `AuditLog` (FR37) e retorna sucesso.

**Given** um item PENDING
**When** chamo resolve com `{ action: 'create', workplaceName, workplacePositionRole? }`
**Then** o service cria novo `Workplace` (com `importedBy='AUTO_USER_RESOLVE'`), cria `WorkplacePosition` padrão se `role` não informado, chama `upsertFromImport`, marca item RESOLVED, registra AuditLog.

**Given** um item PENDING
**When** chamo resolve com `{ action: 'defer' }` ou `{ action: 'ignore' }`
**Then** o item transita para `state='DEFERRED'` ou `state='IGNORED'` respectivamente, sem criar allocation, com AuditLog (`RECONCILE_QUEUE_DEFER` / `RECONCILE_QUEUE_IGNORE`).

**Given** um item já em estado `RESOLVED` ou `IGNORED`
**When** tento resolver novamente
**Then** o service retorna `409 RECONCILE_QUEUE_ITEM_INVALID_STATE` (idempotência da resolução — FR16, NFR-REL-1).

**Given** os endpoints e service implementados
**When** rodo testes
**Then** ≥6 cenários (list filtros, resolve link/create/defer/ignore, conflito de estado, ADMIN-only) com cobertura ≥85%.

---

### Story 1.5: ReconcileService + Runner + endpoint single-tenant

As a **ADMIN**,
I want **um endpoint `POST /v1/admin/reconcile` que dispare a reconciliação do meu tenant em batches transacionais e um endpoint `GET /v1/admin/reconcile/jobs/:id` para acompanhar progresso**,
So that **eu possa acionar a operação de \"make production honest\" para o meu tenant e ver o resultado em tempo real**.

**Acceptance Criteria:**

**Given** o backend com Stories 1.1–1.4 aplicadas
**When** chamo `POST /v1/admin/reconcile` com JWT de ADMIN
**Then** o `ReconcileService.runSingle({ tenantId, operatorUserId })` cria um `ReconcileJob` (status=`PENDING`), inicia `ReconcileRunner.run(job)` em background do mesmo processo (async, não bloqueante para a request), e retorna imediatamente `{ data: { jobId, status: 'RUNNING' } }`.

**Given** já existe um `ReconcileJob` `RUNNING` para o tenant
**When** chamo `POST /v1/admin/reconcile` novamente
**Then** retorna `409 RECONCILE_TENANT_BUSY` com `jobId` ativo no payload (NFR-SEC-6 + idempotência operacional).

**Given** o `ReconcileRunner` rodando
**When** ele itera sobre `Employee` em batches de `RECONCILE_BATCH_SIZE = 100` (filtrando `workplace IS NOT NULL AND workplaceId IS NULL AND status != 'INATIVO'` — FR1, FR5)
**Then** para cada employee, chama `DeterministicMatcher.match`; se `kind='unique'` chama `WorkplaceAllocationService.upsertFromImport({ source: 'V3.3_RECONCILE', startDate: employee.hireDate })`; se ambíguo/none, gera sugestões via `FuzzyMatcher.suggest` e enfileira em `WorkplaceReconcileQueue` via `ReconcileQueueService.enqueue` (FR9, FR10, FR11).

**Given** o batch processando
**When** cada batch termina
**Then** o `ReconcileRunner` atualiza `ReconcileJob.matched`, `queued`, `ignored`, `errors`, `durationMs` (FR7, NFR-OBS-1) e emite log estruturado JSON `{ module: 'reconcile', event: 'batch_completed', tenantId, jobId, batchSize, matched, queued, ignored, errors, durationMs }` sem PII (NFR-SEC-4, NFR-OBS-1).

**Given** uma allocation falha em uma iteração
**When** o erro é capturado
**Then** o batch continua (NFR-REL-2), o erro é logado com IDs (sem PII), `ReconcileJob.errors++`.

**Given** crash do processo durante o reconcile
**When** o backend reinicia
**Then** transações curtas garantem que o que foi commitado está consistente; o `ReconcileJob` fica em `RUNNING` órfão; re-execução é segura graças à idempotência da Story 1.2 (NFR-REL-5).

**Given** o reconcile completa
**When** o runner termina
**Then** `ReconcileJob.status='COMPLETED'`, `completedAt=now`, e o relatório-resumo é consultável via `GET /v1/admin/reconcile/jobs/:id`.

**Given** chamo `GET /v1/admin/reconcile/jobs/:id` com JWT de ADMIN
**When** o job pertence ao mesmo tenant
**Then** retorna `{ data: { ...job, progressPct } }` onde `progressPct = round((matched + queued + ignored) / totalEmployees * 100)`.

**Given** chamo `GET` para job de outro tenant (com qualquer role exceto SUPERADMIN)
**When** o JWT é ADMIN do tenant A pedindo job do tenant B
**Then** retorna `404` (mesma resposta de não-existente — não vaza informação cross-tenant).

**Given** carga sintética de 1.000 employees em um tenant de teste (NFR-OBS-5)
**When** rodo o reconcile completo
**Then** finaliza em ≤ 5 minutos online (NFR-PERF-2), batches em ≤ 200ms p95 (NFR-PERF-1), sem deadlock observável.

**Given** o ReconcileService + Runner + endpoints implementados
**When** rodo testes
**Then** ≥8 cenários cobertos: happy path, idempotência, tenant busy, falha individual, isolamento entre tenants, progresso correto, status pertinente ao tenant, teste de carga sintético; cobertura ≥85%.

---

### Story 1.6: Frontend — banner em /workplaces, modal de progresso, relatório-resumo

As a **ADMIN**,
I want **um banner contextual em `/workplaces` indicando que há reconcile pendente, um modal de progresso em tempo real, e um relatório-resumo no final**,
So that **eu possa disparar e acompanhar a operação de reconciliação visualmente sem usar curl/Postman**.

**Acceptance Criteria:**

**Given** o backend com Story 1.5 implementada
**When** abro `/workplaces` como ADMIN e há colaboradores com `workplace IS NOT NULL AND workplaceId IS NULL`
**Then** vejo o banner `<ReconcileBanner>` com mensagem (\"Reconciliação V3.3 disponível — vincular N colaboradores aos seus postos\") e botão \"Iniciar reconciliação\" (FR32).

**Given** o banner exibido
**When** não há colaboradores legados pendentes (estado pós-reconcile)
**Then** o banner não é exibido; a tela mostra contadores reais de `alocados/necessários` e `posições` (FR33).

**Given** sou USER ou colaborador final
**When** abro `/workplaces`
**Then** o banner não é exibido independentemente do estado do tenant (FR31).

**Given** clico em \"Iniciar reconciliação\" no banner
**When** o modal `<ReconcileProgressModal>` abre
**Then** o frontend chama `POST /v1/admin/reconcile`, recebe `{ jobId }` e inicia polling 2s via `useReconcileJob(jobId)` (TanStack Query `refetchInterval`, D8) — sem `setInterval` manual.

**Given** o modal aberto durante execução
**When** o polling retorna status `RUNNING`
**Then** uma barra de progresso exibe `progressPct` recebido do backend e contadores parciais `matched/queued/ignored/errors` (FR34).

**Given** o status muda para `COMPLETED`
**When** o polling retorna o resultado
**Then** `refetchInterval` retorna `false` (auto-stop), o modal exibe `<ReconcileSummaryReport>` com totais finais e link \"Ver Pendências de Vínculo\" (FR35) que navega para a aba da Story 1.7.

**Given** o status muda para `FAILED`
**When** o polling captura
**Then** o modal exibe mensagem de erro com `failureReason` e botão \"Fechar\".

**Given** os componentes implementados
**When** rodo lint + build do frontend
**Then** ESLint passa, Next.js builda sem erro, componentes seguem shadcn/ui (sidebar 220px, font 13px), cores de status (gap=#EF4444, covered=#22C55E, planned=#EAB308, pending=#3B82F6) respeitadas.

**Given** os componentes
**When** rodo testes (vitest/RTL)
**Then** ≥3 cenários cobertos: banner condicional (com/sem pendência/role USER), modal com polling mockado, relatório-resumo com contadores.

---

### Story 1.7: Frontend — aba \"Pendências de Vínculo\" com sugestões fuzzy e ações

As a **ADMIN**,
I want **uma aba nova em `/workplaces` listando os itens da fila de revisão, com sugestões fuzzy ranqueadas e 4 ações por linha (vincular | criar | adiar | ignorar)**,
So that **eu possa resolver os não-matches que sobraram da reconciliação automática em uma sessão dedicada e curta**.

**Acceptance Criteria:**

**Given** estou em `/workplaces` como ADMIN
**When** há itens em `WorkplaceReconcileQueue` no estado `PENDING` ou `DEFERRED` para o tenant
**Then** a aba \"Pendências de Vínculo\" aparece com badge contador; ao clicar, vejo `<PendingBindingsTab>` listando linhas com nome do colaborador, posto string original, e até 3 sugestões fuzzy ranqueadas (FR13).

**Given** uma linha com sugestões fuzzy
**When** clico em \"Vincular ao posto X (97% similar)\"
**Then** o frontend chama `POST /v1/admin/workplace-reconcile-queue/:id/resolve` com `{ action: 'link', workplaceId: X }`, item desaparece da fila ao receber resposta, contador da aba decrementa (FR14).

**Given** uma linha sem sugestão satisfatória
**When** clico em \"Criar novo posto\"
**Then** abre dialog para informar nome (e opcionalmente cargo); ao confirmar, frontend chama resolve com `{ action: 'create', workplaceName, workplacePositionRole? }` (FR15).

**Given** uma linha com decisão indecidida
**When** clico em \"Adiar\" ou \"Ignorar\"
**Then** resolve é chamado com `{ action: 'defer' }` ou `{ action: 'ignore' }` (FR16); item some da view default mas pode ser visualizado em filtro de estado.

**Given** sou AUDITOR (não ADMIN)
**When** abro a aba \"Pendências de Vínculo\"
**Then** vejo a lista mas sem nenhum botão de ação habilitado (FR18, NFR-SEC-1).

**Given** uso o filtro de estado
**When** seleciono `DEFERRED` ou `IGNORED`
**Then** a lista mostra itens nesses estados; ao tentar resolver um `IGNORED` (improvável mas possível), o backend retorna 409 e a UI exibe toast com mensagem explicativa.

**Given** os componentes implementados
**When** rodo testes
**Then** ≥4 cenários: render da lista com sugestões, ações link/create/defer/ignore (cada uma), AUDITOR read-only, filtro por estado.

---

## Epic 2: Importações que Populam o Grafo Relacional

Importer Tirvu (employees) e importer de Postos passam a operar sobre o modelo relacional: criam/encerram allocations, auto-criam Workplace quando nome novo aparece, auto-criam WorkplacePosition padrão. Re-imports são idempotentes. Preview mostra delta de relações.

### Story 2.1: Importer Tirvu integra com WorkplaceAllocationService

As a **ADMIN que sobe planilha Tirvu**,
I want **o importer Tirvu, ao processar cada colaborador, resolver `Employee.workplaceId` e criar/encerrar `WorkplaceAllocation` via `WorkplaceAllocationService`**,
So that **novas importações deixem de criar inconsistência silenciosa no grafo relacional**.

**Acceptance Criteria:**

**Given** o importer Tirvu V3.2 atual em `src/modules/imports/import-applier.ts`
**When** refatoro para chamar `WorkplaceAllocationService.upsertFromImport({ source: 'IMPORT_TIRVU_ALLOCATE', startDate: hireDate })`
**Then** o caminho de `prisma.workplaceAllocation.create()` direto é eliminado do `import-applier.ts` (Enforcement #1).

**Given** uma linha Tirvu com `lotacao = 'INEP - Sede'` e Workplace correspondente já existe
**When** o importer processa
**Then** `Employee.workplaceId` é preenchido com o ID do Workplace e uma `WorkplaceAllocation` ACTIVE é criada (FR20, FR22).

**Given** uma linha Tirvu com `lotacao = 'INEP - Anexo'` e nenhum Workplace com esse nome existe no tenant
**When** o importer processa
**Then** o importer auto-cria um novo `Workplace` com `importedBy='AUTO_TIRVU'` e auto-cria uma `WorkplacePosition` padrão (`role='Operacional'`, `requiredCount=1`); só então chama `upsertFromImport` (FR21).

**Given** um Employee já tinha `WorkplaceAllocation` ACTIVE em workplace A
**When** nova importação Tirvu traz `lotacao` de workplace B
**Then** a allocation A é encerrada (`status='ENDED'`, `endDate=now`) e nova ACTIVE em B é criada — comportamento garantido pela Story 1.2 (FR23).

**Given** os refactors implementados
**When** rodo testes de `import-applier.test.ts` (acrescentando casos)
**Then** ≥4 cenários novos: workplace existente + match, workplace novo + auto-create, transição de posto, USER mantém workplace string para retrocompat.

**Given** o codebase atualizado
**When** rodo `grep -r "prisma.workplaceAllocation.create" src/modules/imports/`
**Then** retorna zero (Enforcement #1 garantido).

---

### Story 2.2: ImportJob.previewSummary com delta de relações

As a **ADMIN que vai aplicar uma planilha Tirvu**,
I want **o preview do `ImportJob` (etapa `PREVIEW_READY`) incluir delta granular: quantas allocations serão criadas/encerradas, quantos workplaces novos serão inferidos, quantos colaboradores ficarão sem match**,
So that **eu possa validar o impacto antes de aplicar**.

**Acceptance Criteria:**

**Given** o ImportJob V3.2 atual com `previewSummary` contendo apenas contadores de linhas
**When** refatoro o parser para também simular o delta de relações
**Then** `previewSummary` ganha campos: `allocationsCreated`, `allocationsClosed`, `workplacesCreated`, `unmatchedEmployees` (FR25).

**Given** uma planilha de teste com 47 funcionários, 3 postos novos, 2 transições de posto
**When** o parser processa em modo preview (não-destrutivo)
**Then** `previewSummary` retorna `{ allocationsCreated: 47, allocationsClosed: 2, workplacesCreated: 3, unmatchedEmployees: 0 }`.

**Given** o frontend de import (já existente na V3.2)
**When** consome o `previewSummary` na etapa `PREVIEW_READY`
**Then** exibe os 4 contadores adicionais para o operador antes do botão \"Aplicar\".

**Given** o teste de simulação implementado
**When** rodo testes
**Then** ≥3 cenários: planilha com só novos, planilha com transições, planilha com nomes que normalizam para o mesmo workplace (sem duplicar contagem).

---

### Story 2.3: Importer de Postos auto-cria WorkplacePosition padrão

As a **ADMIN que sobe planilha de Postos**,
I want **o importer de Postos auto-criar uma `WorkplacePosition` padrão (`role='Operacional'`, `requiredCount=1`) quando a planilha não traz coluna de cargo, e respeitar a coluna quando ela existe**,
So that **postos importados não nasçam estéreis (sem posições) e a tela `/workplaces` mostre `posições > 0` desde o primeiro import**.

**Acceptance Criteria:**

**Given** a rota atual em `src/routes/api/v1/workplaces/index.ts` que importa postos
**When** refatoro para checar se a planilha traz `positionRole` na linha
**Then** quando ausente/vazio, o importador cria 1 `WorkplacePosition` padrão por workplace recém-criado (FR26).

**Given** a planilha traz `positionRole = 'Recepção'` em uma linha
**When** o importador processa
**Then** cria a `WorkplacePosition` com `role='Recepção'` (não duplica criando também a padrão — FR27).

**Given** o refactor implementado
**When** rodo testes
**Then** ≥3 cenários: planilha sem cargo (cria padrão), planilha com cargo (respeita), planilha mista (alguns com, alguns sem).

**Given** o codebase atualizado
**When** rodo a suite global
**Then** os 347 testes existentes continuam verde (compatibilidade — FR45).

---

### Story 2.4: Testes de idempotência de re-import

As a **dev**,
I want **testes que validem que re-importar a mesma planilha (Tirvu ou Postos) não duplica allocations, não cria workplaces duplicados, e mantém o estado consistente**,
So that **operadores possam re-aplicar uma planilha sem medo de corromper dados (NFR-REL-1)**.

**Acceptance Criteria:**

**Given** uma planilha Tirvu de 50 colaboradores
**When** rodo o import 2× consecutivamente
**Then** `WorkplaceAllocation` count permanece igual após o segundo import; nenhum workplace duplicado em `Workplace`; AuditLog tem entradas idempotentes (criação na 1ª vez, no-op com log na 2ª).

**Given** uma planilha de Postos com 10 postos (5 já existentes no tenant, 5 novos)
**When** rodo o import 2×
**Then** apenas os 5 novos são criados na 1ª vez; nenhum workplace é criado na 2ª; `WorkplacePosition` padrão é criada uma vez para cada workplace novo.

**Given** uma planilha Tirvu onde, entre o 1º e o 2º import, mudaram os postos de 3 colaboradores
**When** rodo o 2º import
**Then** as 3 allocations antigas são encerradas, 3 novas ACTIVE são criadas; AuditLog reflete as 6 operações.

**Given** os testes implementados como integração (com banco real em modo test)
**When** rodo
**Then** todos passam consistentemente (sem flaky); o tempo total dos testes de import permanece ≤ 30s.

---

## Epic 3: Governança, Auditoria e Higiene Contínua

AUDITOR tem read-only views; sistema purga LGPD após 90 dias; cobertura ≥85% nos módulos novos; suite global ≥350 verde; documentação atualizada.

### Story 3.1: AUDITOR read-only views (fila + audit logs)

As a **AUDITOR**,
I want **visualizar a fila de \"Pendências de Vínculo\" e os AuditLogs de reconcile do meu tenant em modo read-only**,
So that **eu possa cumprir minha função de conformidade trabalhista sem ter permissão para alterar dados (NFR-SEC-5)**.

**Acceptance Criteria:**

**Given** sou AUDITOR de um tenant
**When** abro `/workplaces > Pendências de Vínculo`
**Then** vejo a lista igual a um ADMIN, mas todos os botões de ação estão desabilitados ou ocultos (FR18).

**Given** sou AUDITOR
**When** chamo `GET /v1/audit-logs?action=V3.3_RECONCILE` (rota existente; verificar se já filtra por tenantId via JWT)
**Then** recebo apenas logs do meu tenant (FR39, NFR-SEC-3).

**Given** sou AUDITOR
**When** tento `POST /v1/admin/workplace-reconcile-queue/:id/resolve` (mesmo via curl)
**Then** recebo 403 (NFR-SEC-1).

**Given** o controle implementado
**When** rodo testes de RBAC
**Then** ≥3 cenários: AUDITOR vê fila (200), AUDITOR vê audit logs do próprio tenant (200), AUDITOR tenta resolver (403).

---

### Story 3.2: Cron in-process de purge LGPD 90d

As a **plataforma**,
I want **um cron in-process que diariamente apague itens da `WorkplaceReconcileQueue` no estado `RESOLVED` ou `IGNORED` há mais de 90 dias**,
So that **a fila não acumule dados pessoais (nomes) indefinidamente, atendendo LGPD (NFR-COMP-3, FR17)**.

**Acceptance Criteria:**

**Given** o cron implementado em `reconcile/reconcile-queue.purge.ts` usando `node-cron` ou similar
**When** roda em produção (com env flag `RECONCILE_QUEUE_PURGE_ENABLED=true`) com agendamento `0 3 * * *` (diário às 3h UTC)
**Then** apaga registros `WorkplaceReconcileQueue` com `state ∈ {RESOLVED, IGNORED}` e `resolvedAt < now - 90 days`.

**Given** o cron rodou
**When** o dado foi apagado
**Then** o `AuditLog` correspondente continua acessível (purge afeta apenas a tabela queue, não auditoria — NFR-COMP-3).

**Given** ambiente dev (sem flag)
**When** o backend inicializa
**Then** o cron NÃO é registrado (não polui logs de dev).

**Given** o cron implementado
**When** rodo testes (com mock de tempo via `vi.useFakeTimers` ou injeção de `now`)
**Then** ≥2 cenários: itens vencidos são apagados, itens recentes são mantidos.

---

### Story 3.3: Cobertura ≥85% nos módulos novos + teste de carga sintético

As a **dev**,
I want **garantir que os módulos novos (`reconcile/`, `workplaces/workplace-allocation.service.ts`) tenham cobertura ≥85% statements e ≥1 teste de carga sintético com 1.000 employees**,
So that **NFR-MAINT-1 e NFR-OBS-5 estejam atendidos antes do release V3.3.0**.

**Acceptance Criteria:**

**Given** a configuração de cobertura existente do projeto
**When** rodo `npm run test -- --coverage` em `backend-api/`
**Then** os arquivos em `src/modules/reconcile/**` e `src/modules/workplaces/workplace-allocation.service.ts` têm cobertura ≥85% statements.

**Given** o teste de carga sintético implementado em `reconcile/reconcile.runner.test.ts` (ou arquivo dedicado)
**When** rodo o teste com 1.000 employees mockados em um tenant de teste
**Then** o reconcile completa em ≤ 5 minutos (NFR-PERF-2), batches em ≤ 200ms p95 (NFR-PERF-1), sem deadlock.

**Given** a suite global atual com 347 testes verde
**When** rodo a suite completa após V3.3
**Then** o total é ≥ 350 testes (347 originais + ≥3 novos para passar acima de 350) e todos verdes.

---

### Story 3.4: Documentação CLAUDE.md — princípio importadores escrevem no grafo

As a **futuro contribuidor (humano ou AI agent)**,
I want **o `CLAUDE.md` do projeto explicitar que importadores devem escrever no grafo relacional (não em campos legados) e que `WorkplaceAllocationService.upsertFromImport()` é o único point-of-write para allocations**,
So that **futuros importers (CSV, Senior, TOTVS) não recriem o bug que V3.3 corrige (NFR-MAINT-3, Enforcement Guidelines)**.

**Acceptance Criteria:**

**Given** o `CLAUDE.md` atual em raiz do projeto
**When** acrescento seção \"Regras V3.3 — Importadores e Reconciliação\"
**Then** a seção contém: princípio \"importadores escrevem no grafo relacional\", referência a `WorkplaceAllocationService.upsertFromImport()` como único point-of-write, link para a arquitetura V3.3 (`_evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md`), as 10 Enforcement Guidelines listadas resumidamente.

**Given** a seção adicionada
**When** futuro AI agent for criar novo importer
**Then** deve referenciar a regra explicitamente em commit/PR (gate humano).

**Given** o CLAUDE.md atualizado
**When** rodo lint do projeto
**Then** sem regressão.

---

## Epic 4: Reconciliação Super-Admin Multi-Tenant + Hardening de Schema (Phase 2 — V3.3.1, outline)

> **Status:** detalhamento adiado. Stories abaixo são esboços — refinamento completo (acceptance criteria detalhadas) ocorrerá quando V3.3.0 estiver consolidado em produção.

### Story 4.1: SUPERADMIN dispara reconcile batch multi-tenant (outline)

SUPERADMIN dispara reconcile em batch para múltiplos tenants ou todos via `POST /v1/admin/reconcile/batch { tenantIds: ['t1','t2',...] | 'all' }` e card no painel super-admin. Cada execução por tenant é isolada (loop com try/catch — D7); falha em um tenant não cascata. Helper `prismaTenantFactory.forTenant(tenantId)` impersona contexto sem bypassar Prisma extension. AuditLog macro registra batch com IPs, IDs de tenants e duração total.

**FRs:** FR29, FR30. **Outline only.**

### Story 4.2: Migration V3.3.1 — CHECK constraint condicional (outline)

Migration nova com pré-condição validável dentro de `DO $$ BEGIN ... END $$` que aborta o deploy se houver `Employee` com `status='ATIVO' AND workplaceId IS NULL`. Se passa a pré-condição, adiciona `CHECK (status != 'ATIVO' OR workplace_id IS NOT NULL)`. Reversível via `DROP CONSTRAINT`. Não altera dados.

**FRs:** FR41. **Outline only.**

---

## Epic 5: Visão Estratégica V3.4+ (Phase 3 — outline)

> **Status:** outline apenas. Reabrir como feature dedicada (`v3-4-evolucao-postos`) quando V3.3 estiver consolidado.

### Story 5.1: Drop de Employee.workplace em fases (outline)

Rename `Employee.workplace` → `legacyWorkplace` em uma release; remover de responses de API; após N releases comprovando que `WorkplaceAllocation` cobre 100% do histórico, `DROP COLUMN`. Justificativa CLT: histórico preservado em allocations encerradas.

### Story 5.2: WorkplacePosition rico (outline)

Adicionar `shiftPattern` estruturado (JSON com manhã/tarde/noite/escala), `requiredQualifications` (string[]), `salaryBand` (decimal range). Alimenta motor de cobertura V3.0 com critérios de elegibilidade reais.

### Story 5.3: Histórico de allocations como time-series (outline)

Endpoint dedicado para consultar histórico (\"quem trabalhou no posto X em 2026-Q1?\"). Base para auditoria CLT, prestação de contas a clientes finais, disputas trabalhistas.

### Story 5.4: Plugin architecture de importers (outline)

Tirvu vira um adapter em `src/modules/imports/adapters/tirvu.ts`. Produto aceita CSV genérico, Senior, TOTVS, ERP custom, todos escrevendo no mesmo `WorkplaceAllocationService`. Plugins registráveis via config por tenant.
