---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation (skipped — corrective arch, no genuine innovation signals)
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
status: 'complete'
completedAt: '2026-05-04'
classification:
  projectType: "SaaS Web App multi-tenant (Next.js + Fastify API)"
  domain: "Workforce Management / HR-Tech (terceirização de mão de obra)"
  complexity: "high"
  projectContext: "brownfield"
discoveryAnswers:
  reconciliationWindow: "online (sem janela de manutenção)"
  tenantScope: "multi-tenant (todos os tenants atuais e futuros)"
  breakingChangeAllowed: "OK tornar Employee.workplaceId NOT NULL após reconciliação"
inputDocuments:
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/prd.md
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/epics.md
  - _evo-output/planning-artifacts/v3-2-import-tirvu/prd.md
  - _evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md
  - _evo-output/planning-artifacts/v3-2-import-tirvu/epics.md
  - CLAUDE.md
workflowType: 'prd'
feature: 'v3-3-reconciliacao-postos'
---

# Product Requirements Document - gestao-ferias

**Feature:** Reconciliação Postos×Funcionários (V3.3)
**Author:** Bruno
**Date:** 2026-05-04

## Table of Contents

1. [Executive Summary](#executive-summary) — problema, solução, insight central
2. [Project Classification](#project-classification) — tipo, domínio, complexidade, decisões fixadas
3. [Success Criteria](#success-criteria) — user/business/technical success + métricas mensuráveis
4. [User Journeys](#user-journeys) — Bruno (operador), Carla (DevOps), Marcos (super-admin), Sistema (importer)
5. [Domain-Specific Requirements](#domain-specific-requirements) — CLT, LGPD, riscos × mitigações
6. [SaaS B2B Specific Requirements](#saas-b2b-specific-requirements) — tenant model, RBAC, integrações
7. [Project Scoping & Phased Development](#project-scoping--phased-development) — Phase 1 (MVP), Phase 2 (Growth), Phase 3 (Vision/V3.4+)
8. [Functional Requirements](#functional-requirements) — 45 FRs em 9 áreas (capability contract)
9. [Non-Functional Requirements](#non-functional-requirements) — 31 NFRs em 6 categorias mensuráveis

## Executive Summary

A V3.0 entregou em produção um motor de cobertura inteligente (gaps, sugestões de feristas, encadeamento, KPIs, AI preditiva) que depende integralmente do grafo relacional `Employee → WorkplaceAllocation → WorkplacePosition → Workplace`. Em produção (`ferias.unibot.com.br`), esse grafo está vazio: 108 postos importados exibem `0/0 alocados/necessários` e `0 posições` apesar de centenas de colaboradores cadastrados. Causa raiz confirmada por inspeção de código: o importador Tirvu (V3.2) grava apenas o campo legado `Employee.workplace` (string) e nunca popula `Employee.workplaceId` (FK), `WorkplacePosition` ou `WorkplaceAllocation`; o importador de Postos cria `Workplace` mas só gera posições se a planilha trouxer coluna `positionRole`. Resultado: o motor de cobertura, predição de risco CLT e forecast de intermitentes operam sobre dados fantasmas — o produto parece funcional mas é um cascarão nos módulos que mais geram valor.

V3.3 reconcilia o legado ao modelo relacional **em produção, sem janela de manutenção**, e fecha o ciclo arquitetural deixado em aberto pela V3.2: importadores passam a operar sobre o grafo completo, o campo legado é deprecado em fases (reconcile → NOT NULL → drop) e a integridade futura é protegida por constraints e telemetria de import. O escopo é multi-tenant desde o dia um — a vacina vale para todos os tenants atuais e futuros.

### What Makes This Special

Esta não é uma feature de produto, é uma **correção arquitetural com poder de destravamento**: ao popular o grafo relacional, todos os módulos V3 que dependiam dele (cobertura, AI, predict, aprovações com sugestão) **passam a funcionar sem nenhuma alteração no código deles**. O ROI é desproporcional ao escopo — uma única feature corretiva ressuscita 4 módulos já entregues.

**Insight central:** *importadores que escrevem apenas em campos legados são bombas-relógio*. Toda importação deve, por contrato, criar/atualizar o modelo relacional completo; campos string-only que duplicam relações são uma anti-pattern que esconde lacunas até a feature dependente ser usada em campo. V3.3 codifica esse contrato como princípio de integração para o resto do produto.

**Diferenciação operacional:** reconciliação retroativa **online** (sem manutenção), com matching determinístico + fila de revisão para não-matches, auto-criação controlada de `Workplace`/`WorkplacePosition` padrão e auditoria por delta de relações (não só por linhas processadas). Tudo idempotente e reversível antes do drop final do campo legado.

## Project Classification

| Dimensão | Valor |
|---|---|
| **Project Type** | SaaS Web App multi-tenant (backend Fastify + frontend Next.js) |
| **Domain** | Workforce Management / HR-Tech (terceirização de mão de obra, compliance CLT) |
| **Complexity** | Alta — multi-tenant strict, regras CLT, AI multi-provider, integrações externas (ZapSign, Evolution, SMTP), pool de credenciais, auditoria, master key |
| **Project Context** | Brownfield — épico corretivo V3.3 sobre V3.0 (postos+cobertura) e V3.2 (importer Tirvu) já em produção |
| **Janela de execução** | Online (sem manutenção) |
| **Escopo de tenant** | Multi-tenant (todos atuais e futuros) |
| **Breaking change permitido** | Sim — `Employee.workplaceId` pode virar NOT NULL após reconciliação |

## Success Criteria

### User Success

Os usuários da feature são **operadores RH/admin** dos tenants (ex.: Bruno na Green House) e, indiretamente, qualquer ator dos módulos V3 (cobertura, predict, aprovações). Sucesso para eles:

- **Tela `/workplaces` deixa de mentir.** Em produção, ≥ 95% dos postos com colaboradores históricos passam a exibir contadores reais de `alocados/necessários` e `posições` correspondentes ao que o operador reconhece como verdade. Os 5% restantes aparecem em uma fila de revisão clara, não em silêncio.
- **Aha-moment do operador:** ao abrir `/coverage` pela primeira vez após o deploy V3.3, o painel de gaps e sugestões mostra dados reais — feristas, intermitentes e KPIs deixam de retornar listas vazias.
- **Importações futuras param de gerar inconsistência silenciosa.** O operador que sobe nova planilha Tirvu vê no relatório de import quantas alocações foram criadas/encerradas e quantos workplaces novos foram inferidos — não apenas \"X linhas processadas\".
- **Não-matches são tratados, não escondidos.** Quando o nome de posto na planilha de funcionários não bate com nenhum `Workplace`, o operador recebe uma fila de revisão na UI com 3 opções por linha: \"vincular ao posto X\" (sugestão fuzzy), \"criar novo posto\" ou \"ignorar\".

### Business Success

- **Destravar 4 módulos V3 já entregues** (cobertura, AI predict, forecast intermitentes, aprovações com sugestão de cobertura) sem nova feature de produto. ROI: uma única feature corretiva ressuscita ~30% do roadmap V3 que está hoje inerte em produção.
- **Reduzir tempo de onboarding de novos tenants** que usam Tirvu: de \"importar e configurar manualmente cada alocação\" para \"importar e revisar exceções\". Meta qualitativa: tenant entra em produção operacional em **1 sessão de import** em vez de N sessões manuais.
- **Eliminar dívida arquitetural V3.2.** Fechar o débito explícito antes que cause incidente em cliente real (Green House começar a usar cobertura e descobrir o cascarão).
- **Vacinar contra reincidência.** Princípio \"importadores escrevem no grafo relacional, não em campos legados\" passa a ser regra de aceitação para próximos importers (futuros formatos além Tirvu).

### Technical Success

- **Reconciliação retroativa idempotente.** Rodar o job 1, 2 ou N vezes produz o mesmo resultado final. Sem duplicação de `WorkplaceAllocation`. Sem corrupção em re-execuções.
- **Online, sem downtime.** Job executa enquanto produção atende usuários. Sem locks longos. Transações curtas, em lote (ex.: 100 employees por batch).
- **Multi-tenant isolado.** Job aceita `--tenantId` (ou \"all\"), respeita extension Prisma de tenant isolation, nunca vaza dados cross-tenant.
- **Auditável.** Cada alocação criada pelo job registra `AuditLog` com `reason: \"V3.3_RECONCILE\"` e `previousData`/`newData`. Cada não-match registra entrada em fila de revisão persistida.
- **Migração de schema em fases controladas:**
  1. Adicionar índice em `workplaces (tenant_id, lower(name))` para matching.
  2. Reconcile retroativo (cria FKs e Allocations).
  3. Importers V3.3 escrevem no grafo relacional.
  4. UI passa a sinalizar empregados sem `workplaceId`.
  5. `Employee.workplaceId` vira NOT NULL para `status='ATIVO'` (CHECK constraint, não NOT NULL absoluta — INATIVO/AFASTADO podem não ter posto).
  6. Em release futura: rename `Employee.workplace` → `Employee.legacyWorkplace` (mantido para auditoria histórica) e drop em V3.4.
- **Cobertura de teste.** Suite atual (347 verde) mantém-se verde; novos testes cobrem: matcher determinístico, matcher fuzzy com tie-break, idempotência do job, criação automática de Workplace via importer, gravação de Allocation pelo importer, política de não-match.

### Measurable Outcomes

| Métrica | Antes (atual) | Depois (V3.3) |
|---|---|---|
| Postos exibindo `0/0 alocados/necessários` em `/workplaces` (Green House) | 108 / 108 (100%) | ≤ 5% (apenas postos legitimamente vazios) |
| `WorkplaceAllocation` total no tenant Green House | 0 | ≥ 1 por colaborador ATIVO com `workplace` string preenchido |
| Empregados ATIVOS com `workplaceId NULL` | ~100% | ≤ 5% (em fila de revisão) |
| Sugestões retornadas por `/coverage` quando há gap real | 0 | ≥ 1 quando existir candidato elegível |
| Novos imports Tirvu que deixam grafo inconsistente | 100% | 0% |
| Tempo de execução do reconcile por tenant Green House (~108 postos, ~500 employees est.) | n/a | < 5 min total, online |
| Suite de testes | 347 verde | ≥ 350 verde (novos casos cobrindo matcher/idempotência) |

## Product Scope

> **Resumo do escopo em três camadas.** O detalhamento operacional (Phase 1 must-haves, fora-de-MVP, riscos, contingências) está em [Project Scoping & Phased Development](#project-scoping--phased-development).

| Phase | Quando | Foco | Itens-chave |
|---|---|---|---|
| **Phase 1 — MVP** | Release V3.3.0 | Produção honesta + importers fixos | Job retroativo idempotente, `WorkplaceAllocationService` único, fix Tirvu/Postos, fila de revisão, AuditLog, migration aditiva, testes |
| **Phase 2 — Growth** | Release V3.3.1+ | Endurecer e ampliar | Constraint NOT NULL condicional, batch super-admin, painel \"Saúde dos Postos\", fuzzy automático opcional, drift detection, política de import por contrato |
| **Phase 3 — Vision** | V3.4+ | Evolução estratégica | Deprecação/drop de `Employee.workplace`, `WorkplacePosition` rico (shifts/qualifications), histórico time-series, plugin architecture de importers |

## User Journeys

### Persona 1 — Bruno (Operador RH / Admin do Tenant Green House)

**Backstory:** Bruno cuida da gestão de mão de obra terceirizada da Green House. Importou ~108 postos e várias centenas de colaboradores via planilhas Tirvu nas últimas semanas. Vendeu internamente o módulo V3 de cobertura inteligente como o grande salto do produto, mas ao abrir `/workplaces` em produção viu tudo zerado e ficou frustrado. Teme que o sistema esteja \"furado\" e que ele tenha que refazer tudo na unha.

#### Jornada 1A — Happy path: reconciliação inicial após deploy V3.3

- **Cena de abertura:** Bruno entra em `/workplaces` na manhã do deploy. Vê o banner novo: *\"Reconciliação V3.3 disponível — vincular 487 colaboradores aos seus postos. [Iniciar]\"*. Clica.
- **Ação crescente:** Modal explicativo aparece: *\"Vamos cruzar o nome do posto que cada colaborador trouxe na importação Tirvu com seus 108 postos cadastrados. Matches automáticos serão vinculados; ambíguos vão para uma fila de revisão. Operação online, leva ~3min.\"*. Bruno clica **Executar agora**. Barra de progresso mostra batches: \"100/487, 200/487...\".
- **Clímax:** Em 2min42s o resultado aparece: *\"462 vínculos criados automaticamente · 18 em fila de revisão · 7 ignorados (status INATIVO sem posto)\"*. Bruno volta para `/workplaces` e — pela primeira vez — vê números reais: *\"INEP - Sede: 23/25 alocados, 4 posições\"*. Sente alívio físico.
- **Resolução:** Bruno entra na aba nova **Pendências de Vínculo**, resolve as 18 manualmente em 4 minutos (a UI sugere fuzzy matches: *\"Funcionário diz 'Inep Sede', você tem 'INEP - Sede' (97% similar) — Vincular?\"*). Volta para `/coverage`, abre uma sugestão de cobertura e — pela primeira vez — recebe nomes reais de feristas elegíveis. **\"Agora sim isso é um produto.\"**

> **Capacidades reveladas:** banner contextual em `/workplaces`, rota admin de execução do reconcile com progresso em tempo real, summary report visível na UI, aba \"Pendências de Vínculo\" com 3 ações por linha, sugestões fuzzy persistidas (não recalculadas a cada abertura).

#### Jornada 1B — Edge case: novo import Tirvu pós-V3.3

- **Cena:** Duas semanas depois, Bruno sobe nova planilha Tirvu com 47 colaboradores recém-contratados em 3 postos novos.
- **Ação crescente:** Como antes, fluxo de Preview. Mas agora Bruno vê um campo extra no preview: *\"3 postos novos serão criados automaticamente · 47 alocações serão criadas · 0 alocações serão encerradas\"*. Antes da V3.3, esse campo não existia.
- **Clímax:** Bruno aplica. ImportJob termina. Ele abre `/workplaces` e os 3 postos novos aparecem instantaneamente com `47/47` distribuídos. Sem fila de revisão, sem reconcile manual. **O sistema simplesmente funciona.**
- **Resolução:** Bruno percebe que importações futuras nunca mais vão deixar o sistema inconsistente. Confia.

> **Capacidades reveladas:** importer Tirvu V3.3 grava no grafo relacional; preview do ImportJob mostra delta de relações (não só linhas); auto-criação de Workplace com flag `importedBy`; idempotência ao re-importar mesma planilha não duplica allocations.

#### Jornada 1C — Edge case: matching ambíguo / não-match

- **Cena:** Durante o reconcile inicial, 6 colaboradores têm `Employee.workplace = \"INEP\"` (genérico) mas existem 3 postos: \"INEP - Sede\", \"INEP - Anexo\", \"INEP - Reserva\".
- **Ação crescente:** Reconcile não tenta adivinhar — coloca os 6 na fila com sugestões fuzzy ranqueadas (Sede 92%, Anexo 88%, Reserva 71%). Bruno vê a fila, percebe que precisa consultar a contratação interna para decidir.
- **Clímax:** Para 4 dos 6, Bruno escolhe \"INEP - Sede\" via dropdown e clica **Vincular**. Para os outros 2, ele não tem certeza e clica **Ignorar por enquanto** — eles ficam na fila com badge \"adiado\".
- **Resolução:** Voltar à fila depois é trivial — fica linkada do dashboard `/workplaces`. Bruno não perde os pendentes; o sistema lembra.

> **Capacidades reveladas:** matcher determinístico **não vincula em ambiguidade** (princípio de \"errar em silêncio é pior que esperar\"); fila persistente com estados \"pendente\" e \"adiado\"; sugestões fuzzy ranqueadas mas nunca aplicadas automaticamente sem aprovação.

---

### Persona 2 — Carla (DevOps / SRE responsável pelo deploy V3.3)

**Backstory:** Carla cuida da infra Swarm/Portainer/Traefik. Está nervosa com a migration desta release porque o usuário disse \"breaking change OK\" mas em produção 487 colaboradores estão num campo legado e qualquer downtime impacta o cliente.

#### Jornada 2 — Deploy controlado de V3.3

- **Cena:** Carla recebe o release notes: *\"V3.3 introduz reconciliação. Migration adiciona coluna nova + índice; nada destrutivo. Reconcile retroativo é manual (admin clica) — não roda automaticamente no boot. Constraint NOT NULL fica para V3.3.1 após reconcile completo em todos os tenants.\"* Respira.
- **Ação crescente:** Carla executa `npx prisma migrate deploy` na janela noturna. Migration roda em < 5s (apenas índice + coluna). Sobe a aplicação. Healthcheck verde. Abre o canal de comunicação com Bruno: *\"V3.3 no ar, abre /workplaces quando puder, vai aparecer um banner.\"*
- **Clímax:** Bruno executa o reconcile na manhã seguinte (jornada 1A). Carla observa logs: 0 erros, 487 inserções, batches respeitando limites de transação. CPU/RAM normais. Sem locks de tabela impactando outros tenants.
- **Resolução:** Após confirmação que tenant Green House está reconciliado, Carla agenda V3.3.1 (constraint NOT NULL) com confiança — sabe que não vai falhar.

> **Capacidades reveladas:** migration sem destruição (apenas aditiva); reconcile não-automático no boot (operador decide quando rodar); job em batches com transações curtas; observabilidade de progresso (logs estruturados + `ImportJob`-like record para auditoria do próprio reconcile); migration V3.3.1 separada com pré-condição validável.

---

### Persona 3 — Marcos (Super Admin que opera múltiplos tenants)

**Backstory:** Marcos é o admin global da plataforma — gerencia o tenant Green House mais 4 outros tenants menores em piloto. Quando V3.3 sobe, ele quer rodar o reconcile em todos os tenants de uma vez sem ter que entrar em cada um.

#### Jornada 3 — Reconcile multi-tenant em batch

- **Cena:** Marcos entra no painel super-admin (`/admin`), vê um card novo: *\"Reconciliação V3.3 — 5 tenants pendentes. [Executar em todos]\"*.
- **Ação crescente:** Clica e vê uma tabela: tenant-name | employees a reconciliar | postos | última execução. Marca os 5, clica \"Executar\". Modal de confirmação: *\"Vai criar ~1.200 alocações em produção. Online. Confirma?\"*. Sim.
- **Clímax:** Lista mostra cada tenant rodando em paralelo (ou serializado, conforme política): \"Green House: 462/487 ✓\", \"Cliente B: 89/89 ✓\", \"Cliente C: 14/14 ✓\"... Cada tenant termina em seu próprio tempo. Falhas (se houver) são isoladas — uma falha em Cliente D não afeta os outros.
- **Resolução:** Em 8 minutos, todos os 5 tenants reconciliados. Relatório consolidado por tenant. Marcos vê quais têm fila de revisão pendente e avisa cada operador.

> **Capacidades reveladas:** rota super-admin para reconcile em batch (`POST /admin/reconcile { tenantIds: [...] }` ou `'all'`); isolamento por tenant (falha em um não cascata); relatório consolidado; reconcile respeita Prisma extension de tenant isolation mesmo quando invocado por SUPERADMIN.

---

### Persona 4 — \"Sistema\" (Importer Tirvu rodando em background, ator não-humano)

**Backstory:** O importer Tirvu V3.2 atualmente é cego ao grafo relacional. V3.3 ensina ele a enxergar.

#### Jornada 4 — Import Tirvu pós-V3.3 (interno, sem UI)

- **Cena:** ImportJob recebe planilha com linha: `nome=João, lotacao=\"INEP - Sede\", admissao=2025-11-10`.
- **Ação crescente:** Antes de gravar `Employee`, o importer chama `WorkplaceAllocationService.upsertFromImport({ tenantId, employeeName, workplaceName, hireDate })`. O service:
  1. Resolve `Workplace` por nome no tenant. Se não existe, cria com `importedBy='AUTO_TIRVU'`.
  2. Garante `WorkplacePosition` padrão (cria se for novo Workplace).
  3. Verifica `WorkplaceAllocation` ativa do empregado. Se existe e o posto mudou: encerra (`endDate=now`, `status=ENDED`) e cria nova ACTIVE. Se mesmo posto: no-op.
- **Clímax:** Linha processada. `ImportJob.previewSummary` incrementa: `allocationsCreated++`, opcionalmente `workplacesCreated++`.
- **Resolução:** Ao final do batch, summary inclui o delta de relações. Operador (jornada 1B) vê tudo no preview antes de aplicar.

> **Capacidades reveladas:** `WorkplaceAllocationService` como service único de gravação (importers, UI manual e reconcile chamam o mesmo ponto); contrato `upsertFromImport` idempotente; gestão de transição de posto (encerrar a anterior); summary granular.

---

### Journey Requirements Summary

As 4 jornadas (3 humanas + 1 sistema) revelam o seguinte conjunto de capacidades necessárias:

| Capacidade | Jornadas que exigem | Camada |
|---|---|---|
| Banner em `/workplaces` indicando reconcile pendente | 1A | Frontend |
| Rota admin: `POST /v1/admin/reconcile` (single tenant) | 1A, 2 | Backend API |
| Rota super-admin: `POST /v1/admin/reconcile/batch` | 3 | Backend API |
| Job em batches transacionais (ex.: 100 employees/tx), idempotente | 1A, 1C, 2, 3 | Backend service |
| Matcher determinístico (case-insensitive, trim, NFC) | 1A, 4 | Backend matcher |
| Matcher fuzzy para sugestões na fila (não auto-aplica) | 1A, 1C | Backend matcher |
| Tabela `WorkplaceReconcileQueue` (ou similar) com estados | 1A, 1C | Schema |
| Aba UI \"Pendências de Vínculo\" com 3 ações | 1A, 1C | Frontend |
| `WorkplaceAllocationService.upsertFromImport()` | 1B, 4 | Backend service compartilhado |
| Auto-criação de `Workplace` com `importedBy='AUTO_*'` | 1B, 4 | Backend importer |
| Auto-criação de `WorkplacePosition` padrão (`role: Operacional`) | 1B, 4 | Backend importer + reconcile |
| `ImportJob.previewSummary` com delta de relações | 1B, 3 | Backend importer |
| Encerramento automático de `WorkplaceAllocation` em mudança de posto | 4 | Backend service |
| `AuditLog` específico (`V3.3_RECONCILE`, `IMPORT_TIRVU_ALLOCATE`) | 2, 3 | Backend auditoria |
| Migration aditiva (índice + coluna), zero destrutivo | 2 | Database |
| Migration V3.3.1 separada com CHECK constraint condicional | 2 | Database (release seguinte) |
| Logs estruturados + observabilidade do reconcile | 2 | Infra |
| Painel super-admin com card de reconcile | 3 | Frontend admin |
| Suite de testes: matcher, idempotência, multi-tenant, importers | todas | QA |

## Domain-Specific Requirements

### Compliance & Regulatory

- **CLT (Consolidação das Leis do Trabalho):** alocações criadas pela reconciliação retroativa devem espelhar o vínculo trabalhista real do colaborador. `WorkplaceAllocation.startDate` **nunca** pode ser inferido como \"hoje\" — deve usar `Employee.hireDate` como aproximação histórica. Caso contrário, o histórico de cobertura/dobra usado pelo motor V3 (predict de risco CLT) gera falsos positivos. Onde `hireDate` for desconhecido, gravar `startDate` com flag `inferredFrom: 'V3.3_RECONCILE'` e excluir explicitamente do cálculo de risco até validação manual.
- **LGPD (Lei Geral de Proteção de Dados — Brasil):** o `WorkplaceReconcileQueue` armazena nome de colaborador + nome de posto sugerido. Não armazenar CPF, dados pessoais expandidos (`personalData`) ou bancários (`bankDataEnc`) na fila. Rotina de purge: itens \"resolvidos\" ou \"ignorados\" há > 90 dias são removidos da fila (mantidos apenas no `AuditLog`).
- **Auditoria trabalhista (preservação de histórico):** o campo legado `Employee.workplace` (string) **não pode ser dropado** antes que toda alocação que dele se originou tenha um equivalente em `WorkplaceAllocation` com `startDate` válido. A política de deprecação em fases (rename → drop em V3.4) é exigência regulatória, não estética.
- **Direito de retificação:** operador (jornada 1A/1C) deve poder corrigir um vínculo errado criado pelo reconcile retroativo sem perder o histórico. Implementação: ao corrigir um vínculo, encerrar (`status=ENDED`, `endDate=now`) o errado e criar novo — nunca UPDATE destrutivo nem DELETE. AuditLog registra a correção.

### Technical Constraints

- **Multi-tenant strict:** toda query do reconcile e dos importers V3.3 deve passar pela Prisma extension de tenant isolation. Nenhuma rota aceita `tenantId` por query string sem validação JWT — exceto a rota super-admin de batch, que é restrita a role `SUPERADMIN` e registra `MasterKeyLog`-equivalente para auditoria de operações cross-tenant.
- **Online sem downtime:** transações curtas (≤ 200ms cada). Batch size configurável (default 100 employees). Sem `LOCK TABLE`. Job pausável e retomável (estado persistido em record análogo a `ImportJob`).
- **Idempotência forte:** chave de idempotência por (`tenantId`, `employeeId`, `workplaceId`). Re-execução não cria duplicata. Implementação via `WorkplaceAllocation` UNIQUE constraint condicional (`employeeId, workplacePositionId, status='ACTIVE'` — só uma ativa por par) ou checagem aplicacional.
- **Encoding/normalização:** matching determinístico aplica NFC + lowercase + trim + collapse de whitespace. Dados Tirvu vêm com inconsistências (\"INEP-Sede\", \"INEP - Sede\", \"Inep   Sede\") — todos devem casar.
- **Performance:** índice `workplaces (tenant_id, lower(name))` é pré-requisito da migration V3.3. Sem ele, matching de 500 employees × 108 postos é O(n·m) sem index hit.
- **Observabilidade:** logs estruturados (JSON) por batch com `tenantId`, `batchSize`, `matched`, `queued`, `errors`, `durationMs`. Métricas exportáveis para Grafana/Prometheus (a infra da VPS já tem stack de observabilidade — confirmar com Carla).
- **Segurança de pool de credenciais:** o reconcile **não** acessa SMTP/Evolution/ZapSign — não há risco de leak de credenciais V3.1. Mas como toca `AuditLog` e cria registros sensíveis, o operador que dispara precisa ter role `ADMIN` ou superior; não basta `USER`.

### Integration Requirements

- **Sem integrações externas novas.** V3.3 é internalmente reflexiva — só cruza dados que já existem no banco. Nada de chamadas a Tirvu, ZapSign ou Evolution durante o reconcile.
- **Compatibilidade com importer Tirvu V3.2 existente:** o fix do importer (jornada 4) é **não-breaking** para planilhas atuais — mesma estrutura de input. Mudança é só no comportamento de gravação. Re-importar uma planilha Tirvu antiga (V3.2) com importer V3.3 deve produzir grafo correto sem corromper dados.
- **Compatibilidade com motor de cobertura V3.0 (CoverageEngine):** ao popular `WorkplaceAllocation`, o motor passa a retornar dados reais sem mudança de código. Nenhuma alteração em `CoverageEngine` está no escopo.
- **Compatibilidade com AI predict V3:** `PromptBuilder` consulta `WorkplaceAllocation` para construir contexto. Após reconcile, prompts ganham dados reais. Sem alteração no PromptBuilder.

### Risk Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Reconcile cria alocação errada por matching ambíguo silencioso | Média | Alto (CLT) | Matcher determinístico **não vincula** em ambiguidade — coloca em fila de revisão. Fuzzy só sugere, nunca aplica. |
| Re-execução do reconcile duplica `WorkplaceAllocation` | Alta sem proteção | Médio (corrupção) | Idempotência por chave (`tenantId, employeeId, workplaceId`) + UNIQUE constraint em allocation ACTIVE por par. |
| Migration V3.3.1 (NOT NULL) falha em produção porque há outliers | Média | Alto (deploy abortado) | Migration V3.3.1 separada e independente. Pré-condição validável: query SQL que conta empregados ATIVOS sem `workplaceId` → deploy só prossegue se 0. |
| Tenant em produção sofre lentidão durante reconcile | Baixa | Médio (UX) | Batches curtos, transações ≤ 200ms, off-hours **opcional** (não exigido), monitoramento de p95 latency. |
| Drop futuro de `Employee.workplace` (V3.4) perde dado histórico antes de migrar | Baixa | Crítico (CLT) | Rename para `legacyWorkplace` antes de drop. Drop só após N releases e comprovação de que `WorkplaceAllocation` cobre 100% do histórico. |
| Importer V3.3 muda comportamento e quebra ImportJobs em andamento | Baixa | Alto (downtime de operação) | Feature flag por tenant (default ligado, mas reversível). Rollback preserva planilhas em fila. |
| Auto-criação de `Workplace` por importer cria duplicatas (\"INEP - Sede\" vs \"Inep Sede\") | Média | Médio (sujeira de dados) | Auto-criação aplica mesma normalização do matcher. Antes de criar, checa existência via lower+trim. UI sinaliza workplaces criados automaticamente para revisão. |
| Fila de revisão acumula pendências esquecidas | Alta sem visibilidade | Baixo a médio | Badge no menu lateral + email periódico para admins do tenant com itens > 7 dias. (Email opcional — pode ir para Growth.) |
| LGPD: vazamento de nome em logs | Baixa | Médio (compliance) | Logs estruturados não incluem nome de pessoa, só IDs. AuditLog (que tem nome) restrito por role. |

## SaaS B2B Specific Requirements

### Project-Type Overview

Sistema é SaaS B2B multi-tenant em produção (`ferias.unibot.com.br`). V3.3 atua sobre 3 dimensões intrínsecas a SaaS B2B: **isolamento de tenant** (regra crítica do CLAUDE.md), **modelo de permissões** (papéis admin/super-admin operam o reconcile) e **integrações com ecossistema cliente** (importer Tirvu como interface de entrada). Não há mudança em tiers/plano comercial nem em integrações externas — tiers e compliance regulatória estão cobertos no Executive Summary e Domain Requirements.

### Tenant Model

- **Isolamento estrito mantido.** A Prisma extension de tenant isolation (V3 base) **não é bypass-ada** pelo reconcile single-tenant. Toda query do job entra com `tenantId` no contexto. Cross-tenant queries são proibidas em código e validadas em testes.
- **Reconcile single-tenant** (`POST /v1/admin/reconcile`): roda no contexto JWT do operador (`ADMIN` do tenant). Não aceita parâmetro `tenantId` — é inferido do token. Impossível admin do tenant A reconciliar o tenant B.
- **Reconcile super-admin batch** (`POST /v1/admin/reconcile/batch { tenantIds: ['t1','t2',...] | 'all' }`): exclusivo para role `SUPERADMIN`. Cada execução por tenant abre um \"sub-contexto\" Prisma com o `tenantId` correspondente — internamente, é um loop de execuções single-tenant, não uma query global. Falha em um tenant não cascata para os outros.
- **Auditoria cross-tenant:** toda execução super-admin grava em `MasterKeyLog` (ou tabela equivalente — confirmar com Architect) registrando quem disparou, quais tenants, IP e duração.
- **Importers V3.3** seguem mesmo princípio: `WorkplaceAllocationService.upsertFromImport` recebe `tenantId` explícito do `ImportJob`, não confia em campos da planilha.

### RBAC Matrix

| Operação | USER | AUDITOR | ADMIN | SUPERADMIN |
|---|:---:|:---:|:---:|:---:|
| Ver `/workplaces` (própria do tenant) | ✓ | ✓ | ✓ | ✓ |
| Ver banner \"Reconcile pendente\" | — | ✓ (read-only) | ✓ | ✓ |
| Disparar reconcile single-tenant (`POST /v1/admin/reconcile`) | ✗ | ✗ | ✓ | ✓ |
| Ver fila \"Pendências de Vínculo\" | — | ✓ (read-only) | ✓ | ✓ |
| Resolver item da fila (vincular/criar/ignorar) | ✗ | ✗ | ✓ | ✓ |
| Disparar reconcile batch multi-tenant | ✗ | ✗ | ✗ | ✓ |
| Ver `AuditLog` de reconcile | ✗ | ✓ (próprio tenant) | ✓ | ✓ (todos) |
| Subir planilha Tirvu (importer V3.3) | ✗ | ✗ | ✓ | ✓ |
| Ver `WorkplaceReconcileQueue` (tabela bruta) | ✗ | ✗ | ✗ | ✓ (debug) |

**Regra:** o role `USER` (colaborador final, PWA do empregado) **não vê** nada de reconcile. O `AUDITOR` tem visibilidade read-only para conformidade trabalhista. Operações destrutivas/criadoras só `ADMIN` para cima.

### Integration List

V3.3 não introduz integrações externas. Integrações afetadas internamente:

| Integração | Direção | Mudança em V3.3 |
|---|---|---|
| Importer Tirvu (V3.2) → DB | Inbound | **Refatorado** — passa a usar `WorkplaceAllocationService.upsertFromImport()`. Backwards-compatible para planilhas. |
| Importer Postos (V3) → DB | Inbound | **Refatorado** — auto-cria `WorkplacePosition` padrão quando planilha não traz `positionRole`. |
| `CoverageEngine` (V3.0) ← DB | Internal consumer | **Sem mudança no código.** Passa a receber dados reais de `WorkplaceAllocation` populadas. |
| `PromptBuilder` para AI (V3.0) ← DB | Internal consumer | **Sem mudança no código.** Prompts ganham contexto real automaticamente. |
| ZapSign / Evolution / SMTP | Outbound | **Não afetadas.** Reconcile não dispara nenhum email/whatsapp/assinatura. |
| `AuditLog` | DB write | Novos `action` enum values: `V3.3_RECONCILE`, `V3.3_RECONCILE_BATCH`, `IMPORT_TIRVU_ALLOCATE`, `RECONCILE_QUEUE_RESOLVE`. |
| Webhooks (V3.0 outbound) | Outbound | **Avaliar:** disparar evento `WORKPLACE_RECONCILED` com summary? Decisão para Growth/Architect. |

### Compliance Requirements

Detalhes completos em `## Domain-Specific Requirements`. Resumo aqui apenas para fechamento da matriz SaaS B2B:

- **CLT/Trabalhista (Brasil):** preservação de `hireDate` em `startDate`, encerramento de allocations sem DELETE, drop de campo legado proibido antes da migração V3.4.
- **LGPD:** purge fila >90d, AuditLog restrito por role, logs estruturados sem nomes pessoais.
- **Multi-tenant strict:** garantido pela arquitetura V3.3 (RBAC + Prisma extension), não bypass-ável por SUPERADMIN nas operações de write.

### Implementation Considerations

- **Camadas envolvidas no monorepo** (referência aos paths do CLAUDE.md):
  - `backend-api/src/modules/imports/` — fix do importer Tirvu (`import-applier.ts`, `import-matcher.ts`).
  - `backend-api/src/modules/workplaces/` (a criar/expandir) — novo `WorkplaceAllocationService` compartilhado.
  - `backend-api/src/modules/reconcile/` (novo módulo) — job retroativo, matcher determinístico, matcher fuzzy de sugestão.
  - `backend-api/src/routes/api/v1/admin/reconcile/` (nova rota).
  - `backend-api/prisma/migrations/<timestamp>_v3_3_reconcile/` — migration aditiva (índice + opcional tabela `WorkplaceReconcileQueue`).
  - `frontend-web/src/app/workplaces/` — banner + aba \"Pendências de Vínculo\".
  - `frontend-web/src/app/admin/` (super-admin) — card de reconcile batch.
- **Convenções:** seguir `{ data, error, meta }` em respostas JSON, rotas REST `/api/v1/admin/reconcile/*`, design compacto da UI (sidebar 220px, font 13px), status colors existentes.
- **Docker rebuild policy** (memória feedback do projeto): mudanças em `backend-api/src` ou `prisma/` exigem rebuild do container automático no fluxo dev — válido para V3.3.
- **Commits frequentes + relatórios** (memória feedback do projeto): cada story V3.3 termina com commit + breve relatório de mudança ao usuário.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach: Problem-Solving MVP — \"Make production honest\".**

Não é MVP de descoberta de produto (já existe), nem de plataforma (já existe), nem de revenue (já monetizado). É **MVP corretivo**: a menor entrega que devolve verdade aos dados em produção e impede recriação do problema. Critério de aceitação binário: ao executar o reconcile no tenant Green House, `/workplaces` para de mostrar `0/0` em postos com colaboradores legítimos. Tudo além disso é Growth.

**Validação:**
- *\"Isto é útil?\"* — sim, no instante em que Bruno vê números reais em `/workplaces` e sugestões reais em `/coverage`.
- *\"Investidor/parceiro vê potencial?\"* — sim, no instante em que Marcos (super-admin) reconcilia 5 tenants em batch e tudo simplesmente funciona.
- *\"Caminho mais rápido para validated learning?\"* — produção já é o teste. Não há nada para validar fora de produção; o aprendizado é \"o motor de cobertura V3 é útil ou não?\". Reconcile + 1 semana de uso real responde.

**Resource Requirements:**
- 1 dev fullstack (TypeScript, Prisma, Next.js, React) — Bruno ou equivalente.
- Tempo estimado MVP: **3–5 dias úteis** de implementação + 1 dia de QA + deploy supervisionado.
- Stack já dominada (V3.0–V3.2 entregues pelo mesmo time). Sem aprendizado novo de tecnologia.
- Sem necessidade de UX dedicado (UI mínima reusa componentes shadcn/ui existentes); sem dedicação de DevOps além do deploy normal.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported (do Step 4):**
- Jornada 1A — Reconciliação inicial após deploy (Bruno).
- Jornada 1B — Novo import Tirvu pós-V3.3 (Bruno).
- Jornada 1C — Matching ambíguo / não-match (Bruno).
- Jornada 2 — Deploy controlado (Carla, parcial — sem migration NOT NULL).
- Jornada 4 — Importer Tirvu V3.3 (sistema).

**Must-Have Capabilities (recortado de \"Product Scope > MVP\"):**
1. `WorkplaceAllocationService.upsertFromImport()` — service único de gravação compartilhado.
2. Job de reconciliação retroativa, idempotente, em batches, single-tenant.
3. Rota admin `POST /v1/admin/reconcile`.
4. Matcher determinístico (case-insensitive, NFC, trim, collapse whitespace).
5. Tabela `WorkplaceReconcileQueue` + estados (pendente, adiado, resolvido, ignorado).
6. Importer Tirvu refatorado (grava no grafo relacional).
7. Importer Postos refatorado (auto-cria `WorkplacePosition` padrão).
8. Auto-criação de `Workplace` com `importedBy='AUTO_TIRVU'`.
9. Banner em `/workplaces` + aba \"Pendências de Vínculo\" (UI mínima funcional).
10. `ImportJob.previewSummary` com delta de relações.
11. AuditLog para reconcile e importer.
12. Migration aditiva (índice `lower(name)` + tabela queue).
13. Suite de testes (matcher, idempotência, importers).

**Não está no MVP (delibera­damente):**
- Matching fuzzy automático no reconcile (apenas como sugestão na fila).
- Migration NOT NULL em `Employee.workplaceId` (vai para Phase 2).
- Reconcile super-admin batch multi-tenant (Jornada 3 fica para Phase 2).
- Painel \"Saúde dos Postos\" elaborado (KPIs no topo de `/workplaces`).
- Notificações por email de fila pendente.
- Webhook `WORKPLACE_RECONCILED`.
- Drop ou rename do campo `Employee.workplace`.

### Post-MVP Features

**Phase 2 — Growth (≈1–2 semanas após MVP estabilizar):**

- **V3.3.1 — Migration NOT NULL condicional** com pré-condição validada (CHECK constraint).
- **Reconcile super-admin batch** (Jornada 3): rota `POST /v1/admin/reconcile/batch` + card no painel super-admin com tabela de tenants.
- **Painel \"Saúde dos Postos\"** em `/workplaces` (KPIs no topo: % postos com posições, % empregados com alocação, postos órfãos, sobrecarregados).
- **Reconcile com matching fuzzy automático opcional** (configurável por tenant; threshold ajustável).
- **Notificação por email** para admins quando fila de revisão tem itens > 7 dias.
- **Webhook outbound** `WORKPLACE_RECONCILED` com summary (consumir o sistema de webhooks já entregue em V3.0).
- **Cron diário de drift detection** (job que sinaliza tenants cujo grafo voltou a divergir — útil se houver UPDATE direto no banco por ferramentas externas).
- **Política de import como contrato:** schema de validação + lint que impede futuras rotas de importer de gravar diretamente em campos legados.

**Phase 3 — Vision (V3.4+, dependente de aprendizado real):**

- **Drop completo de `Employee.workplace`** após N releases comprovando que `WorkplaceAllocation` cobre 100% do histórico — primeiro rename para `legacyWorkplace`, eventualmente DROP COLUMN.
- **`WorkplacePosition` rico** — `shiftPattern` estruturado, `requiredQualifications`, `salaryBand`. Alimenta motor de cobertura com critérios de elegibilidade reais.
- **Histórico de alocações como time-series** consultável (\"quem trabalhou no posto X em 2026-Q1?\") — base para auditoria CLT, prestações de conta, disputas trabalhistas.
- **Plugin architecture de importers** — Tirvu vira um adapter; produto aceita CSV genérico, Senior, TOTVS, ERP custom escrevendo no mesmo `WorkplaceAllocationService`.

### Risk Mitigation Strategy

A tabela completa de riscos × probabilidade × impacto × mitigação está em `## Domain-Specific Requirements > Risk Mitigations`. Esta seção destaca a estratégia agregada por tipo de risco:

**Technical Risks:**
- **Maior risco técnico:** matching ambíguo silencioso criar vínculo errado em produção (impacto CLT). **Mitigação:** matcher determinístico nunca vincula em ambiguidade; fuzzy só sugere. *Princípio: errar em silêncio é pior que esperar revisão humana.*
- **Segundo maior:** re-execução do job duplicar `WorkplaceAllocation`. **Mitigação:** UNIQUE constraint condicional (only one ACTIVE per `employeeId×workplacePositionId`) + idempotência aplicacional.
- **Simplificação possível:** matching fuzzy na Phase 2, não no MVP — reduz superfície de bug crítico.

**Market/Operational Risks:**
- **Maior risco de mercado:** cliente Green House começar a usar `/coverage` antes do reconcile rodar e perder confiança no produto. **Mitigação:** comunicar deploy V3.3 com nota explicativa do banner; reconcile pode ser disparado pelo próprio Bruno em < 5 minutos.
- **Segundo:** outros tenants em piloto descobrindo o mesmo problema antes do batch multi-tenant (Phase 2). **Mitigação:** Phase 1 entrega rota single-tenant; Marcos (super-admin) pode rodar uma a uma manualmente até Phase 2.
- **Validation needed:** confirmar empiricamente que o motor de cobertura, após reconcile, retorna sugestões úteis (não apenas \"não-vazias\"). Métrica concreta: pelo menos 1 sugestão de cobertura aceitável em 5 testes manuais pós-deploy.

**Resource Risks:**
- **Cenário pior caso (1 dev, tempo apertado):** entregar somente itens 1, 2, 3, 6, 12, 13 do Must-Have (service + job + rota admin + importer Tirvu + migration + testes). UI fica para sub-release V3.3.0.1 — operador dispararia reconcile via curl/Postman temporariamente. **Aceitável?** Provável que sim, mas validar com Bruno.
- **Contingência:** migration aditiva é trivialmente reversível (drop index + drop table queue). Rollback de código volta ao comportamento V3.2. Sem perda de dados em nenhum cenário.
- **Time mínimo:** 1 dev fullstack. Sem dependência externa. QA pode ser auto-conduzido pelo dev se cobertura de testes for sólida.

**Decisão de scope explícita pelo usuário:**
- Janela: **online (sem manutenção)** — ✓ confirmado.
- Tenant scope: **multi-tenant** desde o dia um — ✓ confirmado (rota single-tenant no MVP, batch SUPERADMIN na Phase 2).
- Breaking change `workplaceId NOT NULL`: **OK** — agendada para Phase 2 (V3.3.1) com pré-condição validada.

## Functional Requirements

> **Capability Contract:** esta lista é o contrato de capacidades de V3.3. Qualquer recurso não listado aqui **não existirá** no produto entregue, salvo adição explícita posterior. Cada FR é testável, agnóstica de implementação, e responde \"o que pode ser feito\" — não \"como\".

### Reconciliation Engine (Phase 1 — MVP)

- **FR1:** ADMIN do tenant pode disparar uma reconciliação retroativa que vincula colaboradores legados (com `Employee.workplace` string preenchido e sem `workplaceId`) ao posto correspondente, criando alocações ativas.
- **FR2:** O reconcile pode ser re-executado N vezes sobre o mesmo tenant sem criar duplicatas nem corromper vínculos já estabelecidos (idempotência).
- **FR3:** O reconcile processa colaboradores em batches transacionais, permitindo execução em produção viva sem bloquear outras operações.
- **FR4:** O reconcile preserva o histórico trabalhista usando `Employee.hireDate` como data de início da alocação criada (nunca a data da execução do job).
- **FR5:** Colaboradores com `status` em `INATIVO` ou sem `workplace` string preenchida são ignorados pelo reconcile (não geram fila nem allocation).
- **FR6:** Cada allocation criada pelo reconcile é registrada em `AuditLog` com identificação clara (`action: V3.3_RECONCILE`).
- **FR7:** A execução do reconcile retorna um relatório com totais: vínculos criados, itens enfileirados para revisão, colaboradores ignorados, duração e data/hora.

### Matching & Disambiguation

- **FR8:** O sistema possui um matcher determinístico que casa `Employee.workplace` (string) com `Workplace.name` no mesmo tenant aplicando normalização (case-insensitive, NFC, trim, collapse de whitespace).
- **FR9:** Quando o matcher determinístico encontra exatamente um posto correspondente, o vínculo é criado automaticamente.
- **FR10:** Quando o matcher encontra zero ou múltiplos postos correspondentes, o item é colocado em fila de revisão (nunca vinculado por adivinhação).
- **FR11:** O sistema gera sugestões fuzzy ranqueadas (com score de similaridade) para cada item da fila de revisão, mas nunca aplica essas sugestões automaticamente.
- **FR12:** O matching e a auto-criação de Workplace pelo importer aplicam exatamente a mesma normalização — garantindo que \"INEP - Sede\" e \"inep   sede\" sejam tratados como o mesmo posto.

### Review Queue Management

- **FR13:** ADMIN pode visualizar uma fila de \"Pendências de Vínculo\" listando colaboradores que ainda não têm posto vinculado, agrupada/filtrável por estado (pendente, adiado, resolvido, ignorado).
- **FR14:** ADMIN pode resolver um item da fila vinculando-o a um posto existente (escolhendo entre as sugestões fuzzy ou buscando manualmente).
- **FR15:** ADMIN pode resolver um item da fila criando um novo `Workplace` na hora.
- **FR16:** ADMIN pode marcar um item como \"adiado\" para tratar depois, ou \"ignorado\" quando o colaborador não deve ter vínculo.
- **FR17:** Itens resolvidos ou ignorados há mais de 90 dias são automaticamente purgados da fila (LGPD), permanecendo apenas em `AuditLog`.
- **FR18:** AUDITOR pode visualizar a fila em modo read-only (sem ações).
- **FR19:** ADMIN pode corrigir um vínculo errado encerrando a allocation atual e criando uma nova — operação registrada em AuditLog, sem DELETE destrutivo.

### Importer Integration (Tirvu V3.3)

- **FR20:** O importer Tirvu, ao processar uma linha de colaborador com `lotacao` preenchida, resolve `Employee.workplaceId` (FK) durante a importação — não apenas grava a string legada.
- **FR21:** O importer Tirvu cria automaticamente um `Workplace` quando o nome do posto da planilha não existe no tenant, marcando-o com `importedBy='AUTO_TIRVU'` para revisão posterior.
- **FR22:** O importer Tirvu cria automaticamente uma `WorkplaceAllocation` ACTIVE para cada colaborador importado/atualizado com posto resolvido.
- **FR23:** Quando um colaborador já tinha allocation ativa e o posto muda na nova planilha, o importer encerra a allocation anterior (`status=ENDED`, `endDate=now`) e cria uma nova ACTIVE — preservando histórico.
- **FR24:** Re-importar a mesma planilha Tirvu não duplica allocations nem cria novos workplaces para nomes que já existem.
- **FR25:** O preview do `ImportJob` (etapa `PREVIEW_READY`) inclui delta de relações: quantas allocations serão criadas, quantas encerradas, quantos workplaces novos serão criados, quantos colaboradores ficarão sem match.

### Importer Integration (Postos V3.3)

- **FR26:** O importer de Postos cria automaticamente uma `WorkplacePosition` padrão (ex.: `role: 'Operacional'`, `requiredCount: 1`) quando a planilha não traz informação de cargo.
- **FR27:** Quando a planilha de Postos traz cargos explícitos, o importador respeita essa informação e não cria a posição padrão duplicada.

### Multi-tenant & RBAC

- **FR28:** O reconcile single-tenant infere o `tenantId` exclusivamente do JWT do operador — nunca de parâmetro de query/body — impedindo que ADMIN do tenant A reconcilie o tenant B.
- **FR29:** SUPERADMIN pode disparar reconciliação em batch para múltiplos tenants ou para todos (cada execução por tenant é isolada — falha em um não cascata).
- **FR30:** Toda execução de reconcile super-admin é registrada com identificação de operador, IP, lista de tenants afetados e duração.
- **FR31:** USER e roles equivalentes a colaborador final não veem nenhum elemento de UI relacionado a reconcile (banner, fila, painel).

### Workplace Visibility (UI)

- **FR32:** A página `/workplaces` exibe um banner contextual quando o tenant tem colaboradores legados pendentes de reconciliação, com ação \"Iniciar reconciliação\".
- **FR33:** Após reconcile, a página `/workplaces` exibe contadores reais (`alocados/necessários`, `posições`) refletindo `WorkplaceAllocation` ativas e `WorkplacePosition` cadastradas.
- **FR34:** Durante a execução do reconcile, o usuário recebe feedback de progresso em tempo real (batches concluídos / total).
- **FR35:** Após o reconcile, o relatório-resumo é apresentado ao operador com totais e link direto para a fila de revisão.

### Audit & Telemetry

- **FR36:** Cada allocation criada por reconcile ou por importer Tirvu é gravada em `AuditLog` com `previousData` (estado anterior) e `newData` (estado novo).
- **FR37:** Cada resolução manual de item da fila (vincular/criar/ignorar/adiar) é registrada em `AuditLog` com identificação do operador e da decisão.
- **FR38:** Logs estruturados (JSON) por batch incluem `tenantId`, `batchSize`, `matched`, `queued`, `errors`, `durationMs` — sem nomes de pessoas (LGPD).
- **FR39:** AUDITOR pode visualizar registros de auditoria de reconcile do próprio tenant.

### Migration & Schema Evolution

- **FR40:** A release V3.3 introduz uma migration aditiva (índice + opcionalmente tabela de fila) que **não destrói** dados nem altera schema de forma quebrável.
- **FR41:** A release V3.3.1 (Phase 2) introduz uma constraint que torna `Employee.workplaceId` obrigatório para colaboradores `status='ATIVO'`, com pré-condição validada antes do deploy (deploy aborta se houver outliers).
- **FR42:** O campo legado `Employee.workplace` é mantido durante toda a V3.3 e V3.3.x — não é renomeado nem dropado nesta feature.

### Compatibility (Existing V3 Modules)

- **FR43:** Após reconcile, o motor de cobertura (`/coverage`, V3.0) retorna sugestões reais sem nenhuma alteração no código do `CoverageEngine`.
- **FR44:** Após reconcile, prompts da AI (`/predict`, V3.0) recebem contexto real de alocações sem alteração no `PromptBuilder`.
- **FR45:** Sistemas de webhook, notificações, assinatura digital e PWA do colaborador (V3.0/V3.1) continuam funcionando inalterados.

## Non-Functional Requirements

> Categorias incluídas: **Performance, Security, Reliability, Compliance, Maintainability, Observability**. **Acessibilidade**, **Escalabilidade horizontal massiva** e **Internacionalização** foram avaliadas e excluídas — V3.3 reusa a UI existente (já com requisitos de acessibilidade da V3.0), o volume é determinístico (≤10k employees por tenant em horizonte realista) e a string-base é PT-BR fixa para esta feature corretiva.

### Performance

- **NFR-PERF-1:** Cada batch transacional do reconcile completa em ≤ 200ms p95 (medido em ambiente de produção sob carga normal).
- **NFR-PERF-2:** Reconcile completo de um tenant com ~500 colaboradores e ~108 postos (perfil Green House) finaliza em ≤ 5 minutos end-to-end, online, sem janela de manutenção.
- **NFR-PERF-3:** Latência p95 de operações concorrentes (login, listagem de empregados, abertura de `/workplaces`) **não degrada mais que 10%** durante a execução do reconcile.
- **NFR-PERF-4:** Operações da rota admin (disparar reconcile, listar fila) respondem em ≤ 500ms p95 quando a fila tem até 1.000 itens.
- **NFR-PERF-5:** Matching determinístico de 1 colaborador contra 200 workplaces do tenant executa em ≤ 5ms (com índice `lower(name)` em uso).
- **NFR-PERF-6:** A página `/workplaces` carrega em ≤ 1.5s p95 com 500 postos e contadores reais (após reconcile).

### Security

- **NFR-SEC-1:** Toda rota de reconcile (`/v1/admin/reconcile*`) exige JWT válido com role `ADMIN` ou `SUPERADMIN` — `USER` e `AUDITOR` recebem 403.
- **NFR-SEC-2:** O `tenantId` da operação é derivado do JWT. Tentativas de injetar `tenantId` via body/query são rejeitadas com 400 (single-tenant) ou exigem `SUPERADMIN` (batch).
- **NFR-SEC-3:** Todas as queries Prisma do reconcile passam pela extension de tenant isolation — testada por unit tests que tentam vazamento cross-tenant e esperam erro.
- **NFR-SEC-4:** Logs estruturados não contêm dados pessoais identificáveis (nome, CPF, email, telefone) — apenas IDs (LGPD).
- **NFR-SEC-5:** AuditLog que contém nomes/decisões só é legível por `ADMIN` (próprio tenant), `AUDITOR` (próprio tenant, read-only) ou `SUPERADMIN` (todos).
- **NFR-SEC-6:** Rate limiting na rota admin de reconcile: máximo 10 disparos por hora por usuário (previne abuse e laços acidentais de retry).
- **NFR-SEC-7:** Itens da `WorkplaceReconcileQueue` armazenam apenas nome do colaborador e nome do posto sugerido — nunca CPF, dados bancários ou `personalData` (FR17).
- **NFR-SEC-8:** Nenhuma credencial externa (SMTP, Evolution, ZapSign) é tocada pelo reconcile — superfície de risco de leak não aumenta com V3.3.

### Reliability

- **NFR-REL-1:** O reconcile é idempotente — re-execução produz o mesmo estado final (verificado por teste automatizado que executa o job 3× e compara o grafo).
- **NFR-REL-2:** Falha em uma allocation individual não interrompe o batch — a allocation falha é registrada em log com causa, o batch continua e o relatório final reporta erros parciais.
- **NFR-REL-3:** Falha em reconcile de um tenant (modo super-admin batch) não cascata para outros tenants — cada execução é isolada em transação própria.
- **NFR-REL-4:** Migration V3.3 é trivialmente reversível (drop de índice + drop de tabela queue) sem perda de dados nas tabelas pré-existentes.
- **NFR-REL-5:** Crash do processo durante reconcile não corrompe estado — transações curtas garantem que o que foi commitado está consistente; o que estava em andamento é descartado e pode ser reprocessado em re-execução (idempotência).
- **NFR-REL-6:** Disponibilidade da plataforma durante o reconcile: 100% (sem janela de manutenção exigida; usuários continuam navegando).

### Compliance

- **NFR-COMP-1:** **CLT** — `WorkplaceAllocation.startDate` criada por reconcile usa `Employee.hireDate` quando disponível (FR4); quando ausente, allocation é marcada com flag `inferredStartDate=true` e excluída do cálculo de risco CLT até validação manual.
- **NFR-COMP-2:** **CLT** — corrigir vínculo errado nunca usa DELETE/UPDATE destrutivo: encerra allocation atual (`status=ENDED`, `endDate=now`) e cria nova (FR19) — preservando histórico para auditoria trabalhista.
- **NFR-COMP-3:** **LGPD** — itens da fila resolvidos/ignorados há > 90 dias são purgados automaticamente (FR17), permanecendo apenas em AuditLog acessado por role autorizado.
- **NFR-COMP-4:** **LGPD** — fila de revisão e logs estruturados não armazenam CPF, dados bancários nem `personalData` (NFR-SEC-7).
- **NFR-COMP-5:** **Preservação de histórico** — campo `Employee.workplace` (string legada) não é renomeado nem dropado em V3.3.x; drop fica condicionado a comprovação de cobertura completa via `WorkplaceAllocation` (V3.4 ou posterior).
- **NFR-COMP-6:** **Rastreabilidade** — toda allocation criada pelo reconcile tem `AuditLog` correspondente com `previousData` e `newData`, permitindo reconstrução completa do histórico de decisões.

### Maintainability

- **NFR-MAINT-1:** Cobertura de testes para módulos novos (`reconcile/`, `WorkplaceAllocationService`) ≥ 85% statements; suite global se mantém em ≥ 350 testes verdes (atualmente 347).
- **NFR-MAINT-2:** `WorkplaceAllocationService.upsertFromImport()` é o **único** ponto de gravação de allocations a partir de import — importer Tirvu, importer Postos e reconcile chamam este service. Gravação direta em `prisma.workplaceAllocation.create()` fora desse service é proibida (validável por lint/grep).
- **NFR-MAINT-3:** Princípio \"importadores escrevem no grafo relacional\" é documentado em `CLAUDE.md` ou `docs/` como regra de aceitação para futuras integrações de import.
- **NFR-MAINT-4:** Convenções V3 mantidas: rotas `/api/v1/*`, respostas `{ data, error, meta }`, models Prisma com `tenantId` obrigatório, migrations versionadas.
- **NFR-MAINT-5:** Mudanças em `backend-api/src` ou `prisma/` durante o desenvolvimento V3.3 acionam rebuild automático do container Docker (memória feedback do projeto).

### Observability

- **NFR-OBS-1:** Cada execução do reconcile produz logs estruturados (JSON) com `tenantId`, `jobId`, `batchSize`, `matched`, `queued`, `errors`, `durationMs`, `parserVersion: 'reconcile-v1'`.
- **NFR-OBS-2:** Métricas exportáveis para o stack de observabilidade da VPS (a confirmar com Carla/DevOps): contador de allocations criadas, histograma de duração de batch, gauge de tamanho da fila por tenant.
- **NFR-OBS-3:** Frontend exibe progresso em tempo real durante reconcile (FR34) — implementação pode usar polling em endpoint de status do job (1×/2s) ou SSE; decisão técnica do Architect.
- **NFR-OBS-4:** Tela `/workplaces` (e painel super-admin) destacam visualmente postos com `importedBy='AUTO_*'` e workplaces sem positions, sinalizando higiene de dados pendente.
- **NFR-OBS-5:** Suite de testes inclui pelo menos um teste de carga sintético (~1.000 employees em batch) para detectar regressão de performance antes de release.
