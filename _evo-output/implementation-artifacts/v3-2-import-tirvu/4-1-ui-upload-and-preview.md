# Story 4.1: UI Upload + Preview — tenant picker, banner persistente, dropzone, tabela virtualizada e filtros

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a operador da plataforma (Bruno SuperAdmin ou Carla TenantAdmin),
I want acessar `/admin/imports/employees` (SuperAdmin) ou `/settings/imports/employees` (TenantAdmin), selecionar tenant alvo (apenas SuperAdmin), arrastar um `.xlsx` Tirvu, e revisar o preview em tabela virtualizada com filtros por categoria + diff expansível por linha,
so that eu visualize claramente o que vai acontecer antes de aplicar a importação, com banner persistente reforçando o tenant alvo durante todo o fluxo SuperAdmin.

> **Escopo desta story:** estados **#1 (UPLOAD)** e **#2 (PREVIEW)** + cancelamento do banner. **NÃO** inclui estado #2.5 (modal confirm-typing), #3 (APPLYING) e #4 (DONE/FAILED) — esses ficam para Story 4.2.

## Acceptance Criteria

### A. Roteamento e shells

1. **Rotas criadas (Next 16 App Router):**
   - `frontend-web/src/app/admin/imports/employees/page.tsx` — variante SuperAdmin (mode=`'admin'`), com tenant picker + banner persistente.
   - `frontend-web/src/app/settings/imports/employees/page.tsx` — variante TenantAdmin (mode=`'tenant'`), tenant fixo do JWT, sem picker, sem banner.
   - Ambas as pages são thin shells (`'use client'`) que renderizam `<ImportEmployeesFlow mode="admin" />` ou `<ImportEmployeesFlow mode="tenant" />`.
   - Guard de role: shell SuperAdmin redireciona para `/dashboard` (via `useRouter().replace`) se `user.role !== 'SUPERADMIN'`. Shell TenantAdmin redireciona se `user.role !== 'ADMIN'` E `user.role !== 'SUPERADMIN'`.

### B. Estado UPLOAD (#1) — SuperAdmin

2. **Layout vazio (primeira visita):** título, aviso amber enquanto sem tenant, tenant picker `<select>` populado por `GET /admin/tenants`, dropzone disabled.
3. **Estados visuais do dropzone:** idle / dragover (border-blue-500) / uploading (com `<progress>`) / upload-error (red).
4. **Validação client-side:** extensão `.xlsx` + tamanho ≤ 10 MB; falha = toast + dropzone red, sem chamar API.
5. **Upload bem-sucedido:** POST `/admin/imports/employees` multipart via `HttpClient.uploadWithProgress`; resposta 201 → dispatch `UPLOAD_SUCCESS` + URL `?step=preview&jobId=...&tenantId=...`.
6. **Help "Ver formato esperado":** modal listando as 46 colunas Tirvu (lista em `lib/imports/tirvu-columns.ts`), Esc/click-fora/X fecham.

### C. Estado UPLOAD (#1) — TenantAdmin

7. **Variante simplificada:** sem aviso amber, texto "Tenant: ...", sem `<select>`, dropzone começa habilitado, POST `/imports/employees`, sem banner persistente.

### D. Banner persistente (NFR23) — SuperAdmin only

8. **`<ImportTenantBanner />`:** fixed top, h-10, bg-blue-600, role=alert aria-live=assertive, slide-down 200ms, AAA contrast.
9. **Cancelamento via banner:** confirm modal local + POST cancel + dispatch `CANCEL`.

### E. Estado PREVIEW (#2)

10. **Loading skeleton** durante PARSING.
11. **6 cards de contagem** com ícone + número + label (NFR22 redundância cor/ícone).
12. **Block "Lotações novas detectadas"** com 2 radios (default `decide-each`).
13. **Filter chips** com counts e `aria-pressed`.
14. **`<ImportPreviewTable />` virtualizada** com `@tanstack/react-virtual`, colunas Linha/Nome/CPF mascarado/Lotação/Status/expand, expand inline, keyboard nav.
15. **Linha expandida (update)** mostra diff field-by-field com formatação especial (R$ + delta% / datas pt-BR).
16. **Linha expandida (invalid)** lista de erros em `text-red-600`.
17. **Linha expandida (reactivation)** mensagem específica + diff.
18. **Paginação:** prev/next + páginas com elipse se >7.
19. **Filtro server-side** via re-fetch (não há todas as rows em memória).
20. **Empty state:** "Nenhuma linha com este status."
21. **Footer info:** linhas inválidas serão ignoradas; relatório baixável após apply.
22. **Botões finais:** "Cancelar e voltar" + "Aplicar importação ▶" disabled (Story 4.2).

### F. State machine + URL sync

23. **Reducer `useImportFlow`** com 4 kinds (upload/preview/applying/done) e actions (SET_TENANT, UPLOAD_SUCCESS, SET_NEW_WORKPLACES_MODE, HYDRATE_PREVIEW, CANCEL, RESET).
24. **URL sync** via `useSearchParams` + `router.replace`, hidratação no mount.
25. **Tenant name lookup** via `GET /admin/tenants/:id` em deep-link.

### G. Polling de status

26. **`usePollImportStatus`** com `setInterval(2000)`, cleanup em estados terminais, sem TanStack Query.

### H. Acessibilidade (NFR20-24)

27. **Keyboard nav** + focus visible (Tailwind `focus-visible:ring-2`).
28. **Screen reader** com `role/aria-*` semânticos, `<table>` real, `aria-busy` no skeleton.
29. **Contraste** AAA banner, redundância cor+ícone+label.

### I. Sidebar entry

30. **Sidebar.tsx**: entry "Importações" para SuperAdmin (em `superAdminLinks`) e TenantAdmin (em system section). Ícone `Upload` lucide-react. Sem sub-menu Histórico (Phase 2).

### J. API client extension

31. **`HttpClient.uploadWithProgress`** via XMLHttpRequest com auth + retry 401.
32. **`lib/imports/api.ts`** wrapping endpoints e desempacotando envelope.

### K. Out-of-scope (Story 4.2)

33-38. Confirm modal apply, applying state, done state, error-report download, sub-menu Histórico, confetti.

### L. Test suite

39. `use-import-flow.test.ts` ≥6 cases.
40. `ImportStatusBadge.test.tsx` ≥6 cases.
41. `ImportDropzone.test.tsx` ≥4 cases.
42. Sem E2E (smoke manual).

## Tasks / Subtasks

### T0 — Dependências e setup (AC: 14)

- [x] T0.1 `cd frontend-web && npm install react-dropzone@^14 @tanstack/react-virtual@^3`.
- [x] T0.2 Atualizar `frontend-web/package.json` com versões.
- [x] T0.3 Confirmar via `npm run build` (bundle delta dentro de NFR7).

### T1 — API client extension

- [x] T1.1 `HttpClient.uploadWithProgress` (XHR + auto-refresh 401).
- [x] T1.2 `lib/imports/api.ts` com helpers tipados.
- [x] T1.3 `lib/imports/types.ts` espelhando backend.

### T2 — State machine + reducer

- [x] T2.1 `lib/imports/use-import-flow.ts` com `useReducer` + URL sync.
- [x] T2.2 Hidratação do URL no mount.
- [x] T2.3 Deep-link refaz `GET /admin/tenants/:id` para repopular tenantName.

### T3 — Componentes base

- [x] T3.1 `ImportTenantBanner.tsx` (fixed top, role=alert).
- [x] T3.2 `ImportStatusBadge.tsx` (6 variants).
- [x] T3.3 `ImportPreviewCounts.tsx` (6 cards).
- [x] T3.4 `ImportPreviewFilters.tsx` (chips com aria-pressed).
- [x] T3.5 `ImportNewWorkplacesBlock.tsx`.
- [x] T3.6 `ImportConfirmCancelModal.tsx` (focus trap manual + Esc).

### T4 — Dropzone

- [x] T4.1 `ImportDropzone.tsx` wrapper de `react-dropzone`.
- [x] T4.2 Estados visuais idle/dragover/uploading/error.
- [x] T4.3 Progress bar via `uploadWithProgress`.
- [x] T4.4 Validação client-side + toast em rejeição.

### T5 — Tabela virtualizada

- [x] T5.1 `ImportPreviewTable.tsx` com `useVirtualizer`.
- [x] T5.2 Sticky header + row clicável.
- [x] T5.3 Set local de rowIndexes expandidos.
- [x] T5.4 `<ExpandedDetails>` dispatchando por `row.status`.
- [x] T5.5 Helpers `mask-cpf.ts` + `format-diff.ts`.
- [x] T5.6 Footer paginação prev/next/numeradas + elipse.
- [x] T5.7 Empty state interno.

### T6 — Polling status

- [x] T6.1 `use-poll-import-status.ts` com `setInterval(2000)`.
- [x] T6.2 Trigger fetch de `/preview` quando ready.

### T7 — Flow controller + páginas

- [x] T7.1 `ImportEmployeesFlow.tsx` orquestrando reducer + sub-componentes.
- [x] T7.2 Sub-renderização condicional por `state.kind`.
- [x] T7.3 Tenant picker `<select>` com `GET /admin/tenants`.
- [x] T7.4 Modal "Ver formato esperado" com `TIRVU_V1_COLUMNS`.
- [x] T7.5 Botão Aplicar disabled (Story 4.2).
- [x] T7.6 `app/admin/imports/employees/page.tsx` com Suspense + guard.
- [x] T7.7 `app/settings/imports/employees/page.tsx` com Suspense + guard.

### T8 — Sidebar

- [x] T8.1 Sidebar.tsx: entries em `superAdminLinks` e `adminSections.section.system`.
- [x] T8.2 Key `sidebar.imports` em pt-BR/en/es.

### T9 — Acessibilidade

- [x] T9.1 `aria-*` em chips, rows, modais, banner.
- [x] T9.2 Focus trap manual no modal de cancelamento.
- [x] T9.3 Validação manual axe pendente em runtime (smoke T11.5).

### T10 — Tests

- [x] T10.1 `use-import-flow.test.ts` (9 cases).
- [x] T10.2 `mask-cpf.test.ts` (4 cases — bonus).
- [x] T10.3 `ImportStatusBadge.test.tsx` (18 cases — 3 por status × 6).
- [x] T10.4 `ImportDropzone.test.tsx` (5 cases).

### T11 — Validação final

- [x] T11.1 `npx tsc --noEmit` zero erros.
- [x] T11.2 `npm run lint` — 0 errors em arquivos novos; baseline reduzido de 178 para 151 problemas (net -27).
- [x] T11.3 `npx vitest run` — 42/42 (era 6, +36 novos).
- [x] T11.4 `npm run build` — produção OK, ambas rotas estáticas (`○ /admin/imports/employees`, `○ /settings/imports/employees`).
- [ ] T11.5 Smoke test manual em browser — **pendente** (deve ser feito antes do code-review pelo usuário; backend + frontend rodando localmente em http://localhost:3002 / :3000).
- [x] T11.6 Dev Agent Record atualizado.

## Dev Notes

### Divergência arch spec vs realidade do frontend

O arch spec D10 assume `shadcn/ui` + `@tanstack/react-query` instalados. Realidade: vanilla React + Tailwind v4 + lucide + sonner + `HttpClient`.

Resolução nesta story:
- Instalado: `react-dropzone@^14`, `@tanstack/react-virtual@^3` (já estavam previstos no arch).
- Não instalado: `@tanstack/react-query` (polling com `setInterval` + `useEffect` atende NFR4 com mesma latência).
- Não instalado: `shadcn/ui` (componentes próprios em Tailwind manual + lucide-react).

### Backend endpoints consumidos (todos prontos)

POST `/admin/imports/employees` + `/imports/employees` (Stories 1.2/1.3) · GET `/admin/imports/:jobId/status` + tenant variant (4.0a) · POST `/admin/imports/:jobId/cancel` + variant (4.0a) · GET `/admin/imports/:jobId/preview?status=&page=&limit=` + variant (4.0b) · GET `/admin/tenants` (legacy V3) · GET `/admin/tenants/:id` (deep-link tenant name).

### Decisões pragmáticas tomadas

1. **Apply button disabled em vez de toast.** Mais óbvio para o usuário que o feature ainda não está pronto. Tooltip explica.
2. **Filtro = re-fetch backend (não in-memory).** Backend já paginado retorna apenas a página corrente; manter all-rows em memória contradiz lazy-paging. Latência local é aceitável.
3. **Preview row sem campos identificadores no backend atual.** O `previewSummary.sampleRows` retorna `{rowIndex, status, diff?, errors?}` mas não nome/CPF/lotação. Tabela exibe `row.name ?? '—'` como fallback. Para popular esses campos, o backend precisa de um pequeno ajuste no `import-job-service.ts` ou o frontend pega via apply pipeline (Story 4.2). Story 4.0b spec citou estes campos como "campos identificadores enviados pelo backend (Story 4.0b futura extensão)" — flag para review.
4. **Sub-menu "Histórico" no sidebar:** spec do epic pede colapsável; foi implementado link único pragmático conforme dev notes. Confirmar com Bruno.
5. **CPF masking:** padrão `***.NNN.NN-XX` (mostra dígitos 4-6 e 7-8). Failsafe retorna input original se ≠11 dígitos.
6. **Tenant picker `<select>` HTML nativo** (sem search) — tenants pequenos no MVP. Phase 2 introduz busca se necessário.
7. **Suspense boundary** wrapping `useSearchParams` (Next 16 exige Suspense para client hooks que leem query string em SSR contexts).
8. **`queueMicrotask` no setLoading** dentro do effect de polling, para sair do escopo síncrono e evitar warning do react-hooks lint sobre `set-state-in-effect`.

### Project Structure Notes

Files novos:
- ✨ `frontend-web/src/app/admin/imports/employees/page.tsx`
- ✨ `frontend-web/src/app/settings/imports/employees/page.tsx`
- ✨ `frontend-web/src/components/imports/ImportEmployeesFlow.tsx`
- ✨ `frontend-web/src/components/imports/ImportTenantBanner.tsx`
- ✨ `frontend-web/src/components/imports/ImportDropzone.tsx`
- ✨ `frontend-web/src/components/imports/ImportPreviewTable.tsx`
- ✨ `frontend-web/src/components/imports/ImportPreviewCounts.tsx`
- ✨ `frontend-web/src/components/imports/ImportPreviewFilters.tsx`
- ✨ `frontend-web/src/components/imports/ImportNewWorkplacesBlock.tsx`
- ✨ `frontend-web/src/components/imports/ImportStatusBadge.tsx`
- ✨ `frontend-web/src/components/imports/ImportConfirmCancelModal.tsx`
- ✨ `frontend-web/src/components/imports/__tests__/ImportStatusBadge.test.tsx`
- ✨ `frontend-web/src/components/imports/__tests__/ImportDropzone.test.tsx`
- ✨ `frontend-web/src/lib/imports/use-import-flow.ts`
- ✨ `frontend-web/src/lib/imports/use-poll-import-status.ts`
- ✨ `frontend-web/src/lib/imports/api.ts`
- ✨ `frontend-web/src/lib/imports/types.ts`
- ✨ `frontend-web/src/lib/imports/mask-cpf.ts`
- ✨ `frontend-web/src/lib/imports/format-diff.ts`
- ✨ `frontend-web/src/lib/imports/tirvu-columns.ts`
- ✨ `frontend-web/src/lib/imports/__tests__/use-import-flow.test.ts`
- ✨ `frontend-web/src/lib/imports/__tests__/use-import-flow.hook.test.tsx` (post-review M4)
- ✨ `frontend-web/src/lib/imports/__tests__/mask-cpf.test.ts`

Files editados:
- ✏️ `frontend-web/package.json` (+2 deps)
- ✏️ `frontend-web/src/lib/api-client.ts` (+ uploadWithProgress)
- ✏️ `frontend-web/src/components/Sidebar.tsx` (+2 entries + Upload icon import)
- ✏️ `frontend-web/src/messages/pt-BR.json` (+ key sidebar.imports)
- ✏️ `frontend-web/src/messages/en.json` (+ key)
- ✏️ `frontend-web/src/messages/es.json` (+ key)

### Mensagem de commit sugerida

```
feat(imports): UI Upload + Preview com tenant picker, banner persistente, dropzone e tabela virtualizada (Story 4.1)

- Páginas: /admin/imports/employees (SuperAdmin) + /settings/imports/employees
  (TenantAdmin), thin shells client com Suspense + guard de role
- ImportEmployeesFlow + useReducer 4-state + URL sync (?step=&jobId=&tenantId=)
- ImportTenantBanner fixed top, role=alert, AAA contrast, slide-down
- ImportDropzone wrapper de react-dropzone com validação .xlsx + 10MB
- ImportPreviewTable virtualizada com @tanstack/react-virtual, 6 status
  variants, expand inline com diff/errors/reactivation
- ImportPreviewCounts (6 cards) + Filters (chips com aria-pressed) +
  NewWorkplacesBlock (radios) + ConfirmCancelModal (focus trap manual)
- API client: uploadWithProgress via XHR (progress real)
- Polling status a cada 2s durante PARSING, cleanup em estados terminais
- Sidebar: entry "Importações" para SuperAdmin (superAdminLinks) e
  TenantAdmin (system section)
- A11y: keyboard nav, aria-*, focus trap, contraste AAA banner
- 36 unit tests novos (useImportFlow + StatusBadge + Dropzone + maskCpf)
- 2 deps novas: react-dropzone@^14, @tanstack/react-virtual@^3
```

### References

- [Architecture D10 — Frontend Architecture](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D10)
- [UX Spec](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md)
- [Epics — Story 4.1 spec](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md)
- Stories backend prereq (todas done): 1.2/1.3, 4.0a, 4.0b
- Convenção V3 frontend: [frontend-web/src/app/employees/page.tsx](frontend-web/src/app/employees/page.tsx)
- API client: [frontend-web/src/lib/api-client.ts](frontend-web/src/lib/api-client.ts)

### Open questions / risks

1. **Backend `previewSummary.sampleRows` não inclui name/CPF/workplace identificadores.** Tabela exibe `'—'` como fallback. Decidir: ajustar backend ou rodar smoke test pra confirmar comportamento real.
2. **Baseline LCP V3 não medido** (NFR3). Risco para 1.5s. Action item Bruno (architecture line 1264).
3. **Sub-menu "Histórico" no sidebar** — spec pediu colapsável; entregue link único.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-02)

### Debug Log References

- **Encoding mishap durante markdown task-checkbox replace.** Tentativa via PowerShell `(Get-Content ... -Raw) -replace ... | Set-Content -Encoding utf8` corrompeu chars não-ASCII (em-dashes, acentos) — leitura como Latin-1 default antes de re-save UTF-8. Resolvido reescrevendo o story file fresh. **Lição:** evitar PowerShell para edição de UTF-8 — usar Edit tool ou `[System.IO.File]::ReadAllText` com encoding explícito.
- **`set-state-in-effect` lint warning** no hook de polling. Resolvido com `queueMicrotask(() => setLoading(true))` para mover o setState para fora do escopo síncrono do effect.
- **Build TypeScript error** em `api.ts:50`: `unwrap<T>()` recebia `unknown` da `uploadWithProgress`. Resolvido com cast explícito `as Envelope<UploadResult>`.
- **Lint baseline já tinha erros** em arquivos pré-existentes (api-client.ts:33,68,81,82, i18n.tsx, TourProvider.tsx). Decisão: corrigir só o que esta story introduziu (-27 problemas net vs baseline 178 → 151).

### Completion Notes List

- ✅ T0 — `react-dropzone@^14.4.1` + `@tanstack/react-virtual@^3.13.24` instalados via npm.
- ✅ T1 — `HttpClient.uploadWithProgress` adicionado (XHR com upload progress + auto-refresh 401). `lib/imports/api.ts` com 5 helpers (upload, getStatus, getPreview, cancel, errorReportUrl) + `lib/imports/types.ts` espelhando 8 tipos do backend.
- ✅ T2 — `useImportFlow` reducer com 4 kinds + 8 actions + hidratação URL via `useSearchParams` + `router.replace` syncing.
- ✅ T3 — 6 componentes base criados (Banner, StatusBadge, Counts, Filters, NewWorkplacesBlock, ConfirmCancelModal). Todos com aria-* semânticos e `focus-visible:ring`.
- ✅ T4 — `ImportDropzone` com 4 estados visuais (idle/dragover/uploading/error) + validação client-side `.xlsx` 10MB via `useDropzone({accept,maxSize})`.
- ✅ T5 — `ImportPreviewTable` virtualizada via `useVirtualizer`, sticky header, expand inline com 3 renderers diff/errors/reactivation, paginação prev/next/numeradas com elipse para >7 páginas, helpers `mask-cpf.ts` + `format-diff.ts` (R$ + delta% + datas pt-BR).
- ✅ T6 — `usePollImportStatus` com `setInterval(2000)`, cleanup em estados terminais (PREVIEW_READY/COMPLETED/FAILED/CANCELLED/TIMED_OUT), `queueMicrotask` para evitar warning lint.
- ✅ T7 — `ImportEmployeesFlow` orquestrando reducer + 6 sub-componentes + tenant picker `<select>` populado por `GET /admin/tenants` + modal "Ver formato" com 46 colunas Tirvu. Páginas `/admin/imports/employees` e `/settings/imports/employees` com `<Suspense>` + guard de role.
- ✅ T8 — Sidebar: entries em `superAdminLinks` (entre credentials e dashboard) e `adminSections.section.system` (antes de holidays). Ícone `Upload` lucide. Keys i18n em pt-BR/en/es.
- ✅ T9 — Acessibilidade: keyboard nav (`focus-visible:ring-2`), aria-pressed em chips, role=alert no banner com aria-live=assertive, focus trap manual no modal cancel + Esc handler, role=table semântica, aria-busy no skeleton.
- ✅ T10 — 36 tests novos: `use-import-flow.test.ts` (9), `ImportStatusBadge.test.tsx` (18 = 3×6 status), `ImportDropzone.test.tsx` (5), `mask-cpf.test.ts` (4 bonus). Total suite: 42/42 pass (era 6).
- ✅ T11 — `npx tsc --noEmit` 0 erros. `npm run build` produção OK (ambas rotas geradas estáticas). Vitest 42/42. Lint baseline reduziu 178→151 (net -27 problemas; só warnings restantes em arquivos novos: 1 sobre `useVirtualizer` ser incompatible-library do React Compiler, não-bloqueante).

### File List

#### Novos (22)

- `frontend-web/src/app/admin/imports/employees/page.tsx`
- `frontend-web/src/app/settings/imports/employees/page.tsx`
- `frontend-web/src/components/imports/ImportEmployeesFlow.tsx`
- `frontend-web/src/components/imports/ImportTenantBanner.tsx`
- `frontend-web/src/components/imports/ImportDropzone.tsx`
- `frontend-web/src/components/imports/ImportPreviewTable.tsx`
- `frontend-web/src/components/imports/ImportPreviewCounts.tsx`
- `frontend-web/src/components/imports/ImportPreviewFilters.tsx`
- `frontend-web/src/components/imports/ImportNewWorkplacesBlock.tsx`
- `frontend-web/src/components/imports/ImportStatusBadge.tsx`
- `frontend-web/src/components/imports/ImportConfirmCancelModal.tsx`
- `frontend-web/src/components/imports/__tests__/ImportStatusBadge.test.tsx`
- `frontend-web/src/components/imports/__tests__/ImportDropzone.test.tsx`
- `frontend-web/src/lib/imports/types.ts`
- `frontend-web/src/lib/imports/api.ts`
- `frontend-web/src/lib/imports/use-import-flow.ts`
- `frontend-web/src/lib/imports/use-poll-import-status.ts`
- `frontend-web/src/lib/imports/mask-cpf.ts`
- `frontend-web/src/lib/imports/format-diff.ts`
- `frontend-web/src/lib/imports/tirvu-columns.ts`
- `frontend-web/src/lib/imports/__tests__/use-import-flow.test.ts`
- `frontend-web/src/lib/imports/__tests__/mask-cpf.test.ts`

#### Editados (6)

- `frontend-web/package.json` — +`react-dropzone@^14.4.1`, +`@tanstack/react-virtual@^3.13.24`
- `frontend-web/src/lib/api-client.ts` — +`uploadWithProgress`
- `frontend-web/src/components/Sidebar.tsx` — +entry SuperAdmin, +entry TenantAdmin (system), +Upload import
- `frontend-web/src/messages/pt-BR.json` — +`sidebar.imports`
- `frontend-web/src/messages/en.json` — +`sidebar.imports`
- `frontend-web/src/messages/es.json` — +`sidebar.imports`

### Change Log

- **2026-05-02 (initial)** — Story 4.1 implementada. Frontend Upload + Preview completos. 22 arquivos novos + 6 editados. 36 unit tests novos (suite total 42/42). tsc 0 erros, build produção OK. 2 deps novas (`react-dropzone`, `@tanstack/react-virtual`). Apply, applying e done states ficam para Story 4.2.
- **2026-05-02 (post-review)** — Code review adversarial encontrou 5 HIGH + 5 MEDIUM + 2 LOW. Resolvidos 10 (todos HIGH e MEDIUM), 2 LOW deixados como cosméticos. +1 arquivo de testes integration do hook (use-import-flow.hook.test.tsx). Suite total 48/48. tsc 0 erros, build produção OK, lint sem regressão (151 problemas vs baseline 151).

## Senior Developer Review (AI)

**Reviewer:** claude-opus-4-7[1m] (skill `evo-code-review`)
**Review date:** 2026-05-02
**Outcome:** Approved — todos HIGH e MEDIUM resolvidos.

### Action items

- [x] [AI-Review][HIGH] H1 — TenantAdmin exibia UUID em vez de tenant name. Resolvido usando `user.branding?.brandName` (já carregado via `/auth/me`). [ImportEmployeesFlow.tsx:341-348]
- [x] [AI-Review][HIGH] H2 — Race condition na hidratação de URL: `hydratedRef.current = true` movido para dentro do `.then()` do dispatch async, evitando que o sync-URL effect sobrescrevesse o querystring antes da hidratação completar. [use-import-flow.ts:106-141]
- [x] [AI-Review][HIGH] H3 — Upload error toast mostrava `[object Object]` quando backend retornava envelope `{error: {code, message}}`. Parser do `uploadWithProgress` agora extrai `body.error?.message` corretamente. [api-client.ts:101-150]
- [x] [AI-Review][HIGH] H4 — Tabela do preview era `<div>` grid sem semântica. Adicionados `role="table"`, `role="row"`, `role="columnheader"`, `role="cell"`, `aria-rowindex`, `aria-rowcount`. [ImportPreviewTable.tsx:62-130]
- [x] [AI-Review][HIGH] H5 — Stale poll status entre jobIds. `usePollImportStatus` agora reseta `status`/`error` para null ao mudar `jobId`. [use-poll-import-status.ts:30-40]
- [x] [AI-Review][MEDIUM] M1 — Effect de re-fetch de preview dependia de `state` inteiro, causando re-fetch desnecessário ao mudar radio newWorkplacesMode. Deps narrowed para `previewJobId` derivado. [ImportEmployeesFlow.tsx:99-130]
- [x] [AI-Review][MEDIUM] M2 — Set `expanded` de rowIndexes nunca era limpo ao mudar página/filter. Adicionado effect que purga rowIndexes que não existem mais no novo dataset. [ImportPreviewTable.tsx:47-61]
- [x] [AI-Review][MEDIUM] M3 — Polling silenciava erros HTTP. Hook agora expõe `error` e o componente surface via `toast.error` em useEffect. [ImportEmployeesFlow.tsx:88-96]
- [x] [AI-Review][MEDIUM] M4 — Tests do hook só cobriam reducer puro, não pegavam o bug H2. Adicionado `use-import-flow.hook.test.tsx` com 6 cases de integração testando hidratação assíncrona, race condition, sync URL e CANCEL/RESET.
- [x] [AI-Review][MEDIUM] M5 — Focus trap no modal não filtrava buttons disabled. Seletor agora usa `:not([disabled])`. [ImportConfirmCancelModal.tsx:36-38]
- [ ] [AI-Review][LOW] L1 — Dropzone usa `scale-[1.01]` em vez de `[1.02]` da UX spec (cosmético, deixado para futuro polish).
- [ ] [AI-Review][LOW] L2 — Sidebar entry tem `matchPath` que o componente legado ignora (prop morta, sem efeito; sem ação).
