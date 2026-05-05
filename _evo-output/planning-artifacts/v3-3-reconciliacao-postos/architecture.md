---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
status: 'complete'
lastStep: 8
completedAt: '2026-05-05'
inputDocuments:
  - _evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md
  - _evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md
  - CLAUDE.md
  - backend-api/prisma/schema.prisma
workflowType: 'architecture'
project_name: 'gestao-ferias'
user_name: 'Bruno'
date: '2026-05-04'
feature: 'v3-3-reconciliacao-postos'
---

# Architecture Decision Document

**Feature:** Reconciliação Postos×Funcionários (V3.3)
**Author:** Bruno
**Date:** 2026-05-04

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (45 FRs em 9 áreas — capability contract do PRD V3.3):**

| Área | FRs | Implicação arquitetural |
|---|---|---|
| Reconciliation Engine | FR1–FR7 | Job assíncrono com batches transacionais, idempotente, observável (status + relatório). Demanda **runner** (BullMQ ou job síncrono em-processo) + **state record** persistido. |
| Matching & Disambiguation | FR8–FR12 | **Dois matchers** distintos (determinístico para vincular, fuzzy só para sugerir). Determinístico precisa de índice em Postgres; fuzzy pode usar `pg_trgm` ou JS. |
| Review Queue Management | FR13–FR19 | Persistência dedicada com estados (pendente/adiado/resolvido/ignorado), purge 90d, ações idempotentes (vincular/criar/ignorar). |
| Importer Integration (Tirvu) | FR20–FR25 | Refatoração do `import-applier.ts` para chamar service compartilhado. Encerramento de allocation antiga + criação nova em transição de posto. |
| Importer Integration (Postos) | FR26–FR27 | Refatoração da rota de import de postos para auto-criar `WorkplacePosition` padrão. |
| Multi-tenant & RBAC | FR28–FR31 | `tenantId` derivado de JWT (single) + sub-execuções isoladas (batch SUPERADMIN). UI por role: `USER` não vê nada de reconcile. |
| Workplace Visibility (UI) | FR32–FR35 | Banner contextual condicional + aba nova \"Pendências de Vínculo\" + feedback de progresso em tempo real. |
| Audit & Telemetry | FR36–FR39 | Reuso de `AuditLog` com novos `action` enum values. Logs estruturados sem PII (LGPD). |
| Migration & Schema Evolution | FR40–FR42 | Migration aditiva V3.3 (índice + tabela queue). Migration V3.3.1 separada com pré-condição (CHECK constraint condicional). |
| Compatibility | FR43–FR45 | **Zero alteração** em `CoverageEngine`, `PromptBuilder`, webhooks, PWA do colaborador. Os módulos V3 ressuscitam só por terem dados reais no grafo. |

**Non-Functional Requirements (31 NFRs em 6 categorias) — drivers arquiteturais críticos:**

- **Performance:** batch ≤200ms p95, reconcile completo ≤5min, degradação ≤10% da plataforma durante execução, matching ≤5ms com índice.
- **Security:** rota admin ADMIN+; `tenantId` via JWT; Prisma extension não bypass-ável; rate limit 10/h; sem credenciais externas envolvidas; logs sem PII.
- **Reliability:** idempotência forte (UNIQUE condicional), isolamento entre tenants no batch, migration trivialmente reversível, crash-safe via transações curtas.
- **Compliance:** CLT (`hireDate` como `startDate`, correção sem DELETE), LGPD (purge 90d, fila sem CPF), preservação do campo legado durante toda V3.3.x.
- **Maintainability:** ≥85% cobertura nos módulos novos; `WorkplaceAllocationService` como **único** ponto de gravação de allocations a partir de import (validável por lint/grep); regra documentada em `CLAUDE.md`.
- **Observability:** logs JSON estruturados, métricas para stack VPS (Grafana/Prometheus), progresso real-time na UI, sinalização visual de higiene de dados.

### Scale & Complexity

- **Volume realista (perfil Green House):** 108 postos, ~500 employees, ~500 allocations a criar no reconcile inicial. Multi-tenant: ≤ 5 tenants em piloto, projeção de dezenas no médio prazo.
- **Complexity level:** **medium-high** — não é greenfield (reusa schema, models, motor de cobertura, importer existente), mas envolve concorrência (online sem manutenção), multi-tenant strict, idempotência forte, compliance trabalhista, e refatoração de 2 importers em produção.
- **Primary technical domain:** **backend-heavy full-stack** — gravidade do trabalho está em backend service + matchers + migration + idempotência. Frontend é UI mínima (banner + aba + progresso).
- **Estimated architectural components:** ~7 unidades novas + 2 refatorações.
  - Novos: `WorkplaceAllocationService`, `ReconcileService`, `DeterministicMatcher`, `FuzzyMatcher`, `WorkplaceReconcileQueue` (model+repository), rota admin REST, componentes UI (banner + aba + card super-admin).
  - Refatorações: `import-applier.ts` (Tirvu), rota import de Postos.
  - Migrations: V3.3 (aditiva) + V3.3.1 (NOT NULL condicional, em release seguinte).

### Technical Constraints & Dependencies

**Stack já fixado (sem decisão a tomar):**
- Backend: Fastify 5, TypeScript strict, Prisma 7.6, PostgreSQL 15.
- Frontend: Next.js 16.2 App Router, React 19, Tailwind, shadcn/ui, TanStack Query.
- Infra: Docker Swarm + Portainer + Traefik (prod VPS); Docker Compose (dev local); BullMQ + Redis (jobs assíncronos disponíveis).
- Auth: JWT com roles (`USER`, `AUDITOR`, `ADMIN`, `SUPERADMIN`).
- Tenant isolation: Prisma extension já existente (V3 base).

**Dependências cross-feature:**
- Schema Prisma já tem todos os models necessários (`Workplace`, `WorkplacePosition`, `WorkplaceAllocation`, `Employee.workplaceId` FK opcional, `ImportJob`, `AuditLog`). **Nenhum model novo obrigatório**, exceto opcionalmente `WorkplaceReconcileQueue` (decisão pendente).
- Sistema de auditoria (`AuditLog`) já implementado — reuso direto, só adicionando `action` enum values.
- Sistema de webhooks (V3.0) disponível — opcional para Phase 2.

**Restrições explicitamente confirmadas pelo usuário:**
- Janela: **online, sem manutenção**.
- Tenant scope: **multi-tenant** desde o dia um.
- Breaking change `Employee.workplaceId` NOT NULL: **OK em V3.3.1** (release seguinte).

**Restrições do CLAUDE.md (regras críticas do projeto):**
- TODA query DEVE filtrar por `tenantId` do JWT (multi-tenant strict).
- Validação CLT obrigatória; `isFerista` é flag boolean (não tipo contratual).
- Endpoints exigem JWT (exceto setup/login).
- Convenção REST: `/api/v1/<recurso>`; respostas `{ data, error, meta }`.
- Frontend: shadcn/ui, design compacto (sidebar 220px, font 13px).

### Cross-Cutting Concerns Identified

1. **Tenant isolation:** atravessa todas as camadas (rota, service, matcher, queue, UI). Decisão: arquitetura precisa garantir que toda gravação passe pelo Prisma extension; nem mesmo SUPERADMIN bypassa em writes.
2. **Idempotência:** atravessa importer, reconcile job, ações da fila. Decisão: estratégia única (UNIQUE constraint condicional no schema + checagem aplicacional em duas pontas).
3. **Auditoria:** atravessa cada gravação (allocation criada, fila resolvida, batch executado). Decisão: contrato uniforme de `AuditLog` com `previousData`/`newData` em todos os pontos de write.
4. **Observabilidade:** logs estruturados + métricas + progresso UI. Decisão: contrato comum de logging por batch com campos padronizados.
5. **LGPD:** atravessa fila (sem PII), logs (sem PII), purge automática. Decisão: schema da fila armazena apenas IDs e nomes de posto/colaborador necessários para a UI; CPF/dados pessoais nunca entram.
6. **Compliance CLT:** atravessa criação de allocation (preservar `hireDate`) e correção (encerrar+criar, nunca DELETE). Decisão: contrato do `WorkplaceAllocationService` codifica essas regras como invariantes.
7. **Compatibilidade com V3.0/V3.1/V3.2:** zero mudança em `CoverageEngine`, `PromptBuilder`, webhooks, PWA. Decisão: arquitetura V3.3 é puramente aditiva — só popula dados que esses módulos já consomem.

### Validação do Entendimento

**Aspectos arquiteturais centrais:**
- Refatoração corretiva sobre código em produção, não greenfield.
- Backend-heavy: serviço único de gravação + matcher + job retroativo + queue.
- Frontend-light: 1 banner + 1 aba + 1 card super-admin reusando shadcn/ui.
- Migrations em duas fases (aditiva → constraint), ambas reversíveis.
- Compatibility-first: nenhum módulo V3 existente sofre alteração de código.

**Complexidade estimada:** medium-high (não é redesign de produto, mas exige rigor em idempotência, multi-tenant, compliance e zero-downtime).

**Domínio técnico:** backend-heavy full-stack com camada operacional de migration e observabilidade.

**Cross-cutting concerns:** 7 (listados acima) — todos já têm direção arquitetural preliminar.

## Starter Template Evaluation

### Status: N/A — Brownfield Project

V3.3 é uma feature corretiva sobre um monorepo em produção há meses. Não há decisão de starter a tomar — a foundation técnica está fixada desde V3.0 (sprint 1, 2026-04-13) e já passou por V3.1 (Polish), V3.2 (Import Tirvu) e V3.0.0 release.

### Foundation Atual (já estabelecida)

**Backend (`backend-api/`):**
- **Runtime:** Node.js (LTS atual em uso pelo Docker base image do projeto).
- **Framework:** Fastify 5 com TypeScript strict.
- **ORM:** Prisma 7.6 com client gerado e Prisma extension de tenant isolation.
- **Database:** PostgreSQL 15.
- **Job runner:** BullMQ + Redis (já em uso para outras features).
- **Auth:** JWT com refresh tokens, roles (`USER`, `AUDITOR`, `ADMIN`, `SUPERADMIN`).
- **Estrutura modular:** `src/modules/<domain>/` (employees, vacations, signatures, integrations, notifications, shared, coverage-engine, finance, imports). V3.3 adiciona `reconcile/` e potencialmente expande `workplaces/`.
- **Rotas:** `src/routes/api/v1/<recurso>/index.ts` com autoload Fastify.
- **Testes:** suite atual 347 verde (per memory `project_v3_audit_resolved`).

**Frontend (`frontend-web/`):**
- **Framework:** Next.js 16.2 App Router + React 19.
- **Styling:** Tailwind CSS + shadcn/ui (design compacto: sidebar 220px, font 13px).
- **State/data:** TanStack Query.
- **Páginas existentes:** `admin/`, `approvals/`, `auth/`, `coverage/`, `dashboard/`, `employee/`, `employees/`, `predict/`, `settings/`, `workplaces/`. V3.3 adiciona componentes em `workplaces/` e `admin/`.

**Infra:**
- **Dev local:** Docker Compose (postgres + redis + backend + frontend) com hot-reload.
- **Produção:** Docker Swarm + Portainer + Traefik na VPS (`ferias.unibot.com.br`), per memory `project_infra_decisions`.
- **CI:** suite de testes integrada (per memory `project_sprint5_completed`).

**Convenções fixadas (CLAUDE.md):**
- Multi-tenant strict: TODA query DEVE filtrar por `tenantId` do JWT.
- Validação CLT obrigatória em qualquer criação de férias/cobertura.
- JWT obrigatório (exceto `/auth/setup` e `/auth/login`).
- `isFerista` é flag boolean (não tipo contratual).
- REST: `/api/v1/<recurso>`; respostas `{ data, error, meta }`.
- Status colors: gap=#EF4444, covered=#22C55E, planned=#EAB308, pending=#3B82F6.

### Architectural Decisions Já Provadas em Produção (sem reabrir)

- **Tenant isolation via Prisma extension:** validado em V3.0 e V3.1, a base de toda a segurança multi-tenant.
- **Auditoria via `AuditLog`:** padrão usado em V3.1 (master key) e V3.2 (import jobs).
- **Job state machine via record persistido:** `ImportJob` com enum de status (PENDING → PARSING → PREVIEW_READY → APPLYING → COMPLETED|FAILED|CANCELLED|TIMED_OUT) é o template a reusar para o `ReconcileJob` (Phase 1, decisão a confirmar no Step 4).
- **Pool de credenciais externas:** V3.1 introduziu `EmailCredential` e `WhatsappCredential` — não impacta V3.3 mas o padrão de \"gerenciado por SUPERADMIN\" pode inspirar a UI super-admin do batch reconcile.
- **Encryption AES-256-GCM** (`bankDataEnc`/`bankDataIv`/`bankDataTag` em `Employee`): não impacta V3.3 (não tocamos esses campos), mas reforça que LGPD é regra dura no projeto.

### Implicação para V3.3

- **Initialization story:** **não há.** A primeira story do épico V3.3 será a migration aditiva + scaffolding do módulo `reconcile/` + service compartilhado. Não há `npx create-X` a executar.
- **Decisão deferida:** todas as decisões técnicas restantes (queue dedicada vs `ImportJob`-like, polling vs SSE, UNIQUE condicional, matchers, RBAC do batch, idempotência) entram no **Step 4 — Architectural Decisions**, alinhadas com a foundation acima e com as 8 questões já mapeadas no preâmbulo.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (bloqueiam implementação — todas resolvidas neste step):**
1. Persistence model do reconcile (queue dedicada vs `ImportJob`-like)
2. Estratégia de idempotência (UNIQUE constraint + checagem aplicacional)
3. Estrutura modular (`reconcile/` + `WorkplaceAllocationService`)
4. Plano de migrations (V3.3 aditiva, V3.3.1 condicional)
5. Estratégia de matching determinístico
6. Estratégia de matching fuzzy (sugestões)
7. RBAC para batch super-admin (isolamento de execução)
8. Comunicação de progresso real-time (polling vs SSE)

**Important (modelam arquitetura, mas têm um caminho default seguro):**
- Tooling de logging estruturado (já fixado pelo projeto: pino + JSON)
- Métricas para Grafana (formato Prometheus, integração via VPS — confirmar com Carla na implementação)
- Estrutura de transações em batch (decisão técnica, default seguro)

**Deferred (Phase 2):**
- Webhook outbound `WORKPLACE_RECONCILED` (PRD Phase 2)
- Drift detection cron (PRD Phase 2)
- Notificação por email de fila > 7 dias (PRD Phase 2)

---

### D1 — Reconcile Persistence Model

**Decisão:** **tabela nova `WorkplaceReconcileQueue` + `ReconcileJob` reusando o padrão `ImportJob`** (record persistido + state machine), mas como **modelos separados** (não reusar `ImportJob` literalmente).

**Esquema proposto (Phase 1):**
```prisma
model ReconcileJob {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  operatorUserId  String   @map("operator_user_id") @db.Uuid
  status          ReconcileJobStatus @default(PENDING)
  parserVersion   String   @default("reconcile-v1")
  totalEmployees  Int?     @map("total_employees")
  matched         Int      @default(0)
  queued          Int      @default(0)
  ignored         Int      @default(0)
  errors          Int      @default(0)
  durationMs      Int?     @map("duration_ms")
  failureReason   String?  @map("failure_reason")
  triggeredBy     String   @default("ADMIN") @map("triggered_by") // ADMIN | SUPERADMIN_BATCH
  batchParentId   String?  @map("batch_parent_id") @db.Uuid // ref para batch super-admin (opcional)
  createdAt       DateTime @default(now()) @map("created_at")
  startedAt       DateTime? @map("started_at")
  completedAt     DateTime? @map("completed_at")
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  operator        User     @relation(fields: [operatorUserId], references: [id])
  queueItems      WorkplaceReconcileQueue[]
  @@index([tenantId, status, createdAt])
  @@map("reconcile_jobs")
}

enum ReconcileJobStatus { PENDING RUNNING COMPLETED FAILED }

model WorkplaceReconcileQueue {
  id                String   @id @default(uuid()) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  reconcileJobId    String   @map("reconcile_job_id") @db.Uuid
  employeeId        String   @map("employee_id") @db.Uuid
  workplaceNameRaw  String   @map("workplace_name_raw") // string original do Employee.workplace
  state             ReconcileQueueState @default(PENDING)
  suggestions       Json?    // [{ workplaceId, name, score }] — top-N fuzzy
  resolvedToWorkplaceId String? @map("resolved_to_workplace_id") @db.Uuid
  resolvedByUserId  String?  @map("resolved_by_user_id") @db.Uuid
  resolvedAt        DateTime? @map("resolved_at")
  createdAt         DateTime @default(now()) @map("created_at")
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  reconcileJob      ReconcileJob @relation(fields: [reconcileJobId], references: [id])
  employee          Employee @relation(fields: [employeeId], references: [id])
  resolvedToWorkplace Workplace? @relation(fields: [resolvedToWorkplaceId], references: [id])
  @@unique([tenantId, employeeId, state]) // só uma linha PENDING/DEFERRED por employee por tenant
  @@index([tenantId, state, createdAt])
  @@map("workplace_reconcile_queue")
}

enum ReconcileQueueState { PENDING DEFERRED RESOLVED IGNORED }
```

**Rationale:**
- **Por que não reusar `ImportJob`?** ImportJob carrega contrato de planilha (filename, fileSize, fileHash, storagePath, parserVersion: 'tirvu-v1'). Forçar reconcile em ImportJob ou exige campos NULLáveis sem semântica (sujeira de schema), ou degrada o entendimento do que é um \"import\" — confusão arquitetural por economia de modelo.
- **Por que tabela queue separada?** Item da fila é \"pendência humana de decisão\", não \"linha de planilha em revisão\". Tem estados, sugestões, resolvedAt, resolver — semântica distinta. Reusar `ImportJob.previewSummary` (Json) misturaria coisas com ciclos de vida diferentes (preview é efêmero; queue é persistente até resolução).
- **Reuso do PADRÃO de state machine** (não da tabela): `ReconcileJob` segue o template comprovado em V3.2 — campos de auditoria padronizados, status enum explícito, contadores `rowsProcessed/Created/Updated` traduzidos para `matched/queued/ignored/errors`.
- **`UNIQUE(tenantId, employeeId, state)` na queue:** garante que só existe um item PENDING/DEFERRED por employee — re-execução do reconcile não duplica linhas pendentes.

**Cascading implications:**
- Migration V3.3 cria 2 tabelas + 2 enums + índices.
- AuditLog ganha `action: 'V3.3_RECONCILE'`, `'V3.3_RECONCILE_BATCH'`, `'IMPORT_TIRVU_ALLOCATE'`, `'RECONCILE_QUEUE_RESOLVE'` (FR36–FR37).
- Frontend consome 2 endpoints distintos: `GET /v1/admin/reconcile/jobs/:id` (status do job) e `GET /v1/admin/workplace-reconcile-queue` (fila para revisão).

---

### D2 — Estratégia de Idempotência

**Decisão:** **defesa em 2 camadas** — UNIQUE constraint condicional no Postgres + checagem aplicacional explícita em `WorkplaceAllocationService.upsertFromImport()`.

**Camada 1 — Postgres partial unique index (na migration V3.3):**
```sql
CREATE UNIQUE INDEX workplace_allocations_unique_active_per_position
  ON workplace_allocations (employee_id, workplace_position_id)
  WHERE status = 'ACTIVE';
```

Isto garante, no nível do banco, que **nunca existem 2 allocations ACTIVE para o mesmo par (employee, position)**. Qualquer tentativa de duplicação levanta erro PG, que o service captura e trata como no-op idempotente.

**Camada 2 — Application-level check em `WorkplaceAllocationService.upsertFromImport()`:**
```typescript
async upsertFromImport({ tenantId, employeeId, workplacePositionId, startDate, source }): Promise<UpsertResult> {
  return this.prisma.$transaction(async (tx) => {
    const existing = await tx.workplaceAllocation.findFirst({
      where: { tenantId, employeeId, status: 'ACTIVE' },
    });

    // Mesma posição? No-op (idempotência forte).
    if (existing && existing.workplacePositionId === workplacePositionId) {
      return { action: 'noop', allocationId: existing.id };
    }

    // Posição diferente? Encerra e cria nova (FR23).
    if (existing && existing.workplacePositionId !== workplacePositionId) {
      await tx.workplaceAllocation.update({
        where: { id: existing.id },
        data: { status: 'ENDED', endDate: new Date(), updatedAt: new Date() },
      });
    }

    const created = await tx.workplaceAllocation.create({
      data: { tenantId, employeeId, workplacePositionId, startDate, status: 'ACTIVE' },
    });
    await this.audit.record({ tenantId, action: source, ... });
    return { action: existing ? 'replaced' : 'created', allocationId: created.id };
  });
}
```

**Rationale:**
- **Defesa em profundidade:** check aplicacional cobre o caso normal (no-op explícito sem hit no banco); UNIQUE index é a rede de segurança contra race conditions e bugs futuros que pulem o service.
- **Por que UNIQUE condicional (`WHERE status = 'ACTIVE'`)** e não global? Histórico de allocations encerradas (`status='ENDED'`) precisa preservar pares duplicados ao longo do tempo (employee passou pelo posto X, saiu, voltou) — exigência CLT (NFR-COMP-2).
- **Idempotência via `findFirst` antes do `create`:** atende NFR-REL-1 (re-execução produz mesmo estado) e FR2.

**Cascading:**
- Migration V3.3 inclui o `CREATE UNIQUE INDEX` partial.
- Antes de criar o índice, a migration roda DDL para detectar e mesclar duplicatas pré-existentes (provavelmente zero, mas a checagem é barata).
- Service exporta tipo discriminado `UpsertResult` que job e importer consomem para incrementar contadores corretos.

---

### D3 — Estrutura Modular

**Decisão:** novo módulo `backend-api/src/modules/reconcile/` + service compartilhado em `backend-api/src/modules/workplaces/`.

```
backend-api/src/modules/
├── workplaces/
│   ├── workplace-allocation.service.ts   # ✨ NOVO — único point-of-write de allocation por import
│   ├── workplace.repository.ts           # (existente, expandir se necessário)
│   └── ...
├── reconcile/
│   ├── reconcile.service.ts              # ✨ NOVO — orquestra job, batches, transações
│   ├── reconcile.runner.ts               # ✨ NOVO — execução in-process (não BullMQ na Phase 1)
│   ├── matchers/
│   │   ├── deterministic-matcher.ts      # ✨ NOVO — NFC + lower + trim + collapse
│   │   ├── fuzzy-matcher.ts              # ✨ NOVO — pg_trgm via raw SQL
│   │   └── normalize.ts                  # ✨ NOVO — função pura compartilhada
│   ├── reconcile-queue.service.ts        # ✨ NOVO — CRUD da WorkplaceReconcileQueue
│   ├── reconcile-queue.purge.ts          # ✨ NOVO — job de purge LGPD 90d
│   └── reconcile.types.ts                # ✨ NOVO — tipos discriminados
└── imports/
    ├── import-applier.ts                 # ♻️ REFATORAR — chama WorkplaceAllocationService.upsertFromImport()
    └── import-matcher.ts                 # ♻️ REFATORAR — não toca em allocation diretamente
```

**Rotas (`backend-api/src/routes/api/v1/`):**
```
admin/
├── reconcile/
│   ├── index.ts                          # POST /v1/admin/reconcile           (single-tenant ADMIN+)
│   ├── batch.ts                          # POST /v1/admin/reconcile/batch     (SUPERADMIN only)
│   └── status.ts                         # GET  /v1/admin/reconcile/jobs/:id  (status + progresso)
└── workplace-reconcile-queue/
    ├── index.ts                          # GET  list, com filtros
    ├── resolve.ts                        # POST /:id/resolve                  (vincular | criar | ignorar | adiar)
    └── ...
```

**Frontend (`frontend-web/src/app/`):**
```
workplaces/
├── page.tsx                              # ♻️ adicionar banner condicional + aba "Pendências"
├── components/
│   ├── reconcile-banner.tsx              # ✨ NOVO
│   ├── reconcile-progress-modal.tsx      # ✨ NOVO — feedback em tempo real
│   ├── reconcile-summary-report.tsx      # ✨ NOVO — relatório pós-execução
│   └── pending-bindings-tab.tsx          # ✨ NOVO — aba da fila de revisão
admin/
└── reconcile/
    └── page.tsx                          # ✨ NOVO — card super-admin com tabela de tenants
```

**Rationale:**
- **`WorkplaceAllocationService` em `workplaces/`** (não em `reconcile/`): o service é a face pública do domínio Workplace para qualquer feature que precise gravar allocations. Reconcile o consome; importers o consomem; futura UI manual também. NFR-MAINT-2 (\"único point-of-write\") só faz sentido se o service estiver no domínio dele.
- **Reconcile como módulo próprio:** matchers, runner e service do reconcile são preocupações coesas internas a este módulo. Separação clara permite remoção/substituição futura sem tocar outros domínios.
- **Por que `reconcile.runner.ts` separado de `reconcile.service.ts`?** Service é stateless e injetável (testável em isolamento, usado por rotas e pelo runner). Runner orquestra batches, controla loop, mede tempo, atualiza `ReconcileJob` — concerns diferentes. Phase 2 pode trocar runner in-process por BullMQ worker sem tocar service.

**Cascading:**
- Lint/grep rule (NFR-MAINT-2): `prisma.workplaceAllocation.create()` só pode ser chamado dentro de `workplace-allocation.service.ts`. Documentar em `CLAUDE.md` como princípio + adicionar test que detecta violações via análise estática.

---

### D4 — Plano de Migrations

**Decisão:** duas migrations Prisma separadas e independentes.

**V3.3 — Migration aditiva (release V3.3.0, deploy seguro):**
```sql
-- 1. Índice para matching determinístico em Workplace.name
CREATE INDEX workplaces_tenant_name_lower_idx
  ON workplaces (tenant_id, lower(name));

-- 2. Tabelas novas + enums
CREATE TYPE "ReconcileJobStatus" AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED');
CREATE TYPE "ReconcileQueueState" AS ENUM ('PENDING','DEFERRED','RESOLVED','IGNORED');
CREATE TABLE reconcile_jobs (...);
CREATE TABLE workplace_reconcile_queue (...);

-- 3. UNIQUE partial em workplace_allocations
CREATE UNIQUE INDEX workplace_allocations_unique_active_per_position
  ON workplace_allocations (employee_id, workplace_position_id)
  WHERE status = 'ACTIVE';

-- 4. Extension pg_trgm para fuzzy matching (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 5. Índice GIN trigram para fuzzy
CREATE INDEX workplaces_tenant_name_trgm_idx
  ON workplaces USING gin (tenant_id, name gin_trgm_ops);
```

**Características:**
- 100% aditiva — drop em rollback é trivial.
- `CREATE EXTENSION IF NOT EXISTS pg_trgm`: extension nativa Postgres (já disponível em PG 15), instalável sem privilégios especiais em containers oficiais.
- `IF NOT EXISTS` para tornar a migration idempotente em re-runs locais.

**V3.3.1 — Migration de constraint (release seguinte, depois do reconcile rodado em produção):**
```sql
-- Pré-condição validável (executada como step do deploy ou na migration via DO block):
DO $$
DECLARE
  outliers INT;
BEGIN
  SELECT COUNT(*) INTO outliers
  FROM employees
  WHERE status = 'ATIVO' AND workplace_id IS NULL;

  IF outliers > 0 THEN
    RAISE EXCEPTION 'V3.3.1 abortada: % colaboradores ATIVO sem workplace_id. Rode reconcile primeiro.', outliers;
  END IF;
END$$;

-- CHECK constraint condicional (status='ATIVO' exige workplace_id)
ALTER TABLE employees
  ADD CONSTRAINT employees_active_must_have_workplace
  CHECK (status != 'ATIVO' OR workplace_id IS NOT NULL);
```

**Por que CHECK e não NOT NULL absoluto?** O domínio permite `INATIVO`, `AFASTADO` e `FERIAS` sem posto vinculado (colaborador desligado, em licença, ou em férias coletivas sem destino atribuído). NOT NULL global quebraria esses cenários.

**Características:**
- Pré-condição validada **dentro** do DDL — deploy aborta cedo se inconsistência persiste.
- Reversível: `DROP CONSTRAINT` se algum cenário não previsto surgir.
- Não toca dados existentes — apenas adiciona invariante.

**Cascading:**
- V3.3.0 não inclui qualquer rename/drop do campo legado `Employee.workplace` (NFR-COMP-5, FR42).
- Phase 3 (V3.4) introduzirá rename → eventual drop em release ainda mais futura.

---

### D5 — Matcher Determinístico

**Decisão:** função pura `normalize()` em `reconcile/matchers/normalize.ts` aplicando, em ordem:

```typescript
export function normalize(s: string): string {
  return s
    .normalize('NFC')                  // NFC: combinar diacríticos canonicamente
    .toLowerCase()                     // case-insensitive
    .trim()                            // remove leading/trailing whitespace
    .replace(/\s+/g, ' ');             // collapse de whitespace múltiplo
}
```

**Matcher determinístico:**
```typescript
export class DeterministicMatcher {
  async match(tenantId: string, workplaceNameRaw: string): Promise<MatchResult> {
    const normalized = normalize(workplaceNameRaw);
    const candidates = await this.prisma.$queryRaw`
      SELECT id, name FROM workplaces
       WHERE tenant_id = ${tenantId}::uuid
         AND lower(name) = ${normalized}
       LIMIT 2
    `;
    if (candidates.length === 0) return { kind: 'none' };
    if (candidates.length === 1) return { kind: 'unique', workplace: candidates[0] };
    return { kind: 'ambiguous', candidates };  // 2+ matches exatos → fila
  }
}
```

**Rationale:**
- **NFC sobre NFD:** PT-BR usa caracteres pré-compostos comuns; NFC é o default de input do usuário e é o que o Postgres armazena.
- **`lower(name)` vs `LOWER(name)`:** o índice criado na D4 usa `lower(name)` lowercase — query bate no índice.
- **`LIMIT 2`:** não precisamos saber se há 5 candidatos ambíguos, só se há 0/1/2+.
- **Por que raw SQL e não Prisma `where: { name: { equals: x, mode: 'insensitive' }}`?** Prisma `mode: insensitive` usa `ILIKE` que NÃO bate no índice funcional `lower(name)` de forma garantida em todas as versões. SQL raw é determinístico e usa o índice.

---

### D6 — Matcher Fuzzy (sugestões)

**Decisão:** **`pg_trgm` (Postgres trigram) com query SQL raw**, não Levenshtein em JS.

```typescript
export class FuzzyMatcher {
  async suggest(tenantId: string, workplaceNameRaw: string, limit = 3): Promise<Suggestion[]> {
    const normalized = normalize(workplaceNameRaw);
    return this.prisma.$queryRaw<Suggestion[]>`
      SELECT id, name, similarity(name, ${normalized}) AS score
        FROM workplaces
       WHERE tenant_id = ${tenantId}::uuid
         AND name % ${normalized}                -- operator % usa o índice GIN trgm
       ORDER BY score DESC
       LIMIT ${limit}
    `;
  }
}
```

**Rationale:**
- **Performance:** índice GIN trgm criado na D4 transforma fuzzy de O(n) para O(log n). Para 200 workplaces × 500 employees, o ganho é marginal mas o padrão escala se o produto crescer.
- **Por que não Levenshtein JS?** Implementação correta de Levenshtein (com diacríticos PT-BR) é não-trivial; ranking ficaria preso no node process; bibliotecas como `fastest-levenshtein` puxam dependência adicional. `pg_trgm` é nativo, testado em produção há décadas, e o Postgres já está no stack.
- **Threshold default:** `pg_trgm` retorna `similarity` ∈ [0,1]. Operador `%` usa threshold global `pg_trgm.similarity_threshold` (default 0.3). Mantemos default; UI mostra score; usuário decide o corte.
- **Limit 3:** UI mostra top-3 sugestões — mais que isso vira ruído.

**Cascading:**
- Sugestões são persistidas como JSON em `WorkplaceReconcileQueue.suggestions` no momento do reconcile inicial (não recalculadas a cada abertura da fila — economia de query e estabilidade da UI).

---

### D7 — RBAC: Batch Super-Admin com Isolamento

**Decisão:** **loop de execuções single-tenant**, cada uma com client Prisma escopado por tenant via extension. Sem queries globais cruzando tenants.

**Implementação:**
```typescript
// reconcile.service.ts
async runBatch(tenantIds: string[] | 'all', operatorUserId: string): Promise<BatchResult> {
  const ids = tenantIds === 'all' ? await this.listAllTenants() : tenantIds;
  const batchParentId = uuid();
  const results = [];

  for (const tenantId of ids) {
    try {
      // Cada iteração abre client com tenant scope (Prisma extension é responsável)
      const tenantClient = this.prismaTenantFactory.forTenant(tenantId);
      const result = await this.runSingle({
        tenantId,
        operatorUserId,
        prisma: tenantClient,
        triggeredBy: 'SUPERADMIN_BATCH',
        batchParentId,
      });
      results.push({ tenantId, status: 'ok', ...result });
    } catch (err) {
      // FR29: falha em um tenant não cascata
      this.logger.error({ tenantId, err }, 'reconcile_batch_tenant_failed');
      results.push({ tenantId, status: 'failed', error: err.message });
    }
  }

  await this.audit.recordBatch({ batchParentId, operatorUserId, results });
  return { batchParentId, results };
}
```

**Rationale:**
- **`prismaTenantFactory.forTenant(tenantId)`:** ⚠️ **CORRIGIDO 2026-05-05 (spike Story 1.1):** o projeto NÃO POSSUI Prisma extension de tenant isolation (`backend-api/src/plugins/prisma.ts` apenas decora `fastify.prisma` com `PrismaClient` padrão). Tenant isolation é feito MANUALMENTE em cada query via `where: { tenantId }`. O helper `forTenant()` portanto **não impersona** — ele propaga `tenantId` explícito que cada service deve aceitar como input e usar em todas as queries. Em V3.3 Phase 1 (single-tenant), `tenantId` continua vindo do JWT em cada rota; em Phase 2 (Story 4.1), o helper valida tenant + retorna client (mesma instância) e o caller é responsável por filtrar por `tenantId`. Ver [spike-notes.md](../../implementation-artifacts/v3-3-reconciliacao-postos/spike-notes.md) seção 2.
- **Isolamento de falha (FR29):** try/catch por iteração. Resultado consolidado retornado ao frontend.
- **Sem transação global:** cada tenant tem seu próprio escopo transacional. Crash no meio do batch deixa N tenants reconciliados (consistentes individualmente) e M-N pendentes (recuperáveis em re-execução graças à idempotência D2).
- **Audit batch:** registra um log macro no nível super-admin (`MasterKeyLog`-equivalente, ou `AuditLog` com `action: 'V3.3_RECONCILE_BATCH'` e `resourceType: 'TENANT'` listando IDs em `newData`).

**Cascading:**
- Phase 1 NÃO inclui essa rota batch (PRD: \"reconcile super-admin batch\" está em Phase 2). Mas a arquitetura já contempla — D3 prevê `batch.ts` como rota separada e o schema D1 já tem `batchParentId`. Phase 1 entrega só `runSingle()`; Phase 2 ativa `runBatch()`.

---

### D8 — Comunicação de Progresso Real-Time

**Decisão:** **polling do endpoint `GET /v1/admin/reconcile/jobs/:id`** a cada 2 segundos a partir do frontend, com TanStack Query (`refetchInterval`).

**Backend:**
```typescript
// status.ts
fastify.get('/admin/reconcile/jobs/:id', async (req) => {
  const job = await prisma.reconcileJob.findFirst({
    where: { id: req.params.id, tenantId: req.jwt.tenantId },
  });
  return { data: { ...job, progressPct: job.totalEmployees ? Math.round((job.matched + job.queued + job.ignored) / job.totalEmployees * 100) : 0 } };
});
```

**Frontend:**
```typescript
const { data } = useQuery({
  queryKey: ['reconcile-job', jobId],
  queryFn: () => api.get(`/admin/reconcile/jobs/${jobId}`),
  refetchInterval: (q) => q.state.data?.data.status === 'RUNNING' ? 2000 : false,
});
```

**Rationale:**
- **SSE descartado:** Fastify suporta SSE mas não está em uso no projeto atual. Adicionar apenas para uma feature de progresso de job (que dura ≤5 min) introduz complexidade de conexão persistente, gestão de heartbeat, edge cases atrás de Traefik — não vale o ROI para 5min/operação que o operador acompanha sentado.
- **Polling 2s:** suficiente para operador ver progresso fluido; 150 requests por reconcile completo (5min × 30/min) é negligível para o backend.
- **Auto-stop:** `refetchInterval` retorna `false` quando status sai de `RUNNING` — para imediatamente.
- **TanStack Query já em uso** no projeto (per `frontend-web` config) — sem dependência nova.

**Cascading:**
- Endpoint de status precisa retornar progresso percentual computado server-side.
- UI consome `progressPct` direto, sem lógica de cálculo no client.
- Phase 2 pode trocar para SSE se outro caso de uso emergir e justificar a infra.

---

### Decision Impact Analysis

**Implementation Sequence (ordem proposta para implementação Phase 1):**

1. **Migration V3.3 aditiva** (`prisma migrate dev --name v3_3_reconcile`) — D1+D2+D4+D5+D6 dependem.
2. **`WorkplaceAllocationService.upsertFromImport()`** — único point-of-write, foundation de D2.
3. **Refactor `import-applier.ts`** para chamar o service — fix do importer Tirvu (FR20–FR25).
4. **Refactor rota import de Postos** — auto-criar `WorkplacePosition` padrão (FR26–FR27).
5. **`DeterministicMatcher` + `FuzzyMatcher` + `normalize()`** — D5+D6.
6. **`ReconcileQueueService`** + endpoints de fila (`/v1/admin/workplace-reconcile-queue/*`) — FR13–FR19.
7. **`ReconcileService` + `ReconcileRunner`** — D1+D7 (modo single-tenant primeiro).
8. **Rotas admin REST** (`POST /admin/reconcile`, `GET /admin/reconcile/jobs/:id`) — D7+D8.
9. **Frontend:** banner + modal de progresso + relatório + aba pendências — D8.
10. **Testes:** matcher, idempotência, importers, multi-tenant, integração.
11. **Job de purge LGPD 90d** (cron node-cron simples in-process) — FR17.

**Cross-Component Dependencies:**

- `WorkplaceAllocationService` → consumido por `import-applier`, `ReconcileService`, possivelmente UI manual (Phase 2).
- `normalize()` → usado por `DeterministicMatcher`, `FuzzyMatcher`, `WorkplaceAllocationService` (na auto-criação de Workplace para checar duplicatas via lower+normalized).
- `ReconcileJob` (record) → consumido por backend (status), frontend (polling D8), AuditLog (D1).
- Migration V3.3 → bloqueante para tudo. Se a migration não roda em produção, nada do resto funciona.
- Migration V3.3.1 (Phase 2) → depende de operador ter rodado reconcile em todos os tenants ATIVO.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Brownfield context:** a maioria dos patterns já está fixada pelo monorepo V3.0/V3.1/V3.2 e codificada no `CLAUDE.md`. Esta seção **referencia** os patterns existentes (não os redefine) e **acrescenta** apenas os V3.3-específicos. Identificados ~6 pontos de conflito potenciais entre agentes implementando este épico.

### Naming Patterns

**Database (já fixado pelo schema atual — manter):**
- Tabelas: `snake_case` plural (ex.: `workplace_allocations`, `reconcile_jobs`, `workplace_reconcile_queue`).
- Colunas: `snake_case` (ex.: `tenant_id`, `created_at`, `workplace_position_id`).
- Foreign keys: `<entidade>_id` (ex.: `employee_id`, `tenant_id`).
- Índices: `<table>_<columns>_<purpose>_idx` (ex.: `workplaces_tenant_name_lower_idx`, `reconcile_jobs_tenant_status_created_idx`).
- Enums Postgres: `PascalCase` (ex.: `ReconcileJobStatus`, `ReconcileQueueState`) — segue padrão `ImportJobStatus` existente.
- Mapeamento Prisma: model `PascalCase` ↔ table `snake_case` via `@@map`; field `camelCase` ↔ column `snake_case` via `@map`.

**API (já fixado pelo CLAUDE.md):**
- Rotas: `/api/v1/<recurso>` em **kebab-case** quando composto (ex.: `/api/v1/admin/reconcile`, `/api/v1/admin/workplace-reconcile-queue`).
- Recurso plural quando coleção (ex.: `/admin/reconcile/jobs/:id`); singular quando ação (ex.: `/admin/reconcile` para criar).
- Path parameters: `:id` (Fastify default).
- Query parameters: `camelCase` (ex.: `?tenantId=...&state=PENDING`).
- Headers customizados: `X-` prefix evitado; usar headers padrão JWT (`Authorization: Bearer <token>`).

**Code (já fixado por TypeScript convention + ESLint):**
- Arquivos backend: `kebab-case.ts` (ex.: `reconcile.service.ts`, `deterministic-matcher.ts`, `workplace-allocation.service.ts`).
- Arquivos frontend (componentes): `kebab-case.tsx` (ex.: `reconcile-banner.tsx`, `pending-bindings-tab.tsx`).
- Classes: `PascalCase` (ex.: `ReconcileService`, `DeterministicMatcher`).
- Funções/variáveis/métodos: `camelCase` (ex.: `upsertFromImport`, `runBatch`, `normalize`).
- Constantes globais: `SCREAMING_SNAKE_CASE` (ex.: `RECONCILE_BATCH_SIZE = 100`).
- Tipos/interfaces: `PascalCase` (ex.: `MatchResult`, `UpsertResult`, `BatchResult`).
- Discriminated unions: prop `kind` em string literal (ex.: `{ kind: 'unique' } | { kind: 'ambiguous' } | { kind: 'none' }`).

### Structure Patterns

**Já fixado — reusar:**
- Backend: `src/modules/<domain>/` por domínio (não por camada). Reconcile vira `src/modules/reconcile/`. Service compartilhado fica em `src/modules/workplaces/`.
- Backend rotas: `src/routes/api/v1/<recurso>/index.ts` com autoload Fastify.
- Backend testes: co-located `*.test.ts` ao lado do arquivo testado **OU** em `__tests__/` no módulo. Manter o padrão usado pelo módulo `imports/` atual (verificar e replicar).
- Frontend: `src/app/<rota>/page.tsx` (Next.js App Router); componentes específicos da rota em `src/app/<rota>/components/`; componentes shared em `src/components/`.
- Migrations Prisma: `prisma/migrations/<timestamp>_<snake_case_description>/migration.sql`.

**V3.3-específico:**
- Submódulo `reconcile/matchers/` agrupa matcher determinístico, matcher fuzzy e função pura `normalize.ts`. Toda lógica de matching mora aqui — fora desse subdiretório, ninguém implementa matching de workplace name.
- Tipos compartilhados de reconcile em `reconcile/reconcile.types.ts` (`MatchResult`, `UpsertResult`, `BatchResult`, etc.) — importadores externos sempre puxam dali, nunca redeclaram.

### Format Patterns

**API Responses (já fixado pelo CLAUDE.md — manter):**
```json
// Sucesso
{ "data": { ... }, "error": null, "meta": { "ts": "2026-05-04T...", "requestId": "..." } }

// Erro
{ "data": null, "error": { "code": "RECONCILE_AMBIGUOUS_MATCH", "message": "...", "details": {...} } }

// Lista
{ "data": [...], "error": null, "meta": { "total": 42, "page": 1, "pageSize": 20 } }
```

**Error codes V3.3 (PascalCase em CONSTANT_CASE no payload):**
- `RECONCILE_TENANT_BUSY` — já existe job RUNNING para esse tenant.
- `RECONCILE_NOT_FOUND` — jobId inválido.
- `RECONCILE_QUEUE_ITEM_INVALID_STATE` — tentativa de resolver item em estado RESOLVED/IGNORED.
- `RECONCILE_FORBIDDEN_CROSS_TENANT` — ADMIN tentou operar em tenant alheio.
- `WORKPLACE_AMBIGUOUS_AUTO_CREATE` — auto-criação detectou colisão por normalização.

**Data Formats:**
- Datas em JSON: ISO 8601 strings UTC (ex.: `"2026-05-04T18:30:00.000Z"`). Frontend converte para timezone local na renderização.
- Booleanos: `true`/`false` (nunca `1`/`0`).
- Null vs ausente: campos opcionais que vieram NULL do banco são serializados como `null` (não omitidos).
- UUIDs: strings (sem prefixos, sem braces).
- Decimais (Prisma `Decimal`): serializados como string (`"1234.56"`) para evitar perda de precisão JS — convenção atual do projeto.

### Communication Patterns

**Logs estruturados (pino + JSON, já em uso):**
```typescript
logger.info({
  module: 'reconcile',
  event: 'batch_completed',
  tenantId,
  jobId,
  batchSize: 100,
  matched: 87,
  queued: 11,
  ignored: 2,
  errors: 0,
  durationMs: 187,
}, 'reconcile_batch_completed');
```

**Regra dura:** logs nunca contêm `name`, `cpf`, `email`, `phone`, `personalData`, `bank*` (NFR-SEC-4 + LGPD).

**AuditLog action enum (PascalCase + namespace):**
- `V3.3_RECONCILE` — reconcile criou allocation.
- `V3.3_RECONCILE_BATCH` — super-admin disparou batch.
- `IMPORT_TIRVU_ALLOCATE` — importer Tirvu criou/encerrou allocation.
- `RECONCILE_QUEUE_RESOLVE` — operador resolveu item da fila.
- `RECONCILE_QUEUE_DEFER` — operador adiou item.
- `RECONCILE_QUEUE_IGNORE` — operador ignorou item.

**Estado no frontend (TanStack Query, já em uso):**
- Query keys hierárquicas: `['reconcile-job', jobId]`, `['workplace-reconcile-queue', { tenantId, state }]`.
- Mutações sempre invalidam query keys relevantes (`queryClient.invalidateQueries`).
- `refetchInterval` controla polling (D8); nunca `setInterval` manual.
- Loading e error states sempre extraídos do hook (`isLoading`, `error`), nunca controlados manualmente.

### Process Patterns

**Error Handling (backend):**
- Service throws domain errors tipados (`ReconcileTenantBusyError`, `WorkplaceAmbiguousError`).
- Rota catura erros conhecidos e mapeia para HTTP status + payload `{ error: { code, message } }`.
- Erros não-tratados → 500 + `{ error: { code: 'INTERNAL_ERROR' } }` + log com stack completo (mas sem PII).
- `try/catch` em loops de batch (D7) — falha individual não cascata.

**Error Handling (frontend):**
- Erros de API mostrados via toast (shadcn `useToast`) — nunca `alert()` ou erro silencioso.
- Erros de rede com retry automático limitado (TanStack Query default: 3 tentativas exponenciais).
- Erros 403/401 redirecionam para login (interceptor já existente).

**Loading States:**
- Backend long-running: estado em `ReconcileJob.status` (`PENDING → RUNNING → COMPLETED|FAILED`).
- Frontend long-running: skeleton UI durante carregamento inicial; `progressPct` em barra durante execução; relatório-resumo em modal ao final.
- Curto (<500ms): spinner inline em botão (ex.: \"Vincular\" durante mutação).

**Idempotência (regra V3.3):**
- Toda gravação de `WorkplaceAllocation` originada de import OU reconcile **deve** passar por `WorkplaceAllocationService.upsertFromImport()`.
- Toda resolução de item da fila deve checar `state` antes de aplicar — re-clique não duplica auditoria nem altera allocation já criada.

**Transações:**
- Default: 1 transação por employee no batch (D2).
- Batch size: `RECONCILE_BATCH_SIZE = 100` employees por iteração de loop, sem transação envolvendo o loop inteiro.
- Timeout Prisma de transação: default Prisma (5s) — se exceder, log de warning + skip + queue para retry.

### Enforcement Guidelines

**All AI Agents MUST:**

1. **Não criar `WorkplaceAllocation` fora de `WorkplaceAllocationService.upsertFromImport()`** — exceto em testes que validam o próprio service. Validável por `grep -r 'prisma\\.workplaceAllocation\\.create' src/` que deve retornar apenas o service e seus testes.
2. **Não usar `prisma.$queryRaw` cross-tenant** — todo raw SQL precisa carregar `tenant_id = ${tenantId}::uuid` no WHERE.
3. **Não criar logs com PII** — nome, CPF, email, telefone, dados bancários ou `personalData` nunca aparecem em log structured. Usar IDs.
4. **Não fazer DELETE em `WorkplaceAllocation`** — sempre `UPDATE status='ENDED', endDate=now()` (NFR-COMP-2). Validável por `grep -r 'workplaceAllocation\\.delete'` que deve retornar zero.
5. **Não modificar campo legado `Employee.workplace`** sem também atualizar `Employee.workplaceId` e criar/encerrar `WorkplaceAllocation` — gravar string sozinho perpetua o bug que V3.3 está resolvendo.
6. **Não bypassar a Prisma extension de tenant isolation** — exceto via helper explícito `prismaTenantFactory.forTenant()` em rota super-admin.
7. **Sempre incrementar contadores no `ReconcileJob`** ao processar cada employee — UI depende para `progressPct`.
8. **Sempre normalizar nome de workplace antes de comparar** — usar `normalize()` da `reconcile/matchers/normalize.ts`. Comparações ad-hoc (`name.toLowerCase() === ...`) são proibidas porque saltam NFC e collapse.
9. **Sempre incluir `module` e `event` em logs estruturados** — facilita filtragem em Grafana.
10. **Sempre usar discriminated unions** para resultados de matcher e service (`{ kind: '...' }`).

**Pattern Enforcement:**
- Code review humano (Bruno) é o gate.
- Testes automatizados validam invariantes-chave: idempotência, isolamento, ausência de DELETE em allocation.
- Lint custom (futuro, Phase 2): regra ESLint que detecta `prisma.workplaceAllocation.create()` fora do service.

### Pattern Examples

**Good:**
```typescript
// Service único de gravação (D2 + D3 + Enforcement #1)
const result = await this.allocationService.upsertFromImport({
  tenantId,
  employeeId,
  workplacePositionId,
  startDate: employee.hireDate,                    // CLT (NFR-COMP-1)
  source: 'IMPORT_TIRVU_ALLOCATE',                 // AuditLog action
});

// Match com normalize (Enforcement #8)
const normalized = normalize(employee.workplace);  // NFC + lower + trim + collapse
const match = await this.deterministicMatcher.match(tenantId, employee.workplace);

// Log sem PII (Enforcement #3)
logger.info({
  module: 'reconcile',
  event: 'employee_matched',
  tenantId,
  employeeId,                                      // ID, não nome
  workplaceId: match.workplace.id,
  matchKind: 'unique',
}, 'reconcile_employee_matched');
```

**Anti-patterns:**
```typescript
// ❌ Gravação direta — viola Enforcement #1
await prisma.workplaceAllocation.create({ data: {...} });

// ❌ DELETE em allocation — viola NFR-COMP-2 + Enforcement #4
await prisma.workplaceAllocation.delete({ where: { id } });

// ❌ Match sem normalização — viola Enforcement #8
if (employee.workplace.toLowerCase() === workplace.name.toLowerCase()) { ... }

// ❌ Log com PII — viola Enforcement #3
logger.info(`Reconciliando ${employee.name} (${employee.cpf})`);

// ❌ Update só no campo legado — viola Enforcement #5
await prisma.employee.update({
  where: { id }, data: { workplace: 'INEP - Sede' }
});
```

## Project Structure & Boundaries

### Complete Project Directory Structure (delta V3.3)

> **Brownfield:** apresento apenas o **delta** sobre a árvore existente. Diretórios não listados permanecem inalterados (exceto onde indicado por ♻️ REFATORAR).

```
gestao-ferias/
├── backend-api/
│   ├── prisma/
│   │   ├── schema.prisma                                       ♻️ adicionar models ReconcileJob, WorkplaceReconcileQueue, enums; opcional: index inline (também aplicado via migration SQL custom)
│   │   └── migrations/
│   │       ├── <ts>_v3_3_reconcile/                            ✨ NOVO — migration aditiva D4
│   │       │   └── migration.sql                                  -- índice lower(name), tabelas, UNIQUE partial, pg_trgm, GIN trgm
│   │       └── <ts>_v3_3_1_workplace_id_required_active/        ✨ NOVO (Phase 2) — pré-condição + CHECK constraint
│   │           └── migration.sql
│   ├── src/
│   │   ├── modules/
│   │   │   ├── workplaces/
│   │   │   │   ├── workplace-allocation.service.ts             ✨ NOVO — único point-of-write
│   │   │   │   └── workplace-allocation.service.test.ts        ✨ NOVO
│   │   │   ├── reconcile/                                      ✨ NOVO MODULE
│   │   │   │   ├── reconcile.service.ts
│   │   │   │   ├── reconcile.service.test.ts
│   │   │   │   ├── reconcile.runner.ts
│   │   │   │   ├── reconcile.runner.test.ts
│   │   │   │   ├── reconcile.types.ts                            -- MatchResult, UpsertResult, BatchResult, ProgressSnapshot
│   │   │   │   ├── matchers/
│   │   │   │   │   ├── normalize.ts
│   │   │   │   │   ├── normalize.test.ts
│   │   │   │   │   ├── deterministic-matcher.ts
│   │   │   │   │   ├── deterministic-matcher.test.ts
│   │   │   │   │   ├── fuzzy-matcher.ts
│   │   │   │   │   └── fuzzy-matcher.test.ts
│   │   │   │   ├── reconcile-queue.service.ts
│   │   │   │   ├── reconcile-queue.service.test.ts
│   │   │   │   ├── reconcile-queue.purge.ts                      -- LGPD 90d (cron in-process)
│   │   │   │   └── reconcile-queue.purge.test.ts
│   │   │   ├── imports/
│   │   │   │   ├── import-applier.ts                           ♻️ REFATORAR — chamar WorkplaceAllocationService.upsertFromImport()
│   │   │   │   ├── import-applier.test.ts                      ♻️ acrescentar casos: cria allocation, encerra na transição, idempotência
│   │   │   │   ├── import-matcher.ts                           ♻️ REFATORAR — não escreve allocation; apenas resolve workplaceId
│   │   │   │   └── import-validator.ts                         (sem mudança)
│   │   │   └── shared/
│   │   │       └── prisma-tenant-factory.ts                    ✨ NOVO ou ♻️ EXPANDIR — helper forTenant(tenantId) usado pelo batch
│   │   ├── routes/
│   │   │   └── api/v1/
│   │   │       ├── admin/
│   │   │       │   ├── reconcile/
│   │   │       │   │   ├── index.ts                            ✨ NOVO — POST /v1/admin/reconcile (single ADMIN+)
│   │   │       │   │   ├── batch.ts                            ✨ NOVO (Phase 2) — POST /v1/admin/reconcile/batch (SUPERADMIN)
│   │   │       │   │   └── status.ts                           ✨ NOVO — GET /v1/admin/reconcile/jobs/:id
│   │   │       │   └── workplace-reconcile-queue/
│   │   │       │       ├── index.ts                            ✨ NOVO — GET list (com filtros tenantId, state, jobId)
│   │   │       │       ├── resolve.ts                          ✨ NOVO — POST /:id/resolve (vincular | criar | ignorar | adiar)
│   │   │       │       └── resolve.test.ts                     ✨ NOVO
│   │   │       └── workplaces/
│   │   │           └── index.ts                                ♻️ REFATORAR — auto-cria WorkplacePosition padrão quando planilha não traz positionRole; opcional banner-status endpoint para frontend
│   │   └── plugins/                                            (sem mudança — usar Prisma extension existente)
│   └── package.json                                            (sem mudança — pg_trgm é extension Postgres, não pacote npm)
└── frontend-web/
    └── src/
        ├── app/
        │   ├── workplaces/
        │   │   ├── page.tsx                                    ♻️ REFATORAR — adiciona banner condicional + tab "Pendências de Vínculo"
        │   │   └── components/
        │   │       ├── reconcile-banner.tsx                    ✨ NOVO
        │   │       ├── reconcile-progress-modal.tsx            ✨ NOVO — polling D8 via TanStack Query
        │   │       ├── reconcile-summary-report.tsx            ✨ NOVO
        │   │       ├── pending-bindings-tab.tsx                ✨ NOVO — fila + ações resolve
        │   │       └── pending-binding-row.tsx                 ✨ NOVO — linha com sugestões fuzzy + 3 ações
        │   └── admin/
        │       └── reconcile/
        │           └── page.tsx                                ✨ NOVO (Phase 2) — card super-admin batch
        ├── hooks/
        │   ├── use-reconcile-job.ts                            ✨ NOVO — wraps useQuery com refetchInterval D8
        │   └── use-pending-bindings.ts                         ✨ NOVO — useQuery + mutations para ações
        └── lib/
            └── api/
                └── reconcile.ts                                ✨ NOVO — client functions para todos endpoints reconcile
```

**Legenda:** ✨ NOVO · ♻️ REFATORAR · sem marcação = inalterado.

**Total deltas Phase 1:**
- 23 arquivos novos no backend (services, matchers, queue, rotas, testes).
- 4 arquivos backend refatorados.
- 1 migration nova (Phase 1) + 1 migration nova (Phase 2 deferred).
- 11 arquivos novos no frontend (componentes, hooks, lib).
- 2 arquivos frontend refatorados.

### Architectural Boundaries

**API Boundaries:**
- **Públicos (autenticados, ADMIN+):** `POST /v1/admin/reconcile`, `GET /v1/admin/reconcile/jobs/:id`, `GET /v1/admin/workplace-reconcile-queue`, `POST /v1/admin/workplace-reconcile-queue/:id/resolve`.
- **Públicos (autenticados, SUPERADMIN):** `POST /v1/admin/reconcile/batch` (Phase 2).
- **Internos (não expostos):** `WorkplaceAllocationService` (consumido por importer Tirvu, importer Postos, ReconcileService).
- **Existentes inalterados:** `/v1/coverage/*`, `/v1/predict/*`, `/v1/employees/*`, `/v1/imports/*` (importer Tirvu mantém endpoint, só muda comportamento interno), webhooks, `/employee/*` (PWA).

**Component Boundaries (Frontend):**
- `reconcile-banner` consome `use-reconcile-job` (estado pendente do tenant).
- `reconcile-progress-modal` consome `use-reconcile-job` (polling).
- `pending-bindings-tab` consome `use-pending-bindings` (lista) + mutations (resolver/criar/ignorar/adiar).
- `reconcile-summary-report` recebe data via props (não fetch próprio).
- `pending-binding-row` é apresentacional puro — recebe item + handlers via props.

**Service Boundaries (Backend):**
- `WorkplaceAllocationService` é **singleton scoped por request Fastify** (instanciado pelo plugin Prisma). Recebe `tenantId` no método, não no construtor — isso permite reuso pelo batch super-admin sem instanciação por tenant.
- `ReconcileService` orquestra mas não persiste diretamente — delega tudo para `WorkplaceAllocationService` e `ReconcileQueueService`.
- `ReconcileRunner` é stateful por execução (mantém contadores em memória do batch atual) e síncrono in-process. **NÃO** roda em BullMQ no Phase 1.
- `DeterministicMatcher` e `FuzzyMatcher` são puros — recebem `prismaClient` no construtor, não fazem cache, são thread-safe.
- `ReconcileQueueService` encapsula CRUD da `WorkplaceReconcileQueue` — todas as mutations passam por aqui (auditoria centralizada).

**Data Boundaries:**
- Tabelas novas (`reconcile_jobs`, `workplace_reconcile_queue`) **só** são lidas/escritas por código em `src/modules/reconcile/`.
- Tabela `workplace_allocations` só é escrita por `src/modules/workplaces/workplace-allocation.service.ts` (Enforcement #1). Leitura é livre.
- Tabela `employees`: campo `workplaceId` só é escrito por `WorkplaceAllocationService` (junto com criação de allocation). Campo legado `workplace` continua sendo lido livremente até V3.4.
- AuditLog: centralizado, escrita via helper `audit.record()` (já existente).

### Requirements to Structure Mapping

**Por área de FR → arquivo principal:**

| Área (PRD) | FRs | Arquivo principal |
|---|---|---|
| Reconciliation Engine | FR1–FR7 | `reconcile/reconcile.service.ts` + `reconcile.runner.ts` |
| Matching & Disambiguation | FR8–FR12 | `reconcile/matchers/{normalize,deterministic-matcher,fuzzy-matcher}.ts` |
| Review Queue Management | FR13–FR19 | `reconcile/reconcile-queue.service.ts` + `routes/.../workplace-reconcile-queue/*` + `reconcile-queue.purge.ts` |
| Importer Integration (Tirvu) | FR20–FR25 | `imports/import-applier.ts` (refactor) chamando `workplaces/workplace-allocation.service.ts` |
| Importer Integration (Postos) | FR26–FR27 | `routes/api/v1/workplaces/index.ts` (refactor) |
| Multi-tenant & RBAC | FR28–FR31 | Plugin auth existente + `routes/.../admin/reconcile/*.ts` (verifica role) + `shared/prisma-tenant-factory.ts` |
| Workplace Visibility (UI) | FR32–FR35 | `frontend/.../workplaces/components/{reconcile-banner,reconcile-progress-modal,reconcile-summary-report,pending-bindings-tab}.tsx` |
| Audit & Telemetry | FR36–FR39 | helper `audit.record()` (existente) chamado por todos os services + logger pino estruturado |
| Migration & Schema Evolution | FR40–FR42 | `prisma/migrations/<ts>_v3_3_reconcile/`, `<ts>_v3_3_1_workplace_id_required_active/` |
| Compatibility | FR43–FR45 | **Zero código novo** — verificado via testes que validam que `CoverageEngine`, `PromptBuilder`, etc. continuam funcionando após reconcile popular dados. |

**Cross-cutting concerns mapeados:**
- **Tenant isolation:** Prisma extension (`backend-api/src/plugins/prisma.ts` ou similar — verificar nome no projeto) + helper `prisma-tenant-factory.ts` para batch.
- **Idempotência:** UNIQUE partial em migration + `WorkplaceAllocationService.upsertFromImport()` + check de `state` em `ReconcileQueueService.resolve()`.
- **Auditoria:** helper `audit.record()` chamado em 4 pontos (criar allocation, encerrar allocation, resolver fila, executar batch).
- **Observabilidade:** `logger.info({ module, event, ... })` estruturado em runner, matchers, queue service e rotas.
- **LGPD:** purge cron em `reconcile-queue.purge.ts`; logs sem PII (regra de lint manual + code review).
- **CLT:** `WorkplaceAllocationService.upsertFromImport()` exige `startDate` no input — chamadores usam `Employee.hireDate`.

### Integration Points

**Internal Communication:**
- Síncrona via injection: rota → service → repository (Prisma). Sem event bus interno.
- `ReconcileRunner` chama `WorkplaceAllocationService` em loop dentro do mesmo processo Node — sem networking.
- Frontend ↔ Backend: REST/JSON via TanStack Query. Sem WebSocket/SSE em V3.3 (D8).

**External Integrations:**
- **Banco Postgres:** primary store, multi-tenant, com pg_trgm.
- **Redis:** **NÃO** consumido pelo reconcile em Phase 1 (runner in-process). Reservado para Phase 2 se BullMQ for adotado.
- **ZapSign / Evolution / SMTP:** **não tocados** (NFR-SEC-8).

**Data Flow:**

```
[1] Reconcile inicial (Jornada 1A):
ADMIN clica "Iniciar reconciliação"
  → POST /v1/admin/reconcile
    → ReconcileService.runSingle({ tenantId, operatorUserId })
      → cria ReconcileJob (status=PENDING)
      → ReconcileRunner.run(job):
          - lê batch de Employees (where: workplace IS NOT NULL, workplaceId IS NULL, status != 'INATIVO')
          - para cada Employee:
              - DeterministicMatcher.match(tenantId, employee.workplace)
              - se kind=='unique':
                  → WorkplaceAllocationService.upsertFromImport({ ..., source: 'V3.3_RECONCILE' })
                  → audit.record + incrementar matched
              - se kind=='ambiguous' || kind=='none':
                  → FuzzyMatcher.suggest(...)
                  → ReconcileQueueService.enqueue({ ..., suggestions })
                  → incrementar queued
          - atualiza ReconcileJob.matched/queued/ignored a cada batch
      → marca ReconcileJob.status=COMPLETED
  ← retorna { jobId } para frontend
Frontend abre ReconcileProgressModal:
  → useReconcileJob(jobId) faz polling 2s
  → ao ver status=COMPLETED, exibe ReconcileSummaryReport
  → operador navega para PendingBindingsTab para resolver os queued

[2] Import Tirvu (Jornada 1B):
ADMIN sobe planilha → ImportJob existente (PARSING → PREVIEW_READY → APPLYING)
  → ImportApplier (refatorado):
      - para cada employee row:
          - resolve Workplace (lookup + auto-cria se novo)
          - garante WorkplacePosition padrão se workplace recém-criado
          - WorkplaceAllocationService.upsertFromImport({ ..., source: 'IMPORT_TIRVU_ALLOCATE' })
          - incrementa ImportJob.previewSummary.allocationsCreated/Closed/etc.

[3] Resolução de fila (Jornada 1C):
ADMIN abre PendingBindingsTab → seleciona ação
  → POST /v1/admin/workplace-reconcile-queue/:id/resolve
    → ReconcileQueueService.resolve({ id, action, workplaceId? }):
        - valida state (PENDING/DEFERRED) — Enforcement idempotência
        - se action=='link': WorkplaceAllocationService.upsertFromImport({ ..., source: 'RECONCILE_QUEUE_RESOLVE' })
        - se action=='create': cria Workplace + WorkplacePosition padrão + upsertFromImport
        - se action=='ignore' | 'defer': atualiza queue.state, sem allocation
        - audit.record
```

### File Organization Patterns

**Configuration files** (existentes, sem mudança): `backend-api/.env`, `frontend-web/.env.local`, `docker-compose.yml`, `package.json` em cada workspace, `tsconfig.json`, `prisma/schema.prisma`.

**Source organization:** modular por domínio em `src/modules/`; rotas declarativas em `src/routes/api/v1/`; plugins Fastify em `src/plugins/`. Frontend Next.js App Router por rota em `src/app/`; componentes específicos da rota em `src/app/<rota>/components/`; shared UI primitives (shadcn) em `src/components/ui/`.

**Test organization:** ⚠️ **CORRIGIDO 2026-05-05 (spike Story 1.1):** o projeto centraliza testes em `backend-api/test/<categoria>/*.test.ts`, NÃO co-located. Categorias atuais: `modules/`, `plugins/`, `routes/`. Para V3.3, criar `backend-api/test/modules/reconcile/<arquivo>.test.ts` para serviços/matchers/queue/runner; `backend-api/test/modules/workplace-allocation.service.test.ts` para o service compartilhado; `backend-api/test/routes/admin-reconcile.test.ts` (e similares) para integração de rotas. Ver [spike-notes.md](../../implementation-artifacts/v3-3-reconciliacao-postos/spike-notes.md) seção 1.

**Asset organization:** sem novos assets em V3.3 (UI usa shadcn primitives e ícones lucide-react já no projeto).

### Development Workflow Integration

**Development server structure:**
- `docker-compose up --build` sobe postgres + redis + backend (porta 3000) + frontend (porta 3001).
- Reconcile job roda **in-process** no backend container — nada extra para subir em dev.
- Cron de purge LGPD: ativado em produção via env flag (`RECONCILE_QUEUE_PURGE_ENABLED=true`); off em dev por default para não poluir logs.
- Memória do projeto: rebuild automático do container backend após mudança em `backend-api/src/` ou `prisma/`.

**Build process structure:**
- Backend: `npm run build` em `backend-api/` (TypeScript → `dist/`).
- Frontend: `npm run build` em `frontend-web/` (Next.js → `.next/`).
- Migration Prisma: `npx prisma migrate deploy` em produção (parte do entrypoint do container backend).

**Deployment structure:**
- Stack Docker Swarm na VPS deploya containers atualizados via Portainer + Traefik.
- Migration V3.3 roda no startup do container backend (idempotente, não bloqueante para containers já vivos com versão anterior — Postgres aceita aditivo concorrente).
- V3.3.0 deploy: aditivo, sem rollback complexo.
- V3.3.1 deploy (Phase 2): pré-condição validada no DDL; se falhar, deploy aborta sem afetar produção viva (container atual continua respondendo).

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** as 8 decisões D1–D8 são internamente consistentes:
- D1 (queue dedicada) suporta D7 (batch isolado) — `batchParentId` opcional em `ReconcileJob` permite agrupar execuções sem misturar dados.
- D2 (UNIQUE partial + check aplicacional) é compatível com D5/D6 (matchers só leem; gravação centralizada via service).
- D3 (estrutura modular) habilita D2 (Enforcement #1 só faz sentido com service único).
- D4 (migration aditiva) viabiliza D2 (UNIQUE partial é parte da migration) e D6 (pg_trgm + GIN trgm também).
- D7 (batch via `prismaTenantFactory`) respeita Prisma extension existente — não bypassa, apenas impersona em contexto super-admin.
- D8 (polling) é compatível com D1 (status no `ReconcileJob` record).

**Pattern Consistency:** patterns do step 5 reforçam decisões do step 4:
- Naming `kebab-case` para arquivos + `PascalCase` para classes alinhado com codebase atual.
- Format `{ data, error, meta }` consistente com CLAUDE.md.
- 6 AuditLog action enum values (step 5) cobrem 4 pontos de write (step 6).
- 10 Enforcement Guidelines codificam invariantes das 8 decisões em regras checáveis.

**Structure Alignment:** árvore do step 6 instancia exatamente o que os steps 4–5 prescrevem:
- `reconcile/matchers/` agrupa D5+D6.
- `workplaces/workplace-allocation.service.ts` no domínio Workplace (não em reconcile/) — coerente com D3 e Enforcement #1.
- Rotas em `routes/api/v1/admin/{reconcile,workplace-reconcile-queue}/` separadas reflete D1 (jobs e queue como recursos REST distintos).
- Frontend isola componentes V3.3 em `workplaces/components/` e `admin/reconcile/page.tsx` — reusa shadcn/ui sem invadir outros domínios.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage (45 FRs):**

| Área | FRs | Cobertura arquitetural |
|---|---|---|
| Reconciliation Engine (FR1–FR7) | 7/7 ✅ | `ReconcileService.runSingle` + `ReconcileRunner` + `ReconcileJob` com state machine + relatório via endpoint status |
| Matching & Disambiguation (FR8–FR12) | 5/5 ✅ | `normalize()` + `DeterministicMatcher` + `FuzzyMatcher` (pg_trgm) — D5 e D6 |
| Review Queue Management (FR13–FR19) | 7/7 ✅ | `WorkplaceReconcileQueue` model + `ReconcileQueueService` + endpoints + UI tab + purge cron |
| Importer Integration Tirvu (FR20–FR25) | 6/6 ✅ | Refactor `import-applier.ts` chamando `WorkplaceAllocationService` + auto-criação de Workplace + delta no `previewSummary` |
| Importer Integration Postos (FR26–FR27) | 2/2 ✅ | Refactor rota workplaces para auto-criar `WorkplacePosition` padrão |
| Multi-tenant & RBAC (FR28–FR31) | 4/4 ✅ | JWT obrigatório + `prismaTenantFactory` para batch + RBAC matrix do PRD codificada nas rotas |
| Workplace Visibility UI (FR32–FR35) | 4/4 ✅ | Banner + modal de progresso (polling D8) + relatório-resumo + tab fila |
| Audit & Telemetry (FR36–FR39) | 4/4 ✅ | 6 AuditLog action enum values + logger pino estruturado sem PII |
| Migration & Schema (FR40–FR42) | 3/3 ✅ | V3.3 aditiva + V3.3.1 separada com pré-condição + campo legado preservado |
| Compatibility (FR43–FR45) | 3/3 ✅ | Zero alteração em CoverageEngine, PromptBuilder, webhooks, PWA — verificável por diff |

**Cobertura total:** 45/45 FRs ✅

**Non-Functional Requirements Coverage (31 NFRs):**

| Categoria | NFRs | Cobertura |
|---|---|---|
| Performance | 6/6 ✅ | Batch ≤200ms (D2 transações curtas), reconcile ≤5min (D7 in-process), matching ≤5ms (D5 índice lower(name)), `/workplaces` ≤1.5s (UI já otimizada V3.0) |
| Security | 8/8 ✅ | JWT ADMIN+ (rotas), tenantId via JWT (D7), Prisma extension não bypass-ada (helper explícito), rate limit (Fastify plugin existente), logs sem PII (Enforcement #3) |
| Reliability | 6/6 ✅ | Idempotência (D2 dupla camada), isolamento entre tenants (D7 try/catch), migration reversível (D4 aditiva), crash-safe (transações curtas) |
| Compliance | 6/6 ✅ | CLT (`hireDate` em `upsertFromImport`), correção sem DELETE (encerrar+criar), LGPD purge cron 90d, fila sem PII, campo legado preservado |
| Maintainability | 5/5 ✅ | ≥85% cobertura (testes co-located em todos os módulos novos), service único point-of-write (Enforcement #1), regras documentadas em CLAUDE.md (passo de implementação), Docker rebuild policy (memória) |
| Observability | 5/5 ✅ | Logs JSON estruturados (D7+step5), métricas exportáveis (estrutura preparada — confirmar com Carla), polling progresso (D8), sinalização de higiene (banner + workplaces com `importedBy='AUTO_*'`) |

**Cobertura total:** 31/31 NFRs ✅

### Implementation Readiness Validation ✅

**Decision Completeness:** as 8 decisões críticas têm:
- Schema concreto (D1) — DDL completo.
- Código exemplar (D2, D5, D6, D7, D8) — TypeScript real, não pseudocódigo.
- Estrutura de arquivos (D3) — paths absolutos no monorepo.
- Plano de migration (D4) — SQL completo das 2 fases.

**Structure Completeness:** árvore do step 6 lista 23 arquivos backend + 11 frontend + 2 migrations com indicação clara NOVO/REFATORAR. Nenhum placeholder genérico.

**Pattern Completeness:**
- 10 Enforcement Guidelines cobrem todos os pontos de conflito potenciais identificados (gravação, DELETE, PII, normalização, tenant bypass, etc.).
- Bons exemplos e anti-patterns concretos.
- Naming, format, communication, process — todos especificados.

### Gap Analysis Results

**Critical Gaps:** nenhum. Todas as 8 decisões críticas estão resolvidas com código exemplar.

**Important Gaps (a confirmar durante implementação, não bloqueantes):**

1. **Nome exato da Prisma extension de tenant isolation** — referenciado como \"Prisma extension\" no PRD/arquitetura, mas o caminho real do arquivo (`backend-api/src/plugins/prisma.ts` ou similar) precisa ser localizado pelo dev na primeira story para confirmar a interface de `forTenant(tenantId)`. **Mitigação:** primeira story do épico inclui spike de 30min para mapear; se a interface atual não suporta impersonação, expandir extension faz parte da story.

2. **Stack de observabilidade da VPS** — NFR-OBS-2 menciona Grafana/Prometheus mas não há confirmação que está deployado. **Mitigação:** confirmar com Bruno/Carla na primeira story; se ausente, logs JSON pino são suficientes para Phase 1 (métricas viram Phase 2).

3. **Convenção de testes co-located vs `__tests__/`** — código atual de `imports/` precisa ser inspecionado para replicar fielmente. **Mitigação:** dev verifica antes de criar primeiro `*.test.ts` do módulo `reconcile/`.

4. **Rate limit existente em rotas admin** — CLAUDE.md menciona rate limiting mas implementação atual não foi inspecionada. NFR-SEC-6 (10/h por user) pode reusar middleware existente ou exigir custom config. **Mitigação:** dev verifica plugin Fastify atual; se for `fastify-rate-limit`, configurar `keyGenerator` por userId em rota admin/reconcile.

**Nice-to-Have Gaps:**

5. **Documentação ADR (Architecture Decision Record)** das 8 decisões em `docs/adr/` — não é obrigatório para Phase 1, mas valoriza retrospectiva e onboarding futuro.
6. **Diagrama de fluxo visual** (mermaid) do data flow [1] [2] [3] do step 6 — o texto é explícito, mas diagrama acelera leitura.
7. **Lint custom (ESLint rule)** validando Enforcement #1 e #4 — manualmente checável por grep, automatização seria Phase 2.

### Validation Issues Addressed

Todos os 4 important gaps acima são spikes de descoberta (≤30min cada) durante a primeira story, não retrabalho arquitetural. Não há issue crítico que adie implementação.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (Step 2)
- [x] Scale and complexity assessed — medium-high, ~7 componentes novos + 2 refatorações
- [x] Technical constraints identified (stack fixado, regras CLAUDE.md, restrições Bruno)
- [x] Cross-cutting concerns mapped (7 transversais)

**✅ Architectural Decisions**
- [x] 8 critical decisions documented com código exemplar
- [x] Technology stack fully specified (reusa V3.0/V3.1/V3.2 + adiciona pg_trgm)
- [x] Integration patterns defined (data flow [1][2][3])
- [x] Performance considerations addressed (batch size, índices, polling 2s)

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified (logs, AuditLog, TanStack Query)
- [x] Process patterns documented (error handling, loading states, transactions)

**✅ Project Structure**
- [x] Complete delta tree definida (23 backend + 11 frontend novos + 2 migrations)
- [x] Component boundaries established
- [x] Integration points mapped (3 fluxos completos)
- [x] Requirements to structure mapping complete (FR→arquivo)

### Architecture Readiness Assessment

**Overall Status:** **READY FOR IMPLEMENTATION** ✅

**Confidence Level:** **High**.
- Brownfield com schema já validado (todos os models necessários existem ou são aditivos).
- Decisões fundamentadas em padrões já provados em produção (ImportJob state machine, AuditLog, Prisma extension).
- 100% dos FRs e NFRs do PRD têm cobertura arquitetural explícita.
- Os 4 \"important gaps\" são spikes de descoberta, não retrabalho.

**Key Strengths:**
- **Compatibility-first:** zero mudança em CoverageEngine/PromptBuilder/webhooks/PWA — V3.3 ressuscita módulos V3.0 sem tocá-los.
- **Idempotência em duas camadas** (UNIQUE partial Postgres + check aplicacional) torna o reconcile re-executável com segurança.
- **Service único de gravação** (`WorkplaceAllocationService`) materializa o insight central do PRD (\"importadores escrevem no grafo, não no legado\") em invariante checável.
- **Migration faseada V3.3 → V3.3.1** evita risco de breaking change com pré-condição validada no DDL.
- **Polling sobre SSE** mantém complexidade de infra zero — uma decisão pragmática alinhada com escala atual.

**Areas for Future Enhancement:**
- Phase 2: BullMQ worker para reconcile (substitui runner in-process se volume crescer 10×).
- Phase 2: ESLint custom rules para Enforcement #1 e #4 (lint > grep).
- V3.4: drop final do campo `Employee.workplace` após validação completa via `WorkplaceAllocation`.
- V3.4: plugin architecture de importers (Tirvu vira adapter; aceita CSV, Senior, TOTVS).

### Implementation Handoff

**AI Agent Guidelines:**
- Seguir as 10 Enforcement Guidelines (Step 5) como invariantes obrigatórias — toda PR de V3.3 será verificada contra elas.
- Usar exatamente os paths definidos no Step 6 — não inventar nova estrutura.
- Cada story Phase 1 termina com commit + breve relatório (memória feedback do projeto).
- Após mudança em `backend-api/src/` ou `prisma/`, rebuild do container Docker é automático no fluxo dev.
- Para qualquer dúvida arquitetural, este documento é a fonte de verdade. Se o documento contradiz código existente, código vence (brownfield reality) e este documento é atualizado.

**First Implementation Priority:**

A primeira story do épico V3.3 deve ser:

> **\"Migration V3.3 aditiva + scaffold do módulo `reconcile/`\"**
>
> 1. Criar migration `prisma migrate dev --name v3_3_reconcile` com SQL custom (D4 Phase 1): índice `lower(name)`, tabelas `reconcile_jobs` + `workplace_reconcile_queue`, enums, UNIQUE partial em `workplace_allocations`, `CREATE EXTENSION pg_trgm`, GIN trgm.
> 2. Adicionar models Prisma correspondentes em `schema.prisma`.
> 3. Scaffold `src/modules/reconcile/` com placeholders dos 6 arquivos (service, runner, types, 3 matchers).
> 4. Spike (≤30min) para localizar Prisma extension atual e validar interface `forTenant(tenantId)`.
> 5. Spike (≤15min) para confirmar convenção de testes do módulo `imports/` e replicar.
> 6. Commit + relatório.

A partir daí, seguir Implementation Sequence dos passos 2–11 do Step 4.
