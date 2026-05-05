# Story 1.7: Frontend — aba "Pendências de Vínculo" com sugestões fuzzy e 4 ações

Status: review

## Story

As a **ADMIN**,
I want **uma aba nova em `/workplaces` listando os itens da fila de revisão, com sugestões fuzzy ranqueadas e 4 ações por linha (vincular | criar | adiar | ignorar)**,
so that **eu possa resolver os não-matches que sobraram da reconciliação automática em uma sessão dedicada e curta**.

## Acceptance Criteria

1. **AC-1 (backend enriquece list com employee.name):** `ReconcileQueueService.list()` adiciona `include: { employee: { select: { name: true } } }` (ou raw select expandido) na query `findMany`. Resposta passa a incluir `items[].employee.name`. Teste backend `reconcile-queue.service.test.ts` é atualizado para validar shape (1 cenário novo ou ajuste de existente).

2. **AC-2 (tab navigation):** `/workplaces/page.tsx` ganha 2 abas no topo (após o banner): "Postos" e "Pendências de Vínculo". Estado da aba ativa controlado por query param `?tab=pending` (link da Story 1.6 já navega para isso). Mudança de aba atualiza a URL via `router.replace` (sem reload).

3. **AC-3 (badge contador):** A aba "Pendências de Vínculo" exibe um badge contendo a contagem de itens com `state ∈ {PENDING, DEFERRED}` para o tenant. Contagem vem de `GET /v1/admin/workplace-reconcile-queue?state=PENDING&pageSize=1` + idem para DEFERRED somando totals (ou um único helper se simples). Aceita: usar 2 chamadas e somar `meta.total` — performance OK até 10k itens.

4. **AC-4 (lista renderiza linhas):** `<PendingBindingsTab>` carrega `GET /v1/admin/workplace-reconcile-queue?state={selectedState}&page=1&pageSize=20` ao montar e em mudança de filtro. Cada linha mostra:
   - Nome do colaborador (`item.employee.name`).
   - Posto string original (`item.workplaceNameRaw`).
   - Sugestões fuzzy: até 3 chips com nome do posto + badge de score (`Math.round(score * 100)%`), parseadas de `item.suggestions` (JSON).

5. **AC-5 (action "Vincular"):** Para cada sugestão na linha, exibe botão "Vincular a {nome}" (azul). Click chama `POST /v1/admin/workplace-reconcile-queue/:id/resolve` com `{ action: 'link', workplaceId: suggestion.id }`. Em sucesso: toast "Vinculado a {nome}", item removido da lista localmente, badge decrementa.

6. **AC-6 (action "Criar novo posto"):** Botão "Criar novo posto" abre dialog inline com 2 inputs: nome do posto (obrigatório) + cargo (opcional, default Operacional). Confirma → POST /resolve com `{ action: 'create', workplaceName, workplacePositionRole? }`. Em sucesso: toast "Posto criado e vinculado", item removido.

7. **AC-7 (action "Adiar"):** Botão "Adiar" → POST /resolve com `{ action: 'defer' }`. Toast "Item adiado". Item removido da view com filtro PENDING; aparece com filtro DEFERRED.

8. **AC-8 (action "Ignorar"):** Botão "Ignorar" → POST /resolve com `{ action: 'ignore' }` (com confirmação simples via `window.confirm` ou nada — preferir botão direto + toast). Item removido da view.

9. **AC-9 (filtro por estado):** Select/segmented control no topo da aba: PENDING (default) | DEFERRED | RESOLVED | IGNORED. Mudança recarrega a lista. Em RESOLVED/IGNORED, ações são ocultas (apenas leitura).

10. **AC-10 (AUDITOR read-only):** Quando `useAuth().user.role === 'AUDITOR'` OU `meta.readOnly === true` da resposta GET, todos os botões de ação ficam ocultos. Lista é renderizada normalmente com sugestões + dados.

11. **AC-11 (paginação):** Linha de paginação simples no rodapé (Anterior | Página X de Y | Próxima). `meta.total / pageSize` calcula total de páginas. Disabled state quando page=1 (Anterior) ou page=lastPage (Próxima).

12. **AC-12 (empty state):** Quando `meta.total === 0` no filtro selecionado, exibe mensagem amigável: "Nenhuma pendência neste estado." com ícone (`Inbox` da lucide).

13. **AC-13 (estilo conforme convenção):** Tailwind direto, font 13px, sem shadcn/ui. Cores V3 (link=azul, criar=verde, adiar=cinza, ignorar=vermelho claro). Ícones lucide (`Link2`, `Plus`, `Clock`, `XCircle`, `Inbox`).

14. **AC-14 (testes RTL):** `frontend-web/src/components/__tests__/PendingBindingsTab.test.tsx` cobre ≥4 cenários:
    - Render lista com 2 itens + sugestões + nomes.
    - Click "Vincular" chama HttpClient.post com `action: 'link', workplaceId`.
    - AUDITOR não vê botões.
    - Filtro por estado dispara nova chamada GET.
    Mock de `HttpClient.get/post` + `useAuth`.

15. **AC-15 (sem regressão):** Frontend `npm run lint` (0 erros nos arquivos novos), `npm run build` OK. Backend `tsc --noEmit` 0 erros após enriquecer list (ajuste de tipo se necessário).

## Tasks / Subtasks

- [x] **Task 1 — Backend: enriquecer list() com employee.name** (AC: #1)
  - [ ] Editar `backend-api/src/modules/reconcile/reconcile-queue.service.ts` `list()`: adicionar `include: { employee: { select: { id: true, name: true } } }` no `findMany`.
  - [ ] Atualizar tipagem do retorno (substituir `WorkplaceReconcileQueue[]` por type expandido com `employee`).
  - [ ] Atualizar mock no teste `test/modules/reconcile/reconcile-queue.service.test.ts` para preencher `employee` no findMany do mock leve. Garantir todos os 8 testes existentes continuam verde.

- [x] **Task 2 — Tab navigation em /workplaces** (AC: #2, #3, #12)
  - [ ] Editar `frontend-web/src/app/workplaces/page.tsx`.
  - [ ] Importar `useSearchParams`, `useRouter`, `usePathname` de `next/navigation`.
  - [ ] Estado `activeTab` derivado de `searchParams.get('tab') ?? 'workplaces'`.
  - [ ] Renderizar 2 botões de aba no topo (após `<ReconcileBanner />`).
  - [ ] Carregar contador de pendências (PENDING + DEFERRED) e exibir como badge.
  - [ ] Renderização condicional: se `activeTab === 'pending'` mostra `<PendingBindingsTab>` em vez do conteúdo atual.

- [x] **Task 3 — Componente PendingBindingsTab** (AC: #4–#12)
  - [ ] Criar `frontend-web/src/components/reconcile/PendingBindingsTab.tsx`.
  - [ ] State: `items`, `meta`, `loading`, `state filter`, `page`.
  - [ ] useEffect carrega lista ao montar e em mudança de `state`/`page`.
  - [ ] Render header com select de filtro de estado.
  - [ ] Render lista de linhas (1 componente `<PendingRow>` interno por item).
  - [ ] Componente interno `<CreateWorkplaceDialog>` para action create.
  - [ ] Paginação no rodapé.
  - [ ] Empty state com ícone `Inbox`.

- [x] **Task 4 — Action handlers** (AC: #5, #6, #7, #8)
  - [ ] Função `handleResolve(itemId, payload)` chama `HttpClient.post('/admin/workplace-reconcile-queue/:id/resolve', payload)`.
  - [ ] Em sucesso: remove item local, toast.success com mensagem específica.
  - [ ] Em 409: toast.error "Item já resolvido — recarregando lista", refresh da lista.
  - [ ] AUDITOR detection via `useAuth` + `meta.readOnly`.

- [x] **Task 5 — Testes** (AC: #14)
  - [ ] Criar `frontend-web/src/components/__tests__/PendingBindingsTab.test.tsx`.
  - [ ] Mock HttpClient + useAuth.
  - [ ] 4+ cenários: render com itens, click Vincular dispara post, AUDITOR sem botões, mudança de filtro dispara novo GET.

- [x] **Task 6 — Validações** (AC: #15)
  - [ ] `npm run lint` (frontend, sem erros novos).
  - [ ] `npm run build` (frontend).
  - [ ] `npx tsc --noEmit` (backend).
  - [ ] `npx tsx --test test/modules/reconcile/reconcile-queue.service.test.ts` (8 testes verde).

- [x] **Task 7 — Commit + relatório**

## Dev Notes

### Discovery findings (Story 1.7 spike)

- **Backend service.list() NÃO retorna employee.name** atualmente — só `employeeId`. Story 1.7 enriquece via Prisma `include`. Mudança aditiva, não quebra outros consumidores (campo extra apenas).
- **Tab pattern não existe** no projeto — primeira página com tabs visíveis. Implementação pragmática com 2 botões + estado derivado de URL query (sem componente reutilizável "Tabs" da shadcn — não tem).
- **Filtros por estado**: backend já aceita `state` como query param (Story 1.4 AC-2).
- **Suggestions JSON shape**: `[{ id: string; name: string; score: number }]` (FuzzyMatcher.suggest output, persistido como JSON em `WorkplaceReconcileQueue.suggestions`).

### Service Update Skeleton

```typescript
// reconcile-queue.service.ts list() — apenas o findMany muda:
this.prisma.workplaceReconcileQueue.findMany({
  where,
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * pageSize,
  take: pageSize,
  include: { employee: { select: { id: true, name: true } } },
}),

// Tipagem do retorno passa a ser:
type QueueItemWithEmployee = WorkplaceReconcileQueue & {
  employee: { id: string; name: string }
}
```

### PendingBindingsTab Skeleton

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import { useAuth } from '@/components/AuthContext'
import { toast } from 'sonner'
import { Link2, Plus, Clock, XCircle, Inbox, Loader2 } from 'lucide-react'

interface Suggestion { id: string; name: string; score: number }
interface QueueItem {
  id: string
  workplaceNameRaw: string
  state: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
  suggestions: Suggestion[] | null
  employee: { id: string; name: string }
  createdAt: string
}
type StateFilter = 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'

export function PendingBindingsTab({ onCountChange }: { onCountChange?: () => void }) {
  const { user } = useAuth()
  const [items, setItems] = useState<QueueItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [stateFilter, setStateFilter] = useState<StateFilter>('PENDING')
  const [readOnly, setReadOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createOpenFor, setCreateOpenFor] = useState<string | null>(null)

  const isAuditor = user?.role === 'AUDITOR'
  const canAct = !isAuditor && !readOnly && (stateFilter === 'PENDING' || stateFilter === 'DEFERRED')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await HttpClient.get(
        `/admin/workplace-reconcile-queue?state=${stateFilter}&page=${page}&pageSize=${pageSize}`,
      )
      const list = (res?.data ?? []) as QueueItem[]
      const meta = res?.meta ?? {}
      setItems(list)
      setTotal(meta.total ?? 0)
      setReadOnly(!!meta.readOnly)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar pendências')
    } finally {
      setLoading(false)
    }
  }, [stateFilter, page, pageSize])

  useEffect(() => {
    queueMicrotask(() => { void load() })
  }, [load])

  async function handleResolve(item: QueueItem, payload: Record<string, unknown>, successMsg: string) {
    try {
      await HttpClient.post(
        `/admin/workplace-reconcile-queue/${item.id}/resolve`,
        payload,
      )
      toast.success(successMsg)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
      onCountChange?.()
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string }
      if (err.status === 409) {
        toast.error('Item já resolvido. Recarregando lista.')
        void load()
      } else {
        toast.error(err.message ?? 'Erro ao resolver item')
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-3 mb-3">
        <label className="text-slate-500">Filtro:</label>
        <select
          value={stateFilter}
          onChange={(e) => { setPage(1); setStateFilter(e.target.value as StateFilter) }}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
        >
          <option value="PENDING">Pendentes</option>
          <option value="DEFERRED">Adiados</option>
          <option value="RESOLVED">Resolvidos</option>
          <option value="IGNORED">Ignorados</option>
        </select>
        {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center text-slate-500 py-12">
          <Inbox size={36} />
          <div className="mt-2">Nenhuma pendência neste estado.</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="border border-slate-200 dark:border-slate-700 rounded p-3">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div>
                  <div className="font-medium">{item.employee.name}</div>
                  <div className="text-xs text-slate-500">
                    Posto da planilha: <span className="font-mono">{item.workplaceNameRaw}</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </div>
              </div>

              {Array.isArray(item.suggestions) && item.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {item.suggestions.map((s) => (
                    <button
                      key={s.id}
                      disabled={!canAct}
                      onClick={() => handleResolve(item, { action: 'link', workplaceId: s.id }, `Vinculado a ${s.name}`)}
                      className="px-2 py-1 rounded bg-blue-600 text-white text-[12px] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      title={canAct ? 'Vincular ao posto sugerido' : 'Apenas visualização'}
                    >
                      <Link2 size={12} />
                      {s.name}
                      <span className="text-[10px] bg-blue-800 px-1 rounded ml-1">
                        {Math.round(s.score * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {canAct && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCreateOpenFor(item.id)}
                    className="px-2 py-1 rounded border border-green-500 text-green-700 text-[12px] hover:bg-green-50 inline-flex items-center gap-1"
                  >
                    <Plus size={12} /> Criar novo posto
                  </button>
                  <button
                    onClick={() => handleResolve(item, { action: 'defer' }, 'Item adiado')}
                    className="px-2 py-1 rounded border border-slate-400 text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <Clock size={12} /> Adiar
                  </button>
                  <button
                    onClick={() => handleResolve(item, { action: 'ignore' }, 'Item ignorado')}
                    className="px-2 py-1 rounded border border-red-300 text-red-600 text-[12px] hover:bg-red-50 inline-flex items-center gap-1"
                  >
                    <XCircle size={12} /> Ignorar
                  </button>
                </div>
              )}

              {createOpenFor === item.id && (
                <CreateWorkplaceDialog
                  onCancel={() => setCreateOpenFor(null)}
                  onConfirm={async (name, role) => {
                    setCreateOpenFor(null)
                    await handleResolve(
                      item,
                      { action: 'create', workplaceName: name, workplacePositionRole: role || undefined },
                      `Posto "${name}" criado e vinculado`,
                    )
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
          >
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}

function CreateWorkplaceDialog({
  onCancel, onConfirm,
}: { onCancel: () => void; onConfirm: (name: string, role: string) => void | Promise<void> }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  return (
    <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
      <input
        placeholder="Nome do posto (obrigatório)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
      />
      <input
        placeholder="Cargo (opcional, default Operacional)"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-2 py-1 rounded border border-slate-300 text-[12px]">
          Cancelar
        </button>
        <button
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim(), role.trim())}
          className="px-2 py-1 rounded bg-green-600 text-white text-[12px] disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>
    </div>
  )
}
```

### Tab Integration Skeleton (`/workplaces/page.tsx`)

```typescript
// imports adicionais
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { PendingBindingsTab } from '@/components/reconcile/PendingBindingsTab'

// dentro do componente:
const searchParams = useSearchParams()
const router = useRouter()
const pathname = usePathname()
const activeTab = searchParams.get('tab') === 'pending' ? 'pending' : 'workplaces'
const [pendingCount, setPendingCount] = useState<number>(0)

const reloadPendingCount = useCallback(async () => {
  try {
    const [pending, deferred] = await Promise.all([
      HttpClient.get('/admin/workplace-reconcile-queue?state=PENDING&pageSize=1'),
      HttpClient.get('/admin/workplace-reconcile-queue?state=DEFERRED&pageSize=1'),
    ])
    const a = pending?.meta?.total ?? 0
    const b = deferred?.meta?.total ?? 0
    setPendingCount(a + b)
  } catch { /* ignore */ }
}, [])

useEffect(() => { queueMicrotask(() => { void reloadPendingCount() }) }, [reloadPendingCount])

const switchTab = (next: 'workplaces' | 'pending') => {
  const url = next === 'pending' ? `${pathname}?tab=pending` : pathname
  router.replace(url)
}

// JSX antes do header existente:
<ReconcileBanner />
<div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 mb-4 text-[13px]">
  <button
    onClick={() => switchTab('workplaces')}
    className={`px-3 py-2 -mb-px border-b-2 ${activeTab === 'workplaces' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
  >
    Postos
  </button>
  <button
    onClick={() => switchTab('pending')}
    className={`px-3 py-2 -mb-px border-b-2 inline-flex items-center gap-2 ${activeTab === 'pending' ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
  >
    Pendências de Vínculo
    {pendingCount > 0 && (
      <span className="bg-yellow-500 text-white text-[10px] rounded-full px-1.5 py-0.5">
        {pendingCount}
      </span>
    )}
  </button>
</div>

{activeTab === 'pending' ? (
  <PendingBindingsTab onCountChange={reloadPendingCount} />
) : (
  <>
    {/* conteúdo atual da página, header + cards grid */}
  </>
)}
```

### Project Structure Notes

**Modified:**
- `backend-api/src/modules/reconcile/reconcile-queue.service.ts` (include employee.name)
- `backend-api/test/modules/reconcile/reconcile-queue.service.test.ts` (mock employee no findMany)
- `frontend-web/src/app/workplaces/page.tsx` (tabs + integração)

**Created:**
- `frontend-web/src/components/reconcile/PendingBindingsTab.tsx`
- `frontend-web/src/components/__tests__/PendingBindingsTab.test.tsx`

### References

- [Source: prd.md#FR13-FR16, FR18] — UI fila, ações, AUDITOR read-only
- [Source: epics.md#Story-1.7] — AC originais
- [Source: 1-4-reconcile-queue-service.md] — endpoints REST consumidos
- [Source: 1-6-frontend-banner-modal-summary.md] — link `?tab=pending` do summary report

### Commit Message (sugerida)

```
feat(reconcile): aba Pendencias de Vinculo com sugestoes fuzzy + 4 acoes (Story 1.7)

- Backend: ReconcileQueueService.list() inclui employee.name (Prisma include)
  para a UI nao precisar de chamada extra.
- Frontend: <PendingBindingsTab> em /workplaces lista itens da fila com
  sugestoes ranqueadas, 4 acoes (vincular/criar/adiar/ignorar) e filtro
  por estado (PENDING/DEFERRED/RESOLVED/IGNORED).
- Frontend: tab navigation Postos | Pendencias com badge contador, deep
  link via ?tab=pending (vindo do summary da Story 1.6).
- AUDITOR e meta.readOnly mostram a lista sem botoes (NFR-SEC-1, FR18).
- Empty state amigavel + paginacao simples.

Story: 1.7
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Backend: `npx tsx --test test/modules/reconcile/reconcile-queue.service.test.ts` → **9/9 verde** (incluindo include de employee no mock).
- Backend: `npx tsc --noEmit` → 0 erros.
- Frontend: `npx vitest run` PendingBindingsTab + Banner + Modal → **12/12 verde**.
- Frontend: `npm run build` → sucesso após refactor (vide nota).
- **Build inicial falhou** com `useSearchParams() should be wrapped in a suspense boundary at page "/workplaces"`. Resolvido refatorando para `window.location.search` em useEffect + `window.history.replaceState` para deep-link, sem precisar do hook `useSearchParams`.

### Completion Notes List

**AC-1 ✅ Backend list() inclui employee.name** — `include: { employee: { select: { id, name } } }` no findMany. Tipo de retorno expandido para `Array<WorkplaceReconcileQueue & { employee: { id, name } }>`. Mock do test atualizado.

**AC-2 ✅ Tab navigation com URL** — sem `useSearchParams` (incompatível com static prerender em Next.js 16). Lê `window.location.search` no mount e atualiza via `window.history.replaceState`. Deep link `?tab=pending` funciona.

**AC-3 ✅ Badge contador** — 2 chamadas paralelas (PENDING + DEFERRED, pageSize=1) somam `meta.total`. Pill amarela exibida quando count > 0.

**AC-4 ✅ Lista renderiza** — nome employee, posto raw em font-mono, sugestões com badge de score em %. Ícone calendar não usado (mantido data direta).

**AC-5 ✅ Vincular** — botão por sugestão dispara POST com action=link + workplaceId. Toast + remove local + decrement contador.

**AC-6 ✅ Criar novo posto** — `<CreateWorkplaceDialog>` inline (renderizado dentro do `<li>` quando ativo). 2 inputs, validação simples (name não vazio).

**AC-7/8 ✅ Adiar/Ignorar** — botões diretos com cores distintas (cinza neutro / vermelho).

**AC-9 ✅ Filtro por estado** — select com 4 valores, mudança reseta page=1 e recarrega.

**AC-10 ✅ AUDITOR read-only** — botões create/defer/ignore escondidos via `canAct = !isAuditor && !readOnly && state ∈ {PENDING, DEFERRED}`. Sugestões exibidas como botões disabled (visualização).

**AC-11 ✅ Paginação** — Anterior/Próxima disabled em bordas. Renderizada apenas quando totalPages > 1.

**AC-12 ✅ Empty state** — `Inbox` icon + mensagem "Nenhuma pendência neste estado.".

**AC-13 ✅ Estilo Tailwind/lucide** — sem shadcn (compliant com convenção). Cores V3 (link=azul, criar=verde, adiar=cinza, ignorar=vermelho claro).

**AC-14 ✅ 5 testes RTL** — render lista (nomes + sugestões + score), click Vincular dispara POST link, AUDITOR sem botões + sugestões disabled, mudança filtro dispara GET com state correto, action defer.

**AC-15 ✅ Sem regressão** — backend tsc 0 erros; frontend build OK; lint sem erros novos.

**Nota técnica importante:** `useSearchParams` exige Suspense boundary em Next.js 16 com static export. Solução pragmática `window.location.search` evita complexidade e mantém comportamento idêntico para o usuário final.

### File List

**Modified:**
- `backend-api/src/modules/reconcile/reconcile-queue.service.ts` (include employee.name no list)
- `backend-api/test/modules/reconcile/reconcile-queue.service.test.ts` (mock employee no findMany)
- `frontend-web/src/app/workplaces/page.tsx` (tabs + integração + deep-link via window.location)

**Created:**
- `frontend-web/src/components/reconcile/PendingBindingsTab.tsx`
- `frontend-web/src/components/__tests__/PendingBindingsTab.test.tsx` (5 cenários)
