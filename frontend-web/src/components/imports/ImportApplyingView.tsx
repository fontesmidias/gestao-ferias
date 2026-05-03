'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, AlertTriangle, UserMinus } from 'lucide-react'
import { estimateRemainingMs, formatDuration } from '@/lib/imports/format-duration'

interface ImportApplyingViewProps {
  rowsProcessed: number | null
  totalRows: number | null
  rowsCreated: number | null
  rowsUpdated: number | null
  rowsInvalid: number | null
  rowsAbsent: number | null
  appliedAt: string | null
}

export function ImportApplyingView({
  rowsProcessed,
  totalRows,
  rowsCreated,
  rowsUpdated,
  rowsInvalid,
  rowsAbsent,
  appliedAt,
}: ImportApplyingViewProps) {
  const processed = rowsProcessed ?? 0
  const total = totalRows ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

  // Smoothing: interpola visualmente em direção ao valor real via rAF.
  const [displayedProcessed, setDisplayedProcessed] = useState<number>(processed)
  useEffect(() => {
    let raf: number
    let cancelled = false
    function step() {
      if (cancelled) return
      setDisplayedProcessed((cur) => {
        const diff = processed - cur
        if (Math.abs(diff) < 0.5) return processed
        const next = cur + diff * 0.18
        raf = requestAnimationFrame(step)
        return next
      })
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [processed])

  // Tempo decorrido — recalcula a cada segundo.
  const [elapsedMs, setElapsedMs] = useState<number>(() => computeElapsed(appliedAt))
  useEffect(() => {
    if (!appliedAt) return
    const id = setInterval(() => setElapsedMs(computeElapsed(appliedAt)), 1000)
    return () => clearInterval(id)
  }, [appliedAt])

  // ETA só aparece após 100 rows processadas (estabilidade).
  const showEta = processed >= 100 && total > 0
  const etaMs = showEta ? estimateRemainingMs(elapsedMs, processed, total) : null

  // Anúncios a 25/50/75/100% (não a cada poll).
  const milestone = Math.floor(pct / 25) * 25
  const announcedRef = useRef(0)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (milestone > announcedRef.current) {
      announcedRef.current = milestone
      queueMicrotask(() => setAnnouncement(`Progresso ${milestone}%`))
    }
  }, [milestone])

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-white">Aplicando importação…</h1>

      <div className="space-y-2">
        <progress
          className="w-full h-3 [&::-webkit-progress-bar]:bg-slate-700 [&::-webkit-progress-bar]:rounded [&::-webkit-progress-value]:bg-blue-500 [&::-webkit-progress-value]:rounded [&::-moz-progress-bar]:bg-blue-500"
          value={Math.round(displayedProcessed)}
          max={total > 0 ? total : 1}
          aria-label="Progresso da aplicação"
        />
        <div className="text-sm text-slate-300 flex justify-between">
          <span>Processadas: <strong className="text-white">{processed}</strong> / {total} linhas</span>
          <span className="text-slate-400">{pct}%</span>
        </div>
      </div>

      <div className="text-sm text-slate-300 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Tempo decorrido</div>
          <div className="text-white font-medium">{formatDuration(elapsedMs)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Tempo estimado restante</div>
          <div className="text-white font-medium">
            {showEta && etaMs != null ? `~${formatDuration(etaMs)}` : <span className="text-slate-500">Calculando…</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PartialCard Icon={Plus} iconClass="text-green-400" label="Criados" value={rowsCreated ?? 0} />
        <PartialCard Icon={Pencil} iconClass="text-amber-400" label="Atualizados" value={rowsUpdated ?? 0} />
        <PartialCard Icon={AlertTriangle} iconClass="text-red-400" label="Erros" value={rowsInvalid ?? 0} />
        <PartialCard Icon={UserMinus} iconClass="text-slate-400" label="Ausentes" value={rowsAbsent ?? 0} />
      </div>

      <p className="text-xs text-slate-500">
        ⓘ Você pode fechar esta aba — o trabalho continua em segundo plano. Atualizamos a cada 2 segundos.
      </p>

      {/* Live region para SR — anuncia somente em milestones de 25%. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}

function computeElapsed(appliedAt: string | null): number {
  if (!appliedAt) return 0
  const t = new Date(appliedAt).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Date.now() - t)
}

function PartialCard({ Icon, iconClass, label, value }: { Icon: typeof Plus; iconClass: string; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-800/50 p-3 flex items-center gap-3">
      <Icon className={`w-5 h-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <div>
        <div className="text-xl font-bold text-white leading-tight">{value}</div>
        <div className="text-[11px] text-slate-400">{label}</div>
      </div>
    </div>
  )
}
