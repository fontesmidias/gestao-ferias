---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: 'complete'
completedAt: '2026-04-15'
inputDocuments:
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/prd.md
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/ux-design-specification.md
---

# gestao-ferias - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for gestao-ferias, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-SEC-001: Todos os endpoints, exceto `POST /auth/setup` e `POST /auth/login`, exigem JWT válido. Requisições sem token retornam HTTP 401.
FR-SEC-002: Toda query ao banco inclui filtro `tenantId` derivado do JWT do usuário autenticado. Dados de outros tenants retornam HTTP 404.
FR-SEC-003: Email é unique por tenant (composite index: `email + tenantId`). Duplicata retorna HTTP 409.
FR-SEC-004: CPF é unique por tenant (composite index: `cpf + tenantId`). Duplicata retorna HTTP 409.
FR-SEC-005: Rotas de auth aceitam no máximo 10 requisições por IP por minuto. Excesso retorna HTTP 429.
FR-SEC-006: Access token expira em 15 minutos. Refresh token expira em 30 dias. `POST /auth/refresh` emite novo par mediante refresh token válido.
FR-SEC-007: Aplicação recusa inicialização se `JWT_SECRET` não estiver definido via variável de ambiente.
FR-SEC-008: Rotas de assinatura digital (`/auth/signature/*`) exigem JWT com papel ADMIN ou MANAGER.
FR-WPL-001: CRUD de Postos em `GET/POST/PATCH/DELETE /api/v1/workplaces`. Campos: `name`, `address`, `clientName`, `minStaff`, `tenantId`. Listagem paginada.
FR-WPL-002: CRUD de Posições em `GET/POST/PATCH/DELETE /api/v1/workplaces/:id/positions`. Campos: `role`, `shiftPattern`, `requiredCount`.
FR-WPL-003: Alocações criadas via `POST /api/v1/workplaces/:id/allocations`. Campos: `employeeId`, `workplacePositionId`, `startDate`, `endDate` (nulo = corrente), `status`.
FR-WPL-004: `GET /api/v1/workplaces/:id/staff` retorna colaboradores alocados com nome, função e status.
FR-WPL-005: Colaboradores classificados por tipo contratual (`EFETIVO` ou `INTERMITENTE`) e flag `isFerista` (boolean). Colaboradores com `isFerista: true` são elegíveis para sugestão automática de cobertura — podendo ser Ferista Efetivo (GHS Ferista) ou Ferista Intermitente.
FR-COV-001: `GET /api/v1/coverages/gaps?from=&to=` retorna Postos com períodos sem cobertura: `workplaceId`, `positionId`, `gapStart`, `gapEnd`.
FR-COV-002: `GET /api/v1/coverages/suggestions?vacationRequestId=` retorna feristas disponíveis no período: `employeeId`, `name`, `costEstimate`, `conflictFree`.
FR-COV-003: Sistema detecta disponibilidade encadeada de feristas entre postos: se um ferista cobre Posto A até [data X], o sistema verifica automaticamente sua disponibilidade para cobrir Posto B a partir de [data X+1] sem conflito de alocação.
FR-COV-004: `POST /api/v1/coverages` cria `CoverageAssignment`: `vacationRequestId`, `replacementEmployeeId`, `workplacePositionId`, `startDate`, `endDate`, `type` (FERISTA/INTERMITENTE), `cost`, `status`.
FR-COV-005: `GET /api/v1/coverages` retorna timeline de coberturas com filtros: `workplaceId`, `month`, `status`.
FR-APR-001: `POST /api/v1/vacations/requests` cria solicitação com status `PENDING`, validando saldo e regras CLT. HTTP 422 com código específico para violações.
FR-APR-002: `PATCH /api/v1/vacations/requests/:id/approve` executa em sequência: status → `APPROVED`, cria `CoverageAssignment` (se informado), envia email, dispara webhook.
FR-APR-003: `PATCH /api/v1/vacations/requests/:id/reject` atualiza para `REJECTED`, envia email com motivo, dispara webhook.
FR-APR-004: `GET /api/v1/vacations/requests` inclui campo `hasCoverage` (boolean) por solicitação.
FR-APR-005: `POST /api/v1/vacations/bulk-create` aceita array de items, valida CLT e saldo individualmente. Retorna resultado por item. Máximo 50 itens. Acesso restrito a ADMIN.
FR-AI-001: `GET /api/v1/predict/risks` retorna colaboradores em risco de dobra: `employeeId`, `daysOverdue`, `doubleCost`, `preventiveCost`, `savingsIfScheduledNow`.
FR-AI-002: `GET /api/v1/predict/coverage-forecast?months=3` retorna demanda de intermitentes por mês: `month`, `estimatedIntermittentsNeeded`, `estimatedCost`, `vacationsScheduled`.
FR-AI-003: `POST /api/v1/predict/ask` aceita `{ "question": "string" }` e retorna resposta em linguagem natural fundamentada em dados reais do tenant. Timeout de 30 segundos.
FR-WHK-001: CRUD em `POST/GET/PATCH/DELETE /api/v1/webhooks`. Campos: `url`, `secret`, `events` (array), `isActive`.
FR-WHK-002: Eventos disparados: `vacation.approved`, `vacation.rejected`, `coverage.assigned`, `signature.completed`, `balance.adjusted`.
FR-WHK-003: Payload assinado com HMAC-SHA256 usando `secret` do webhook. Header `X-Signature-256: sha256=<hash>`.
FR-WHK-004: Retry: 3 tentativas com backoff exponencial (30s, 5min, 30min). Falhas registradas como `status: FAILED`.
FR-WHK-005: `POST /api/v1/webhooks/:id/test` dispara payload mock de `vacation.approved`. Retorna `{ "delivered": boolean, "responseStatus": number }`.
FR-NOT-001: Emails via SMTP do tenant nos eventos: aprovação, rejeição e lembrete de vencimento (30 dias antes).
FR-AUD-001: Ações críticas geram `AuditLog`: entidade, ação, userId, tenantId, timestamp, IP de origem.
FR-AUD-002: `GET /api/v1/audit-logs` com filtros `entity`, `userId`, `from`, `to`. Acesso restrito a ADMIN.
FR-UI-001: `/workplaces` lista Postos com: cliente, endereço, alocados vs. capacidade, badge vermelho se gap detectado no próximo mês.
FR-UI-002: Modal de Posto: cadastro, edição e lista de colaboradores alocados em tempo real.
FR-UI-003: `/coverage` exibe Gantt simplificado: eixo X = dias, eixo Y = Postos. Células: verde (coberto), vermelho (gap), amarelo (planejado).
FR-UI-004: KPIs de cobertura: `gapsTotal`, `estimatedCoverageMonthCost`, `availableFeristasCount`.
FR-UI-005: Modal de aprovação inclui "Quem cobre este posto?" com feristas sugeridos e opção "Contratar intermitente — definir depois".
FR-UI-006: Dashboard AI: gráfico de demanda por mês, lista de riscos de dobra, campo de chat com pergunta e resposta da LLM.
FR-UI-007: PWA do Colaborador (`/employee`): saldo real, formulário com validação CLT, histórico com status.
FR-UI-008: Sidebar: Dashboard, Colaboradores, Férias, Postos, Cobertura, Aprovações, AI Oráculo, Webhooks, Configurações.
FR-UI-009: Tela de Férias (`/vacations`) inclui modo "Cadastro em Massa" com tabela editável multi-linha. Validação CLT inline por linha. Submissão via `POST /api/v1/vacations/bulk-create`.
FR-UI-010: Theming por tenant: logo, cor primária, cor secundária e nome exibido. Configuração salva no banco e aplicada dinamicamente via CSS custom properties.

### NonFunctional Requirements

NFR-PERF-001: API responde em menos de 200ms para o percentil 95 sob carga normal (até 50 req/s).
NFR-PERF-002: Dashboard principal carrega em menos de 3 segundos em conexão 4G simulada (10 Mbps).
NFR-PERF-003: Endpoint `/predict/ask` responde em menos de 30 segundos para 95% das consultas. Timeout explícito com mensagem tratada.
NFR-SEC-001: Isolamento de tenant garantido em 100% das queries — verificado por suite de testes com 2 tenants distintos.
NFR-SEC-002: Credenciais sensíveis (SMTP, API keys, JWT secret) nunca retornadas em endpoints nem logadas em texto claro.
NFR-SEC-003: Aplicação recusa inicialização se `JWT_SECRET` não estiver definido via variável de ambiente.
NFR-REL-001: Sistema mantém 99.5% de uptime durante horário comercial (07h–19h, dias úteis).
NFR-REL-002: Jobs em background com retry automático. Falhas após todas as tentativas registradas no AuditLog.
NFR-TEST-001: Cobertura de testes ≥70% para `VacationEngine`, `CoverageEngine`, `ROIEngine`.
NFR-OPS-001: `docker compose up` sobe ambiente completo em menos de 5 minutos em máquina com 8GB RAM.
NFR-OPS-002: Migrations Prisma executam automaticamente no startup do container backend. Zero intervenção manual.
NFR-ACC-001: PWA do Colaborador funcional em dispositivos com tela ≥320px. Elementos interativos com área de toque mínima de 44×44px (WCAG 2.1 AA).
NFR-SCALE-001: Novos tenants criados via `POST /auth/setup` sem alteração de código, schema ou intervenção de engenharia.

### Additional Requirements

**Da Arquitetura:**
- Projeto brownfield — sem starter template. V3 adiciona funcionalidade sobre base existente (Fastify 5, Next.js 16, Prisma 7.6, PostgreSQL 15)
- Prisma Client Extension para tenant isolation automática (substituir queries manuais por Extension)
- PromptBuilder centralizado (`modules/ai/prompt-builder.ts`) — monta contexto LLM com dados reais do tenant
- TanStack Query v5 para state management de server state no frontend
- TanStack Table v8 headless para tabela editável de bulk create
- frappe-gantt encapsulado em `<CoverageGantt />` para timeline visual de cobertura
- BullMQ + Redis para jobs em background: webhook retry, envio de emails, criação de assinaturas ZapSign
- WebSocket broadcast por tenant para eventos em tempo real (vacation.approved, coverage.assigned, gap.detected)
- Health check endpoint `GET /health` com status de PostgreSQL + Redis
- Índices compostos no Prisma: `(tenantId, status)`, `(tenantId, workplaceId, startDate, endDate)`, `(tenantId, employeeType)`
- CI/CD via GitHub Actions (Sprint 6): lint → test → build → deploy via SSH + docker stack deploy
- Sequência de implementação: Prisma Extension → CoverageEngine → PromptBuilder → Rotas backend → TanStack Query → Componentes frontend → Páginas → Testes
- Ler `frontend-web/AGENTS.md` antes de escrever código Next.js (breaking changes Next.js 16)

**Do UX Design:**
- Design system: shadcn/ui (componentes copiados, baseados em Radix UI + Tailwind CSS)
- Direção visual: Compacta — sidebar 220px, row height 28px, card padding 12px, font base 13px, border-radius 6px
- 5 componentes custom a construir: CoverageGanttGrid, BulkCreateTable, KPICard, OracleChat, TenantBrandWrapper
- Desktop-first para painel administrativo (RH, Admin, Diretoria); Mobile-first para PWA do colaborador
- WCAG 2.1 AA: contraste ≥4.5:1, touch targets 44×44px, focus visible, keyboard navigation, aria labels, skip links
- Tenant theming: cores primária/secundária customizáveis via CSS custom properties; cores de status (gap/covered/planned) NÃO customizáveis
- Paleta de status: gap=#EF4444 (vermelho), covered=#22C55E (verde), planned=#EAB308 (amarelo), pending=#3B82F6 (azul), expired=#F97316 (laranja)
- Padrão de feedback: toast (Sonner) para ações, inline para validação de formulários, skeleton loading após 200ms
- Fluxo principal "Vejo o gap, clico, resolvo" — máximo 3 cliques para resolver cobertura
- Sheet lateral (não modal) para detalhes de gap e seleção de ferista; Dialog para confirmações de ação
- Autocomplete com debounce 300ms, Tab entre campos, Enter para próxima linha no bulk create
- Responsive: sidebar colapsável em tablet (56px), bottom nav em mobile, Gantt vira card list em mobile
- Validação CLT preventiva em tempo real: erros explicam regra CLT + como corrigir

### FR Coverage Map

FR-SEC-001: Herdado (Sprint 1) — JWT obrigatório em todos endpoints
FR-SEC-002: Herdado (Sprint 1) — Tenant isolation via tenantId no JWT
FR-SEC-003: Herdado (Sprint 1) — Email unique por tenant
FR-SEC-004: Herdado (Sprint 1) — CPF unique por tenant
FR-SEC-005: Herdado (Sprint 1) — Rate limiting auth 10 req/min
FR-SEC-006: Herdado (Sprint 1) — Access token 15min, refresh 30 dias
FR-SEC-007: Herdado (Sprint 1) — JWT_SECRET obrigatório no startup
FR-SEC-008: Herdado (Sprint 1) — Rotas de assinatura exigem ADMIN/MANAGER
FR-WPL-001: Epic 1 — CRUD de Postos
FR-WPL-002: Epic 1 — CRUD de Posições
FR-WPL-003: Epic 1 — Alocações de colaboradores
FR-WPL-004: Epic 1 — Listagem de staff por posto
FR-WPL-005: Epic 1 — Classificação de tipos de colaborador (EFETIVO/INTERMITENTE + flag isFerista)
FR-UI-001: Epic 1 — Página /workplaces com lista e badges
FR-UI-002: Epic 1 — Modal de Posto (CRUD + lista de alocados)
FR-COV-001: Epic 2 — Detecção de gaps de cobertura
FR-COV-002: Epic 2 — Sugestões de feristas disponíveis
FR-COV-003: Epic 2 — Encadeamento de feristas entre postos
FR-COV-004: Epic 2 — Criação de CoverageAssignment
FR-COV-005: Epic 2 — Timeline de coberturas com filtros
FR-UI-003: Epic 2 — Gantt simplificado de cobertura
FR-UI-004: Epic 2 — KPIs de cobertura
FR-APR-001: Epic 3 — Criação de solicitação de férias com validação CLT
FR-APR-002: Epic 3 — Aprovação com CoverageAssignment integrado
FR-APR-003: Epic 3 — Rejeição com motivo e notificações
FR-APR-004: Epic 3 — Campo hasCoverage na listagem
FR-APR-005: Epic 3 — Bulk create de férias (máx 50 itens)
FR-UI-005: Epic 3 — Modal de aprovação com sugestão de cobertura
FR-UI-009: Epic 3 — Tela de Férias com modo Cadastro em Massa
FR-AI-001: Epic 4 — Riscos de dobra CLT
FR-AI-002: Epic 4 — Forecast de demanda de intermitentes
FR-AI-003: Epic 4 — Chat em linguagem natural com dados reais
FR-UI-006: Epic 4 — Dashboard AI com gráficos e chat LLM
FR-UI-007: Epic 5 — PWA do Colaborador (saldo, solicitação, histórico)
FR-WHK-001: Epic 6 — CRUD de Webhooks
FR-WHK-002: Epic 6 — Eventos de webhook
FR-WHK-003: Epic 6 — HMAC-SHA256 signing
FR-WHK-004: Epic 6 — Retry com backoff exponencial
FR-WHK-005: Epic 6 — Endpoint de teste de webhook
FR-NOT-001: Epic 6 — Emails via SMTP do tenant
FR-AUD-001: Epic 6 — Audit log de ações críticas
FR-AUD-002: Epic 6 — Listagem de audit logs com filtros
FR-UI-008: Epic 7 — Sidebar completa com todos os itens
FR-UI-010: Epic 7 — Theming por tenant (logo, cores, nome)

## Epic List

### Epic 1: Gestão de Postos e Alocações
O Admin e o RH podem cadastrar postos de trabalho, definir posições/funções, alocar colaboradores efetivos e classificar tipos (EFETIVO/INTERMITENTE + flag isFerista). Ao final, a estrutura operacional está refletida no sistema com página dedicada, modal de CRUD e indicadores visuais.
**FRs cobertos:** FR-WPL-001, FR-WPL-002, FR-WPL-003, FR-WPL-004, FR-WPL-005, FR-UI-001, FR-UI-002

## Epic 1: Gestão de Postos e Alocações

O Admin e o RH podem cadastrar postos de trabalho, definir posições/funções, alocar colaboradores e classificar tipos. Ao final, a estrutura operacional está refletida no sistema.

### Story 1.1: CRUD de Postos de Trabalho (Backend + Frontend)

As a **Gestor de RH**,
I want **cadastrar, editar, listar e excluir postos de trabalho**,
So that **a estrutura operacional dos clientes esteja refletida no sistema**.

**Acceptance Criteria:**

**Given** um usuário autenticado com role ADMIN ou MANAGER
**When** faz `POST /api/v1/workplaces` com `{ name, address, clientName, minStaff }`
**Then** o posto é criado com `tenantId` do JWT e retorna HTTP 201 com o objeto criado

**Given** um usuário autenticado
**When** faz `GET /api/v1/workplaces?page=1&limit=20`
**Then** retorna lista paginada de postos do tenant com `{ data: [...], meta: { total, page, limit } }`

**Given** um usuário autenticado com role ADMIN ou MANAGER
**When** faz `PATCH /api/v1/workplaces/:id` com campos parciais
**Then** o posto é atualizado e retorna o objeto atualizado

**Given** um usuário autenticado com role ADMIN
**When** faz `DELETE /api/v1/workplaces/:id`
**Then** o posto é removido e retorna HTTP 204

**Given** um usuário autenticado de outro tenant
**When** tenta acessar um posto que não pertence ao seu tenant
**Then** retorna HTTP 404 (nunca revela existência de dados de outro tenant)

### Story 1.2: CRUD de Posições por Posto (Backend + Frontend)

As a **Admin do tenant**,
I want **definir posições/funções dentro de cada posto com turno e quantidade necessária**,
So that **o sistema saiba quantos e quais profissionais cada posto demanda**.

**Acceptance Criteria:**

**Given** um posto existente no tenant
**When** faz `POST /api/v1/workplaces/:id/positions` com `{ role, shiftPattern, requiredCount }`
**Then** a posição é criada vinculada ao posto e retorna HTTP 201

**Given** um posto existente no tenant
**When** faz `GET /api/v1/workplaces/:id/positions`
**Then** retorna lista de posições do posto com role, turno e quantidade necessária

**Given** uma posição existente
**When** faz `PATCH /api/v1/workplaces/:id/positions/:positionId`
**Then** a posição é atualizada com os campos fornecidos

**Given** uma posição existente
**When** faz `DELETE /api/v1/workplaces/:id/positions/:positionId`
**Then** a posição é removida

### Story 1.3: Alocação de Colaboradores em Postos (Backend + Frontend)

As a **Gestor de RH**,
I want **alocar colaboradores efetivos às posições dos postos**,
So that **o sistema saiba quem trabalha onde e possa detectar gaps quando alguém sair de férias**.

**Acceptance Criteria:**

**Given** um posto com posições cadastradas e colaboradores existentes no tenant
**When** faz `POST /api/v1/workplaces/:id/allocations` com `{ employeeId, workplacePositionId, startDate, endDate }`
**Then** a alocação é criada com status ativo e retorna HTTP 201

**Given** `endDate` como `null`
**When** a alocação é criada
**Then** indica que é alocação corrente (sem data de fim definida)

**Given** um posto existente
**When** faz `GET /api/v1/workplaces/:id/staff`
**Then** retorna colaboradores alocados com nome, função (posição) e status da alocação

**Given** um `employeeId` que não pertence ao tenant
**When** tenta criar alocação
**Then** retorna HTTP 404

### Story 1.4: Classificação de Tipos de Colaborador

As a **Admin do tenant**,
I want **classificar colaboradores por tipo contratual (EFETIVO/INTERMITENTE) e marcar quem é ferista**,
So that **o sistema identifique quem é elegível para sugestão automática de cobertura de postos**.

**Acceptance Criteria:**

**Given** o model Employee com campo `employeeType` (enum: EFETIVO, INTERMITENTE) e `isFerista` (boolean)
**When** um colaborador é cadastrado ou editado
**Then** o tipo contratual deve ser EFETIVO ou INTERMITENTE, e `isFerista` indica elegibilidade para cobertura

**Given** um colaborador com `isFerista: true` e `employeeType: EFETIVO`
**When** exibido na interface
**Then** é identificado como "GHS Ferista" (Ferista Efetivo)

**Given** um colaborador com `isFerista: true` e `employeeType: INTERMITENTE`
**When** exibido na interface
**Then** é identificado como "Ferista Intermitente"

**Given** um colaborador com `isFerista: true`
**When** o CoverageEngine busca substitutos disponíveis
**Then** este colaborador é elegível para sugestão automática, independente do tipo contratual

**Given** um colaborador com `isFerista: false`
**When** o CoverageEngine busca substitutos
**Then** este colaborador NÃO aparece nas sugestões automáticas

**Given** os índices compostos `(tenantId, employeeType)` e `(tenantId, isFerista)` no Prisma
**When** queries filtram por tipo ou flag ferista
**Then** a performance atende P95 < 200ms

### Story 1.5: Página /workplaces com Lista e Modal de CRUD

As a **Gestor de RH**,
I want **uma página dedicada para gerenciar postos com lista, indicadores visuais e modal de cadastro/edição**,
So that **consiga visualizar toda a estrutura operacional e identificar rapidamente postos com problemas**.

**Acceptance Criteria:**

**Given** o usuário autenticado acessa `/workplaces`
**When** a página carrega
**Then** exibe lista de postos com colunas: nome, cliente, endereço, alocados vs. capacidade mínima
**And** postos com capacidade abaixo do mínimo exibem badge vermelho

**Given** o usuário clica em "Novo Posto"
**When** o modal abre
**Then** exibe formulário com campos: nome, endereço, cliente, capacidade mínima
**And** ao salvar, o posto aparece na lista sem refresh

**Given** o usuário clica em um posto existente
**When** o modal de detalhes abre
**Then** exibe dados do posto editáveis e lista de colaboradores alocados em tempo real
**And** permite adicionar/remover alocações diretamente no modal

**Given** a direção visual Compacta definida no UX
**When** a página renderiza
**Then** utiliza shadcn/ui com row height 28px, sidebar 220px e design tokens do projeto

### Epic 2: Motor de Cobertura e Timeline Visual
O Gestor de RH pode visualizar gaps de cobertura em uma timeline Gantt, receber sugestões automáticas de feristas disponíveis (com custo e detecção de encadeamento), resolver gaps com 3 cliques e acompanhar KPIs de cobertura. Fluxo principal: "Vejo o gap, clico, resolvo."
**FRs cobertos:** FR-COV-001, FR-COV-002, FR-COV-003, FR-COV-004, FR-COV-005, FR-UI-003, FR-UI-004

## Epic 2: Motor de Cobertura e Timeline Visual

O Gestor de RH pode visualizar gaps, receber sugestões automáticas de feristas com custo, resolver gaps em 3 cliques e acompanhar KPIs de cobertura.

### Story 2.1: API de Detecção de Gaps de Cobertura

As a **Gestor de RH**,
I want **consultar quais postos têm períodos sem cobertura**,
So that **possa identificar e resolver gaps antes que se tornem problemas operacionais**.

**Acceptance Criteria:**

**Given** postos com colaboradores alocados e férias aprovadas no período
**When** faz `GET /api/v1/coverages/gaps?from=2026-07-01&to=2026-07-31`
**Then** retorna lista de gaps: `{ workplaceId, positionId, gapStart, gapEnd }` para cada posição descoberta

**Given** um posto onde todos os períodos de férias têm cobertura atribuída
**When** consulta gaps no período
**Then** o posto NÃO aparece na resposta

**Given** um colaborador com férias aprovadas e nenhum CoverageAssignment no período
**When** o CoverageEngine calcula gaps
**Then** gera gap correspondente ao período de férias para o posto/posição do colaborador

**Given** queries com filtro de datas
**When** executadas com índice `(tenantId, workplaceId, startDate, endDate)`
**Then** performance atende P95 < 200ms

### Story 2.2: API de Sugestões de Feristas com Custo

As a **Gestor de RH**,
I want **receber sugestões automáticas de feristas disponíveis com custo estimado**,
So that **possa tomar decisão informada sobre quem cobrirá o posto**.

**Acceptance Criteria:**

**Given** uma solicitação de férias aprovada com gap de cobertura
**When** faz `GET /api/v1/coverages/suggestions?vacationRequestId=:id`
**Then** retorna lista de feristas (`isFerista: true`) disponíveis no período: `{ employeeId, name, employeeType, costEstimate, conflictFree }`

**Given** um ferista que já está cobrindo outro posto no mesmo período
**When** aparece nas sugestões
**Then** campo `conflictFree` é `false` e o conflito é descrito

**Given** o CoverageEngine detecta encadeamento possível (ferista cobre Posto A até data X, disponível para Posto B a partir de X+1)
**When** gera sugestões
**Then** inclui o ferista com nota de encadeamento e sem conflito

**Given** nenhum ferista disponível no período
**When** consulta sugestões
**Then** retorna lista vazia (frontend oferece opção "Contratar intermitente")

### Story 2.3: Criação e Listagem de CoverageAssignments

As a **Gestor de RH**,
I want **criar coberturas atribuindo um ferista ou marcando necessidade de intermitente, e consultar a timeline de coberturas**,
So that **os postos fiquem cobertos e a timeline reflita o planejamento**.

**Acceptance Criteria:**

**Given** um gap identificado e um ferista selecionado
**When** faz `POST /api/v1/coverages` com `{ vacationRequestId, replacementEmployeeId, workplacePositionId, startDate, endDate, type, cost }`
**Then** o CoverageAssignment é criado com `status: ACTIVE` e retorna HTTP 201

**Given** `type` é `FERISTA`
**When** o assignment é criado
**Then** o `replacementEmployeeId` deve ter `isFerista: true`, senão retorna HTTP 422

**Given** `type` é `INTERMITENTE`
**When** o assignment é criado
**Then** `replacementEmployeeId` pode ser `null` (a definir posteriormente)

**Given** um usuário autenticado
**When** faz `GET /api/v1/coverages?workplaceId=:id&month=2026-07&status=ACTIVE`
**Then** retorna timeline de coberturas filtrada com dados completos do assignment

### Story 2.4: Componente CoverageGantt e Página /coverage

As a **Gestor de RH**,
I want **visualizar a timeline de cobertura como um Gantt colorido por posto**,
So that **identifique gaps visualmente e clique para resolver diretamente**.

**Acceptance Criteria:**

**Given** o usuário acessa `/coverage`
**When** a página carrega
**Then** exibe Gantt com eixo X = dias/semanas, eixo Y = Postos
**And** células coloridas: verde (coberto), vermelho (gap), amarelo (planejado)

**Given** o usuário clica em uma célula vermelha (gap)
**When** a Sheet lateral abre
**Then** exibe detalhes do gap (posto, posição, período) e lista de feristas sugeridos com custo
**And** permite selecionar ferista ou marcar "Contratar intermitente"

**Given** o usuário confirma cobertura na Sheet
**When** o CoverageAssignment é criado via API
**Then** a célula muda de vermelho para verde em tempo real
**And** toast de confirmação aparece

**Given** frappe-gantt como motor de timeline
**When** o componente `<CoverageGantt />` renderiza
**Then** scroll horizontal suave, zoom toggle semana/mês, hover com tooltip

### Story 2.5: KPIs de Cobertura no Dashboard

As a **Gestor de RH**,
I want **ver indicadores-chave de cobertura no topo da página /coverage**,
So that **tenha visão imediata da situação operacional sem precisar analisar o Gantt**.

**Acceptance Criteria:**

**Given** o usuário acessa `/coverage`
**When** a página carrega
**Then** exibe KPICards com: `gapsTotal` (vermelho se > 0), `estimatedCoverageMonthCost` (R$), `availableFeristasCount`

**Given** uma cobertura é criada ou removida
**When** o cache de dados é invalidado (TanStack Query)
**Then** os KPIs atualizam automaticamente sem refresh

**Given** o componente KPICard na direção Compacta
**When** renderiza
**Then** altura fixa 72px, ícone 16px, label 11px, valor 20px bold
**And** variante Danger (borda vermelha) para gaps > 0

### Epic 3: Fluxo de Aprovação com Cobertura Integrada
O RH pode aprovar/rejeitar férias com cobertura integrada no mesmo modal, incluindo sugestão de substituto. Inclui cadastro em massa de férias com validação CLT inline e tabela editável multi-linha. Aprovação e cobertura tratadas em uma única ação.
**FRs cobertos:** FR-APR-001, FR-APR-002, FR-APR-003, FR-APR-004, FR-APR-005, FR-UI-005, FR-UI-009

### Epic 4: AI Preditiva e Oráculo em Linguagem Natural
A Diretoria pode consultar o Oráculo AI em linguagem natural ("Quantos intermitentes preciso em setembro?") e receber respostas fundamentadas em dados reais do tenant. O RH pode visualizar riscos de dobra CLT e previsão de demanda de intermitentes com dashboard dedicado.
**FRs cobertos:** FR-AI-001, FR-AI-002, FR-AI-003, FR-UI-006

### Epic 5: PWA do Colaborador
O Colaborador pode consultar saldo de férias em tempo real, solicitar períodos com validação CLT preventiva, e acompanhar status das solicitações via PWA mobile-first (≥320px, touch 44px).
**FRs cobertos:** FR-UI-007

### Epic 6: Webhooks, Notificações e Auditoria
O Admin pode configurar webhooks com retry automático, testar entregas, e acessar audit logs. O sistema envia emails nos eventos críticos (aprovação, rejeição, lembrete de vencimento). Integrações externas funcionam de forma confiável com HMAC signing e backoff exponencial.
**FRs cobertos:** FR-WHK-001, FR-WHK-002, FR-WHK-003, FR-WHK-004, FR-WHK-005, FR-NOT-001, FR-AUD-001, FR-AUD-002

### Epic 7: Navegação, Theming e Experiência Unificada
A Sidebar é atualizada com todos os itens de navegação do V3, theming por tenant é aplicado dinamicamente (logo, cores primária/secundária, nome), e a experiência visual é unificada. O Admin pode configurar a marca do tenant em /settings.
**FRs cobertos:** FR-UI-008, FR-UI-010

## Epic 3: Fluxo de Aprovação com Cobertura Integrada

O RH pode aprovar/rejeitar férias com cobertura integrada, cadastrar férias em massa com validação CLT, tudo em uma única ação fluida.

### Story 3.1: Criação de Solicitação de Férias com Validação CLT

As a **Colaborador ou Gestor de RH**,
I want **criar solicitações de férias com validação automática das regras CLT**,
So that **nenhuma solicitação inválida entre no sistema e eu saiba imediatamente o que corrigir**.

**Acceptance Criteria:**

**Given** um colaborador com saldo de férias disponível
**When** faz `POST /api/v1/vacations/requests` com `{ employeeId, startDate, endDate }`
**Then** o VacationEngine valida regras CLT e saldo, cria solicitação com status `PENDING` e retorna HTTP 201

**Given** a data de início cai em quinta ou sexta-feira
**When** tenta criar a solicitação
**Then** retorna HTTP 422 com `{ error: "Legal Block", details: ["Início em quinta/sexta não permitido (CLT Art. 134)"] }`

**Given** o período tem menos de 14 dias corridos (trecho mínimo)
**When** tenta criar a solicitação
**Then** retorna HTTP 422 com detalhes da violação específica

**Given** o colaborador não tem saldo suficiente
**When** tenta criar a solicitação
**Then** retorna HTTP 422 com saldo atual e saldo necessário

### Story 3.2: Aprovação de Férias com Cobertura Integrada

As a **Gestor de RH**,
I want **aprovar férias e definir cobertura do posto em uma única ação**,
So that **não precise navegar para outra tela para resolver a cobertura após aprovar**.

**Acceptance Criteria:**

**Given** uma solicitação PENDING de um colaborador alocado em um posto
**When** faz `PATCH /api/v1/vacations/requests/:id/approve` com `{ coverageEmployeeId? }`
**Then** executa em sequência: status → APPROVED, cria CoverageAssignment (se coverageEmployeeId informado), envia email, dispara webhook

**Given** `coverageEmployeeId` é informado
**When** a aprovação é processada
**Then** o CoverageAssignment é criado automaticamente vinculado à solicitação

**Given** `coverageEmployeeId` não é informado
**When** a aprovação é processada
**Then** férias são aprovadas sem cobertura (gap permanece para resolução posterior)

**Given** a aprovação foi processada com sucesso
**When** o frontend recebe a resposta
**Then** WebSocket broadcast `vacation.approved` para o tenant

### Story 3.3: Rejeição de Férias e Listagem com Status de Cobertura

As a **Gestor de RH**,
I want **rejeitar férias com motivo obrigatório e ver quais solicitações já têm cobertura definida**,
So that **o colaborador saiba por que foi rejeitado e eu priorize as pendências de cobertura**.

**Acceptance Criteria:**

**Given** uma solicitação PENDING
**When** faz `PATCH /api/v1/vacations/requests/:id/reject` com `{ reason }`
**Then** status → REJECTED, email enviado ao colaborador com motivo, webhook disparado

**Given** `reason` está vazio ou ausente
**When** tenta rejeitar
**Then** retorna HTTP 422 — motivo é obrigatório

**Given** um usuário autenticado
**When** faz `GET /api/v1/vacations/requests`
**Then** cada solicitação inclui campo `hasCoverage` (boolean) indicando se tem CoverageAssignment vinculado

**Given** a listagem retornada
**When** exibida no frontend
**Then** badge visual COM/SEM cobertura é exibido por solicitação

### Story 3.4: Cadastro em Massa de Férias (Backend + Frontend)

As a **Gestor de RH**,
I want **cadastrar múltiplas férias de uma vez em uma tabela editável com validação CLT inline**,
So that **a programação anual de férias leve minutos em vez de horas**.

**Acceptance Criteria:**

**Given** um usuário com role ADMIN
**When** faz `POST /api/v1/vacations/bulk-create` com `{ items: [{ employeeId, startDate, endDate }, ...] }`
**Then** valida CLT e saldo individualmente por item e retorna `{ created: number, errors: number, results: [{ employeeId, status, message? }] }`

**Given** mais de 50 itens no array
**When** tenta enviar
**Then** retorna HTTP 422 — máximo 50 itens por requisição

**Given** o usuário acessa `/vacations` e clica "Cadastro em Massa"
**When** a tabela editável aparece
**Then** cada linha tem: autocomplete de colaborador (Command/cmdk), data início, data fim, dias (auto-calculado)
**And** Tab navega entre campos, Enter pula para próxima linha

**Given** uma linha com dados preenchidos
**When** o campo de data perde foco (onBlur)
**Then** validação CLT executa inline: borda esquerda verde (válido) ou vermelha com tooltip (erro CLT com explicação)

**Given** o usuário clica "Enviar Todas"
**When** o bulk-create é processado
**Then** resultado exibido linha a linha: badge verde "Criada" ou badge vermelho com motivo específico

### Story 3.5: Modal de Aprovação com Sugestão de Cobertura (Frontend)

As a **Gestor de RH**,
I want **ver sugestões de feristas com custo diretamente no modal de aprovação**,
So that **tome a decisão de cobertura sem sair do contexto de aprovação**.

**Acceptance Criteria:**

**Given** o usuário clica "Aprovar" em uma solicitação pendente na página `/approvals`
**When** o modal de aprovação abre
**Then** exibe: período das férias, saldo do colaborador, posto alocado
**And** seção "Quem cobre este posto?" com lista de feristas sugeridos (nome, tipo, custo estimado)

**Given** feristas disponíveis no período
**When** listados no modal
**Then** ordenados por custo crescente, com indicação de tipo (GHS Ferista / Ferista Intermitente) e conflitos

**Given** o usuário seleciona um ferista
**When** clica "Aprovar com Cobertura"
**Then** chama approve com `coverageEmployeeId` e fecha o modal com toast de sucesso

**Given** nenhum ferista disponível ou usuário prefere adiar
**When** clica "Contratar intermitente — definir depois" ou "Aprovar sem cobertura"
**Then** férias aprovadas sem CoverageAssignment; gap permanece visível no Gantt

## Epic 4: AI Preditiva e Oráculo em Linguagem Natural

A Diretoria pode consultar o Oráculo AI em linguagem natural e receber respostas fundamentadas em dados reais. O RH visualiza riscos de dobra CLT e previsão de demanda de intermitentes.

### Story 4.1: PromptBuilder — Contexto LLM com Dados Reais do Tenant

As a **desenvolvedor do sistema**,
I want **um módulo centralizado que monta o contexto do tenant para o LLM**,
So that **todas as rotas /predict/* usem dados reais consistentes e testáveis**.

**Acceptance Criteria:**

**Given** um `tenantId` e um `questionType` (risks, forecast, ask)
**When** o PromptBuilder é invocado
**Then** consulta dados reais do tenant: férias agendadas, postos, gaps, custos, feristas disponíveis
**And** monta prompt estruturado com contexto completo para o LLM

**Given** o PromptBuilder montou o contexto
**When** a consulta é feita ao LLM provider configurado no tenant (OpenAI/Anthropic/Gemini/Groq)
**Then** usa a API key do tenant (nunca exposta em logs ou responses)

**Given** o módulo `modules/ai/prompt-builder.ts`
**When** testado unitariamente
**Then** cobertura ≥70% com cenários de contexto vazio, parcial e completo

### Story 4.2: API de Riscos de Dobra CLT

As a **Gestor de RH**,
I want **ver quais colaboradores estão em risco de férias vencidas (dobra CLT)**,
So that **possa agendar preventivamente e evitar custos dobrados**.

**Acceptance Criteria:**

**Given** colaboradores com período aquisitivo próximo do vencimento (12 meses)
**When** faz `GET /api/v1/predict/risks`
**Then** retorna lista: `{ employeeId, name, daysOverdue, doubleCost, preventiveCost, savingsIfScheduledNow }`

**Given** um colaborador com férias já vencidas
**When** aparece na lista de riscos
**Then** `daysOverdue > 0` e `doubleCost` reflete o custo da dobra CLT Art. 137

**Given** um colaborador com férias agendadas dentro do prazo
**When** consulta riscos
**Then** este colaborador NÃO aparece na lista

### Story 4.3: API de Forecast de Demanda de Intermitentes

As a **Diretor**,
I want **saber quantos intermitentes precisarei nos próximos meses e quanto vai custar**,
So that **planeje orçamento e contratações com antecedência**.

**Acceptance Criteria:**

**Given** férias agendadas e gaps projetados nos próximos meses
**When** faz `GET /api/v1/predict/coverage-forecast?months=3`
**Then** retorna por mês: `{ month, estimatedIntermittentsNeeded, estimatedCost, vacationsScheduled }`

**Given** nenhuma férias agendada no período
**When** consulta forecast
**Then** retorna meses com `estimatedIntermittentsNeeded: 0`

**Given** o ROIEngine calcula custos
**When** cobertura pode ser feita por ferista efetivo (custo zero para a empresa)
**Then** o custo estimado reflete apenas intermitentes necessários

### Story 4.4: Chat em Linguagem Natural (Backend)

As a **Diretor**,
I want **fazer perguntas em português sobre a operação e receber respostas com dados reais**,
So that **tome decisões em segundos sem depender de relatórios manuais**.

**Acceptance Criteria:**

**Given** uma pergunta em linguagem natural
**When** faz `POST /api/v1/predict/ask` com `{ "question": "Quantos intermitentes preciso em setembro?" }`
**Then** o PromptBuilder monta contexto real, envia ao LLM, e retorna resposta fundamentada em dados do tenant

**Given** a chamada ao LLM demora mais de 30 segundos
**When** o timeout é atingido
**Then** retorna HTTP 504 com mensagem tratada: "Consulta demorou mais que o esperado. Tente novamente."

**Given** a pergunta está fora do escopo do sistema
**When** o LLM responde
**Then** redireciona educadamente para perguntas suportadas (férias, postos, cobertura, custos)

**Given** a resposta é gerada
**When** retornada ao frontend
**Then** inclui dados fonte: "Baseado em N férias agendadas, M postos com gap, período X-Y"

### Story 4.5: Dashboard AI com Gráficos e Chat (Frontend)

As a **Diretor ou Gestor de RH**,
I want **um dashboard dedicado com gráficos de demanda, lista de riscos e chat com o Oráculo**,
So that **tenha visão estratégica completa em uma única tela**.

**Acceptance Criteria:**

**Given** o usuário acessa `/predict` (AI Oráculo)
**When** a página carrega
**Then** exibe: gráfico de demanda de intermitentes por mês (próximos 3 meses), lista de riscos de dobra CLT com custo, campo de chat

**Given** o usuário digita uma pergunta no campo de chat
**When** pressiona Enter ou clica enviar
**Then** loading skeleton aparece, resposta do LLM renderiza com markdown formatado
**And** seção "Fontes" abaixo da resposta mostra dados utilizados

**Given** sugestões de perguntas pré-definidas (chips clicáveis)
**When** exibidas no estado idle do chat
**Then** incluem: "Quantos intermitentes preciso no próximo trimestre?", "Qual posto fica descoberto semana que vem?", "Quanto vai custar a cobertura do próximo mês?"

**Given** o componente OracleChat
**When** renderiza
**Then** usa streaming de resposta para feedback progressivo
**And** botões "Nova pergunta" e "Limpar" disponíveis

## Epic 5: PWA do Colaborador

O Colaborador pode consultar saldo de férias, solicitar períodos com validação CLT preventiva e acompanhar status via PWA mobile-first.

### Story 5.1: Tela de Saldo e Histórico do Colaborador

As a **Colaborador**,
I want **ver meu saldo de férias em destaque e histórico de solicitações ao abrir o app**,
So that **saiba imediatamente quantos dias tenho e o status dos meus pedidos**.

**Acceptance Criteria:**

**Given** o colaborador autenticado acessa `/employee/dashboard`
**When** a tela carrega
**Then** exibe saldo de férias em número grande centralizado (32px bold, estilo Nubank)
**And** abaixo, lista de solicitações com status colorido: verde (aprovada), amarelo (pendente), vermelho (rejeitada)

**Given** a tela em dispositivo com largura ≥320px
**When** renderiza
**Then** layout single-column, touch targets ≥44×44px, sem scroll horizontal

**Given** o colaborador não tem solicitações
**When** a tela carrega
**Then** exibe saldo + mensagem "Nenhuma solicitação ainda" + botão "Solicitar Férias"

### Story 5.2: Formulário de Solicitação de Férias com Validação CLT

As a **Colaborador**,
I want **solicitar férias pelo celular com validação em tempo real das regras CLT**,
So that **envie pedidos válidos sem precisar conhecer a legislação trabalhista**.

**Acceptance Criteria:**

**Given** o colaborador clica "Solicitar Férias"
**When** o formulário abre
**Then** exibe calendar picker para data início e data fim
**And** dias inválidos (quinta/sexta para início) desabilitados visualmente (cinza)

**Given** datas selecionadas
**When** validação CLT executa em tempo real
**Then** preview mostra: dias calculados, tipo de período, saldo restante após solicitação
**And** se inválido: mensagem explicativa da regra CLT violada com como corrigir

**Given** dados válidos
**When** clica "Enviar Solicitação"
**Then** solicitação criada via API com status PENDING, toast "Solicitação enviada!", card aparece no histórico

**Given** a experiência mobile
**When** o formulário renderiza
**Then** tela única sem scroll excessivo, botão de envio sempre visível, linguagem simples sem jargão

### Story 5.3: Notificações de Status e Acompanhamento

As a **Colaborador**,
I want **ser notificado quando minha solicitação for aprovada ou rejeitada**,
So that **não precise ficar verificando manualmente o status**.

**Acceptance Criteria:**

**Given** uma solicitação do colaborador é aprovada pelo RH
**When** o evento `vacation.approved` é processado
**Then** o card no histórico muda para verde com status "Aprovada"
**And** push notification enviada (quando PWA suportar)

**Given** uma solicitação é rejeitada
**When** o evento `vacation.rejected` é processado
**Then** o card muda para vermelho com status "Rejeitada" e motivo visível
**And** push notification enviada com resumo do motivo

**Given** o colaborador abre a PWA offline (cache disponível)
**When** a tela carrega
**Then** exibe saldo e histórico cacheados com indicador "Dados offline — última atualização: [timestamp]"

## Epic 6: Webhooks, Notificações e Auditoria

O Admin pode configurar webhooks, testar entregas e acessar audit logs. Emails enviados nos eventos críticos. Integrações confiáveis com HMAC e retry.

### Story 6.1: CRUD de Webhooks com HMAC Signing

As a **Admin do tenant**,
I want **configurar webhooks para integração com sistemas externos**,
So that **eventos do GestãoFérias disparem ações automáticas no ERP, ponto ou outros sistemas**.

**Acceptance Criteria:**

**Given** um usuário com role ADMIN
**When** faz `POST /api/v1/webhooks` com `{ url, secret, events: ["vacation.approved", "coverage.assigned"], isActive: true }`
**Then** o webhook é criado e retorna HTTP 201

**Given** um webhook configurado
**When** faz `GET /api/v1/webhooks`
**Then** retorna lista de webhooks do tenant com url, eventos, status ativo/inativo

**Given** um webhook com `secret` definido
**When** um evento é disparado
**Then** o payload é assinado com HMAC-SHA256 usando o `secret` e enviado com header `X-Signature-256: sha256=<hash>`

**Given** eventos suportados
**When** listados
**Then** incluem: `vacation.approved`, `vacation.rejected`, `coverage.assigned`, `signature.completed`, `balance.adjusted`

### Story 6.2: Retry com Backoff Exponencial e Endpoint de Teste

As a **Admin do tenant**,
I want **que falhas de entrega sejam retentadas automaticamente e poder testar webhooks antes de ativar**,
So that **integrações sejam confiáveis e eu possa validar a configuração**.

**Acceptance Criteria:**

**Given** uma entrega de webhook falha (HTTP ≥400 ou timeout)
**When** o BullMQ processa o retry
**Then** retenta 3 vezes com backoff exponencial: 30s, 5min, 30min

**Given** todas as 3 tentativas falharam
**When** a última falha é registrada
**Then** status → `FAILED`, registro no AuditLog com detalhes da falha, dead-letter queue

**Given** um webhook configurado
**When** faz `POST /api/v1/webhooks/:id/test`
**Then** dispara payload mock de `vacation.approved` e retorna `{ "delivered": boolean, "responseStatus": number }`

### Story 6.3: Envio de Emails via SMTP do Tenant

As a **sistema**,
I want **enviar emails automaticamente nos eventos críticos usando SMTP configurado por tenant**,
So that **colaboradores e gestores sejam notificados sem intervenção manual**.

**Acceptance Criteria:**

**Given** uma solicitação de férias é aprovada
**When** o evento é processado
**Then** email de aprovação enviado ao colaborador via SMTP do tenant (assíncrono via BullMQ)

**Given** uma solicitação é rejeitada
**When** o evento é processado
**Then** email de rejeição enviado com motivo da rejeição

**Given** um colaborador com férias vencendo em 30 dias
**When** o job de lembrete executa
**Then** email de alerta enviado ao colaborador e ao gestor de RH

**Given** SMTP do tenant não configurado ou com erro
**When** o envio falha
**Then** falha registrada no AuditLog, sem falha silenciosa (NFR-REL-002)

### Story 6.4: Audit Log de Ações Críticas

As a **Admin do tenant**,
I want **que todas as ações críticas sejam registradas com quem fez, quando e de onde**,
So that **tenha rastreabilidade completa para conformidade e investigações**.

**Acceptance Criteria:**

**Given** uma ação crítica é executada (aprovação, rejeição, criação de cobertura, alteração de webhook, etc.)
**When** o AuditService registra o evento
**Then** grava: entidade, ação, userId, tenantId, timestamp, IP de origem, previousData/newData

**Given** um usuário ADMIN
**When** faz `GET /api/v1/audit-logs?entity=VacationRequest&userId=:id&from=2026-04-01&to=2026-04-30`
**Then** retorna lista filtrada de audit logs do tenant

**Given** um usuário sem role ADMIN
**When** tenta acessar `/api/v1/audit-logs`
**Then** retorna HTTP 403

## Epic 7: Navegação, Theming e Experiência Unificada

Sidebar atualizada com todos os itens V3, theming dinâmico por tenant, experiência visual unificada.

### Story 7.1: Sidebar Completa com Navegação V3

As a **qualquer usuário autenticado**,
I want **uma sidebar com todos os módulos do V3 organizados por seção**,
So that **navegue para qualquer funcionalidade do sistema de forma intuitiva**.

**Acceptance Criteria:**

**Given** o usuário autenticado acessa qualquer página
**When** a sidebar renderiza
**Then** exibe itens: Dashboard, Colaboradores, Férias, Postos, Cobertura, Aprovações, AI Oráculo, Webhooks, Configurações
**And** organizados por seção: "Operacional", "Inteligência", "Configurações"

**Given** uma página com pendências (ex: Aprovações com 5 solicitações pendentes)
**When** a sidebar renderiza
**Then** badge numérico exibido ao lado do item (ex: "Aprovações 5")

**Given** a direção Compacta (220px)
**When** a sidebar renderiza em desktop
**Then** largura fixa 220px, itens com ícone 16px + label 13px, item ativo com borda esquerda primária

**Given** tela < 768px (mobile)
**When** a sidebar é acessada
**Then** exibe como Sheet overlay, não fixa

### Story 7.2: Theming Dinâmico por Tenant

As a **Admin do tenant**,
I want **configurar logo, cores primária/secundária e nome exibido da minha empresa**,
So that **o sistema reflita a identidade visual do meu negócio**.

**Acceptance Criteria:**

**Given** o Admin acessa `/settings`
**When** configura `brandPrimaryColor`, `brandSecondaryColor`, `brandLogoUrl` e `brandName`
**Then** valores salvos no model Tenant via API

**Given** qualquer usuário do tenant faz login
**When** a aplicação carrega
**Then** CSS custom properties `--primary`, `--primary-hover`, `--primary-light` são injetadas no `:root` com as cores do tenant
**And** logo exibida na sidebar/header, nome exibido no título

**Given** o tenant não configurou cores customizadas
**When** a aplicação carrega
**Then** usa valores padrão: `--primary: #2563EB` (Blue 600)

**Given** o Admin tenta salvar uma cor muito clara
**When** o contraste contra branco é < 4.5:1
**Then** aviso exibido: "Cor muito clara — pode prejudicar a leitura"
**And** cores de status (gap, coberto, planejado) NÃO são afetadas pelo theming (fixas e semânticas)
