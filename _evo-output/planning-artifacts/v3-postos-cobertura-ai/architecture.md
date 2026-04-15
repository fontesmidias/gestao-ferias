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
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-04-14'
inputDocuments:
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/prd.md
  - docs/PLANO-REVISAO-COMPLETA-V3.md
  - docs/GUIA-DEV-LOCAL.md
  - docs/PESQUISA-MODULO-ASSINATURA-DIGITAL.md
workflowType: 'architecture'
project_name: 'gestao-ferias'
user_name: 'Bruno'
date: '2026-04-14'
---

# Architecture Decision Document

_Este documento é construído colaborativamente passo a passo. As seções são adicionadas conforme avançamos pelas decisões arquiteturais juntos._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

45 FRs organizados em 8 domínios:

| Domínio | IDs | Count | Implicação Arquitetural |
|---|---|---|---|
| Segurança & Auth | FR-SEC-001~008 | 8 | ✅ Já implementado (Sprint 1). Middleware `requireAuth`, JWT, rate limiting, tenant isolation. Baseline. |
| Gestão de Postos | FR-WPL-001~005 | 5 | Models `Workplace`, `WorkplacePosition`, `WorkplaceAllocation` já existem no Prisma. CRUD parcial implementado. |
| Motor de Cobertura | FR-COV-001~005 | 5 | `CoverageEngine` existe como módulo (`src/modules/coverage-engine/`). Lógica de gaps, sugestões e encadeamento precisa ser implementada/completada. |
| Fluxo de Aprovação | FR-APR-001~005 | 5 | Rotas existem como stub. Integração com CoverageAssignment no approve é o ponto crítico. |
| AI e Previsão | FR-AI-001~003 | 3 | `ROIEngine` existe. Rotas `/predict/*` existem. LLM multi-provider por tenant (OpenAI/Anthropic/Gemini/Groq). Precisa de contexto real do banco → prompt. |
| Webhooks | FR-WHK-001~005 | 5 | `WebhookService` e model `Webhook` existem. HMAC signing, retry com BullMQ, endpoint de teste a implementar. |
| Notificações & Audit | FR-NOT-001, FR-AUD-001~002 | 3 | `EmailService`, `AuditService` existem. SMTP por tenant. Audit model completo. |
| Frontend | FR-UI-001~010 | 10 | Páginas parciais existem. Novas: `/workplaces`, `/coverage` (Gantt), modal de cobertura no approve, dashboard AI com chat. |

**Non-Functional Requirements:**

| NFR | Decisão Arquitetural |
|---|---|
| NFR-PERF-001: API < 200ms P95 | Índices Prisma nos campos filtrados (tenantId, status, dates). Sem ORM N+1. |
| NFR-PERF-002: Dashboard < 3s 4G | SSR/ISR Next.js, lazy loading, code splitting |
| NFR-PERF-003: /predict/ask < 30s | Timeout explícito na chamada LLM. Streaming opcional. |
| NFR-SEC-001: Tenant isolation 100% | Prisma middleware ou query extension para injetar tenantId automaticamente |
| NFR-REL-001: 99.5% uptime horário comercial | Health checks Docker, restart policies, monitoramento externo |
| NFR-REL-002: Jobs com retry | BullMQ com dead-letter queue e logging no AuditLog |
| NFR-TEST-001: ≥70% coverage engines | Testes unitários para VacationEngine, CoverageEngine, ROIEngine |
| NFR-OPS-001: docker compose < 5min | Multi-stage builds, caching de layers, migration no entrypoint |
| NFR-OPS-002: Migrations automáticas | `prisma migrate deploy` no startup do container |
| NFR-ACC-001: PWA ≥320px, touch 44px | Responsive design mobile-first, CSS Grid/Flexbox |
| NFR-SCALE-001: Novos tenants sem código | Setup via API, row-level isolation, sem schema-per-tenant |

**Scale & Complexity:**

- Domínio primário: Full-stack SaaS multi-tenant com AI integrada
- Nível de complexidade: **Alta**
- Componentes arquiteturais estimados: ~15 (auth, tenant, employee, vacation, workplace, allocation, coverage, AI/predict, webhook, notification, audit, signature, PWA, dashboard, real-time)

### Technical Constraints & Dependencies

**Stack atual (brownfield — não negociável):**
- **Backend:** Fastify 5, TypeScript, Prisma 7.6, PostgreSQL
- **Frontend:** Next.js 16.2, React 19, Tailwind CSS
- **Infra:** Docker Compose (local), Docker Swarm (produção), BullMQ + Redis (jobs)
- **AI:** Multi-provider LLM via API (OpenAI, Anthropic, Gemini, Groq) — chave por tenant
- **Integrações:** ZapSign (assinatura digital), Evolution API (WhatsApp), SMTP (email)

**Constraints:**
- Monorepo com 2 projetos: `backend-api/` e `frontend-web/`
- PostgreSQL como único banco (sem MongoDB, sem DynamoDB)
- Redis opcional (BullMQ precisa para jobs em background)
- Deploy alvo: VPS single-node via Docker Swarm + Portainer + Traefik
- Sem Kubernetes, sem serverless, sem cloud-native services
- AGPLv3 para eventual migração para DocuSeal (assinatura)

### Cross-Cutting Concerns Identified

1. **Tenant Isolation** — Todo model com `tenantId`, toda query filtrada. Prisma extension ou middleware para enforcement automático.
2. **Auditoria** — `AuditService` centralizado. Ações críticas logadas com IP, userId, previousData/newData.
3. **Autenticação/Autorização** — JWT com roles (SUPERADMIN, ADMIN, USER, AUDITOR). Plugins Fastify `requireAuth`, `auth-guard`.
4. **Validação CLT** — `VacationEngine` centraliza regras de férias. Reutilizado em criação e aprovação.
5. **Event Broadcasting** — WebSocket para real-time + Webhooks para integrações externas. Ambos disparam nos mesmos eventos.
6. **Background Jobs** — BullMQ para: retry de webhooks, envio de emails, processamento de assinaturas. Redis como broker.
7. **LLM Context Building** — Prompt montado com dados reais do tenant (férias, postos, gaps, custos). Cross-cutting porque toca vacation, coverage, employee e workplace.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack SaaS multi-tenant — **Projeto brownfield com stack estabelecida**.

### Stack Existente (Baseline — Não Negociável)

Este é um projeto brownfield com stack já em produção. Não há decisão de starter template.

**Backend (Fastify 5 + TypeScript):**

| Tecnologia | Versão | Papel |
|---|---|---|
| Fastify | 5.x | HTTP framework com plugin system |
| TypeScript | ~5.x | Linguagem principal |
| Prisma | 7.6 | ORM com migrations e type-safety |
| PostgreSQL | 15 | Banco de dados único |
| BullMQ | 5.x | Job queue (webhooks, emails, async) |
| Redis | 6379 | Broker para BullMQ |
| JWT (@fastify/jwt) | — | Autenticação stateless |

**Frontend (Next.js 16 + React 19):**

| Tecnologia | Versão | Papel |
|---|---|---|
| Next.js | 16.2 | Framework React com SSR/ISR |
| React | 19.2 | UI library |
| Tailwind CSS | — | Utility-first styling |

**Infraestrutura:**

| Componente | Tecnologia |
|---|---|
| Local | Docker Compose (Postgres + Redis + Backend + Frontend) |
| Produção | Docker Swarm na VPS via Portainer |
| Reverse Proxy | Traefik |
| CI/CD | GitHub Actions (planejado Sprint 6) |

**Integrações Externas:**

| Integração | Serviço | Protocolo |
|---|---|---|
| Assinatura Digital | ZapSign (atual) → DocuSeal (futuro) | REST API |
| WhatsApp | Evolution API | REST API |
| Email | SMTP por tenant | SMTP |
| AI/LLM | OpenAI / Anthropic / Gemini / Groq | REST API (por tenant) |

### Decisões Arquiteturais Herdadas do Projeto

**Organização de Código:**
```
backend-api/
  src/
    plugins/       ← Fastify plugins (auth, prisma, cors, rate-limit, websocket, queues)
    modules/       ← Lógica de negócio (coverage-engine, vacation-engine, roi-engine, etc.)
    routes/api/v1/ ← Rotas REST organizadas por recurso
  prisma/
    schema.prisma  ← Schema único, migrations automáticas

frontend-web/
  src/             ← Next.js App Router (React 19)
```

**Padrões Estabelecidos:**
- Plugin system Fastify para cross-cutting (auth, prisma, rate-limit)
- Módulos de domínio isolados (`modules/coverage-engine/`, `modules/vacations/`, etc.)
- Rotas Fastify registradas por recurso (`routes/api/v1/workplaces/`)
- Prisma como única camada de acesso a dados
- Tenant isolation via `tenantId` em todas as queries
- Conventional commits (`fix:`, `feat:`, `security:`, `refactor:`)

**Nota:** Nenhuma mudança de stack é necessária. A V3 adiciona funcionalidade sobre a fundação existente.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

| # | Decisão | Escolha | Rationale |
|---|---|---|---|
| 1 | Caching Strategy | On-demand (sem cache) | Queries Prisma com índices atendem P95 < 200ms. Cache Redis adicionado reativamente se benchmark indicar necessidade. Evita complexidade de invalidação prematura. |
| 2 | Real-time Strategy | WebSocket (plugin existente) | Plugin `plugins/websocket` já implementado. Reutilizar > introduzir SSE como segunda tecnologia. Broadcast de eventos: gap detectado, férias aprovadas, cobertura criada. |
| 3 | Frontend State Management | TanStack Query v5 | Battle-tested para server state em React 19. Cache automático, revalidação, loading/error states. Integração nativa com Next.js App Router. Zustand apenas se surgir estado global complexo. |
| 4 | LLM Context Building | PromptBuilder centralizado | Classe `PromptBuilder` recebe `tenantId` + `questionType`, monta contexto com queries reais (férias, gaps, custos, postos). Centraliza acesso a dados, facilita testes unitários, elimina duplicação entre rotas `/predict/*`. |
| 5 | Gantt/Timeline Component | frappe-gantt | Open source, ~15KB, sem dependências pesadas. Atende Gantt simplificado do PRD (eixo X = dias, Y = postos, células verde/vermelho/amarelo). Componente isolado — substituição futura de baixo custo. |
| 6 | Bulk Create UX Component | TanStack Table + inputs nativos | Headless, compõe com Tailwind, suporta edição inline. Validação CLT em tempo real por linha. AG Grid descartado (comercial, overkill). |

**Important Decisions (Shape Architecture):**

| # | Decisão | Escolha | Rationale |
|---|---|---|---|
| 7 | Webhook Retry Strategy | Exponential backoff: 30s → 5min → 30min | 3 tentativas via BullMQ. Dead-letter após falha final com registro no AuditLog. Alinhado com FR-WHK-004. |
| 8 | Error Handling Standard | Formato unificado `{ error, message, details?, statusCode }` | Plugin `error-handler` existente padroniza shape. Todas as rotas retornam mesmo formato. Erros CLT incluem `details` com array de violações. |
| 9 | Tenant Isolation Enforcement | Prisma Client Extension | Approach moderno Prisma 7.x, type-safe. Injeta `WHERE tenantId` automaticamente em queries. Middleware Prisma deprecated — Extension é o caminho suportado. |

**Deferred Decisions (Post-MVP):**

| Decisão | Rationale para Diferir |
|---|---|
| Redis Cache para CoverageEngine | Só se P95 > 200ms em produção. Benchmark primeiro, otimizar depois. |
| Zustand (estado global frontend) | TanStack Query cobre server state. Avaliar apenas se surgir necessidade de estado client-side complexo (improvável no V3). |
| SSE como alternativa a WebSocket | WebSocket atende. SSE só se houver requisito de fallback para proxies que bloqueiam WS. |
| Service Worker offline completo | PWA MVP com cache de saldo/histórico. Offline-first completo é escopo pós-V3. |

### Data Architecture

**Database:** PostgreSQL 15 (herdado, sem alteração).

**ORM:** Prisma 7.6 com Client Extension para tenant isolation automática.

```typescript
// Prisma Client Extension — injeta tenantId em todas as operações
const prismaWithTenant = (tenantId: string) =>
  prisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId }
          return query(args)
        },
        async create({ args, query }) {
          args.data = { ...args.data, tenantId }
          return query(args)
        },
        // findFirst, update, delete seguem o mesmo padrão
      },
    },
  })
```

**Data Validation:** Zod schemas na camada de rotas Fastify (request body validation). Prisma valida tipos e constraints no banco.

**Migration Strategy:** `prisma migrate deploy` no startup do container. Zero intervenção manual.

**Caching:** Sem cache na V3. Queries otimizadas com índices compostos:
- `(tenantId, status)` em VacationRequest
- `(tenantId, workplaceId, startDate, endDate)` em CoverageAssignment
- `(tenantId, employeeType)` em Employee

### Authentication & Security

**Herdado do Sprint 1 (100% implementado):**

- JWT stateless via `@fastify/jwt` — access token 15min, refresh 30 dias
- RBAC: SUPERADMIN, ADMIN, USER, AUDITOR — enforced via `auth-guard` plugin
- Rate limiting: 10 req/min em rotas de auth
- Tenant isolation: `tenantId` do JWT em todas as queries

**Decisões V3:**

- `POST /vacations/bulk-create` restrito a role ADMIN (FR-APR-005)
- WebSocket autenticado via token no query param (já implementado)
- Credenciais LLM (API keys) criptografadas em repouso no model Tenant — nunca retornadas em responses
- HMAC-SHA256 para assinatura de webhooks (FR-WHK-003)

### API & Communication Patterns

**REST API `/api/v1/`** (herdado):
- Todas as rotas seguem padrão CRUD: `GET/POST/PATCH/DELETE`
- Paginação: `?page=1&limit=20` com response `{ data: [], meta: { total, page, limit } }`
- Erro padrão: `{ error: "Not Found", message: "Funcionário não encontrado.", statusCode: 404 }`
- Erros de validação CLT: `{ error: "Legal Block", message: "...", details: ["Período mínimo 14 dias", ...], statusCode: 422 }`

**Real-time (WebSocket):**
- Conexão: `ws://host/ws?token=JWT`
- Eventos broadcast por tenant: `vacation.approved`, `vacation.rejected`, `coverage.assigned`, `gap.detected`
- Mesmo payload dos webhooks — implementação única, dois canais de entrega

**Background Jobs (BullMQ):**
- Queue `webhooks`: delivery + retry (30s/5min/30min)
- Queue `emails`: envio SMTP assíncrono
- Queue `signatures`: criação de documentos ZapSign
- Dead-letter com log no AuditLog após falha final

### Frontend Architecture

**Framework:** Next.js 16.2 App Router + React 19.

**State Management:**
- **Server state:** TanStack Query v5 — fetch, cache, revalidação automática
- **Form state:** React Hook Form (formulários complexos: bulk create, cadastro de postos)
- **Client state:** `useState`/`useReducer` local. Zustand apenas se necessário (não previsto).

**Component Architecture:**
- Componentes de UI: Tailwind CSS utility-first
- Tabelas interativas: TanStack Table (headless) — usado em bulk create, listagens com filtro
- Timeline/Gantt: frappe-gantt encapsulado em `<CoverageGantt />` component
- Modais: componente reutilizável `<Modal />` — aprovação com cobertura, cadastro de postos

**Performance:**
- Code splitting automático via Next.js App Router
- Lazy loading de páginas pesadas (`/coverage`, `/dashboard-ai`)
- Imagens otimizadas via `next/image`
- Bundle target: < 200KB first load JS

**Rotas principais:**

| Rota | Componente | FR |
|---|---|---|
| `/workplaces` | Lista de Postos + modal CRUD | FR-UI-001, FR-UI-002 |
| `/coverage` | Gantt de cobertura + KPIs | FR-UI-003, FR-UI-004 |
| `/vacations` | Lista + modo bulk create | FR-UI-009, FR-APR-005 |
| `/approvals` | Fila com modal de cobertura | FR-UI-005 |
| `/dashboard-ai` | Gráficos + chat LLM | FR-UI-006 |
| `/employee` | PWA do colaborador | FR-UI-007 |

### Infrastructure & Deployment

**Herdado (sem alteração):**
- Docker Compose (dev local): PostgreSQL + Redis + Backend + Frontend
- Docker Swarm (produção): VPS single-node via Portainer + Traefik
- Multi-stage Dockerfile para builds otimizados
- `prisma migrate deploy` no entrypoint do container

**Decisões V3:**
- Redis obrigatório (BullMQ para jobs de webhook, email, assinatura)
- Health check endpoint: `GET /health` retorna status de PostgreSQL + Redis
- Restart policy: `on-failure` com max 3 restarts
- Logs estruturados JSON via Fastify logger (pino) — compatível com qualquer agregador futuro

**CI/CD (Sprint 6):**
- GitHub Actions: lint → test → build → deploy
- Deploy via SSH + `docker stack deploy`
- Sem Kubernetes, sem serverless — VPS single-node é o alvo

### Decision Impact Analysis

**Implementation Sequence:**

1. **Prisma Client Extension** (tenant isolation) — base para tudo; migrar queries existentes
2. **TanStack Query setup** no frontend — infraestrutura de data fetching
3. **PromptBuilder** — módulo centralizado antes das rotas `/predict/*`
4. **CoverageEngine** completar lógica de gaps/sugestões — depende de Extension
5. **frappe-gantt** integrado em `<CoverageGantt />` — depende de dados do CoverageEngine
6. **TanStack Table** para bulk create e listagens — depende de TanStack Query
7. **WebSocket events** — broadcast nos handlers de approve/reject/coverage
8. **BullMQ queues** — webhook retry, email async, signature async

**Cross-Component Dependencies:**

```
Prisma Extension ──► CoverageEngine ──► Gantt (frontend)
                 ──► PromptBuilder  ──► /predict/* routes
                 ──► bulk-create    ──► TanStack Table (frontend)

TanStack Query ──► Todas as páginas frontend
               ──► WebSocket events (invalidação de cache)

BullMQ ──► WebhookService (retry)
       ──► EmailService (async)
       ──► SignatureService (ZapSign async)
```

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**14 conflict points identificados** onde agentes AI poderiam divergir. Padrões extraídos do código existente e formalizados abaixo.

### Naming Patterns

**Database (Prisma Schema):**

| Elemento | Convenção | Exemplo |
|---|---|---|
| Model name | PascalCase singular | `VacationRequest`, `CoverageAssignment` |
| Field name | camelCase | `startDate`, `tenantId`, `employeeType` |
| `@@map()` | snake_case plural | `@@map("vacation_requests")` |
| `@map()` em fields | snake_case | `@map("start_date")`, `@map("tenant_id")` |
| Enum values | UPPER_SNAKE | `EFETIVO`, `INTERMITENTE`, `FERISTA` |
| FK field | `{relation}Id` camelCase | `employeeId`, `workplacePositionId` |
| Índices compostos | na ordem: `tenantId` primeiro | `@@index([tenantId, status])` |

**API Endpoints:**

| Elemento | Convenção | Exemplo |
|---|---|---|
| Base path | `/api/v1/` | — |
| Resource | plural kebab-case | `/vacations`, `/workplaces`, `/audit-logs` |
| Sub-resource | nested | `/workplaces/:id/positions` |
| Action | verbo no path | `/vacations/bulk-create`, `/webhooks/:id/test` |
| Parâmetros query | camelCase | `?workplaceId=&from=&to=` |
| Route params | `:id` (uuid) | `/vacations/:id` |

**Código TypeScript:**

| Elemento | Convenção | Exemplo |
|---|---|---|
| Classes | PascalCase + sufixo descritivo | `CoverageEngine`, `AuditService`, `ImportService` |
| Interfaces | PascalCase, sem prefixo `I` | `VacationPeriod`, `WebhookPayload` |
| Funções/métodos | camelCase | `calculatePeriods()`, `validateRequest()` |
| Variáveis | camelCase | `tenantId`, `errorDetails` |
| Constantes | UPPER_SNAKE (maps/configs) | `EMPLOYEE_MAP`, `VACATION_MAP` |
| Arquivos | kebab-case | `vacation-engine.ts`, `coverage-engine.ts` |
| Plugins Fastify | kebab-case | `auth-guard.ts`, `rate-limit.ts` |
| Componentes React | PascalCase | `ErrorBoundary.tsx`, `Sidebar.tsx` |
| Hooks React | camelCase com `use-` | `use-socket.ts`, `use-tour.ts` |

### Structure Patterns

**Backend — Organização por Domínio:**

```
backend-api/src/
  plugins/              ← Cross-cutting concerns (1 arquivo por plugin)
    auth-guard.ts
    prisma.ts
    rate-limit.ts
    websocket.ts
    queues.ts
  modules/              ← Lógica de negócio (1 pasta por domínio)
    coverage-engine/
      coverage-engine.ts
    vacations/
      vacation-engine.ts
    finance/
      roi-engine.ts
    shared/              ← Serviços reutilizáveis
      audit-service.ts
    employees/
      import-service.ts
      sanitization-service.ts
    notifications/
      email-service.ts
      whatsapp-service.ts
    integrations/
      webhook-service.ts
      zapsign-service.ts
    signatures/
      signature-service.ts
  routes/api/v1/         ← 1 pasta por recurso REST
    vacations/index.ts
    workplaces/index.ts
    coverages/index.ts
    predict/index.ts
```

**Regras para novos módulos:**
- Engine/Service = `modules/{domínio}/{nome}-engine.ts` ou `{nome}-service.ts`
- Rota = `routes/api/v1/{recurso}/index.ts`
- Plugin = `plugins/{nome}.ts` (registrado no `app.ts`)
- **Nunca** criar `utils/`, `helpers/`, `common/` — usar `modules/shared/`

**Frontend — App Router:**

```
frontend-web/src/
  app/                   ← Rotas Next.js App Router
    dashboard/page.tsx
    employees/page.tsx
    vacations/page.tsx
    workplaces/page.tsx
    coverage/page.tsx
    approvals/page.tsx
    predict/page.tsx
    settings/page.tsx
    employee/dashboard/page.tsx   ← PWA do colaborador
    auth/login/page.tsx
    auth/setup/page.tsx
    admin/page.tsx
  components/            ← Componentes reutilizáveis
    Sidebar.tsx
    ErrorBoundary.tsx
    AuthContext.tsx
  hooks/                 ← Custom hooks
    use-socket.ts
  lib/                   ← Utilitários e clients
    api-client.ts
```

**Regras para novos componentes:**
- Página = `app/{rota}/page.tsx`
- Componente reutilizável = `components/{Nome}.tsx` (PascalCase)
- Componente de página = inline no `page.tsx` (não extrair até reutilizar)
- Hook = `hooks/use-{nome}.ts`
- Lib/util = `lib/{nome}.ts`

**Testes:**

| Tipo | Localização | Naming |
|---|---|---|
| Unit (backend) | `modules/{domínio}/__tests__/{nome}.test.ts` | co-located |
| Unit (frontend) | `components/__tests__/{Nome}.test.tsx` | co-located |
| API (backend) | `routes/__tests__/{recurso}.test.ts` | co-located |
| E2E | `tests/e2e/{fluxo}.test.ts` (raiz do projeto) | separado |

### Format Patterns

**API Response — Sucesso:**

```json
// Objeto único
{ "id": "uuid", "name": "...", "status": "PENDING", "createdAt": "2026-04-14T..." }

// Lista (sem wrapper — Fastify retorna direto)
[{ "id": "uuid", ... }, { "id": "uuid", ... }]

// Lista com paginação
{ "data": [...], "meta": { "total": 42, "page": 1, "limit": 20 } }

// Ação em massa
{ "message": "Importacao concluida: 5 ferias criadas.", "created": 5, "errors": 1, "results": [...] }
```

**API Response — Erro:**

```json
// Erro genérico
{ "error": "Not Found", "message": "Funcionário não encontrado.", "statusCode": 404 }

// Erro de validação CLT
{ "error": "Legal Block", "message": "Violação CLT Art. 134.", "details": ["Período mínimo 14 dias", "Início em sexta-feira"], "statusCode": 422 }

// Erro de rate limit
{ "error": "Too Many Requests", "message": "Limite de requisições excedido.", "statusCode": 429 }
```

**Datas:**
- API JSON: ISO 8601 string — `"2026-04-14T00:00:00.000Z"`
- Display UI: `dd/MM/yyyy` — `"14/04/2026"` (date-fns `format()`)
- Query params: `YYYY-MM-DD` — `?from=2026-04-01&to=2026-04-30`
- Prisma: `DateTime` (JavaScript `Date` object)

**JSON Fields:** camelCase em toda a API (alinhado com JavaScript/TypeScript conventions).

### Communication Patterns

**WebSocket Events:**

```typescript
// Naming: {resource}.{action} em lowercase
"vacation.approved"
"vacation.rejected"
"coverage.assigned"
"gap.detected"

// Payload: mesmo shape do webhook
{
  event: "vacation.approved",
  tenantId: "uuid",
  data: { /* recurso completo */ },
  timestamp: "2026-04-14T10:30:00.000Z"
}
```

**BullMQ Job Names:**

```typescript
// Naming: {queue}:{action}
"webhooks:deliver"
"emails:send"
"signatures:create"
```

**Logging (Pino/Fastify):**

```typescript
// Prefixo por módulo entre colchetes
fastify.log.info(`[CoverageEngine] Gap detectado no posto ${workplaceId}`)
fastify.log.error(`[WhatsApp] Falha ao notificar ${name}: ${err.message}`)
fastify.log.info(`[ZapSign] Documento criado: ${docToken}`)
```

### Process Patterns

**Tenant Isolation (Prisma Extension):**

```typescript
// TODA query DEVE usar o client com extension
const prisma = getPrismaWithTenant(tenantId) // retorna client com tenantId injetado

// NUNCA fazer query sem tenant (exceto SUPERADMIN em /admin/*)
// NUNCA passar tenantId manualmente em findMany/create — a Extension injeta
```

**Autenticação em Rotas:**

```typescript
// Padrão: onRequest hook array
fastify.get('/resource', {
  onRequest: [fastify.requireAuth]              // USER+
}, handler)

fastify.post('/resource', {
  onRequest: [fastify.requireAuth, fastify.requireAdmin]  // ADMIN+
}, handler)

// NUNCA validar role dentro do handler — sempre via onRequest hooks
```

**Validação de Request Body:**

```typescript
// Fastify JSON Schema no registration
fastify.post('/resource', {
  schema: {
    body: {
      type: 'object',
      required: ['field1', 'field2'],
      properties: {
        field1: { type: 'string', format: 'uuid' },
        field2: { type: 'string' }
      }
    }
  }
}, handler)
```

**Error Handling em Rotas:**

```typescript
// 1. Buscar com tenant isolation
const resource = await prisma.model.findFirst({ where: { id, tenantId } })

// 2. 404 se não encontrou (NUNCA expor "não pertence ao seu tenant")
if (!resource) return reply.code(404).send({ error: 'Not Found', message: '...' })

// 3. Validação de negócio
if (!valid) return reply.code(422).send({ error: 'Legal Block', message: '...', details: [...] })

// 4. Persistência
const result = await prisma.model.create({ data: { ... } })

// 5. Side effects assíncronos (não bloqueiam response)
WhatsAppService.sendMessage(...).catch(err => fastify.log.error(`[WhatsApp] ${err.message}`))

// 6. Return
return result
```

**Frontend — Data Fetching (TanStack Query):**

```typescript
// Query key pattern: [resource, ...filters]
const { data, isLoading } = useQuery({
  queryKey: ['vacations', { status: 'PENDING' }],
  queryFn: () => HttpClient.get('/vacations?status=PENDING')
})

// Mutation com invalidação
const mutation = useMutation({
  mutationFn: (data) => HttpClient.post('/vacations/bulk-create', data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vacations'] })
})
```

### Enforcement Guidelines

**Todo agente AI DEVE:**

1. Seguir naming conventions exatas (camelCase TS, snake_case DB maps, kebab-case arquivos)
2. Colocar novo código na pasta correta (module → `modules/`, rota → `routes/api/v1/`, plugin → `plugins/`)
3. Incluir `tenantId` via Prisma Extension — nunca hardcoded em queries
4. Usar `onRequest` hooks para auth/roles — nunca validar role no handler
5. Retornar erros no formato padrão `{ error, message, statusCode }`
6. Logar com prefixo `[NomeModulo]` via `fastify.log`
7. Side effects (WhatsApp, email, webhook) assíncronos — `.catch()` sem bloquear response
8. Ler `frontend-web/AGENTS.md` antes de escrever código Next.js (breaking changes)

**Anti-Patterns (NUNCA fazer):**

| Anti-Pattern | Correto |
|---|---|
| `prisma.model.findMany({ where: { tenantId } })` manual | Usar Prisma Extension |
| `if (user.role !== 'ADMIN') return 403` no handler | `onRequest: [fastify.requireAdmin]` |
| `{ success: true, data: {...} }` wrapper | Retornar objeto direto |
| `src/utils/helpers.ts` | `src/modules/shared/{nome}-service.ts` |
| `import moment from 'moment'` | `import { format, parseISO } from 'date-fns'` |
| `console.log(...)` | `fastify.log.info(...)` |
| `await WhatsAppService.sendMessage(...)` bloqueante | `.catch(err => log)` fire-and-forget |

## Project Structure & Boundaries

### Complete Project Directory Structure

Legenda: `✅` = existe, `🆕` = novo na V3, `📝` = existe mas precisa de alteração/complemento na V3.

```
gestao-ferias/
├── ✅ docker-compose.yml
├── ✅ docker-compose.prod.yml
├── ✅ docker-stack.yml
├── 🆕 .github/
│   └── workflows/
│       └── ci.yml                          ← CI/CD (Sprint 6)
│
├── backend-api/
│   ├── ✅ package.json
│   ├── ✅ tsconfig.json
│   ├── ✅ Dockerfile
│   ├── ✅ entrypoint.sh
│   ├── ✅ prisma.config.js
│   │
│   ├── prisma/
│   │   ├── ✅ schema.prisma                ← 📝 adicionar índices compostos V3
│   │   └── ✅ migrations/                  ← 14 migrations existentes
│   │       └── 🆕 2026XXXX_v3_indexes/     ← índices para performance V3
│   │
│   ├── src/
│   │   ├── ✅ app.ts                       ← 📝 registrar Prisma Extension
│   │   │
│   │   ├── plugins/
│   │   │   ├── ✅ auth-guard.ts
│   │   │   ├── ✅ cors.ts
│   │   │   ├── ✅ error-handler.ts
│   │   │   ├── ✅ jwt.ts
│   │   │   ├── ✅ multipart.ts
│   │   │   ├── ✅ prisma.ts               ← 📝 adicionar Prisma Client Extension
│   │   │   ├── ✅ queues.ts
│   │   │   ├── ✅ rate-limit.ts
│   │   │   ├── ✅ sensible.ts
│   │   │   ├── ✅ support.ts
│   │   │   ├── ✅ websocket.ts            ← 📝 broadcast events por tenant
│   │   │   └── ✅ worker.ts
│   │   │
│   │   ├── modules/
│   │   │   ├── coverage-engine/
│   │   │   │   └── ✅ coverage-engine.ts  ← 📝 completar gaps, sugestões, encadeamento
│   │   │   ├── vacations/
│   │   │   │   └── ✅ vacation-engine.ts
│   │   │   ├── finance/
│   │   │   │   └── ✅ roi-engine.ts       ← 📝 completar cálculos de custo
│   │   │   ├── shared/
│   │   │   │   └── ✅ audit-service.ts
│   │   │   ├── employees/
│   │   │   │   ├── ✅ import-service.ts
│   │   │   │   └── ✅ sanitization-service.ts
│   │   │   ├── notifications/
│   │   │   │   ├── ✅ email-service.ts    ← 📝 templates de email por evento
│   │   │   │   └── ✅ whatsapp-service.ts
│   │   │   ├── integrations/
│   │   │   │   ├── ✅ webhook-service.ts  ← 📝 retry BullMQ, dead-letter
│   │   │   │   └── ✅ zapsign-service.ts
│   │   │   ├── signatures/
│   │   │   │   └── ✅ signature-service.ts
│   │   │   └── ai/
│   │   │       └── 🆕 prompt-builder.ts   ← PromptBuilder centralizado
│   │   │
│   │   └── routes/api/v1/
│   │       ├── ✅ admin/index.ts
│   │       ├── ✅ allocations/index.ts
│   │       ├── ✅ audit-logs/index.ts
│   │       ├── ✅ auth/index.ts
│   │       ├── ✅ auth/signature.ts
│   │       ├── ✅ coverages/index.ts      ← 📝 implementar gaps, suggestions, CRUD
│   │       ├── ✅ dashboard/index.ts      ← 📝 KPIs de cobertura
│   │       ├── ✅ employees/index.ts
│   │       ├── ✅ positions/index.ts
│   │       ├── ✅ predict/index.ts        ← 📝 integrar PromptBuilder + LLM
│   │       ├── ✅ reports/index.ts
│   │       ├── ✅ setup/index.ts
│   │       ├── ✅ tenants/index.ts
│   │       ├── ✅ vacations/index.ts      ← 📝 adicionar bulk-create
│   │       ├── ✅ webhooks/index.ts       ← 📝 adicionar /test endpoint
│   │       ├── ✅ webhooks/zapsign.ts
│   │       └── ✅ workplaces/index.ts     ← 📝 completar CRUD + staff
│   │
│   └── test/
│       ├── ✅ helper.ts
│       ├── ✅ tsconfig.json
│       ├── modules/
│       │   ├── ✅ coverage-engine.test.ts  ← 📝 expandir testes de gaps
│       │   ├── ✅ email-service.test.ts
│       │   ├── ✅ roi-engine.test.ts       ← 📝 expandir testes de custo
│       │   ├── ✅ sanitization-service.test.ts
│       │   ├── ✅ vacation-engine.test.ts
│       │   ├── ✅ webhook-service.test.ts
│       │   └── 🆕 prompt-builder.test.ts
│       ├── plugins/
│       │   └── ✅ support.test.ts
│       └── routes/
│           ├── ✅ example.test.ts
│           ├── ✅ root.test.ts
│           ├── ✅ tenants.test.ts
│           ├── 🆕 vacations.test.ts        ← bulk-create, CLT validation
│           ├── 🆕 coverages.test.ts        ← gaps, suggestions
│           └── 🆕 workplaces.test.ts       ← CRUD, staff, allocations
│
└── frontend-web/
    ├── ✅ package.json
    ├── ✅ tsconfig.json
    ├── ✅ next.config.ts
    ├── ✅ eslint.config.mjs
    ├── ✅ postcss.config.mjs
    ├── ✅ vitest.config.ts
    ├── ✅ vitest.setup.ts
    ├── ✅ Dockerfile
    ├── ✅ AGENTS.md                        ← OBRIGATÓRIO ler antes de escrever Next.js
    │
    └── src/
        ├── app/
        │   ├── ✅ layout.tsx
        │   ├── ✅ page.tsx
        │   ├── ✅ globals.css
        │   ├── ✅ favicon.ico
        │   ├── auth/
        │   │   ├── ✅ login/page.tsx
        │   │   └── ✅ setup/page.tsx
        │   ├── ✅ dashboard/page.tsx
        │   ├── ✅ dashboard/settings/page.tsx
        │   ├── ✅ employees/page.tsx
        │   ├── ✅ workplaces/page.tsx       ← 📝 completar CRUD, modal, badge gaps
        │   ├── ✅ coverage/page.tsx          ← 📝 integrar frappe-gantt, KPIs
        │   ├── ✅ approvals/page.tsx         ← 📝 modal cobertura no approve
        │   ├── ✅ predict/page.tsx           ← 📝 dashboard AI, chat LLM
        │   ├── ✅ settings/page.tsx
        │   ├── 🆕 vacations/page.tsx         ← lista + bulk create
        │   ├── ✅ employee/dashboard/page.tsx ← 📝 PWA: saldo, formulário CLT
        │   ├── ✅ admin/page.tsx
        │   └── ✅ admin/tenants/[id]/page.tsx
        │
        ├── components/
        │   ├── ✅ AuthContext.tsx
        │   ├── ✅ ErrorBoundary.tsx
        │   ├── ✅ ImpersonationBanner.tsx
        │   ├── ✅ InfoTooltip.tsx
        │   ├── ✅ Sidebar.tsx               ← 📝 adicionar itens: Férias, Cobertura
        │   ├── ✅ TourProvider.tsx
        │   ├── 🆕 CoverageGantt.tsx          ← wrapper frappe-gantt
        │   ├── 🆕 BulkVacationTable.tsx       ← TanStack Table editável
        │   ├── 🆕 CoverageModal.tsx           ← modal "Quem cobre?" no approve
        │   ├── 🆕 AIChat.tsx                  ← chat LLM com streaming
        │   └── __tests__/
        │       ├── ✅ InfoTooltip.test.tsx
        │       ├── 🆕 BulkVacationTable.test.tsx
        │       └── 🆕 CoverageGantt.test.tsx
        │
        ├── hooks/
        │   ├── ✅ use-socket.ts
        │   ├── ✅ use-tour.ts
        │   └── 🆕 use-vacations.ts           ← TanStack Query hooks para férias
        │
        └── lib/
            ├── ✅ api-client.ts              ← 📝 integrar com TanStack Query provider
            └── __tests__/
                └── ✅ api-client.test.ts
```

### Architectural Boundaries

**API Boundaries:**

| Boundary | Entrada | Saída | Guarda |
|---|---|---|---|
| External → API | HTTP REST `/api/v1/*` | JSON response | JWT + rate-limit |
| API → Database | Prisma Client Extension | Prisma types | tenantId automático |
| API → Redis/BullMQ | Job dispatch | Job result (async) | internal only |
| API → LLM Providers | PromptBuilder → HTTP | JSON/stream | API key do tenant |
| API → ZapSign | ZapSignService → HTTP | Webhook callback | zapSignToken |
| API → Evolution API | WhatsAppService → HTTP | fire-and-forget | evoApiKey |
| API → SMTP | EmailService → SMTP | fire-and-forget | tenant SMTP config |
| WebSocket → Client | ws:// broadcast | JSON events | JWT no query param |

**Component Boundaries (Frontend):**

| Componente | Responsabilidade | Comunicação |
|---|---|---|
| `pages/` (App Router) | Orquestração, layout, data fetching | TanStack Query → HttpClient |
| `components/` | UI reutilizável, sem data fetching direto | Props + callbacks |
| `hooks/` | Lógica reutilizável (queries, WebSocket) | TanStack Query hooks |
| `lib/` | HTTP client, utils puros | Importado por hooks e pages |

**Service Boundaries (Backend):**

| Camada | Responsabilidade | Regra |
|---|---|---|
| `routes/` | HTTP handling, schema validation, response | Chama modules, NUNCA acessa Prisma diretamente (exceto queries simples) |
| `modules/` | Lógica de negócio, cálculos, integrações | Recebe Prisma client ou dados, retorna resultados |
| `plugins/` | Cross-cutting (auth, prisma, queues) | Registrados no Fastify, decoram `fastify.*` |

### Requirements to Structure Mapping

**FR → Arquivo/Diretório:**

| FR | Backend | Frontend | Testes |
|---|---|---|---|
| FR-SEC-001~008 | ✅ `plugins/auth-guard.ts`, `plugins/jwt.ts` | ✅ `components/AuthContext.tsx` | ✅ existentes |
| FR-WPL-001~005 | 📝 `routes/workplaces/index.ts` | 📝 `app/workplaces/page.tsx` | 🆕 `test/routes/workplaces.test.ts` |
| FR-COV-001~005 | 📝 `modules/coverage-engine/`, `routes/coverages/` | 🆕 `components/CoverageGantt.tsx`, 📝 `app/coverage/page.tsx` | 🆕 `test/routes/coverages.test.ts` |
| FR-APR-001~005 | 📝 `routes/vacations/index.ts` (bulk-create) | 🆕 `components/BulkVacationTable.tsx`, `components/CoverageModal.tsx` | 🆕 `test/routes/vacations.test.ts` |
| FR-AI-001~003 | 🆕 `modules/ai/prompt-builder.ts`, 📝 `routes/predict/` | 🆕 `components/AIChat.tsx`, 📝 `app/predict/page.tsx` | 🆕 `test/modules/prompt-builder.test.ts` |
| FR-WHK-001~005 | 📝 `routes/webhooks/`, `modules/integrations/webhook-service.ts` | — (config em settings) | ✅ `test/modules/webhook-service.test.ts` |
| FR-NOT-001, FR-AUD-001~002 | ✅ existentes | — | ✅ existentes |
| FR-UI-001~009 | — | 📝/🆕 ver tree acima | 🆕 `components/__tests__/` |

**Cross-Cutting → Localização:**

| Concern | Arquivos |
|---|---|
| Tenant Isolation | `plugins/prisma.ts` (Extension), toda rota via `request.user.tenantId` |
| Auditoria | `modules/shared/audit-service.ts`, chamado em rotas de mutação |
| Validação CLT | `modules/vacations/vacation-engine.ts`, chamado em create/approve |
| Error Format | `plugins/error-handler.ts`, formato padrão em todas as rotas |
| WebSocket Events | `plugins/websocket.ts`, broadcast em rotas de approve/reject/coverage |
| Background Jobs | `plugins/queues.ts` + `plugins/worker.ts`, dispatch em rotas |

### Integration Points

**Data Flow — Fluxo principal (Aprovar Férias com Cobertura):**

```
Frontend (approvals/page.tsx)
  → POST /vacations/requests/:id/approve { coverageEmployeeId }
    → Route handler (vacations/index.ts)
      → VacationEngine.validateRequest()          [validação CLT]
      → prisma.vacationRequest.update(APPROVED)   [persistência]
      → CoverageEngine.createAssignment()          [cobertura]
      → AuditService.log()                         [auditoria]
      → WebSocket broadcast("vacation.approved")   [real-time]
      → BullMQ: emails:send                        [email async]
      → BullMQ: webhooks:deliver                   [webhook async]
      → BullMQ: signatures:create                  [ZapSign async]
    ← { vacationRequest, coverageAssignment }
  → TanStack Query invalidates(['vacations', 'coverages'])
  → UI atualiza automaticamente
```

**Data Flow — Bulk Create:**

```
Frontend (BulkVacationTable.tsx)
  → POST /vacations/bulk-create { items: [...] }
    → Route handler (vacations/index.ts)
      → Para cada item:
        → VacationEngine.validateRequest()
        → prisma.vacationRequest.create(PENDING)
      ← { created, errors, results: [...] }
  → TanStack Query invalidates(['vacations'])
  → Feedback visual por linha
```

**External Integration Points:**

| Integração | Trigger | Módulo | Queue |
|---|---|---|---|
| ZapSign | Férias aprovadas | `zapsign-service.ts` | `signatures:create` |
| WhatsApp | Aprovação/Rejeição | `whatsapp-service.ts` | fire-and-forget |
| SMTP | Aprovação/Rejeição/Lembrete | `email-service.ts` | `emails:send` |
| LLM (multi-provider) | `/predict/ask` | `prompt-builder.ts` | síncrono (timeout 30s) |
| Webhook externo | Qualquer evento configurado | `webhook-service.ts` | `webhooks:deliver` |

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

| Decisão A | Decisão B | Compatível? | Nota |
|---|---|---|---|
| Prisma 7.6 Client Extension | PostgreSQL 15 | ✅ | Extension API estável no Prisma 7.x |
| TanStack Query v5 | Next.js 16.2 App Router | ✅ | Suporte oficial via `@tanstack/react-query` |
| frappe-gantt | React 19 | ✅ | Wrapper necessário (DOM manipulation) — encapsulado em `<CoverageGantt />` |
| TanStack Table | React 19 + Tailwind | ✅ | Headless, sem conflito de styling |
| WebSocket (Fastify plugin) | TanStack Query | ✅ | WS events invalidam query cache |
| BullMQ + Redis | Docker Compose | ✅ | Redis já no compose |
| PromptBuilder | Multi-provider LLM | ✅ | Builder abstrai provider — usa chaves do Tenant |

Sem contradições entre decisões. Todas as tecnologias são compatíveis entre si.

**Pattern Consistency:**

- ✅ Naming: camelCase TS ↔ snake_case DB maps ↔ kebab-case arquivos — consistente em todo o codebase existente
- ✅ Error format: `{ error, message, statusCode }` padronizado — alinhado com `error-handler` plugin existente
- ✅ Auth pattern: `onRequest` hooks — já usado em todas as 15+ rotas existentes
- ✅ Tenant isolation: Extension centralizada — elimina risco de query sem tenantId

**Structure Alignment:**

- ✅ Novos módulos seguem padrão existente (`modules/{domínio}/{nome}.ts`)
- ✅ Novas rotas seguem padrão existente (`routes/api/v1/{recurso}/index.ts`)
- ✅ Novos componentes seguem padrão existente (`components/{Nome}.tsx`)
- ✅ Testes seguem padrão existente (`test/{camada}/{nome}.test.ts`)

### Requirements Coverage Validation ✅

**Functional Requirements — 44 FRs:**

| Domínio | FRs | Cobertura Arquitetural | Status |
|---|---|---|---|
| Segurança (FR-SEC-001~008) | 8 | JWT, rate-limit, auth-guard, tenant isolation — tudo implementado Sprint 1 | ✅ Completo |
| Gestão de Postos (FR-WPL-001~005) | 5 | CRUD em `routes/workplaces/`, models Prisma existem, `employeeType` enum | ✅ Coberto |
| Motor de Cobertura (FR-COV-001~005) | 5 | `CoverageEngine` módulo + rotas + Gantt frontend + KPIs | ✅ Coberto |
| Fluxo de Aprovação (FR-APR-001~005) | 5 | Rotas vacations (create, approve, reject, list, bulk-create) | ✅ Coberto |
| AI e Previsão (FR-AI-001~003) | 3 | `PromptBuilder` + rotas `/predict/*` + `AIChat` component | ✅ Coberto |
| Webhooks (FR-WHK-001~005) | 5 | `WebhookService` + BullMQ retry + HMAC + test endpoint | ✅ Coberto |
| Notificações/Audit (FR-NOT-001, FR-AUD-001~002) | 3 | `EmailService` + `AuditService` existentes | ✅ Coberto |
| Frontend (FR-UI-001~009) | 9 | Pages + components mapeados, Gantt, BulkTable, CoverageModal, AIChat | ✅ Coberto |

**Non-Functional Requirements — 11 NFRs:**

| NFR | Decisão Arquitetural | Status |
|---|---|---|
| NFR-PERF-001: API < 200ms P95 | Índices compostos, on-demand sem cache, Prisma Extension | ✅ |
| NFR-PERF-002: Dashboard < 3s 4G | Next.js code splitting, lazy loading, TanStack Query cache | ✅ |
| NFR-PERF-003: /predict < 30s | Timeout explícito no PromptBuilder, streaming opcional | ✅ |
| NFR-SEC-001: Tenant isolation 100% | Prisma Client Extension automática | ✅ |
| NFR-SEC-002: Credenciais nunca expostas | API keys nunca em responses, logs redactados | ✅ |
| NFR-SEC-003: JWT_SECRET obrigatório | Validação no startup (já implementado) | ✅ |
| NFR-REL-001: 99.5% uptime | Health checks, restart policies, Docker Swarm | ✅ |
| NFR-REL-002: Jobs com retry | BullMQ exponential backoff, dead-letter, AuditLog | ✅ |
| NFR-TEST-001: ≥70% coverage engines | Testes mapeados para todos os engines + novos | ✅ |
| NFR-OPS-001: docker compose < 5min | Multi-stage builds, layer caching | ✅ |
| NFR-OPS-002: Migrations automáticas | `prisma migrate deploy` no entrypoint | ✅ |

### Implementation Readiness Validation ✅

**Decision Completeness:**

- ✅ 9 decisões arquiteturais com tecnologia + versão + rationale
- ✅ Decisões diferidas documentadas com critério de quando revisitar
- ✅ Sequência de implementação definida (8 passos ordenados por dependência)

**Structure Completeness:**

- ✅ 80+ arquivos mapeados com status (✅/🆕/📝)
- ✅ Todo FR apontando para arquivo(s) específico(s)
- ✅ Boundaries de API, componentes, serviços e dados definidos

**Pattern Completeness:**

- ✅ 14 pontos de conflito cobertos com exemplos concretos
- ✅ Anti-patterns documentados com alternativa correta
- ✅ 8 regras obrigatórias para agentes AI

### Gap Analysis Results

**Critical Gaps:** Nenhum encontrado.

**Important Gaps (não bloqueantes, melhoram implementação):**

| # | Gap | Impacto | Recomendação |
|---|---|---|---|
| 1 | NFR-ACC-001 (PWA ≥320px, touch 44px) sem componente de teste | Acessibilidade pode não ser verificada | Adicionar checklist de acessibilidade no PR review |
| 2 | NFR-SCALE-001 (novos tenants sem código) já funciona mas sem teste automatizado | Regressão possível | Incluir no test suite de rotas (`setup.test.ts`) |
| 3 | `AGENTS.md` no frontend alerta sobre breaking changes no Next.js 16 | Agente pode usar API deprecated | Ler `node_modules/next/dist/docs/` antes de implementar frontend |

**Nice-to-Have Gaps:**

| # | Gap | Recomendação |
|---|---|---|
| 1 | OpenAPI/Swagger (PRD menciona `/api/docs`) | Considerar `@fastify/swagger` no Sprint 5-6 |
| 2 | Monitoring/APM (NFR-PERF-001 menciona APM) | Avaliar Prometheus + Grafana ou serviço externo |
| 3 | Service Worker PWA offline | Escopo pós-V3 (já diferido nas decisões) |

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context analisado (44 FRs, 11 NFRs, 7 cross-cutting concerns)
- [x] Escala e complexidade avaliadas (Alta — 15 componentes)
- [x] Constraints técnicos identificados (brownfield, monorepo, single-VPS)
- [x] Cross-cutting concerns mapeados (tenant, audit, auth, CLT, events, jobs, LLM)

**✅ Architectural Decisions**

- [x] 9 decisões documentadas com versão e rationale
- [x] Stack completa especificada
- [x] Padrões de integração definidos
- [x] Performance e caching estratégia definida

**✅ Implementation Patterns**

- [x] Naming conventions (DB, API, código, componentes)
- [x] Structure patterns (onde cada tipo de arquivo vai)
- [x] Communication patterns (WebSocket, BullMQ, logging)
- [x] Process patterns (auth, validation, error handling, data fetching)

**✅ Project Structure**

- [x] Directory tree completo com 80+ arquivos
- [x] Component boundaries definidos
- [x] Integration points mapeados
- [x] FR → arquivo mapping completo

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** **Alta** — projeto brownfield com stack provada, padrões extraídos de código funcional, 100% dos FRs e NFRs cobertos.

**Key Strengths:**

1. Stack estável e testada em produção (Sprint 1 completo)
2. Prisma Client Extension elimina classe inteira de bugs de tenant isolation
3. Padrões extraídos do código real (não teóricos) — agentes seguem o que já funciona
4. Decisão de "sem cache" elimina complexidade prematura
5. Sequência de implementação ordenada por dependência

**Areas for Future Enhancement:**

1. OpenAPI/Swagger para documentação interativa da API
2. APM/Monitoring para validar NFRs de performance em produção
3. Cache Redis reativo se benchmarks indicarem necessidade
4. Service Worker completo para PWA offline-first

### Implementation Handoff

**AI Agent Guidelines:**

- Seguir todas as decisões arquiteturais exatamente como documentadas
- Usar implementation patterns consistentemente em todos os componentes
- Respeitar project structure e boundaries
- Consultar este documento para qualquer dúvida arquitetural
- **OBRIGATÓRIO:** Ler `frontend-web/AGENTS.md` antes de escrever Next.js

**Sequência de Implementação Recomendada:**

1. Prisma Client Extension (tenant isolation automática)
2. CoverageEngine (gaps, sugestões, encadeamento)
3. PromptBuilder (contexto LLM centralizado)
4. Rotas backend (bulk-create, coverages CRUD, predict, webhooks test)
5. TanStack Query setup no frontend
6. Componentes frontend (Gantt, BulkTable, CoverageModal, AIChat)
7. Páginas frontend (vacations, workplaces, coverage, approvals, predict)
8. Testes (engines ≥70%, rotas, componentes)
