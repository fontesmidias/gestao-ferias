# Handoff — Smoke tests V3 manuais

**Data:** 2026-05-03 (após maratona V3)
**Status do código:** todos os 16 gaps do `audit-2026-05-03.md` (Q1-Q7 + M1-M4 + L1-L3) **resolvidos e em `origin/main`**. Suite **347/347** backend verde.
**Próximo passo:** validar visualmente no browser as 8 stories tocadas, em ambiente real, antes de declarar V3 100% pronto.

---

## ✅ O que foi entregue na maratona (sequência de 7 commits)

| Commit | Item | Story |
|---|---|---|
| `fb7a8a8` | Bundle Q1-Q7 | 1.1 paginação+204, 1.4 índices, 2.2 conflictFree+canChain, 2.3 FERISTA validação, 3.3 motivo obrigatório, 6.4 audit-logs ADMIN |
| `9250202` | M1 KPIs cobertura | 2.5 — endpoint `/coverages/kpis` + Custo Estimado / Feristas Disponíveis |
| `b3c968a` | M3 filtro escopo chat | 4.4 — scope-filter allowlist + cumprimentos |
| `ed45116` | M2 + M4 | 6.3 lembrete férias + audit SMTP; 4.3 ROIEngine.splitCoverage |
| `6c19831` | L2 streaming SSE chat | 4.5 — `/predict/ask/stream` real OpenAI/Anthropic + fallback Gemini/Groq |
| `049f3d6` | L1 PWA offline + push | 5.3 — localStorage cache + banner + sw.js v2 com push handlers |
| `3507d96` | L3 SSE Gantt real-time | 2.4 — tenant-event-bus + `/coverages/events` |

Auditoria completa em `_evo-output/implementation-artifacts/v3-postos-cobertura-ai/audit-2026-05-03.md`.

---

## 🧪 Roteiro de smoke tests manuais

Subir local: `docker-compose up --build` (backend :3000, frontend :3001, postgres :5432, redis :6379).

### 1. Workplaces (Story 1.1, 1.5)
- Login admin → `/workplaces`
- Criar 25+ postos (ou usar import) e validar paginação real (URL `?page=2&limit=20`)
- Deletar posto sem alocações → confirmar 204 (DevTools Network)
- Postos abaixo de minStaff → **badge vermelho visível?** (AC)

### 2. KPIs cobertura (Story 2.5)
- `/coverage` topo: confirmar 3 cards Gaps / Custo Estimado BRL / Feristas Disponíveis
- Card Gaps quando > 0 deve ter **borda + texto rose** (variante Danger)
- Trocar mês no seletor: KPIs devem refetch
- AC visual fino: altura 72px, ícone 16px, label 11px, valor 20px bold — inspect element

### 3. Cobertura real-time (Story 2.4 / L3)
- Abrir `/coverage` em **2 abas distintas** (mesmo tenant)
- Aba A: clicar em gap, atribuir cobertura
- Aba B: deve atualizar **automaticamente sem refresh** (gap muda de vermelho → verde)
- Validar células do Gantt: gap=#EF4444, planejado=#EAB308, coberto=#22C55E

### 4. Aprovação (Story 3.3)
- `/approvals` → tentar rejeitar férias com motivo vazio → toast 422
- Rejeitar com motivo não-vazio → sucesso + email enviado (se SMTP configurado)
- Listagem deve mostrar **badge "COM/SEM cobertura"** em cada card

### 5. Forecast AI (Story 4.3 / M4)
- `/predict` carrega 6 meses
- Cada mês deve mostrar `feristaEfetivoCovers + intermitentesNeeded = uncoveredVacations`
- `estimatedSavedCost` > 0 quando há feristas efetivos disponíveis
- Verificar gráfico Recharts renderizando

### 6. Chat AI (Story 4.4 / M3 + 4.5 / L2)
- `/predict` chat: pergunta out-of-scope ("qual o tempo amanhã?") → resposta educada redirecionando, sem chamar LLM (verificar Network: 1 só request, sem latência LLM)
- Pergunta in-scope com OpenAI/Anthropic configurado: token aparecem **incrementais** (streaming), não em bloco único
- Cumprimento "boa tarde" → resposta de boas-vindas com tópicos suportados
- Suggestion chips: clicar → comportamento idêntico (streaming)

### 7. Lembrete férias (Story 6.3 / M2)
- Como ADMIN, POST `/api/v1/vacation-reminders/run` (Postman) com `{ "dryRun": true, "windowDays": 60 }`
- Deve retornar `{ scanned, matched, hits[] }` sem enviar email
- Repetir com `dryRun: false` (com SMTP global configurado) → emails enviados, hits matched
- Forçar SMTP indisponível: AuditLog deve gravar `EMAIL_REMINDER_FAILED`

### 8. PWA Colaborador (Story 5.3 / L1)
- Login como colaborador → `/employee/dashboard`
- Recarregar com **DevTools → Network → offline ON**
- Banner amarelo "Você está offline" + última atualização timestamp
- Recarregar online → banner some
- Testar Service Worker registrado: DevTools → Application → Service Workers (sw.js v2 ativo)
- Push notification: `pushManager.subscribe(...)` no console (sem VAPID ainda dá erro — esperado, é o TODO)

### 9. Auditoria (Story 6.4 / Q7)
- Como user comum (não ADMIN): `GET /api/v1/audit-logs` → 403
- Como ADMIN: 200, lista paginável

### 10. Tenant isolation (regressão)
- Re-rodar `npx tsx --test test/security/imports-cross-tenant.test.ts` — 23/23 verde

---

## 🚧 Pendências infra (TODOs no código)

São features completas em código, mas dependem de infra para ativar em prod:

### VAPID push notifications (Story 5.3 part 2)
Arquivos prontos: `frontend-web/public/sw.js` (event `push` + `notificationclick`).
Falta:
1. Gerar VAPID keys: `npx web-push generate-vapid-keys`
2. Backend: model `PushSubscription { id, tenantId, userId, endpoint, p256dh, auth }`
3. Endpoint `POST /api/v1/employee/push-subscriptions` para persistir do client
4. Frontend: botão "Ativar notificações" → `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })`
5. Em `/vacations` approve/reject: enviar push via `web-push.sendNotification()` para subscriptions do colaborador
Estimativa: 3-4h

### Cron BullMQ daily reminders (Story 6.3 part 2)
Arquivo: `routes/api/v1/vacation-reminders/index.ts` (TODO no fim).
Falta:
1. Criar `SystemUser` global (tenantId nullable + role 'SYSTEM') para audit logs autônomos
2. Worker file `src/workers/reminder-worker.ts` que escuta queue `notification`
3. No bootstrap: `queues.notification.upsertJobScheduler('reminders-daily', { pattern: '0 8 * * *' }, ...)`
4. Worker itera tenants ativos e chama `runRemindersForTenant`
Estimativa: 2-3h

### Redis Pub/Sub para SSE multi-instance (Story 2.4 part 2)
Arquivo: `modules/coverage-engine/tenant-event-bus.ts`.
Quando subir Swarm com >1 réplica, eventos emitidos em A não chegam a clients conectados em B.
Falta: trocar Map in-memory por `redisClient.publish('tenant:<id>:coverage', ...)` + cada instância subscreve.
Estimativa: 2h

---

## 📊 Estado do épico V3 agregado

| Item | Status |
|---|---|
| Q1-Q7 (5 stories quick wins) | ✅ |
| M1 Story 2.5 KPIs | ✅ |
| M2 Story 6.3 lembrete + audit SMTP | ✅ (cron infra TODO) |
| M3 Story 4.4 filtro escopo chat | ✅ |
| M4 Story 4.3 ROI ferista efetivo | ✅ |
| L1 Story 5.3 PWA offline | ✅ (push infra VAPID TODO) |
| L2 Story 4.5 streaming chat | ✅ |
| L3 Story 2.4 SSE Gantt | ✅ (Redis multi-instance TODO) |
| UX visual smoke tests | ⏳ esta sessão |

---

## 🔁 Como retomar para os smoke tests

```
Vou rodar os smoke tests V3 manuais. Subir docker-compose, validar
seção por seção do HANDOFF, anotar qualquer regressão visual em
TODO list e voltar para fix.

Começa pela seção 1 (Workplaces).
```

Se algum teste falhar visualmente, voltar com `[smoke fail] Story X.Y — descrição` e criar fix narrow.

---

## 🧠 Memórias auto-loaded relevantes

- `project_v3_audit_resolved.md` — sumário desta maratona (criado 2026-05-03)
- `project_v32_import_tirvu.md` — feature anterior fechada
- `feedback_engineering_practices.md` — commits frequentes, CI verde
- `feedback_technical_gotchas.md` — Fastify, Prisma, env vars CI
- `feedback_docker_rebuild.md` — após mudança backend, rebuild container

---

## 📈 Estatísticas da sessão

- **Stories tocadas:** 16 (Q1-Q7, M1-M4, L1-L3)
- **Commits:** 7 + 1 doc
- **Arquivos novos:** `predict/scope-filter.ts`, `notifications/vacation-reminder.ts`, `coverage-engine/tenant-event-bus.ts`, `routes/.../vacation-reminders/`, `routes/.../coverages/events`, `routes/.../predict/ask/stream`, `coverages/kpis`, 3 test files novos
- **Suite backend:** 285 → 347 (+62 cases na maratona)
- **Linhas adicionadas:** ~1500 net
