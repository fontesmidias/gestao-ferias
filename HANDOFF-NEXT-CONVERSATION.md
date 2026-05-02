# Handoff — Continuidade em nova conversa

**Data:** 2026-05-02 (sessão fechada às ~18h GMT-3)
**Feature ativa:** `v3-2-import-tirvu` (Importação em massa de colaboradores via planilha Tirvu)
**Status do épico:** **Backend 100% pronto.** Próximo passo é UI (Story 4.1).

---

## ✅ O que está done (11 stories backend)

Todas commitadas, pushadas, com CI verde, container rebuildado e smoke-tested via Postman.

| Story | Commit | Resumo |
|---|---|---|
| 5.1 — encryption + permissions | `7d0271f` | AES-256-GCM HKDF + `requirePermission()` + 25 tests |
| 2.1 — schema migration | `58cf132` | Employee +10 fields, ImportJob model, 8-state enum, 3 indexes |
| 2.2 — parser + validator | `e98e098` | tirvu-v1 detect/parse + validator + 30 tests + 4 fixtures xlsx |
| 2.3 — matcher + state machine | `4940347` | 2-stage match + 6-way categorization + diff + buildPreviewSummary + 30 tests |
| 1.1 — file storage + cleanup-cron | `5763f75` | sha256 + 0o700 + UUID guard + retenção 90d + 17 tests + volume Docker |
| 3.1 — BullMQ worker + watchdog | `61b5d5f` | queue `imports`, lock distribuído Redis, watchdog 1min + cleanup 03h UTC + 19 tests |
| 1.2 — upload SuperAdmin | `6a5c04f` | POST /admin/imports/employees + 10 tests |
| 1.3 — upload TenantAdmin + DRY | `7bcae0e` | POST /imports/employees + extract `upload-flow.ts` |
| 3.2 — apply chunked + bankData | `046f27a` | Apply route + chunked applier + AuditLog + 15 tests |
| 4.0a — GET status + POST cancel | `f69f12d` | Polling endpoint + cancel + 5 tests |
| 4.0b — GET preview + error-report.xlsx | `75b09a3` | Paginação + xlsx download + 12 tests |

**Resultado consolidado:**
- ✅ tsc zero erros
- ✅ Suite full regression: **245 unit tests pass**
- ✅ CI verde após `cf7499b`
- ✅ Smoke tests Postman validados

## 🔧 Fixes operacionais

- **`cf7499b`** — CI ganhou env vars (BANK_DATA_ENCRYPTION_KEY + IMPORT_*) porque `tsx --test` em ESM hoisteia imports antes do `process.env.X = ...` dos test files.
- **`390b201`** — entrypoints validam `jobId` como UUID antes de tocar Prisma. Sem isso, URL com `:jobId` vazio (variável Postman não preenchida) causava 500 DatabaseError.

## 📦 Artefatos pra você (operador)

- **Postman collection:** [docs/postman/v3-2-import-tirvu.postman_collection.json](docs/postman/v3-2-import-tirvu.postman_collection.json) + environment template + README de setup. ~22 requests cobrindo todos os endpoints com `pm.test()` assertions.

---

## 📋 Próximos passos (em ordem)

### Caminho crítico restante

| Story | Status | Resumo |
|---|---|---|
| **4.1 — UI Upload + Preview** | 📋 next | Frontend: tenant picker, dropzone, banner persistente, tabela virtualizada com filtros, expandir row → diff. Complexidade L. |
| 4.2 — UI Apply + Confirm + Done | 📋 | Confirm modal (typing tenant name), progress polling 2s, summary view, download error-report. Complexidade L. |

### Off-critical (intercaláveis com UI)

| Story | Status | Resumo |
|---|---|---|
| 5.2 — Pino sanitization plugin | 📋 dívida técnica | Middleware global que redacta CPF/bankData/PII em logs. |
| 5.3 — bankData masked GET | 📋 | GET /employees/:id retorna `bankData: { masked: true, last4 }` por default; `X-Show-Bank-Data: true` + permission `bankData.view` retorna decrypted + AuditLog. |

---

## 🐳 Ambiente local (snapshot atual)

### Containers rodando agora

```
gestaoferias_backend_local   gestao-ferias-backend     Up
gestaoferias_frontend_local  gestao-ferias-frontend    Up
gv-postgres                  pgvector/pgvector:pg15    Up (host:5433)
gv-redis                     redis:7-alpine            Up (host:6379)
```

Postgres+Redis são compartilhados com o projeto `gestao-vagas` (decisão 2026-05-01). Banco `gestaoferias` foi criado dentro do `gv-postgres`.

### Para subir do zero

```bash
cd c:/Users/cery0/projetos/gestao-ferias
docker-compose up --build
```

[docker-compose.override.yml](docker-compose.override.yml) aponta backend para `host.docker.internal:5433` (Postgres) e `:6379` (Redis), reusando os containers `gv-*`.

### URLs

- Frontend: http://localhost:3002
- Backend: http://localhost:3000
- API base: http://localhost:3000/api/v1
- Prisma Studio: `cd backend-api && npx prisma studio` (~5555)

### Rebuild backend após mudanças

**Já é regra automática (memória `feedback_docker_rebuild.md`).** Comando:
```bash
docker-compose up -d --build backend
```

---

## 🧪 Estado dos testes

- **Backend unit:** 245/245 pass via `npx tsx --test test/modules/*.test.ts` (CI command)
- **Frontend Vitest:** 6/6 pass
- **TypeScript:** zero erros backend e frontend
- **Smoke manual via Postman:** todos endpoints validados (com fix UUID em 7.1)

---

## 📁 Arquivos importantes

### Specs e plans (todos em `_evo-output/`)

```
_evo-output/planning-artifacts/v3-2-import-tirvu/
  ├── prd.md                              (45 FRs + 36 NFRs)
  ├── architecture.md                     (D1-D11 decisões)
  ├── ux-design-specification.md          (4 estados wireframed)
  ├── implementation-readiness-report.md  (score 99.7%)
  └── epics.md                            (5 epics, 13 stories)

_evo-output/implementation-artifacts/v3-2-import-tirvu/
  ├── 5-1-encryption-and-permissions.md            done
  ├── 1-1-import-storage-and-cleanup.md            review
  ├── 1-2-upload-route-superadmin.md               review
  ├── 1-3-upload-route-tenant-admin.md             review
  ├── 2-1-schema-migration-employee-and-import-job.md  review
  ├── 2-2-tirvu-parser-and-validator.md            review
  ├── 2-3-matcher-and-job-state-transition.md      review
  ├── 3-1-bullmq-worker-and-orchestration.md       review
  ├── 3-2-apply-route-and-applier.md               review
  ├── 4-0a-job-status-and-cancel-routes.md         review
  └── 4-0b-preview-and-error-report-routes.md      review
```

### Código backend (todos em `backend-api/src/modules/imports/`)

```
modules/imports/
  ├── types.ts                          (todos os tipos compartilhados)
  ├── utils.ts                          (BR/CPF/datas/UUID helpers + isUuid)
  ├── bank-data-encryption.ts           (Story 5.1)
  ├── tirvu-parser.ts                   (Story 2.2)
  ├── import-validator.ts               (Story 2.2)
  ├── import-matcher.ts                 (Story 2.3)
  ├── import-job-service.ts             (Story 2.3 — state transition)
  ├── import-storage.ts                 (Story 1.1)
  ├── cleanup-cron.ts                   (Story 1.1)
  ├── tenant-lock.ts                    (Story 3.1)
  ├── worker-pipeline.ts                (Story 3.1 — parse pipeline)
  ├── watchdog.ts                       (Story 3.1)
  ├── upload-flow.ts                    (Story 1.2/1.3 — DRY helper)
  ├── upload-validators.ts              (Story 1.2)
  ├── apply-flow.ts                     (Story 3.2 — route helper)
  ├── apply-pipeline.ts                 (Story 3.2 — apply orchestration)
  ├── apply-validators.ts               (Story 3.2)
  ├── import-applier.ts                 (Story 3.2)
  ├── status-flow.ts                    (Story 4.0a)
  ├── cancel-flow.ts                    (Story 4.0a)
  ├── preview-flow.ts                   (Story 4.0b)
  ├── error-report-flow.ts              (Story 4.0b)
  └── error-report-builder.ts           (Story 4.0b)

plugins/imports.ts                       (Story 3.1 — BullMQ queue + worker)
routes/api/v1/admin/imports/employees/   (Story 1.2 — upload)
routes/api/v1/imports/employees/         (Story 1.3 — upload)
routes/api/v1/admin/imports/jobs.ts      (4.0a/4.0b/3.2 — todas rotas /:jobId/*)
routes/api/v1/imports/jobs.ts            (mesmas rotas, scope tenant)
```

### Frontend (não tocado nesta sessão — pronto pra Story 4.1)

```
frontend-web/src/
  app/admin/imports/employees/page.tsx     🆕 a criar (Story 4.1)
  app/settings/imports/employees/page.tsx  🆕 a criar (Story 4.1)
  components/imports/                      🆕 a criar (Story 4.1)
  lib/api/imports.ts                       🆕 a criar (Story 4.1)
```

---

## 🚀 Para a próxima conversa — copiar e colar como primeira mensagem

```
Estou retomando o trabalho na feature v3-2-import-tirvu.
Por favor leia HANDOFF-NEXT-CONVERSATION.md na raiz pra contexto completo.

Resumo: backend 100% done (Stories 5.1, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1,
3.2, 4.0a, 4.0b — todas commitadas e smoke-tested). Próximo passo é
Story 4.1 (frontend UI Upload + Preview com tenant picker + dropzone +
tabela virtualizada).

Disparar /evo-create-story 4.1 e prosseguir.
```

A IA da próxima conversa vai ler esse arquivo e pegar o estado integral.

---

## 🧠 Memórias relevantes salvas (auto-loaded em toda conversa)

- `feedback_docker_rebuild.md` — auto-rebuild backend após mudanças em `backend-api/src/` ou `prisma/`
- `feedback_engineering_practices.md` — commits frequentes, CI verde, testar local antes deploy
- `feedback_ux_patterns.md` — sidebar hover-expand, info icons, tooltips, plataforma auto-explicativa
- `feedback_technical_gotchas.md` — Fastify autoload, Prisma 7, DELETE body, timezone tests
- `project_v32_import_tirvu.md` — feature overview (atualizada nesta sessão)

---

## 📊 Métricas desta sessão (2026-05-01 → 2026-05-02)

- **Stories completadas:** 11 (todas backend, ordem 5.1→1.1→2.1→2.2→2.3→3.1→3.2→1.2→1.3→4.0a→4.0b)
- **Commits:** 14 (11 stories + CI fix `cf7499b` + Postman docs `d340bf7` + UUID guard `390b201`)
- **Tests adicionados:** 195 unit tests novos (50 → 245)
- **Linhas de código backend:** ~6000 (módulos imports/) + ~700 (rotas) + ~3500 (tests)
- **CI status:** ✅ verde
- **Endpoints REST entregues:** 12 (4 mutativos + 4 leitura + 4 write/cancel admin/tenant scoped)
