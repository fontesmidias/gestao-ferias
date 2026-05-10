# V3.4 — Relatório Overnight V2 (Caminho 1: Operacional Pleno)

**Data:** 2026-05-08 (madrugada → manhã)
**Executor:** EVO Master + Claude Opus 4.7
**Solicitação:** Bruno escolheu Caminho 1 — Fases A + B + C completas
**Resultado:** ✅ 13 stories implementadas, 3 commits, 100% testes verdes

---

## TL;DR — O que mudou

Sistema agora tem cobertura operacional real. Você pode acordar e:

1. **Logar e ir em `/coverage`** → vê **rolling 90 dias** por padrão (resolve o
   bug de "férias futuras não apareciam"). Toggle "Por mês" ainda existe se
   você quiser focar.
2. **Bolinha de notificação no menu** agora reflete **gaps SEM cobertura**, não
   gaps totais — sem alarme falso.
3. **Predict (`/predict`)** mostra números **realistas**: o algoritmo agora
   considera férias já gozadas/programadas para QUITAR períodos passados.
   Os R$ 150 milhões viram coisa proporcional à operação real.
4. **Modal "Programar Férias"** ficou inteligente: mostra saldo CLT do
   colaborador, sugere janela ideal (período VENCIDO ou CONCESSIVO aberto),
   tem calculadora viva (digite 2 dos 3 campos start/dias/end), avisos CLT
   inline em tempo real.
5. **Sugestões de cobertura** ganharam **ranking visual com cores**:
   verde (cargo idêntico), amarelo (família compatível), cinza (cargo diferente).
   Tooltip explica o match. Badge "Encadeia" para feristas com cobertura
   adjacente.
6. **Anti-overlap rígido** em coberturas: a mesma pessoa NÃO pode estar em
   2 coberturas no mesmo período. Bloqueio com erro detalhado.
7. **Filtro "★ Apenas Feristas"** em `/employees`. Badge azul ★ ao lado do
   nome dos feristas na tabela.
8. **Painel "Feristas no Período"** em `/coverage`: lista todos os feristas
   com status Livre/Ocupado para planejamento.

---

## Para deployar na VPS

Mesmo procedimento dos turnos anteriores:

1. Portainer → Stacks → editar → **Re-pull image and redeploy**
2. Update the stack

**Sem migration.** **Sem novo env var.** Quando o backend subir, novos
endpoints estão disponíveis automaticamente.

---

## Mapa de commits (cronológico)

```
24dc45c fix(predict+coverage+sidebar): bugs criticos que impedem operacao (V3.4 FASE A)
8ad359f feat(vacations): modal Programar Ferias rico com saldo CLT + calculadora viva (V3.4 FASE B)
68dcd9d feat(coverage): operacionaliza /coverage com ranking + anti-overlap (V3.4 FASE C)
```

---

## Stories detalhadas

### FASE A — Bugs críticos (commit `24dc45c`)

#### A1: `/coverage` rolling 90d default
- **Causa-raiz:** `buildPeriodRange` travava em `startOfMonth/endOfMonth` do
  mês selecionado (default = mês atual). Você cadastrou férias para julho/agosto,
  página filtrava só maio → 0 gaps.
- **Fix:** novo `viewMode: '90d' | 'month'`, default `'90d'` (de hoje + 90d).
  Toggle visual no header. `MAX_MONTH_OFFSET` subiu de 3 para 6 meses.
- **Arquivo:** [`coverage/page.tsx`](frontend-web/src/app/coverage/page.tsx)

#### A2: Predict — `calculatePeriodsWithUsage`
- **Causa-raiz:** `VacationEngine.calculatePeriods` gerava 1 período/ano desde
  a admissão, marcando todos com `concessiveEnd` no passado como VENCIDO.
  Funcionário com 5 anos de casa = 3 vencidos contábeis fictícios. Multiplicado
  por 1k colaboradores = R$ 150M de multas absurdas.
- **Fix:** nova função `calculatePeriodsWithUsage(hireDate, requests, ...)`
  que considera VacationRequest APPROVED/PENDING/SIGNED/COMPLETED como
  consumo do saldo. Períodos com saldo zerado viram QUITADO. Predict consome
  essa variante.
- **Arquivo:** [`vacation-engine.ts:107`](backend-api/src/modules/vacations/vacation-engine.ts#L107)

#### A3: Tooltips alinhados ao cálculo real
- "Risco de Passivo": agora menciona "períodos VENCIDOS ainda não cobertos".
- "Gargalos Críticos": substitui "duplo período concessivo iminente" por
  "período vencido sem férias programadas".
- **Arquivo:** [`predict/page.tsx`](frontend-web/src/app/predict/page.tsx)

#### A4: Sidebar bolinha conta gaps NÃO cobertos
- **Antes:** badge contava todos os gaps detectados (incluindo já cobertos).
- **Depois:** filtra `hasCoverage === false`. Sem alarme falso.
- **Arquivo:** [`Sidebar.tsx`](frontend-web/src/components/Sidebar.tsx)

### FASE B — Modal Programar Férias rico (commit `8ad359f`)

#### B1: Painel de saldo CLT
- Endpoint novo: `GET /v1/employees/:id/vacation-balance` → retorna periods
  com badge colorido por status, dias disponíveis, total. Sugestão de janela
  (VENCIDO urgente > CONCESSIVO aberto).
- UI: ao selecionar colaborador, painel lateral mostra cada período com:
  badge (Aquisitivo/Concessivo/VENCIDO/Quitado), datas, dias.
- **Arquivos:** [`employees/index.ts`](backend-api/src/routes/api/v1/employees/index.ts) +
  [`ProgramVacationModal.tsx`](frontend-web/src/components/vacations/ProgramVacationModal.tsx)

#### B2: Botão "Aplicar Sugestão"
- Pré-preenche datas com janela calculada pelo backend.
- Razão explícita: "Período VENCIDO desde X, urgente (multa CLT Art. 137)" ou
  "Concessivo aberto, prazo final Y".

#### B3: Calculadora viva 3-vias
- Edita 2 dos 3 campos (start, dias, end) → o terceiro recalcula.
- Tracking via `lastEdited` para evitar loops de re-cálculo.
- Hint visual: "Edite 2 dos 3 campos — o terceiro é calculado automaticamente."

#### B4: Avisos CLT inline em tempo real
- Banner amarelo (não bloqueia, apenas avisa):
  - Início em sexta: "CLT Art. 134 §3º veda início nos 2 dias anteriores"
  - Início em sábado/domingo
  - Saldo insuficiente: "faltam X dias (saldo total disponível: Y)"
  - Período < 14 dias: "CLT Art. 134 §1º exige fração mínima de 14 dias"
- Mantém tratamento 409 overlap + 422 CLT do backend (M5/M7 do MVP anterior).

### FASE C — Operacionalização do /coverage (commit `68dcd9d`)

#### C2: Ranking visual de sugestões
- Backend `/coverages/suggestions` agora retorna cada candidato com `match`:
  ```ts
  match: { score: 1|2|3, level: 'identical' | 'family' | 'any', reason: string }
  ```
- Famílias hardcoded para Green House (config futura por tenant):
  - **limpeza:** servente, auxiliar de limpeza, ASG, copeira
  - **segurança:** vigilante, porteiro, controlador de acesso, brigadista
  - **recepção:** recepcionista, atendente, secretária, técnico em secretariado
  - **técnico:** técnico, analista, operador
  - **motorista:** motorista, condutor
- UI: badge colorido (verde/amarelo/cinza) + tooltip + cargo + escala visíveis.
- Sugestões ordenadas por score descendente.

#### C3: Anti-overlap rígido em CoverageAssignment
- POST /coverages valida `replacementEmployeeId` contra outras coberturas
  PLANNED/ACTIVE no período. **Sem override** (decisão de produto).
- Erro 409 `COVERAGE_OVERLAP` com detalhe do conflito (workplace, role,
  coveringFor).
- Frontend: toast persistente (8s) com a mensagem.

#### C4: Filtro "Apenas Feristas" em /employees
- Backend: `GET /employees?isFerista=true`.
- UI: botão toggle dedicado na toolbar de filtros (★).
- Tabela: badge azul "★ Ferista" ao lado do nome quando `isFerista=true`.

#### C5: Painel "Feristas no Período" em /coverage
- Backend novo: `GET /coverages/available-feristas?from&to` (default 30d).
- Retorna lista com `isFree` (zero coberturas no período) + count de coberturas.
- UI: painel colapsável no /coverage com badges agregados (livres/ocupados)
  e tabela detalhada (status, ferista, cargo, posto base, escala, contagem).

---

## Decisões assumidas (premissas do Caminho 1)

1. **Saldo CLT insuficiente:** bloqueio com botão "Forçar (auditado)" via
   `overrideBalance=true`. AuditLog `VACATION_PROGRAMMED` preserva trilha. ✅
2. **Anti-overlap em CoverageAssignment:** **rígido** (sem override). ✅
3. **Famílias de cargo:** lista hardcoded (limpeza/segurança/recepção/técnico/
   motorista). Pode virar config por tenant em futura iteração. ✅

Caso precise mudar alguma dessas, é trivial (config no código, não migration).

---

## Validações executadas

- ✅ `npx tsc --noEmit` (backend + frontend): 0 erros
- ✅ `npx tsx --test test/modules/*.test.ts` (backend): 321/321 verde
- ✅ `npx vitest run` (frontend): 84/84 verde
- ✅ `npm run build` (frontend Next.js 16): build OK
- ✅ Push para `main` aceito; CI vai rodar e publicar imagens GHCR
  automaticamente

---

## O que NÃO está incluso (deferido para V3.4 completo)

Estava no roadmap, foi conscientemente adiado:
- **Timeline Gantt sofisticado** com drag-and-drop (Story 4.14-4.15)
- **Encadeamento ferista para férias longas** (Story 4.3 — flag `canChain` já
  exposto pelo backend, mas UI não tem ainda o "atribuir 2-3 feristas em
  sequência")
- **Atribuição em lote** (Story 4.4)
- **Política configurável "bloquear aprovação se posto fica vago"** (4.8)
- **Famílias de cargo configuráveis por tenant** (hoje hardcoded)

---

## Observação honesta do EVO Master

Tudo testado localmente. Como sempre, o teste real é o uso. Em particular,
preste atenção em:

1. **Predict números:** ao deployar, abra `/predict` e confira se os números
   batem com a realidade (esperado: queda forte vs antes). Se ainda parecer
   alto, é provável que VacationRequests COMPLETED não estejam registradas
   suficientemente — o algoritmo confia nessas linhas para QUITAR períodos.
2. **Anti-overlap em /coverage:** se um cenário legítimo precisa override, o
   bloqueio rígido vira atrito. Avisa que eu adiciono override auditado.
3. **Famílias de cargo:** podem não cobrir 100% da Green House. Se você notar
   "cargo diferente" para casos que deveriam ser "família", me passa a lista
   e eu adiciono.
4. **Modal Programar Férias:** a calculadora viva é tricky em edge cases
   (ex: digitar dias < 0). Se algum cenário falhar visualmente, me reporte.

Bom uso, Bruno. 🌅

🧙 EVO Master — fim do turno overnight V2.
