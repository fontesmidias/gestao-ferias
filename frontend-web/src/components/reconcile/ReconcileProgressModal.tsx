'use client'

import { useEffect, useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import { useReconcileJob, type ReconcileJobStatus } from '@/lib/reconcile/use-reconcile-job'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  existingJobId?: string
}

interface DispatchError {
  message?: string
  body?: { meta?: { existingJobId?: string } }
  meta?: { existingJobId?: string }
}

export function ReconcileProgressModal({ open, onClose, existingJobId }: Props) {
  const [jobId, setJobId] = useState<string | null>(existingJobId ?? null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const { job, error } = useReconcileJob(jobId)

  useEffect(() => {
    if (!open) return
    if (jobId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await HttpClient.post('/admin/reconcile', {})
        if (cancelled) return
        const newJobId = res?.data?.jobId ?? res?.jobId
        if (newJobId) setJobId(newJobId)
      } catch (e: unknown) {
        if (cancelled) return
        const err = e as DispatchError
        const existing = err?.body?.meta?.existingJobId ?? err?.meta?.existingJobId
        if (existing) {
          setJobId(existing)
          return
        }
        setDispatchError(err?.message ?? 'Erro ao iniciar reconciliação')
        toast.error('Erro ao iniciar reconciliação')
      }
    })()
    return () => {
      cancelled = true
    }
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
            title={
              isRunning
                ? 'Você pode fechar — o reconcile continua em background'
                : 'Fechar'
            }
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {dispatchError && (
          <div className="text-red-600 mb-2">{dispatchError}</div>
        )}
        {error && <div className="text-red-600 mb-2">{error}</div>}

        {!job && !dispatchError && <div className="text-slate-500">Iniciando…</div>}

        {job && isRunning && (
          <>
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden mb-2">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${job.progressPct ?? 0}%` }}
                data-testid="progress-bar"
              />
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {job.progressPct ?? 0}% — {job.matched + job.queued + job.ignored + job.errors}
              {' / '}
              {job.totalEmployees ?? '?'} colaboradores processados
            </div>
            <CountersGrid job={job} />
          </>
        )}

        {job && isCompleted && <ReconcileSummaryReport job={job} onClose={onClose} />}

        {job && isFailed && (
          <div className="border border-red-300 bg-red-50 rounded p-3 flex items-start gap-2">
            <AlertTriangle size={18} className="text-red-600 mt-0.5" />
            <div>
              <div className="font-medium text-red-700">Reconcile falhou</div>
              <div className="text-xs text-red-600 mt-1">
                {job.failureReason ?? 'Sem detalhes.'}
              </div>
              <button
                onClick={onClose}
                className="mt-3 px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CountersGrid({
  job,
}: {
  job: Pick<ReconcileJobStatus, 'matched' | 'queued' | 'ignored' | 'errors'>
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Counter label="Vinculados" value={job.matched} color="text-green-600" />
      <Counter label="Pendentes" value={job.queued} color="text-blue-600" />
      <Counter label="Ignorados" value={job.ignored} color="text-slate-500" />
      <Counter label="Erros" value={job.errors} color="text-red-600" />
    </div>
  )
}

function Counter({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 p-2 text-center">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

function formatDuration(ms: number | null) {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function ReconcileSummaryReport({
  job,
  onClose,
}: {
  job: ReconcileJobStatus
  onClose: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 size={20} className="text-green-600" />
        <span className="font-medium">Reconciliação concluída</span>
        <span className="text-xs text-slate-500 ml-auto">
          {formatDuration(job.durationMs)}
        </span>
      </div>
      <CountersGrid job={job} />
      <div className="flex justify-end gap-2 mt-4">
        <Link
          href="/workplaces?tab=pending"
          onClick={onClose}
          className="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
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
