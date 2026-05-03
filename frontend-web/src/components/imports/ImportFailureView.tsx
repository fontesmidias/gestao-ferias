'use client'

import { useState } from 'react'
import { XCircle, Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { importsApi } from '@/lib/imports/api'
import { formatDuration } from '@/lib/imports/format-duration'
import type { DoneResult } from '@/lib/imports/use-import-flow'
import type { ImportMode } from '@/lib/imports/types'

interface ImportFailureViewProps {
  mode: ImportMode
  jobId: string
  tenantName: string
  result: DoneResult
  failureReason: string | null
  appliedAt: string | null
  completedAt: string | null
  onRetry: () => void
}

const MICROCOPY: Record<string, string> = {
  INVALID_TIRVU_HEADER: 'Layout do arquivo não reconhecido como Tirvu padrão. Esperamos um cabeçalho com 46 colunas específicas, mas a planilha não bate. Verifique se foi exportada corretamente do sistema Tirvu sem alterações manuais.',
  FILE_CORRUPT: 'Arquivo .xlsx corrompido ou ilegível.',
  TIMED_OUT: 'Importação ultrapassou o tempo limite (15 minutos sem progresso). O sistema cancelou automaticamente. Tente dividir o arquivo em partes menores.',
}

export function ImportFailureView({
  mode,
  jobId,
  tenantName,
  result,
  failureReason,
  appliedAt,
  completedAt,
  onRetry,
}: ImportFailureViewProps) {
  const [downloading, setDownloading] = useState(false)

  const duration = appliedAt && completedAt
    ? formatDuration(new Date(completedAt).getTime() - new Date(appliedAt).getTime())
    : '—'

  const reasonText = (() => {
    if (result === 'timed_out') return MICROCOPY.TIMED_OUT
    if (failureReason && MICROCOPY[failureReason]) return MICROCOPY[failureReason]
    return `Erro inesperado no servidor. Suporte foi notificado automaticamente. ID do job: ${jobId}`
  })()

  async function handleDownloadOriginal() {
    setDownloading(true)
    try {
      await importsApi.downloadOriginal(mode, jobId)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Falha ao baixar arquivo')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <XCircle className="w-7 h-7 text-red-400" aria-hidden="true" />
          Importação falhou
        </h1>
        <div className="text-sm text-slate-400">
          Tenant: <span className="text-slate-200 font-medium">{tenantName}</span>
          {' · '}Falhou após <span className="text-slate-200">{duration}</span>
        </div>
      </header>

      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-2" role="alert">
        <div className="text-xs uppercase tracking-wide text-red-300">Motivo</div>
        <p className="text-sm text-red-100 leading-relaxed">{reasonText}</p>
      </div>

      <p className="text-sm text-slate-300">
        ⓘ Nenhum dado foi modificado em <span className="font-medium text-white">{tenantName}</span>.
      </p>

      <div className="flex justify-between gap-2 pt-2 flex-wrap">
        <button
          type="button"
          onClick={handleDownloadOriginal}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-slate-200 hover:bg-white/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {downloading ? 'Baixando…' : 'Baixar arquivo original'}
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
