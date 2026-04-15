---
workflowType: 'prd'
workflow: 'edit'
classification:
  domain: 'Gestão de férias e cobertura operacional de mão de obra terceirizada'
  projectType: 'Aplicação web SaaS multi-tenant com painel administrativo, API REST e PWA'
  complexity: 'Alta'
  projectContext: 'brownfield'
inputDocuments:
  - docs/PLANO-REVISAO-COMPLETA-V3.md
  - docs/GUIA-DEV-LOCAL.md
  - docs/PESQUISA-MODULO-ASSINATURA-DIGITAL.md
  - FINAL_PROJECT_REPORT.md
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-e-01-discovery
  - step-e-01b-legacy-conversion
  - step-e-02-review
  - step-e-03-edit
lastEdited: '2026-04-14'
editHistory:
  - date: '2026-04-14'
    changes: 'Reestruturação completa para formato EVO. 8 seções construídas a partir do PLANO-REVISAO-COMPLETA-V3.md.'
---

# Product Requirements Document — GestãoFérias V3.0

**Autor:** Bruno
**Data:** 2026-04-14
**Versão:** 3.0
**Empresa:** Green House — Terceirização de Mão de Obra

---

## Executive Summary

**GestãoFérias** é uma plataforma SaaS de gestão operacional para empresas de terceirização de mão de obra. O produto vai além do controle de férias: integra planejamento de cobertura de postos, substituição inteligente de colaboradores e inteligência preditiva para tomada de decisão gerencial.

**Problema central:** Quando um colaborador de uma terceirizadora entra em férias, o posto onde trabalha (hospital, tribunal, empresa cliente) precisa de um substituto. Decidir quem substitui, de que tipo (ferista efetivo ou intermitente contratado), quando e a que custo é feito hoje de forma manual, em planilhas ou por memória do RH.

**Solução:** Plataforma que conecta o fluxo de férias ao planejamento de cobertura, com motor de sugestão de substitutos, detecção automática de gaps, previsão de demanda de intermitentes e chat em linguagem natural para a diretoria.

**Usuários-alvo:**
- **RH (Gestor):** Aprova férias, define coberturas, monitora gaps, configura postos
- **Colaborador:** Consulta saldo de férias, solicita períodos via PWA mobile
- **Diretoria:** Consulta AI em linguagem natural ("Quantos intermitentes preciso em setembro?")
- **Admin do sistema:** Configura tenants, postos, posições e integrações

**Contexto:** Projeto brownfield — V2.0 funcional com Docker, JWT multi-tenant, Approval Flow, PWA e módulo AI Predict. A V3 expande com gestão de postos, CoverageEngine e AI com dados reais.

**Diferencial único:** Única solução no mercado que integra férias + cobertura de postos + AI preditiva de demanda específica para terceirizadoras.

---

## Success Criteria

| Métrica | Estado Atual (V2) | Meta V3.0 | Método de Medição |
|---|---|---|---|
| Endpoints funcionais | ~60% | 100% | Suite de testes de integração |
| Páginas conectadas ao backend real | ~50% | 100% | Revisão manual + testes E2E |
| Falhas de segurança críticas | 6 abertas | 0 | Audit de segurança |
| Cobertura de testes automatizados | ~15% | ≥70% | Relatório de cobertura (c8) |
| Features mock/hardcoded em produção | 4+ | 0 | Code review |
| Deploy local funcional (docker compose up) | Não validado | Validado e documentado | Teste de setup do zero |
| Gestão de Postos e Cobertura | 0% implementado | 100% funcional | Fluxo E2E |
| AI com dados reais do banco | 0% | Funcional e testado | Teste manual + dados reais |
| Chat em linguagem natural | 0% | Funcional | Validação com 5 perguntas reais |
| Multi-tenant isolation | Parcial (bugs) | 100% garantido | Testes de isolamento cross-tenant |

**Critérios de aceitação críticos (go/no-go para produção):**
- Zero endpoints sem autenticação expondo dados sensíveis
- Isolamento de tenant verificado em 100% das queries críticas
- Fluxo completo Setup → Cadastro → Férias → Cobertura funcional do início ao fim
- Deploy na VPS via Portainer com uptime ≥99.5% nas primeiras 72h

---

## Product Scope

### MVP — Sprints 1 e 2: Fundação Segura + Modelo de Dados

**Sprint 1 — Segurança (pré-requisito para tudo)**
- Todos os endpoints protegidos por autenticação JWT
- Isolamento multi-tenant corrigido em todas as queries
- Refresh token implementado
- Rate limiting nas rotas de auth

**Sprint 2 — Postos, Cobertura e Substituição (core do produto)**
- Model `Workplace` (Posto): nome, endereço, cliente, capacidade mínima
- Model `WorkplacePosition` (Posição/Função no Posto)
- Model `WorkplaceAllocation` (Alocação de colaborador no posto)
- Model `CoverageAssignment` (Cobertura: quem substitui quem, onde, quando)
- CRUD completo via API para Postos e Posições
- Seed com dados de exemplo: 3 postos, 10 colaboradores alocados, 2 feristas

### Growth — Sprints 3 e 4: Backend e Frontend Funcionais

**Sprint 3 — Backend 100% funcional**
- Todas as rotas stub substituídas por lógica real
- `CoverageEngine`: sugere substitutos, calcula custo, detecta gaps, encadeamento de feristas
- AI/Oráculo com contexto real: `/predict/risks`, `/predict/coverage-forecast`, `/predict/ask`
- Webhooks funcionais com retry e endpoint de teste
- Envio real de emails via SMTP do tenant
- Audit log em ações críticas

**Sprint 4 — Frontend 100% conectado**
- Página `/workplaces` com gestão de postos e indicadores de gap
- Página `/coverage` com timeline visual (Gantt simplificado) por posto
- Fluxo de aprovação com modal de cobertura (sugestão automática de feristas)
- Dashboard AI com dados reais e chat em linguagem natural
- PWA do Colaborador com saldo real, submit real e histórico

### Vision — Sprints 5 e 6: Qualidade e Produção

**Sprint 5 — Qualidade Total**
- Cobertura de testes ≥70% (backend + frontend)
- Validação E2E de todos os fluxos críticos
- Testes multi-tenant com 2 tenants isolados

**Sprint 6 — Deploy e Produção**
- Docker Swarm configurado para VPS
- CI/CD via GitHub Actions
- Health checks e retry no entrypoint
- Deploy validado na VPS via Portainer
- Documentação final V3.0

---

## User Journeys

### Journey 1: RH planeja cobertura de um posto

**Ator:** Gestor de RH | **Trigger:** Férias aprovadas ou próximas do vencimento

1. Acessa `/coverage` — visualiza timeline de postos
2. Identifica posto com gap vermelho no período das férias
3. Seleciona o gap → sistema sugere feristas disponíveis com custo calculado
4. Escolhe ferista efetivo **ou** marca "contratar intermitente"
5. Cobertura criada → posto sai do estado de gap → webhook disparado
6. Dashboard exibe KPIs atualizados: gaps zerados, custo total do mês

**Resultado:** Zero postos descobertos no período; custo de cobertura documentado.

---

### Journey 2: RH aprova férias com cobertura integrada

**Ator:** Gestor de RH | **Trigger:** Solicitação de férias pendente na fila

1. Acessa `/approvals` → lista solicitações com badge COM/SEM cobertura definida
2. Abre solicitação → visualiza período, saldo, posto do colaborador
3. Clica "Aprovar" → modal pergunta: "Quem cobre este posto?"
4. Sistema lista feristas disponíveis no período com custo estimado
5. Gestor seleciona ferista **ou** marca "Contratar intermitente — definir depois"
6. Férias aprovadas → `CoverageAssignment` criado → email enviado → webhook disparado

**Resultado:** Aprovação e cobertura tratadas em uma única ação.

---

### Journey 3: Colaborador solicita férias via PWA

**Ator:** Colaborador (mobile) | **Trigger:** Deseja solicitar período de férias

1. Abre PWA no celular → tela exibe saldo em tempo real
2. Seleciona período → sistema valida regras CLT (sem início em quinta/sexta)
3. Submete solicitação → status: PENDENTE
4. Recebe notificação push quando RH aprova ou rejeita
5. Histórico de solicitações acessível na tela principal

**Resultado:** Colaborador autônomo; carga de atendimento do RH reduzida.

---

### Journey 4: Diretoria consulta AI em linguagem natural

**Ator:** Diretor | **Trigger:** Necessidade de resposta rápida sem navegar por relatórios

1. Acessa dashboard → seção "Oráculo AI"
2. Digita: *"Quantos intermitentes preciso em setembro?"*
3. LLM recebe contexto real: férias agendadas, postos, gaps, saldo de feristas
4. Resposta exibida com dados reais: "7 intermitentes para 3 postos, custo estimado R$18.400"
5. Opção de exportar resposta como PDF

**Outras perguntas suportadas:** "Qual posto fica descoberto semana que vem?", "Quanto vai custar a cobertura do próximo trimestre?", "Quais colaboradores estão próximos de vencer férias?"

**Resultado:** Decisão em segundos sem dependência de relatórios manuais.

---

### Journey 5: Admin configura postos e alocações

**Ator:** Administrador do tenant | **Trigger:** Novo cliente ou reorganização de postos

1. Acessa `/workplaces` → cadastra Posto (nome, endereço, cliente, capacidade mínima)
2. Adiciona Posições ao Posto (função, turno, quantidade necessária)
3. Aloca colaboradores efetivos às Posições
4. Define feristas para cobertura geral
5. Configura webhooks para integração com sistema de ponto ou ERP

**Resultado:** Estrutura operacional refletida no sistema, pronta para planejamento de cobertura.

---

### Journey 6: RH cadastra férias em massa via formulário

**Ator:** Operador de RH | **Trigger:** Programação anual de férias ou agendamento de múltiplos colaboradores

1. Acessa `/vacations` → clica "Cadastro em Massa"
2. Tabela editável aparece com linhas vazias
3. Em cada linha, busca colaborador por nome ou CPF (autocomplete)
4. Preenche datas de início e fim → dias são calculados automaticamente
5. Sistema valida CLT em tempo real: linha verde = ok, vermelha = erro com detalhe
6. Adiciona quantas linhas precisar → clica "Enviar Todas"
7. Resultado exibido linha a linha: criadas com sucesso ou erro específico

**Resultado:** Cadastro de 5-30 férias em minutos, sem necessidade de preparar planilha Excel.

---

## Domain Requirements

### Conformidade Trabalhista (CLT)

**CLT Art. 134 — Período de Férias:**
- Férias concedidas em período único de 30 dias corridos, salvo acordo em 2 ou 3 trechos
- Sistema bloqueia agendamentos com início em quinta-feira ou sexta-feira
- Período mínimo de um trecho: 14 dias corridos

**CLT Art. 137 — Férias Vencidas:**
- Férias não concedidas até 12 meses após o período aquisitivo geram pagamento em dobro
- Sistema identifica colaboradores em risco de vencimento com alerta de "dobra"
- ROIEngine calcula: custo da dobra vs. custo de agendamento preventivo

**Impacto:** VacationEngine valida todas as regras CLT antes de aceitar solicitação. Violações bloqueiam criação com código de erro específico.

---

### Isolamento Multi-Tenant

- Todo model com dados de negócio inclui `tenantId` obrigatório (não-nulável)
- Toda query usa `WHERE tenantId = :currentTenantId` — sem exceções
- Middleware `requireAuth` injeta `tenantId` do JWT em todas as rotas autenticadas
- Testes de isolamento verificam que tenant A não acessa dados do tenant B

---

### LGPD

- Dados pessoais (CPF, email, telefone) acessíveis apenas por usuários autenticados do mesmo tenant
- Audit logs registram quem acessou o quê e quando
- Credenciais SMTP e API keys nunca retornadas em respostas de API nem logadas em texto claro

---

## Innovation Analysis

| Diferencial | Mercado atual | GestãoFérias V3 |
|---|---|---|
| Gestão de férias + cobertura de postos | Separados (RH vs. Operações) | Integrados em uma plataforma |
| Sugestão automática de substitutos | Manual / planilha | CoverageEngine com custo calculado |
| AI preditiva de demanda de intermitentes | Inexistente | `/predict/coverage-forecast` com dados reais |
| Chat em linguagem natural para diretoria | Inexistente | LLM com contexto do banco em tempo real |
| Timeline visual de cobertura por posto | Inexistente | Gantt simplificado com gaps em destaque |

**Barreira de entrada:** Combinação de domínio CLT + modelo operacional de terceirizadoras + AI integrada cria barreira significativa para replicação rápida por competidores genéricos.

---

## Project-Type Requirements

### SaaS Multi-Tenant
- Self-service setup: primeiro usuário cria tenant via `POST /auth/setup`
- Configuração por tenant: SMTP próprio, logo, fuso horário
- Arquitetura preparada para cobrança por tenant (campo `plan` no model Tenant)

### PWA (Progressive Web App)
- Manifest e service worker configurados para instalação no celular
- Funcionalidade offline básica: cache de saldo e histórico do colaborador
- Interface mobile-first para PWA do Colaborador (tela mínima: 320px)
- Notificações push quando férias são aprovadas/rejeitadas

### API-First
- Todos os recursos acessíveis via REST API versionada (`/api/v1/`)
- Autenticação JWT em todos os endpoints (exceto setup e login)
- Respostas JSON padronizadas com campos `data`, `error`, `meta`
- OpenAPI/Swagger disponível em `/api/docs`

### Tempo Real
- WebSocket (`/ws`) para notificações ao vivo no dashboard do RH
- Broadcast de eventos: nova solicitação, aprovação, gap detectado
- Autenticação obrigatória no WebSocket (token via query param)

---

## Functional Requirements

### Segurança e Autenticação

**FR-SEC-001:** Todos os endpoints, exceto `POST /auth/setup` e `POST /auth/login`, exigem JWT válido. Requisições sem token retornam HTTP 401.

**FR-SEC-002:** Toda query ao banco inclui filtro `tenantId` derivado do JWT do usuário autenticado. Dados de outros tenants retornam HTTP 404.

**FR-SEC-003:** Email é unique por tenant (composite index: `email + tenantId`). Duplicata retorna HTTP 409.

**FR-SEC-004:** CPF é unique por tenant (composite index: `cpf + tenantId`). Duplicata retorna HTTP 409.

**FR-SEC-005:** Rotas de auth aceitam no máximo 10 requisições por IP por minuto. Excesso retorna HTTP 429.

**FR-SEC-006:** Access token expira em 15 minutos. Refresh token expira em 30 dias. `POST /auth/refresh` emite novo par mediante refresh token válido.

**FR-SEC-007:** Aplicação recusa inicialização se `JWT_SECRET` não estiver definido via variável de ambiente.

**FR-SEC-008:** Rotas de assinatura digital (`/auth/signature/*`) exigem JWT com papel ADMIN ou MANAGER.

---

### Gestão de Postos

**FR-WPL-001:** CRUD de Postos em `GET/POST/PATCH/DELETE /api/v1/workplaces`. Campos: `name`, `address`, `clientName`, `minStaff`, `tenantId`. Listagem paginada.

**FR-WPL-002:** CRUD de Posições em `GET/POST/PATCH/DELETE /api/v1/workplaces/:id/positions`. Campos: `role`, `shiftPattern`, `requiredCount`.

**FR-WPL-003:** Alocações criadas via `POST /api/v1/workplaces/:id/allocations`. Campos: `employeeId`, `workplacePositionId`, `startDate`, `endDate` (nulo = corrente), `status`.

**FR-WPL-004:** `GET /api/v1/workplaces/:id/staff` retorna colaboradores alocados com nome, função e status.

**FR-WPL-005:** Colaboradores classificados em um de três tipos: `EFETIVO`, `INTERMITENTE` ou `FERISTA`. Colaboradores do tipo FERISTA são elegíveis para sugestão automática de cobertura de postos.

---

### Motor de Cobertura

**FR-COV-001:** `GET /api/v1/coverages/gaps?from=&to=` retorna Postos com períodos sem cobertura: `workplaceId`, `positionId`, `gapStart`, `gapEnd`.

**FR-COV-002:** `GET /api/v1/coverages/suggestions?vacationRequestId=` retorna feristas disponíveis no período: `employeeId`, `name`, `costEstimate`, `conflictFree`.

**FR-COV-003:** Sistema detecta disponibilidade encadeada de feristas entre postos: se um ferista cobre Posto A até [data X], o sistema verifica automaticamente sua disponibilidade para cobrir Posto B a partir de [data X+1] sem conflito de alocação.

**FR-COV-004:** `POST /api/v1/coverages` cria `CoverageAssignment`: `vacationRequestId`, `replacementEmployeeId`, `workplacePositionId`, `startDate`, `endDate`, `type` (FERISTA/INTERMITENTE), `cost`, `status`.

**FR-COV-005:** `GET /api/v1/coverages` retorna timeline de coberturas com filtros: `workplaceId`, `month`, `status`.

---

### Fluxo de Aprovação

**FR-APR-001:** `POST /api/v1/vacations/requests` cria solicitação com status `PENDING`, validando saldo e regras CLT. HTTP 422 com código específico para violações.

**FR-APR-002:** `PATCH /api/v1/vacations/requests/:id/approve` executa em sequência: status → `APPROVED`, cria `CoverageAssignment` (se informado), envia email, dispara webhook.

**FR-APR-003:** `PATCH /api/v1/vacations/requests/:id/reject` atualiza para `REJECTED`, envia email com motivo, dispara webhook.

**FR-APR-004:** `GET /api/v1/vacations/requests` inclui campo `hasCoverage` (boolean) por solicitação.

**FR-APR-005:** `POST /api/v1/vacations/bulk-create` aceita `{ items: [{ employeeId, startDate, endDate }, ...] }`. Valida CLT e saldo individualmente por item. Retorna `{ created: number, errors: number, results: [{ employeeId, status: "created"|"error", message? }] }`. Máximo 50 itens por requisição. Acesso restrito a ADMIN.

---

### AI e Previsão

**FR-AI-001:** `GET /api/v1/predict/risks` retorna colaboradores em risco de dobra: `employeeId`, `daysOverdue`, `doubleCost`, `preventiveCost`, `savingsIfScheduledNow`.

**FR-AI-002:** `GET /api/v1/predict/coverage-forecast?months=3` retorna demanda de intermitentes por mês: `month`, `estimatedIntermittentsNeeded`, `estimatedCost`, `vacationsScheduled`.

**FR-AI-003:** `POST /api/v1/predict/ask` aceita `{ "question": "string" }` e retorna resposta em linguagem natural fundamentada em dados reais do tenant: férias agendadas no próximo trimestre, postos com gap de cobertura, feristas disponíveis e custos projetados. Timeout de 30 segundos; resposta de erro tratada se excedido.

---

### Webhooks

**FR-WHK-001:** CRUD em `POST/GET/PATCH/DELETE /api/v1/webhooks`. Campos: `url`, `secret`, `events` (array), `isActive`.

**FR-WHK-002:** Eventos disparados: `vacation.approved`, `vacation.rejected`, `coverage.assigned`, `signature.completed`, `balance.adjusted`.

**FR-WHK-003:** Payload assinado com HMAC-SHA256 usando `secret` do webhook. Header `X-Signature-256: sha256=<hash>`.

**FR-WHK-004:** Retry: 3 tentativas com backoff exponencial (30s, 5min, 30min). Falhas registradas como `status: FAILED`.

**FR-WHK-005:** `POST /api/v1/webhooks/:id/test` dispara payload mock de `vacation.approved`. Retorna `{ "delivered": boolean, "responseStatus": number }`.

---

### Notificações e Auditoria

**FR-NOT-001:** Emails via SMTP do tenant nos eventos: aprovação, rejeição e lembrete de vencimento (30 dias antes).

**FR-AUD-001:** Ações críticas geram `AuditLog`: entidade, ação, userId, tenantId, timestamp, IP de origem.

**FR-AUD-002:** `GET /api/v1/audit-logs` com filtros `entity`, `userId`, `from`, `to`. Acesso restrito a ADMIN.

---

### Frontend

**FR-UI-001:** `/workplaces` lista Postos com: cliente, endereço, alocados vs. capacidade, badge vermelho se gap detectado no próximo mês.

**FR-UI-002:** Modal de Posto: cadastro, edição e lista de colaboradores alocados em tempo real.

**FR-UI-003:** `/coverage` exibe Gantt simplificado: eixo X = dias, eixo Y = Postos. Células: verde (coberto), vermelho (gap), amarelo (planejado).

**FR-UI-004:** KPIs de cobertura: `gapsTotal`, `estimatedCoverageMonthCost`, `availableFeristasCount`.

**FR-UI-005:** Modal de aprovação inclui "Quem cobre este posto?" com feristas sugeridos e opção "Contratar intermitente — definir depois".

**FR-UI-006:** Dashboard AI: gráfico de demanda por mês, lista de riscos de dobra, campo de chat com pergunta e resposta da LLM.

**FR-UI-007:** PWA do Colaborador (`/employee`): saldo real, formulário com validação CLT, histórico com status.

**FR-UI-008:** Sidebar: Dashboard, Colaboradores, Férias, Postos, Cobertura, Aprovações, AI Oráculo, Webhooks, Configurações.

**FR-UI-010:** Theming por tenant: cada tenant pode configurar logo (upload de imagem), cor primária, cor secundária e nome exibido. Configuração salva no banco (model `Tenant`) e aplicada dinamicamente no frontend via CSS custom properties. Valores padrão usados quando não configurado. Acessível em `/settings` pelo ADMIN.

**FR-UI-009:** Tela de Férias (`/vacations`) inclui modo "Cadastro em Massa" com tabela editável multi-linha. Cada linha contém: campo de busca de colaborador (autocomplete por nome/CPF), data início, data fim e dias (auto-calculado). Validação CLT inline por linha (feedback visual verde/vermelho). Submissão via `POST /api/v1/vacations/bulk-create` com array de `{ employeeId, startDate, endDate }`. Resposta exibe resultado linha a linha (criado ou erro com motivo). Complementa o import via Excel para operações onde preparar planilha é desproporcional.

---

## Non-Functional Requirements

**NFR-PERF-001:** API responde em menos de 200ms para o percentil 95 sob carga normal (até 50 req/s), medido via APM.

**NFR-PERF-002:** Dashboard principal carrega em menos de 3 segundos em conexão 4G simulada (10 Mbps), medido via Lighthouse CI.

**NFR-PERF-003:** Endpoint `/predict/ask` responde em menos de 30 segundos para 95% das consultas. Timeout explícito com mensagem tratada.

**NFR-SEC-001:** Isolamento de tenant garantido em 100% das queries — verificado por suite de testes com 2 tenants distintos.

**NFR-SEC-002:** Credenciais sensíveis (SMTP, API keys, JWT secret) nunca retornadas em endpoints nem logadas em texto claro.

**NFR-SEC-003:** Aplicação recusa inicialização se `JWT_SECRET` não estiver definido via variável de ambiente.

**NFR-REL-001:** Sistema mantém 99.5% de uptime durante horário comercial (07h–19h, dias úteis), medido via monitoramento externo (UptimeRobot ou equivalente) com alertas em tempo real.

**NFR-REL-002:** Jobs em background com retry automático. Falhas após todas as tentativas registradas no AuditLog — sem falha silenciosa.

**NFR-TEST-001:** Cobertura de testes ≥70% para `VacationEngine`, `CoverageEngine`, `ROIEngine`. Medido via relatório c8.

**NFR-OPS-001:** `docker compose up` sobe ambiente completo em menos de 5 minutos em máquina com 8GB RAM. Ambiente local = produção.

**NFR-OPS-002:** Migrations Prisma executam automaticamente no startup do container backend. Zero intervenção manual para deploy.

**NFR-ACC-001:** PWA do Colaborador funcional em dispositivos com tela ≥320px. Elementos interativos com área de toque mínima de 44×44px (WCAG 2.1 AA).

**NFR-SCALE-001:** Novos tenants criados via `POST /auth/setup` sem alteração de código, schema ou intervenção de engenharia.
