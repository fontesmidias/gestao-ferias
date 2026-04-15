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
