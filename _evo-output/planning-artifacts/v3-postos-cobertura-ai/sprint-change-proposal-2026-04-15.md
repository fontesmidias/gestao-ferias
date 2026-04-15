---
workflowType: 'correct-course'
status: 'approved'
approvedAt: '2026-04-15'
approvedBy: 'Bruno'
createdAt: '2026-04-15'
triggeredBy: 'Auditoria pos-V3.0.0 — gaps de integracao criticos'
recommendedPath: 'Direct Adjustment'
scope: 'Moderate'
estimatedEffort: '3 sprints de integracao'
---

# Sprint Change Proposal — Integracao V3.0.1

**Data:** 2026-04-15
**Trigger:** Auditoria completa revelou que V3.0.0 tem features implementadas como modulos isolados, mas integracao entre eles (diferencial do produto) esta ausente.
**Autor:** John (PM Agent) + Auditoria automatizada

---

## 1. Resumo do Problema

O projeto Gestao de Ferias V3.0.0 foi marcado como concluido apos 6 sprints. Uma auditoria completa (2026-04-15) revelou que:

- **Backend compila e frontend builda com sucesso**
- **Todos os 12+ models Prisma estao implementados**
- **Todas as 16 paginas frontend existem**
- **CRUDs funcionam isoladamente**

Porem, as **integracoes entre modulos** — que sao o diferencial competitivo do produto — nao foram implementadas:

| Gap | FR Afetado | Impacto no Produto |
|-----|-----------|-------------------|
| Modal de aprovacao nao pede cobertura | FR-APR-002, FR-UI-005 | **CRITICO** — Diferencial #1 do produto nao funciona |
| Webhooks nunca disparam em eventos reais | FR-WHK-002 | Integracoes externas mortas |
| Rate limiting ausente nas rotas de auth | FR-SEC-005 | Vulnerabilidade de seguranca |
| Endpoint POST /auth/refresh inexistente | FR-SEC-006 | Sessoes expiram sem renovacao |
| PWA sem manifest.json / service worker | FR-UI-007 | App nao instalavel no celular |
| Testes nao rodam (c8 nao instalado) | NFR-TEST-001 | Zero validacao automatizada |
| Bulk create endpoint ausente | FR-APR-005 | Cadastro em massa via formulario impossivel |
| Campo hasCoverage nao retornado | FR-APR-004 | Badge COM/SEM cobertura nao funciona |
| Gantt visual nao implementado (cards no lugar) | FR-UI-003 | Timeline de cobertura menos intuitiva |
| Emails nao disparam nos eventos | FR-NOT-001 | Notificacoes por email mortas |

**Diagnostico:** O problema NAO e de planejamento (PRD, Arquitetura e Epics estao corretos e completos). O problema e de **implementacao incompleta** — modulos foram criados como silos sem as conexoes entre eles.

---

## 2. Analise de Impacto

### Impacto por Epic

| Epic | Completude Real | Stories Pendentes | Prioridade |
|------|----------------|-------------------|-----------|
| Epic 1: Postos e Alocacoes | 100% | Nenhuma | - |
| Epic 2: Motor de Cobertura | 90% | Story 2.4 (Gantt visual) | Media |
| Epic 3: Aprovacao + Cobertura | 60% | Story 3.2, 3.3, 3.4, 3.5 | **CRITICA** |
| Epic 4: AI/Predict | 95% | Timeout explicito, streaming | Baixa |
| Epic 5: PWA | 80% | manifest.json, service worker | Media |
| Epic 6: Webhooks/Notificacoes | 70% | Disparo de eventos, retry, email | Alta |
| Epic 7: Sidebar/Theming | 85% | Theming por tenant | Baixa |

### Impacto nos Artefatos

| Artefato | Precisa de Alteracao? | Detalhes |
|----------|----------------------|----------|
| PRD | **Nao** | FRs estao corretos. Problema e de implementacao. |
| Arquitetura | **Nao** | Decisoes arquiteturais continuam validas. |
| UX Design | **Nao** | Specs de UI estao completas e corretas. |
| Epics/Stories | **Nao** | Stories existentes cobrem tudo que falta. |

### Impacto Tecnico

- **Zero alteracao de schema Prisma** — todos os models ja existem
- **Zero nova dependencia** — exceto c8 (dev dependency para testes)
- **Zero alteracao de arquitetura** — padrao existente e correto
- Backend precisa de **wiring de eventos** (chamar WebhookService.trigger nos handlers de aprovacao/cobertura)
- Frontend precisa de **integracao de componentes** (modal de cobertura no approve, Gantt no coverage)

---

## 3. Abordagem Recomendada: Direct Adjustment

### Por que Direct Adjustment?

1. **Codigo base solido** — Models, endpoints e paginas existem. Falta integrar.
2. **Zero retrabalho** — Nada precisa ser revertido ou reescrito.
3. **Artefatos corretos** — PRD, Arquitetura e Epics nao precisam mudar.
4. **Esforco previsivel** — Integracao entre modulos existentes, nao features novas.

### Plano de Execucao em 3 Sprints

---

### Sprint 7: Integracao Critica (Core do Produto)

**Objetivo:** Conectar aprovacao + cobertura + eventos — o diferencial competitivo.

| # | Story | Descricao | Epic |
|---|-------|-----------|------|
| 1 | **Story 3.5** | Modal de aprovacao com sugestao de cobertura (frontend) | Epic 3 |
| 2 | **Story 3.2** | Backend: approve com coverageEmployeeId opcional, cria CoverageAssignment | Epic 3 |
| 3 | **Story 3.3** | Campo hasCoverage na listagem + badge visual COM/SEM | Epic 3 |
| 4 | **Story 3.4** | POST /api/v1/vacations/bulk-create + tabela editavel frontend | Epic 3 |
| 5 | **Wiring eventos** | WebhookService.trigger() chamado em: approve, reject, coverage.assigned | Epic 6 |
| 6 | **Email wiring** | EmailService chamado nos mesmos eventos (SMTP do tenant) | Epic 6 |

**Criterio de aceite:** Fluxo E2E completo: Solicitar ferias -> Aprovar com cobertura no modal -> Webhook disparado -> Email enviado -> Gap zerado na pagina /coverage.

---

### Sprint 8: Seguranca + Infraestrutura de Eventos

**Objetivo:** Fechar gaps de seguranca e garantir confiabilidade dos eventos.

| # | Item | Descricao | Epic/FR |
|---|------|-----------|---------|
| 1 | **Rate limiting** | Implementar nas rotas de auth (10 req/min por IP) | FR-SEC-005 |
| 2 | **POST /auth/refresh** | Endpoint de refresh token (model ja existe) | FR-SEC-006 |
| 3 | **JWT_SECRET validation** | Recusar startup se nao definido | FR-SEC-007 |
| 4 | **Webhook retry** | BullMQ queue com 3 tentativas e backoff exponencial | FR-WHK-004 |
| 5 | **Instalar c8** | npm install -D c8 no backend | NFR-TEST-001 |
| 6 | **Rodar testes** | Garantir que suite existente passa | NFR-TEST-001 |

**Criterio de aceite:** Rate limiting testado com curl, refresh token funcional, webhooks com retry confirmado, testes rodando localmente.

---

### Sprint 9: PWA + Polimento Visual

**Objetivo:** Tornar PWA instalavel e melhorar visualizacao de cobertura.

| # | Item | Descricao | Epic/FR |
|---|------|-----------|---------|
| 1 | **manifest.json** | Manifest para PWA com icones, nome, tema | FR-UI-007 |
| 2 | **Service worker** | Cache basico de saldo e historico | FR-UI-007 |
| 3 | **Gantt visual** | Substituir cards por CoverageGantt com frappe-gantt | FR-UI-003 |
| 4 | **Theming por tenant** | CSS custom properties para logo/cores | FR-UI-010 |
| 5 | **Testes E2E** | Fluxo completo multi-tenant com 2 tenants | NFR-SEC-001 |

**Criterio de aceite:** PWA instalavel no celular, Gantt visual funcionando, theming aplicado, testes E2E passando.

---

## 4. Mudancas Especificas por Artefato

### Nenhuma alteracao necessaria nos artefatos de planejamento

O PRD, Arquitetura, UX Design e Epics estao **corretos e completos**. As Stories ja documentam exatamente o que precisa ser implementado. Este Sprint Change Proposal adiciona apenas a **sequencia de execucao** (Sprints 7-9) para completar o que ficou pendente.

### Alteracoes no Codigo (resumo)

**Backend — integracao de eventos:**
```
backend-api/src/routes/api/v1/vacations/index.ts
  → approve handler: aceitar coverageEmployeeId, criar CoverageAssignment
  → approve handler: chamar WebhookService.trigger('vacation.approved')
  → approve handler: chamar EmailService.send()
  → reject handler: chamar WebhookService.trigger('vacation.rejected')

backend-api/src/routes/api/v1/vacations/bulk-create.ts (NOVO)
  → POST /api/v1/vacations/bulk-create

backend-api/src/routes/api/v1/auth/refresh.ts (NOVO)
  → POST /auth/refresh

backend-api/src/plugins/rate-limit.ts (NOVO)
  → Plugin Fastify para rate limiting
```

**Frontend — integracao de UI:**
```
frontend-web/src/app/approvals/page.tsx
  → Adicionar modal de cobertura ao aprovar
  → Buscar sugestoes de /coverages/suggestions
  → Enviar coverageEmployeeId no approve

frontend-web/src/app/coverage/page.tsx
  → Substituir cards por CoverageGantt (frappe-gantt)

frontend-web/public/manifest.json (NOVO)
frontend-web/public/sw.js (NOVO)
```

---

## 5. Handoff de Implementacao

### Classificacao de Scope: **Moderate**

Requer reorganizacao do backlog mas nao mudanca de arquitetura ou PRD.

### Responsabilidades

| Papel | Responsabilidade |
|-------|-----------------|
| **Dev (Agent)** | Implementar Sprints 7, 8, 9 seguindo as Stories existentes nos Epics |
| **SM (Agent)** | Acompanhar progresso, gerar sprint status apos cada sprint |
| **QA (Agent)** | Validar criterios de aceite, rodar testes E2E |
| **PM (Agent)** | Validar que o diferencial do produto esta entregue ao final |

### Criterios de Sucesso Final (V3.0.1)

| Metrica | Antes (V3.0.0) | Meta (V3.0.1) |
|---------|----------------|---------------|
| Aprovacao + Cobertura integrados | Nao | Sim — modal funcional |
| Webhooks disparam em eventos reais | Nao | Sim — com retry |
| Rate limiting em auth | Nao | Sim — 10 req/min/IP |
| Refresh token endpoint | Nao | Sim — POST /auth/refresh |
| PWA instalavel | Nao | Sim — manifest + SW |
| Testes rodam localmente | Nao | Sim — c8 instalado |
| Fluxo E2E completo | Parcial | Completo — setup ate cobertura |

### Sequencia Recomendada de Execucao

```
Sprint 7 [Integracao Core]  ██████████  Aprovacao+Cobertura+Eventos
Sprint 8 [Seguranca+Infra]  ████████░░  Rate limit, refresh, retry
Sprint 9 [PWA+Polimento]    ██████░░░░  Manifest, Gantt, theming, E2E
```

**Inicio recomendado:** Imediato — Sprint 7 comecando agora.

---

**Status:** APROVADO por Bruno em 2026-04-15. Execucao iniciando pela Sprint 7.
