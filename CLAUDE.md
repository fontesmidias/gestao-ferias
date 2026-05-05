# GestaoFerias V3 — Guia para Claude Code

## O que e este projeto

Plataforma SaaS multi-tenant de gestao operacional para empresas de terceirizacao de mao de obra (Green House). Integra gestao de ferias, cobertura de postos de trabalho, substituicao inteligente de colaboradores e AI preditiva.

**Dono:** Bruno (fontesmidias)
**Empresa-cliente:** Green House — Terceirizacao de Mao de Obra

## Stack

- **Backend:** Fastify 5 + TypeScript + Prisma 7.6 + PostgreSQL 15
- **Frontend:** Next.js 16.2 + React 19 + Tailwind CSS + shadcn/ui
- **Infra:** Docker Compose (local), Docker Swarm (prod), BullMQ + Redis (jobs)
- **AI:** Multi-provider LLM (OpenAI, Anthropic, Gemini, Groq) — chave por tenant
- **Integracoes:** ZapSign (assinatura digital), Evolution API (WhatsApp), SMTP (email)

## Estrutura do Monorepo

```
backend-api/          # API Fastify
  src/
    app.ts            # Entry point
    modules/          # Logica de negocio
      coverage-engine/
      employees/
      finance/
      integrations/
      notifications/
      shared/
      signatures/
      vacations/
    plugins/          # Plugins Fastify (auth, prisma, etc)
    routes/api/       # Rotas REST /api/v1/*
  prisma/             # Schema e migrations
frontend-web/         # Painel administrativo Next.js
  src/app/            # App Router pages
    admin/ approvals/ auth/ coverage/ dashboard/
    employee/ employees/ predict/ settings/ workplaces/
docker-compose.yml    # Dev local (postgres + redis + backend + frontend)
_evo-output/          # Artefatos de planejamento (PRD, epics, architecture, UX)
```

## Como rodar local

```bash
# Subir tudo via Docker
docker-compose up --build

# Ou rodar separado:
cd backend-api && npm run dev    # porta 3000
cd frontend-web && npm run dev   # porta 3001 (Next.js)
```

**Portas:** Backend=3000, Frontend=3001, PostgreSQL=5432, Redis=6379

## Comandos uteis

```bash
# Backend
cd backend-api
npm run dev          # Dev com hot-reload
npm run build        # Compilar TypeScript
npm run test         # Rodar testes

# Frontend
cd frontend-web
npm run dev          # Dev server Next.js
npm run build        # Build de producao
npm run lint         # ESLint

# Prisma
cd backend-api
npx prisma migrate dev    # Rodar migrations
npx prisma generate       # Gerar client
npx prisma studio         # UI para inspecionar banco
```

## Regras criticas

1. **Multi-tenant:** TODA query DEVE filtrar por `tenantId` do JWT. Nunca expor dados cross-tenant.
2. **CLT:** VacationEngine valida regras trabalhistas. Nao criar ferias sem validacao CLT.
3. **Seguranca:** Todos endpoints (exceto /auth/setup e /auth/login) exigem JWT.
4. **isFerista:** Ferista NAO e tipo contratual. E uma flag boolean no Employee. Tipos sao EFETIVO e INTERMITENTE.

## Regras V3.3 — Importadores e Reconciliação

**Princípio:** Importadores escrevem no GRAFO RELACIONAL. Nunca apenas em campos legados (string).

1. **Único point-of-write para WorkplaceAllocation:** `WorkplaceAllocationService.upsertFromImport()` em `backend-api/src/modules/workplaces/workplace-allocation.service.ts`. Toda gravação de `WorkplaceAllocation` originada de import ou reconcile DEVE passar por aqui (Enforcement #1). Não usar `prisma.workplaceAllocation.create()` direto em importers.

2. **Resolver lotação string → grafo:** importers usam `ensureWorkplaceFromImport(tx, tenantId, rawName)` (`src/modules/imports/workplace-resolver.ts`) para resolver/criar `Workplace` (com `importedBy='AUTO_TIRVU'`) + `WorkplacePosition` padrão. Aplicam `normalize()` (`src/modules/reconcile/matchers/normalize.ts`).

3. **Idempotência forte:** UNIQUE partial index `workplace_allocations_unique_active_per_position` (status=ACTIVE) + check aplicacional + catch P2002. Re-import 2× = mesmo estado final.

4. **Encerrar+criar, nunca DELETE:** transição de posto encerra allocation antiga (`status='ENDED'`) e cria nova. Preserva CLT (NFR-COMP-2).

5. **Reconciliação retroativa:** `POST /v1/admin/reconcile` (ADMIN/SUPERADMIN) dispara batch in-process. Não-matches viram `WorkplaceReconcileQueue` PENDING para resolução manual via `/workplaces?tab=pending`.

6. **AuditLog actions V3.3:** `V3.3_RECONCILE`, `IMPORT_TIRVU_ALLOCATE`, `RECONCILE_QUEUE_RESOLVE`, `RECONCILE_QUEUE_DEFER`, `RECONCILE_QUEUE_IGNORE`. AUDITOR pode consultar `/v1/audit-logs?action=V3.3_RECONCILE` (FR39).

7. **LGPD:** itens RESOLVED/IGNORED há >90d são purgados via cron in-process (`registerReconcileQueuePurge`, env `RECONCILE_QUEUE_PURGE_ENABLED=true`). AuditLog é preservado.

**Artefatos V3.3:** `_evo-output/planning-artifacts/v3-3-reconciliacao-postos/{prd,architecture,epics}.md`. Stories implementadas em `_evo-output/implementation-artifacts/v3-3-reconciliacao-postos/`.

## V3 — Status atual

Fase de implementacao. Os artefatos de planejamento estao completos em:
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/prd.md`
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md`
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/epics.md`
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/ux-design-specification.md`
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/roadmap.md`

### Epics V3 (ordem de implementacao)

1. **Epic 1:** Gestao de Postos e Alocacoes (CRUD postos, posicoes, alocacoes, classificacao ferista, pagina /workplaces)
2. **Epic 2:** Motor de Cobertura (gaps, sugestoes, encadeamento feristas, CoverageAssignment, Gantt, KPIs)
3. **Epic 3:** Fluxo de Aprovacao integrado (aprovacao com cobertura, bulk create, modal cobertura)
4. **Epic 4:** AI e Predicao (riscos dobra CLT, forecast intermitentes, chat LLM com dados reais)
5. **Epic 5:** PWA do Colaborador (saldo real, solicitacao, historico)
6. **Epic 6:** Webhooks, Notificacoes e Auditoria (CRUD webhooks, HMAC, retry, emails, audit log)
7. **Epic 7:** Sidebar completa e Theming por tenant

### Sequencia tecnica de implementacao

Prisma Extension (tenant isolation) → CoverageEngine → PromptBuilder → Rotas backend → TanStack Query → Componentes frontend → Paginas → Testes

## Convencoes

- Prisma models com `tenantId` obrigatorio
- Rotas REST: `/api/v1/<recurso>`
- Respostas JSON: `{ data, error, meta }`
- Frontend: shadcn/ui componentes, design compacto (sidebar 220px, font 13px)
- Status colors: gap=#EF4444, covered=#22C55E, planned=#EAB308, pending=#3B82F6
