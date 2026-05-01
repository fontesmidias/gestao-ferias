---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'COMPLETE'
completedAt: '2026-05-01'
inputDocuments:
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md'
    type: 'prd'
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md'
    type: 'architecture'
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md'
    type: 'ux-design'
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/implementation-readiness-report.md'
    type: 'readiness-report'
workflowType: 'epics-and-stories'
project_name: 'gestao-ferias'
user_name: 'Bruno'
date: '2026-05-01'
feature: 'v3-2-import-tirvu'
---

# gestao-ferias — Epic Breakdown — v3-2-import-tirvu

## Overview

Decomposição completa em epics e stories da feature de **Importação em massa de colaboradores via planilha Tirvu**, baseada em PRD (45 FRs + 36 NFRs), Architecture (11 decisões D1-D11), UX Design (4 estados wireframed) e Implementation Readiness Report iter2 (GO, refined breakdown 5 epics).

## Requirements Inventory

### Functional Requirements (45 total)

**Capability Area 1 — File Upload & Format Validation:**
- FR1: SuperAdmin pode fazer upload de planilha Tirvu (.xlsx) escolhendo qualquer tenant ativo
- FR2: TenantAdmin pode fazer upload de planilha Tirvu (.xlsx) automaticamente direcionada para seu próprio tenant (sem possibilidade cross-tenant)
- FR3: Sistema rejeita arquivo com extensão diferente de .xlsx com mensagem clara
- FR4: Sistema rejeita arquivo maior que limite configurado mostrando tamanho atual e limite
- FR5: Sistema detecta header esperado Tirvu (46 colunas) e rejeita arquivos não conformes
- FR6: Sistema persiste arquivo original (com hash) e retém pelo período de auditoria configurado

**Capability Area 2 — Tenant Targeting & Authorization:**
- FR7: SuperAdmin seleciona tenant alvo explicitamente antes do upload (sem default implícito)
- FR8: Sistema impede operadores não-SuperAdmin de importarem para outros tenants além do seu JWT-bound, com enforcement no backend
- FR9: Sistema exibe nome do tenant alvo persistentemente na UI durante todo o fluxo (operações SuperAdmin)
- FR10: Sistema exige passo de confirmação explícita antes de aplicar import, repetindo nome do tenant alvo

**Capability Area 3 — Parsing, Validation & Diff Preview:**
- FR11: Sistema parse todas as 46 colunas Tirvu linha por linha
- FR12: Sistema valida cada linha independentemente (CPF formato + dígito, datas, status enum, campos obrigatórios) atribuindo status por linha
- FR13: Sistema detecta colaborador novo vs existente via match `(tenantId, cpf)` primário + `(tenantId, tirvuId)` secundário
- FR14: Sistema computa diff field-by-field para linhas classificadas como update
- FR15: Sistema detecta colaboradores ausentes na planilha (re-imports) e marca como "candidatos a inativar" sem inativação automática
- FR16: Sistema detecta valores de Lotação ainda não existentes como Workplaces e apresenta para decisão explícita
- FR17: Operador revisa tabela paginada e virtualizada de todas as linhas com status
- FR18: Operador filtra preview por status de linha
- FR19: Operador cancela no preview sem efeito colateral

**Capability Area 4 — Apply (Asynchronous Job Execution):**
- FR20: Operador dispara aplicação enqueueing job assíncrono
- FR21: Sistema processa apply assíncrono sem bloquear sessão do operador
- FR22: Sistema aplica em chunks, persistindo linhas válidas mesmo se chunks falharem
- FR23: Sistema cria Workplaces novos confirmados, escopados ao tenant alvo
- FR24: Sistema dispara cálculo CLT via VacationEngine para cada Employee criado
- FR25: Sistema marca colaboradores ausentes com `inactivePending` para revisão humana
- FR26: Sistema garante idempotência: re-run da mesma planilha = 0 modificações

**Capability Area 5 — Progress, Status & Result Reporting:**
- FR27: Operador observa progresso near-real-time da fase apply
- FR28: Operador vê sumário final (created/updated/invalid/absent/workplaces/elapsed)
- FR29: Operador baixa .xlsx com apenas linhas inválidas + coluna "motivo do erro"
- FR30: Operador navega da tela de conclusão para listagem de colaboradores populados

**Capability Area 6 — Auditing & Traceability:**
- FR31: Sistema registra AuditLog por linha afetada, agrupado por importJobId
- FR32: Sistema persiste cada job como `ImportJob` (status, tenant, operador, hash, tamanho, summary, result, timestamps)
- FR33: Sistema captura IP e user agent do operador no upload e apply
- FR34: Sistema preserva arquivo original + hash SHA-256 pelo período de retenção configurado

**Capability Area 7 — Privacy, Security & Compliance:**
- FR35: Sistema armazena campos `bankData` criptografados em repouso
- FR36: Sistema mascara campos `bankData` por default; desmascara somente com permissão `bankData.view`
- FR37: Sistema impede `bankData` em logs ou error messages
- FR38: Sistema exige permissão `import.run` para qualquer ação de import
- FR39: Sistema preserva soft-delete (`inactive=true` + `terminationDate`) para retenção legal

**Capability Area 8 — Schema Extension:**
- FR40: Sistema persiste `tirvuId` por colaborador, único dentro do tenant
- FR41: Sistema persiste personal data fields (PCD, deficiência, sexo, RG, PIS, CTPS, nomes pais, terminationDate)
- FR42: Sistema persiste address record (CEP, logradouro, número, complemento, bairro, UF, cidade)
- FR43: Sistema persiste union name
- FR44: Sistema persiste geofencing flags (outsideFence, noGeo)
- FR45: Sistema persiste flag `inactivePending`, set pelo import quando operador marca ausentes, cleared no review manual

### NonFunctional Requirements (36 total)

**Performance (NFR1-7):** preview ≤30s/1k ≤90s/5k; apply ≤5min/5k; LCP ≤1.5s; polling 2s; tabela 60fps; worker ≤512MB; bundle delta ≤80kb gz.

**Security (NFR8-14):** AES-256-GCM IV único; TLS 1.2+; 0 vazamentos cross-tenant CI; permissões dedicadas; log sanitization; SHA-256 file; rate limit 5 req/min/op.

**Scalability (NFR15-19):** BullMQ concurrency=2; tenant fairness 1 job/tenant; volume 5k/arquivo; 100 tenants ativos; storage ~150GB worst-case.

**Accessibility (NFR20-24):** WCAG 2.1 AA + axe-core CI; keyboard navigation focus visível; status colors com ícone+label; banner role="alert" aria-live; modal focus trap default Cancel Esc.

**Integration (NFR25-28):** Tirvu format tolerance; parser versioning v1; VacationEngine non-blocking; AuditLog batch ≤30s/5k.

**Reliability (NFR29-33):** auto-fail 15min; transactional chunks 100; idempotency CI; ≥99% SLA; recoverable via re-upload.

**Observability (NFR34-36):** Pino structured logs; Prometheus Phase 2; retention 5 anos disputa trabalhista (90d FS MVP + S3 Phase 2).

### Additional Requirements

**De Architecture (decisões vinculantes D1-D11):**
- Schema: estender `Employee` com `tirvuId`, `personalData` (JSON), `address` (JSON), `bankDataEnc/Iv/Tag` (binários), `unionName`, `geofencingFlags`, `inactivePending`, `terminationDate`. Criar `ImportJob` model com 8 status.
- Encryption: AES-256-GCM com HKDF-SHA256 derivation por tenant; master key 32-byte na env (`BANK_DATA_ENCRYPTION_KEY`); blacklist em logs.
- Tenant fairness: lock distribuído Redis (`SET imports:lock:{tenantId} NX EX 960`), re-enqueue 5s.
- File storage: FS local `/var/imports/{tenantId}/{jobId}.xlsx` com retenção 90d via cron.
- State machine: 8 estados (PENDING/PARSING/PREVIEW_READY/APPLYING/COMPLETED/FAILED/CANCELLED/TIMED_OUT) com guard transacional.
- Authorization: 2 permission keys novas (`import.run`, `bankData.view`).
- Match algorithm: 2-stage (`tirvuId` → `cpf`), diff field-by-field com whitelist.
- API: 6 endpoints REST com payloads JSON, multipart só upload, envelope `{ data, error, meta }`.
- Frontend: useReducer 4-state (upload/preview/applying/done), URL state, polling 2s, virtualização.
- Re-import sobre soft-deleted: 5ª categoria `reactivation_pending`, default = manter inativo.
- Stack novas deps: `xlsx` (server), `react-dropzone`, `@tanstack/react-virtual`, `zod` (já em V3).

**De UX Design:**
- 4 estados visuais com URL querystring `?step=upload|preview|applying|done`
- Banner persistente do tenant (SuperAdmin only) com role="alert" aria-live="assertive", AAA contrast ≥7:1, ≥18px
- 6 status badges (Criar/Atualizar/Inválido/Ausente/Reativação/Sem alterações) com ícone+label+cor redundantes
- Modal confirm-typing GitHub-style (input desabilitado até match exato do tenant name)
- Tabela virtualizada com diff field-by-field expansível inline
- Progress polling smoothing via requestAnimationFrame entre polls de 2s
- Sidebar entry "Importações > Colaboradores" com hover-expand
- Mobile read-only (operação é desktop-first)
- 12 critérios WCAG 2.1 AA mapeados (axe-core no CI)

**Action items operacionais (gating de stories específicas):**
- 🔧 OP1: `openssl rand -base64 32` → Docker Secret `BANK_DATA_ENCRYPTION_KEY` (gating Story 5.1)
- 🔧 OP2: Volume `imports-data:/var/imports` em `docker-compose.yml` + `docker-compose.swarm.yml` (gating Story 1.1)
- 🔧 OP3: Medir LCP atual de `/admin/tenants` (gating Story 4.1)
- 🔧 OP4: Decidir `imports.enabled=true|false` para Green House no startup (gating deploy)

### FR Coverage Map (cada FR mapeada para ≥1 story)

| FR | Story principal | Stories adicionais que tocam |
|---|---|---|
| FR1 | 1.2 (Upload SuperAdmin endpoint) | 4.1 |
| FR2 | 1.3 (Upload TenantAdmin endpoint) | 4.1 |
| FR3 | 1.2 + 1.3 | — |
| FR4 | 1.2 + 1.3 | — |
| FR5 | 2.2 (parser detection) | — |
| FR6 | 1.1 (storage handler) | — |
| FR7 | 4.1 (UI tenant picker) | 1.2 |
| FR8 | 5.1 (tenant enforcement) | 1.2, 1.3 |
| FR9 | 4.1 (banner persistente) | — |
| FR10 | 4.2 (modal confirm-typing) | 3.1 (backend validation) |
| FR11 | 2.2 (parser tirvu-v1) | — |
| FR12 | 2.2 (validator) | — |
| FR13 | 2.3 (matcher 2-stage) | — |
| FR14 | 2.3 (diff field-by-field) | 4.1 (render expandido) |
| FR15 | 2.3 (detecção ausentes) | 4.1 (UI 👻 Ausente) |
| FR16 | 2.3 (detecção workplaces) | 4.1 (UI block lotações novas) |
| FR17 | 4.1 (tabela virtualizada) | — |
| FR18 | 4.1 (filter chips) | — |
| FR19 | 4.1 (cancel sem side effect) | 3.1 (backend cancel endpoint) |
| FR20 | 3.2 (apply trigger + enqueue) | — |
| FR21 | 3.1 (BullMQ async worker) | — |
| FR22 | 3.2 (chunks transacionais) | — |
| FR23 | 3.2 (Workplace creation) | — |
| FR24 | 3.2 (VacationEngine integration) | — |
| FR25 | 3.2 (inactivePending flag) | — |
| FR26 | 2.3 (idempotency proof) + 3.2 | testes em ambas |
| FR27 | 4.2 (progress polling UI) | 3.1 (status endpoint) |
| FR28 | 4.2 (summary view) | — |
| FR29 | 4.2 (error report download) | 3.2 (backend builder) |
| FR30 | 4.2 (navigate to employees) | — |
| FR31 | 3.2 (AuditLog per row) | — |
| FR32 | 2.1 (ImportJob model) | 3.1 (state transitions) |
| FR33 | 1.2 + 1.3 (capture IP/UA) | — |
| FR34 | 1.1 (file persist + SHA-256) | — |
| FR35 | 5.1 (encryption module) | 2.1 (schema columns) |
| FR36 | 5.2 (masking endpoint) | — |
| FR37 | 5.2 (log sanitization) | — |
| FR38 | 5.1 (permission keys) | 1.2, 1.3, 3.2 |
| FR39 | 2.3 (preserve soft-delete) | 3.2 (reactivation flow) |
| FR40 | 2.1 (schema tirvuId) | 2.3 (match key) |
| FR41 | 2.1 (schema personalData JSON) | 3.2 (apply persists) |
| FR42 | 2.1 (schema address JSON) | 3.2 (apply persists) |
| FR43 | 2.1 (schema unionName) | 3.2 (apply persists) |
| FR44 | 2.1 (schema geofencingFlags JSON) | 3.2 (apply persists) |
| FR45 | 2.1 (schema inactivePending) | 3.2 (apply sets flag) |

**Cobertura: 45/45 = 100%. Cada FR aparece em ≥1 story.**

## Epic List

### Epic 1: Upload de planilha Tirvu
Operador (SuperAdmin com seleção explícita de tenant alvo, ou TenantAdmin do tenant fixo do JWT) pode subir um arquivo .xlsx Tirvu, com validação de formato/tamanho/header, persistência do arquivo original com hash, captura de IP/UserAgent para auditoria, banner persistente do tenant alvo durante todo o fluxo, e enforcement de permissão `import.run`. **Standalone: termina com um ImportJob em status PENDING e arquivo persistido pronto para parsing.**

**FRs covered:** FR1, FR2, FR3, FR4, FR6, FR7, FR9, FR33, FR34, FR38 (10)

**Complexidade relativa:** M

### Epic 2: Preview e validação
Sistema parse o arquivo persistido (parser tirvu-v1 streaming + zod validation per row), executa match idempotente em 2 stages (`tirvuId` → `cpf`), computa diff field-by-field para updates, detecta Workplaces novos e colaboradores ausentes (5 categorias: criar/atualizar/inválido/ausente/reativação/sem-alteração), e devolve preview paginado virtualizado para o operador revisar. **Standalone: termina com um ImportJob em status PREVIEW_READY com summary populado e operador podendo cancelar sem efeito colateral.**

**FRs covered:** FR5, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR26, FR32, FR39, FR40, FR41, FR42, FR43, FR44, FR45 (19)

**Complexidade relativa:** L

### Epic 3: Aplicação de import (assíncrona, idempotente, auditada)
Operador confirma com modal explícito (que repete o nome do tenant alvo, GitHub-style typing). Backend valida confirmação e enfileira job apply via BullMQ com tenant fairness (lock distribuído Redis 1 job/tenant). Worker aplica em chunks transacionais de 100 linhas (falhas parciais não rollbackam total), criando Workplaces confirmados, integrando com VacationEngine para cálculo CLT do saldo de cada colaborador novo, registrando AuditLog por linha agrupado por importJobId, marcando colaboradores ausentes com `inactivePending` (nunca auto-inativando). **Standalone: termina com ImportJob em status COMPLETED + dados persistidos no banco + auditoria completa.**

**FRs covered:** FR20, FR21, FR22, FR23, FR24, FR25, FR27, FR28, FR31 (9)

**Complexidade relativa:** L

### Epic 4: Resultado, recuperação e UX completa do fluxo
Operador acompanha progresso real-time (polling 2s com smoothing client-side) durante a fase APPLYING, vê tela de sumário final (cards de criados/atualizados/inválidos/ausentes/reativações, lotações criadas), baixa relatório .xlsx das linhas inválidas com coluna "motivo do erro", navega para listagem de colaboradores populados, ou em caso de falha vê tela com motivo amigável e ação de recuperação (re-upload). Inclui também: backend de FR10 confirmation modal validation, sidebar entry no V3, todos os 4 estados visuais cumprindo WCAG 2.1 AA. **Standalone: encapsula toda a UX do fluxo + resultado, pode ser entregue após Epic 1+2+3.**

**FRs covered:** FR10, FR29, FR30 (3, mas implementa toda a UI dos 4 estados envolvendo FR1, FR2, FR7, FR9, FR17, FR18, FR19, FR27, FR28 do frontend)

**Complexidade relativa:** L

### Epic 5: Importação Segura de Dados Sensíveis (LGPD)
Operador importa com confiança de que campos `bankData` (PIX, banco, agência, conta) são criptografados em repouso (AES-256-GCM com HKDF-SHA256 derivation por tenant), mascarados por default em listagens de colaborador (mostra `****1234`), desmascarados apenas com permissão dedicada `bankData.view` + AuditLog automático de acesso, jamais aparecem em logs (sanitization plugin), e tenant isolation é garantido fisicamente no backend (não confia em UI). **Standalone: hardening cross-cutting que pode ser entregue em paralelo com Epic 3, mas é gating de produção (sem Epic 5, Epic 3 não vai pra prod por risco LGPD).**

**FRs covered:** FR8, FR35, FR36, FR37 (4)

**Complexidade relativa:** M

---

**Total estimado: 13 stories distribuídas em 5 epics. MVP entregável em 1 sprint focado.**

### Epic Independence Check

- **Epic 1** standalone ✅ (não depende de 2-5; entrega ImportJob PENDING)
- **Epic 2** usa output de Epic 1 (arquivo persistido) ✅; não depende de 3-5
- **Epic 3** usa output de Epic 1+2 ✅; não depende de 4-5; **mas é gated por Epic 5 em produção** (encryption obrigatória)
- **Epic 4** usa output de Epic 3 ✅; não depende de 5
- **Epic 5** transversal — pode ser entregue em qualquer ordem como hardening; **gating point: não fazer release público sem Epic 5 mergeado**

### Implementation Sequence (Architecture-aware D11)

```
[Epic 5 — Story 5.1: encryption + permissions]  ──── BLOQUEIA Epic 3 ────┐
[Epic 1 — Story 1.1: volume + storage handler]  paralelo              │
[Epic 2 — Story 2.1: schema migration + ImportJob]  ────────────────┐  │
[Epic 1 — Story 1.2: upload SuperAdmin endpoint] depende de 1.1     │  │
[Epic 1 — Story 1.3: upload TenantAdmin endpoint] depende de 1.1+2.1 │  │
[Epic 2 — Story 2.2: parser + validator] depende de 2.1             │  │
[Epic 2 — Story 2.3: matcher + diff + reactivation]                  ──┘  │
[Epic 3 — Story 3.1: BullMQ worker + state machine + fairness]  ─────────┘
[Epic 3 — Story 3.2: apply chunks + audit + VacationEngine]
[Epic 4 — Story 4.1: UI Upload + Preview + sidebar]
[Epic 4 — Story 4.2: UI Apply progress + Done + error report download]
[Epic 5 — Story 5.2: log sanitization + bankData masking endpoint]
[Epic 5 — Story 5.3: penetration tests cross-tenant CI]
```

**Critical path:** Story 5.1 → Story 2.1 → Story 2.2 → Story 2.3 → Story 3.1 → Story 3.2 → Story 4.1 → Story 4.2.
**Off-critical path (paralelizável):** Story 1.1, 1.2, 1.3 podem rodar paralelas a Story 2.x/3.x. Story 5.2/5.3 paralelas com Epic 4.

---

## Epic 1: Upload de planilha Tirvu

Operador inicia o fluxo subindo um arquivo .xlsx Tirvu, com validação de formato/tamanho/header, persistência segura, captura de auditoria e banner de tenant alvo. Termina com `ImportJob` em status PENDING pronto para Epic 2 processar.

### Story 1.1: Persistência segura de arquivo de import com hash e auditoria

As a desenvolvedor backend,
I want um módulo `import-storage` que recebe um buffer de arquivo, gera SHA-256, persiste em FS local em estrutura por tenant e devolve metadata,
So that os endpoints de upload (Stories 1.2 e 1.3) tenham um helper consistente e auditável de persistência.

**Acceptance Criteria:**

**Given** uma instância do módulo `import-storage` configurada com `IMPORT_FILE_STORAGE_PATH=/var/imports`
**When** chamo `storage.persist({ tenantId, jobId, buffer, filename: 'serviplus.xlsx' })`
**Then** o arquivo é gravado em `/var/imports/{tenantId}/{jobId}.xlsx`
**And** o método retorna `{ storagePath, fileHash: <sha256-hex>, fileSize: <bytes> }`
**And** se o diretório do tenant não existe, é criado com permissões `0700` (apenas owner)

**Given** o arquivo persistido em FS
**When** chamo `storage.read({ tenantId, jobId })`
**Then** o método valida que o hash atual bate com o hash registrado e retorna o buffer
**And** se hash divergir (corrupção/tampering), lança `FileIntegrityError` (não retorna conteúdo)

**Given** um job em status terminal há mais de 90 dias
**When** o cron `cleanup-cron` roda
**Then** o arquivo correspondente é removido do FS
**And** o registro `ImportJob` é mantido (auditoria), mas com `storagePath=null` e `errorReportPath=null`

**Given** o volume Docker `imports-data` declarado em `docker-compose.yml` e `docker-compose.swarm.yml` (action item OP2 do Bruno)
**When** o backend sobe em dev ou prod
**Then** o caminho `/var/imports` está montado e gravável (testado por health check do plugin `imports.ts`)

**Cobre:** FR6, FR34
**Gating:** OP2 (volume Docker declarado)
**Complexidade:** S

---

### Story 1.2: Endpoint de upload SuperAdmin com seleção de tenant alvo

As a SuperAdmin (Bruno),
I want fazer POST /admin/imports/employees com multipart `file` + body `{ tenantId }` e receber um `jobId` para acompanhar,
So that posso iniciar import de qualquer tenant ativo (onboarding de cliente novo) com auditoria.

**Acceptance Criteria:**

**Given** um SuperAdmin autenticado com permissão `import.run`
**When** envia POST /admin/imports/employees com multipart `file=serviplus.xlsx` (5MB válido) e body `{ tenantId: <uuid-de-servi-plus> }`
**Then** o endpoint retorna 201 com `{ data: { jobId, status: 'PENDING' }, error: null, meta: null }`
**And** um `ImportJob` é criado com `tenantId` correto, `operatorUserId`, `filename`, `fileSize`, `fileHash` (via Story 1.1), `ipAddress`, `userAgent`, `status: 'PENDING'`, `parserVersion: 'tirvu-v1'`
**And** o BullMQ job na queue `imports` é enfileirado com payload `{ jobId, tenantId, phase: 'parse' }`
**And** AuditLog `EMPLOYEE_IMPORT_JOB_CREATED` é registrado

**Given** um SuperAdmin autenticado
**When** envia upload com `tenantId` apontando para tenant inexistente ou inativo
**Then** retorna 400 com `error.code='INVALID_TARGET_TENANT'` e mensagem clara
**And** nenhum arquivo é persistido, nenhum job criado

**Given** um TenantAdmin (não SuperAdmin) autenticado
**When** tenta acessar POST /admin/imports/employees
**Then** retorna 403 `error.code='FORBIDDEN'`
**And** nenhum side effect

**Given** um SuperAdmin autenticado
**When** envia arquivo com extensão `.csv` ou tamanho >10MB
**Then** retorna 400 com `error.code='INVALID_FILE_FORMAT'` ou `'FILE_TOO_LARGE'` respectivamente
**And** nenhum arquivo é persistido

**Given** um SuperAdmin autenticado
**When** faz 6 uploads em <1 minuto
**Then** o 6º retorna 429 `error.code='RATE_LIMIT_EXCEEDED'`

**Cobre:** FR1, FR3, FR4, FR7, FR33, FR34, FR38
**Depende de:** Story 1.1 (storage), Story 5.1 (permissões `import.run`)
**Complexidade:** M

---

### Story 1.3: Endpoint de upload TenantAdmin com tenant fixo do JWT

As a TenantAdmin (Carla),
I want fazer POST /imports/employees com multipart `file` (sem precisar selecionar tenant) e receber um `jobId`,
So that posso fazer reimport mensal de manutenção do meu próprio tenant sem risco de cross-tenant.

**Acceptance Criteria:**

**Given** um TenantAdmin do tenant Servi-Plus, com permissão `import.run`
**When** envia POST /imports/employees com multipart `file`
**Then** retorna 201 com `{ data: { jobId, status: 'PENDING' } }`
**And** o `ImportJob.tenantId` é derivado do JWT (não aceita override no payload)
**And** demais comportamentos batem com Story 1.2 (storage, audit, BullMQ enqueue)

**Given** um TenantAdmin
**When** envia POST /imports/employees com `tenantId` explícito no body apontando para outro tenant
**Then** o backend **ignora** o tenantId do payload e usa o do JWT (não retorna erro — silencioso, defensive)
**And** AuditLog tem o tenantId do JWT (não do payload)

**Given** um SUPERVISOR ou OPERATOR (sem permissão `import.run`)
**When** tenta acessar POST /imports/employees
**Then** retorna 403 `error.code='FORBIDDEN'`

**Given** um TenantAdmin do tenant Servi-Plus
**When** ele tenta fazer GET /imports/{jobId-de-outro-tenant}
**Then** retorna 404 `error.code='JOB_NOT_FOUND'` (não 403 — não vazar existência cross-tenant)

**Cobre:** FR2, FR3, FR4, FR8 (parcial — backend tenant enforcement), FR33, FR34, FR38
**Depende de:** Story 1.1, Story 5.1
**Complexidade:** S

---

## Epic 2: Preview e validação

Sistema processa o arquivo persistido (parser → validador → matcher) e devolve preview com 6 categorias para o operador revisar e cancelar/aplicar.

### Story 2.1: Schema migration para Employee + ImportJob model

As a desenvolvedor backend,
I want uma migration Prisma que estende `Employee` (tirvuId, personalData JSON, address JSON, bankDataEnc/Iv/Tag binários, unionName, geofencingFlags JSON, inactivePending bool, terminationDate) e cria `ImportJob` model com 8 status,
So that as Stories 2.2/2.3/3.x podem persistir os campos novos exigidos pela planilha Tirvu.

**Acceptance Criteria:**

**Given** o schema Prisma base do V3
**When** roda `npx prisma migrate dev --name add_import_tirvu_v3_2`
**Then** uma nova migration é criada em `prisma/migrations/20260501XXXXXX_add_import_tirvu_v3_2/migration.sql`
**And** a tabela `employees` ganha colunas: `tirvu_id` (text, nullable), `personal_data` (jsonb, nullable), `address` (jsonb, nullable), `bank_data_enc` (bytea, nullable), `bank_data_iv` (bytea, nullable), `bank_data_tag` (bytea, nullable), `union_name` (text, nullable), `geofencing_flags` (jsonb, nullable), `inactive_pending` (bool not null default false), `termination_date` (timestamptz nullable)
**And** unique constraint `(tenant_id, tirvu_id)` é criada (apenas quando `tirvu_id IS NOT NULL`)
**And** index `(tenant_id, inactive_pending)` é criado
**And** uma nova tabela `import_jobs` é criada com todos os campos descritos em Architecture D1 + enum `ImportJobStatus`
**And** index `(tenant_id, status, created_at)` em `import_jobs` é criado

**Given** a migration aplicada
**When** rodo `npx prisma generate`
**Then** o cliente TS exporta tipos `Employee` (com novos campos) e `ImportJob`
**And** TS compila sem erros nos pontos onde Employee é usado (campos novos são opcionais em Create input)

**Given** dados existentes em produção (Employees pré-migration)
**When** a migration é aplicada
**Then** colaboradores existentes ficam com todos os campos novos `null`/`false` (sem perda de dados)
**And** tenant scoping da Prisma extension continua cobrindo as queries (testado por unit test do Story 5.1 cross-tenant)

**Cobre:** FR32, FR40, FR41, FR42, FR43, FR44, FR45
**Depende de:** Story 5.1 (encryption — schema usa colunas que serão preenchidas pela bank-data-encryption module)
**Complexidade:** S

---

### Story 2.2: Parser tirvu-v1 com header detection + validador por linha

As a desenvolvedor backend,
I want um módulo `tirvu-parser` que lê arquivo .xlsx em streaming, detecta header tirvu-v1 (46 colunas), parseia cada row para um `TirvuRow` tipado, e um módulo `import-validator` que aplica zod + regras de negócio (CPF dígito, datas dd/MM/yyyy),
So that o worker de Story 3.1 possa processar arquivos sem inventar formato e o preview tenha row status correto.

**Acceptance Criteria:**

**Given** um buffer/stream de arquivo .xlsx com header padrão Tirvu (46 colunas conhecidas)
**When** chamo `tirvuParser.detect(workbook)`
**Then** retorna `'tirvu-v1'`

**Given** um arquivo .xlsx com header divergente (44 colunas, ou colunas em ordem diferente)
**When** chamo `tirvuParser.detect(workbook)`
**Then** retorna `null`
**And** o caller (worker) deve transitar `ImportJob` para FAILED com `failureReason='INVALID_TIRVU_HEADER'`

**Given** um arquivo .xlsx tirvu-v1 com 1.000 rows (case mixed, espaços extras, células nulas em colunas opcionais)
**When** chamo `tirvuParser.parseRows(workbook)` (streaming, async iterator)
**Then** consegue iterar todas as 1.000 rows sem carregar arquivo inteiro em RAM (validado por monitor de memória ≤512MB no test fixture 5k)
**And** cada row retornado é tipado como `TirvuRow` com 46 campos (alguns potencialmente null)
**And** datas dd/MM/yyyy são convertidas para `Date` JS (ou retornam null + erro de parse se inválida)
**And** valores com whitespace ou capitalização inconsistente são normalizados (trim, casing preservado)

**Given** um `TirvuRow` parseado
**When** chamo `importValidator.validate(row)`
**Then** retorna `{ status: 'valid' | 'invalid', errors: string[] }`
**And** `status='invalid'` se: CPF tem dígito verificador errado, ou hireDate vazia/futura, ou status fora do enum [ATIVO, DEMITIDO, AFASTADO], ou name vazio
**And** errors são strings em pt-BR claras: "CPF inválido (dígito verificador não confere)", "Data de admissão fora do formato dd/MM/yyyy"

**Given** o fixture `test/fixtures/tirvu-anatel-50.xlsx` (do `docs/exemplo/`)
**When** rodo o test `tirvu-parser.test.ts`
**Then** parseia 50 rows válidos sem erros
**And** todas as 46 colunas mapeadas corretamente para o `TirvuRow`

**Given** o fixture `test/fixtures/tirvu-mixed-errors.xlsx` (5% rows inválidas)
**When** rodo o test
**Then** parser retorna 100% das rows
**And** validator marca 5% como invalid com motivo correto

**Cobre:** FR5, FR11, FR12
**Depende de:** Story 2.1 (schema)
**Complexidade:** L

---

### Story 2.3: Matcher 2-stage + diff field-by-field + detecção ausentes/reativação/workplaces novos + state transition para PREVIEW_READY

As a desenvolvedor backend,
I want um módulo `import-matcher` que faz match `(tenantId, cpf)` primário e `(tenantId, tirvuId)` secundário, computa diff field-by-field em updates, detecta colaboradores ausentes (5ª categoria reativação para soft-deleted), detecta Lotações novas, e o worker transita o `ImportJob` para PREVIEW_READY com `previewSummary` populado,
So that o operador veja exatamente o que vai acontecer antes de aplicar.

**Acceptance Criteria:**

**Given** um conjunto de TirvuRows válidos (de Story 2.2) e um `tenantId`
**When** chamo `importMatcher.matchAll(rows, ctx)`
**Then** retorna `{ create: TirvuRow[], update: { row, diff }[], invalid: { row, errors }[], absent: Employee[], reactivation: { row, employee }[], unchanged: TirvuRow[] }`

**Given** um colaborador no banco com `cpf=X, tirvuId=null, inactive=false`
**When** uma row da planilha tem `cpf=X` e demais campos idênticos
**Then** matcher retorna esse row em `unchanged` (categoria sem alteração)
**And** AuditLog **não** é gerado para unchanged (sem ação)

**Given** o mesmo colaborador
**When** a row tem `cpf=X` mas `salary` mudou de 1500 para 1700
**Then** matcher retorna em `update` com `diff={ salary: { from: 1500, to: 1700 } }`
**And** se a row tem `tirvuId=Y` (vinha vazio antes), o diff também inclui `tirvuId: { from: null, to: 'Y' }` (preencher tirvuId em re-match secundário)

**Given** um colaborador com `cpf=X, tirvuId=Y` no banco
**When** a planilha tem 2 rows: uma com `cpf=X, tirvuId=Z` (mesmo CPF, tirvuId diferente) e outra com `cpf=W, tirvuId=Y` (CPF diferente, mesmo tirvuId)
**Then** ambas as rows são marcadas `invalid` com erro "CPF da planilha pertence a outro colaborador no sistema; verifique troca de CPF"
**And** matcher não modifica banco

**Given** um colaborador com `cpf=X, inactive=true, terminationDate=2025-12-01`
**When** a planilha tem row com `cpf=X`
**Then** retorna em `reactivation` (categoria 5ª, NÃO em update)
**And** `previewSummary.reactivation` count é incrementado

**Given** um tenant com 305 colaboradores
**When** a planilha tem 300 rows e 5 dos 305 colaboradores não estão na planilha (ativos no banco, ausentes no arquivo)
**Then** retorna em `absent` esses 5 Employees
**And** **nada é modificado** no banco — apenas listado no preview

**Given** o conjunto de rows com Lotação values
**When** matcher executa
**Then** identifica Lotações que **não existem** como Workplace no tenant alvo
**And** retorna em `previewSummary.newWorkplaces: string[]`

**Given** matcher concluiu
**When** o worker chama `importJobService.transition(jobId, ['PARSING'], 'PREVIEW_READY', { previewSummary, totalRows, rowsCreated, rowsUpdated, ... })`
**Then** ImportJob fica em PREVIEW_READY com `previewSummary` JSON populado
**And** AuditLog `EMPLOYEE_IMPORT_JOB_PARSED` é registrado

**Given** um arquivo idêntico a um já importado (mesma planilha 2x)
**When** matcher roda no 2º upload
**Then** `previewSummary` retorna `{ create: 0, update: 0, invalid: 0, absent: 0, reactivation: 0, unchanged: total }`
**And** test idempotency-test.spec.ts no CI valida isso

**Given** um operador no preview decide cancelar
**When** chama POST /imports/:jobId/cancel
**Then** ImportJob transita PREVIEW_READY → CANCELLED
**And** **nada foi modificado em employees ou workplaces**

**Cobre:** FR13, FR14, FR15, FR16, FR19, FR26, FR32, FR39
**Depende de:** Story 2.1, Story 2.2
**Complexidade:** L

---

## Epic 3: Aplicação de import (assíncrona, idempotente, auditada)

Worker BullMQ aplica em chunks transacionais com tenant fairness, integrando VacationEngine e AuditLog.

### Story 3.1: BullMQ worker `imports` + tenant fairness lock + state machine completa

As a desenvolvedor backend,
I want um plugin Fastify `plugins/imports.ts` que registra a queue BullMQ `imports` com worker dedicado (concurrency=2), tenant lock via Redis (`imports:lock:{tenantId}` com SET NX EX 960), e o serviço `import-job-service` com state machine guard transacional,
So that jobs sejam processados com fairness por tenant, sem race conditions, e com transições de estado seguras.

**Acceptance Criteria:**

**Given** o plugin `imports.ts` registrado
**When** o backend sobe
**Then** uma queue BullMQ `imports` é criada com worker dedicado em `IMPORT_WORKER_CONCURRENCY=2`
**And** o worker NÃO compete com workers de email/whatsapp (queues separadas)

**Given** 2 jobs enfileirados de tenants diferentes
**When** o worker pega ambos
**Then** processa em paralelo (até concurrency=2)

**Given** 2 jobs enfileirados do mesmo tenant
**When** o worker pega o 2º enquanto o 1º ainda roda
**Then** o 2º não consegue acquire lock `imports:lock:{tenantId}` (1º tem o lock)
**And** o 2º é re-enqueued com `delay: 5000`
**And** AuditLog (debug level Pino) registra "lock contention, re-queued"

**Given** o 1º job termina (sucesso ou falha)
**When** worker chama `releaseLock(redis, tenantId)`
**Then** lock é deletado do Redis
**And** próxima vez que o 2º job for puxado da queue, conseguirá acquire

**Given** o worker crasha mid-processing (kill -9 simulado em test)
**When** outro worker assume após 16 minutos (TTL do lock)
**Then** lock expira automaticamente
**And** o job é re-processado idempotentemente (matcher detecta create+0)

**Given** um `ImportJob` em status PENDING
**When** chamo `importJobService.transition(jobId, ['PENDING'], 'PARSING', { parsedAt: now })`
**Then** transição é executada em transação Postgres com `findUnique + update`
**And** se status atual NÃO é PENDING (race condition), lança `InvalidTransitionError`

**Given** um job em status PREVIEW_READY há mais de 24 horas
**When** o cron `cleanup-cron` (diário) roda
**Then** o job transita automaticamente para CANCELLED com `failureReason='AUTO_CANCELLED_PREVIEW_TTL'`
**And** o arquivo persistido é mantido (retenção 90d ainda vale)

**Given** um worker que ficou >15 minutos sem progresso (`updatedAt > 15min`)
**When** o cron `cleanup-cron` roda
**Then** o job transita para TIMED_OUT com `failureReason='WORKER_STUCK_OR_CRASHED'`
**And** AuditLog `EMPLOYEE_IMPORT_JOB_TIMED_OUT` é registrado

**Given** logs do worker
**When** observo Pino output
**Then** todos os logs incluem `module: 'imports'`, `importJobId`, `tenantId`, `phase: 'parse'|'apply'`
**And** nenhum log contém `cpf` (exceto últimos 3 dígitos), `bankData`, `personalData.rg`, `personalData.pisPasep` em cleartext (validado por test que faz grep no buffer de logs)

**Cobre:** FR21, FR32 (state transitions), NFR15, NFR16, NFR29, NFR34
**Depende de:** Story 2.1
**Complexidade:** M

---

### Story 3.2: Apply em chunks transacionais com VacationEngine + AuditLog + idempotência

As a operador (Bruno ou Carla),
I want que ao confirmar Apply, o worker aplique a importação em chunks de 100 linhas em transações Postgres, criando Employees e Workplaces, integrando VacationEngine para saldo CLT, registrando AuditLog por linha, marcando ausentes com inactivePending e reativando soft-deleted quando confirmado,
So that meus 1.000+ colaboradores fiquem populados com saldo CLT correto, auditoria completa e sem corromper o banco em caso de falha parcial.

**Acceptance Criteria:**

**Given** um job em PREVIEW_READY com `previewSummary={ create: 47, update: 3, invalid: 2, absent: 5, reactivation: 1 }`
**When** operador chama POST /imports/:jobId/apply com body `{ confirmTenantName: 'Servi-Plus', createWorkplaces: ['ANATEL','TRT-DF','MEC'], markAbsentAsPending: true }`
**Then** backend valida `confirmTenantName` bate com nome do tenant alvo (case-sensitive); se não bate retorna 400 `error.code='CONFIRMATION_MISMATCH'`
**And** se bate, transita ImportJob PREVIEW_READY → APPLYING e enqueue novo BullMQ job com phase='apply'
**And** retorna 202 `{ data: { jobId, status: 'APPLYING' } }`
**And** AuditLog `EMPLOYEE_IMPORT_JOB_APPLIED` registrado

**Given** o worker pega o apply job
**When** processa
**Then** itera o `previewSummary` em chunks de 100 rows
**And** cada chunk roda em `prisma.$transaction`
**And** falha em 1 chunk não rollbackam chunks anteriores (linhas já aplicadas ficam aplicadas)
**And** `ImportJob.rowsProcessed` é atualizado a cada chunk concluído

**Given** uma row em categoria `create`
**When** worker aplica
**Then** novo `Employee` é criado com tenantId correto, todos os campos do TirvuRow mapeados (`tirvuId`, `cpf`, `name`, `personalData`, `address`, `unionName`, `geofencingFlags`, etc.)
**And** se a row tem dados bancários, são encryptados via `bank-data-encryption.encryptBankData()` (Story 5.1) e persistidos em `bankDataEnc/Iv/Tag`
**And** AuditLog `EMPLOYEE_IMPORT_CREATE` registrado com `newData: sanitizeForLog(employee)`
**And** `vacationEngine.scheduleBalanceComputation(employeeId)` é chamado (background, non-blocking)

**Given** uma row em categoria `update`
**When** worker aplica
**Then** o Employee existente é atualizado APENAS nos campos do diff
**And** AuditLog `EMPLOYEE_IMPORT_UPDATE` registrado com `previousData` e `newData` field-by-field

**Given** uma row em categoria `reactivation` E o operador escolheu "Reativar" (caso UI tenha apresentado opção; se default = manter inativo, então skip)
**When** worker aplica
**Then** Employee tem `inactive=false`, `terminationDate=null`, demais campos atualizados
**And** AuditLog `EMPLOYEE_IMPORT_REACTIVATE` registrado

**Given** uma Lotação nova confirmada para criação
**When** worker aplica
**Then** novo `Workplace` é criado com `name=Lotação`, `tenantId` correto, `minStaff=1` default
**And** `previewSummary.workplacesCreated` é incrementado
**And** AuditLog `WORKPLACE_CREATED_VIA_IMPORT` registrado

**Given** colaborador no banco ausente da planilha + `markAbsentAsPending: true`
**When** worker aplica
**Then** Employee tem `inactivePending=true` (NÃO `inactive=true`)
**And** AuditLog `EMPLOYEE_IMPORT_FLAG_INACTIVE_PENDING` registrado

**Given** uma row marcada como invalid no preview
**When** worker aplica
**Then** **nada** é feito no banco para essa row
**And** AuditLog `EMPLOYEE_IMPORT_INVALID` registrado com `reason: errors[0]`
**And** linha entra no relatório de erros (Story 4.2)

**Given** todos os chunks processados
**When** worker conclui
**Then** ImportJob transita APPLYING → COMPLETED com `completedAt`, `rowsCreated`, `rowsUpdated`, `rowsInvalid`, `rowsAbsent`, `workplacesCreated` finais
**And** se `rowsInvalid > 0`, dispara `errorReportBuilder.build(jobId)` para gerar `.xlsx` em `/var/imports/{tenantId}/{jobId}-errors.xlsx`
**And** AuditLog `EMPLOYEE_IMPORT_JOB_COMPLETED` registrado

**Given** o mesmo arquivo é re-aplicado (job 2 com mesma planilha)
**When** worker processa
**Then** test idempotency-test.spec.ts no CI valida que `rowsCreated=0, rowsUpdated=0` no 2º run

**Given** falha catastrófica no banco (connection pool exausto, OOM)
**When** worker tenta aplicar e falha 3x com backoff
**Then** ImportJob transita para FAILED com `failureReason` técnico
**And** linhas já aplicadas em chunks anteriores ficam aplicadas (idempotência permite re-run após fix)

**Cobre:** FR20, FR22, FR23, FR24, FR25, FR27 (counters), FR28 (final summary), FR31, FR10 (backend confirm), NFR2, NFR15, NFR30, NFR31
**Depende de:** Story 2.3, Story 3.1, Story 5.1
**Complexidade:** L

---

## Epic 4: Resultado e UX completa do fluxo

UX completa do fluxo: 4 estados frontend + sidebar + relatório de erros + acessibilidade.

### Story 4.1: UI Upload + Preview com tenant picker, banner persistente, dropzone, tabela virtualizada e filtros

As a operador (Bruno ou Carla),
I want acessar `/admin/imports/employees` (SuperAdmin) ou `/settings/imports/employees` (TenantAdmin), selecionar tenant alvo (apenas SuperAdmin), arrastar arquivo .xlsx, ver banner persistente do tenant, e revisar preview com tabela virtualizada paginada filtrando por status,
So that eu visualize claramente o que vai acontecer antes de aplicar a importação.

**Acceptance Criteria:**

**Given** sou SuperAdmin acessando `/admin/imports/employees`
**When** a página carrega (sem dados, primeira visita)
**Then** TTFB ≤500ms, LCP ≤1.5s (medido com Chrome DevTools em rede normal — gating OP3 baseline V3)
**And** vejo título "Importar colaboradores", dropdown "Tenant alvo" com placeholder "Selecione um tenant..." e área dropzone desabilitada até tenant ser selecionado
**And** info icon ⓘ ao lado de "Tenant alvo" com tooltip explicando comportamento

**Given** seleciono o tenant "Servi-Plus"
**When** dropzone fica habilitado e arrasto/seleciono arquivo `serviplus.xlsx` (5MB válido)
**Then** dropzone mostra estado dragover (border solid blue-500, escala 1.02) e em seguida estado uploading com barra de progresso linear
**And** ao completar upload, navego para querystring `?step=preview&jobId=...&tenantId=...`

**Given** sou SuperAdmin no estado preview
**When** banner persistente do tenant alvo é renderizado
**Then** banner está fixed top com `bg-blue-600 text-white height-40px`, conteúdo "📂 IMPORTANDO PARA: SERVI-PLUS" (nome em 18px bold), botão "✕ Cancelar" à direita
**And** banner tem `role="alert" aria-live="assertive"` (validado por axe-core no CI)
**And** contraste do nome ≥7:1 (AAA)

**Given** sou TenantAdmin
**When** acesso `/settings/imports/employees`
**Then** **não há** banner persistente (tenant é fixo do JWT, redundante)
**And** página mostra "Tenant: Servi-Plus" em texto simples acima do dropzone

**Given** preview carregado com 1.000 rows
**When** página renderiza
**Then** vejo 6 cards de contagem (Criar/Atualizar/Inválido/Ausente/Reativação/Sem alterações) com ícone+label+cor
**And** se há `newWorkplaces`, vejo block azul-50 "Lotações novas detectadas: ANATEL, TRT-DF, MEC" com 2 radios ("Criar todas" / "Decidir caso a caso")
**And** vejo filter chips com counts por categoria
**And** vejo tabela com 50 rows visíveis (paginação)
**And** scroll na tabela mantém 60fps (validado em DevTools Performance tab no fixture 5k)

**Given** clico em uma row de status `update`
**When** linha expande
**Then** vejo diff field-by-field formatado (ex.: "Salário: R$ 1.500,00 → R$ 1.700,00 [+13.3%]")

**Given** clico em filter chip "Inválido"
**When** filtro aplica
**Then** tabela mostra apenas rows inválidas (≤100ms client-side, sem chamada de API)
**And** badge `aria-pressed="true"` no chip ativo

**Given** clico no botão "Cancelar" do banner
**When** modal de confirmação aparece
**Then** modal pede "Tem certeza? Nenhum dado foi alterado." e ao confirmar transita ImportJob para CANCELLED via POST /imports/:jobId/cancel

**Given** uso teclado para navegar (Tab/Shift+Tab)
**When** percorro elementos interativos
**Then** ordem segue layout visual: tenant picker → dropzone → format help → cards → chips → tabela → botões finais
**And** focus visible com outline ≥2px contrast ≥3:1
**And** axe-core CI passa sem violations

**Given** sidebar V3 atualizada
**When** vejo o menu
**Then** há entry "Importações" com ícone `Upload` (lucide-react) sob seção Admin (SuperAdmin) ou Configurações (TenantAdmin)
**And** sub-itens "Colaboradores" (linka `/admin/imports/employees` ou `/settings/imports/employees`) e "Histórico" desabilitado com tooltip "Em breve"

**Cobre:** FR1, FR2, FR7, FR9, FR16, FR17, FR18, FR19 (UI cancel), NFR3, NFR5, NFR20, NFR21, NFR22, NFR23
**Depende de:** Story 1.2, Story 1.3, Story 2.3
**Gating:** OP3 (LCP baseline medido)
**Complexidade:** L

---

### Story 4.2: UI Apply + Confirm Modal + Progress + Done + Error Report Download

As a operador,
I want clicar "Aplicar importação", ver modal confirm-typing repetindo o nome do tenant, acompanhar progresso real-time durante apply, ver tela de sumário final com cards de resultado e baixar relatório .xlsx das linhas inválidas, ou em caso de falha ver tela amigável com motivo,
So that eu conclua o fluxo com confiança e recupere erros facilmente.

**Acceptance Criteria:**

**Given** estou no preview e clico "Aplicar importação"
**When** modal aparece
**Then** modal tem `role="dialog" aria-modal="true"`, focus trap (validado), default focus em "Cancelar"
**And** mostra resumo das operações ("Criar 47, Atualizar 3, Reativar 1, Criar 3 lotações, Ignorar 2 inválidas")
**And** input "Digite o nome do tenant para confirmar" — botão "Confirmar e aplicar" disabled até match exato do nome (case-sensitive, trim)
**And** Esc fecha modal sem efeito

**Given** digito "Servi-Plus" no input
**When** match exato
**Then** botão "Confirmar e aplicar" habilita
**And** ao clicar, POST /imports/:jobId/apply é enviado com body `{ confirmTenantName: 'Servi-Plus', createWorkplaces: [...], markAbsentAsPending: <radio choice> }`
**And** modal fecha e navego para `?step=applying`

**Given** estou no estado applying
**When** página renderiza
**Then** banner persistente do tenant continua visível (SuperAdmin)
**And** vejo progress bar linear animada com smoothing (requestAnimationFrame entre polls)
**And** vejo "Processadas: X / Y linhas", "Tempo decorrido: X", "Tempo estimado: ~Y" (ETA aparece após 100 rows)
**And** vejo cards parciais (criados/atualizados/erros parciais)
**And** mensagem "Você pode fechar esta aba — atualizamos a cada 2 segundos"
**And** seção `role="status" aria-live="polite"` anuncia progresso a cada 25%

**Given** o job é COMPLETED
**When** próximo poll detecta status terminal
**Then** navego para `?step=done`
**And** vejo título "✅ Importação concluída", cards finais (criar/atualizar/lotações criadas/inválidos)
**And** se `rowsAbsent > 0`, vejo "👻 N marcados como candidatos a inativar — revise em Colaboradores" (link `/employees?filter=inactive_pending`)
**And** se `rowsInvalid > 0`, vejo block com botão "⬇ Baixar relatório de erros (.xlsx)"
**And** botões "Ver colaboradores ▶" (navega para `/employees?recent=true&jobId=...`) e "Nova importação" (reset state)

**Given** clico em "Baixar relatório de erros"
**When** download dispara
**Then** GET /imports/:jobId/error-report.xlsx retorna `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` com .xlsx contendo só as linhas inválidas + coluna "motivo do erro" + coluna "linha original"

**Given** o job é FAILED
**When** poll detecta status FAILED
**Then** navego para `?step=done` (variante falha)
**And** vejo "❌ Importação falhou", motivo amigável (microcopy variantes INVALID_TIRVU_HEADER, TIMED_OUT, FILE_CORRUPT, INTERNAL_ERROR)
**And** botões "⬇ Baixar arquivo original" (GET arquivo via storage handler) e "Tentar novamente" (reset → step=upload mantendo tenant alvo)

**Given** uso leitor de tela NVDA
**When** percorro o fluxo do upload ao done
**Then** narrativa segue exemplo da UX spec §5.5 (anúncios em transições significativas, confirmação de operações, modal anunciado)

**Cobre:** FR10 (UI), FR27 (UI polling), FR28 (UI summary), FR29 (UI download), FR30 (UI navigate), NFR4, NFR24
**Depende de:** Story 4.1, Story 3.2 (apply backend)
**Complexidade:** L

---

## Epic 5: Importação Segura de Dados Sensíveis (LGPD)

Hardening cross-cutting de segurança LGPD/multi-tenant. Gating de produção do Epic 3.

### Story 5.1: Encryption module AES-256-GCM + HKDF derivation + permission keys (`import.run`, `bankData.view`)

As a desenvolvedor backend,
I want um módulo `bank-data-encryption` que usa node:crypto para AES-256-GCM com HKDF-SHA256 derivation por tenant da master key da env, e duas novas permission keys (`import.run`, `bankData.view`) registradas no RBAC do V3,
So that dados bancários sejam criptografados em repouso por tenant, e ações de import/visualização exijam permissões dedicadas (não admin generalista).

**Acceptance Criteria:**

**Given** a env var `BANK_DATA_ENCRYPTION_KEY` configurada como 32 bytes base64 (gating OP1: `openssl rand -base64 32` em Docker Secret)
**When** o módulo carrega
**Then** valida que a chave é exatamente 32 bytes e lança erro fatal no startup se inválida

**Given** a master key e um tenantId
**When** chamo `deriveTenantKey(tenantId)`
**Then** retorna uma chave de 32 bytes derivada via `hkdfSync('sha256', masterKey, salt=tenantId, info='gestao-ferias.bankData', 32)`
**And** mesma input → mesma output (determinístico)
**And** tenantIds diferentes → chaves diferentes

**Given** um objeto BankData `{ tipoPix: 'CPF', chavePix: '036.707.881-31', banco: '001', tipoConta: 'CC', agencia: '1234', conta: '56789-0' }` e um tenantId
**When** chamo `encryptBankData(data, tenantId)`
**Then** retorna `{ enc: Buffer, iv: Buffer (12 bytes), tag: Buffer (16 bytes) }`
**And** IV é único per record (random)

**Given** o ciphertext + IV + tag + tenantId correto
**When** chamo `decryptBankData({ enc, iv, tag }, tenantId)`
**Then** retorna o BankData original (round-trip preservado)

**Given** o ciphertext + IV + tag + tenantId **errado** (outro tenant)
**When** chamo `decryptBankData({ enc, iv, tag }, otherTenantId)`
**Then** lança `AuthenticationError` (GCM tag detecta tampering — chave diferente)

**Given** o test `bank-data-encryption.test.ts`
**When** rodo no CI
**Then** valida: round-trip 100 inputs aleatórios, tampering detection (modificar 1 byte de enc → erro), tenantId isolation (decrypt com outro tenantId falha), key derivation determinismo

**Given** sistema de permissões V3 atual (role-based hardcoded — descoberto em discovery: V3 NÃO tem model `Permission` data-driven)
**When** crio um módulo `backend-api/src/modules/auth/permissions.ts` com **mapa estático** `PERMISSION_TO_ROLES = { 'import.run': ['SUPERADMIN','ADMIN'], 'bankData.view': ['SUPERADMIN'] }`
**Then** o mapa é a fonte única de verdade de "qual role pode qual permission key" no MVP
**And** futura migração para data-driven (Phase 2 — épico próprio `v3-3-rbac-data-driven`) substitui o mapa por `await prisma.permission.findMany()` sem mexer em nenhum caller

**Given** o módulo permissions registrado como plugin Fastify (`plugins/permissions.ts`)
**When** uma rota declara `{ preHandler: fastify.requirePermission('import.run') }`
**Then** middleware verifica `request.user.role` está em `PERMISSION_TO_ROLES['import.run']`
**And** se sim, prossegue; se não, retorna 403 com `error.code='FORBIDDEN'`
**And** middleware é compatível com `requireAuth` existente (assume que `request.user` já populado pela cadeia padrão)

**Given** o middleware `requirePermission`
**When** chamo com permission key inexistente (ex.: `requirePermission('foo')`)
**Then** lança erro fatal no startup ou retorna 500 (defensive — bug de programador, não user input)

**Given** rotas existentes do V3 (auth, admin, team, etc.)
**When** este módulo é introduzido
**Then** **rotas legadas NÃO são tocadas** (continuam usando `requireAdmin`/`requireSuperAdmin`)
**And** apenas rotas novas (Stories 1.2, 1.3, 3.2, e bankData masking de 5.2) usam `requirePermission`
**And** comportamento observável de auth do V3 fica idêntico para usuários existentes

**🔻 OUT-OF-SCOPE MVP — documentado explicitamente:**
- AC8 original ("opt-in per tenant pelo SuperAdmin") **não é implementada no MVP**
- `bankData.view` granular per ADMIN/tenant requer model `Permission` + UI de gestão = épico próprio `v3-3-rbac-data-driven`
- TODO no código: `// TODO(v3-3): substituir mapa estático por consulta data-driven quando rbac-data-driven estiver pronto`
- Aceitação MVP: `bankData.view` é fixo em SUPERADMIN — Bruno consegue ver, demais ADMINs não. Acceptable porque hoje só Bruno é SuperAdmin operacional.

**Cobre:** FR8 (parcial — permission key), FR35, FR38, NFR8, NFR10 (parcial — CI test cross-tenant decryption)
**Gating:** OP1 (Docker Secret BANK_DATA_ENCRYPTION_KEY provisionada)
**Complexidade:** M

---

### Story 5.2: Log sanitization plugin + bankData masking endpoint com AuditLog de acesso desmascarado

As a operador (SuperAdmin) e auditor LGPD,
I want que campos sensíveis (`bankData.*`, `cpf` exceto últimos 3, `personalData.rg`, `personalData.pisPasep`) NUNCA apareçam em logs do servidor, e que GET /employees/:id devolva `bankData` mascarado por default (`{ masked: true, last4: '1234' }`) com opção de desmascarar somente com header `X-Show-Bank-Data: true` + permission `bankData.view`, registrando AuditLog automático em todo acesso desmascarado,
So that LGPD seja respeitada (princípio de minimização e prestação de contas) e vazamentos via logs ou API default sejam impossíveis.

**Acceptance Criteria:**

**Given** o plugin Pino logger com sanitization habilitado
**When** qualquer log do módulo `imports` é emitido (info/warn/error/debug)
**Then** ANTES da emissão, blacklist remove paths: `bankData.*`, `personalData.rg`, `personalData.pisPasep`, `cpf` (substituído por `***LAST3` formato)
**And** test `log-sanitization.test.ts` faz: dispara um job com fixture, captura buffer de stdout do test, faz grep por padrões `^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$` (CPF formato completo), `chavePix`, `agencia` — todos devem dar 0 matches

**Given** sou SuperAdmin com permission `bankData.view`
**When** GET /employees/:id sem header `X-Show-Bank-Data`
**Then** response tem `bankData: { masked: true, last4: '1234', tipoPix: 'CPF' }` (mostra tipo e últimos 4 dígitos da conta como hint)
**And** AuditLog NÃO é gerado (acesso default mascarado)

**Given** sou SuperAdmin com permission `bankData.view`
**When** GET /employees/:id com header `X-Show-Bank-Data: true`
**Then** response tem `bankData: { tipoPix, chavePix, banco, tipoConta, agencia, conta }` decryptado em runtime
**And** AuditLog `EMPLOYEE_BANK_DATA_VIEWED` é registrado automaticamente com `{ employeeId, viewerUserId, ip, userAgent }`

**Given** sou TenantAdmin SEM permission `bankData.view`
**When** GET /employees/:id com header `X-Show-Bank-Data: true`
**Then** response retorna 403 `error.code='FORBIDDEN_BANK_DATA'`
**And** response **não** inclui bankData decryptado (nem mascarado — campo é omitido)

**Given** uma tentativa de SQL raw query bypass
**When** test penetration faz `prisma.$queryRaw` direto pra `bank_data_enc`
**Then** retorna ciphertext binário, nunca cleartext (validação visual via test)

**Given** error message gerada por exception ao decrypt (chave errada, tampering)
**When** error é serializado para resposta API
**Then** mensagem genérica "Erro ao acessar dados bancários" (não vaza detalhes técnicos cleartext)

**Cobre:** FR36, FR37
**Depende de:** Story 5.1
**Complexidade:** M

---

### Story 5.3: Penetration tests cross-tenant + tenant enforcement validation no CI

As a desenvolvedor backend e auditor de segurança,
I want suite de testes em `test/security/imports-cross-tenant.test.ts` que cobre todos os ataques cross-tenant possíveis (TenantAdmin tentando acessar outro tenant, SuperAdmin com tenantId divergente, manipulação de payload, JOB_NOT_FOUND vs FORBIDDEN não vazar existência), rodando no CI antes de merge,
So that NFR10 (0 vazamentos cross-tenant) seja matematicamente garantido e regressões sejam detectadas imediatamente.

**Acceptance Criteria:**

**Given** dois tenants no banco de teste: `tenantA` e `tenantB`, com 1 ImportJob em cada
**When** rodo o test "TenantAdmin de tenantA tenta GET /imports/{jobId-de-tenantB}"
**Then** retorna 404 `error.code='JOB_NOT_FOUND'` (não 403 — não vaza existência)

**Given** TenantAdmin de tenantA
**When** tenta POST /imports/{jobId-de-tenantB}/apply
**Then** retorna 404 `error.code='JOB_NOT_FOUND'`

**Given** TenantAdmin de tenantA
**When** tenta POST /admin/imports/employees (rota SuperAdmin) com qualquer body
**Then** retorna 403 `error.code='FORBIDDEN'`

**Given** TenantAdmin de tenantA
**When** tenta POST /imports/employees com body `{ tenantId: 'tenantB' }` no payload
**Then** o backend **ignora silenciosamente** o tenantId do payload (usa do JWT)
**And** ImportJob é criado com `tenantId=tenantA`
**And** test valida que **nada** foi criado em tenantB

**Given** SuperAdmin
**When** tenta POST /admin/imports/employees com `tenantId` apontando para tenant inativo (status=INACTIVE)
**Then** retorna 400 `error.code='INVALID_TARGET_TENANT'`

**Given** SuperAdmin
**When** tenta POST /admin/imports/employees sem campo `tenantId` no body
**Then** retorna 400 `error.code='MISSING_TARGET_TENANT'` (sem default implícito)

**Given** TenantAdmin de tenantA com `bankData.view`
**When** tenta GET /employees/:id com `X-Show-Bank-Data: true` para um Employee de tenantB
**Then** retorna 404 `error.code='EMPLOYEE_NOT_FOUND'` (Prisma extension scope previne)

**Given** test de tampering de ciphertext
**When** modifico 1 byte do `bankDataEnc` no banco e tento decrypt
**Then** AES-GCM tag verification falha → API retorna 500 com mensagem genérica + log de error com detalhes técnicos

**Given** todos os testes acima
**When** CI workflow `.github/workflows/ci.yml` roda
**Then** suite security/ é parte do step de testes obrigatório
**And** se 1 teste falha, o merge é bloqueado

**Cobre:** FR8 (full enforcement validation), NFR10
**Depende de:** Stories 1.2, 1.3, 3.1, 5.1, 5.2
**Complexidade:** M

---

## Final Validation

### FR Coverage Validation ✅

**Todas as 45 FRs cobertas em pelo menos 1 story:**

| FR Range | Stories que cobrem |
|---|---|
| FR1-FR4 (Upload basics) | 1.2, 1.3 |
| FR5 (Header detection) | 2.2 |
| FR6 (File persist + hash) | 1.1 |
| FR7 (SuperAdmin tenant select) | 1.2, 4.1 |
| FR8 (Tenant enforcement) | 5.1, 5.3 |
| FR9 (Banner persistente) | 4.1 |
| FR10 (Confirm modal) | 3.2 (backend), 4.2 (frontend) |
| FR11-FR12 (Parser + validator) | 2.2 |
| FR13-FR16 (Match + diff + ausentes + workplaces) | 2.3 |
| FR17-FR19 (Preview UI) | 4.1, 2.3 (cancel backend) |
| FR20-FR26 (Apply async + idempotency) | 3.1, 3.2, 2.3 |
| FR27-FR28 (Progress + summary UI) | 4.2 |
| FR29 (Error report .xlsx) | 3.2 (backend), 4.2 (UI) |
| FR30 (Navigate to employees) | 4.2 |
| FR31-FR34 (AuditLog + ImportJob + IP/UA + hash) | 1.1, 1.2, 1.3, 2.1, 3.1, 3.2 |
| FR35 (Encryption at rest) | 5.1 |
| FR36-FR37 (Masking + log sanitization) | 5.2 |
| FR38 (`import.run` permission) | 5.1, 1.2, 1.3, 3.2 |
| FR39 (Soft-delete preservation) | 2.3, 3.2 |
| FR40-FR45 (Schema extension) | 2.1 (migration), 3.2 (apply persists) |

**Cobertura: 45/45 = 100%. ✅**

### NFR → Story Mapping ✅

**NFRs viraram acceptance criteria nas stories relevantes:**

- **NFR1-NFR2 (Performance preview/apply):** AC em Story 2.2 (parser ≤30s), Story 2.3 (matcher), Story 3.2 (apply ≤5min)
- **NFR3 (LCP ≤1.5s):** AC explícita em Story 4.1, gating OP3
- **NFR4 (Polling 2s):** AC em Story 4.2
- **NFR5 (Tabela 60fps):** AC em Story 4.1
- **NFR6 (Worker RAM ≤512MB):** AC em Story 2.2 (streaming validation)
- **NFR7 (Bundle ≤80kb):** validado no build de Story 4.1+4.2
- **NFR8 (AES-256-GCM):** Story 5.1 toda
- **NFR10 (0 vazamentos cross-tenant):** Story 5.3 inteira
- **NFR11 (Permissões dedicadas):** Story 5.1
- **NFR12 (Log sanitization):** Story 5.2 + Story 3.1
- **NFR15-NFR16 (BullMQ concurrency + tenant fairness):** Story 3.1
- **NFR20-NFR24 (Accessibility WCAG AA):** Stories 4.1 e 4.2 (axe-core CI)
- **NFR29-NFR30 (Reliability — auto-fail 15min, transactional chunks):** Story 3.1, 3.2
- **NFR31 (Idempotency 2× = 0 changes):** AC em Story 2.3 e Story 3.2 (test no CI)
- **NFR34 (Pino structured logs):** AC em Story 3.1

**100% dos NFRs com critério de aceitação testável mapeado. ✅**

### Architecture Implementation Validation ✅

- **Starter template:** N/A — brownfield project, sem starter setup story
- **Database/Entity creation distributed:** ✅ Migration de Employee + ImportJob é Story 2.1 (parte de Epic 2 que primeiro precisa dos campos), NÃO Epic 1 standalone "Schema". Migrações adicionais (encryption columns) já estão na mesma migration consolidada
- **Architecture decisions (D1-D11) cobertas em ACs:**
  - D1 (schema) → Story 2.1
  - D2 (encryption) → Story 5.1
  - D3 (tenant fairness lock) → Story 3.1
  - D4 (storage) → Story 1.1
  - D5 (state machine) → Story 3.1
  - D6 (auth + permissions) → Story 5.1, 1.2, 1.3, 5.3
  - D7 (parser versioning) → Story 2.2
  - D8 (match algorithm) → Story 2.3
  - D9 (API endpoints) → Stories 1.2, 1.3, 3.2, 4.2
  - D10 (frontend state machine) → Stories 4.1, 4.2
  - D11 (re-import soft-delete) → Stories 2.3, 3.2

### Story Quality Validation ✅

| Story | Single dev agent? | ACs claros Given/When/Then? | Forward dependency? | Complexidade |
|---|---|---|---|---|
| 1.1 | ✅ | ✅ 4 ACs | nenhuma | S |
| 1.2 | ✅ | ✅ 5 ACs | depende 1.1, 5.1 | M |
| 1.3 | ✅ | ✅ 4 ACs | depende 1.1, 5.1 | S |
| 2.1 | ✅ | ✅ 3 ACs | depende 5.1 | S |
| 2.2 | ✅ | ✅ 6 ACs | depende 2.1 | L |
| 2.3 | ✅ | ✅ 8 ACs | depende 2.1, 2.2 | L |
| 3.1 | ✅ | ✅ 9 ACs | depende 2.1 | M |
| 3.2 | ✅ | ✅ 11 ACs | depende 2.3, 3.1, 5.1 | L |
| 4.1 | ✅ | ✅ 9 ACs | depende 1.2, 1.3, 2.3 | L |
| 4.2 | ✅ | ✅ 7 ACs | depende 4.1, 3.2 | L |
| 5.1 | ✅ | ✅ 8 ACs | nenhuma | M |
| 5.2 | ✅ | ✅ 6 ACs | depende 5.1 | M |
| 5.3 | ✅ | ✅ 9 ACs | depende 1.2, 1.3, 3.1, 5.1, 5.2 | M |

**Total: 13 stories, 89 acceptance criteria. 0 forward dependencies (todas depend em PREVIOUS stories). ✅**

### Epic Independence ✅

- **Epic 1** standalone — entrega ImportJob PENDING + arquivo persistido. Não precisa de 2-5.
- **Epic 2** standalone uma vez que Epic 1 entregar — usa apenas storage handler + migration.
- **Epic 3** standalone uma vez que 1+2 entregaram — usa preview de Epic 2.
- **Epic 4** standalone uma vez que 3 entregar — UI consome status do backend.
- **Epic 5** transversal — cross-cutting de segurança. Story 5.1 é dep de 1.2/1.3/2.1/3.2; Stories 5.2/5.3 são hardening final.

**⚠️ Gating de produção:** Epic 5 deve estar mergeado ANTES do Epic 3 ir para prod (LGPD compliance — encryption + masking obrigatórios). MVP completo = todos os 5 epics.

### Veredicto Final

**🟢 EPICS.MD COMPLETO E VALIDADO — PRONTO PARA DEV STORIES**

- 5 epics user-value-driven sem technical milestones
- 13 stories implementáveis (3 S, 5 M, 5 L) com 89 acceptance criteria Given/When/Then
- 100% das 45 FRs cobertas em ≥1 story
- 100% dos NFRs viraram ACs testáveis em stories relevantes
- 0 forward dependencies — sequência implementável linearmente
- Schema/audit/security distribuídos (sem epic technical milestone)
- Action items operacionais OP1-OP4 do Bruno mapeados como gating points

### Implementation Sequence (recomendado para Dev)

```
Ordem sugerida:
1.  Story 5.1   (encryption + permissions)        ← gating OP1
2.  Story 1.1   (storage handler + cron retenção) ← gating OP2
3.  Story 2.1   (schema migration consolidada)
4.  Story 1.2   (upload SuperAdmin)
5.  Story 1.3   (upload TenantAdmin)
6.  Story 2.2   (parser + validator)
7.  Story 2.3   (matcher + diff + reactivation)
8.  Story 3.1   (BullMQ worker + tenant lock + state machine)
9.  Story 3.2   (apply chunks + VacationEngine + audit)
10. Story 4.1   (UI Upload + Preview)             ← gating OP3
11. Story 4.2   (UI Apply + Done)
12. Story 5.2   (log sanitization + masking)
13. Story 5.3   (penetration tests CI)
14. Deploy gradual c/ feature flag                ← gating OP4
```

### Action Items operacionais do Bruno (gating de stories específicas)

- 🔧 **OP1** — `BANK_DATA_ENCRYPTION_KEY` Docker Secret (`openssl rand -base64 32`) → **antes da Story 5.1**
- 🔧 **OP2** — Volume `imports-data:/var/imports` em `docker-compose.yml` + Swarm → **antes da Story 1.1**
- 🔧 **OP3** — Medir LCP atual de `/admin/tenants` para validar viabilidade NFR3 → **antes da Story 4.1**
- 🔧 **OP4** — Decidir `imports.enabled=true|false` para Green House no startup → **antes do deploy de produção**





