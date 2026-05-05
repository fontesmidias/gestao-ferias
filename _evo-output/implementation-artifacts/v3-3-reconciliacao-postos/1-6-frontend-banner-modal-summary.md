# Story 1.6: Frontend — banner em /workplaces, modal de progresso, relatório-resumo

Status: review

## Story

As a **ADMIN**,
I want **um banner contextual em `/workplaces` indicando que há reconcile pendente, um modal de progresso em tempo real, e um relatório-resumo no final**,
so that **eu possa disparar e acompanhar a operação de reconciliação visualmente sem usar curl/Postman**.

## Acceptance Criteria

1. **AC-1 (preview endpoint backend):** `GET /v1/admin/reconcile/preview` (`requireAuth` + role ∈ {ADMIN, AUDITOR, SUPERADMIN}) retorna `{ data: { pendingEmployees, hasRunningJob, runningJobId? }, error: null, meta: null }` onde:
   - `pendingEmployees`: count de `Employee` no tenant com `workplace IS NOT NULL AND workplaceId IS NULL AND status != 'INATIVO'`.
   - `hasRunningJob`: true se existe `ReconcileJob` em `status ∈ {PENDING, RUNNING}`.
   - `runningJobId`: id do job ativo (se houver).

2. **AC-2 (banner condicional):** O componente `<ReconcileBanner>` carrega `GET /v1/admin/reconcile/preview` ao montar. Exibe quando `pendingEmployees > 0` E `user.role ∈ {ADMIN, SUPERADMIN}`. Oculto para `USER` ou `AUDITOR`. Oculto quando `pendingEmployees === 0`.

3. **AC-3 (banner texto + ação):** Banner mostra "Reconciliação V3.3 disponível — vincular {N} colaboradores aos seus postos" com botão "Iniciar reconciliação". Quando `hasRunningJob`, o banner muda para "Reconciliação em andamento" + botão "Ver progresso" que abre o modal já com `jobId=runningJobId`.

4. **AC-4 (modal abre + dispara):** `<ReconcileProgressModal>` ao abrir SEM `existingJobId`: chama `POST /v1/admin/reconcile`, captura `jobId`, exibe estado inicial (status='RUNNING', progressPct=0). Em 409 (`RECONCILE_JOB_ALREADY_RUNNING`), usa `meta.existingJobId` da resposta para começar a polar (não falha).

5. **AC-5 (polling 2s):** Hook `useReconcileJob(jobId)` em `frontend-web/src/lib/reconcile/use-reconcile-job.ts` faz polling a cada 2s do endpoint `GET /v1/admin/reconcile/jobs/:id` enquanto `status ∈ {PENDING, RUNNING}`. Para automaticamente em terminal states (`COMPLETED`, `FAILED`). Pattern: `setInterval` com cleanup, espelhando `usePollImportStatus`.

6. **AC-6 (barra de progresso + contadores):** Modal exibe barra de progresso visual baseada em `progressPct` (largura percentual). Abaixo, 4 contadores em tempo real: vinculados (matched, verde), pendentes de revisão (queued, azul), ignorados (ignored, cinza), erros (errors, vermelho). Cores conforme convenção V3 (covered=#22C55E, pending=#3B82F6, gap=#EF4444).

7. **AC-7 (auto-stop visual):** Quando `status='COMPLETED'`, modal substitui barra+contadores por `<ReconcileSummaryReport>` com totais finais, duração formatada (ex.: "2m 34s"), e dois botões: "Ver Pendências de Vínculo" (link para `/workplaces?tab=pending`) e "Fechar".

8. **AC-8 (FAILED handling):** Quando `status='FAILED'`, modal exibe ícone de alerta + `failureReason` truncada + botão "Fechar". Sem retry automático.

9. **AC-9 (não fecha por engano):** Modal não fecha ao clicar fora enquanto está RUNNING (proteção contra fechamento acidental). Exibe "X" no canto, mas com tooltip "Você pode fechar — o reconcile continua em background".

10. **AC-10 (estilo conforme convenção):** Componentes seguem padrão Tailwind do projeto (sem shadcn/ui — vide AGENTS.md do frontend), font 13px, espaçamento compacto, `lucide-react` para ícones (`AlertTriangle`, `RefreshCw`, `CheckCircle2`).

11. **AC-11 (integração em /workplaces):** Banner é renderizado no topo de `frontend-web/src/app/workplaces/page.tsx`, antes da listagem atual de workplaces. Não afeta a query atual `/workplaces?page=1&limit=200`.

12. **AC-12 (testes):** Testes em `frontend-web/src/components/__tests__/ReconcileBanner.test.tsx` (≥3 cenários: render com pendência, oculto sem pendência, oculto para AUDITOR/USER) e `__tests__/ReconcileProgressModal.test.tsx` (≥2: progresso renderiza com mock de polling, summary aparece em COMPLETED). Stack do projeto: vitest + @testing-library/react. Mock do `HttpClient` ou do hook `useReconcileJob`.

13. **AC-13 (sem regressão build):** `npm run lint` e `npm run build` passam no `frontend-web/`. Backend `npx tsc --noEmit` em `backend-api/` continua 0 erros (preview endpoint adicionado).

## Tasks / Subtasks

- [x] **Task 1 — Endpoint backend `/preview`** (AC: #1)
  - [ ] Adicionar handler `GET /preview` em `backend-api/src/routes/api/v1/admin/reconcile/index.ts`.
  - [ ] `requireAuth` + manual role check (USER → 403).
  - [ ] Query: `prisma.employee.count({ where: { tenantId, workplace: { not: null }, workplaceId: null, status: { not: 'INATIVO' } } })`.
  - [ ] Query running job: `prisma.reconcileJob.findFirst({ where: { tenantId, status: { in: ['PENDING','RUNNING'] } }, orderBy: { createdAt: 'desc' } })`.
  - [ ] Retornar envelope `{ data, error, meta }`.
  - [ ] Adicionar 1 teste em `test/routes/admin-reconcile.test.ts` (cenário GET /preview).

- [x] **Task 2 — Hook `useReconcileJob`** (AC: #5)
  - [ ] Criar `frontend-web/src/lib/reconcile/use-reconcile-job.ts`.
  - [ ] Espelhar `usePollImportStatus`: `setInterval` 2s, cleanup, `aliveRef`.
  - [ ] Terminal states: `COMPLETED`, `FAILED`. Para o intervalo nesses casos.
  - [ ] Exporta `{ job, error, loading }`.
  - [ ] Tipagem: `interface ReconcileJobStatus { id, status, totalEmployees, matched, queued, ignored, errors, durationMs, failureReason, progressPct }`.

- [x] **Task 3 — Componentes modal + summary** (AC: #4, #6, #7, #8, #9)
  - [ ] Criar `frontend-web/src/components/reconcile/ReconcileProgressModal.tsx`.
  - [ ] Props: `open`, `onClose`, `existingJobId?`.
  - [ ] Ao abrir: se `existingJobId`, usa direto; senão chama `POST /v1/admin/reconcile` (trata 409 lendo `meta.existingJobId`).
  - [ ] Usa hook `useReconcileJob(jobId)`.
  - [ ] Layout: header "Reconciliação", barra de progresso (div Tailwind com `width: ${pct}%`), 4 contadores em grid 4 cols.
  - [ ] Em `COMPLETED`: render `<ReconcileSummaryReport>` inline; sem fechar modal automaticamente.
  - [ ] Em `FAILED`: render bloco vermelho com `AlertTriangle` + `failureReason`.
  - [ ] Criar `ReconcileSummaryReport.tsx` (componente menor inline ou arquivo separado): mostra contadores finais + duração + 2 botões.

- [x] **Task 4 — Componente `<ReconcileBanner>`** (AC: #2, #3)
  - [ ] Criar `frontend-web/src/components/reconcile/ReconcileBanner.tsx`.
  - [ ] Importa `useAuth` para checar role.
  - [ ] Carrega preview (HttpClient.get('/admin/reconcile/preview')) em useEffect.
  - [ ] Render condicional: `pendingEmployees > 0 && role ∈ {ADMIN, SUPERADMIN}`.
  - [ ] Estado de modal aberto/fechado controlado localmente.
  - [ ] Ao concluir reconcile (callback do modal `onClose`), recarrega preview.
  - [ ] Visual: card amarelo claro (planned=#EAB308 com opacidade) com ícone `RefreshCw`, texto, botão azul.

- [x] **Task 5 — Integração em `/workplaces`** (AC: #11)
  - [ ] Editar `frontend-web/src/app/workplaces/page.tsx`.
  - [ ] Importar `<ReconcileBanner>` e renderizar antes do header existente.
  - [ ] Garantir que o banner não é exibido quando `loading` ainda está true (renderizar após fetch de workplaces).

- [x] **Task 6 — Testes** (AC: #12)
  - [ ] `frontend-web/src/components/__tests__/ReconcileBanner.test.tsx` — 3 cenários.
  - [ ] `frontend-web/src/components/__tests__/ReconcileProgressModal.test.tsx` — 2 cenários (progresso, summary em COMPLETED).
  - [ ] Mock de `HttpClient` via `vi.mock('@/lib/api-client', () => ({ HttpClient: { get: vi.fn(), post: vi.fn() } }))`.
  - [ ] Mock do `useAuth` via `vi.mock('@/components/AuthContext')`.

- [x] **Task 7 — Validações** (AC: #13)
  - [ ] `npm run lint` e `npm run build` no frontend-web (sem regressão).
  - [ ] `npx tsc --noEmit` no backend (0 erros).
  - [ ] `npx tsx --test test/routes/admin-reconcile.test.ts` (5 testes — 4 antigos + 1 preview).

- [x] **Task 8 — Commit + relatório**

## Dev Notes

### Discovery findings (Story 1.6 spike)

- **Frontend NÃO usa shadcn/ui**: o aviso em `frontend-web/AGENTS.md` deixa claro que é Next.js 16 com convenções não-padrão. Componentes são feitos com Tailwind direto + lucide-react (ver `frontend-web/src/components/`). Sem dir `components/ui/`.
- **Frontend NÃO usa TanStack Query**: padrão é `HttpClient` (custom wrapper de fetch em `frontend-web/src/lib/api-client.ts`) + `useEffect`. Polling existente segue o pattern `usePollImportStatus` (`frontend-web/src/lib/imports/use-poll-import-status.ts`) com `setInterval` 2s e terminal-state-stops.
- **Auth context:** `useAuth()` de `@/components/AuthContext` retorna `{ user: { id, email, name, role, tenantId, ...}, loading, ... }`. Roles: SUPERADMIN, ADMIN, AUDITOR, USER (string).
- **Toast:** `sonner` (`import { toast } from 'sonner'`).
- **Ícones:** `lucide-react`.
- **Backend não tem endpoint de preview** — adicionado nesta story (`GET /preview`) para evitar acoplar o frontend a 2 chamadas separadas (count + check running).
- **Testes frontend:** projeto tem `vitest` configurado; ver `frontend-web/src/components/__tests__/` para exemplos de mock de HttpClient e Auth.

### Hook Skeleton (`use-reconcile-job.ts`)

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { HttpClient } from '@/lib/api-client'

export interface ReconcileJobStatus {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  totalEmployees: number | null
  matched: number
  queued: number
  ignored: number
  errors: number
  durationMs: number | null
  failureReason: string | null
  progressPct: number
  startedAt: string | null
  completedAt: string | null
}

const TERMINAL = new Set(['COMPLETED', 'FAILED'])
const POLL_MS = 2000

export function useReconcileJob(jobId: string | null) {
  const [job, setJob] = useState<ReconcileJobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    setJob(null)
    setError(null)
    if (!jobId) {
      return () => { aliveRef.current = false }
    }
    let cancelled = false

    async function tick() {
      try {
        const res = await HttpClient.get(`/admin/reconcile/jobs/${jobId}`)
        if (cancelled || !aliveRef.current) return
        const data = res?.data ?? res
        setJob(data)
        if (TERMINAL.has(data.status) && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch (e: unknown) {
        if (cancelled || !aliveRef.current) return
        setError(e instanceof Error ? e.message : 'Erro ao consultar progresso')
      }
    }

    setLoading(true)
    tick().finally(() => { if (!cancelled && aliveRef.current) setLoading(false) })
    intervalRef.current = setInterval(tick, POLL_MS)

    return () => {
      cancelled = true
      aliveRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobId])

  return { job, error, loading }
}
```

### Banner Skeleton

```typescript
'use client'

import { useEffect, useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import { useAuth } from '@/components/AuthContext'
import { RefreshCw } from 'lucide-react'
import { ReconcileProgressModal } from './ReconcileProgressModal'

interface PreviewData {
  pendingEmployees: number
  hasRunningJob: boolean
  runningJobId?: string
}

export function ReconcileBanner() {
  const { user } = useAuth()
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [open, setOpen] = useState(false)
  const [existingJobId, setExistingJobId] = useState<string | undefined>()

  const reload = async () => {
    try {
      const res = await HttpClient.get('/admin/reconcile/preview')
      setPreview(res?.data ?? res)
    } catch {
      setPreview(null)
    }
  }

  useEffect(() => { reload() }, [])

  const role = user?.role
  const canSee = role === 'ADMIN' || role === 'SUPERADMIN'
  if (!canSee || !preview || preview.pendingEmployees === 0) return null

  const handleOpen = () => {
    setExistingJobId(preview.hasRunningJob ? preview.runningJobId : undefined)
    setOpen(true)
  }
  const handleClose = () => { setOpen(false); reload() }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 mb-3 text-[13px]">
        <div className="flex items-center gap-2">
          <RefreshCw size={16} className="text-yellow-600" />
          <span>
            {preview.hasRunningJob
              ? 'Reconciliação em andamento'
              : `Reconciliação V3.3 disponível — vincular ${preview.pendingEmployees} colaboradores aos seus postos`}
          </span>
        </div>
        <button
          onClick={handleOpen}
          className="px-3 py-1 rounded bg-blue-600 text-white text-[12px] hover:bg-blue-700"
        >
          {preview.hasRunningJob ? 'Ver progresso' : 'Iniciar reconciliação'}
        </button>
      </div>
      {open && (
        <ReconcileProgressModal
          open={open}
          onClose={handleClose}
          existingJobId={existingJobId}
        />
      )}
    </>
  )
}
```

### Modal Skeleton

```typescript
'use client'

import { useEffect, useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import { useReconcileJob } from '@/lib/reconcile/use-reconcile-job'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  existingJobId?: string
}

export function ReconcileProgressModal({ open, onClose, existingJobId }: Props) {
  const [jobId, setJobId] = useState<string | null>(existingJobId ?? null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const { job, error } = useReconcileJob(jobId)

  useEffect(() => {
    if (!open || jobId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await HttpClient.post('/admin/reconcile', {})
        if (cancelled) return
        setJobId(res?.data?.jobId ?? res?.jobId)
      } catch (e: any) {
        if (cancelled) return
        const existing = e?.body?.meta?.existingJobId ?? e?.meta?.existingJobId
        if (existing) {
          setJobId(existing)
          return
        }
        setDispatchError(e?.message ?? 'Erro ao iniciar reconciliação')
        toast.error('Erro ao iniciar reconciliação')
      }
    })()
    return () => { cancelled = true }
  }, [open, jobId])

  if (!open) return null

  const status = job?.status
  const isRunning = status === 'PENDING' || status === 'RUNNING'
  const isCompleted = status === 'COMPLETED'
  const isFailed = status === 'FAILED'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg p-5 text-[13px]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Reconciliação V3.3</h2>
          <button
            onClick={onClose}
            title={isRunning ? 'Você pode fechar — o reconcile continua em background' : 'Fechar'}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {dispatchError && (
          <div className="text-red-600 mb-2">{dispatchError}</div>
        )}
        {error && <div className="text-red-600 mb-2">{error}</div>}

        {!job && !dispatchError && <div>Iniciando…</div>}

        {job && isRunning && (
          <>
            <div className="h-2 bg-slate-200 rounded overflow-hidden mb-3">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${job.progressPct ?? 0}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {job.progressPct ?? 0}% — {job.matched + job.queued + job.ignored + job.errors}
              {' / '}{job.totalEmployees ?? '?'} colaboradores processados
            </div>
            <CountersGrid job={job} />
          </>
        )}

        {job && isCompleted && (
          <ReconcileSummaryReport job={job} onClose={onClose} />
        )}

        {job && isFailed && (
          <div className="border border-red-300 bg-red-50 rounded p-3 flex items-start gap-2">
            <AlertTriangle size={18} className="text-red-600 mt-0.5" />
            <div>
              <div className="font-medium text-red-700">Reconcile falhou</div>
              <div className="text-xs text-red-600 mt-1">{job.failureReason ?? 'Sem detalhes.'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CountersGrid({ job }: { job: { matched: number; queued: number; ignored: number; errors: number } }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Counter label="Vinculados" value={job.matched} color="text-green-600" />
      <Counter label="Pendentes" value={job.queued} color="text-blue-600" />
      <Counter label="Ignorados" value={job.ignored} color="text-slate-500" />
      <Counter label="Erros" value={job.errors} color="text-red-600" />
    </div>
  )
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 p-2 text-center">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

function formatDuration(ms: number | null) {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function ReconcileSummaryReport({
  job,
  onClose,
}: {
  job: {
    matched: number
    queued: number
    ignored: number
    errors: number
    durationMs: number | null
  }
  onClose: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 size={20} className="text-green-600" />
        <span className="font-medium">Reconciliação concluída</span>
        <span className="text-xs text-slate-500 ml-auto">{formatDuration(job.durationMs)}</span>
      </div>
      <CountersGrid job={job} />
      <div className="flex justify-end gap-2 mt-4">
        <Link
          href="/workplaces?tab=pending"
          className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          onClick={onClose}
        >
          Ver Pendências de Vínculo
        </Link>
        <button
          onClick={onClose}
          className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
```

### Backend — adicionar GET /preview

Em `backend-api/src/routes/api/v1/admin/reconcile/index.ts`, adicionar antes do `POST '/'`:

```typescript
fastify.get(
  '/preview',
  { onRequest: [fastify.requireAuth] },
  async (request, reply) => {
    const user = request.user as { tenantId?: string; role: string }
    if (!user.tenantId) {
      return reply.code(400).send({
        data: null,
        error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
      })
    }
    if (!['ADMIN', 'AUDITOR', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({
        data: null,
        error: { code: 'FORBIDDEN', message: 'Acesso restrito.' },
      })
    }

    const [pendingEmployees, runningJob] = await Promise.all([
      fastify.prisma.employee.count({
        where: {
          tenantId: user.tenantId,
          workplace: { not: null },
          workplaceId: null,
          status: { not: 'INATIVO' },
        },
      }),
      fastify.prisma.reconcileJob.findFirst({
        where: { tenantId: user.tenantId, status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return {
      data: {
        pendingEmployees,
        hasRunningJob: !!runningJob,
        runningJobId: runningJob?.id,
      },
      error: null,
      meta: null,
    }
  },
)
```

### Project Structure Notes

**Frontend (created):**
- `frontend-web/src/lib/reconcile/use-reconcile-job.ts`
- `frontend-web/src/components/reconcile/ReconcileBanner.tsx`
- `frontend-web/src/components/reconcile/ReconcileProgressModal.tsx` (inclui `ReconcileSummaryReport` + `CountersGrid` no mesmo arquivo ou separado conforme preferência)
- `frontend-web/src/components/__tests__/ReconcileBanner.test.tsx`
- `frontend-web/src/components/__tests__/ReconcileProgressModal.test.tsx`

**Frontend (modified):**
- `frontend-web/src/app/workplaces/page.tsx` (importa + renderiza banner no topo)

**Backend (modified):**
- `backend-api/src/routes/api/v1/admin/reconcile/index.ts` (adiciona GET /preview)
- `backend-api/test/routes/admin-reconcile.test.ts` (adiciona 1 teste para preview)

### References

- [Source: prd.md#FR32-FR35] — banner, modal, progresso, relatório-resumo, polling
- [Source: prd.md#NFR-OBS-3] — feedback de progresso em tempo real
- [Source: architecture.md#D8] — polling 2s (ajustado para custom hook por ausência de TanStack Query)
- [Source: epics.md#Story-1.6]
- [Source: 1-5-reconcile-service-runner-routes.md] — endpoints consumidos
- [Source: frontend-web/src/lib/imports/use-poll-import-status.ts] — pattern de polling existente
- [Source: frontend-web/AGENTS.md] — Next.js 16 sem shadcn

### Commit Message (sugerida)

```
feat(reconcile): banner + modal de progresso + summary report (Story 1.6)

- Backend: GET /v1/admin/reconcile/preview retorna pendingEmployees +
  hasRunningJob + runningJobId para alimentar banner.
- Frontend: <ReconcileBanner> em /workplaces para ADMIN/SUPER quando
  ha pendencias; oculto para AUDITOR/USER ou tenant sem pendencia.
- Frontend: <ReconcileProgressModal> dispara POST /reconcile (recupera
  jobId existente em 409) e exibe progresso em tempo real.
- Frontend: useReconcileJob hook com polling 2s + auto-stop em terminal
  states, espelhando usePollImportStatus.
- Frontend: <ReconcileSummaryReport> com totais finais + duracao + link
  para Pendencias de Vinculo (Story 1.7).
- FAILED renderiza failureReason; running protegido contra fechamento
  acidental (tooltip explicativo).

Story: 1.6
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Backend: `npx tsx --test test/routes/admin-reconcile.test.ts` → **5/5 verde** (4 antigos + AC-1 preview).
- Frontend: `npx vitest run` ReconcileBanner + ReconcileProgressModal → **7/7 verde**.
- Frontend: `npm run lint` → 0 erros nos arquivos novos da story (lint do projeto tem 114 erros pré-existentes em outros módulos, sem regressão).
- Frontend: `npm run build` → sucesso, `/workplaces` listado nas rotas estáticas.
- Lint inicial pegou `react-hooks/set-state-in-effect` em `useReconcileJob` e `ReconcileBanner`; resolvido com `queueMicrotask` (mesmo pattern de `usePollImportStatus`).

### Completion Notes List

**AC-1 ✅ GET /preview** — count com filtro `workplace IS NOT NULL && workplaceId IS NULL && status != 'INATIVO'`; `findFirst` com `status ∈ {PENDING, RUNNING}`; envelope completo. Teste backend novo cobre os 5 cenários de filtro.

**AC-2 ✅ Banner condicional** — useAuth para role check; useEffect chama preview ao montar; renderiza apenas quando `pendingEmployees > 0 && role ∈ {ADMIN, SUPERADMIN}`.

**AC-3 ✅ Texto + ação adaptativa** — "Reconciliação V3.3 disponível — vincular {N} colaboradores" / "Reconciliação em andamento" + "Iniciar reconciliação" / "Ver progresso".

**AC-4 ✅ Modal dispatch + 409 handling** — POST /reconcile; em 409, captura `meta.existingJobId` (suporta `e.body.meta` e `e.meta` para flexibilidade do error shape).

**AC-5 ✅ useReconcileJob hook** — espelha `usePollImportStatus`: `setInterval` 2s + cleanup + aliveRef + terminal-state-stop. `queueMicrotask` para evitar set-state-in-effect.

**AC-6 ✅ Barra + 4 contadores em cores V3** — barra azul, contadores: Vinculados (verde), Pendentes (azul), Ignorados (cinza), Erros (vermelho).

**AC-7 ✅ Summary em COMPLETED** — `<ReconcileSummaryReport>` substitui inline, mostra duração formatada (`2m 34s`), 2 botões: "Ver Pendências" (Link href=`/workplaces?tab=pending`) e "Fechar".

**AC-8 ✅ FAILED** — bloco vermelho com `AlertTriangle` + `failureReason` + botão Fechar.

**AC-9 ✅ Não fecha por engano** — clique fora do modal não dispara onClose (modal não tem onClick no overlay); botão X tem tooltip explicativo "Você pode fechar — o reconcile continua em background".

**AC-10 ✅ Estilo Tailwind/lucide** — sem shadcn/ui (consistente com convenção do projeto); font 13px, border + bg conforme palette.

**AC-11 ✅ Integração /workplaces** — `<ReconcileBanner />` renderizado no topo do `return` da página, antes do header.

**AC-12 ✅ 7 testes frontend** — banner: ADMIN com pendência, sem pendência (oculto), AUDITOR (oculto), SUPERADMIN com running (Ver progresso). Modal: RUNNING com progress + counters, COMPLETED com summary, FAILED com failureReason.

**AC-13 ✅ Sem regressão** — backend tsc 0 erros; frontend build OK; lint sem erros nos arquivos novos.

**Notas técnicas:**
- Pattern `queueMicrotask` para set-state-in-effect compliance é convenção do projeto Next.js 16 (visto em `usePollImportStatus`).
- HttpClient retorna o body completo (não desestrutura `data`), então `res?.data ?? res` cobre ambos formatos.
- TanStack Query NÃO foi introduzido (PRD/architecture especificavam mas a stack real do projeto é HttpClient + setInterval). Decisão pragmática registrada na story.

### File List

**Modified:**
- `backend-api/src/routes/api/v1/admin/reconcile/index.ts` (adicionou GET /preview)
- `backend-api/test/routes/admin-reconcile.test.ts` (cenário GET /preview)
- `frontend-web/src/app/workplaces/page.tsx` (importou + renderizou ReconcileBanner)

**Created:**
- `frontend-web/src/lib/reconcile/use-reconcile-job.ts`
- `frontend-web/src/components/reconcile/ReconcileBanner.tsx`
- `frontend-web/src/components/reconcile/ReconcileProgressModal.tsx`
- `frontend-web/src/components/__tests__/ReconcileBanner.test.tsx` (4 cenários)
- `frontend-web/src/components/__tests__/ReconcileProgressModal.test.tsx` (3 cenários)
