---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation-skipped', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
status: 'COMPLETED'
completedAt: '2026-04-29'
vision:
  statement: 'Eliminar gargalo de cadastro manual de colaboradores pra destravar adoção rápida do GestaoFerias por novos clientes/tenants'
  differentiators: ['D1: zero-config Tirvu (auto-mapping)', 'D2: preview diff antes de aplicar', 'D3: multi-tenant safe by default']
  coreInsight: 'Dados de RH nascem em outro sistema (Tirvu/folha) — import é cidadão de primeira classe, não ferramenta admin escondida'
classification:
  projectType: 'web-app'
  domain: 'hr-saas / workforce-management'
  complexity: 'HIGH'
  projectContext: 'brownfield'
  operators: ['SUPERADMIN', 'TENANT_ADMIN']
  usagePattern: 'on-demand-bootstrap-and-partial-reimport'
inputDocuments:
  - path: 'CLAUDE.md'
    type: 'project-context'
  - path: '_evo-output/planning-artifacts/v3-postos-cobertura-ai/prd.md'
    type: 'prior-prd'
  - path: '_evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md'
    type: 'prior-architecture'
  - path: '_evo-output/planning-artifacts/v3-1-polish-feedback/epics.md'
    type: 'prior-epics'
  - path: 'docs/exemplo/Colaboradores, para fins de validação.xlsx'
    type: 'reference-data-sample'
  - path: 'backend-api/prisma/schema.prisma'
    type: 'current-schema'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 4
workflowType: 'prd'
feature: 'v3-2-import-tirvu'
jtbd: 'H1-bootstrap (now) + H2-sync (future option)'
---

# Product Requirements Document — Importação Tirvu

**Author:** Bruno
**Date:** 2026-04-29
**Project:** gestao-ferias
**Feature:** v3-2-import-tirvu

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Classification](#project-classification)
3. [Success Criteria](#success-criteria)
4. [Product Scope](#product-scope)
5. [User Journeys](#user-journeys)
6. [Domain-Specific Requirements](#domain-specific-requirements)
7. [Web App — Project-Type Specific Requirements](#web-app--project-type-specific-requirements)
8. [Project Scoping & Phased Development](#project-scoping--phased-development)
9. [Functional Requirements](#functional-requirements) (45 FRs)
10. [Non-Functional Requirements](#non-functional-requirements) (36 NFRs)

**Reading guides:**
- **Stakeholder / approval read:** seções 1, 2, 3, 4 (Executive Summary → Product Scope) — 5 minutos
- **UX Designer:** seções 5, 7, 9 (Journeys + Project-Type + FRs) — design parte daqui
- **Architect:** seções 6, 7, 8, 9, 10 (Domain + Project-Type + Scoping + FRs + NFRs) — entrada técnica completa
- **PM / SM (epic/story breakdown):** seções 4, 8, 9 (Scope + Scoping + FRs) — capability contract para stories

## Executive Summary

GestaoFerias V3 hoje exige cadastro manual de cada colaborador via formulário web. Para a Green House (cliente-âncora) e futuros tenants SaaS, isso inviabiliza a adoção: bases existentes vivem em sistemas legados de folha (Tirvu) com 1.000+ registros por empresa, e digitar manualmente custa dias de trabalho operacional antes de ver qualquer valor da plataforma. Esta feature entrega importação em massa de colaboradores a partir do export padrão do Tirvu (.xlsx, 46 colunas fixas), com auto-mapeamento, preview de diff antes de aplicar, e isolamento multi-tenant rigoroso. O alvo imediato (H1) é bootstrap único da base existente; o desenho já nasce idempotente para habilitar reimport sob demanda e, em fase futura (H2), sincronização recorrente Tirvu↔GestaoFerias.

**Operadores:** SuperAdmin (importa para qualquer tenant — onboarding de novos clientes) e TenantAdmin (importa apenas no seu próprio tenant — manutenção). **Volume alvo:** até 5.000 linhas por arquivo, processamento assíncrono via BullMQ com progresso observável. **Frequência:** sob demanda (reimports parciais por escopo são esperados — ex.: só os colaboradores de um posto novo).

### What Makes This Special

- **Zero-config Tirvu auto-mapping:** o sistema reconhece o header padrão Tirvu (46 colunas conhecidas) e mapeia campos automaticamente — o usuário não preenche wizard de "qual coluna é o quê" a cada upload. Reduz fricção e previne erros de mapeamento.
- **Preview diff antes de aplicar:** diferente de import-CSV genérico que joga linhas no banco e reza, mostramos exatamente o que vai acontecer — quantos colaboradores serão criados, quantos atualizados, conflitos de CPF, lotações novas detectadas, linhas inválidas com motivo. O usuário aplica com segurança ou cancela sem efeito.
- **Multi-tenant safe by default:** TenantAdmin fisicamente não consegue importar para outro tenant; SuperAdmin escolhe explicitamente o tenant alvo a cada upload, com auditoria do ato. Vazamento cross-tenant é arquiteturalmente impossível.
- **Idempotência desde o dia 1:** chave de match `(tenantId, cpf)` primária + `tirvuId` secundário. Re-imports da mesma planilha não duplicam, não corrompem; atualizações são detectadas campo a campo.
- **Falha parcial graciosa:** 950 de 1.000 linhas válidas? Importa as 950 e devolve relatório baixável (.xlsx só com as 50 problemáticas + coluna "motivo") para correção e re-upload — em vez do all-or-nothing hostil.

**Core insight:** dados de RH nunca nascem no GestaoFerias — nascem no Tirvu, na folha, em sistemas legados. Aceitar essa realidade e tratar importação como **cidadã de primeira classe do produto** (não como ferramenta admin escondida) é o que destrava adoção comercial em escala.

## Project Classification

- **Project Type:** Web app — feature dentro de SaaS multi-tenant existente (backend Fastify + frontend Next.js)
- **Domain:** HR-SaaS / Workforce Management (terceirização de mão de obra, gestão de férias CLT)
- **Complexity:** **Alta**
  - Regulação CLT (saldos de férias derivados de hireDate alimentam VacationEngine downstream)
  - LGPD pesada (planilha traz CPF, RG, PIS, dados bancários completos, endereço, filiação)
  - Multi-tenant strict isolation (vazamento = vazamento massivo de RH)
  - Idempotência + dry-run + reconciliação não-trivial
  - Escala 1.000+ linhas força async (BullMQ) com progresso observável
- **Project Context:** **Brownfield** — V3 em produção; schema `Employee`, `Workplace`, `WorkplaceAllocation`, `AuditLog` já existentes; BullMQ + Redis já configurados; tenant isolation via Prisma extension já implementado.

## Success Criteria

### User Success

- **Bootstrap em minutos, não dias.** Operador (SuperAdmin ou TenantAdmin) sobe planilha Tirvu de 1.000 colaboradores e tem a base operacional em **menos de 5 minutos** desde o upload até "concluído". Hoje, cadastro manual da mesma base levaria 2-3 dias úteis.
- **Confiança antes de aplicar.** O preview/dry-run mostra com clareza: criados, atualizados, ignorados, inválidos, lotações novas detectadas. Operador aprova ou cancela com zero efeito colateral. Meta: **0 incidentes de "subi planilha errada e contaminou base"** em 6 meses pós-launch.
- **Recuperação sem retrabalho.** Linhas inválidas voltam num relatório baixável (.xlsx) com a coluna "motivo do erro". Operador corrige no Excel e re-sobe. Meta: **≥95% das linhas com erro corrigíveis sem suporte técnico**.
- **Aha! moment:** ao clicar "Aplicar" no preview, ver a tela de progresso em tempo real e, ao final, o painel já populado com os colaboradores novos prontos pra entrar no fluxo de férias. **Tempo medido do clique até "ver colaborador no painel": <2 minutos para 1.000 linhas.**

### Business Success

- **Tempo de onboarding de tenant novo:** de baseline atual (~1 semana de digitação) → **<1 hora de wall-clock** desde criar tenant até base populada e operacional. Métrica: tempo entre `tenant.createdAt` e `firstImport.completedAt`.
- **Taxa de adoção da feature:** **≥80% dos tenants novos** criados pós-launch usam import (vs. cadastro manual) na primeira semana. Sinal de que onboarding é "import-first".
- **Reduzir bloqueio comercial:** **0 vendas perdidas em 6 meses** por "não temos como subir nossa base existente". Métrica qualitativa via feedback comercial.
- **Habilitar H2 (sync recorrente) sem retrabalho:** schema e idempotência do MVP devem suportar sync agendada quando ativada — meta = **<2 sprints** para entregar H2 a partir do MVP H1.

### Technical Success

- **Performance:** processar 5.000 linhas em **≤5 minutos** wall-clock (job assíncrono BullMQ). Latência de upload + parse + validação dry-run em **≤30s para 1.000 linhas**.
- **Idempotência verificável:** subir a mesma planilha 2× consecutivas resulta em **0 alterações no segundo upload** (validado por testes automatizados).
- **Multi-tenant safety:** **0 vazamentos cross-tenant** em testes de penetração. TenantAdmin só enxerga e altera dados do próprio tenant; SuperAdmin precisa selecionar tenant alvo explicitamente.
- **Auditoria completa:** **100% das criações/atualizações** geram entrada em `AuditLog` agrupada por `importJobId`. Possível reconstruir "quem importou o quê, quando, por quê" para qualquer linha do banco.
- **Confiabilidade:** **≥99%** dos jobs concluem (sucesso ou falha graciosa com relatório). Falhas catastróficas (job stuck, banco inconsistente) = **0 incidentes em 90 dias**.
- **Compliance LGPD:** dados bancários (banco, agência, conta, chave PIX) armazenados criptografados em coluna `bankData` (JSON criptografado em repouso). Acesso a esses campos via permissão dedicada, não default.

### Measurable Outcomes

| Métrica | Baseline | Meta MVP | Meta 6m |
|---|---|---|---|
| Tempo wall-clock 1k colaboradores | N/A (manual: ~3 dias) | <5 min | <2 min |
| Taxa de linhas válidas no 1º upload | N/A | ≥85% | ≥95% |
| Tenants novos usando import | 0% | 80% | 95% |
| Incidentes vazamento cross-tenant | N/A | 0 | 0 |
| Suporte acionado por erro de import | N/A | <10% dos uploads | <2% dos uploads |
| Cobertura de testes (parser + validação + job) | 0% | ≥80% | ≥85% |

## Product Scope

### MVP — Minimum Viable Product

**Objetivo:** entregar bootstrap H1 funcional, seguro e auditável em 1 sprint focado.

**In-scope:**
1. **Upload de arquivo .xlsx** (limite 10MB) via formulário web em duas rotas:
   - `/admin/imports/employees` (SuperAdmin — escolhe tenant alvo)
   - `/settings/imports/employees` (TenantAdmin — tenant fixo do JWT)
2. **Parser Tirvu hardcoded** das 46 colunas conhecidas. Detecta header padrão; rejeita arquivo com schema diferente.
3. **Expansão do modelo `Employee`** com campos novos (ver Architecture):
   - `tirvuId` (string, unique por tenant) — chave de match secundária
   - `personalData` (JSON: pcd, deficiencia, sexo, rg, pisPasep, ctps, nomePai, nomeMae, demissionDate)
   - `address` (JSON: cep, logradouro, numero, complemento, bairro, uf, cidade)
   - `bankData` (JSON criptografado: tipoPix, chavePix, banco, tipoConta, agencia, conta)
   - `unionName` (sindicato)
   - `geofencingFlags` (JSON: foraDaCerca, semGeo)
4. **Validação por linha:** CPF formato + dígito verificador, datas dd/MM/yyyy, status enum, campos obrigatórios.
5. **Match idempotente:** primário `(tenantId, cpf)`, secundário `(tenantId, tirvuId)`. Detecção de update field-by-field.
6. **Detecção de Workplace por nome (Lotação)** — exibe no preview, **não auto-cria** sem confirmação.
7. **Preview/dry-run:** página com resumo (X criados, Y atualizados, Z inválidos, W lotações novas) + tabela paginada de linhas.
8. **Job assíncrono BullMQ** com tela de progresso (polling ou SSE).
9. **Relatório de erros baixável** (.xlsx só linhas inválidas + coluna "motivo").
10. **AuditLog por linha** agrupado por `importJobId`.
11. **Cálculo automático de saldo CLT** via VacationEngine existente baseado em `hireDate`.
12. **Criptografia at-rest** de `bankData` (AES-256 com chave por tenant ou env).
13. **Testes:** unit (parser, validador, idempotência), integration (job end-to-end), e2e (upload + preview + apply + report).

**Out-of-scope MVP:**
- Sync agendado/automático (é H2)
- Webhook quando Tirvu exportar
- Wizard de mapeamento custom (Tirvu hardcoded basta)
- Suporte a outros formatos (CSV, ODS, JSON)
- API pública de import (só via UI)
- Edição inline no preview (linha errada → corrige no Excel e re-sobe)

### Growth Features (Post-MVP)

- **H2 — Sync Tirvu agendada:** cron diário/semanal, baixar export do Tirvu via SFTP/email/API, aplicar diff automático com regras de auto-aprovação configuráveis.
- **Histórico de imports:** lista de jobs passados com filtros, re-download do relatório, "ver diff aplicado".
- **Mapeamento custom:** wizard pra clientes que usam outro sistema que não Tirvu (paridade com Pontomais).
- **Importação de outras entidades:** Workplaces, Positions, Allocations via planilhas dedicadas.
- **Notificações:** email/WhatsApp ao SuperAdmin quando job de tenant terceiro concluir.
- **Edição inline no preview:** corrigir CPF inválido sem precisar refazer no Excel.

### Vision (Future)

- **Conector nativo Tirvu via API:** se/quando Tirvu expuser API, abandonar planilha em prol de pull direto.
- **Multi-source merge:** importar de Tirvu + sistema X + Y, com regras de prioridade por campo.
- **AI-assisted mapping:** LLM detecta automaticamente o mapeamento de qualquer planilha (não só Tirvu) e sugere ao usuário.
- **Marketplace de conectores:** outros tenants SaaS plugam seu sistema-fonte.

## User Journeys

### Persona 1 — Bruno (SuperAdmin / Owner Green House)

**Backstory:** Bruno é dono da Green House e do GestaoFerias. Toca o produto comercial e atende novos clientes. Hoje, quando uma empresa terceirizada nova quer adotar o GestaoFerias, ele recebe a base de colaboradores em planilha do Tirvu (sistema de folha que praticamente todo cliente já usa) e literalmente abre o painel admin pra digitar 1 a 1. Acumula >1.000 colaboradores na carteira. Cada novo cliente é uma semana de digitação que ele não tem.

**Situação:** acabou de fechar com a empresa "Servi-Plus" (cliente novo, ~300 colaboradores). Eles mandaram o export do Tirvu. Em vez de abrir o painel e digitar, Bruno vai usar o Import.

#### Journey 1A — SuperAdmin: Bootstrap de tenant novo (happy path)

**Opening Scene.** Bruno acabou de criar o tenant "Servi-Plus" no painel SuperAdmin (rota `/admin/tenants`). Tenant criado, sem colaboradores ainda, base zerada. Recebeu a planilha `colaboradores-serviplus-2026-04.xlsx` por email do contato do cliente.

**Rising Action.** Bruno entra em `/admin/imports/employees`. A tela mostra:
- Dropdown "Tenant alvo" com lista dos tenants ativos (campo obrigatório, não tem default)
- Área de upload com drag-and-drop e botão "Selecionar arquivo"
- Aviso visível: "Apenas planilhas no formato Tirvu (.xlsx, 46 colunas). [Ver formato esperado]"

Ele seleciona "Servi-Plus" no dropdown e arrasta o arquivo. Upload mostra barra de progresso (alguns segundos pra subir 2MB). Ao final do upload, a tela transiciona pra **Preview**.

**Climax.** Tela de Preview mostra o resumo em cards:
- ✅ **300 colaboradores válidos** (criar)
- ⚠️ **0 atualizações** (tenant zerado)
- ❌ **2 linhas inválidas** (ver detalhes)
- 🆕 **3 lotações novas detectadas** ("ANATEL", "TRT-DF", "MEC") — [Criar todas] [Mapear para existentes]

Abaixo, uma tabela paginada com as 305 linhas do arquivo, status por linha (válido/inválido/atualização/criação). As 2 inválidas estão com badge vermelho e tooltip "CPF inválido" e "Data de admissão fora do formato dd/MM/yyyy".

Bruno clica em "Criar todas" pras 3 lotações novas. Confirma. Decide ignorar as 2 inválidas (vai corrigir no Excel depois).

Clica **"Aplicar importação"**. Modal de confirmação: "Vai criar 300 colaboradores no tenant **Servi-Plus**, criar 3 lotações novas. Esta ação será auditada. Continuar?"

Confirma. Tela transita pra **Progresso**: barra com "Importando 0 / 300...", atualizando em tempo real. Em ~1 minuto: "✅ Concluído. 300 criados, 3 lotações criadas, 2 ignoradas."

**Resolution.** Botões "Ver colaboradores" (vai pra `/admin/tenants/servi-plus/employees` já populado) e "Baixar relatório" (.xlsx com as 2 linhas inválidas + motivo). Bruno corrige as 2 no Excel, sobe de novo, sistema reconhece como atualizações (idempotência), tenant fica 100% populado.

**Estado emocional:** ansioso → focado → aliviado → confiante. "Onboarding de cliente novo agora cabe num café."

**Capabilities reveladas:**
- Rota `/admin/imports/employees` com seleção explícita de tenant
- Upload com validação de formato (.xlsx, 10MB max)
- Parser Tirvu com detecção de header
- Preview com diff (criar/atualizar/inválido) + detecção de Workplaces novos
- Confirmação modal com auditoria
- Job assíncrono com progresso real-time
- Relatório de erros baixável (.xlsx)
- Idempotência no re-upload

---

#### Journey 1B — SuperAdmin: Subi planilha errada (edge case)

**Opening Scene.** Bruno tem 12 tenants ativos. Recebeu duas planilhas Tirvu na mesma semana — uma do cliente "Servi-Plus" e uma do cliente "RHTec". Distraído, ele entra no import com tenant "Servi-Plus" selecionado e sobe a planilha do "RHTec" por engano.

**Rising Action.** Upload sobe. Preview carrega: **300 colaboradores válidos para criar**.

Mas Bruno olha a tabela paginada e vê os nomes — não reconhece nenhum, todos têm Lotação "TRT-DF" (que ele sabe ser do RHTec, não do Servi-Plus). Pisca o olho.

**Climax.** A tela tem um banner persistente no topo, em destaque visual (cor de aviso, contraste alto): **"Você está prestes a importar para o tenant: SERVI-PLUS"** (com nome em negrito grande). Tem também um botão "Cancelar e descartar".

Bruno clica em "Cancelar e descartar". Modal: "Isso vai descartar o preview. Nenhum dado foi criado. Continuar?". Confirma. Volta pra tela inicial de import com tenant resetado e arquivo limpo.

**Resolution.** Bruno seleciona o tenant correto ("RHTec"), sobe a planilha de novo. Preview agora coerente. Aplica com tranquilidade.

**Mas e se ele tivesse clicado "Aplicar"?** A AuditLog teria registrado tudo amarrado a um `importJobId`. Bruno teria, na rota futura `/admin/imports/history`, a opção de "Reverter este import" (Growth feature). No MVP, ele teria que limpar os 300 manualmente — mas com filtro `tirvuId IN (...)` da própria planilha, é DELETE direto pelo banco. Mitigação real do MVP é **prevenção via UX**: o banner gigante com o nome do tenant + modal de confirmação **mostrando o nome do tenant** explícito.

**Estado emocional:** confiante → desconfiado → atento → aliviado. "Quase deu ruim, mas o sistema gritou comigo a tempo."

**Capabilities reveladas:**
- Banner persistente do tenant alvo durante todo o fluxo de preview
- Modal de confirmação que **repete o nome do tenant** antes de aplicar
- Preview detalhado em tabela permite reconhecer divergência por inspeção visual
- Botão "Cancelar e descartar" sempre disponível, sem efeito colateral
- AuditLog com `importJobId` para rastreabilidade futura

---

### Persona 2 — Carla (TenantAdmin / RH da Servi-Plus)

**Backstory:** Carla é coordenadora de RH na Servi-Plus, cliente do GestaoFerias. Recebeu acesso TenantAdmin do Bruno depois do bootstrap inicial. Mensalmente, exporta a folha do Tirvu (Servi-Plus tem rotatividade alta — admissões e demissões toda semana). Hoje cadastra novos colaboradores manualmente no GestaoFerias quando lembra, mas a base diverge do Tirvu com frequência.

#### Journey 2A — TenantAdmin: Reimport mensal de manutenção (happy path)

**Opening Scene.** Início do mês. Carla acabou de fechar a folha de abril no Tirvu. Exportou a planilha completa (327 colaboradores, sendo 12 admitidos no mês e 5 demitidos). Quer atualizar o GestaoFerias.

**Rising Action.** Carla loga no GestaoFerias. Sidebar tem item "Importar colaboradores" sob `/settings/imports/employees` (sem dropdown de tenant — o tenant dela é fixo do JWT). Sobe a planilha.

**Climax.** Preview mostra:
- ✅ **12 colaboradores novos** (criar) — admissões do mês
- 🔄 **305 colaboradores existentes** (sem alterações detectadas)
- ✏️ **5 atualizações** (mudanças de cargo/salário/lotação detectadas em colaboradores existentes)
- 👻 **5 colaboradores no sistema não estão nesta planilha** — *demissões prováveis*. Sistema mostra: "[Ignorar] [Marcar como candidatos a inativar]". **Default = Ignorar** (NUNCA auto-inativa).

Carla bate olho na lista dos 5 ausentes — confere com o RH dela e sabe que de fato foram demitidos. Clica em "Marcar como candidatos a inativar". Sistema explica: "Isso vai sinalizar esses colaboradores com flag `inactivePending=true`. Você revisa e aprova individualmente em /employees depois — a inativação **não é automática**."

Aplica. Job roda em ~30s. Painel atualizado.

**Resolution.** Carla vai em `/employees`, filtra por "Pendente inativação", revisa os 5, marca como demitidos com data correta. Base 100% sincronizada com a folha de abril.

**Capabilities reveladas:**
- Rota `/settings/imports/employees` com tenant fixo (JWT)
- Detecção de "ausentes na planilha atual" com tratamento explícito (nunca auto-inativa)
- Detecção field-by-field de updates (cargo, salário, lotação mudaram)
- Flag `inactivePending` para revisão humana
- Idempotência preservada em re-imports recorrentes

---

### Persona 3 — Diogo (Suporte / Dev de plantão)

**Backstory:** Diogo é dev/suporte. Carla acionou ele dizendo "subi a planilha, deu erro, e o sistema não me explicou direito." Ele precisa investigar.

#### Journey 3A — Suporte: Investigar import que falhou

**Opening Scene.** Ticket no Zendesk: "Import travou em 'Processando...' há 1h." Diogo precisa entender se o job morreu, se ficou em fila, ou se Carla é que não esperou.

**Rising Action.** Diogo abre `/admin/imports/history` (futura, ou no MVP via console BullMQ). Lista de jobs. O da Carla está com status "FAILED" e mensagem genérica "Erro no parsing".

Diogo clica no job. Tela de detalhe mostra:
- `importJobId`, tenant, operador, timestamp, arquivo (link pra baixar o original)
- Stacktrace resumido (admin only): "ZodError: row 47 — campo `Admissão` não pôde ser parseado como data dd/MM/yyyy. Valor recebido: 'agosto/2025'"
- Linhas processadas até o erro: 0 (falhou no parse antes de aplicar)
- Botão "Notificar operador" + link "Ver entrada no AuditLog"

**Climax.** Diogo identifica que a planilha do Tirvu da Carla veio com formatação corrompida em 1 linha (texto em vez de data). Ele baixa o arquivo original, corrige a linha 47 no Excel, devolve pra Carla via Zendesk com instrução: "Sobe esse arquivo aqui que vai dar certo."

**Resolution.** Carla sobe. Funciona. Ticket fechado em 15 min.

**Capabilities reveladas (MVP-ready vs Growth):**
- **MVP:** logging estruturado dos jobs em BullMQ + acesso ao banco para inspeção; mensagens de erro detalhadas no relatório baixável (.xlsx) — Carla teria visto o erro da linha 47 sem precisar de Diogo
- **Growth:** rota `/admin/imports/history` com UI completa para SuperAdmin investigar
- AuditLog amarrando job → tenant → operador → arquivo

---

### Journey Requirements Summary

Capacidades reveladas pelas jornadas, agrupadas por área:

**Upload & Parsing**
- Aceitar arquivo .xlsx até 10MB
- Detectar header padrão Tirvu (46 colunas); rejeitar arquivos divergentes com mensagem clara
- Parser tolerante a campos null em colunas opcionais

**Tenant Targeting & Authorization**
- SuperAdmin: rota `/admin/imports/employees` com **dropdown obrigatório** de tenant alvo + banner persistente do nome do tenant durante todo o fluxo
- TenantAdmin: rota `/settings/imports/employees` com tenant fixo do JWT
- TenantAdmin **fisicamente** não consegue importar pra outro tenant (validação backend, não só UI)

**Validation & Preview (dry-run)**
- Validação por linha (CPF, datas, status enum, campos obrigatórios)
- Preview com 4 categorias: criar, atualizar (com diff field-by-field), inválido (com motivo), ausente-no-arquivo (apenas em re-imports — nunca auto-inativa)
- Detecção de Workplaces (Lotação) novos com opção [Criar todas] [Mapear para existentes]
- Tabela paginada com status por linha
- Botão "Cancelar e descartar" sempre disponível, sem efeito colateral

**Apply (job assíncrono)**
- Modal de confirmação que **repete o nome do tenant** alvo
- Job BullMQ com progresso observável em tempo real (polling ou SSE)
- Falha parcial graciosa: aplica linhas válidas + relatório das inválidas (.xlsx)
- Idempotência: re-upload da mesma planilha = 0 alterações

**Auditoria & Recuperação**
- AuditLog por linha, agrupado por `importJobId`
- Relatório baixável (.xlsx) com linhas inválidas + coluna "motivo"
- Logging estruturado dos jobs (mensagem de erro acessível ao operador via relatório, e ao SuperAdmin/Suporte via histórico futuro)
- Flag `inactivePending` para revisão humana (sem auto-inativação)

**Compliance & Segurança**
- Criptografia at-rest dos campos de `bankData`
- AuditLog com IP + UserAgent do operador
- Permissão dedicada para visualização de `bankData` (não default)

## Domain-Specific Requirements

### Compliance & Regulatory

**LGPD (Lei Geral de Proteção de Dados — Lei 13.709/2018):**
- **Base legal de tratamento:** os dados importados (CPF, RG, PIS, dados bancários, endereço, filiação) caracterizam dados pessoais e em parte sensíveis (ex.: PCD/deficiência). Base legal aplicável é **execução de contrato de trabalho** (Art. 7º, V) e **cumprimento de obrigação legal** (CLT, eSocial, FGTS — Art. 7º, II).
- **Princípio da finalidade:** dados podem ser usados apenas para gestão de férias, postos, cobertura e processos trabalhistas relacionados. **Proibido** uso para marketing, perfilamento ou compartilhamento externo sem nova base legal.
- **Princípio da minimização:** o MVP **importa todos os 46 campos da planilha Tirvu**, mas armazena `bankData` criptografado (acesso restrito por permissão dedicada). Campos não usados pela aplicação atual (ex.: nomes dos pais, RG órgão emissor) ficam em `personalData` JSON disponíveis para o RH, não para uso operacional do sistema.
- **Direitos do titular (Art. 18):** o sistema deve permitir acesso, correção e exclusão de dados de um colaborador específico. **Edição via UI já existe**; importação não inviabiliza esses direitos.
- **Auditoria de acesso a dados sensíveis:** consultas que retornem `bankData` devem ser logadas (acesso, não só modificação) para atender ao princípio de prestação de contas.
- **Retenção:** dados de colaboradores demitidos devem ser retidos pelo prazo legal trabalhista (5 anos após demissão para reclamação, até 30 anos para INSS). **Soft-delete** com flag `inactive=true` + `terminationDate`, expurgo manual após prazo.
- **Operadores autorizados:** SuperAdmin (Bruno) e TenantAdmin (Carla) atuam como operadores LGPD. Cada tenant é controlador dos próprios dados.

**CLT (Consolidação das Leis do Trabalho):**
- **Saldos de férias derivados:** todo Employee importado com `hireDate` válido aciona o `VacationEngine` para cálculo de período aquisitivo e saldo. O motor já valida regras CLT (12 meses de aquisição, 30 dias por período, fracionamento mínimo 14 dias).
- **Datas trabalhistas críticas:** `hireDate` (admissão), `terminationDate` (demissão), `birthDate` — usadas em cálculos de aquisição, prescrição, afastamento, e devem ser parseadas com formato fixo dd/MM/yyyy + validação de coerência (admissão ≤ hoje, demissão > admissão).
- **Salário:** importado com 2 casas decimais (Decimal), usado em base de cálculo do terço constitucional (1/3 férias) e abono pecuniário.
- **eSocial (futuro):** o schema deve nascer compatível com layouts eSocial (campos exigidos: PIS, CTPS, CBO/Cargo, lotação tributária). MVP importa esses campos mas não faz envio a eSocial — fica para uma feature futura.

### Technical Constraints

**Segurança / Criptografia:**
- `bankData` (chave PIX, banco, agência, conta) **criptografado em repouso** com AES-256-GCM. Chave de criptografia derivada de KMS por tenant ou variável de ambiente segura (definir na fase de arquitetura). Nunca trafegar dados bancários em logs ou respostas API sem permissão `view_bank_data`.
- **TLS obrigatório** em todo upload (já garantido pelo Traefik em produção).
- **Hash de auditoria:** o arquivo .xlsx original do upload é armazenado com hash SHA-256 + retenção de 90 dias para fins de reconstrução em caso de disputa.

**Privacidade / Acesso:**
- **Permissão `import.run`:** restrita a SuperAdmin e TenantAdmin (não disponível para roles operacionais — supervisor, financeiro, RH-leitura).
- **Permissão `bankData.view`:** distinta de `import.run`. SuperAdmin tem por default; TenantAdmin precisa habilitar explicitamente. Campos bancários trafegam mascarados (`****1234`) por default em listagens de colaborador, mesmo após import.
- **Isolamento multi-tenant strict:** Prisma extension de tenant scoping (já existente) deve cobrir todas as queries da feature. Adicionar testes de penetração específicos: TenantAdmin tentando acessar `/admin/imports/...`, ou tentando importar com `tenantId` divergente do JWT.

**Performance:**
- Parse + validação dry-run de **1.000 linhas em ≤30s** (limite de paciência do operador antes de fechar a aba).
- Aplicação assíncrona via BullMQ: 5.000 linhas em **≤5min**. Job worker dedicado (não competir com workers de email/whatsapp).
- Consumo de memória: parser deve operar em **streaming** (não carregar planilha inteira em RAM), pois 5.000 × 46 colunas com endereços longos = ~10MB em RAM por job.

**Disponibilidade:**
- Job morto/preso após 15min sem progresso → BullMQ marca como `failed` automaticamente, AuditLog registra, operador é notificado via UI.
- Banco de dados em transação por **chunk** (ex.: 100 linhas por transação). Falha numa transação não rollback total — registra erro nas linhas do chunk e continua.

### Integration Requirements

**Sistema-fonte (Tirvu):**
- **Formato:** export .xlsx padrão Tirvu, sheet única "Plan1", header fixo de 46 colunas (lista travada na seção MVP).
- **Identificador externo:** coluna `ID` do Tirvu armazenada em `Employee.tirvuId` (string, unique por tenant). Permite re-match mesmo se CPF for corrigido em re-imports.
- **Sem integração ativa MVP:** import é manual, push pelo operador. Pull via API/SFTP fica para H2.

**Sistemas internos GestaoFerias afetados:**
- **VacationEngine:** chamado para inicializar saldo de férias de cada Employee importado (background, não bloqueia o job).
- **Workplace / WorkplaceAllocation:** se operador escolheu "Criar todas" para Lotações novas, criar `Workplace` com `name=Lotação`, `tenantId` correto. **Não criar `WorkplaceAllocation` automaticamente no MVP** — alocação posto-colaborador é decisão operacional posterior (out-of-scope import).
- **AuditLog:** entrada por linha importada, agrupada por `importJobId`. Tipo de ação: `EMPLOYEE_IMPORT_CREATE`, `EMPLOYEE_IMPORT_UPDATE`, `EMPLOYEE_IMPORT_INVALID`.
- **Notificações (out-of-scope MVP):** futuro envio de WhatsApp/email ao SuperAdmin avisando "import do tenant X concluído". MVP só mostra na UI.

**eSocial / outras integrações regulatórias:**
- Out-of-scope MVP. Schema nasce compatível (campos PIS, CTPS, CBO presentes), mas envio fica para feature futura.

### Risk Mitigations

| Risco | Probabilidade | Impacto | Mitigação MVP |
|---|---|---|---|
| Vazamento cross-tenant (TenantAdmin importa para outro tenant) | Baixa (UX previne) | Crítico (LGPD, perda de cliente) | Validação backend dupla: JWT tenantId + tenantId no payload obrigatoriamente iguais; testes de penetração no CI |
| Operador sobe planilha errada (Bruno, edge case 1B) | Média | Alto (base contaminada) | Banner persistente com nome do tenant + modal de confirmação repetindo o nome; logs com `importJobId` permitem reverter manualmente |
| Dados bancários expostos em logs/respostas | Média | Crítico (LGPD) | Mascaramento por default; permissão dedicada `bankData.view`; sanitização de logs por middleware |
| Planilha com vírus/macro malicioso | Baixa | Alto | Parsing usa biblioteca `xlsx` (sem execução de macro); rejeição de extensões diferentes de .xlsx; tamanho máx 10MB |
| Job trava em produção (banco lento, OOM) | Média | Médio | Timeout 15min com `failed` automático; chunks de 100 linhas; worker dedicado; alerta no Grafana (futuro) |
| Tirvu muda layout da planilha | Média (1-2 vezes/ano) | Alto (parser quebra) | Validação rigorosa do header — rejeita arquivo com schema diferente, mensagem clara: "Layout Tirvu mudou. Atualize o sistema."; versionar o parser (`tirvuParserV1`) |
| CLT errada (saldo de férias incorreto pós-import) | Baixa (engine validado) | Crítico (passivo trabalhista) | VacationEngine já tem testes; importação só dispara cálculo, não duplica lógica |
| Re-import duplica colaboradores | Baixa (idempotência travada) | Alto | Match `(tenantId, cpf)` primário + `tirvuId` secundário; testes de idempotência no CI (subir 2x = 0 changes) |
| Auditoria insuficiente para reclamação trabalhista | Média | Crítico | AuditLog por linha + arquivo original retido 90d com hash SHA-256 |
| Operador acidentalmente marca todos como "candidato a inativar" | Baixa | Médio | Inativação **nunca automática**; flag `inactivePending` exige revisão manual em `/employees` antes de surtir efeito CLT

## Web App — Project-Type Specific Requirements

### Project-Type Overview

Feature dentro de SPA Next.js 16 (App Router, React 19) já em produção como parte do GestaoFerias V3. Stack frontend já travada (Tailwind, shadcn/ui, TanStack Query, design compacto: sidebar 220px, fonte 13px). Backend Fastify 5 + Prisma 7.6 + PostgreSQL 15. Esta seção foca apenas no que esta feature **adiciona ou exige além do baseline V3**.

### Technical Architecture Considerations

**Tipo de página:**
- 2 fluxos com URLs paralelas e mesmo componente base:
  - `/admin/imports/employees` (SuperAdmin com tenant picker)
  - `/settings/imports/employees` (TenantAdmin com tenant fixo)
- 4 estados visuais na mesma rota (URL state via querystring `?step=upload|preview|applying|done`):
  1. **Upload** — vazio, drag-and-drop area
  2. **Preview** — diff resumo + tabela paginada
  3. **Applying** — barra de progresso (job rodando)
  4. **Done** — resumo final + downloads (relatório, "ver colaboradores")

**Real-time / progresso de job:**
- **Decisão:** **Polling HTTP a cada 2s** durante estado "Applying" (TanStack Query com `refetchInterval`). Endpoint `GET /api/v1/imports/:jobId/status` retorna `{ status, processed, total, errors }`.
- **Por quê não SSE/WebSocket:** infra atual não tem hub WS; jobs duram <5min; polling 2s = overhead desprezível; menor superfície de bug. SSE/WS fica para H2 quando houver mais jobs concorrentes.

**Upload:**
- **shadcn/ui** não tem dropzone próprio — usar **react-dropzone** (já leve, ~10kb gz) integrado com `Input type=file`.
- **Limite client-side:** 10MB, .xlsx apenas. Validação dupla (browser + servidor).
- **Streaming não no client:** browsers não fazem multipart streaming bem; arquivo sobe inteiro num POST `multipart/form-data`. Streaming acontece no parsing **server-side**.

**Tabela de Preview:**
- **Volume:** até 5.000 linhas. Renderização client-side com **virtualização** via `@tanstack/react-virtual` (já compatível com TanStack Query). Sem virtualização, 5k linhas em DOM = travamento garantido.
- **Filtros:** "todos / criar / atualizar / inválido / ausente" (toggle de chips no topo).
- **Paginação:** 50 linhas por página + filtro lateral por status.
- **Diff field-by-field** (atualização): linha expandível mostrando "campo: valor antigo → valor novo" só nos campos que mudaram.

**Performance Targets:**
- Página `/admin/imports/employees` carrega em **<500ms** (sem dados).
- Upload + preview de 1.000 linhas pronto em **<30s** wall-clock.
- Tabela virtualizada navegável a **60fps** mesmo com 5k linhas.
- Bundle JS adicional desta feature: **<80kb gzipped** (parser xlsx fica no servidor; client só renderiza JSON do preview).

**Browser Matrix:**
- Mesmo do baseline V3: Chrome/Edge/Firefox/Safari últimas 2 versões. Sem suporte a IE/legacy.

**Responsive Design:**
- Página é **operada em desktop** (planilha de 1.000 linhas + diff é caso de uso desktop). Mobile funcional para checagem read-only do progresso/resumo, mas **não otimizado** para upload/preview no MVP.

**SEO Strategy:**
- N/A. Rota autenticada, atrás de login, sem indexação.

**Accessibility Level:**
- WCAG AA mínimo (consistente com V3): contraste, navegação por teclado na tabela, foco visível, status colors com ícone+label (não só cor — daltônicos).
- Banner do tenant alvo no SuperAdmin: **`role="alert"`** + alta contraste para leitores de tela anunciarem ao mudar.
- Modal de confirmação: foco preso até decisão; Esc cancela.

### Multi-Tenant Architecture (cross-cutting com saas_b2b)

**Tenant Model:**
- Pool de tenants com isolamento via Prisma extension (já implementado em V3). Toda query desta feature é escopada por `tenantId` injetado pelo middleware de autenticação.
- **Identificação do tenant alvo no upload:**
  - TenantAdmin: derivado do JWT (campo `tenantId` no token). Não aceita override no payload.
  - SuperAdmin: campo explícito `tenantId` no payload da request `POST /api/v1/admin/imports/employees`. Backend valida que tenant existe e está ativo.

**RBAC Matrix (delta desta feature):**

| Ação | SUPERADMIN | ADMIN (tenant) | SUPERVISOR | OPERATOR |
|---|---|---|---|---|
| `POST /admin/imports/employees` (qualquer tenant) | ✅ | ❌ | ❌ | ❌ |
| `POST /settings/imports/employees` (tenant fixo) | ✅ (próprio tenant via UI admin) | ✅ | ❌ | ❌ |
| `GET /imports/:jobId` (status, próprio job) | ✅ | ✅ | ❌ | ❌ |
| `GET /imports/:jobId/report.xlsx` | ✅ | ✅ | ❌ | ❌ |
| `GET /imports/history` | ✅ (cross-tenant) | ✅ (próprio tenant) | ❌ | ❌ |
| `GET /employees/:id` com `bankData` desmascarado | ✅ | Permissão dedicada `bankData.view` | ❌ | ❌ |

**Subscription Tiers:** N/A no MVP (V3 não tem tiers ainda).

**Integration List (delta):**
- Tirvu (xlsx export, manual push) — descrito em Domain Requirements
- BullMQ (job queue) — interno
- VacationEngine (interno)
- AuditLog (interno)

**Compliance Reqs:** já cobertos em Domain-Specific Requirements (LGPD + CLT).

### Implementation Considerations

**Frontend (Next.js):**
- Página em `frontend-web/src/app/admin/imports/employees/page.tsx` e `frontend-web/src/app/settings/imports/employees/page.tsx`
- Componente compartilhado `frontend-web/src/components/imports/ImportEmployeesFlow.tsx` recebendo prop `mode: 'admin' | 'tenant'` e `tenantId?: string`
- Estado da máquina: usar `useReducer` simples (4 estados: upload, preview, applying, done) — sem state machine library externa
- API client estende [api-client.ts](frontend-web/src/lib/api-client.ts) com 4 endpoints: `uploadImport`, `getPreview`, `applyImport`, `getStatus`, `getReport`

**Backend (Fastify):**
- Rotas em `backend-api/src/routes/api/v1/imports/` (TenantAdmin) e `backend-api/src/routes/api/v1/admin/imports/` (SuperAdmin)
- Módulo `backend-api/src/modules/imports/` com:
  - `tirvu-parser.ts` — header detection, streaming row iteration, Zod schema das 46 colunas
  - `import-validator.ts` — validação por linha (CPF, datas, enums)
  - `import-matcher.ts` — match `(tenantId, cpf)` + `tirvuId`, diff field-by-field
  - `import-applier.ts` — cria/atualiza Employees, dispara VacationEngine, escreve AuditLog
  - `import-job.ts` — worker BullMQ (queue `imports`, concurrency 2)
  - `import-report.ts` — gera .xlsx de erros
  - `bank-data-encryption.ts` — wrapper AES-256-GCM
- Migration Prisma: campos novos em `Employee` (`tirvuId`, `personalData`, `address`, `bankData`, `unionName`, `geofencingFlags`, `inactivePending`, `terminationDate`)

**Bibliotecas adicionais:**
- Backend: `xlsx` (parser, já existe no node_modules), `bullmq` (já), `crypto` nativo (encryption)
- Frontend: `react-dropzone`, `@tanstack/react-virtual`, `xlsx` (gerar `.xlsx` de erros opcionalmente client-side ou só consumir do server)

**Storage de arquivos originais:**
- MVP: armazenar no FS do container backend em `/var/imports/{tenantId}/{importJobId}.xlsx` com retenção 90d (cron de limpeza). Hash SHA-256 em `ImportJob` model.
- Futuro: S3/MinIO quando a infra escalar.

**Novo modelo Prisma — `ImportJob`:**
- Persistir cada job de import como row no banco (não só na fila BullMQ que é volátil)
- Campos: `id`, `tenantId`, `operatorUserId`, `status` (PENDING/PARSING/PREVIEW_READY/APPLYING/COMPLETED/FAILED/CANCELLED), `filename`, `fileHash`, `fileSize`, `previewSummary` (JSON), `result` (JSON), `errorReportPath`, `createdAt`, `appliedAt`, `completedAt`

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** **Problem-solving MVP** — entregar o fluxo completo de importação de ponta-a-ponta para 1 formato (Tirvu), 2 personas (SuperAdmin + TenantAdmin), com idempotência e auditoria. Não vamos diluir o MVP em "metade do fluxo" ou "só o parser sem preview" — o valor existe **somente** no fluxo completo.

**Por quê não outras filosofias:**
- ❌ *Experience MVP* (caprichar UX antes de funcionar): UX já está modelada, mas a feature falha se quebra a base — funcionalidade vem antes de polish.
- ❌ *Platform MVP* (suporte multi-formato genérico): paridade com Tirvu já destrava 95% dos casos (Green House + clientes do nicho de terceirização). Genérico fica para Growth.
- ❌ *Revenue MVP* (cobrar por uso): import faz parte do core onboarding; cobrar bloqueia adoção.

**Resource Requirements:**
- 1 dev backend (Bruno ou contratado): parser, validador, matcher, applier, job, encryption, migration, testes — ~5 dias
- 1 dev frontend (Bruno ou contratado): 4 estados de UI, dropzone, tabela virtualizada, polling de status, modais — ~3 dias
- Sobreposição: testes de integração + polish + documentação — ~2 dias
- **Total estimado:** ~10 dias úteis (1 sprint focado, equivalente ao ritmo dos sprints 1-6 já entregues)

### MVP Feature Set (Phase 1) — entrega como 1 sprint

**Core user journeys cobertas no MVP:**
- ✅ Journey 1A — SuperAdmin bootstrap happy path (Bruno onboarda Servi-Plus)
- ✅ Journey 1B — SuperAdmin edge case "subi planilha errada" (banner + modal de confirmação previnem)
- ✅ Journey 2A — TenantAdmin reimport mensal (idempotência + detecção ausentes sem auto-inativar)
- ⚠️ Journey 3A — Suporte investiga falha: parcialmente. **MVP entrega:** logging estruturado BullMQ + relatório baixável detalhado por linha. **Out-of-MVP:** UI `/admin/imports/history` (entra em Phase 2)

**Must-have capabilities (lista travada):**

1. **Parser Tirvu hardcoded** das 46 colunas com header detection
2. **Validação por linha:** CPF (formato + dígito), datas dd/MM/yyyy, status enum, campos obrigatórios
3. **Match idempotente:** `(tenantId, cpf)` primário + `(tenantId, tirvuId)` secundário
4. **Diff field-by-field** em updates
5. **Detecção de Workplaces novos** com opção [Criar todas] [Mapear para existentes]
6. **2 rotas autenticadas:** `/admin/imports/employees` + `/settings/imports/employees`
7. **Banner persistente do tenant alvo** (SuperAdmin) + modal de confirmação repetindo nome
8. **Job assíncrono BullMQ** dedicado, polling 2s pelo client
9. **Tabela de preview virtualizada** (até 5k linhas) com filtros por status
10. **Aplicação com chunks de 100 linhas** + falha parcial graciosa
11. **Relatório de erros .xlsx** baixável (linhas inválidas + coluna motivo)
12. **AuditLog por linha** agrupado por `importJobId`
13. **Modelo Prisma `ImportJob`** persistido (status, fileHash, previewSummary, result)
14. **Migration de Employee:** `tirvuId`, `personalData`, `address`, `bankData` (encrypted), `unionName`, `geofencingFlags`, `inactivePending`, `terminationDate`
15. **Encryption AES-256-GCM** de `bankData` em repouso
16. **Mascaramento de bankData** em listagens default + permissão dedicada `bankData.view`
17. **Cálculo automático de saldo CLT** via VacationEngine ao criar Employee
18. **Storage do arquivo original** em FS (`/var/imports/{tenantId}/{jobId}.xlsx`) + hash SHA-256, retenção 90d
19. **Detecção de ausentes** com flag `inactivePending` (nunca auto-inativa)
20. **Testes:** unit (parser, validator, matcher, encryption), integration (end-to-end com fixture Tirvu), idempotência (subir 2× = 0 changes)

### Post-MVP Features

**Phase 2 — Growth (3-6 sprints pós-launch):**
- **UI `/admin/imports/history`** com lista de jobs, filtros, re-download de relatório, ver diff aplicado
- **H2 — Sync agendada Tirvu:** cron por tenant, configuração de fonte (SFTP/email/upload manual), regras de auto-aprovação
- **Wizard de mapeamento custom** para clientes que não usam Tirvu (paridade Pontomais/Tangerino)
- **Importação de outras entidades:** Workplaces standalone, Positions, Allocations
- **Notificações de conclusão** (email + WhatsApp) ao SuperAdmin
- **Edição inline no preview:** corrigir CPF inválido sem refazer no Excel
- **Reverter import:** botão na UI de history que desfaz um job aplicado (somente SuperAdmin, com janela de tempo limitada)
- **SSE/WebSocket** para progresso real-time (substituindo polling) quando volume justificar

**Phase 3 — Expansion (visão futura, sem prazo):**
- **Conector nativo Tirvu via API** (se Tirvu expuser API REST/GraphQL)
- **Multi-source merge** (Tirvu + sistema X com regras de prioridade)
- **AI-assisted mapping** (LLM detecta layout de qualquer planilha desconhecida)
- **Marketplace de conectores** para terceiros plugarem seus sistemas-fonte
- **Sync bidirecional** GestaoFerias → Tirvu (mudanças no GestaoFerias atualizam Tirvu)
- **Layout eSocial-ready:** envio direto a eSocial a partir dos dados importados
- **Importação batch via API pública** (operação programática para clientes enterprise)

### Risk Mitigation Strategy

> Esta seção foca em riscos de **execução** (técnico, mercado, recurso) específicos da entrega do MVP. A seção [Domain-Specific Requirements > Risk Mitigations](#domain-specific-requirements) tem a tabela completa de **riscos de negócio/compliance** (vazamento cross-tenant, LGPD, mudança de layout, idempotência, etc.) — não duplicados aqui.

**Technical Risks:**

| Risco técnico | Mitigação MVP | Plano B |
|---|---|---|
| Layout Tirvu mudar inesperadamente | Validação rigorosa de header → rejeição com mensagem clara; parser versionado (`tirvuParserV1`) | Patch rápido + nova migration de versão; fallback para wizard manual em Phase 2 |
| Performance ruim em planilhas >2k linhas | Streaming de parse + chunks de 100 linhas + benchmark fixture com 5k linhas no CI | Aumentar concurrency BullMQ; quebrar arquivo em sub-jobs |
| Encryption mal implementada (LGPD) | AES-256-GCM padrão node `crypto`; auditoria de PR específica para `bank-data-encryption.ts`; testes que verificam round-trip e que dados não saem cleartext em logs | Revisão externa pré-launch (security review já existe como skill `/security-review`) |
| BullMQ travado em produção | Timeout 15min auto-fail; worker dedicado isolado dos workers de email/whatsapp; restart automático via PM2/Docker | Endpoint admin manual para marcar job como falho |
| Race condition em updates concorrentes (2 imports simultâneos) | Lock no banco via transação por chunk + unique constraint `(tenantId, cpf)` | Fila serializada por tenant (concurrency 1 por tenant) se aparecer no QA |

**Market Risks:**

| Risco de mercado | Mitigação MVP | Aprendizado validador |
|---|---|---|
| Bruno descobre que Tirvu não é o sistema dominante entre os prospects | Hardcode atual atende 100% Green House; parser modular permite adicionar Pontomais/Tangerino em <2 sprints (Phase 2) | Conversar com 3 prospects nos primeiros 30 dias pós-launch sobre sistema-fonte |
| Cliente quer importar outro tipo de dado primeiro (pontos, postos, contratos) | Out-of-scope MVP, mas a arquitetura modular (parser + validator + applier separados) permite reuso para outras entidades | Métrica: % de prospects que pedem import além de colaboradores |
| Concorrente lança feature similar | D1 (zero-config Tirvu) e D3 (multi-tenant safe by design) são vantagem de execução, não barreira intransponível — mantida pela velocidade de iteração | N/A — ritmo de release |

**Resource Risks:**

| Risco de recurso | Mitigação MVP | Plano B |
|---|---|---|
| Bruno trabalha solo + tempo curto (1-2 semanas) | Escopo travado em 20 must-haves discretos, sem feature creep; cada item tem critério de aceitação claro | Cortar primeiro: edição inline (out-of-scope), encryption custom (usar lib pronta como `@aws-crypto`), polling visual frequente (default 5s em vez de 2s) |
| Falta de tempo de QA antes de subir produção | Ativar feature flag `imports.enabled=false` por tenant; rollout gradual começando pela Green House (tenant do Bruno) | Beta privado com 1 tenant antes de liberar para todos |
| Bug crítico em produção pós-launch | Feature flag permite desligar instantaneamente; AuditLog permite identificar dados afetados; retenção do arquivo original (90d) permite re-importar após fix | Plano de rollback documentado (DELETE por `importJobId`) |

## Functional Requirements

> **Capability Contract:** lista vinculante. Qualquer feature não listada aqui não existe no produto final do MVP a menos que seja adicionada explicitamente. Capability areas: 8.

### 1. File Upload & Format Validation

- **FR1:** SuperAdmin can upload a Tirvu spreadsheet (.xlsx) targeting any active tenant of choice.
- **FR2:** TenantAdmin can upload a Tirvu spreadsheet (.xlsx) targeted automatically to their own tenant (no cross-tenant possibility).
- **FR3:** The system can reject any file whose extension is not `.xlsx` and notify the operator with a clear error message.
- **FR4:** The system can reject any file exceeding the configured size limit and notify the operator with the actual size and the limit.
- **FR5:** The system can detect whether the uploaded spreadsheet conforms to the expected Tirvu header schema (46 known columns) and reject non-conforming files with a clear message instructing the operator to use the standard Tirvu export.
- **FR6:** The system can persist the original uploaded file (with a content hash) and retain it for the configured audit window.

### 2. Tenant Targeting & Authorization

- **FR7:** SuperAdmin can select the target tenant explicitly before uploading any file (no implicit default).
- **FR8:** The system can prevent any operator other than SuperAdmin from importing into a tenant other than their own JWT-bound tenant, enforced at the backend level (not only in the UI).
- **FR9:** The system can display the target tenant name persistently in the UI throughout the entire import flow (upload → preview → applying → done) for SuperAdmin operations.
- **FR10:** The system can require an explicit confirmation step before applying an import, restating the target tenant name and a summary of changes to be made.

### 3. Parsing, Validation & Diff Preview

- **FR11:** The system can parse all 46 columns of a valid Tirvu file row by row and map each row to a normalized employee record.
- **FR12:** The system can validate each row independently (CPF format and check digit, dates in dd/MM/yyyy, status enum, mandatory fields) and assign it a row-level status: valid-create / valid-update / invalid / no-change.
- **FR13:** The system can detect whether each row is a new employee (create) or an existing one (update) based on a primary match key `(tenantId, cpf)` and a secondary match key `(tenantId, tirvuId)`.
- **FR14:** The system can compute a field-by-field diff for each row classified as update, showing previous and new values for changed fields only.
- **FR15:** The system can detect existing system employees that are absent from the uploaded spreadsheet (only relevant for re-imports) and label them as "candidates for inactivation" without ever inactivating them automatically.
- **FR16:** The system can detect Lotação values in the spreadsheet that do not yet exist as Workplaces in the target tenant and present them to the operator for explicit decision (create-all or skip).
- **FR17:** Operator can review a paginated, virtualized table of all parsed rows with their row-level status before applying the import.
- **FR18:** Operator can filter the preview table by row-level status (all / create / update / invalid / absent / no-change).
- **FR19:** Operator can cancel the import at the preview stage with zero side effects on persisted data.

### 4. Apply (Asynchronous Job Execution)

- **FR20:** Operator can trigger application of the import after reviewing the preview, which enqueues an asynchronous job.
- **FR21:** The system can process the application of the import asynchronously without blocking the operator's session or UI.
- **FR22:** The system can apply the import in chunks, persisting valid rows to the database while skipping invalid rows, even if some chunks fail.
- **FR23:** The system can create new Workplaces for any Lotação values the operator confirmed for creation, scoped to the target tenant.
- **FR24:** The system can trigger CLT vacation balance computation for every newly created employee using the existing VacationEngine, derived from `hireDate`.
- **FR25:** The system can mark employees absent from the current spreadsheet (when operator chose so) with a `inactivePending` flag for human review, never deactivating them automatically.
- **FR26:** The system can guarantee idempotency: re-running the same import on an unchanged dataset produces zero modifications.

### 5. Progress, Status & Result Reporting

- **FR27:** Operator can observe near-real-time progress of the apply phase (rows processed of total, current chunk, elapsed time).
- **FR28:** Operator can see a final summary upon completion: counts of created, updated, invalid, absent (flagged), Workplaces created, total elapsed time.
- **FR29:** Operator can download an .xlsx report containing only the invalid rows from the most recent import attempt, including a "motivo do erro" column with the validation reason for each row.
- **FR30:** Operator can navigate from the completion screen to the populated employees list (filtered by the target tenant when applicable).

### 6. Auditing & Traceability

- **FR31:** The system can record an `AuditLog` entry for every row affected by an import (create, update, invalid, absent-flag), grouped by a unique `importJobId`.
- **FR32:** The system can persist each import job as a database record (`ImportJob`) with status, target tenant, operator user, file hash, file size, preview summary, final result, and timestamps for each lifecycle transition.
- **FR33:** The system can capture the IP address and user agent of the operator at the time of upload and apply.
- **FR34:** The system can preserve the original file plus its SHA-256 hash for the configured retention window so disputed imports can be reconstructed.

### 7. Privacy, Security & Compliance

- **FR35:** The system can store sensitive bank-related fields (PIX type, PIX key, bank, account type, branch, account number) encrypted at rest.
- **FR36:** The system can mask bank-related fields by default in any employee listing or detail view, displaying decrypted values only when the operator holds the dedicated `bankData.view` permission.
- **FR37:** The system can prevent bank-related fields from being written to application logs or surfaced in error messages.
- **FR38:** The system can require the dedicated `import.run` permission for any import action, separately from generic admin permissions.
- **FR39:** The system can preserve the soft-delete model (flag `inactive=true` + `terminationDate`) for employees who are deactivated, supporting the legal retention period for labor records.

### 8. Schema Extension for Imported Employee Data

- **FR40:** The system can persist a Tirvu external identifier (`tirvuId`) per employee, unique within a tenant, enabling secondary matching during re-imports even when CPF was previously corrected.
- **FR41:** The system can persist a structured set of personal data fields not previously stored (PCD flag, deficiency description, gender, RG number/issuer/issue-date, PIS/PASEP, CTPS number/series, parent names, termination date).
- **FR42:** The system can persist a structured address record per employee (zip code, street, number, complement, neighborhood, state, city).
- **FR43:** The system can persist union name per employee.
- **FR44:** The system can persist geofencing flags per employee (`outsideFence`, `noGeo`).
- **FR45:** The system can persist a `inactivePending` flag per employee, set by the import flow when the operator marks absent employees, and cleared upon manual review in the employees admin UI.

## Non-Functional Requirements

> Quality attributes obrigatórios. Cada NFR é mensurável e tem critério de teste explícito. Categorias não-relevantes (i18n, mobile-first, offline) propositadamente omitidas.

### Performance

- **NFR1 — Tempo de upload + parse + preview:** para arquivos contendo até 1.000 linhas, do clique em "Aplicar upload" até a tela de Preview totalmente renderizada **≤30s** (P95). Para 5.000 linhas: **≤90s** (P95). Medido no banco de dados de produção em condições normais (não em pico).
- **NFR2 — Tempo de aplicação assíncrona:** job BullMQ aplica 5.000 linhas em **≤5min** wall-clock (P95). Para 1.000 linhas: **≤2min** (P95). Falhas parciais não estendem o tempo total.
- **NFR3 — Latência percebida da página inicial:** `/admin/imports/employees` e `/settings/imports/employees` carregam em **≤500ms** TTFB + **≤1.5s** Largest Contentful Paint, sem dados pré-existentes (medido com Chrome DevTools throttling "Fast 3G" → opcional, mas LCP ≤1.5s em rede normal é mandatório).
- **NFR4 — Polling de status:** intervalo de polling do client = **2s** durante estado "applying"; cada request `GET /imports/:jobId/status` responde em **≤200ms** (P95).
- **NFR5 — Renderização da tabela virtualizada:** scroll a **60fps sustentados** (= ≤16ms por frame) com 5.000 rows e até 10 colunas visíveis por linha. Filtros aplicáveis em **≤100ms** (sem chamada de servidor — filtragem 100% client-side em cima do JSON do preview).
- **NFR6 — Memória do worker:** consumo de RAM por job worker durante parse + applying não excede **512MB** para arquivos de até 5.000 linhas (parsing em streaming + chunks de 100 rows).
- **NFR7 — Bundle JS:** o bundle adicional desta feature no client soma **≤80kb gzipped** ao baseline V3.

### Security

- **NFR8 — Encryption at rest:** todos os campos da estrutura `bankData` (PIX type, PIX key, bank, account type, branch, account number) gravados em coluna(s) com criptografia simétrica **AES-256-GCM** com IV único por registro. Chave mestra obtida de variável de ambiente `BANK_DATA_ENCRYPTION_KEY` (mínimo 256 bits) ou KMS quando disponível.
- **NFR9 — Encryption in transit:** TLS 1.2+ obrigatório em todas as requests (já garantido pelo Traefik em produção). Upload via HTTP simples = rejeitado.
- **NFR10 — Tenant isolation enforcement:** **0 vazamentos cross-tenant** em testes automatizados de penetração que rodam no CI antes de cada deploy. Suite de testes inclui: TenantAdmin tentando acessar `/admin/imports/*`, TenantAdmin tentando manipular `tenantId` no payload, SuperAdmin com tenant inválido/inativo.
- **NFR11 — Permissão dedicada:** ações de import requerem permissão `import.run`; visualização de `bankData` desmascarado requer permissão separada `bankData.view`. Nenhuma ação cai em fallback de "admin generalista".
- **NFR12 — Log sanitization:** middleware de logging remove campos da lista negra (`bankData.*`, `personalData.rg`, `personalData.pisPasep`, `cpf` exceto últimos 3 dígitos) **antes** da emissão. Validado por teste que dispara um job e grep nos logs para padrões dos dados sensíveis (deve dar 0 matches).
- **NFR13 — File integrity:** hash SHA-256 do arquivo original armazenado em `ImportJob.fileHash` e validado em qualquer recuperação posterior do arquivo (detecta corrupção do storage).
- **NFR14 — Rate limiting:** endpoint de upload limitado a **5 requests/min/operador** para conter abuso ou erro de loop.

### Scalability

- **NFR15 — Concurrency BullMQ:** worker dedicado da fila `imports` opera com **concurrency=2** (2 jobs simultâneos por worker, dimensionável). Não compete com workers de email/whatsapp.
- **NFR16 — Tenant fairness:** quando há múltiplos jobs enfileirados de tenants distintos, o scheduler intercala (não FIFO global puro) para que 1 tenant pesado não bloqueie os demais. Implementação: 1 job por tenant em paralelo no MVP (lock por `tenantId`).
- **NFR17 — Volume alvo:** suportar até **5.000 linhas por arquivo** no MVP. Para arquivos maiores, o upload é rejeitado com mensagem orientando dividir em múltiplos arquivos (Phase 2 desbloqueia >5k via streaming aggressive).
- **NFR18 — Crescimento de tenants:** arquitetura suporta até **100 tenants ativos** sem degradação medível de Performance (NFR1-NFR4) — atual base da Green House e prospects de curto prazo cabem com folga.
- **NFR19 — Storage do arquivo original:** capacidade de armazenar imports cumulativos no FS local equivale a **~5GB por mês** (estimativa: 50 imports/mês × 10MB médio × retenção 90d × 100 tenants → ~150GB total no pior caso). Plano: monitoramento de disco; migração para S3 se ultrapassar 80% da capacidade do volume.

### Accessibility

- **NFR20 — WCAG 2.1 nível AA:** mínimo. Validado com testes automatizados (axe-core no Playwright) + revisão manual antes do launch.
- **NFR21 — Navegação por teclado:** todos os elementos interativos (dropdown tenant, botão upload, dropzone, filtros da tabela, paginação, botões de ação, modais) navegáveis somente com Tab/Shift+Tab/Enter/Esc, com foco visível (outline ≥2px com contraste ≥3:1).
- **NFR22 — Status colors com redundância:** estados (verde=criar, azul=atualizar, vermelho=inválido, amarelo=ausente) sempre acompanhados de **ícone + label de texto**, nunca apenas cor. Validado em teste de simulação de daltonismo.
- **NFR23 — Banner do tenant alvo:** marcado com `role="alert"` + `aria-live="assertive"` para que leitores de tela anunciem ao mudar de tenant. O nome do tenant aparece em texto visual claro (tamanho ≥18px, contraste ≥7:1 — AAA para esse elemento crítico).
- **NFR24 — Modal de confirmação:** foco preso (focus trap) dentro do modal; primeiro elemento focado = botão "Cancelar" (default seguro); Esc fecha o modal sem aplicar; botão "Confirmar" requer 2 clicks (1 abre modal, 1 confirma) — não execução acidental por Enter rápido.

### Integration

- **NFR25 — Tirvu format compatibility:** parser identifica e processa o layout padrão Tirvu de **46 colunas, sheet única "Plan1"**, com tolerância a:
  - Variações de capitalização nos nomes das colunas (case-insensitive)
  - Espaços extras antes/depois dos valores
  - Linhas em branco no fim do arquivo
  - Valores `null` em colunas opcionais
- **NFR26 — Versionamento do parser:** parser identificado como `tirvu-parser-v1`. Quando o layout Tirvu mudar, novo parser `v2` é adicionado sem quebrar o `v1` (estratégia de detecção e fallback).
- **NFR27 — VacationEngine integration:** ao criar Employee, dispara cálculo de saldo CLT via API interna do `VacationEngine`. Falha do engine **não falha o import** — Employee é criado, log de warning é emitido, retry agendado em background (job separado).
- **NFR28 — AuditLog throughput:** sistema gera até **5.000 entradas de AuditLog em ≤30s** sem degradação medível. Inserção em batch (não 1×1).

### Reliability

- **NFR29 — Job failure handling:** job BullMQ travado sem progresso por **>15min** é automaticamente marcado como `FAILED`; AuditLog registra; operador é notificado na UI; arquivo original preservado para retry manual.
- **NFR30 — Transactional chunks:** aplicação em chunks de **100 linhas em transação Postgres**. Falha em 1 chunk não rollback total — registra erro nas linhas do chunk, prossegue para o próximo. Garantia: estado consistente a qualquer momento (não há "meio-row" gravada).
- **NFR31 — Idempotency guarantee:** subir o mesmo arquivo 2× consecutivas = **0 modificações no segundo upload** (verificado por teste automatizado no CI com fixture Tirvu).
- **NFR32 — Disponibilidade:** a feature herda a SLA do GestaoFerias (sem SLA formal hoje, alvo informal **≥99%** uptime). Falha no módulo de import não causa downtime do sistema completo (módulo isolado, errors handled localmente).
- **NFR33 — Recoverability:** após falha de job, operador pode re-tentar usando o mesmo arquivo (`ImportJob.errorReportPath` aponta para .xlsx que pode ser re-uploaded após correção). Sem perda de progresso já aplicado (idempotência).

### Observability

- **NFR34 — Logging estruturado:** todos os jobs emitem logs JSON com `importJobId`, `tenantId`, `operatorUserId`, `phase` (parse/validate/apply), `rowsProcessed`, `errors`. Padrão Pino (já usado no V3).
- **NFR35 — Métricas de telemetria:** histograma de duração por fase (parse/validate/apply), counter de jobs por status (success/failed/cancelled), gauge de jobs em fila. Endpoint `/metrics` em formato Prometheus (futuro — MVP só logs).
- **NFR36 — Auditabilidade trabalhista:** retenção do arquivo original + AuditLog garantem reconstrução de "quem subiu o quê quando" para qualquer disputa trabalhista por **5 anos** (alinhado com prazo legal). Implementação MVP: 90 dias no FS + cron de migração para storage de longo prazo (S3 quando disponível) em Phase 2.
