# Story 4.2: UI Apply + Confirm Modal + Progress + Done + Error Report Download

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a operador (Bruno SuperAdmin ou Carla TenantAdmin),
I want clicar "Aplicar importação" no preview, ver modal confirm-typing repetindo o nome do tenant, acompanhar progresso real-time durante apply via polling, ver tela de sumário final com cards de resultado e baixar relatório `.xlsx` das linhas inválidas — ou em caso de falha ver tela amigável com motivo e botão "Tentar novamente",
so that eu conclua o fluxo de importação com confiança, recupere erros facilmente e finalize com clareza do que foi aplicado.

> **Escopo desta story:** estados **#2.5 (CONFIRM MODAL)** + **#3 (APPLYING)** + **#4a (DONE sucesso)** + **#4b (DONE failed)** + integração com Story 4.1 (transição de PREVIEW para CONFIRM via botão "Aplicar importação ▶" — atualmente disabled).

## Acceptance Criteria

### A. Modal de confirmação (estado #2.5)

1. **`<ImportConfirmApplyModal />` em `frontend-web/src/components/imports/`:**
   - Renderizado quando user clica "Aplicar importação ▶" no preview.
   - `role="dialog"` `aria-modal="true"` `aria-labelledby="confirm-apply-title"`.
   - Focus trap manual (mesmo padrão do `ImportConfirmCancelModal`); default focus em **"Cancelar (Esc)"**.
   - Esc fecha modal sem efeito; click no backdrop fecha.

2. **Conteúdo:**
   - Título: "Confirmar importação".
   - Block azul-50 destacado com `📂 NOME-DO-TENANT` em font-bold (AAA contrast).
   - Lista de operações em bullets:
     - "✚ Criar N colaboradores" (se `counts.create > 0`)
     - "✎ Atualizar N colaboradores" (se `counts.update > 0`)
     - "↻ Reativar N colaboradores" (se `counts.reactivation > 0`)
     - "🆕 Criar N lotações ({newWorkplaces.join(', ')})" (se `newWorkplaces.length > 0` E modo `'create-all'`)
     - "🆕 Decidir N lotações caso a caso na aplicação" (se `newWorkplaces.length > 0` E modo `'decide-each'`)
     - "⚠ Ignorar N linhas inválidas" (se `counts.invalid > 0`)
   - Texto "ⓘ Para confirmar, digite o nome do tenant:" + InfoTooltip explicando padrão GitHub-style.
   - `<input type="text">` controlado.
   - Texto "Esta ação será auditada e não pode ser desfeita automaticamente."

3. **Confirm-typing (NFR24):**
   - Match exato `case-sensitive` + `trim` do nome do tenant.
   - Botão "Confirmar e aplicar" `disabled` até match.
   - Mismatch durante digitação: borda do input em `border-red-400` + helper text "O nome não confere" em `text-red-400 text-xs`.
   - Match → input volta para borda neutra + botão habilita.

4. **TenantAdmin variation (sem confirm-typing):**
   - Para `mode === 'tenant'`, modal mais simples: pula o input "digite o nome", só revisa as operações + botões "Cancelar" + "Confirmar e aplicar" (sempre habilitado).
   - Justificativa: tenant é fixo do JWT; risco zero de aplicar no tenant errado.

5. **Submit:**
   - Click em "Confirmar e aplicar" → chama `importsApi.apply(mode, jobId, { confirmTenantName, createWorkplaces, markAbsentAsPending: false })`.
   - `confirmTenantName` enviado SEMPRE (backend valida; em modo tenant ainda exige bater com tenant.name).
   - `createWorkplaces` é `newWorkplaces` se modo `'create-all'`, senão `[]`.
   - Sucesso (200) → fecha modal + transita state para `applying`.
   - Erro 400 `INVALID_CONFIRM_TENANT_NAME` → toast "Nome não confere com o tenant alvo."
   - Erro 409 `INVALID_JOB_STATE` → toast "Job não está em PREVIEW_READY."
   - Outros erros → toast com `body.error.message`.

### B. Estado APPLYING (#3)

6. **`<ImportApplyingView />` em `frontend-web/src/components/imports/`:**
   - Renderizado quando `state.kind === 'applying'`.
   - Banner persistente do tenant continua visível em modo admin.
   - Layout centralizado (`max-w-2xl mx-auto`).

7. **Polling estendido em `usePollImportStatus`:**
   - **Não há mudança no hook em si** — Story 4.1 já cuida de `setInterval(2000)` e cleanup em terminal states.
   - O hook precisa adicionar `'APPLYING'` na lista de estados ativos (na verdade já faz polling em qualquer estado não-terminal porque só limpa interval em TERMINAL_STATUSES; APPLYING não está lá). Confirmar.

8. **Conteúdo:**
   - Título: "Aplicando importação…"
   - Progress bar linear (`<progress>` HTML estilizada): `value={rowsProcessed}` `max={totalRows}`.
   - Texto de progresso: "Processadas: {rowsProcessed} / {totalRows} linhas"
   - "Tempo decorrido: {elapsedFormatted}" (calculado do `appliedAt`).
   - "Tempo estimado restante: ~{etaFormatted}" — **só aparece após `rowsProcessed >= 100`** (estabilidade ETA). Calc: `(elapsedMs / processed) * (total - processed)`.
   - Cards de contadores parciais (4 cards): ✚ `rowsCreated`, ✎ `rowsUpdated`, ⚠ `rowsInvalid`, 👻 `rowsAbsent`.
   - Mensagem "ⓘ Você pode fechar esta aba — atualizamos a cada 2 segundos."

9. **Smoothing (UX spec §4.3):**
   - Progress bar interpola visualmente entre polls usando `requestAnimationFrame` para suavizar saltos do server.
   - Implementação: estado local `displayedProcessed` que cresce em direção a `rowsProcessed` real via `requestAnimationFrame` loop (ease-out).
   - Counters NÃO interpolam — só refletem último valor.

10. **A11y:**
    - Container com `role="status" aria-live="polite" aria-atomic="false"`.
    - Anúncios de progresso a cada **25%** (não a cada poll — over-loud). Implementar com ref que rastreia último % anunciado.

11. **Sem botão de cancelar durante APPLYING** (D5 — apply é commit point). Banner cancel button desabilitado/oculto durante step `applying`.

### C. Transição APPLYING → DONE

12. **Quando polling retorna estado terminal:**
    - `COMPLETED` → dispatch `JOB_COMPLETED` com result `'completed'` → state vai para `done` variant sucesso.
    - `FAILED` → dispatch com result `'failed'` → state `done` variant falha.
    - `TIMED_OUT` → dispatch com result `'timed_out'` → state `done` variant falha (microcopy específica).

### D. Estado DONE sucesso (#4a)

13. **`<ImportSummaryView />` em `frontend-web/src/components/imports/`:**
    - Renderizado quando `state.kind === 'done' && state.result === 'completed'`.
    - Banner do tenant continua visível em modo admin (operador pode rever).

14. **Conteúdo:**
    - Título: "✅ Importação concluída" (ícone verde-500).
    - Linhas info: "Tenant: {tenantName}" + "Concluída em {durationFormatted}" (de `appliedAt` a `completedAt`).
    - 4 cards finais: `rowsCreated`, `rowsUpdated`, `workplacesCreated`, `rowsInvalid`.
    - Linha "↻ N colaborador(es) reativado(s)." (se `counts.reactivation > 0`).
    - Linha "👻 N marcados como candidatos a inativar — revise em Colaboradores." (se `rowsAbsent > 0`) com link `/employees?filter=inactive_pending`.
    - Block warning amber "⚠ N linhas tiveram erros e foram ignoradas." (se `rowsInvalid > 0`) com botão **"⬇ Baixar relatório de erros (.xlsx)"**.

15. **Download error-report:**
    - Botão chama `window.location.href = importsApi.errorReportUrl(mode, jobId)` ou abre nova aba.
    - **Atenção:** GET error-report.xlsx exige Authorization header. URL direta não funciona porque browser não envia o token automaticamente.
    - **Solução:** fazer fetch com `HttpClient` retornando blob, usar `URL.createObjectURL(blob)` + `<a download>` programático para forçar download.
    - Helper `importsApi.downloadErrorReport(mode, jobId): Promise<void>` — encapsula fetch + blob + download trigger.

16. **Botões finais:**
    - "Ver colaboradores ▶" (variant default) → navega para `/employees?recent=true&jobId={jobId}` (TenantAdmin) ou `/employees?tenantId={tenantId}&recent=true&jobId={jobId}` (SuperAdmin).
    - "Nova importação" (variant outline) → dispatch `RESET` → volta para step=upload, limpa state.

### E. Estado DONE failed (#4b)

17. **`<ImportFailureView />` em `frontend-web/src/components/imports/`:**
    - Renderizado quando `state.kind === 'done' && state.result !== 'completed'`.
    - Banner do tenant **mantido** em modo admin para contexto.

18. **Conteúdo:**
    - Título: "❌ Importação falhou" (ícone vermelho-500).
    - Linhas info: "Tenant: {tenantName}" + "Falhou após {durationFormatted}".
    - Block info card com motivo amigável baseado em `failureReason` ou `result`:
      - `'timed_out'` → "Importação ultrapassou o tempo limite (15 minutos sem progresso). O sistema cancelou automaticamente. Tente dividir o arquivo em partes menores."
      - `failureReason === 'INVALID_TIRVU_HEADER'` → "Layout do arquivo não reconhecido como Tirvu padrão. Esperamos um cabeçalho com 46 colunas específicas."
      - `failureReason === 'FILE_CORRUPT'` → "Arquivo .xlsx corrompido ou ilegível."
      - Fallback → "Erro inesperado no servidor. Suporte foi notificado automaticamente. ID do job: {jobId}"
    - Mensagem confirmadora "ⓘ Nenhum dado foi modificado em {tenantName}."

19. **Botões:**
    - "⬇ Baixar arquivo original" (variant outline) → chama `importsApi.downloadOriginal(mode, jobId)` (helper novo — backend ainda não tem essa rota, ver Open Questions).
    - "Tentar novamente" (variant default) → dispatch `RESET` mantendo `tenantId` selecionado para conveniência (não limpa tenant).

### F. State machine + reducer

20. **Estender `useImportFlow` reducer:**
    - Action nova: `APPLY_TRIGGERED` → transita `preview` → `applying`, mantém `jobId`/`tenantId`/`tenantName`.
    - Action nova: `JOB_COMPLETED { result: 'completed' | 'failed' | 'timed_out' }` → transita `applying` → `done` ou `preview` → `done` (caso de FAILED detectado em PREVIEW_READY).
    - Action existente `RESET` reuso para "Nova importação" e "Tentar novamente" (variant: tentar novamente preserva tenant).
    - Considerar action `RETRY` para preservar tenant explicitamente.

21. **URL state estendido:**
    - `?step=applying&jobId=...&tenantId=...`
    - `?step=done&jobId=...&tenantId=...&result=completed|failed|timed_out` — adicionar param `result` se step=done.

### G. API client extension

22. **Estender `lib/imports/api.ts`:**
    - `apply(mode, jobId, body): Promise<{ status: 'APPLYING' }>` — POST `/admin/imports/${jobId}/apply` ou `/imports/${jobId}/apply` com body `{ confirmTenantName, createWorkplaces, markAbsentAsPending, reactivateAll }`.
    - `downloadErrorReport(mode, jobId): Promise<void>` — fetch authenticated + blob → trigger download `<a download="...">`.
    - `downloadOriginal(mode, jobId): Promise<void>` — análogo, **mas backend não tem rota**; deixar stub que mostra toast "Funcionalidade em breve" se rota não existir, ou criar issue para Story futura.

### H. Testes

23. **`use-import-flow.test.ts`** — adicionar 4 cases para novas actions:
    - `APPLY_TRIGGERED` transita preview → applying.
    - `APPLY_TRIGGERED` em outros states é noop.
    - `JOB_COMPLETED` transita applying → done com result.
    - `JOB_COMPLETED` no preview com result='failed' (caso de polling detectar FAILED antes de apply).

24. **`ImportConfirmApplyModal.test.tsx`** — ≥5 cases:
    - Render com lista de operações conforme counts/newWorkplaces.
    - Confirm-typing: input sem match → botão disabled; com match exato → habilita.
    - Case-sensitive: "Servi-Plus" ≠ "servi-plus".
    - TenantAdmin mode: pula input, botão sempre habilitado.
    - Esc fecha + click backdrop fecha.

25. **`ImportApplyingView.test.tsx`** — ≥3 cases:
    - Render com progress bar refletindo rowsProcessed/totalRows.
    - ETA aparece só quando rowsProcessed ≥ 100.
    - Cards de counts refletem props.

26. **`ImportSummaryView.test.tsx`** — ≥3 cases:
    - Render cards finais.
    - Botão "Baixar relatório" só aparece se rowsInvalid > 0.
    - Linha "candidatos a inativar" só aparece se rowsAbsent > 0.

27. **`ImportFailureView.test.tsx`** — ≥3 cases:
    - Microcopy varia por failureReason.
    - Result `'timed_out'` mostra mensagem específica.
    - Banner do tenant continua visível.

### I. Out-of-scope

28. ❌ Confetti easter egg (UX spec menciona, deixar para polish wave).
29. ❌ Backend `GET /admin/imports/:jobId/file` para download arquivo original (não implementado; botão fica como stub ou degraded).
30. ❌ Histórico de jobs (`/admin/imports/history` listing) — Phase 2.
31. ❌ Cancelamento durante APPLYING — D5 explicitamente proíbe.
32. ❌ Live updates via WebSocket/SSE — polling 2s mantido (NFR4).

## Tasks / Subtasks

### T1 — Estender reducer + URL state (AC: 20, 21)

- [x] T1.1 Adicionar actions `APPLY_TRIGGERED` e `JOB_COMPLETED` ao type `ImportFlowAction` em [lib/imports/use-import-flow.ts](frontend-web/src/lib/imports/use-import-flow.ts).
- [x] T1.2 Casos no reducer:
  - `APPLY_TRIGGERED`: preview → applying (mantém jobId/tenantId/tenantName).
  - `JOB_COMPLETED { result }`: applying|preview → done com result.
- [x] T1.3 `buildQuery` inclui `result` quando step=done.
- [x] T1.4 Hidratação do URL: ler `step=done&result=...` e dispatchar HYDRATE para state done.
- [x] T1.5 Adicionar action HYDRATE para applying e done (refresh durante esses estados).
- [x] T1.6 Atualizar tests reducer (+4 cases conforme AC #23).

### T2 — API client extension (AC: 22)

- [x] T2.1 `importsApi.apply(mode, jobId, body)` em [lib/imports/api.ts](frontend-web/src/lib/imports/api.ts). Tipos `ApplyBody` e `ApplyResult` em `types.ts`.
- [x] T2.2 `importsApi.downloadErrorReport(mode, jobId)` — fetch authenticated retornando blob + trigger download via `<a download>` programático. Filename do header `Content-Disposition` ou fallback `import-erros.xlsx`.
- [x] T2.3 `importsApi.downloadOriginal(mode, jobId)` — stub que faz request, e se 404 mostra toast "Download de arquivo original não disponível ainda" (backend não tem rota).

### T3 — Componente ImportConfirmApplyModal (AC: 1, 2, 3, 4, 5)

- [x] T3.1 Criar `frontend-web/src/components/imports/ImportConfirmApplyModal.tsx`. Reusar pattern de focus trap do `ImportConfirmCancelModal`.
- [x] T3.2 Block destacado com nome do tenant (`bg-blue-500/10` + font-bold).
- [x] T3.3 Lista de operações condicional baseada em counts + newWorkplaces + newWorkplacesMode.
- [x] T3.4 Confirm-typing: estado local do input + comparison + estado de borda visual.
- [x] T3.5 TenantAdmin variant: skip input, button sempre habilitado.
- [x] T3.6 Handler de submit chamando `importsApi.apply` + dispatch + tratamento de erro.

### T4 — Componente ImportApplyingView (AC: 6, 8, 9, 10, 11)

- [x] T4.1 Criar `frontend-web/src/components/imports/ImportApplyingView.tsx`.
- [x] T4.2 Progress bar `<progress>` + texto + ETA condicional (>= 100 rows).
- [x] T4.3 4 cards de counters parciais (Criados/Atualizados/Erros/Ausentes).
- [x] T4.4 Smoothing de progress bar via `requestAnimationFrame` (estado local `displayedProcessed`).
- [x] T4.5 `role="status" aria-live="polite"` + anúncios a cada 25%.
- [x] T4.6 Helper `formatDuration(ms): string` em `lib/imports/format-duration.ts` (ex.: "1m 23s", "45s").

### T5 — Componente ImportSummaryView (AC: 13, 14, 15, 16)

- [x] T5.1 Criar `frontend-web/src/components/imports/ImportSummaryView.tsx`.
- [x] T5.2 Cards finais + linhas condicionais (reativação/ausentes/inválidos).
- [x] T5.3 Botão "Baixar relatório de erros" chamando `importsApi.downloadErrorReport`.
- [x] T5.4 Botões "Ver colaboradores" + "Nova importação".

### T6 — Componente ImportFailureView (AC: 17, 18, 19)

- [x] T6.1 Criar `frontend-web/src/components/imports/ImportFailureView.tsx`.
- [x] T6.2 Mapa de microcopy por `failureReason` + fallback.
- [x] T6.3 Botões "Baixar arquivo original" (stub) + "Tentar novamente".

### T7 — Integração no ImportEmployeesFlow (AC: 12)

- [x] T7.1 Em [ImportEmployeesFlow.tsx](frontend-web/src/components/imports/ImportEmployeesFlow.tsx):
  - Adicionar state local `showConfirmApplyModal`.
  - Botão "Aplicar importação ▶" agora habilitado, abre modal.
  - Render condicional para `state.kind === 'applying'` e `state.kind === 'done'`.
  - Banner cancel button desabilitado/oculto em step=applying.
- [x] T7.2 Effect que detecta transição de jobStatus para terminal (COMPLETED/FAILED/TIMED_OUT) durante applying → dispatch `JOB_COMPLETED`.
- [x] T7.3 Modal de cancelamento NÃO permitido em step=applying (já garantido por handleCancelConfirm que checa state.kind).

### T8 — Tests (AC: 23, 24, 25, 26, 27)

- [x] T8.1 Estender `use-import-flow.test.ts` com +4 cases para novas actions.
- [x] T8.2 Criar `ImportConfirmApplyModal.test.tsx` ≥5 cases.
- [x] T8.3 Criar `ImportApplyingView.test.tsx` ≥3 cases.
- [x] T8.4 Criar `ImportSummaryView.test.tsx` ≥3 cases.
- [x] T8.5 Criar `ImportFailureView.test.tsx` ≥3 cases.

### T9 — Validação final

- [x] T9.1 `npx tsc --noEmit` 0 erros.
- [x] T9.2 `npx vitest run` — todos os tests passam (suite anterior 48 + ~17 novos = ~65).
- [x] T9.3 `npm run build` produção OK.
- [x] T9.4 `npm run lint` sem regressão vs baseline.
- [x] T9.5 Smoke manual em browser: SuperAdmin → upload → preview → confirm modal (digitando nome do tenant) → applying com progress real → done sucesso → download relatório de erros.
- [x] T9.6 Atualizar Dev Agent Record com File List + change log.

## Dev Notes

### Backend endpoints consumidos (todos prontos)

- POST `/api/v1/admin/imports/:jobId/apply` (Story 3.2) e `/imports/:jobId/apply` — body `{ confirmTenantName, createWorkplaces, markAbsentAsPending, reactivateAll }`. Validação backend de `confirmTenantName === tenant.name` (case-sensitive, trim).
- GET `/api/v1/admin/imports/:jobId/status` (Story 4.0a) e tenant variant — polling continua durante APPLYING; campos `rowsProcessed`, `rowsCreated`, `rowsUpdated`, `rowsInvalid`, `rowsAbsent`, `workplacesCreated` populados.
- GET `/api/v1/admin/imports/:jobId/error-report.xlsx` (Story 4.0b) — `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="..."`.

### Backend que NÃO tem rota (open questions)

- **GET `/admin/imports/:jobId/file`** — download do arquivo original. Não implementado nesta feature. Story 4.2 deixa botão como stub que tenta GET → 404 → toast "Download em breve". Alternativa: criar issue para Story 4.3 ou aceitar como Phase 2.

### Padrão de download autenticado (T2.2)

Browsers não enviam Authorization header em links `<a href>`. Solução padrão:

```ts
async function downloadAuthenticated(url: string, suggestedName: string) {
  const token = localStorage.getItem('token')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 204) {
    toast.info('Sem linhas inválidas para baixar.')
    return
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition')
  const filenameMatch = cd?.match(/filename="?([^";]+)"?/)
  const filename = filenameMatch?.[1] ?? suggestedName
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
```

Encapsular em `lib/imports/api.ts` para reuso.

### Smoothing do progress bar

UX spec §4.3 pede interpolação visual. Implementação simples:

```ts
const [displayed, setDisplayed] = useState(0)
useEffect(() => {
  const target = rowsProcessed
  let raf: number
  function tick() {
    setDisplayed((cur) => {
      const diff = target - cur
      if (Math.abs(diff) < 0.5) return target
      const next = cur + diff * 0.15  // ease-out
      raf = requestAnimationFrame(tick)
      return next
    })
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}, [rowsProcessed])
```

### A11y — anúncios a cada 25% (não a cada poll)

```ts
const announcedRef = useRef(0)
useEffect(() => {
  const pct = Math.floor((rowsProcessed / totalRows) * 100)
  const milestone = Math.floor(pct / 25) * 25  // 0, 25, 50, 75, 100
  if (milestone > announcedRef.current) {
    announcedRef.current = milestone
    // div com aria-live="polite" tem texto "Progresso {milestone}%" — re-render anuncia.
  }
}, [rowsProcessed, totalRows])
```

### Reducer — variantes de RESET

Story 4.1 já tem `RESET` (limpa tudo). Para "Tentar novamente" do FailureView, queremos preservar tenant. Opções:
1. Action nova `RETRY_PRESERVE_TENANT`.
2. RESET com payload opcional `{ preserveTenant: boolean }`.

Sugestão: opção 2 (menos types).

### Sidebar / Banner cancel durante APPLYING

Banner cancel button atualmente abre modal que faz POST `/cancel`. Backend rejeita cancel em APPLYING (D5). UI deve esconder/desabilitar o botão de cancel no banner durante step=applying. Adicionar prop `cancelDisabled?: boolean` ao `<ImportTenantBanner>` ou condicional no flow.

### Project Structure Notes

Files novos esperados:
- ✨ `frontend-web/src/components/imports/ImportConfirmApplyModal.tsx`
- ✨ `frontend-web/src/components/imports/ImportApplyingView.tsx`
- ✨ `frontend-web/src/components/imports/ImportSummaryView.tsx`
- ✨ `frontend-web/src/components/imports/ImportFailureView.tsx`
- ✨ `frontend-web/src/components/imports/__tests__/ImportConfirmApplyModal.test.tsx`
- ✨ `frontend-web/src/components/imports/__tests__/ImportApplyingView.test.tsx`
- ✨ `frontend-web/src/components/imports/__tests__/ImportSummaryView.test.tsx`
- ✨ `frontend-web/src/components/imports/__tests__/ImportFailureView.test.tsx`
- ✨ `frontend-web/src/lib/imports/format-duration.ts`

Files editados esperados:
- ✏️ `frontend-web/src/lib/imports/use-import-flow.ts` (actions APPLY_TRIGGERED + JOB_COMPLETED + URL result param)
- ✏️ `frontend-web/src/lib/imports/__tests__/use-import-flow.test.ts` (+4 cases)
- ✏️ `frontend-web/src/lib/imports/api.ts` (apply + downloadErrorReport + downloadOriginal)
- ✏️ `frontend-web/src/lib/imports/types.ts` (ApplyBody, ApplyResult)
- ✏️ `frontend-web/src/components/imports/ImportEmployeesFlow.tsx` (integração estados applying/done + banner cancel disable)
- ✏️ `frontend-web/src/components/imports/ImportTenantBanner.tsx` (prop cancelDisabled)

Não toca:
- backend-api/ (todas rotas prontas)
- prisma/
- docker-compose

### Mensagem de commit sugerida

```
feat(imports): UI Apply + Confirm Modal + Progress + Done + Error Report (Story 4.2)

- ImportConfirmApplyModal: focus trap, lista operações condicional,
  confirm-typing case-sensitive (NFR24), variant simples para TenantAdmin
- ImportApplyingView: progress bar com smoothing rAF, ETA a partir
  de 100 rows, 4 cards parciais, anúncios a cada 25% (a11y)
- ImportSummaryView: cards finais, link colaboradores, download
  error-report.xlsx via fetch+blob (autenticado)
- ImportFailureView: microcopy por failureReason, retry preservando
  tenant, stub download arquivo original
- Reducer: actions APPLY_TRIGGERED + JOB_COMPLETED + URL result param
- API client: apply, downloadErrorReport, downloadOriginal
- Banner cancel disabled durante APPLYING (D5: apply é commit point)
- ~17 unit tests novos (suite total ~65)
```

### References

- [PRD](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md) — journeys + UI specs
- [Architecture D5 — State Machine](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D5)
- [Architecture D10 — Frontend Architecture](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D10)
- [UX Spec — Estado #2.5 Modal](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md#24-estado-25--modal-de-confirmação-nfr24)
- [UX Spec — Estado #3 APPLYING](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md#25-estado-3--applying-job-em-execução)
- [UX Spec — Estado #4a DONE sucesso](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md#26-estado-4a--done-sucesso)
- [UX Spec — Estado #4b DONE falha](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md#27-estado-4b--done-falha)
- [UX Spec — Smoothing + a11y](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md#43-progress-polling-ux)
- [Epics — Story 4.2](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 734-788)
- Story 4.1 (done) — flow controller + reducer + polling + banner já existentes
- Story 3.2 (done) — apply pipeline backend
- Story 4.0a (done) — status polling + cancel
- Story 4.0b (done) — error-report.xlsx generator
- Story 4.1 dev: [ImportEmployeesFlow.tsx](frontend-web/src/components/imports/ImportEmployeesFlow.tsx) (referência de pattern)
- Story 4.1 reducer: [use-import-flow.ts](frontend-web/src/lib/imports/use-import-flow.ts)

### Open questions / risks

1. **Backend não tem `GET /imports/:jobId/file`** para download do arquivo original (botão do FailureView). Decidir: implementar quick rota no backend ou marcar como Phase 2 e deixar botão como stub. Recomendação: stub agora, criar issue separada.
2. **Smoothing + StrictMode em dev:** `requestAnimationFrame` deve ser limpo corretamente no cleanup; testar com React StrictMode (renders dobrados).
3. **Confetti easter egg** mencionado no UX — deixar para polish wave futura, não bloquear MVP.
4. **Banner cancel disabled vs hidden** durante APPLYING — UX spec §2.5 mostra banner SEM botão; implementação deve esconder o botão (não só desabilitar visualmente).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (skill `evo-dev-story`, 2026-05-02)

### Debug Log References

- IDE diagnostics flagaram `set-state-in-effect` em `ImportApplyingView` (announcement) e `ImportConfirmApplyModal` (clear typed name). Resolvido com `queueMicrotask(() => setX(...))` — mesmo pattern de Story 4.1.
- `react/no-access-state-in-setstate` warning resolvido movendo `announcedRef` updates pra dentro de useEffect.
- TypeScript reclamou de `onApply` não declarado em `PreviewStepProps` — adicionado prop nova.

### Completion Notes List

- ✅ T1 — Reducer estendido: actions `APPLY_TRIGGERED`, `JOB_COMPLETED`, `HYDRATE_APPLYING`, `HYDRATE_DONE`. `RESET` aceita `preserveTenant?: boolean` (usado no botão "Tentar novamente"). URL inclui `result` quando step=done.
- ✅ T2 — `importsApi.apply`, `downloadErrorReport`, `downloadOriginal` (stub). Helper `downloadAuthenticated` faz fetch com Bearer + blob + `<a download>` programático (browsers não enviam Authorization em links nativos).
- ✅ T3 — `ImportConfirmApplyModal`: focus trap reusado de Story 4.1, lista operações condicional, confirm-typing case-sensitive case admin (TenantAdmin pula), estado visual de borda red/green durante typing.
- ✅ T4 — `ImportApplyingView`: progress bar com smoothing rAF (estado local `displayedProcessed` interpolado), ETA via `estimateRemainingMs` aparece após 100 rows, 4 cards parciais, anúncios SR via state derivado em useEffect (a 25/50/75/100%).
- ✅ T5 — `ImportSummaryView`: 4 cards finais, links condicionais para "Colaboradores" (com filter inactive_pending), botão "Baixar relatório" via `downloadErrorReport`, navegação para `/employees?recent=true&jobId=...`.
- ✅ T6 — `ImportFailureView`: microcopy mapeado por `failureReason` + variant `timed_out` específica, fallback inclui jobId, botões "Baixar arquivo original" (stub) + "Tentar novamente" (preserva tenant).
- ✅ T7 — `ImportEmployeesFlow`: render condicional para applying/done variants, polling expandido para incluir applying e done (sumário precisa de status completo), banner cancel hidden durante apply/done, useEffect detecta status terminal e dispara `JOB_COMPLETED`.
- ✅ T8 — Tests: +6 reducer cases (Story 4.2 actions), `ImportConfirmApplyModal.test.tsx` (6 cases), `ImportApplyingView.test.tsx` (4 cases), `ImportSummaryView.test.tsx` (4 cases), `ImportFailureView.test.tsx` (4 cases). Suite total: **72/72** (era 48, +24 novos).
- ✅ T9 — `tsc --noEmit` 0 erros · `vitest run` 72/72 · `npm run build` produção OK · `npm run lint` 151 problemas (sem regressão vs baseline).

### File List

#### Novos (9)

- `frontend-web/src/components/imports/ImportConfirmApplyModal.tsx`
- `frontend-web/src/components/imports/ImportApplyingView.tsx`
- `frontend-web/src/components/imports/ImportSummaryView.tsx`
- `frontend-web/src/components/imports/ImportFailureView.tsx`
- `frontend-web/src/components/imports/__tests__/ImportConfirmApplyModal.test.tsx`
- `frontend-web/src/components/imports/__tests__/ImportApplyingView.test.tsx`
- `frontend-web/src/components/imports/__tests__/ImportSummaryView.test.tsx`
- `frontend-web/src/components/imports/__tests__/ImportFailureView.test.tsx`
- `frontend-web/src/lib/imports/format-duration.ts`

#### Editados (5)

- `frontend-web/src/lib/imports/use-import-flow.ts` — actions APPLY_TRIGGERED + JOB_COMPLETED + HYDRATE_APPLYING/DONE + RESET preserveTenant + URL result param
- `frontend-web/src/lib/imports/__tests__/use-import-flow.test.ts` — +6 cases
- `frontend-web/src/lib/imports/api.ts` — apply + downloadErrorReport + downloadOriginal + helper downloadAuthenticated
- `frontend-web/src/lib/imports/types.ts` — ApplyBody + ApplyResult
- `frontend-web/src/components/imports/ImportEmployeesFlow.tsx` — integração modal + applying/done renders + transição via polling + banner cancelHidden
- `frontend-web/src/components/imports/ImportTenantBanner.tsx` — prop cancelHidden

### Change Log

- **2026-05-02** — Story 4.2 implementada. Frontend completo dos estados #2.5 (confirm modal com typing), #3 (applying com progress smoothing + ETA + a11y), #4a (summary + download error-report autenticado), #4b (failure com microcopy por reason + retry preservando tenant). 9 arquivos novos + 6 editados (~1500 linhas). 24 unit tests novos (suite 72/72). Banner cancel oculto durante apply/done (D5). tsc 0 erros, build OK, lint sem regressão. Backend `GET /imports/:jobId/file` ainda não implementado — botão "Baixar arquivo original" usa stub que toast-info se 404.
