---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
status: 'COMPLETE'
completedAt: '2026-04-30'
lastStep: 8
inputDocuments:
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md'
    type: 'prd'
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/implementation-readiness-report.md'
    type: 'readiness-report'
  - path: 'CLAUDE.md'
    type: 'project-context'
  - path: 'backend-api/prisma/schema.prisma'
    type: 'current-schema'
  - path: '_evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md'
    type: 'prior-architecture'
workflowType: 'architecture'
project_name: 'gestao-ferias'
user_name: 'Bruno'
date: '2026-04-29'
feature: 'v3-2-import-tirvu'
---

# Architecture Decision Document — Importação Tirvu (v3-2)

**Author:** Winston (Architect)
**Date:** 2026-04-29
**Project:** gestao-ferias
**Feature:** v3-2-import-tirvu

_This document builds collaboratively through step-by-step discovery._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (45 FRs em 8 capability areas):**
- Upload & format validation (6) — multi-tenant, formato fixo Tirvu, retenção de arquivo
- Tenant targeting & authorization (4) — SuperAdmin cross-tenant + TenantAdmin escopado, banner persistente, modal de confirmação
- Parsing, validation & diff preview (9) — parse 46 colunas, validação por linha, match idempotente `(tenantId, cpf)`+`tirvuId`, diff field-by-field, detecção de Workplaces e ausentes (sem auto-inativar)
- Apply async (7) — BullMQ, chunks de 100 linhas, integração VacationEngine, idempotência verificável
- Progress, status & reporting (4) — progresso real-time, sumário, .xlsx de erros baixável
- Auditing & traceability (4) — AuditLog por linha agrupado por importJobId + ImportJob model + IP/UA + SHA-256
- Privacy, security & compliance (5) — encryption bankData, masking, log sanitization, permissões dedicadas, soft-delete
- Schema extension (6) — tirvuId, personalData, address, unionName, geofencingFlags, inactivePending

**Non-Functional Requirements (36 NFRs em 7 categorias) com números concretos:**
- **Performance:** 1k linhas em ≤30s preview / ≤2min apply; 5k em ≤90s preview / ≤5min apply; LCP ≤1.5s; tabela 60fps; bundle delta ≤80kb gz
- **Security:** AES-256-GCM com IV único, TLS 1.2+, 0 vazamentos cross-tenant em CI, log sanitization
- **Scalability:** BullMQ concurrency=2, fairness por tenant, 5k linhas/arquivo MVP, 100 tenants
- **Accessibility:** WCAG 2.1 AA + axe-core no CI, focus trap, role="alert"
- **Integration:** Tirvu format tolerance, parser versionado, VacationEngine não-bloqueante, AuditLog batch
- **Reliability:** auto-fail 15min, transactional chunks, idempotência verificada (2× = 0 changes)
- **Observability:** Pino JSON logs estruturados, Prometheus Phase 2, retenção 5 anos para disputa trabalhista

**Scale & Complexity:**
- Primary domain: **full-stack web app feature** dentro de SaaS multi-tenant
- Complexity level: **Alta** (LGPD + CLT + multi-tenant strict + idempotência + async pipeline + encryption)
- Estimated architectural components: **~12** (parser, validator, matcher, applier, encryption, BullMQ worker, ImportJob persistence, REST controllers, UI flow controller, virtualized table, dropzone, polling client)

### Technical Constraints & Dependencies

**Stack travada (não revisitar):**
- Backend: Fastify 5 + TypeScript + Prisma 7.6 + PostgreSQL 15 + BullMQ + Redis (já em produção V3)
- Frontend: Next.js 16.2 + React 19 + Tailwind + shadcn/ui + TanStack Query (já em produção V3)
- Frontend novo: `react-dropzone` (~10kb gz) + `@tanstack/react-virtual` (~6kb gz) + `xlsx` parser server-side
- Infra: Docker Compose dev, Docker Swarm + Traefik prod (já operante)

**Existing assets para reuso (CRÍTICO — não duplicar):**
- Prisma extension de tenant isolation (cobre todas as queries automaticamente)
- VacationEngine — chamar para inicializar saldo CLT após criar Employee
- AuditLog model — estender com action types `EMPLOYEE_IMPORT_*`
- Workplace model — referenciar; criar via import opt-in
- BullMQ + Redis infra — adicionar nova queue `imports` com worker dedicado, sem mexer nas existentes (email, whatsapp)
- Permission system existente — adicionar `import.run` e `bankData.view` como novas chaves

**Constraints regulatórios:**
- LGPD: criptografia em repouso obrigatória para `bankData`, log sanitization, retenção 5 anos pós-demissão, base legal contratual
- CLT: cálculo de saldo via VacationEngine canônico, datas dd/MM/yyyy, soft-delete preservado

**Constraints de produto:**
- Bruno é dev intermediário, mira produto comercial SaaS, prefere pragmatismo sobre over-engineering
- V3 já em produção — feature precisa **encaixar sem ruptura**, sem feature flags caóticos, sem dependências grandes novas
- Volume MVP: 5k linhas/arquivo, async via BullMQ
- Operadores: SuperAdmin cross-tenant + TenantAdmin escopado

### Cross-Cutting Concerns Identified

1. **Multi-tenant isolation** — toda query, todo arquivo, todo job precisa estar amarrado a `tenantId`. Prisma extension já existe; precisa garantir que **caminho de upload + storage de arquivo + AuditLog + ImportJob** todos respeitam.
2. **Encryption pipeline** — bankData entra cleartext da planilha, sai encrypted no banco. Precisa de fronteira clara: encryption só na borda de persistência (não no ingest, não no preview).
3. **Idempotência** — match `(tenantId, cpf)` + `tirvuId` precisa ser determinístico. Re-import = identificar pre-existentes, computar diff por campo, não duplicar.
4. **Audit trail** — toda criação/atualização/erro/cancelamento gera AuditLog. Precisa de `importJobId` como chave de agrupamento.
5. **Concurrency control** — múltiplos operadores subindo para o mesmo tenant, ou jobs paralelos do mesmo tenant — precisa de fairness mechanism (decisão arquitetural pendente, abordada no Step 4).
6. **Observability** — logs estruturados com `importJobId` em todas as fases (parse/validate/apply) para suporte conseguir diagnosticar.
7. **Feature isolation** — feature ligável/desligável por tenant via flag (`imports.enabled`) para rollout gradual, começando pela Green House.
8. **State machine do ImportJob** — PENDING → PARSING → PREVIEW_READY → APPLYING → COMPLETED / FAILED / CANCELLED. Transições válidas e timeouts precisam ser explícitos.

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack web app feature** dentro de monorepo SaaS multi-tenant brownfield existente. Nenhum starter template novo é aplicável — V3 já está em produção com stack travada.

### Status: N/A (Brownfield)

Não há starter a avaliar. A "fundação" desta feature são as convenções e infraestrutura **já estabelecidas no V3**:

**Backend (`backend-api/`):**
- Fastify 5 + TypeScript + Prisma 7.6 já configurados
- Estrutura de módulos: `src/modules/<domain>/` para lógica de negócio, `src/routes/api/v1/<resource>/` para REST
- Plugin pattern Fastify (auth, prisma, redis, bullmq) em `src/plugins/`
- Pino logging estruturado já configurado
- BullMQ + Redis com workers dedicados por queue

**Frontend (`frontend-web/`):**
- Next.js 16.2 App Router + React 19 + TypeScript
- Tailwind + shadcn/ui (sidebar 220px, fonte 13px, design compacto)
- TanStack Query como client de API
- API client centralizado em `src/lib/api-client.ts`

**Convenções V3 já estabelecidas (a respeitar):**
- Multi-tenant via Prisma extension de `tenantId` scoping
- Rotas REST `/api/v1/<recurso>` com response shape `{ data, error, meta }`
- Migrations Prisma com naming `YYYYMMDDHHMMSS_descricao_snake_case`
- Toda query que toca dados de tenant usa `tenant.scoped()` extension
- AuditLog via helper centralizado, não inserção manual

### Novas dependências necessárias (justificadas pelo escopo da feature)

| Pacote | Versão alvo | Onde | Justificativa |
|---|---|---|---|
| `xlsx` | ^0.20 | backend | Parsing de planilhas Tirvu (já em node_modules como peer). MIT-style dual license — confirmar versão community gratuita ou trocar por `exceljs` |
| `react-dropzone` | ^14 | frontend | Upload area drag-and-drop (FR1, FR2). ~10kb gz, sem deps externas |
| `@tanstack/react-virtual` | ^3 | frontend | Virtualização da tabela de preview (NFR5: 5k rows a 60fps). Compatível com TanStack Query (mesmo author/ecosystem) |
| `zod` | ^3 | backend | Validação por linha (FR12). Já em uso no V3 — não nova dependência |

**Não-dependências (rejeitadas):**
- ❌ XState/state machine library — `useReducer` simples basta para 4 estados (PRD §7); over-engineering
- ❌ Socket.io / SSE — polling 2s atende NFR4; SSE fica para Phase 2 quando volume justificar
- ❌ AWS SDK / S3 client — FS local atende MVP até ~150GB; S3 fica para Phase 2 quando >80% capacidade
- ❌ Bibliotecas de encryption third-party — `crypto` nativo do Node 20+ tem AES-256-GCM nativo, sem necessidade

### Initialization Note

**Não há story de "set up initial project from starter template"** porque:
1. O monorepo `backend-api/` e `frontend-web/` já existe
2. Migrations e schema base já existem
3. Workers BullMQ e infra já operam
4. Esta feature **adiciona módulos** e **estende schema**, sem criar projeto novo

A primeira story do MVP será uma **migration Prisma** (estendendo `Employee` + criando `ImportJob` model) embutida na story que primeiro precisa dos campos novos — conforme guidance do Implementation Readiness Report (Step 5: schema distribuído por story que precisa, não Epic 1 standalone).

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- D1: Schema design for Employee extension + ImportJob model (resolves FR40-45, NFR8 indirectly)
- D2: Encryption strategy for bankData (resolves NFR8, FR35-37)
- D3: BullMQ tenant fairness mechanism (resolves NFR16)
- D4: Original file storage strategy (resolves FR6, NFR19)
- D5: ImportJob state machine + transitions (resolves FR32)
- D6: Authorization model — `import.run` and `bankData.view` permissions (resolves FR8, FR38, NFR11)

**Important Decisions (Shape Architecture):**
- D7: Parser versioning + error reporting strategy (resolves NFR26, FR29)
- D8: Match algorithm + diff computation (resolves FR13, FR14, NFR31)
- D9: API endpoint structure + payload schemas (resolves FR1, FR2, FR20, FR27-30)
- D10: Frontend state machine + polling strategy (resolves NFR3-5, FR17-19)
- D11: Re-import behavior over soft-deleted Employees (gap from IR report)

**Deferred Decisions (Post-MVP / Phase 2):**
- S3 storage migration (when FS hits 80% capacity)
- SSE/WebSocket for progress (when polling overhead justifies)
- Prometheus `/metrics` endpoint (Phase 2 — MVP only Pino logs)
- KMS-based key management (env var key sufices for MVP)

---

### D1 — Data Architecture: Schema Extension + ImportJob

**Decision: estender `Employee` com campos JSON tipados + criar `ImportJob` model.**

**Prisma migration** (nova migration: `20260430000000_add_import_tirvu_v3_2`):

```prisma
// Estende Employee model existente
model Employee {
  // ... campos atuais (cpf, name, hireDate, etc.) ...

  // ============ NOVO: Tirvu external ID ============
  tirvuId        String?  @map("tirvu_id")  // unique per tenant; null para Employees pre-existing

  // ============ NOVO: dados pessoais expandidos ============
  personalData   Json?    @map("personal_data")  // PCD, deficiencia, sexo, RG (nro/orgao/dataEmissao), pisPasep, ctps (nro/serie), nomePai, nomeMae

  // ============ NOVO: endereço estruturado ============
  address        Json?    // cep, logradouro, numero, complemento, bairro, uf, cidade

  // ============ NOVO: dados bancários CRIPTOGRAFADOS ============
  bankDataEnc    Bytes?   @map("bank_data_enc")    // ciphertext binário (IV + tag + ciphertext concatenados)
  bankDataIv     Bytes?   @map("bank_data_iv")     // 12 bytes IV (GCM)
  bankDataTag    Bytes?   @map("bank_data_tag")    // 16 bytes auth tag (GCM)
  // (não há `bankData` em texto claro persistido — apenas decryptado em memória sob `bankData.view` permission)

  // ============ NOVO: misc ============
  unionName        String?  @map("union_name")
  geofencingFlags  Json?    @map("geofencing_flags")  // { outsideFence: bool, noGeo: bool }
  inactivePending  Boolean  @default(false) @map("inactive_pending")
  terminationDate  DateTime? @map("termination_date")

  @@unique([tenantId, tirvuId], name: "tenant_tirvu_unique", map: "employees_tenant_tirvu_unique_idx")
  @@index([tenantId, inactivePending], name: "employees_tenant_inactive_pending_idx")
  // ... outros @@unique já existentes ...
}

// ============ NOVO MODEL: ImportJob ============
model ImportJob {
  id                  String    @id @default(uuid()) @db.Uuid
  tenantId            String    @map("tenant_id") @db.Uuid
  operatorUserId      String    @map("operator_user_id") @db.Uuid

  status              ImportJobStatus @default(PENDING)
  parserVersion       String    @default("tirvu-v1") @map("parser_version")

  filename            String
  fileSize            Int       @map("file_size")
  fileHash            String    @map("file_hash")  // SHA-256 hex
  storagePath         String    @map("storage_path")  // /var/imports/{tenantId}/{jobId}.xlsx

  totalRows           Int?      @map("total_rows")
  rowsProcessed       Int       @default(0) @map("rows_processed")
  rowsCreated         Int       @default(0) @map("rows_created")
  rowsUpdated         Int       @default(0) @map("rows_updated")
  rowsInvalid         Int       @default(0) @map("rows_invalid")
  rowsAbsent          Int       @default(0) @map("rows_absent")  // detected but not in spreadsheet
  workplacesCreated   Int       @default(0) @map("workplaces_created")

  previewSummary      Json?     @map("preview_summary")  // estatísticas + lotações novas + first N rows preview
  errorReportPath     String?   @map("error_report_path")  // path do .xlsx baixável (null até COMPLETED com erros)

  failureReason       String?   @map("failure_reason")
  ipAddress           String?   @map("ip_address")
  userAgent           String?   @map("user_agent")

  createdAt           DateTime  @default(now()) @map("created_at")
  parsedAt            DateTime? @map("parsed_at")
  appliedAt           DateTime? @map("applied_at")
  completedAt         DateTime? @map("completed_at")

  tenant              Tenant    @relation(fields: [tenantId], references: [id])
  operator            User      @relation(fields: [operatorUserId], references: [id])

  @@index([tenantId, status, createdAt], name: "import_jobs_tenant_status_created_idx")
  @@map("import_jobs")
}

enum ImportJobStatus {
  PENDING          // job criado, arquivo persistido, fila aguardando worker
  PARSING          // worker pegou; lendo header e rows
  PREVIEW_READY    // parse + validate + match concluídos; aguardando operador apply/cancel
  APPLYING         // operador apertou apply; chunks em execução
  COMPLETED        // sucesso (com ou sem linhas inválidas)
  FAILED           // falha não-recuperável (ex.: header inválido, banco inconsistente)
  CANCELLED        // operador cancelou no preview
  TIMED_OUT        // job ficou >15min sem progresso (NFR29)
}
```

**Indexes justificados:**
- `(tenantId, tirvuId)` unique → match secundário rápido (FR13)
- `(tenantId, inactivePending)` → busca de "candidatos a inativar" no `/employees`
- `(tenantId, status, createdAt)` → listagem de history por tenant filtrada por status

**Decisão sobre JSON vs colunas separadas:**
- `personalData`, `address`, `geofencingFlags` → JSON: campos pouco consultados, schema evolutivo, integração Tirvu pode adicionar campos no futuro sem migration
- `bankData` → encriptado em 3 colunas binárias separadas (`bankDataEnc`, `bankDataIv`, `bankDataTag`), não JSON, porque o ciphertext é binário e não queremos cleartext em backup/dump nem por acidente
- `tirvuId`, `unionName`, `inactivePending`, `terminationDate` → colunas próprias (queryable, indexable, frequentes)

**Migration distribuída (per IR report):** Bruno, NÃO criar Epic 1 "Schema". Esta migration entra na story "Story 2.1 — Persistir Employee com schema Tirvu completo" (primeira story de Epic 2 que precisa dos campos).

---

### D2 — Encryption Architecture: bankData

**Decision: AES-256-GCM com IV único de 96 bits por registro, key derivation por tenant a partir de master key da env.**

**Por que GCM:** authenticated encryption (detecta tampering), padrão NIST, suportado nativamente em `node:crypto`, sem necessidade de lib externa. Bibliotecas como `@aws-crypto` são over-kill pra MVP.

**Key management strategy (3 níveis, escolher 1):**

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **(a) Master key única na env** `BANK_DATA_ENCRYPTION_KEY` (32 bytes base64) | Mesma chave para todos os tenants | Simples, pragmático, funciona em Docker Swarm sem KMS | Chave única = blast radius máximo se vazar |
| **(b) Master key + key derivation por tenant** | KDF (HKDF-SHA256) com `tenantId` como salt → chave derivada por tenant | Isolation por tenant; rotação possível trocando master | Mais código mas <30 linhas |
| **(c) KMS (AWS KMS, Vault, etc.)** | Envelope encryption: data key per record, master key no KMS | Compliance grade enterprise; auditoria de uso da chave | Requer infra KMS — Bruno não tem hoje |

**Minha recomendação: (b) — Master key + HKDF derivation por tenant.** Custa pouco código, dá blast radius limitado por tenant, e migra para KMS depois sem mexer no schema.

**Implementação proposta** (`backend-api/src/modules/imports/bank-data-encryption.ts`):

```ts
import { createHmac, randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

const MASTER_KEY = Buffer.from(process.env.BANK_DATA_ENCRYPTION_KEY!, 'base64');
if (MASTER_KEY.length !== 32) throw new Error('BANK_DATA_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');

export function deriveTenantKey(tenantId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', MASTER_KEY, Buffer.from(tenantId), 'gestao-ferias.bankData', 32));
}

export interface BankData {
  tipoPix?: string; chavePix?: string;
  banco?: string; tipoConta?: string; agencia?: string; conta?: string;
}

export interface EncryptedBlob { enc: Buffer; iv: Buffer; tag: Buffer; }

export function encryptBankData(data: BankData, tenantId: string): EncryptedBlob {
  const key = deriveTenantKey(tenantId);
  const iv = randomBytes(12);  // GCM padrão 96 bits
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { enc, iv, tag: cipher.getAuthTag() };
}

export function decryptBankData({ enc, iv, tag }: EncryptedBlob, tenantId: string): BankData {
  const key = deriveTenantKey(tenantId);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}
```

**Boundary clara (FR37 — log sanitization):**
- `bankData` em cleartext **só existe**: durante parse da linha, durante apply em transação, durante decrypt sob `bankData.view`
- **Nunca** trafega em logs, AuditLog cleartext, response API default
- Helper `sanitizeForLog(obj)` no plugin Pino remove campos da blacklist antes da emissão

---

### D3 — BullMQ Concurrency Model + Tenant Fairness ⚠️ DECISÃO CRÍTICA

**Decision: queue única `imports` + BullMQ `groupKey` por tenantId + worker concurrency=2 + per-group concurrency=1.**

**Mecanismo escolhido: BullMQ Pro group key emulado via lock distribuído Redis.**

⚠️ **Heads-up importante:** BullMQ Pro tem `groupKey` nativo, mas é versão paga. Versão community não tem. Vou propor solução **community-friendly**:

**Implementação proposta:**

1. **Worker concurrency=2** (até 2 jobs em flight no worker dedicado)
2. **Lock distribuído Redis por tenantId** (key `imports:lock:{tenantId}`, TTL 16min):
   - Worker pega job da fila
   - Tenta `SET imports:lock:{tenantId} NX EX 960` (16 min, > timeout de 15min do NFR29)
   - **Se conseguir lock:** processa
   - **Se não conseguir** (já tem job desse tenant rodando): re-enfileira com delay 5s (não fica spinning)
3. **Liberação:** `DEL imports:lock:{tenantId}` no finally do processador

**Resultado prático:**
- 2 tenants distintos = 2 jobs em paralelo
- 2 jobs do mesmo tenant = 1 processa, outro espera 5s e re-tenta
- Crash do worker = lock expira em 16min, próximo worker pega

**Por que não as alternativas:**
- ❌ Queue-per-tenant: explosão de queues no Redis (100 tenants = 100 queues), overhead de monitoramento
- ❌ FIFO global puro: 1 tenant gigante (5k linhas, 5min) bloqueia todos os outros
- ❌ Rate limiting BullMQ: rate limit é por queue, não por tenant — não atende fairness
- ❌ BullMQ Pro `groupKey`: pago

**Bruno: confirma a abordagem (a) lock Redis caseiro? Ou (b) prefere licenciar BullMQ Pro pra ter `groupKey` nativo + features de observability?**

---

### D4 — Original File Storage ⚠️ DECISÃO CRÍTICA (operacional)

**Decision: FS local no container backend, volume Docker dedicado.**

**Estrutura:**
```
/var/imports/                                # volume Docker mounted
  {tenantId}/                                # subpasta por tenant (isolation lógico)
    {jobId}.xlsx                             # arquivo original
    {jobId}-errors.xlsx                      # relatório de erros (gerado on apply)
```

**Retenção:** 90 dias via cron diário (`backend-api/src/modules/imports/cleanup-cron.ts`):
```sql
DELETE FROM import_jobs WHERE created_at < now() - interval '90 days';
-- + remoção física dos arquivos correspondentes
```

**Plano de migração para S3/MinIO (Phase 2):** quando volume FS exceder 80% (alarme manual via `df -h` no servidor por enquanto), criar story de migração: substituir `storagePath` por URL S3, helper `storage.ts` abstraído com 2 implementações (FSDriver, S3Driver), feature flag `imports.storage=s3|fs`.

**Bruno: confirma abordagem FS local com retenção 90d? Volume Docker mountado em `/var/imports` no compose precisa ser adicionado.**

---

### D5 — ImportJob State Machine

**Decision: máquina de estados explícita com guards de transição no service.**

**Transições válidas (graph):**
```
PENDING → PARSING (worker pegou da fila)
PARSING → PREVIEW_READY (parse + validate + match OK)
PARSING → FAILED (header inválido, parser crash, file corrupt)
PREVIEW_READY → APPLYING (operador clicou Apply)
PREVIEW_READY → CANCELLED (operador clicou Cancel ou TTL 24h)
APPLYING → COMPLETED (todos chunks processados)
APPLYING → FAILED (erro fatal — banco down, OOM)
QUALQUER_NÃO_TERMINAL → TIMED_OUT (15min sem progresso)
```

Estados terminais: `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT` (não transitam mais).

**Guard implementado em `ImportJobService.transition(jobId, from[], to)`:**
```ts
const tx = await prisma.$transaction(async (db) => {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!from.includes(job.status)) throw new InvalidTransitionError(`${job.status} → ${to} not allowed`);
  return db.importJob.update({ where: { id: jobId }, data: { status: to, ...stamps } });
});
```

**TTL no PREVIEW_READY:** 24h para evitar acumular jobs órfãos (operador subiu, esqueceu, fechou tab). Cron move PREVIEW_READY > 24h para CANCELLED automaticamente + libera storage.

---

### D6 — Authorization Model

**Decision: 2 novas permission keys + matrix por role.**

**⚠️ ADDENDUM (2026-05-01) — Pragmatic Permission Strategy (Decisão do Bruno: Caminho 3):**

Discovery durante implementação revelou que V3 RBAC é **role-based hardcoded** (sem model `Permission` data-driven). Implementar opt-in granular per tenant fielmente exigiria refactor estrutural fora do escopo MVP. Decisão pragmática:

- **MVP:** módulo `backend-api/src/modules/auth/permissions.ts` com **mapa estático** `PERMISSION_TO_ROLES`. Middleware `requirePermission(key)` consulta o mapa e rejeita 403 se role atual não está. **API limpa para o futuro** sem refactor de callers.
- **Out-of-scope MVP:** "SuperAdmin pode dar opt-in de `bankData.view` per ADMIN/tenant". Fica como épico futuro `v3-3-rbac-data-driven`.
- **Aceitação:** `bankData.view` fixo em SUPERADMIN. Hoje só Bruno é SuperAdmin operacional, então sem perda funcional.
- **Rotas legadas NÃO migradas** — apenas rotas novas (`/admin/imports/*`, `/imports/*`, e ajuste no GET /employees/:id de Story 5.2) usam `requirePermission`.
- **Migração futura:** trocar mapa estático por `await prisma.permission.findMany()` — zero mudança em callers.

**Permission keys novas (com defaults via mapa estático):**
- `import.run` → roles permitidas: `[SUPERADMIN, ADMIN]`
- `bankData.view` → roles permitidas: `[SUPERADMIN]`

**Matrix por role (delta da V3 RBAC):**

| Permission | SUPERADMIN | ADMIN (tenant) | SUPERVISOR | OPERATOR |
|---|---|---|---|---|
| `import.run` | ✅ default | ✅ default | ❌ | ❌ |
| `bankData.view` | ✅ default | ❌ default; **opt-in pelo SuperAdmin** por tenant | ❌ | ❌ |

**Backend enforcement (FR8 critical):**
```ts
// Em /admin/imports/employees endpoint
async function uploadHandler(req) {
  const { user, tenant: jwtTenant } = req;
  const { tenantId: targetTenantId } = req.body;

  if (user.role !== 'SUPERADMIN' && targetTenantId !== jwtTenant.id) {
    throw new ForbiddenError('Cannot import to other tenant');
  }
  // ... double-check tenant exists and is ACTIVE
}
```

**bankData masking (FR36):**
- Default response do GET /employees/:id: `bankData: { masked: true, last4Digits: '1234' }`
- Com header `X-Show-Bank-Data: true` + permission `bankData.view`: response inclui `bankData: { tipoPix, chavePix, banco, agencia, conta }` decryptado
- AuditLog automático em **todo** acesso desmascarado: `EMPLOYEE_BANK_DATA_VIEWED { employeeId, viewerUserId }` (NFR12 + LGPD princípio de prestação de contas)

---

### D7 — Parser Versioning + Error Reporting

**Decision: `tirvu-v1` como string em `ImportJob.parserVersion`. Detecção via header signature. Fallback futuro v2 via factory.**

**Detection logic:**
```ts
const TIRVU_V1_HEADER = ['ID', 'CPF', 'Colaborador', 'PCD?', /* ... 46 cols */];

function detectParser(workbook: WorkBook): ParserVersion | null {
  const headers = extractHeaders(workbook.Sheets[workbook.SheetNames[0]]);
  if (matchesHeader(headers, TIRVU_V1_HEADER)) return 'tirvu-v1';
  // future: tirvu-v2, pontomais-v1, etc.
  return null;
}
```

**Quando layout mudar:** criar `tirvu-v2.ts`, registrar no factory, manter `v1` ativo (re-imports antigos continuam funcionando). Sem flag de feature, sem migration.

**Error reporting (.xlsx baixável):**
- Gerado **on demand** quando operador pede download (não pré-gerado)
- Conteúdo: linhas inválidas + coluna "motivo do erro" + coluna "linha original no arquivo" para o operador localizar
- Gerado pelo backend em streaming (`xlsx` write + `res.send(buffer)`), não persistido (link expira com o arquivo original em 90d)

---

### D8 — Match Algorithm + Diff Computation

**Decision: 2-stage match + field-by-field diff com whitelist.**

**Match precedence (per FR13):**
1. **Stage 1 — `tirvuId` match:** `WHERE tenantId = ? AND tirvuId = ?` — encontrou? é update.
2. **Stage 2 — `cpf` match:** `WHERE tenantId = ? AND cpf = ?` — encontrou? é update; **registrar `tirvuId` se ainda não tinha** (mantém match consistente em re-imports futuros).
3. **Sem match:** create.

**Conflict edge case (Stage 1 e 2 retornam Employees diferentes):**
- Mesmo `tirvuId` mas CPF da planilha bate com outro Employee → **flag como invalid**, motivo: "CPF da planilha pertence a outro colaborador no sistema; verifique se houve troca de CPF". Manual resolution.

**Field-by-field diff (FR14):**
Whitelist de campos comparados (não fica diff em todos os 46 — alguns sempre vêm da planilha como autoritativos; outros podem ter sido editados manualmente no GestaoFerias):

```ts
const DIFF_FIELDS: (keyof Employee)[] = [
  'name', 'birthDate', 'position', 'status', 'branch', 'workplace',
  'shift', 'phone', 'salary', 'hireDate', 'unionName',
  'personalData.sexo', 'personalData.ctps.numero', // dot-paths em JSON
  'address.cep', 'address.logradouro', // ...
  // bankData: NÃO entra no diff (cleartext nunca aparece)
];
```

**Resposta do preview:**
```json
{
  "summary": { "create": 47, "update": 3, "invalid": 2, "absent": 5, "newWorkplaces": ["TRT-DF"] },
  "rows": [
    { "rowIndex": 1, "status": "create", "data": {...} },
    { "rowIndex": 2, "status": "update", "diff": { "salary": { "from": 1500.00, "to": 1700.00 }, "shift": { "from": "...", "to": "..." } } },
    { "rowIndex": 47, "status": "invalid", "errors": ["CPF inválido", "Data admissão fora do formato"] }
  ]
}
```

**Idempotency proof (NFR31):** se nenhuma row tem diff (todos os fields no whitelist iguais), `update` count = 0, ergo 0 modificações. Test no CI: subir mesma fixture 2× → 2º run reporta `{create: 0, update: 0, invalid: 0}`.

---

### D9 — API Endpoint Structure

**Decision: 5 endpoints REST, payloads JSON, multipart só no upload.**

**Routes (`backend-api/src/routes/api/v1/`):**

```
POST   /admin/imports/employees                     [SUPERADMIN]
       multipart: file=.xlsx, body: { tenantId }
       → 201 { jobId, status: 'PENDING' }

POST   /imports/employees                            [TENANTADMIN]
       multipart: file=.xlsx (tenantId vem do JWT)
       → 201 { jobId, status: 'PENDING' }

GET    /imports/:jobId                               [SUPERADMIN | TENANTADMIN do tenant do job]
       → 200 { jobId, status, summary, totalRows, rowsProcessed, ... }

POST   /imports/:jobId/apply                         [SUPERADMIN | TENANTADMIN do tenant do job]
       body: { confirmTenantName: 'Servi-Plus', createWorkplaces: ['TRT-DF'], markAbsentAsPending: true }
       → 202 { jobId, status: 'APPLYING' }

POST   /imports/:jobId/cancel                        [SUPERADMIN | TENANTADMIN do tenant do job]
       → 200 { jobId, status: 'CANCELLED' }

GET    /imports/:jobId/preview                       [permissão como acima]
       query: ?status=create|update|invalid|absent&page=1&limit=50
       → 200 { rows: [...], pagination: {...} }

GET    /imports/:jobId/error-report.xlsx             [permissão como acima]
       → 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

**Response envelope V3 padrão:** `{ data, error, meta }`. Errors com `code` (ex.: `INVALID_TIRVU_HEADER`, `INVALID_TARGET_TENANT`, `JOB_NOT_FOUND`, `CONFIRMATION_MISMATCH`).

**Confirmation mismatch (FR10):** `apply` exige `confirmTenantName` no body bater com nome do tenant alvo. Se não bater → 400 `CONFIRMATION_MISMATCH`. UX banner + modal já garantem isso, mas backend valida.

---

### D10 — Frontend Architecture

**Decision: React Server Component shell + Client Component flow controller, useReducer 4-state, polling TanStack Query.**

**Estrutura de arquivos:**

```
frontend-web/src/app/
  admin/imports/employees/page.tsx          # SSR shell + client flow (mode='admin')
  settings/imports/employees/page.tsx       # SSR shell + client flow (mode='tenant')

frontend-web/src/components/imports/
  ImportEmployeesFlow.tsx                   # Client component, useReducer, controla 4 estados
  ImportTenantPicker.tsx                    # Dropdown tenant (SuperAdmin only)
  ImportTenantBanner.tsx                    # Banner persistente role="alert"
  ImportDropzone.tsx                        # react-dropzone wrapper
  ImportPreviewTable.tsx                    # @tanstack/react-virtual table
  ImportPreviewFilters.tsx                  # chips por status
  ImportConfirmModal.tsx                    # focus trap, confirma nome do tenant
  ImportProgressView.tsx                    # polling TanStack Query, barra de progresso
  ImportSummaryView.tsx                     # final state + download relatório
  ImportFailureView.tsx                     # FAILED/TIMED_OUT
```

**State machine reducer (4 states + transitions):**
```ts
type State =
  | { kind: 'upload'; tenantId?: string; file?: File }
  | { kind: 'preview'; jobId: string; tenantId: string; summary: PreviewSummary }
  | { kind: 'applying'; jobId: string; tenantId: string }
  | { kind: 'done'; jobId: string; tenantId: string; result: 'completed' | 'failed' | 'timed_out' };

type Action =
  | { type: 'UPLOAD_SUCCESS'; jobId: string; summary: PreviewSummary }
  | { type: 'APPLY_TRIGGERED' }
  | { type: 'JOB_COMPLETED'; result: 'completed' | 'failed' | 'timed_out' }
  | { type: 'CANCEL' }
  | { type: 'RESET' };
```

URL state via querystring `?step=upload|preview|applying|done&jobId=...&tenantId=...` para sobreviver a refresh.

**Polling estratégia (NFR4):**
```ts
const { data: job } = useQuery({
  queryKey: ['import', jobId, 'status'],
  queryFn: () => api.imports.getStatus(jobId),
  refetchInterval: (query) => {
    const status = query.state.data?.status;
    if (['APPLYING', 'PARSING'].includes(status)) return 2000;  // 2s durante work ativo
    return false;  // para de polling em estados terminais
  },
});
```

**Performance optimizations (NFR3 LCP ≤1.5s):**
- ⚠️ **Architectural risk:** baseline V3 LCP atual é desconhecido. Antes de implementar, **medir LCP de uma página comparável** (ex.: `/admin/tenants`). Se baseline > 1.0s, NFR3 fica apertado.
- **Mitigações pré-aprovadas se baseline ruim:**
  - `ImportPreviewTable` lazy-load via `dynamic(() => import(...), { ssr: false })` — evita bundle pesado em first paint
  - `react-dropzone` carregado dinamicamente apenas quando state = 'upload'
  - SSR shell envia HTML estático, hydration progressiva
- **Bundle delta target NFR7 (≤80kb gz):** xlsx fica server-side (não no bundle); react-virtual ~6kb; react-dropzone ~10kb; lógica do flow ~30-40kb. Confortavelmente abaixo.

---

### D11 — Re-import Behavior over Soft-deleted Employees (gap from IR)

**Decision: re-import de Employee com `inactive=true` → flag, **não restore automático**.**

Caso: colaborador foi marcado como inactive (demitido) anteriormente. Vem de novo na planilha Tirvu (recontratação? erro de exclusão?).

**Comportamento:**
- Match por `tirvuId` ou CPF encontra Employee com `inactive=true`
- Status na preview row: **`reactivation_pending`** (5ª categoria além de create/update/invalid/absent)
- Mostra mensagem: "Colaborador previamente demitido em {terminationDate}; planilha indica que está ativo. [Reativar] [Manter inativo]"
- Default: **manter inativo** (operador decide explicitamente)
- Se operador escolher "Reativar" → seta `inactive=false`, `terminationDate=null`, atualiza demais campos, dispara VacationEngine para recalcular saldo.

**Acceptance criteria adicional para Story 2.x:** preview deve mostrar contador de `reactivation_pending` e detalhes na tabela.

---

### Decision Impact Analysis

**Implementation Sequence (per refined epic breakdown do IR):**
1. **Story 2.1** (Epic 2) → Migration + Prisma schema (D1)
2. **Story 5.1** (Epic 5) → Encryption module (D2) + permission keys (D6)
3. **Story 1.1** (Epic 1) → Storage handler (D4) + Upload endpoint (D9)
4. **Story 2.2** (Epic 2) → Parser tirvu-v1 (D7) + Validator + Matcher (D8)
5. **Story 3.1** (Epic 3) → BullMQ queue + worker + tenant fairness (D3) + State machine (D5)
6. **Story 3.2** (Epic 3) → Apply chunks + AuditLog
7. **Story 4.1** (Epic 4) → Frontend flow (D10) + Preview UI + Polling
8. **Story 4.2** (Epic 4) → Error report download + Summary view

**Cross-Component Dependencies:**
- D2 (encryption) bloqueia D1 (schema) — schema usa colunas `bankDataEnc/Iv/Tag` que dependem da decisão GCM
- D3 (fairness) bloqueia D5 (state machine) parcialmente — TIMED_OUT depende do TTL do lock
- D6 (auth) é cross-cutting com D9 (API) — middleware de permission
- D11 (soft-delete behavior) impacta D8 (match algorithm) — adiciona 5ª categoria de status

---

### ✅ Confirmações arquiteturais finalizadas (Bruno, 2026-04-29)

- **Q1 — Encryption key strategy: (b) Master key na env + HKDF derivation por tenant.** TRAVADO. Ver D2.
- **Q2 — BullMQ tenant fairness: (a) Lock distribuído Redis caseiro (community-friendly).** TRAVADO. Ver D3.
- **Q3 — File storage: (a) FS local `/var/imports/` + retenção 90d.** TRAVADO. Ver D4. **Action item para infra:** adicionar volume Docker `imports-data:/var/imports` no `docker-compose.yml` e no stack do Swarm de produção.

## Implementation Patterns & Consistency Rules

> Maioria dos patterns abaixo é **convenção V3 já estabelecida** — listados aqui para referência rápida. Patterns marcados com 🆕 são novos para esta feature. Stories devem aderir; reviewer rejeita PR que viola.

### Naming Patterns

**Database (Postgres + Prisma):**
- Nome de tabela: `snake_case` plural (já V3) — ex.: `import_jobs`, `employees`
- Nome de coluna: `snake_case` no banco; Prisma `@map` para `camelCase` no client TS — ex.: `tirvu_id` ↔ `tirvuId`
- Foreign key column: `<entity>_id` — ex.: `tenant_id`, `operator_user_id`
- Index naming: `<table>_<cols>_idx` — ex.: `employees_tenant_inactive_pending_idx`, `import_jobs_tenant_status_created_idx`
- Unique constraint naming: `<table>_<cols>_unique_idx` — ex.: `employees_tenant_tirvu_unique_idx`
- Migration file: `YYYYMMDDHHMMSS_descricao_snake_case` — ex.: `20260430120000_add_import_tirvu_v3_2`

**API Routes (Fastify):**
- REST endpoint: plural snake-case-with-dashes para múltiplas palavras — ex.: `/imports/employees`, `/admin/imports/employees`
- Path params: `:paramName` camelCase — ex.: `/imports/:jobId`
- Query params: `camelCase` — ex.: `?status=create&page=1`
- Custom headers: `X-` prefix + Title-Case — ex.: `X-Show-Bank-Data: true`
- 🆕 **`/admin/*` namespace**: rotas SuperAdmin-only com seleção explícita de tenant
- 🆕 **`/imports/*` namespace** (sem `/admin/`): rotas TenantAdmin do tenant fixo do JWT

**Code (TypeScript):**
- Component React: `PascalCase` — ex.: `ImportEmployeesFlow`, `ImportPreviewTable`
- File component: `PascalCase.tsx` co-locado em `src/components/<feature>/` — ex.: `ImportPreviewTable.tsx`
- Module/utility: `kebab-case.ts` — ex.: `bank-data-encryption.ts`, `tirvu-parser.ts`
- Function: `camelCase` verbo-no-início — ex.: `parseRow`, `encryptBankData`, `applyChunk`
- Variable: `camelCase` — ex.: `jobId`, `tenantId`, `previewSummary`
- Constant: `SCREAMING_SNAKE_CASE` — ex.: `TIRVU_V1_HEADER`, `BANK_DATA_BLACKLIST`
- Type/Interface: `PascalCase` — ex.: `ImportJob`, `BankData`, `EncryptedBlob`
- Enum: `PascalCase` para nome, `SCREAMING_SNAKE_CASE` para values — ex.: `ImportJobStatus.PARSING`

### Structure Patterns

**Backend (`backend-api/src/`):**
```
modules/
  imports/                      🆕 novo módulo desta feature
    tirvu-parser.ts             # detection + streaming row iterator
    import-validator.ts         # zod schemas + CPF/dates/enums validation
    import-matcher.ts           # 2-stage match + diff field-by-field
    import-applier.ts           # chunked transactional apply + audit
    import-job-service.ts       # state machine transitions + persistence
    import-worker.ts            # BullMQ worker + tenant lock
    bank-data-encryption.ts     # AES-256-GCM + HKDF
    error-report-builder.ts     # gera .xlsx baixável on-demand
    cleanup-cron.ts             # retenção 90d
    types.ts                    # ImportJob, BankData, PreviewSummary, etc.
    index.ts                    # exports públicos do módulo
plugins/
  imports.ts                    🆕 registro da queue BullMQ + worker

routes/api/v1/
  admin/imports/
    employees/
      index.ts                  🆕 POST /admin/imports/employees (SuperAdmin)
  imports/
    employees/
      index.ts                  🆕 POST /imports/employees (TenantAdmin)
    [jobId]/
      index.ts                  🆕 GET /imports/:jobId
      apply.ts                  🆕 POST /imports/:jobId/apply
      cancel.ts                 🆕 POST /imports/:jobId/cancel
      preview.ts                🆕 GET /imports/:jobId/preview
      error-report.ts           🆕 GET /imports/:jobId/error-report.xlsx
```

**Frontend (`frontend-web/src/`):**
```
app/
  admin/imports/employees/page.tsx     🆕 SSR shell, mode='admin'
  settings/imports/employees/page.tsx  🆕 SSR shell, mode='tenant'

components/imports/                    🆕 todo a feature aqui
  ImportEmployeesFlow.tsx              # state machine reducer + roteador
  ImportTenantPicker.tsx               # SuperAdmin only
  ImportTenantBanner.tsx               # role="alert" persistente
  ImportDropzone.tsx
  ImportPreviewTable.tsx               # @tanstack/react-virtual
  ImportPreviewFilters.tsx             # chips por status
  ImportConfirmModal.tsx               # focus trap
  ImportProgressView.tsx               # polling 2s
  ImportSummaryView.tsx                # final state
  ImportFailureView.tsx                # FAILED/TIMED_OUT
  use-import-flow.ts                   # custom hook do useReducer

lib/api/
  imports.ts                           🆕 client API layer (TanStack Query)
```

**Test colocation:** `*.test.ts` co-locado com o arquivo que testa (já é convenção V3). E2E em `backend-api/test/e2e/imports.test.ts` separado.

### Format Patterns

**API response envelope (V3 padrão):**
```ts
// Sucesso
{ data: T, meta?: { pagination, ... }, error: null }
// Erro
{ data: null, error: { code: string, message: string, details?: any } }
```

**Error codes (NEW para esta feature):**
- `INVALID_TIRVU_HEADER` — header não bate com tirvu-v1
- `INVALID_TARGET_TENANT` — SuperAdmin tentou tenant inexistente/inativo, ou tenantId divergente do JWT (TenantAdmin)
- `JOB_NOT_FOUND` — jobId não existe ou pertence a outro tenant (404 mesmo se tenant alvo é divergente — não vazar existência cross-tenant)
- `INVALID_JOB_STATE` — apply tentou em job não-PREVIEW_READY (ex.: já COMPLETED ou CANCELLED)
- `CONFIRMATION_MISMATCH` — `confirmTenantName` no body de apply não bate com tenant do job
- `FILE_TOO_LARGE` — > 10MB
- `INVALID_FILE_FORMAT` — não é .xlsx
- `FORBIDDEN_BANK_DATA` — request com `X-Show-Bank-Data: true` sem permission `bankData.view`
- `RATE_LIMIT_EXCEEDED` — > 5 uploads/min/operador

**Date/time formats:**
- API JSON: ISO 8601 UTC com `Z` suffix — ex.: `"2026-04-30T18:23:45.123Z"`
- Planilha Tirvu input: `dd/MM/yyyy` — parser converte para `Date` JS, persistido como timestamptz Postgres
- UI display: timezone do tenant (default America/Sao_Paulo), `dd/MM/yyyy HH:mm`

**JSON field naming:**
- Em `data`/`meta`/`error`: `camelCase` (não snake_case)
- Em `body` request: `camelCase`

### Communication Patterns

**Logging (Pino — V3 padrão):**
- Todo log de import inclui campos estruturados obrigatórios:
  - `module: 'imports'`
  - `importJobId: string`
  - `tenantId: string`
  - `phase: 'parse' | 'validate' | 'match' | 'apply' | 'cleanup'`
- Levels: `debug` para eventos por linha, `info` para transições de estado, `warn` para validation errors esperados, `error` para falhas inesperadas
- 🆕 **Sanitization middleware** roda em **todos** os logs do módulo — nunca emitir `bankData`, `cpf` cleartext (exceto últimos 3 dígitos), `personalData.rg`, `personalData.pisPasep`

**AuditLog actions (NEW):**
- `EMPLOYEE_IMPORT_JOB_CREATED` — upload bem-sucedido
- `EMPLOYEE_IMPORT_JOB_APPLIED` — apply triggered (1 entry per job)
- `EMPLOYEE_IMPORT_JOB_CANCELLED` — cancel triggered
- `EMPLOYEE_IMPORT_JOB_FAILED` — falha
- `EMPLOYEE_IMPORT_CREATE` — Employee criado via import (1 per row)
- `EMPLOYEE_IMPORT_UPDATE` — Employee atualizado (com `previousData`/`newData` JSON)
- `EMPLOYEE_IMPORT_REACTIVATE` — Employee reativado de soft-delete
- `EMPLOYEE_IMPORT_FLAG_INACTIVE_PENDING` — flag set
- `EMPLOYEE_IMPORT_INVALID` — row invalid (motivo no `reason`)
- `EMPLOYEE_BANK_DATA_VIEWED` — acesso a bankData desmascarado (LGPD prestação de contas)
- Todos: `resourceType: 'EMPLOYEE'` ou `resourceType: 'IMPORT_JOB'`, `resourceId` correto, `tenantId`, `userId`, `ip`, `userAgent`

**Frontend state action types (TypeScript discriminated unions):**
- `UPLOAD_SUCCESS`, `APPLY_TRIGGERED`, `JOB_COMPLETED`, `CANCEL`, `RESET`, `POLL_TICK`
- Reducer pure, sem side effects (side effects no useEffect/handler que chama dispatch)

### Process Patterns

**Validation timing:**
- **Client-side:** apenas tamanho + extensão (.xlsx, ≤10MB) — UX fast feedback
- **Server-side parsing:** detecção de header — se inválido, return 400 IMMEDIATAMENTE sem persistir o arquivo. Se válido, persist arquivo + criar `ImportJob` em PENDING + return 201
- **Worker:** validação row-by-row (Zod), match, diff — depois transita para PREVIEW_READY
- **Apply:** revalidação opcional? **Não** — preview já validou. Apply assume preview snapshot ainda válido. Se Employee mudou no banco entre preview e apply (race condition rara), apply detecta via diff e ajusta ou skipa (idempotência preservada).

**Error handling:**
- **Linha individual inválida** = registra em `previewSummary.invalidRows`, NÃO falha job. Apply skipa essas linhas e gera relatório de erros baixável.
- **Erro fatal no parse** (header inválido, file corrupt, OOM) = transition para FAILED com `failureReason`, NÃO falha o request HTTP do upload (já voltou 201). Worker registra e UI mostra na próxima poll.
- **Erro fatal no apply** (banco down, transaction repetidamente falha) = transition para FAILED após retry policy (3x com backoff exponencial). Linhas já aplicadas em chunks anteriores ficam aplicadas (idempotência permite re-run).
- **Operator-facing messages:** sempre em português, conciso, acionável. Nunca expor stack trace ao operador (vai pro log + relatório técnico do Suporte).

**Loading states (frontend):**
- Cada estado tem componente dedicado (não condicional inline). Skeleton durante transição. Erros recuperáveis com botão "Tentar novamente".

**Authentication & Authorization checks (ordem):**
1. JWT válido (já garantido pelo `auth` plugin V3)
2. Role permite a permission key necessária (`import.run`, `bankData.view`)
3. tenantId do recurso bate com JWT (TenantAdmin) OU role é SuperAdmin
4. Estado do recurso permite a ação (state machine guard)

### Enforcement Guidelines

**All AI agents (e devs humanos) MUST:**

1. **Multi-tenant safety primeiro:** toda query nova passa pelo Prisma extension de tenant scoping; se não passa, é erro de design — NUNCA contornar para "facilitar". Test de penetração no CI valida.
2. **Encryption boundary:** `bankData` cleartext só existe em código que **explicitamente** chamou `decryptBankData()`. Default = Buffer encrypted. Nunca passar cleartext em response default; nunca logar.
3. **AuditLog em todas as transições:** se a ação muda estado de Employee ou ImportJob, **gera AuditLog**. Helper `auditLog.append({ action, resourceId, ... })` — nunca insert direto.
4. **State machine via service:** transições de `ImportJob.status` SEMPRE via `ImportJobService.transition()` com guard. Nunca `update({ status })` direto fora do service.
5. **Strings em português:** error messages user-facing, labels UI, textos do banner — todos em português (pt-BR). Logs e código em inglês (V3 padrão).
6. **Imports module isolation:** módulo `imports/` não importa diretamente de outros módulos `<feature>/` — só de `shared/`, `notifications/` (futuro). Comunicação cross-module via service/event, não import direto.
7. **No silent failures:** todo catch que não re-lança gera log com level `error` ou `warn`.

### Pattern Examples

**✅ Good Examples:**

```ts
// AuditLog em todas as criações
async function createEmployeeFromRow(row: TirvuRow, jobId: string, ctx: TenantContext) {
  const employee = await ctx.prisma.employee.create({ data: { ...mapped, tenantId: ctx.tenantId } });
  await ctx.auditLog.append({
    action: 'EMPLOYEE_IMPORT_CREATE',
    resourceType: 'EMPLOYEE', resourceId: employee.id,
    newData: sanitizeForLog(employee),
    metadata: { importJobId: jobId },
  });
  return employee;
}

// Encryption sempre na borda
async function persistBankData(empId: string, raw: BankData, ctx: TenantContext) {
  const blob = encryptBankData(raw, ctx.tenantId);
  await ctx.prisma.employee.update({
    where: { id: empId, tenantId: ctx.tenantId },
    data: { bankDataEnc: blob.enc, bankDataIv: blob.iv, bankDataTag: blob.tag },
  });
  // raw é descartado do escopo no fim da função
}
```

**❌ Anti-patterns (rejeitar em PR review):**

```ts
// ❌ Bypass de tenant scoping
const job = await prisma.$queryRaw`SELECT * FROM import_jobs WHERE id = ${jobId}`;

// ❌ bankData cleartext em response default
res.send({ data: { ...employee, bankData: decryptBankData(...) } });  // sem checar permission!

// ❌ Direct status update sem state machine
await prisma.importJob.update({ where: { id }, data: { status: 'COMPLETED' } });

// ❌ Log com cleartext
logger.info({ row }, 'Processing row');  // row pode ter cpf, bankData etc.
// CORRETO:
logger.info({ rowIndex, status }, 'Processing row');

// ❌ Auto-inativar sem flag
await prisma.employee.update({ where: { id }, data: { inactive: true } });  // FR15 viola!
// CORRETO:
await prisma.employee.update({ where: { id }, data: { inactivePending: true } });
```

## Project Structure & Boundaries

### Complete Project Directory Structure (delta da V3)

Apenas arquivos **novos ou modificados** desta feature são listados. Estrutura V3 já existente fica como está.

```
gestao-ferias/
├── docker-compose.yml                                  📝 modificar: adicionar volume `imports-data:/var/imports`
├── docker-compose.swarm.yml                            📝 modificar: idem para Swarm prod (Traefik stack)
│
├── backend-api/
│   ├── prisma/
│   │   ├── schema.prisma                               📝 modificar: estender Employee + adicionar ImportJob model
│   │   └── migrations/
│   │       └── 20260430120000_add_import_tirvu_v3_2/   🆕 migration consolidada
│   │           └── migration.sql
│   │
│   ├── src/
│   │   ├── modules/
│   │   │   └── imports/                                🆕 todo o domínio import aqui
│   │   │       ├── index.ts                            # exports públicos
│   │   │       ├── types.ts                            # TirvuRow, BankData, PreviewSummary, ImportJobState
│   │   │       ├── tirvu-parser.ts                     # parser tirvu-v1 com header detection + streaming
│   │   │       ├── tirvu-parser.test.ts                # unit: detecção, parsing rows, edge cases
│   │   │       ├── import-validator.ts                 # zod schemas + CPF dígito + datas
│   │   │       ├── import-validator.test.ts            # unit: validações por linha
│   │   │       ├── import-matcher.ts                   # 2-stage match + diff field-by-field
│   │   │       ├── import-matcher.test.ts              # unit: idempotency, conflict cases
│   │   │       ├── import-applier.ts                   # apply em chunks transacionais
│   │   │       ├── import-applier.test.ts              # integration: apply real no banco de teste
│   │   │       ├── import-job-service.ts               # state machine + persistence
│   │   │       ├── import-job-service.test.ts          # unit: transições válidas/inválidas
│   │   │       ├── import-worker.ts                    # BullMQ worker + tenant lock Redis
│   │   │       ├── import-worker.test.ts               # integration: lock, retry, fairness
│   │   │       ├── bank-data-encryption.ts             # AES-256-GCM + HKDF derivation
│   │   │       ├── bank-data-encryption.test.ts        # unit: round-trip, tamper detection
│   │   │       ├── error-report-builder.ts             # gera .xlsx baixável on-demand
│   │   │       ├── cleanup-cron.ts                     # retenção 90d (cron diário)
│   │   │       └── audit-helpers.ts                    # wrappers para EMPLOYEE_IMPORT_* actions
│   │   │
│   │   ├── plugins/
│   │   │   └── imports.ts                              🆕 plugin Fastify: registra queue BullMQ + worker startup
│   │   │
│   │   ├── routes/api/v1/
│   │   │   ├── admin/imports/employees/
│   │   │   │   └── index.ts                            🆕 POST /admin/imports/employees (SuperAdmin)
│   │   │   └── imports/
│   │   │       ├── employees/
│   │   │       │   └── index.ts                        🆕 POST /imports/employees (TenantAdmin)
│   │   │       └── [jobId]/
│   │   │           ├── index.ts                        🆕 GET /imports/:jobId (status)
│   │   │           ├── apply.ts                        🆕 POST /imports/:jobId/apply
│   │   │           ├── cancel.ts                       🆕 POST /imports/:jobId/cancel
│   │   │           ├── preview.ts                      🆕 GET /imports/:jobId/preview (paginated)
│   │   │           └── error-report.ts                 🆕 GET /imports/:jobId/error-report.xlsx
│   │   │
│   │   └── app.ts                                      📝 modificar: register imports plugin
│   │
│   └── test/
│       ├── e2e/
│       │   ├── imports-superadmin.test.ts              🆕 e2e fluxo SuperAdmin completo
│       │   └── imports-tenant-admin.test.ts            🆕 e2e fluxo TenantAdmin completo
│       ├── fixtures/
│       │   ├── tirvu-anatel-50.xlsx                    🆕 fixture pequeno (do exemplo)
│       │   ├── tirvu-1k-rows.xlsx                      🆕 fixture performance test
│       │   ├── tirvu-5k-rows.xlsx                      🆕 fixture stress test
│       │   ├── tirvu-invalid-header.xlsx               🆕 fixture rejection
│       │   └── tirvu-mixed-errors.xlsx                 🆕 fixture com 5% linhas inválidas
│       └── security/
│           └── imports-cross-tenant.test.ts            🆕 testes de penetração (NFR10)
│
└── frontend-web/
    ├── src/
    │   ├── app/
    │   │   ├── admin/imports/employees/
    │   │   │   └── page.tsx                            🆕 SSR shell, mode='admin'
    │   │   └── settings/imports/employees/
    │   │       └── page.tsx                            🆕 SSR shell, mode='tenant'
    │   │
    │   ├── components/imports/                         🆕 toda a UI da feature
    │   │   ├── ImportEmployeesFlow.tsx                 # state machine + roteador interno
    │   │   ├── ImportTenantPicker.tsx                  # dropdown SuperAdmin only
    │   │   ├── ImportTenantBanner.tsx                  # role="alert" persistente
    │   │   ├── ImportDropzone.tsx                      # react-dropzone wrapper
    │   │   ├── ImportPreviewTable.tsx                  # @tanstack/react-virtual
    │   │   ├── ImportPreviewFilters.tsx                # chips por status
    │   │   ├── ImportConfirmModal.tsx                  # focus trap, repete tenant
    │   │   ├── ImportProgressView.tsx                  # polling 2s
    │   │   ├── ImportSummaryView.tsx                   # final state + downloads
    │   │   ├── ImportFailureView.tsx                   # FAILED/TIMED_OUT
    │   │   ├── use-import-flow.ts                      # custom hook do useReducer
    │   │   └── *.test.tsx                              # testes co-locados
    │   │
    │   ├── lib/api/
    │   │   └── imports.ts                              🆕 client API (TanStack Query layer)
    │   │
    │   └── components/Sidebar.tsx                      📝 modificar: adicionar entry "Importar colaboradores"
    │
    └── e2e/
        └── imports.spec.ts                             🆕 Playwright e2e test (axe-core p/ a11y)
```

### Architectural Boundaries

**API Boundaries:**

```
┌─────────────────────────────────────────────────────────┐
│ External (browser do operador)                          │
│   ├── POST /admin/imports/employees                     │ ← SuperAdmin
│   ├── POST /imports/employees                           │ ← TenantAdmin
│   ├── GET /imports/:jobId                               │ ← polling 2s
│   ├── POST /imports/:jobId/apply                        │
│   ├── POST /imports/:jobId/cancel                       │
│   ├── GET /imports/:jobId/preview                       │ ← paginação client-side é fallback
│   └── GET /imports/:jobId/error-report.xlsx             │
│                                                         │
│ Internal (cross-module backend)                         │
│   ├── ImportApplier  →  VacationEngine.computeBalance   │ ← chamada síncrona não-bloqueante
│   ├── ImportApplier  →  AuditLog.append                 │
│   ├── ImportApplier  →  WorkplaceService.createIfNew    │
│   └── ImportWorker   →  BullMQ queue 'imports'          │
│                                                         │
│ External 3rd-party                                      │
│   └── (nenhum no MVP — Tirvu é input via upload manual) │
└─────────────────────────────────────────────────────────┘
```

**Component Boundaries (Frontend):**

```
ImportEmployeesFlow (state owner — useReducer + URL state)
   ├─ state.kind === 'upload'      → ImportTenantPicker (admin) + ImportDropzone
   ├─ state.kind === 'preview'     → ImportTenantBanner + ImportPreviewFilters + ImportPreviewTable + ImportConfirmModal
   ├─ state.kind === 'applying'    → ImportTenantBanner + ImportProgressView (polling)
   └─ state.kind === 'done'        → ImportSummaryView (success) | ImportFailureView (fail/timeout)
```

Componentes **não compartilham state** — comunicam via dispatch para o reducer pai. Sub-componentes recebem `(state, dispatch)` como props.

**Data Boundaries:**

- **Cleartext zone (memória):** parser → validator → matcher → applier (durante chunk transaction). Não persiste.
- **Encrypted at rest zone (banco):** apenas `bankDataEnc`/`Iv`/`Tag` colunas binárias.
- **Decryption:** apenas em handler de `GET /employees/:id` quando há `X-Show-Bank-Data: true` + permission `bankData.view`. AuditLog automático.
- **Multi-tenant boundary:** Prisma extension scope é a borda. Toda query de import usa client com extension ativo. Penetration tests no CI verificam.

### Requirements to Structure Mapping

**Per epic refinado (do IR report):**

| Epic | Stories candidatas | Arquivos backend | Arquivos frontend |
|---|---|---|---|
| **Epic 1 — Upload** (FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR9, FR33, FR34, FR38) | upload-superadmin, upload-tenant-admin, file-storage-and-hash, tenant-banner | `routes/api/v1/admin/imports/employees/index.ts`, `routes/api/v1/imports/employees/index.ts`, `modules/imports/import-job-service.ts` (storage path build), parts of `tirvu-parser.ts` (header validation pre-persist) | `app/admin/imports/employees/page.tsx`, `app/settings/imports/employees/page.tsx`, `ImportEmployeesFlow`, `ImportTenantPicker`, `ImportTenantBanner`, `ImportDropzone` |
| **Epic 2 — Preview & Validation** (FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR40-45) | parse-rows, validate-rows, match-and-diff, detect-workplaces, detect-absent, schema-migration | `modules/imports/tirvu-parser.ts`, `import-validator.ts`, `import-matcher.ts`, `prisma/schema.prisma`, migration | `ImportPreviewTable`, `ImportPreviewFilters`, `lib/api/imports.ts` getPreview |
| **Epic 3 — Apply** (FR10, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR31, FR32) | confirm-modal, enqueue-job, worker-fairness, chunk-apply, vacation-engine-trigger, audit-log, progress-polling, idempotency-test | `modules/imports/import-applier.ts`, `import-worker.ts`, `import-job-service.ts`, `audit-helpers.ts`, `plugins/imports.ts`, `routes/api/v1/imports/[jobId]/apply.ts`, `routes/api/v1/imports/[jobId]/index.ts` (status) | `ImportConfirmModal`, `ImportProgressView`, `lib/api/imports.ts` apply/status |
| **Epic 4 — Resultado** (FR29, FR30) | summary-view, error-report-download | `modules/imports/error-report-builder.ts`, `routes/api/v1/imports/[jobId]/error-report.ts` | `ImportSummaryView`, `ImportFailureView` |
| **Epic 5 — Importação Segura LGPD** (FR8, FR35, FR36, FR37, FR39) | encryption-module, masking-default, log-sanitization, tenant-enforcement, permission-keys | `modules/imports/bank-data-encryption.ts`, log sanitization plugin update, RBAC permission registration | (frontend reflete via `bankData: { masked: true }` na response) |

### Cross-Cutting Concerns Mapping

| Concern | Onde vive | Aplicado em |
|---|---|---|
| Multi-tenant isolation | `backend-api/src/plugins/prisma.ts` (extension existente) | toda query de import |
| Authentication/JWT | `backend-api/src/plugins/auth.ts` (existente) | todos endpoints `/api/v1/*` |
| Logging Pino estruturado | `backend-api/src/app.ts` config + sanitization helper novo | todo o módulo `imports/` |
| AuditLog wrapper | `backend-api/src/modules/imports/audit-helpers.ts` 🆕 | todas actions `EMPLOYEE_IMPORT_*` |
| Error envelope `{ data, error, meta }` | helper já existente em V3 | todas response do `/imports/*` |
| Rate limiting | `backend-api/src/plugins/rate-limit.ts` (existente, configurar) | endpoints de upload (5/min/operador) |

### Integration Points

**Internal Communication (in-process):**

```
[Upload Endpoint]
  → ImportJobService.create({ status: PENDING, file, fileHash, ... })
  → fs.writeFile(/var/imports/{tenantId}/{jobId}.xlsx)
  → bullmq.add('imports', { jobId, tenantId })
  → return 201 { jobId }

[BullMQ Worker]
  → acquireLock(redis, `imports:lock:${tenantId}`)  // SET NX EX 960
  → ImportJobService.transition(jobId, [PENDING], PARSING)
  → TirvuParser.parse(filePath) → rows
  → ImportValidator.validateAll(rows) → { valid, invalid }
  → ImportMatcher.matchAll(valid, ctx) → { create, update, absent, reactivation }
  → ImportJobService.transition(jobId, [PARSING], PREVIEW_READY, { previewSummary })
  → releaseLock(redis, ...)

[Apply Endpoint]
  → ImportJobService.transition(jobId, [PREVIEW_READY], APPLYING)
  → bullmq.add('imports', { jobId, phase: 'apply', ...applyOptions })
  → return 202

[Apply Worker]
  → acquireLock(...)
  → for each chunk of 100 rows:
      → prisma.$transaction(async (tx) => {
          → for each row in chunk:
              → ImportApplier.applyRow(row, tx)  // create/update/skip
              → AuditLog.append(...)
          → if row creates Employee:
              → VacationEngine.scheduleBalanceComputation(employeeId)  // background, non-blocking
      → })
      → ImportJob.rowsProcessed += chunk.length
  → ImportJobService.transition(jobId, [APPLYING], COMPLETED)
  → if errors: ErrorReportBuilder.build(jobId) → /var/imports/{tenantId}/{jobId}-errors.xlsx
  → releaseLock(...)
```

**External Integrations:**

- **Tirvu (input):** apenas via .xlsx upload manual — sem API. Layout fixo de 46 colunas.
- **Future Phase 2:** SFTP pull do Tirvu, webhook do Tirvu, AWS S3, Slack/Email notifications.

**Data Flow (high-level):**

```
[Browser] --multipart--> [Upload Endpoint]
                              ↓ persist fs + create ImportJob (PENDING)
                              ↓ enqueue BullMQ
[BullMQ 'imports' queue] --> [Worker: parse phase]
                              ↓ updates ImportJob (PARSING → PREVIEW_READY)
[Browser polls 2s] --GET status--> [Status Endpoint] --reads ImportJob-->
                              ↓ when PREVIEW_READY, browser calls /preview to fetch table
[Browser] --POST apply--> [Apply Endpoint] --enqueue apply job-->
[BullMQ] --> [Worker: apply phase]
                              ↓ applies in chunks → AuditLog → VacationEngine
                              ↓ updates ImportJob (APPLYING → COMPLETED)
                              ↓ generates error report .xlsx if errors
[Browser polls] sees COMPLETED → fetches summary → renders ImportSummaryView
```

### File Organization Patterns

**Configuration:**
- Env vars novas em `backend-api/.env.example`:
  - `BANK_DATA_ENCRYPTION_KEY=` (32 bytes base64 — instruções no comentário)
  - `IMPORT_FILE_STORAGE_PATH=/var/imports`
  - `IMPORT_MAX_FILE_SIZE_MB=10`
  - `IMPORT_MAX_ROWS=5000`
  - `IMPORT_RETENTION_DAYS=90`
  - `IMPORT_WORKER_CONCURRENCY=2`
  - `IMPORT_TENANT_LOCK_TTL_SEC=960`
  - `IMPORT_CHUNK_SIZE=100`
  - `IMPORT_JOB_TIMEOUT_MIN=15`

- Feature flag por tenant:
  - Tabela existente `Tenant.featureFlags` (JSON) — adicionar key `imports.enabled: boolean` (default `false` em produção até habilitar manualmente)

**Source organization:** já listado na árvore acima. Princípio: 1 módulo `imports/` agrupa todo o domínio; rotas separadas por permissão (`admin/` vs raiz).

**Test organization:**
- `*.test.ts` co-locado com módulo (unit tests)
- `test/e2e/` para fluxos completos com banco real
- `test/security/` para testes de penetração cross-tenant
- `test/fixtures/` com .xlsx de exemplo (50, 1k, 5k, invalid, mixed-errors)
- Mockando: parser usa fixture real; encryption usa key fixa de teste; BullMQ usa Redis em container de teste (não mock)

**Asset organization:**
- Sem assets estáticos novos (sem imagens, ícones — usar lucide-react existente)
- Fixtures de teste em `test/fixtures/` (versionadas no git, ~50KB cada)

### Development Workflow Integration

**Development server:**
- `docker-compose up` continua funcionando — adiciona volume `imports-data` no compose
- Worker BullMQ roda como parte do mesmo processo do backend (já é assim no V3)
- Hot-reload via tsx funciona — module `imports/` é HMR-friendly (sem state global)

**Build process:**
- Backend: `npm run build` continua produzindo `dist/` — modulo `imports/` segue mesmo build
- Frontend: `npm run build` Next.js — page com `dynamic()` import garante code-split

**Deployment:**
- Docker Swarm stack precisa: volume `imports-data` declarado, secret/config para `BANK_DATA_ENCRYPTION_KEY`
- Migration Prisma roda no startup (já é assim no V3 via entrypoint.sh)
- Feature flag inicia OFF — Bruno habilita manualmente para Green House primeiro

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
- Stack todo já em produção V3 e provadamente coerente (Fastify 5 + Prisma 7.6 + BullMQ + Redis + Next.js 16)
- Decisões arquiteturais novas (D1-D11) usam apenas APIs nativas do stack ou libs leves (`xlsx`, `react-dropzone`, `@tanstack/react-virtual`)
- HKDF + AES-256-GCM via `node:crypto` nativo — sem conflito com Prisma/Fastify
- BullMQ + Redis lock distribuído — Redis já presente, lib `ioredis` já em uso, nada novo
- Versions: Node 20+ (suporta `hkdfSync`), `node:crypto` GCM mode estável desde Node 12

**Pattern Consistency:**
- Naming patterns (D5 anti-patterns) batem com convenções V3 já em [schema.prisma](backend-api/prisma/schema.prisma) e rotas existentes
- API envelope `{ data, error, meta }` herda de V3 — sem divergência
- AuditLog actions `EMPLOYEE_IMPORT_*` seguem padrão existente de actions V3
- Error codes em SCREAMING_SNAKE_CASE batem com convenção de error envelope

**Structure Alignment:**
- Módulo `backend-api/src/modules/imports/` segue padrão exato dos outros módulos (`coverage-engine/`, `employees/`, `notifications/`, etc.)
- Frontend `components/imports/` segue `components/<feature>/` convention V3
- Routes `/api/v1/admin/imports/*` + `/api/v1/imports/*` bate com namespace existente (`/api/v1/admin/*` para SuperAdmin já em uso)
- Boundaries de Cleartext zone vs Encrypted-at-rest zone respeitadas no fluxo de dados

### Requirements Coverage Validation ✅

**Functional Requirements Coverage (45 FRs do PRD):**

| Capability Area | FRs | Coverage Decision/Component |
|---|---|---|
| Upload & Format (FR1-6) | 6 | D9 endpoints + D7 parser detection + D4 storage |
| Tenant Targeting (FR7-10) | 4 | D6 auth + D9 SuperAdmin endpoint dual + D10 banner persistente |
| Parsing/Validation/Preview (FR11-19) | 9 | D7 parser + import-validator + D8 matcher + D10 virtualized table |
| Apply Async (FR20-26) | 7 | D3 BullMQ fairness + D5 state machine + import-applier + chunks |
| Progress/Reporting (FR27-30) | 4 | D9 status endpoint + polling 2s + error-report-builder + summary view |
| Auditing (FR31-34) | 4 | D5 ImportJob model + audit-helpers + IP/UA capture + SHA-256 |
| Privacy/Security (FR35-39) | 5 | D2 encryption + log sanitization + D6 permissions + soft-delete |
| Schema Extension (FR40-45) | 6 | D1 schema completo |

**100% das FRs com decisão arquitetural correspondente.**

**Non-Functional Requirements Coverage (36 NFRs):**

| NFR Category | Coverage |
|---|---|
| Performance (NFR1-7) | D10 polling, D8 chunks de 100, virtualização, code-split — viabilidade do LCP precisa medir baseline |
| Security (NFR8-14) | D2 encryption + D6 auth + log sanitization + rate limiting plugin + SHA-256 |
| Scalability (NFR15-19) | D3 fairness + chunked apply + 5k cap + tenant lock + storage retention |
| Accessibility (NFR20-24) | D10 frontend specs (focus trap, aria-live, role=alert, axe-core) |
| Integration (NFR25-28) | D7 parser tolerance + versioning; VacationEngine non-blocking |
| Reliability (NFR29-33) | D3 lock TTL + D5 timeouts + transactional chunks + idempotency tests |
| Observability (NFR34-36) | Pino structured logs + AuditLog + cleanup-cron + retention 90d FS |

**100% dos NFRs endereçados.**

**3 production-critical issues do IR report:**
- ✅ **Epic 5 LGPD blocker:** D2 encryption + D6 permissions resolvem; sequência segura documentada (Epic 5 antes/junto de Epic 3)
- ✅ **NFR3 LCP ≤1.5s:** D10 mitigations pré-aprovadas (lazy load `ImportPreviewTable`, dynamic dropzone). **Action item:** medir baseline V3 antes da implementação
- ✅ **NFR16 tenant fairness:** D3 lock distribuído Redis caseiro, mecanismo concreto, justificado vs alternativas

**5 gaps menores do IR report:**
- ✅ **DDL detalhado FR40-45:** D1 traz Prisma schema completo
- ✅ **Re-import sobre soft-deleted:** D11 trata com 5ª categoria `reactivation_pending`, default = manter inativo
- ✅ **Fluxo de revisão pós-flag:** integra com `/employees` existente via filtro `inactivePending=true` (UI já lista, story ajusta filtro)
- ✅ **Mascaramento bankData:** D6 + D2 com permission `bankData.view` + AuditLog de acesso desmascarado
- ✅ **Parser versioning:** D7 traz factory + detection signature

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ 11 decisões críticas (D1-D11) documentadas com rationale, alternativas consideradas, trade-offs
- ✅ Versions todas verificadas/herdadas: Node 20+, Prisma 7.6, BullMQ ^5, Next.js 16.2, React 19, Tailwind 4
- ✅ Cross-component dependencies mapeadas (D2 → D1, D3 → D5, D6 ↔ D9, D11 → D8)
- ✅ Confirmações explícitas do PM/Bruno em Q1/Q2/Q3 (encryption, fairness, storage)

**Structure Completeness:**
- ✅ Árvore de arquivos delta completa (~30 arquivos novos, identificados com 🆕)
- ✅ Boundaries de API, Component, Service, Data documentados com diagrama
- ✅ Integration points internos (in-process) com diagrama de fluxo de dados
- ✅ Mapeamento Epic→Story→Arquivo para todos os 5 epics refinados

**Pattern Completeness:**
- ✅ Naming patterns (DB, API, Code) com exemplos
- ✅ Format patterns (response envelope, error codes, dates) específicos da feature
- ✅ Communication patterns (Pino logs, AuditLog actions, frontend reducer actions)
- ✅ Process patterns (validation timing, error handling, auth check ordering)
- ✅ 7 enforcement guidelines vinculantes
- ✅ 6 anti-patterns concretos com código

### Gap Analysis Results

**🔴 Critical Gaps:** Nenhum encontrado. Arquitetura está pronta para implementação.

**🟠 Important Gaps:**
1. **Baseline LCP V3 atual desconhecido (NFR3 risk).** Antes da Story 4.1 (frontend flow), medir LCP de uma página comparável (ex.: `/admin/tenants`). Se baseline > 1.0s, ativar mitigations agressivas pré-aprovadas (dynamic imports). **Action item para a primeira story de frontend.**
2. **Volume Docker `imports-data` precisa ser declarado** em `docker-compose.yml` E `docker-compose.swarm.yml` antes da Story 1.x (upload). Caso contrário, persist do arquivo falha em prod. **Action item para Story 1.1.**
3. **`BANK_DATA_ENCRYPTION_KEY` precisa ser provisionada** em prod (Docker Secret recomendado). Bruno precisa gerar `openssl rand -base64 32` e adicionar no Swarm secret antes do deploy. **Action item para deploy/handoff.**

**🟡 Minor Gaps:**
1. **Métricas Prometheus deferred para Phase 2.** MVP só tem Pino logs. Se Bruno quiser dashboard de import operations no Grafana, precisa adicionar `/metrics` endpoint depois.
2. **Sidebar entry "Importar colaboradores"** não tem mockup definido — UX Designer (Sally) decide texto/ícone/posição em paralelo com esta arquitetura.
3. **Fixture `tirvu-5k-rows.xlsx` precisa ser gerado** sinteticamente (script de teste) — Story de testes de carga inclui isso.

### Validation Issues Addressed

Todos os issues encontrados durante validação são **action items operacionais ou de medição**, não defeitos de design:

- ✅ Volume Docker → ação de infra, não decisão arquitetural pendente
- ✅ Encryption key provisioning → ação de deploy, não design
- ✅ LCP baseline → medição empírica, mitigations pré-aprovadas
- ✅ Sidebar UX → escopo da Sally, paralelo
- ✅ Fixture 5k → escopo de stories de teste

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (Step 2)
- [x] Scale and complexity assessed (HIGH, ~12 components)
- [x] Technical constraints identified (stack travada, V3 brownfield)
- [x] Cross-cutting concerns mapped (8 concerns)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions (D1-D11)
- [x] Technology stack fully specified (4 deps novas justificadas, 4 rejeitadas)
- [x] Integration patterns defined (REST + BullMQ + AuditLog + VacationEngine)
- [x] Performance considerations addressed (D10 mitigations + chunks + virtualização)

**✅ Implementation Patterns**
- [x] Naming conventions established (DB/API/Code)
- [x] Structure patterns defined (módulos, namespaces, co-location)
- [x] Communication patterns specified (Pino + AuditLog + reducer actions)
- [x] Process patterns documented (validation timing, error handling, auth)

**✅ Project Structure**
- [x] Complete directory structure defined (~30 arquivos delta listados)
- [x] Component boundaries established (frontend reducer-owner, backend module isolation)
- [x] Integration points mapped (data flow diagram)
- [x] Requirements to structure mapping complete (Epic→Story→Arquivo)

### Architecture Readiness Assessment

**Overall Status:** **READY FOR IMPLEMENTATION** ✅

**Confidence Level:** **HIGH** — fundamentado em:
- 100% das 45 FRs e 36 NFRs com decisão arquitetural correspondente
- 3 production-critical issues do IR report explicitamente endereçados
- 5 gaps menores do IR report explicitamente endereçados
- Stack travada herda confiabilidade da V3 já em produção
- Padrões aderem a convenções V3 existentes — risco de conflito baixo

**Key Strengths:**
- **Idempotência verificável** desde o dia 1 (NFR31 + D8 com proof concreto)
- **Multi-tenant safety enforced** em 4 camadas (Prisma extension, JWT, payload validation, penetration tests CI)
- **Encryption boundary clara** (cleartext zone limitada, blacklist em logs, AuditLog de acesso desmascarado)
- **State machine explícita** (D5) previne corrupção de status
- **Tenant fairness mechanism** sem dependência paga (D3 lock Redis caseiro)
- **Falha parcial graciosa** (chunks transacionais, relatório de erros baixável)
- **Compliance LGPD ativa** (não bolt-on tardio)
- **Rollout gradual** via feature flag por tenant

**Areas for Future Enhancement (Phase 2+):**
- Métricas Prometheus + dashboards Grafana
- Migração FS local → S3/MinIO quando volume justificar
- BullMQ Pro `groupKey` se quiser features de observability nativas (substituir lock caseiro)
- KMS-based key management quando compliance enterprise pedir
- SSE/WebSocket substituindo polling quando volume de jobs justificar
- Wizard de mapeamento custom para clientes que usam outros sistemas além de Tirvu
- Sync agendado H2 (cron diário Tirvu pull)
- Reverter import (botão na UI history com window de tempo)

### Implementation Handoff

**AI Agent Guidelines:**
- Seguir todas as 11 decisões arquiteturais (D1-D11) exatamente como documentadas
- Aplicar consistentemente todos os padrões de Step 5 (naming, structure, format, communication, process)
- Respeitar boundaries do Step 6 (cleartext zone, encrypted-at-rest, multi-tenant Prisma extension)
- Antes de PR, validar contra os 7 enforcement guidelines + 6 anti-patterns documentados
- Toda decisão de implementação não óbvia → consultar este documento ou abrir question ao PM/Architect

**First Implementation Priority:**
1. **Não há "starter setup" story** (brownfield)
2. **Story 5.1 (Epic 5)** primeiro: implementar `bank-data-encryption.ts` + permission keys + log sanitization plugin update — porque bloqueia Epic 3
3. **Story 1.1 (Epic 1)** em paralelo: adicionar volume Docker, configurar env vars, implementar storage handler básico
4. **Story 2.1 (Epic 2)**: migration Prisma + ImportJob model

**Action items para Bruno antes de começar implementação:**
- [ ] Gerar `BANK_DATA_ENCRYPTION_KEY`: `openssl rand -base64 32` e adicionar como Docker Secret no Swarm
- [ ] Adicionar volume `imports-data:/var/imports` em `docker-compose.yml` e stack Swarm
- [ ] Medir LCP atual de `/admin/tenants` (página comparável) para validar viabilidade do NFR3
- [ ] Decidir se a feature flag `imports.enabled` começa em `true` ou `false` para Green House (recomendo `true` — você é seu próprio guinea pig)
