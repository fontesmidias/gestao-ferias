---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
status: 'COMPLETED'
overallReadiness: 'PRD READY — Architecture/UX/Epics PENDING'
feature: 'v3-2-import-tirvu'
documentsInventoried:
  prd: '_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md'
  architecture: null
  epics: null
  ux: null
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-29
**Project:** gestao-ferias
**Feature:** v3-2-import-tirvu

## Step 1 — Document Discovery

### Files Found

**PRD:**
- `_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md` (whole, ~770 linhas, completed 2026-04-29)

**Architecture:** (não encontrado — esperado, próximo step do pipeline)

**Epics & Stories:** (não encontrado — virá após Architecture)

**UX Design:** (não encontrado — esperado, próximo step paralelo)

### Issues

- ⚠️ **WARNING: Architecture document missing** — vai limitar avaliação completa de readiness; será criado na próxima fase (Architect agent).
- ⚠️ **WARNING: Epics document missing** — depende de Architecture e UX antes de poder ser quebrado em stories.
- ⚠️ **WARNING: UX Design document missing** — vai limitar validação de alignment FRs↔UX.

**Sem duplicatas. Sem conflitos. PRD único e válido.**

### Validation Strategy Decision

Como apenas o PRD existe (estado natural pós-`create-prd`, pré-`create-architecture`/`create-ux-design`), a validação será conduzida em **modo PRD-only**: foco em checar **qualidade interna do PRD** — completude de seções, rastreabilidade Journey↔FR↔NFR, mensurabilidade dos NFRs, prontidão como input para Architect/UX/SM.

Os steps 03 (epic coverage) e 04 (UX alignment) e 05 (epic quality) serão executados de forma adaptada — sinalizando "N/A — artefato não existe ainda" e produzindo recomendações para quando esses artefatos forem criados.

## Step 2 — PRD Analysis

### Functional Requirements Extracted (45 total, 8 capability areas)

**Area 1 — File Upload & Format Validation (6 FRs):**
- FR1: SuperAdmin can upload a Tirvu spreadsheet (.xlsx) targeting any active tenant of choice.
- FR2: TenantAdmin can upload a Tirvu spreadsheet (.xlsx) targeted automatically to their own tenant (no cross-tenant possibility).
- FR3: The system can reject any file whose extension is not `.xlsx` and notify the operator with a clear error message.
- FR4: The system can reject any file exceeding the configured size limit and notify the operator with the actual size and the limit.
- FR5: The system can detect whether the uploaded spreadsheet conforms to the expected Tirvu header schema (46 known columns) and reject non-conforming files.
- FR6: The system can persist the original uploaded file (with a content hash) and retain it for the configured audit window.

**Area 2 — Tenant Targeting & Authorization (4 FRs):**
- FR7: SuperAdmin can select the target tenant explicitly before uploading any file.
- FR8: The system can prevent any operator other than SuperAdmin from importing into a tenant other than their own JWT-bound tenant, enforced at the backend level.
- FR9: The system can display the target tenant name persistently in the UI throughout the entire import flow for SuperAdmin operations.
- FR10: The system can require an explicit confirmation step before applying an import, restating the target tenant name and a summary of changes.

**Area 3 — Parsing, Validation & Diff Preview (9 FRs):**
- FR11: The system can parse all 46 columns of a valid Tirvu file row by row.
- FR12: The system can validate each row independently (CPF format and check digit, dates, status enum, mandatory fields) and assign row-level status.
- FR13: The system can detect new vs existing employees based on primary `(tenantId, cpf)` and secondary `(tenantId, tirvuId)` match keys.
- FR14: The system can compute a field-by-field diff for each row classified as update.
- FR15: The system can detect existing employees absent from the spreadsheet (re-imports) and label as "candidates for inactivation" without auto-inactivating.
- FR16: The system can detect Lotação values not yet existing as Workplaces and present them for explicit decision.
- FR17: Operator can review a paginated, virtualized table of all parsed rows.
- FR18: Operator can filter the preview table by row-level status.
- FR19: Operator can cancel the import at the preview stage with zero side effects.

**Area 4 — Apply (Asynchronous Job Execution) (7 FRs):**
- FR20: Operator can trigger application of the import which enqueues an asynchronous job.
- FR21: The system can process the application asynchronously without blocking operator's session.
- FR22: The system can apply in chunks, persisting valid rows while skipping invalid, even if some chunks fail.
- FR23: The system can create new Workplaces for confirmed Lotação values, scoped to target tenant.
- FR24: The system can trigger CLT vacation balance computation via existing VacationEngine.
- FR25: The system can mark absent employees with `inactivePending` flag for human review.
- FR26: The system can guarantee idempotency: re-running same import produces zero modifications.

**Area 5 — Progress, Status & Result Reporting (4 FRs):**
- FR27: Operator can observe near-real-time progress of the apply phase.
- FR28: Operator can see a final summary upon completion (created, updated, invalid, absent, workplaces created, elapsed).
- FR29: Operator can download an .xlsx report containing only the invalid rows with "motivo do erro" column.
- FR30: Operator can navigate from completion screen to the populated employees list.

**Area 6 — Auditing & Traceability (4 FRs):**
- FR31: The system can record an `AuditLog` entry for every row affected, grouped by `importJobId`.
- FR32: The system can persist each import job as `ImportJob` record with status, target tenant, operator, file hash, file size, preview summary, result, and timestamps.
- FR33: The system can capture IP and user agent of the operator at upload and apply.
- FR34: The system can preserve the original file plus its SHA-256 hash for the configured retention window.

**Area 7 — Privacy, Security & Compliance (5 FRs):**
- FR35: The system can store sensitive bank-related fields encrypted at rest.
- FR36: The system can mask bank-related fields by default, displaying decrypted values only with `bankData.view` permission.
- FR37: The system can prevent bank-related fields from being written to logs or surfaced in error messages.
- FR38: The system can require dedicated `import.run` permission for any import action.
- FR39: The system can preserve the soft-delete model (`inactive=true` + `terminationDate`) for legal retention.

**Area 8 — Schema Extension for Imported Employee Data (6 FRs):**
- FR40: The system can persist a Tirvu external identifier (`tirvuId`) per employee, unique within tenant.
- FR41: The system can persist a structured set of personal data fields not previously stored.
- FR42: The system can persist a structured address record per employee.
- FR43: The system can persist union name per employee.
- FR44: The system can persist geofencing flags per employee.
- FR45: The system can persist a `inactivePending` flag, set by import flow when operator marks absent, cleared upon manual review.

**Total FRs: 45.**

### Non-Functional Requirements Extracted (36 total, 7 categories)

**Performance (7 NFRs):**
- NFR1: Upload+parse+preview ≤30s (P95) for 1k rows; ≤90s (P95) for 5k rows
- NFR2: Async apply ≤5min (P95) for 5k rows; ≤2min for 1k rows
- NFR3: Page TTFB ≤500ms; LCP ≤1.5s
- NFR4: Polling interval 2s; status response ≤200ms (P95)
- NFR5: Virtualized table 60fps with 5k rows; client-side filters ≤100ms
- NFR6: Worker RAM ≤512MB for 5k rows
- NFR7: Bundle JS delta ≤80kb gzipped

**Security (7 NFRs):**
- NFR8: AES-256-GCM with unique IV per record; key 256-bit from env or KMS
- NFR9: TLS 1.2+ mandatory
- NFR10: 0 cross-tenant leaks in CI penetration tests
- NFR11: Dedicated permissions `import.run` + `bankData.view`
- NFR12: Log sanitization removes blacklist (bankData, RG, PIS, CPF except last 3)
- NFR13: SHA-256 file hash validated on retrieval
- NFR14: Rate limit 5 req/min/operator on upload

**Scalability (5 NFRs):**
- NFR15: BullMQ concurrency=2 on dedicated `imports` queue
- NFR16: Tenant fairness (1 job/tenant in parallel via lock)
- NFR17: Volume target up to 5k rows/file in MVP
- NFR18: Up to 100 active tenants without measurable degradation
- NFR19: Storage capacity ~150GB worst-case (FS local; S3 trigger at 80%)

**Accessibility (5 NFRs):**
- NFR20: WCAG 2.1 AA min, axe-core in CI
- NFR21: Keyboard navigation everywhere; visible focus ≥2px contrast ≥3:1
- NFR22: Status colors with icon+label redundancy (color-blind safe)
- NFR23: Tenant banner with `role="alert" aria-live="assertive"`; ≥18px AAA contrast
- NFR24: Modal focus trap; default focus on Cancel; Esc closes; Confirm requires explicit click

**Integration (4 NFRs):**
- NFR25: Tirvu format tolerance (case, whitespace, blank trailing rows, null optional fields)
- NFR26: Parser versioning `tirvu-parser-v1`; v2 additive
- NFR27: VacationEngine failure does not fail import (warning + retry job)
- NFR28: AuditLog batch insert ≤30s for 5k entries

**Reliability (5 NFRs):**
- NFR29: Job stuck >15min auto-marked FAILED; original file preserved for retry
- NFR30: Transactional chunks of 100 rows; partial failure does not rollback total
- NFR31: Idempotency verified in CI (2× upload = 0 changes)
- NFR32: ≥99% informal SLA; module isolated (no system downtime on import failure)
- NFR33: Recoverable via re-upload after correction; idempotency preserves applied progress

**Observability (3 NFRs):**
- NFR34: Pino JSON logs with `importJobId`, `tenantId`, `operatorUserId`, `phase`, `rowsProcessed`, `errors`
- NFR35: Prometheus-format `/metrics` endpoint (Phase 2; MVP only logs)
- NFR36: 5-year retention for labor disputes (90d FS MVP + S3 Phase 2 cron migration)

**Total NFRs: 36.**

### Additional Requirements & Constraints

**Business constraints:**
- MVP scoped to **1 sprint focused** (~10 dias úteis), 1 dev backend + 1 dev frontend (Bruno solo or contractor)
- JTBD: H1 bootstrap-único agora + H2 sync recorrente como Phase 2 (~2 sprints depois)
- Frequência de uso: sob demanda, recorrente imprevisível (não 1-shot)

**Technical constraints (inherited from V3 baseline):**
- Stack travada: Fastify 5 + Prisma 7.6 + PostgreSQL 15 + Redis + BullMQ + Next.js 16 + React 19 + Tailwind + shadcn/ui + TanStack Query
- Multi-tenant via Prisma extension de tenant scoping (já existente)
- AuditLog model existente (a ser estendido)
- VacationEngine existente (CLT validation reused)

**Compliance constraints:**
- LGPD (Lei 13.709/2018): base legal execução de contrato + obrigação legal; minimização; criptografia; auditoria de acesso; retenção 5 anos pós-demissão
- CLT: cálculo de saldo via VacationEngine; datas dd/MM/yyyy validadas; soft-delete

**Integration constraints:**
- Tirvu xlsx layout fixo (46 colunas, sheet "Plan1") — versionamento de parser
- Volume max MVP: 5k linhas/arquivo, 10MB; concurrency BullMQ=2
- Storage: FS local `/var/imports/{tenantId}/{jobId}.xlsx` (S3 Phase 2)

### PRD Completeness Assessment

**Strengths:**
- ✅ **45 FRs em formato canônico** (Actor + capability + context), implementação-agnóstico, testáveis
- ✅ **36 NFRs com números concretos** (P95, ms, %, MB, kb gzipped) — todos viraram critério de aceitação direto
- ✅ **8 capability areas + 7 NFR categories** organizadas por dimensão funcional, não tecnologia
- ✅ **Multi-tenant rigorosamente endereçado** (FR8 backend enforcement; FR9 banner persistente; NFR10 testes de penetração no CI)
- ✅ **LGPD/CLT cobertos em Domain Requirements** com base legal explícita
- ✅ **Idempotência travada como NFR31** com critério de teste (2× = 0 changes)
- ✅ **20 must-haves explicitamente listados em Scoping** (Phase 1 MVP) — fácil rastreabilidade para epics
- ✅ **3 personas com 4 journeys narrativas** cobrindo happy path, edge case, suporte
- ✅ **Risk Mitigations** consolidadas (Domain: 10 riscos de negócio/compliance; Scoping: técnico/mercado/recurso)
- ✅ **Phase 2 Growth + Phase 3 Vision** explícitas — protege contra scope creep no MVP

**Initial gaps observados (a aprofundar nos próximos steps):**
- ⚠️ **FR40-FR45 são "schema-shaped"** (descrevem o que persistir, não capacidade comportamental) — Architect vai precisar definir DDL/Prisma migration; ok no PRD mas atenção no architecture review
- ⚠️ **NFR3 LCP** depende de baseline V3 atual desconhecido — Architect/UX precisam validar se é alcançável
- ⚠️ **NFR16 tenant fairness "1 job/tenant em paralelo"** precisa definição arquitetural concreta (lock distribuído? token bucket BullMQ?)
- ⚠️ **FR15 detecção de ausentes** não tem FR equivalente para "marcar individualmente como demitido após revisão" — assumido implícito que `/employees` UI existente faz isso, mas não está afirmado
- ⚠️ **Não há FR para "importar employees deletados/restaurados"** — comportamento em re-import quando colaborador estava `inactive=true` e volta a aparecer na planilha está ambíguo

Esses gaps são **menores** e típicos de pós-create-prd; serão resolvidos quando Architecture for criada.

## Step 3 — Epic Coverage Validation

### Status: **N/A — Epics document not yet created**

O documento `epics.md` será criado pelo workflow `evo-create-epics-and-stories` depois que Architecture e UX estiverem prontos. Validação de cobertura epic↔FR é **prematura** neste momento.

### Coverage Statistics (deferred)

- Total PRD FRs: **45**
- FRs covered in epics: **0** (epics document not yet created)
- Coverage percentage: **N/A**

### Recommendation for when epics are created

Quando o SM rodar `/evo-create-epics-and-stories`, **exigir explicitamente uma seção "FR Coverage Map" no `epics.md`** mapeando cada FR1–FR45 para ≥1 story. Este checker re-rodado depois deve mostrar:
- ✅ 100% das 45 FRs cobertas (mínimo)
- ✅ Cada NFR mensurável virou critério de aceitação em ≥1 story relevante
- ✅ Sem stories órfãs (sem FR de origem)

### Pre-validation: agrupamento sugerido de FRs em epics

Como insumo para o SM (não vincula, mas reduz iteração), sugiro a quebra abaixo dos 45 FRs em **6 epics** alinhados ao MVP:

| Epic | FRs cobertos | Resumo |
|---|---|---|
| **Epic 1 — Schema & Migration** | FR40, FR41, FR42, FR43, FR44, FR45 (6) | Migration Prisma: tirvuId, personalData, address, bankData (encrypted), unionName, geofencingFlags, inactivePending, terminationDate. ImportJob model. |
| **Epic 2 — Parser & Validation Engine** | FR3, FR4, FR5, FR11, FR12, FR13, FR14, FR15, FR16, FR26 (10) | tirvu-parser-v1, validador por linha, matcher idempotente, diff field-by-field, detecção de Workplaces novos e ausentes |
| **Epic 3 — Job Pipeline & Apply** | FR20, FR21, FR22, FR23, FR24, FR25, FR27, FR28 (8) | BullMQ worker, chunks de 100, integração VacationEngine, criação de Workplaces, progresso polling, sumário final |
| **Epic 4 — Upload UI & Preview Flow** | FR1, FR2, FR6, FR7, FR9, FR10, FR17, FR18, FR19, FR29, FR30 (11) | 2 rotas (admin + settings), dropzone, banner persistente, modal confirmação, tabela virtualizada com filtros, cancelamento, relatório xlsx download, navegação |
| **Epic 5 — Auditoria & Persistence** | FR31, FR32, FR33, FR34 (4) | AuditLog por linha agrupado, ImportJob persistido, IP+UA captura, hash SHA-256 do arquivo |
| **Epic 6 — Security, Authorization & Compliance** | FR8, FR35, FR36, FR37, FR38, FR39 (6) | Backend tenant enforcement, encryption AES-256-GCM bankData, mascaramento default, log sanitization, permissões dedicadas, soft-delete preservation |

**Total: 45 FRs em 6 epics. Verificação: cada FR aparece exatamente uma vez (sem overlap, sem omissão).**

### NFR → Story Acceptance Criteria mapping (sugerido)

NFRs não viram epics, mas devem virar critérios de aceitação em stories específicas:

| NFR | Story de aceitação sugerida |
|---|---|
| NFR1, NFR2 (Performance) | Stories de Epic 2 e Epic 3 — testes de carga com fixture 1k e 5k |
| NFR8, NFR12 (Encryption + Log sanitization) | Story dedicada em Epic 6 |
| NFR10 (0 vazamentos cross-tenant) | Story dedicada em Epic 6 com testes de penetração no CI |
| NFR20–NFR24 (Accessibility) | Stories de Epic 4 (UI) — axe-core + testes manuais de teclado |
| NFR31 (Idempotência) | Story dedicada em Epic 2 (matcher) com teste 2× = 0 changes |
| NFR29, NFR30 (Reliability) | Stories de Epic 3 (job pipeline) |

## Step 4 — UX Alignment Assessment

### UX Document Status: **Not Found**

⚠️ **WARNING: UX é implicado mas documento não existe ainda.**

Sinais de UI implícita no PRD (interface fortemente especificada apesar de não haver doc UX dedicado):
- 4 estados visuais discretos (upload/preview/applying/done) com URL state via querystring
- 2 rotas com layouts paralelos (admin/imports + settings/imports)
- Componentes específicos: dropzone, banner persistente do tenant, modal de confirmação, tabela virtualizada com filtros, barra de progresso, botões de download/navegação
- 3 personas com journeys narrativas ricas em detalhes de UI

### UX coberto pelo PRD (mas precisa virar artefato dedicado)

O PRD já especifica:
- **Estados e estrutura:** 4-state flow, URL queryparams, componente compartilhado `ImportEmployeesFlow.tsx`
- **Performance UX:** TTFB ≤500ms, LCP ≤1.5s, scroll 60fps, filtros ≤100ms
- **Acessibilidade:** WCAG AA, focus visível, status colors com ícone+label, banner com `aria-live`, modal com focus trap
- **Padrões herdados V3:** sidebar 220px, fonte 13px, design compacto, shadcn/ui

### Alignment Issues (deferred until UX doc created)

Nenhum misalignment detectado **a priori** entre PRD e UX implícito. Quando o UX Designer (Sally) criar o `ux-design-specification.md`, este checker re-rodado deve validar:
- Componentes e estados batem com FR1–FR30
- Wireframes do banner persistente atendem NFR23 (`role="alert"`, contraste ≥7:1)
- Modal de confirmação atende NFR24 (focus trap, default Cancel, Esc, click explícito)
- Tabela virtualizada com 5k rows atende NFR5 (60fps)
- Tabela paginada atende FR17 e FR18 (paginação + filtros)

### Recommendation

**Disparar `evo-create-ux-design`** em paralelo com `evo-create-architecture` (são workflows independentes — UX trabalha do PRD, Architect trabalha do PRD; ambos prontos antes do epic breakdown). Sally vai precisar de:
- PRD inteiro (input principal)
- Análise da V3 atual (componentes shadcn/ui, sidebar, padrões já existentes em [frontend-web/src/components/](frontend-web/src/components/))
- Mockups de baixa fidelidade ou ASCII wireframes para os 4 estados

### Warnings

- ⚠️ **UX doc missing:** esperado pelo pipeline; criar via `evo-create-ux-design` antes de quebrar em stories. Bloqueante para Epic 4 (Upload UI & Preview Flow) em particular.
- ⚠️ **PRD especifica UI fortemente:** boa cobertura — o UX Designer terá insumo rico, mas deve cuidar para **não retro-especificar diferente** do PRD (qualquer divergência = re-validar com PM).

## Step 5 — Epic Quality Review (Pre-validation)

### Status: **Epics document not yet created. Applying rigorous pre-validation to the 6-epic draft from Step 3.**

Apliquei os critérios de qualidade do BMAD (`create-epics-and-stories`) à minha própria sugestão de quebra de epics do Step 3. Encontrei **violações que preciso corrigir antes do SM rodar**.

### 🔴 Critical Violations encontradas no draft

#### Violation 1 — Epic 1 "Schema & Migration" é technical milestone, não user value

```
Epic 1 — Schema & Migration | FR40-FR45 (6) | Migration Prisma...
```

**Defeito:** "Schema & Migration" é exatamente o anti-padrão flagado pelo BMAD: *"Setup Database / Create Models — no user value"*. Nenhum colaborador, SuperAdmin ou TenantAdmin se beneficia diretamente de "tabela criada". Migration é **infraestrutura**, não capacidade.

**Impacto:** SM provavelmente quebraria isto em "Story 1.1 Create migration for tirvuId", "Story 1.2 Create ImportJob model"... que também são techincal-only. Stories assim não podem ser demonstradas em sprint review como valor.

**Remediação:** **Eliminar Epic 1** como standalone. Mover **cada migration de campo para a story que primeiro precisa dele**:
- `tirvuId`, `personalData`, `address`, `unionName`, `geofencingFlags` → migration acontece dentro da story de Epic 2 que primeiro persiste esses dados (Story "Aplicar import: criar Employee novo")
- `bankData encrypted` → migration dentro da story de Epic 6 que implementa encryption
- `inactivePending`, `terminationDate` → migration dentro da story que implementa "marcar como candidato a inativar"
- `ImportJob` model → migration dentro da story de Epic 3 que persiste o job

Isso cumpre o princípio BMAD: **"tables created only when first needed"**.

#### Violation 2 — Epic 5 "Auditoria & Persistence" também é technical milestone

```
Epic 5 — Auditoria & Persistence | FR31-FR34 (4) | AuditLog por linha...
```

**Defeito:** Auditoria é **transversal/cross-cutting**, não vertical. SuperAdmin/TenantAdmin não pede "quero auditoria" — pede "quero importar com segurança". AuditLog é **side-effect** de outras ações.

**Remediação:** Distribuir FR31, FR32, FR33, FR34 em stories já existentes:
- FR31 (AuditLog por linha) → AC de cada story de Epic 3 (apply)
- FR32 (ImportJob persisted) → AC da story em Epic 3 que cria o job
- FR33 (IP+UA capture) → AC da story em Epic 4 (upload UI)
- FR34 (file hash + retention) → AC da story em Epic 4 (upload) ou Epic 6 (security)

#### Violation 3 — Epic 6 "Security, Authorization & Compliance" é meio-technical

```
Epic 6 — Security, Authorization & Compliance | FR8, FR35-FR39 (6)
```

**Defeito borderline:** Encryption + permissions sozinhas não entregam valor. Mas **"importação que preserva dados sensíveis com segurança"** SIM é valor para o operador. O problema é o **título e enquadramento**.

**Remediação:** Renomear para **"Importação Segura de Dados Sensíveis (LGPD)"** e enquadrar como capacidade de usuário: "Operador pode importar planilhas Tirvu com confiança de que dados bancários e sensíveis são protegidos por padrão". Stories internas continuam técnicas mas o epic passa o teste de user value.

### 🟢 Epics que passam no critério

- **Epic 2 — Parser & Validation Engine:** ✅ user value (Operador pode subir planilha e ver o que vai acontecer)
- **Epic 3 — Job Pipeline & Apply:** ✅ user value (Operador pode aplicar import e ver progresso)
- **Epic 4 — Upload UI & Preview Flow:** ✅ user value (Operador acessa fluxo completo de upload)

### Refined Epic Breakdown (post-violation correction)

Lista corrigida — **5 epics** verticalizados por user value, com schema/audit/security distribuídos:

| Epic | FRs cobertos | User Value Statement |
|---|---|---|
| **Epic 1 — Upload de planilha Tirvu (operador inicia o fluxo)** | FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR9, FR33, FR34, FR38 (11) | Operador (Super ou Tenant Admin) pode subir uma planilha Tirvu, com validação de formato, banner de tenant alvo, persistência do arquivo original com hash, captura IP/UA e permissão dedicada — pronto para preview |
| **Epic 2 — Preview e validação de import (operador decide com confiança)** | FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR40, FR41, FR42, FR43, FR44, FR45 (15) | Operador pode revisar diff completo antes de aplicar: linhas válidas/inválidas/atualizações/ausentes, lotações novas, com schema completo de Employee suportando todos os campos Tirvu (migrations dentro das stories que precisam) |
| **Epic 3 — Aplicação de import (operador concretiza com segurança)** | FR10, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR31, FR32 (12) | Operador confirma com modal explícito (repete tenant), import roda async (BullMQ), aplica em chunks idempotentes com VacationEngine integrado, AuditLog por linha e ImportJob persistido, progresso real-time |
| **Epic 4 — Resultado e recuperação de erros (operador conclui ou corrige)** | FR29, FR30 (2) | Operador vê sumário final, baixa relatório .xlsx das linhas inválidas com motivo, navega para colaboradores populados |
| **Epic 5 — Importação segura de dados sensíveis (LGPD)** | FR8, FR35, FR36, FR37, FR39 (5) | Operador importa com confiança de que bankData (PIX, agência, conta) é criptografado em repouso, mascarado por default, nunca aparece em logs, e tenant isolation é fisicamente garantido |

**Total: 45 FRs cobertas em 5 epics. Verificação: cada FR aparece exatamente uma vez. Migrations distribuídas dentro das stories. Auditoria como side-effect, não epic.**

### Epic Independence Check (refined breakdown)

- **Epic 1** (Upload) → standalone ✅ (não depende de Epic 2-5)
- **Epic 2** (Preview) → usa output de Epic 1 (arquivo persistido) ✅; não depende de Epic 3+
- **Epic 3** (Apply) → usa output de Epic 1+2 ✅; não depende de Epic 4+5
- **Epic 4** (Resultado) → usa output de Epic 3 ✅; não depende de Epic 5
- **Epic 5** (Security/LGPD) → **transversal** mas pode ser entregue em qualquer ordem como hardening; idealmente **antes ou em paralelo** com Epic 3 que persiste os dados sensíveis pela primeira vez

⚠️ **Heads-up para o SM:** Epic 5 (LGPD) é **dependência crítica de produção**. Não pode entrar em produção em paralelo com Epic 3 sem encryption habilitada — risco LGPD. Sequência segura: **Epic 1 → Epic 2 → Epic 5 (encryption + tenant enforcement) → Epic 3 → Epic 4** ou **Epic 5 em paralelo com Epic 3** (mesmo sprint, com gate de "não fechar Epic 3 sem Epic 5 mergeado").

### Story Quality Assessment (deferred — stories not yet created)

Quando o SM criar stories, este checker re-rodado deve validar:

**Acceptance criteria padrão Given/When/Then** para cada story. Exemplo de boa AC para uma story de Epic 2:

```
Given uma planilha Tirvu válida com 1.000 linhas onde 47 são novos colaboradores e 953 já existem no tenant
When operador envia o arquivo via /admin/imports/employees com tenant alvo "Servi-Plus"
Then o preview exibe { create: 47, update: 0, invalid: 0, unchanged: 953, newWorkplaces: [] }
And nenhum dado é persistido em employees ou workplaces
And o operador pode cancelar com zero efeito colateral
```

**Tamanho de story:** cada story ≤3 dias de dev. Epic 2 com 15 FRs → ~5-7 stories de tamanho médio. Epic 3 com 12 FRs → ~4-6 stories.

**Forward dependencies:** SM deve garantir que Story X não depende de Story X+1 do mesmo epic. Migrations devem nascer com a story que primeiro precisa do campo.

### 🟠 Major Issues found

- ❌ **Schema/Audit/Security epics inválidos** (corrigidos acima — refined breakdown)
- ⚠️ **Recomendação:** ao chamar `evo-create-epics-and-stories`, **passar a refined breakdown como ponto de partida** (não a do Step 3) para o SM não cometer o mesmo erro.

### 🟡 Minor Concerns

- Migrations distribuídas em múltiplas stories podem fragmentar a evolução do schema; SM deve garantir nomenclatura consistente das migrations (`20260430_add_tirvu_id`, `20260430_add_employee_personal_data`, etc.) e ordem cronológica.
- Epic 4 (Resultado) é pequeno (2 FRs). Avaliar fundir com Epic 3 (Apply) em "Aplicação + Resultado" se SM julgar mais coerente — depende de granularidade preferida.

### Compliance Checklist (post-refinement)

Para cada epic da refined breakdown:

| Critério | Epic 1 | Epic 2 | Epic 3 | Epic 4 | Epic 5 |
|---|---|---|---|---|---|
| Entrega user value | ✅ | ✅ | ✅ | ✅ | ✅ (refined wording) |
| Pode funcionar independentemente | ✅ | ✅ | ✅ | ✅ | ⚠️ paralelo com Epic 3 |
| Stories provavelmente sized adequadamente | TBD pelo SM | TBD | TBD | TBD | TBD |
| Sem forward dependencies | ✅ (a verificar nas stories) | ✅ | ✅ | ✅ | ✅ |
| Tabelas criadas quando necessárias | ✅ (distribuído) | ✅ | ✅ | N/A | ✅ |
| Acceptance criteria claros | TBD pelo SM | TBD | TBD | TBD | TBD |
| Traceability to FRs | ✅ (mapeada) | ✅ | ✅ | ✅ | ✅ |

## Step 6 — Summary and Recommendations

### Overall Readiness Status

**🟢 PRD READY — Architecture / UX / Epics PENDING (esperado)**

O PRD em si está em estado **ready-for-architecture**. Os 3 documentos derivados (Architecture, UX, Epics) ainda não existem — o que **é esperado neste ponto do pipeline BMAD** (acabamos de fechar o `create-prd`). Esta validação roda parcialmente em modo PRD-only e produz **recomendações estruturadas para os próximos workflows**.

### Critical Issues Requiring Immediate Action

**Antes do Architect rodar:** zero issues críticos. PRD pode entrar em arquitetura como está.

**Antes do SM quebrar epics:** 3 critical violations encontrados na quebra inicial sugerida (Step 3) — **já corrigidos** no Step 5 (refined breakdown de 5 epics). SM deve **partir da refined breakdown**, não do esboço original.

**Antes de produção:**
1. ⚠️ **Epic 5 (LGPD/encryption) é dependência bloqueadora** de Epic 3 em produção. Sequência segura: Epic 1 → Epic 2 → Epic 5 + Epic 3 (paralelo, mesmo sprint, gate de "não fechar Epic 3 sem Epic 5 mergeado") → Epic 4.
2. ⚠️ **NFR3 (LCP ≤1.5s)** depende de baseline V3 atual — Architect deve medir e validar viabilidade ou propor mitigação (ex.: code-splitting da feature).
3. ⚠️ **NFR16 (tenant fairness)** precisa decisão arquitetural concreta — Architect define se via lock distribuído, queue-per-tenant ou rate-limiting com `groupKey` no BullMQ.

### Recommended Next Steps

**Imediato (esta semana):**
1. **Disparar Architect** via skill `evo-create-architecture` — tomando como input este PRD. Architect endereça gaps menores (FR40-45 em DDL Prisma; NFR3 baseline; NFR16 estratégia; comportamento de re-import sobre soft-deleted; FR15 fluxo "marcar individualmente após revisão").
2. **Em paralelo, disparar UX Designer** via skill `evo-create-ux-design` — UX trabalha do mesmo PRD; não precisa esperar Architecture (decoupled). Sally deve respeitar o que o PRD especificou (4 estados, banner persistente, modal, tabela virtualizada) e não retro-divergir.

**Após Architecture + UX prontas:**
3. **Disparar SM** via skill `evo-create-epics-and-stories` — **passar a refined breakdown de 5 epics deste relatório** como ponto de partida (não a do PRD Step 3, que tem violations). Exigir "FR Coverage Map" no `epics.md` cobrindo FR1–FR45.
4. **Re-rodar `evo-check-implementation-readiness`** quando os 4 artefatos existirem — desta vez todos os 6 steps rodam em modo full e produzem assessment definitivo antes de Phase 4 (implementação).

**Implementação:**
5. **Disparar Dev** via skill `evo-dev-story` story por story — começando por Epic 1 (Upload).

### Findings Summary by Severity

| Severidade | Encontrados | Status |
|---|---|---|
| 🔴 Critical | 3 (epic structure violations) | ✅ Resolvidos no Step 5 com refined breakdown |
| 🟠 Major | 1 (recomendação: passar refined breakdown ao SM) | ⏳ Endereçar quando SM rodar |
| 🟡 Minor | 5 (PRD gaps menores: DDL detail, baseline LCP, fairness mechanism, re-import sobre soft-deleted, fluxo de revisão pós-flag) | ⏳ Endereçar com Architect |
| ⚠️ Warnings | 3 (Architecture/UX/Epics docs missing — esperado) | ⏳ Resolver criando os artefatos |

### Document Quality Score (PRD-only)

| Dimensão | Score | Comentário |
|---|---|---|
| Completude de seções | **10/10** | Todas as seções BMAD presentes (executive, success, journeys, domain, project-type, scoping, FRs, NFRs) |
| FRs implementação-agnósticas | **9/10** | 39 de 45 são puramente capabilities; 6 (FR40-45) são "schema-shaped" mas justificáveis em brownfield |
| NFRs mensuráveis | **10/10** | Todos com números concretos (P95, ms, %, MB, kb gz) |
| Rastreabilidade Journey↔FR | **9/10** | Journey Requirements Summary cobre bem; mapping explícito ausente mas inferível |
| Multi-tenant safety | **10/10** | FR8 + NFR10 + journeys + risk matrix endereçam consistentemente |
| Compliance LGPD/CLT | **10/10** | Base legal explícita, criptografia, retenção, soft-delete, integração VacationEngine |
| Risk identification | **9/10** | 10 riscos de negócio + 9 técnico/mercado/recurso com mitigação MVP + plano B |
| Capability contract clareza | **10/10** | 45 FRs em formato canônico, numeradas, organizadas em 8 áreas |

**Score geral: 77/80 = 96%** — PRD comercialmente aceitável e implementation-ready.

### Final Note

This assessment identified **9 issues across 4 categories** (3 resolvidos no próprio relatório, 6 pendentes para Architecture/UX/Epics). **Address the 3 production-critical issues (Epic 5 dependency, NFR3 baseline, NFR16 fairness mechanism) durante a fase de Architecture.** Restantes podem ser endereçados durante quebra de stories e durante implementação.

PRD pode prosseguir para Architecture e UX como está. **Recomendação: GO**.

---

**Assessor:** John (PM via skill `evo-pm`)
**Date:** 2026-04-29
**Methodology:** BMAD `check-implementation-readiness` v1.0.6 (executado em modo PRD-only)
**Re-run trigger:** quando Architecture, UX e Epics estiverem criados — re-rodar esta validação para assessment completo pré-Phase 4.

---

# ITERAÇÃO 2 — Re-validação com Trio Completo (PRD + Architecture + UX)

**Date:** 2026-05-01
**Iteration:** 2 of N
**Trigger:** PRD + Architecture + UX agora completos. Epics ainda pendentes.

## Step 1 (iter2) — Document Discovery (re-run)

| Tipo | Status | Caminho | Linhas |
|---|---|---|---|
| **PRD** | ✅ encontrado (whole, COMPLETED) | [prd.md](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md) | ~770 |
| **Architecture** | ✅ encontrado (whole, COMPLETE) | [architecture.md](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) | ~1.500 |
| **UX Design** | ✅ encontrado (whole, COMPLETE) | [ux-design-specification.md](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md) | ~1.000 |
| **Epics & Stories** | ⚠️ ainda não criado | — | — |

**Sem duplicatas. Sem conflitos. Trio coerente para cross-check.**

## Step 2 (iter2) — PRD Analysis (validação)

PRD inalterado desde iter1 — 45 FRs em 8 capability areas, 36 NFRs em 7 categorias. Score 96% mantido.

## Step 3 (iter2) — Epic Coverage Validation

Status: **N/A — Epics ainda não criado** (continua como iter1). Refined breakdown de 5 epics da iter1 continua válida e foi confirmada pelo Architect (D11 cross-component dependencies + sequência de implementação).

## Step 4 (iter2) — UX Alignment Assessment ✅ AGORA AVALIÁVEL

### UX ↔ PRD alignment

Validei explicitamente **cada elemento UI mencionado no PRD contra a UX spec**:

| FR | Elemento UI no PRD | Coberto na UX spec? |
|---|---|---|
| FR1, FR2 | Upload de .xlsx via formulário | ✅ Estado #1 wireframe + ImportDropzone |
| FR3, FR4 | Mensagens de rejeição (extensão, tamanho) | ✅ Microcopy estados de upload + error patterns §3.4 |
| FR5 | Rejeição com mensagem clara em layout não-Tirvu | ✅ Estado #4b com motivo INVALID_TIRVU_HEADER explícito |
| FR7 | Tenant picker SuperAdmin obrigatório | ✅ Variação A do estado #1 com Select |
| FR9 | Banner persistente com nome do tenant | ✅ §4.1 banner anatomia completa, role="alert", AAA contrast |
| FR10 | Modal de confirmação que repete tenant | ✅ §2.4 modal wireframe + §4.4 confirm-typing GitHub-style |
| FR15 | Detecção de ausentes sem auto-inativar | ✅ Estado #2 card 👻 Ausente + tooltip explicando "NUNCA inativamos automaticamente" |
| FR16 | Detecção de Lotações novas | ✅ Estado #2 block "Lotações novas detectadas" com 2 radios |
| FR17 | Tabela paginada virtualizada | ✅ §4.2 wireframe + comportamento expand/collapse |
| FR18 | Filtros por status | ✅ §2.3 filter chips em 6 categorias + Todos |
| FR19 | Cancelar com zero efeito | ✅ §2.3 botão "Cancelar e voltar" + §4.1 banner Cancelar |
| FR27 | Progresso real-time | ✅ Estado #3 + §4.3 polling smoothing strategy |
| FR28 | Sumário final | ✅ Estado #4a wireframe + microcopy completa |
| FR29 | Download .xlsx erros | ✅ Estado #4a botão "⬇ Baixar relatório de erros" |
| FR30 | Navegar para colaboradores populados | ✅ Estado #4a "Ver colaboradores ▶" |

**Cobertura PRD↔UX: 100% dos elementos UI mencionados.**

**Bonus na UX (não no PRD original — adições positivas):**
- 5ª categoria visual `↻ Reativação` (alinha com D11 do Architecture — re-import sobre soft-deleted)
- Tela de falha (Estado #4b) com 4 variantes de motivo + microcopy específica
- Sidebar entry com hover-expand + sub-itens
- Confetti easter egg no sucesso (opt-in)
- Screen reader narrativa exemplificada para Bruno usando NVDA

### UX ↔ Architecture alignment

Cross-check de D10 (Frontend Architecture) vs UX spec:

| D10 Decisão | UX cumpre? |
|---|---|
| 4 estados via querystring `?step=` | ✅ §1 menciona explícito; §3.2 state strategy |
| useReducer + URL state, sem state lib externa | ✅ §3.2 explicit "não usar Zustand/Jotai/Redux" |
| Polling 2s via TanStack Query refetchInterval | ✅ §4.3 + estado #3 microcopy "atualizamos a cada 2 segundos" |
| @tanstack/react-virtual para 5k rows 60fps | ✅ §4.2 performance contract + §3.1 component table |
| react-dropzone wrapper | ✅ §3.1 ImportDropzone novo |
| LCP ≤1.5s mitigations (lazy load) | ⚠️ **UX não menciona explicitamente** — assume o action item do Architect (medir baseline e lazy-load if needed). Não é gap, é hand-off implícito. |
| Banner role="alert" aria-live="assertive" | ✅ §4.1 anatomia + §5.2 WCAG mapping |
| Modal focus trap, default Cancel, Esc | ✅ §2.4 modal + §5.2 WCAG 2.1.2 + §5.5 narrativa |
| Status colors com ícone+label | ✅ §2.3 cards de contagem + §5.3 color blindness |
| Componentes em `components/imports/` | ✅ §3.1 inventory bate com Architecture árvore |

**Cobertura UX↔Architecture: 100%, com 1 item assumido como hand-off implícito (LCP mitigations).**

### Findings

✅ **0 misalignments críticos.** UX não retro-divergiu do PRD nem do Architecture.

🟡 **1 hand-off implícito** (não bloqueante): LCP measurement + mitigation activation são ação do dev na primeira story de frontend, baseado no que UX especificou + Architecture autorizou.

## Step 5 (iter2) — Epic Quality Pre-validation (re-run)

**Status:** Epics ainda não criados. Refined breakdown da iter1 continua válida.

**Update:** Architecture trouxe 1 ajuste útil ao plano de epics. **Architecture D11 cross-component dependencies sugere ordem refinada:**

```
Story 5.1 (Epic 5)  → encryption + permissions  (BLOQUEIA Epic 3)
Story 1.1 (Epic 1)  → volume Docker + storage handler  (em paralelo)
Story 2.1 (Epic 2)  → migration Prisma + ImportJob model
Story 2.2 (Epic 2)  → parser + validator + matcher
Story 3.1 (Epic 3)  → BullMQ queue + worker + tenant fairness + state machine
Story 3.2 (Epic 3)  → apply chunks + AuditLog + VacationEngine integration
Story 4.1 (Epic 4 — UI Upload+Preview)  → frontend flow + dropzone + tenant picker + banner
Story 4.2 (Epic 4 — UI Apply+Done)  → modal + progress + summary + error report download
Story 4.3 (Epic 4 — Sidebar entry)  → modificação Sidebar.tsx
Story 5.2 (Epic 5)  → log sanitization plugin + bankData masking endpoint
Story 5.3 (Epic 5)  → penetration tests no CI
```

⚠️ **Atualização da nota para o SM (iter2 refinement):** quando rodar `evo-create-epics-and-stories`, **passar este Implementation Readiness Report inteiro** + os 3 documentos. SM tem material para gerar stories implementáveis sem retrabalho.

## Step 6 (iter2) — Final Assessment

### Cross-Document Coherence Matrix

| Par | Coerência | Score | Notas |
|---|---|---|---|
| PRD ↔ Architecture | ✅ FULL | 100% | Architect validou no Step 7; 100% FRs/NFRs com decisão |
| PRD ↔ UX | ✅ FULL | 100% | Validei nesta iter — todos elementos UI cobertos |
| Architecture ↔ UX | ✅ FULL | 99% | 1 hand-off implícito de LCP measurement (não bloqueante) |
| PRD ↔ IR (refined epics) | ✅ FULL | 100% | 45 FRs em 5 epics sem overlap/omissão |
| **Trio coherence** | ✅ **EXCELENTE** | **99.7%** | **Pronto para epic/story breakdown** |

### Action items pendentes do Bruno (status check)

| Item | Status | Quando precisa estar feito |
|---|---|---|
| `openssl rand -base64 32` → Docker Secret `BANK_DATA_ENCRYPTION_KEY` | ⏳ aberto | **Antes da Story 5.1** rodar |
| Adicionar volume `imports-data:/var/imports` em compose | ⏳ aberto | **Antes da Story 1.1** rodar |
| Medir LCP atual de `/admin/tenants` | ⏳ aberto | **Antes da Story 4.1** rodar |
| Decidir feature flag `imports.enabled` true/false para Green House | ⏳ aberto | **Antes do deploy de produção** |

Nenhum dos 4 bloqueia o **SM rodar agora** (epic/story breakdown é planning, não implementação). Eles bloqueiam stories específicas durante implementação.

### Gaps NOVOS desta iteração

🔴 **Critical:** **0 novos.**
🟠 **Major:** **0 novos.**
🟡 **Minor (nice-to-have, não bloqueante):**
- M1: UX spec menciona "Phase 2 history page" como sub-item da sidebar com tooltip "Em breve". Architecture não tem essa rota explicitada. Sem impacto MVP, mas vale alinhar quando Phase 2 for planejado.
- M2: Confetti easter egg no estado #4a — Bruno deve decidir conscientemente (default on). Lib `canvas-confetti` adiciona ~7kb gz; cabe no budget NFR7 (≤80kb).

### Veredicto Final — Iteração 2

**🟢 GO — Trio completo e coerente. Pronto para SM rodar `evo-create-epics-and-stories`.**

**Confidence Level:** **VERY HIGH** (incrementado de HIGH na iter1)

**Justificativa:**
- PRD↔Architecture↔UX cross-check em 99.7% sem misalignments críticos
- 3 production-critical issues resolvidos pelo Architect (encryption HKDF, tenant fairness Redis lock, LCP mitigations)
- 5 gaps menores resolvidos
- 0 critical/major novos gaps
- Refined epic breakdown validada e refinada com sequence-of-implementation
- 4 action items operacionais do Bruno claramente documentados com gating points

### Recomendação para próximos passos

1. **🟢 Disparar SM agora** via skill `evo-create-epics-and-stories` — passar PRD + Architecture + UX + este IR report como inputs. SM deve produzir `epics.md` com 5 epics + ~11 stories implementáveis com critérios de aceitação Given/When/Then.
2. **Bruno endereça os 4 action items operacionais** durante/antes das stories que dependem deles (não bloqueia SM agora).
3. **Quando epics.md existir, re-rodar este checker (iter3)** — desta vez Step 3 (Epic Coverage) e Step 5 (Epic Quality) rodam em modo full e produzem assessment terminal pré-Phase 4.

### Iteration Summary

| Iter | Quando | Findings | Score | Status |
|---|---|---|---|---|
| 1 | 2026-04-29 | 3 critical (resolved), 1 major, 5 minor, 3 warnings | 96% PRD-only | PRD READY |
| **2 (atual)** | **2026-05-01** | **0 critical, 0 major, 2 minor (nice-to-have)** | **99.7% trio coherence** | **TRIO READY ✅** |
| 3 (futuro) | quando epics.md existir | TBD | TBD | TBD |

---

**Assessor:** John (PM via skill evo-pm)
**Re-run methodology:** BMAD `check-implementation-readiness` v1.0.6 (modo full em PRD+Arch+UX, Epics step deferred)
