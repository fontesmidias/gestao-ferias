---
stepsCompleted: ['step-01-init', 'step-02-discovery-light', 'step-03-08-skipped-pragmatic-path', 'step-09-skipped-no-divergence', 'step-10-user-journeys', 'step-11-component-strategy', 'step-12-ux-patterns', 'step-13-responsive-accessibility', 'step-14-complete']
status: 'COMPLETE'
completedAt: '2026-04-30'
pragmaticPath: true
inputDocuments:
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md'
    type: 'prd'
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md'
    type: 'architecture'
  - path: '_evo-output/planning-artifacts/v3-2-import-tirvu/implementation-readiness-report.md'
    type: 'readiness-report'
  - path: 'CLAUDE.md'
    type: 'project-context'
  - path: '_evo-output/planning-artifacts/v3-postos-cobertura-ai/ux-design-specification.md'
    type: 'prior-ux-spec'
workflowType: 'ux-design'
project_name: 'gestao-ferias'
user_name: 'Bruno'
date: '2026-04-30'
feature: 'v3-2-import-tirvu'
---

# UX Design Specification — Importação Tirvu (v3-2)

**Author:** Sally (UX Designer)
**Date:** 2026-04-30
**Project:** gestao-ferias
**Feature:** v3-2-import-tirvu

---

<!-- UX design content sequencial. Caminho pragmático: steps 1+2 light, 3-9 skipped, 10-13 deep dive, 14 wrap-up. -->

## 1. Context Synthesis (Steps 1+2 light)

### Inputs herdados
- **PRD** define 4 user journeys narrativas (Bruno bootstrap, Bruno edge case, Carla reimport, Diogo suporte) e UI fortemente especificada
- **Architecture D10** trava state machine (4 estados via querystring), polling 2s, virtualização, code-split
- **Design System V3** já estabelecido (Tailwind + shadcn/ui, sidebar 220px, fonte 13px, status colors travadas)

### Steps 3-9 skipped (rationale)
Não rodamos: emotional response (4), inspiration moodboard (5), visual foundation (8), design directions (9). **Por quê:** feature de admin interna brownfield em SaaS B2B com design system já em produção. Não há divergência visual a explorar nem moodboard a construir. UX vive dentro das convenções V3 que já travaram tom, voz e estética.

### Princípios UX desta feature (auto-explicativa)

1. **Mostrar o estado, não esconder.** Banner persistente com nome do tenant alvo durante todo o fluxo SuperAdmin. Sem estados implícitos.
2. **Confirmar antes de aplicar, não desfazer depois.** Modal explícito repete nome do tenant. Sem undo no MVP — confirmação é a barreira.
3. **Diff visível, decisão informada.** Operador vê exatamente o que vai acontecer (criar/atualizar/inválido/ausente/reativação) antes de aplicar.
4. **Falha graciosa, recuperação fácil.** 950 linhas válidas + 50 erros = importa as 950 e devolve .xlsx das 50 com motivo. Operador corrige no Excel e re-sobe.
5. **Linguagem operacional, não técnica.** "Importar colaboradores" não "Bulk insert"; "Lotação ANATEL" não "Workplace.name=ANATEL"; "Aplicar" não "Submit".
6. **Tooltips em tudo que tem decisão.** Info icon ao lado de label sempre que há concept não óbvio (memory: padrão V3).
7. **Acessibilidade desde o início.** Keyboard navigation, focus visible, status colors com ícone+label, banner com aria-live.

## 2. Step 10 — User Journeys Visualizadas

### 2.1. Persona-fluxo matrix

| Persona | Rota | Variação UX | Estado inicial |
|---|---|---|---|
| Bruno (SuperAdmin) | `/admin/imports/employees` | Tenant picker visível, banner persistente | step=upload, tenant não selecionado |
| Carla (TenantAdmin) | `/settings/imports/employees` | Tenant fixo do JWT, sem picker | step=upload, tenant pré-fixado |
| Diogo (Suporte) | (Phase 2: `/admin/imports/history`) | Read-only de jobs de qualquer tenant | N/A no MVP |

### 2.2. Estado #1 — UPLOAD (vazio)

**Variação A — SuperAdmin (`/admin/imports/employees`)**

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◀ Sidebar (220px)    │  Importar colaboradores                        │
│                      │                                                 │
│  • Dashboard         │  ┌────────────────────────────────────────┐    │
│  • Tenants           │  │ ⚠ Selecione o tenant alvo               │    │
│  • Employees         │  │   antes de subir o arquivo.              │    │
│  • ...               │  └────────────────────────────────────────┘    │
│  ▼ Importações       │                                                 │
│    • Colaboradores ◀ │  Tenant alvo *                                  │
│    • Histórico       │  ┌──────────────────────────────────┐ ⓘ        │
│  • Settings          │  │ Selecione um tenant... ▼          │          │
│                      │  └──────────────────────────────────┘          │
│                      │                                                 │
│                      │  Arquivo Tirvu (.xlsx) ⓘ                       │
│                      │  ┌─────────────────────────────────────────┐   │
│                      │  │                                         │   │
│                      │  │       ⬆  Arraste o arquivo aqui          │   │
│                      │  │       ou clique para selecionar          │   │
│                      │  │                                         │   │
│                      │  │       Apenas .xlsx, até 10 MB            │   │
│                      │  │                                         │   │
│                      │  └─────────────────────────────────────────┘   │
│                      │                                                 │
│                      │  ⓘ Esperamos o formato padrão Tirvu             │
│                      │     (46 colunas).  [Ver formato esperado →]     │
│                      │                                                 │
└───────────────────────────────────────────────────────────────────────┘
```

**Variação B — TenantAdmin (`/settings/imports/employees`)**

```
┌───────────────────────────────────────────────────────────────────────┐
│  Importar colaboradores                                                 │
│                                                                          │
│  Tenant: Servi-Plus  (você está logado como admin desse tenant)         │
│                                                                          │
│  Arquivo Tirvu (.xlsx) ⓘ                                                │
│  ┌─────────────────────────────────────────┐                            │
│  │       ⬆  Arraste o arquivo aqui          │                            │
│  │       ou clique para selecionar          │                            │
│  │       Apenas .xlsx, até 10 MB            │                            │
│  └─────────────────────────────────────────┘                            │
│                                                                          │
│  ⓘ Esperamos o formato padrão Tirvu (46 colunas). [Ver formato →]       │
│                                                                          │
└───────────────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Page title: "Importar colaboradores"
- Tenant picker label: "Tenant alvo" + asterisco vermelho (obrigatório)
- Tenant picker placeholder: "Selecione um tenant..."
- Tenant picker info tooltip: "Os colaboradores da planilha serão criados/atualizados neste tenant. SuperAdmin pode importar para qualquer tenant ativo."
- Dropzone primary text: "Arraste o arquivo aqui ou clique para selecionar"
- Dropzone secondary text: "Apenas .xlsx, até 10 MB"
- Format help link: "Ver formato esperado →" (abre Dialog com lista das 46 colunas Tirvu)
- File icon: `lucide-react: Upload` (24×24)

**Estados de upload (microtransições):**
- **idle:** dropzone gray-50 background, dashed border 2px gray-300
- **dragover:** background blue-50, border solid blue-500, escala 1.02
- **uploading:** mostra `<Progress />` linear da subida do binário (não confundir com progresso do job)
- **upload-error:** background red-50, mensagem em red-600 ("Arquivo deve ser .xlsx" / "Tamanho máximo 10MB" / "Layout não reconhecido como Tirvu")
- **upload-success → transição automática** para estado #2 (preview)

### 2.3. Estado #2 — PREVIEW (após parse + validate + match)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ 🔵 IMPORTANDO PARA: Servi-Plus                            [✕ Cancelar]         │ ← Banner persistente, role="alert"
├───────────────────────────────────────────────────────────────────────────────┤
│  Pré-visualização de importação                          arquivo: serviplus.xlsx│
│                                                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐           │
│  │ ✚ Criar  │ ✎ Atual. │ ⚠ Inválid│ 👻 Ausente│ ↻ Reativ. │ ─ Sem    │           │
│  │   47     │    3     │    2     │    5     │    1     │   942    │           │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘           │
│                                                                                  │
│  🆕 Lotações novas detectadas: ANATEL, TRT-DF, MEC                              │
│     ◯ Criar todas automaticamente   ◉ Decidir caso a caso na aplicação           │
│                                                                                  │
│  Filtros: [Todos 1.000] [Criar 47] [Atualizar 3] [Inválido 2] [Ausente 5]      │
│           [Reativação 1] [Sem alterações 942]                                    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │ Linha │ Nome              │ CPF        │ Lotação │ Status     │ ...   │       │
│  ├───────┼───────────────────┼────────────┼─────────┼────────────┼───────┤       │
│  │  1    │ ADLLA CRUZ DE...  │ ***.707..31│ ANATEL  │ ✚ Criar     │ ▼ │       │
│  │  2    │ ALESSANDRA M...   │ ***.493..91│ ANATEL  │ ✚ Criar     │ ▼ │       │
│  │  3    │ JOÃO SILVA        │ ***.123..45│ TRT-DF  │ ✎ Atualizar │ ▼ │       │
│  │       │   ↓ Diff (3 campos alterados)                                │       │
│  │       │   • salary:  R$ 1.500,00  →  R$ 1.700,00                     │       │
│  │       │   • shift:   "ANATEL 2ª-6ª"  →  "TRT 2ª-5ª"                  │       │
│  │       │   • position: "AUX OPER."   →  "TÉC OPER."                  │       │
│  │  47   │ JOSÉ MARIA        │ XXX.XXX.XX │ ANATEL  │ ⚠ Inválido  │ ▼ │       │
│  │       │   ↓ Erros: CPF inválido (dígito verificador não confere)    │       │
│  │  ...                                                                  │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│                              [◀ 1] [2] [3] ... [20] [▶]    50 / 1.000 linhas    │
│                                                                                  │
│  ⓘ Linhas inválidas serão ignoradas; receberá um relatório .xlsx baixável.     │
│                                                                                  │
│                              [Cancelar e voltar]   [Aplicar importação ▶]       │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Banner persistente (NFR23):**
- Estilo: `bg-blue-600 text-white`, height 40px, fixed top abaixo do header global
- Conteúdo: ícone DB + label "IMPORTANDO PARA:" (uppercase, 11px, opacity 0.85) + nome do tenant em 18px bold (para AAA contrast)
- `role="alert" aria-live="assertive"` — leitores de tela anunciam ao mudar
- Botão "✕ Cancelar" sempre disponível à direita; click → modal "Tem certeza? Nenhum dado foi alterado." → confirma cancela e volta ao step=upload
- **Sem banner** na variação TenantAdmin (tenant é fixo do JWT, mostrar é redundante)

**Cards de contagem (top):**
- 6 cards lado a lado (responsive: wrap em 3+3 abaixo de 1024px)
- Cada card: ícone + número grande (24px, font-bold) + label (11px, gray-600)
- Cores dos ícones (alinhados com NFR22 = cor + ícone, redundância):
  - ✚ Criar (verde-500 #22C55E)
  - ✎ Atualizar (amarelo-500 #EAB308)
  - ⚠ Inválido (vermelho-500 #EF4444)
  - 👻 Ausente (cinza-500 #6B7280) — colaborador no sistema, não na planilha
  - ↻ Reativação (roxo-500 #8B5CF6) — soft-deleted que reaparece na planilha
  - ─ Sem alterações (cinza-300 — visualmente baixo destaque)

**Lotações novas detectadas:**
- Block colorido azul-50 com ícone 🆕
- 2 radios mutuamente exclusivos:
  - ◯ "Criar todas automaticamente" — convence ao aplicar, cria as N lotações
  - ◉ "Decidir caso a caso na aplicação" (default) — modal de confirmação per lotação
- Tooltip ⓘ: "Lotações são gerenciadas em /workplaces. Decidir caso a caso é mais seguro em re-imports."

**Filter chips (NFR5 client-side):**
- 7 chips clicáveis (Todos + 6 categorias). Active = bg-primary text-white. Inactive = bg-gray-100 text-gray-700.
- Click filtra a tabela virtualizada (apenas client-side, sem chamar servidor — tabela já tem todos os 1.000 rows em memória)
- Todos = soma; Sem alterações = filtro padrão visualmente atenuado

**Tabela virtualizada (`@tanstack/react-virtual`, NFR5 60fps):**
- Colunas (sticky header): Linha (#) | Nome | CPF (mascarado por default) | Lotação | Status (badge) | ▼ expand
- Linha clicável → expande inline mostrando Diff field-by-field (updates) ou erros (inválido)
- CPF mascarado: mostra `***.707..31` (últimos 2 + primeiros 3 visíveis) — alinhado com NFR12 log sanitization filosofia
- Diff expand: tabela de 2 colunas "campo | de → para" com setas visuais
- Erros expand: lista de mensagens em vermelho com bullet
- Paginação: 50 rows por página + virtualização interna
- Skeleton: 10 rows fantasmas com shimmer durante load

**Botões finais:**
- "Cancelar e voltar" (variant="outline") — left-aligned com confirm modal
- "Aplicar importação ▶" (variant="default", primary blue) — right-aligned, abre modal de confirmação (estado intermediário)

### 2.4. Estado #2.5 — MODAL DE CONFIRMAÇÃO (NFR24)

```
┌──────────────────────────────────────────────────────┐
│  Confirmar importação                            [✕] │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Você está prestes a importar para:                  │
│                                                       │
│      ┌──────────────────────────────────┐            │
│      │   📂 SERVI-PLUS                   │            │ ← AAA contrast
│      └──────────────────────────────────┘            │
│                                                       │
│  Operações:                                           │
│  • ✚ Criar 47 colaboradores                          │
│  • ✎ Atualizar 3 colaboradores                       │
│  • ↻ Reativar 1 colaborador                          │
│  • 🆕 Criar 3 lotações (ANATEL, TRT-DF, MEC)         │
│  • ⚠ Ignorar 2 linhas inválidas                      │
│                                                       │
│  ⓘ Para confirmar, digite o nome do tenant:           │
│  ┌──────────────────────────────────┐                │
│  │ Servi-Plus                        │                │
│  └──────────────────────────────────┘                │
│                                                       │
│  Esta ação será auditada e não pode ser desfeita      │
│  automaticamente.                                     │
│                                                       │
│            [Cancelar (Esc)]   [Confirmar e aplicar]  │
└──────────────────────────────────────────────────────┘
```

**Comportamento (NFR24):**
- **Focus trap:** `role="dialog" aria-modal="true"`. Foco preso entre elementos do modal.
- **Default focus:** botão "Cancelar" (left). Esc fecha.
- **Confirm button disabled** até o input "digite o nome do tenant" bater **exatamente** com o tenant alvo (case-sensitive, trim de whitespace). Tooltip explica.
- **Backend duplo-check (FR10):** mesmo se UI for hackeada, backend valida `confirmTenantName === tenantNameFromJob`.
- TenantAdmin variation: modal é mais simples (sem confirm-typing — tenant é fixo do JWT, risco zero), mas mantém review das operações.
- Confirmar → POST /imports/:jobId/apply → fecha modal → transita para estado #3.

### 2.5. Estado #3 — APPLYING (job em execução)

```
┌───────────────────────────────────────────────────────────────────────┐
│ 🔵 IMPORTANDO PARA: Servi-Plus                                          │ ← Banner persistente
├───────────────────────────────────────────────────────────────────────┤
│  Aplicando importação...                                                │
│                                                                          │
│           ┌──────────────────────────────────────────┐                  │
│           │  ████████████░░░░░░░░░  62%              │                  │ ← linear progress
│           └──────────────────────────────────────────┘                  │
│                                                                          │
│           Processadas: 620 / 1.000 linhas                               │
│           Tempo decorrido: 1m 12s                                       │
│           Tempo estimado restante: ~45s                                 │
│                                                                          │
│           ┌────────────────────────────────────────┐                    │
│           │ ✚ 30 criados   ✎ 2 atualizados        │                    │
│           │ ⚠ 1 erro       👻 0 marcados pendentes │                    │
│           └────────────────────────────────────────┘                    │
│                                                                          │
│  ⓘ Você pode fechar esta aba — o trabalho continua em segundo plano.   │
│     Atualizamos a cada 2 segundos.                                      │
│                                                                          │
└───────────────────────────────────────────────────────────────────────┘
```

**Comportamento:**
- Polling a cada 2s (NFR4) via TanStack Query `refetchInterval`
- Progress bar linear (não circular — linear comunica progressão de processo melhor)
- Tempo estimado calculado client-side: `(elapsedMs / processed) * (total - processed)` — só aparece após 100 linhas processadas (estabilidade)
- Cards de contadores parciais atualizam ao vivo
- Mensagem de "fechar aba é seguro" — operador não fica refém da janela
- **Sem botão de cancelar durante APPLYING** (data já está sendo escrita; cancelar criaria inconsistência) — flagado em arquitetura como "apply é commit point"

**Acessibilidade:**
- `role="status" aria-live="polite"` na seção de progresso (anuncia mudanças significativas, não cada poll)
- Anúncios a cada 25% de progresso (não a cada 2s — over-loud)

### 2.6. Estado #4a — DONE (sucesso)

```
┌───────────────────────────────────────────────────────────────────────┐
│  ✅ Importação concluída                                                │
│                                                                          │
│  Tenant: Servi-Plus                                                     │
│  Concluída em 2m 03s                                                    │
│                                                                          │
│  ┌──────────┬──────────┬──────────┬──────────┐                          │
│  │ ✚ Criar  │ ✎ Atual. │ 🆕 Lotaç │ ⚠ Inválid│                          │
│  │   47     │    3     │    3     │    2     │                          │
│  └──────────┴──────────┴──────────┴──────────┘                          │
│                                                                          │
│  ↻ 1 colaborador reativado.                                             │
│  👻 5 marcados como "candidatos a inativar" — revise em Colaboradores. │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ⚠ 2 linhas tiveram erros e foram ignoradas.                       │   │
│  │ [⬇ Baixar relatório de erros (.xlsx)]                             │   │
│  │  Corrija no Excel e re-importe — colaboradores válidos não serão │   │
│  │  duplicados.                                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│         [Ver colaboradores ▶]   [Nova importação]                       │
│                                                                          │
└───────────────────────────────────────────────────────────────────────┘
```

**Microcopy específica:**
- Title: "Importação concluída" + ícone ✅ verde
- "Ver colaboradores ▶" → navega para `/employees?tenantId=...&filter=recently_imported&jobId=...` (TenantAdmin: sem param tenantId)
- "Nova importação" → reset state machine, volta para step=upload
- Linha 👻 "candidatos a inativar" só aparece se houver — link "Colaboradores" → `/employees?filter=inactive_pending`
- Linha ⚠ relatório de erros só aparece se `rowsInvalid > 0`
- Confetti animado no `:first-mount` (subtle, easter egg para Bruno) — disable se preferir mais sério

### 2.7. Estado #4b — DONE (falha)

```
┌───────────────────────────────────────────────────────────────────────┐
│  ❌ Importação falhou                                                    │
│                                                                          │
│  Tenant: Servi-Plus                                                     │
│  Falhou após 8s                                                          │
│                                                                          │
│  Motivo:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Layout do arquivo não reconhecido como Tirvu padrão.              │   │
│  │ Esperamos um cabeçalho com 46 colunas específicas, mas             │   │
│  │ encontramos 42 colunas.                                            │   │
│  │                                                                    │   │
│  │ Verifique se a planilha foi exportada corretamente do sistema     │   │
│  │ Tirvu sem alterações manuais.                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ⓘ Nenhum dado foi modificado em Servi-Plus.                            │
│                                                                          │
│         [⬇ Baixar arquivo original]   [Tentar novamente]                │
│                                                                          │
└───────────────────────────────────────────────────────────────────────┘
```

**Variantes de motivo (microcopy):**
- `INVALID_TIRVU_HEADER` → "Layout do arquivo não reconhecido como Tirvu padrão..."
- `TIMED_OUT` → "Importação ultrapassou 15 minutos sem progresso. O sistema cancelou automaticamente. Tente dividir o arquivo em partes menores."
- `FILE_CORRUPT` → "Arquivo .xlsx corrompido ou ilegível."
- `INTERNAL_ERROR` → "Erro inesperado no servidor. Suporte foi notificado automaticamente. ID do job: {jobId}"

**Comportamento:**
- "Baixar arquivo original" → permite recuperar o arquivo subido (útil se Bruno apagou local)
- "Tentar novamente" → reset state, volta para step=upload (mantém tenant alvo selecionado por conveniência)
- Background sutil red-50 (não vermelho gritante — operador já leu "falhou")

## 3. Step 11 — Component Strategy

### 3.1. Component inventory

**Reuso direto de shadcn/ui já em V3:**

| Componente shadcn/ui | Onde usado | Customização |
|---|---|---|
| `Button` | Todos botões de ação | variants: default, outline, destructive |
| `Card` | Cards de contagem | size compact (px-3 py-2) |
| `Dialog` | Modal de confirmação, modal "ver formato esperado" | focus trap nativo, Esc handle |
| `Input` | Confirm-typing tenant name | variant default |
| `Select` | Tenant picker (SuperAdmin) | shadcn Select com search se >10 tenants |
| `Badge` | Status de linha (criar/atualizar/inválido/etc.) | 6 variants custom (cores acima) |
| `Progress` | Barra de progresso linear | apenas componente padrão |
| `Tabs` ou `RadioGroup` | "Criar todas / Decidir caso a caso" | RadioGroup |
| `Skeleton` | Loading da tabela | 10 rows fantasma |
| `Tooltip` | Info icons em todos labels | trigger hover/focus, delay 200ms |
| `Alert` | Banner do tenant | custom porque precisa fixed top |

**Componentes novos necessários:**

| Componente novo | Implementação | Onde |
|---|---|---|
| `<ImportTenantBanner />` | div fixed top, custom styling, role="alert" | `components/imports/` |
| `<ImportDropzone />` | Wrapper de `react-dropzone` com states (idle/dragover/uploading/error) | `components/imports/` |
| `<ImportPreviewTable />` | Wrapper de `@tanstack/react-virtual` com expand de diff/errors | `components/imports/` |
| `<ImportStatusBadge />` | 6 variants (criar/atualizar/inválido/ausente/reativação/sem-alteração) com ícone+label | `components/imports/` |
| `<ImportConfirmModal />` | Dialog com confirm-typing tenant + lista de operações | `components/imports/` |
| `<ImportProgressView />` | Layout de progress bar + counters + estimated time | `components/imports/` |
| `<DiffRow />` | Render "campo: de → para" expansível | `components/imports/` (sub-componente) |

**Sidebar entry (modificação em `components/Sidebar.tsx`):**
- Ícone: `lucide-react: Upload` (24×24, stroke 2px) — bate com microcopy "Importar"
- Label: "Importações" (parent collapsível, sob seção "Admin" para SuperAdmin / "Configurações" para TenantAdmin)
- Sub-itens:
  - "Colaboradores" → `/admin/imports/employees` ou `/settings/imports/employees`
  - "Histórico" (Phase 2 — placeholder no MVP, aparece desabilitado com tooltip "Em breve")
- Posição: depois de "Colaboradores" no menu, antes de "Configurações"

### 3.2. State management strategy

Per architecture D10:
- **Single source of truth:** `useReducer` no componente `<ImportEmployeesFlow />` (state owner)
- **Custom hook `use-import-flow.ts`** encapsula reducer + URL sync + TanStack Query mutations/queries
- **URL state:** `?step=upload|preview|applying|done&jobId=...&tenantId=...` para sobreviver refresh
- **Sub-components recebem `(state, dispatch)` via props** — sem context global, sem Redux

**Não usar:**
- ❌ Zustand/Jotai/Redux — useReducer + URL state basta
- ❌ React Query Cache para state de UI — só para server state
- ❌ Local Storage para state intermediário — URL é mais shareable

### 3.3. Loading states pattern

| State | Visual |
|---|---|
| Idle (esperando ação) | Componente final renderizado normal |
| Uploading binário | `<Progress value={percent} />` linear no dropzone |
| Parsing/Validating server-side | Skeleton da tabela com shimmer + texto "Lendo planilha..." |
| Polling status | Componente atual permanece, sem flicker (TanStack Query keepPreviousData) |
| Network error | Toast vermelho + retry button + estado preservado (não perde upload) |

### 3.4. Error handling pattern (UX)

| Tipo | Como exibir |
|---|---|
| Validação client-side (file > 10MB) | Inline no dropzone, vermelho, antes de subir |
| Erro de upload (network, server 500) | Toast vermelho com retry button, mantém arquivo selecionado |
| Header inválido (server 400) | Tela de upload com banner vermelho persistente até novo upload |
| Linha inválida (parse OK mas validation fail) | Badge ⚠ Inválido na tabela; expand mostra motivo; ignorada no apply |
| Job timeout (>15min) | Estado #4b com motivo TIMED_OUT |
| Job stuck/server crash mid-apply | Estado #4b com motivo INTERNAL_ERROR + ID do job para suporte |

### 3.5. Empty states

| Onde | Mensagem |
|---|---|
| `/admin/imports/employees` no primeiro acesso | (sem empty state — vai direto para upload form) |
| Tenant picker sem tenants | "Nenhum tenant ativo. Crie um tenant primeiro em /admin/tenants." (raríssimo, prevenção) |
| Filter ativo na tabela sem matches | "Nenhuma linha com este status." dentro da tabela |
| 942 sem alterações filter | "942 colaboradores na planilha já estão idênticos no sistema." |

## 4. Step 12 — UX Patterns Específicos

### 4.1. Banner do tenant alvo (D10 + NFR23)

**Anatomia:**
```
+─────────────────────────────────────────────────────────────────+
|  📂 IMPORTANDO PARA: SERVI-PLUS                       [✕ Cancelar]  |
+─────────────────────────────────────────────────────────────────+
   ↑                  ↑                                  ↑
   ícone DB           nome em 18px bold (AAA)          escape hatch
   24px               cor branca em bg-blue-600
```

**Tokens:**
- Height: 40px
- Background: `bg-blue-600` (`#2563EB`) — contraste branco ≥7:1 ✅
- Padding: `px-4 py-2`
- Position: `fixed top-0 left-0 right-0 z-40` (acima do conteúdo, abaixo do shadcn Toaster z-50)
- Animação: slide-down 200ms ao montar (ease-out)

**A11y:**
- `role="alert" aria-live="assertive"` — leitores de tela anunciam ao mudar
- Ao mudar de tenant na seleção (raro — usuário voltaria pro upload), anúncio: "Tenant alvo alterado para Servi-Plus"
- Botão Cancelar é focusable, Tab ordering correto

**Quando aparece:**
- Apenas em variação SuperAdmin
- Apenas durante steps 2/3/4 (preview/applying/done) — não em step 1 (upload), porque tenant ainda nem foi selecionado
- Reaparece em refresh da página se `tenantId` está na URL

### 4.2. Tabela virtualizada com diff expansível

**Performance contract (NFR5):**
- Render de 5.000 linhas em DOM = ~30 visíveis no viewport, resto virtualizado
- Scroll a 60fps sustentados — no jank
- Filter chip click = re-filtra dataset em memória (<100ms para 5k rows)

**Linha collapsed:**
```
| 47 | JOSÉ MARIA SILVA | ***.123.456-78 | ANATEL | ✚ Criar | ▼ |
```

**Linha expanded (update):**
```
| 12 | JOÃO PEREIRA | ***.987.654-32 | TRT-DF | ✎ Atualizar | ▲ |
       └─ 3 alterações:
          • Salário: R$ 1.500,00 → R$ 1.700,00         [+13.3%]
          • Jornada: ANATEL 2ª-6ª 8h → TRT 2ª-5ª 9h
          • Cargo: AUX OPER → TÉC OPER
```

**Linha expanded (invalid):**
```
| 47 | JOSÉ MARIA SILVA | XXX.XXX.XX-X | ANATEL | ⚠ Inválido | ▲ |
       └─ Erros:
          • CPF: dígito verificador inválido
          • Data de admissão: formato esperado dd/MM/yyyy, recebido "agosto/2025"
```

**Comportamento:**
- Click em qualquer parte da linha → toggle expand (não só no chevron — area clicável grande)
- Múltiplas linhas podem estar expandidas simultaneamente
- Keyboard: Enter ou Space na linha focada → toggle
- Ícone chevron rotaciona 180° em expand (transição 150ms)
- Diff de salário: setas indicando direção do delta + percentual entre colchetes

### 4.3. Progress polling UX

**Smoothing strategy:**
- Polling traz `rowsProcessed` do server a cada 2s (pode dar saltos: 0→0→100→200→200→350)
- Client interpola visualmente entre polls usando `requestAnimationFrame` para barra mover suavemente
- Counters de criados/atualizados não interpolam — só mostram último valor recebido
- Tempo estimado restante é client-derived, não server-derived (ETA = `elapsed/processed * remaining`)

**Refresh resilience:**
- Operador refresh page durante APPLYING → URL state preserva, polling retoma
- Browser fecha → volta depois → URL no histórico tem `jobId`, tela mostra estado atual (até concluído)

### 4.4. Confirmação por digitação (modal)

**Padrão GitHub-style** (similar ao "type repository name to delete"):
- Input desabilitado por default ("Digite Servi-Plus para confirmar")
- Match exato (trim + case-sensitive) habilita botão "Confirmar"
- Mismatch mostra subtle red border + helper text "O nome não confere"
- Reduz risco de Bruno's edge case (Journey 1B — subir planilha errada)

**Por que case-sensitive:**
- Tenant names são proper nouns, capitalização importa
- Forçar exatidão = forçar atenção (não digitar no piloto automático)

### 4.5. Sidebar entry (modificação V3)

**Hover-expand pattern (memory: padrão V3):**
- Sidebar collapsed por default (icons only, 56px wide)
- Hover sobre sidebar → expande para 220px com labels
- Item "Importações" tem chevron ▶ que vira ▼ ao expandir grupo
- Sub-itens indentados (16px) com ícone menor (16×16)

**Active state:**
- Item ativo: bg-primary-100, text-primary-700, border-l-2 border-primary-600
- Sub-item ativo: bg-primary-50, text-primary-900, dot indicator à esquerda

### 4.6. "Auto-explicativa" pattern (memory: Bruno preferência)

**Regras consistentes:**
- Todo label de campo crítico tem `<InfoIcon />` ao lado (lucide-react `Info`, 14×14)
- Click ou hover no info icon → tooltip com 1-2 frases explicativas
- Tooltips delay 200ms (não aparecem no scroll acidental)
- Em mobile: tap → modal "Sobre este campo"

**Exemplos desta feature:**
- "Tenant alvo ⓘ" → "Os colaboradores serão criados/atualizados neste tenant."
- "Lotações novas detectadas ⓘ" → "Lotações são gerenciadas em /workplaces. Importação pode criar automaticamente ou pedir confirmação per item."
- "👻 Ausente ⓘ" → "Colaborador existe no sistema mas não está nesta planilha. Pode ter sido demitido. NUNCA inativamos automaticamente — você decide depois."
- "↻ Reativação ⓘ" → "Colaborador estava marcado como demitido. A planilha indica que voltou. Default = manter inativo, você decide."

## 5. Step 13 — Responsive & Accessibility

### 5.1. Responsive strategy

**Decisão:** **Desktop-first** (PRD/Architecture já decidiu — operador usa em desktop).

**Breakpoints:**
- ≥1280px (xl): layout completo conforme wireframes acima
- 1024-1279px (lg): cards de contagem em wrap (3+3), tabela ocupa 100% width
- 768-1023px (md): banner reduz para "Importando: SERVI-PLUS" sem botão Cancelar (acessível via menu kebab)
- <768px (sm/mobile): **read-only mode** — operador pode acompanhar progresso e ver resultado, mas upload e apply são desabilitados com mensagem "Use desktop para esta operação"

**Justificativa do read-only mobile:**
- Upload de arquivo no mobile é UX hostil (file picker varia por OS, .xlsx raramente sai do email/Drive direto)
- Tabela virtualizada com 5k rows + diff em mobile não cabe sem comprometer leitura
- Operador real (Bruno, Carla) opera em desktop. Mobile é só pra checar status

### 5.2. Acessibilidade WCAG 2.1 AA (NFR20-24)

**Audit checklist específico desta feature:**

| Critério WCAG | Como atendemos |
|---|---|
| 1.1.1 Non-text Content | Todos ícones têm `aria-label` ou label de texto adjacente (NFR22) |
| 1.3.1 Info and Relationships | Tabela usa `<table>` com `<thead>/<tbody>`, role="table" implícito |
| 1.4.3 Contrast (AA) | Banner cumpre AAA (>7:1); demais textos AA (>4.5:1) — Tailwind defaults atendem |
| 2.1.1 Keyboard | Todos elementos interativos: Tab/Shift+Tab/Enter/Space/Esc — sem mouse-only |
| 2.1.2 No Keyboard Trap | Modal usa focus trap (sai com Esc); fluxo principal sem trap |
| 2.4.3 Focus Order | Tab segue ordem visual: tenant picker → dropzone → format help → footer |
| 2.4.7 Focus Visible | Outline ≥2px com contrast ≥3:1 (Tailwind `focus-visible:ring-2 ring-blue-500`) |
| 3.2.2 On Input | Selecionar tenant não muda foco automaticamente; usuário decide próximo |
| 3.3.1 Error Identification | Erros marcados com ícone + cor + texto (NFR22) |
| 3.3.3 Error Suggestion | "CPF inválido (dígito verificador não confere)" — sugere o que verificar |
| 4.1.2 Name, Role, Value | shadcn/ui já provê ARIA correto; banner adiciona role="alert" |
| 4.1.3 Status Messages | Progress bar tem `role="status" aria-live="polite"` |

**Specific patterns:**
- **Banner do tenant:** `role="alert" aria-live="assertive"` — anuncio imediato em mudança
- **Progress bar:** `role="status" aria-live="polite"` — anuncio em transições significativas (25% milestones)
- **Modal:** `role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description"`
- **Tabela:** `<caption>` invisível com "Pré-visualização de importação: 1.000 linhas, X criar, Y atualizar..."
- **Filter chips:** `role="group" aria-label="Filtrar por status da linha"` no container; cada chip é um `<button aria-pressed="true|false">`
- **Status badge na linha:** ícone com `aria-label="Status: Criar"` para leitores

### 5.3. Color blindness (NFR22)

Status colors **sempre** acompanhados de:
- Ícone distintivo (✚ ✎ ⚠ 👻 ↻ ─)
- Label de texto ("Criar", "Atualizar", "Inválido", "Ausente", "Reativação", "Sem alterações")

Validação: rodar Stark/axe-core "color blindness" simulator em todos os screenshots durante PR review.

### 5.4. Keyboard shortcuts opcionais (Phase 2)

Não implementar no MVP, mas documentar para futuro:
- `Cmd/Ctrl+U` → focus no dropzone (upload shortcut)
- `Cmd/Ctrl+Enter` → aplicar importação (no preview)
- `Esc` → cancelar (no preview)
- `Cmd/Ctrl+F` → focus no campo de filtro de tabela

### 5.5. Screen reader narrativa (Bruno usando NVDA, exemplo)

```
"Importar colaboradores, página"
"Tenant alvo, obrigatório, combobox, vazio"
[Bruno seleciona Servi-Plus]
"Servi-Plus, selecionado"
"Arquivo Tirvu xlsx, dropzone, area de upload"
[Bruno arrasta arquivo]
"Arquivo serviplus.xlsx, 2.3 megabytes, selecionado, enviando..."
"Upload completo, processando..."
"Pré-visualização carregada, alerta importante: importando para Servi-Plus"
"Cards de resumo: 47 criar, 3 atualizar, 2 inválidas, 5 ausentes, 1 reativação, 942 sem alterações"
"Tabela de pré-visualização, 1000 linhas paginadas em 20 páginas de 50"
[Bruno navega via teclado]
"Linha 1, ADLLA CRUZ DE MORAES, CPF mascarado, Anatel, status criar"
[Bruno clica Aplicar]
"Modal de confirmação aberto. Você está prestes a importar para Servi-Plus."
"Digite o nome do tenant para confirmar, campo de texto"
[Bruno digita]
"Botão Confirmar e aplicar habilitado"
[Bruno confirma]
"Importação iniciada, 0% concluído"
[a cada 25%]
"Importação 25% concluída, 250 de 1000 linhas processadas"
[final]
"Importação concluída com sucesso. 47 colaboradores criados, 3 atualizados."
```

## 6. Step 14 — Workflow Complete

### Resumo do entregável

Bruno, esta UX spec entrega:

- **4 estados visuais detalhados** com wireframes ASCII (upload/preview/applying/done success+failure)
- **2 variações** SuperAdmin vs TenantAdmin com diferenças explícitas
- **6 padrões UX específicos** (banner, virtualized table, progress polling, confirm-typing modal, sidebar entry, auto-explicativa)
- **7 componentes novos especificados** + 11 reusos shadcn/ui mapeados
- **Microcopy completa em pt-BR** (labels, errors, tooltips, placeholders, screen reader narrativa)
- **Accessibility WCAG 2.1 AA** com 12 critérios mapeados, screen reader narrativa exemplificada, color blindness coberto
- **Responsive desktop-first** com mobile read-only justificado
- **Color tokens, spacing, typography** alinhados com V3 (sidebar 220px, fonte 13px, status colors)

### Concerns flagados (não retro-divergi do PRD/Arch)

Nenhum concern crítico. PRD+Architecture estavam tão detalhados que esta UX spec foi mais elaboração visual do que descoberta nova.

**1 nice-to-have observado** (não bloqueante):
- **Confetti easter egg** no estado #4a (sucesso) é meu toque pessoal — disable se preferir mais sério/profissional. Default = on.

### Status

🎨 **UX Spec completa e pronta para implementação** ✅

Próximos passos no pipeline BMAD:
- **Re-rodar `evo-check-implementation-readiness`** agora que PRD + Architecture + UX existem (validação completa pré-Phase 4)
- Disparar **SM** via `evo-create-epics-and-stories` com refined breakdown de 5 epics (já está no IR report)
- Disparar **Dev** via `evo-dev-story` story por story
