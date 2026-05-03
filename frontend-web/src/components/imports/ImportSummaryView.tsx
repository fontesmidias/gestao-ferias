'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Plus, Pencil, Building2, AlertTriangle, Download, RotateCcw, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { importsApi } from '@/lib/imports/api'
import { formatDuration } from '@/lib/imports/format-duration'
import type { ImportMode } from '@/lib/imports/types'

interface ImportSummaryViewProps {
  mode: ImportMode
  jobId: string
  tenantId: string
  tenantName: string
  rowsCreated: number | null
  rowsUpdated: number | null
  workplacesCreated: number | null
  rowsInvalid: number | null
  rowsAbsent: number | null
  rowsReactivated: number | null
  appliedAt: string | null
  completedAt: string | null
  onNewImport: () => void
}

export function ImportSummaryView({
  mode,
  jobId,
  tenantId,
  tenantName,
  rowsCreated,
  rowsUpdated,
  workplacesCreated,
  rowsInvalid,
  rowsAbsent,
  rowsReactivated,
  appliedAt,
  completedAt,
  onNewImport,
}: ImportSummaryViewProps) {
  const [downloading, setDownloading] = useState(false)

  const duration = appliedAt && completedAt
    ? formatDuration(new Date(completedAt).getTime() - new Date(appliedAt).getTime())
    : '—'

  const employeesUrl = mode === 'admin'
    ? `/employees?tenantId=${encodeURIComponent(tenantId)}&recent=true&jobId=${encodeURIComponent(jobId)}`
    : `/employees?recent=true&jobId=${encodeURIComponent(jobId)}`

  async function handleDownload() {
    setDownloading(true)
    try {
      await importsApi.downloadErrorReport(mode, jobId)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Falha ao baixar relatório')
    } finally {
      setDownloading(false)
    }
  }

  const invalidCount = rowsInvalid ?? 0
  const absentCount = rowsAbsent ?? 0
  const reactivatedCount = rowsReactivated ?? 0

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CheckCircle2 className="w-7 h-7 text-green-400" aria-hidden="true" />
          Importação concluída
        </h1>
        <div className="text-sm text-slate-400">
          Tenant: <span className="text-slate-200 font-medium">{tenantName}</span>
          {' · '}Concluída em <span className="text-slate-200">{duration}</span>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FinalCard Icon={Plus} iconClass="text-green-400" label="Criados" value={rowsCreated ?? 0} />
        <FinalCard Icon={Pencil} iconClass="text-amber-400" label="Atualizados" value={rowsUpdated ?? 0} />
        <FinalCard Icon={Building2} iconClass="text-blue-400" label="Lotações" value={workplacesCreated ?? 0} />
        <FinalCard Icon={AlertTriangle} iconClass="text-red-400" label="Inválidos" value={invalidCount} />
      </div>

      {reactivatedCount > 0 && (
        <div className="text-sm text-purple-300 flex items-center gap-2" role="status">
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          {reactivatedCount} colaborador{reactivatedCount === 1 ? '' : 'es'} reativado{reactivatedCount === 1 ? '' : 's'}.
        </div>
      )}

      {absentCount > 0 && (
        <div className="text-sm text-slate-300 flex items-center gap-2 flex-wrap" role="status">
          <UserMinus className="w-4 h-4 text-slate-400" aria-hidden="true" />
          {absentCount} marcado{absentCount === 1 ? '' : 's'} como candidato{absentCount === 1 ? '' : 's'} a inativar —{' '}
          <Link href="/employees?filter=inactive_pending" className="text-blue-400 hover:underline">
            revise em Colaboradores
          </Link>
          .
        </div>
      )}

      {invalidCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-amber-200">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            <span><strong>{invalidCount}</strong> linha{invalidCount === 1 ? '' : 's'} {invalidCount === 1 ? 'teve' : 'tiveram'} erros e {invalidCount === 1 ? 'foi' : 'foram'} ignorada{invalidCount === 1 ? '' : 's'}.</span>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {downloading ? 'Baixando…' : 'Baixar relatório de erros (.xlsx)'}
          </button>
          <p className="text-xs text-amber-200/70">
            Corrija no Excel e re-importe — colaboradores válidos não serão duplicados.
          </p>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2 flex-wrap">
        <button
          type="button"
          onClick={onNewImport}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Nova importação
        </button>
        <Link
          href={employeesUrl}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Ver colaboradores ▶
        </Link>
      </div>
    </div>
  )
}

function FinalCard({ Icon, iconClass, label, value }: { Icon: typeof Plus; iconClass: string; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-800/50 p-3 flex items-center gap-3">
      <Icon className={`w-5 h-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <div>
        <div className="text-2xl font-bold text-white leading-tight">{value}</div>
        <div className="text-[11px] text-slate-400">{label}</div>
      </div>
    </div>
  )
}
