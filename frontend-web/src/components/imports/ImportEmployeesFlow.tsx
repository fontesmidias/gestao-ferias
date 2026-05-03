'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, FileText } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import { HttpClient } from '@/lib/api-client'
import { InfoTooltip } from '@/components/InfoTooltip'
import { importsApi } from '@/lib/imports/api'
import { TIRVU_V1_COLUMNS } from '@/lib/imports/tirvu-columns'
import { useImportFlow } from '@/lib/imports/use-import-flow'
import { usePollImportStatus } from '@/lib/imports/use-poll-import-status'
import type {
  ImportMode,
  PaginationMeta,
  PreviewPageResponse,
  RowCategory,
} from '@/lib/imports/types'
import { ImportTenantBanner } from './ImportTenantBanner'
import { ImportDropzone } from './ImportDropzone'
import { ImportPreviewCounts } from './ImportPreviewCounts'
import { ImportPreviewFilters } from './ImportPreviewFilters'
import { ImportPreviewTable } from './ImportPreviewTable'
import { ImportNewWorkplacesBlock } from './ImportNewWorkplacesBlock'
import { ImportConfirmCancelModal } from './ImportConfirmCancelModal'
import { ImportConfirmApplyModal } from './ImportConfirmApplyModal'
import { ImportApplyingView } from './ImportApplyingView'
import { ImportSummaryView } from './ImportSummaryView'
import { ImportFailureView } from './ImportFailureView'

interface TenantOption {
  id: string
  name: string
  isActive: boolean
}

interface ImportEmployeesFlowProps {
  mode: ImportMode
}

export function ImportEmployeesFlow({ mode }: ImportEmployeesFlowProps) {
  const { user } = useAuth()
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [showFormatModal, setShowFormatModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [applying, setApplying] = useState(false)
  const [statusFilter, setStatusFilter] = useState<RowCategory | 'all'>('all')
  const [page, setPage] = useState(1)
  const [previewData, setPreviewData] = useState<PreviewPageResponse | null>(null)
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [previewLoading, setPreviewLoading] = useState(false)

  const resolveTenantName = useCallback(async (tenantId: string): Promise<string | null> => {
    if (mode !== 'admin') return null
    try {
      const data = (await HttpClient.get(`/admin/tenants/${tenantId}`)) as { name?: string } | null
      return data?.name ?? null
    } catch {
      return null
    }
  }, [mode])

  const { state, actions } = useImportFlow({ mode, resolveTenantName })

  // Carregar lista de tenants (apenas modo admin).
  useEffect(() => {
    if (mode !== 'admin') return
    setTenantsLoading(true)
    HttpClient.get('/admin/tenants')
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? (data as Array<{ id: string; name: string; isActive: boolean }>) : []
        const list = arr
          .map((t) => ({ id: t.id, name: t.name, isActive: t.isActive }))
          .filter((t) => t.isActive)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        setTenants(list)
      })
      .catch((err) => {
        console.error('Falha ao listar tenants', err)
        toast.error('Não foi possível carregar a lista de tenants.')
      })
      .finally(() => setTenantsLoading(false))
  }, [mode])

  // Polling enquanto job está em preview, applying ou done (status completo
  // ainda é necessário no done view para sumário/failure reason).
  const pollJobId = state.kind === 'preview' || state.kind === 'applying' || state.kind === 'done'
    ? state.jobId
    : null
  const { status: jobStatus, error: pollError } = usePollImportStatus({
    mode,
    jobId: pollJobId,
    enabled: pollJobId !== null,
  })

  // Surface poll error (M3): toast de uma vez quando entra em estado de erro.
  useEffect(() => {
    if (pollError) toast.error(`Falha ao consultar status: ${pollError}`)
  }, [pollError])

  const previewReady = jobStatus?.status === 'PREVIEW_READY' || jobStatus?.status === 'APPLYING' || jobStatus?.status === 'COMPLETED'

  // Buscar página de preview quando job ficou ready ou filtro/page mudou.
  // Deps narrow: só re-fetch quando mudam parâmetros relevantes; mudanças em
  // newWorkplacesMode/uploadError dentro do state não devem disparar request.
  const previewJobId = state.kind === 'preview' ? state.jobId : null
  useEffect(() => {
    if (!previewJobId) {
      setPreviewData(null)
      return
    }
    if (!previewReady) return

    let cancelled = false
    setPreviewLoading(true)
    importsApi
      .getPreview(mode, previewJobId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        limit: 50,
      })
      .then((res) => {
        if (cancelled) return
        setPreviewData(res.data)
        setPagination(res.pagination)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('Falha ao carregar preview', err)
        toast.error(err instanceof Error ? err.message : 'Erro ao carregar preview')
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mode, previewJobId, previewReady, statusFilter, page])

  // Reset page quando filtro muda.
  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  // Detecta transição para estado terminal durante applying/preview e
  // dispara JOB_COMPLETED → state.done. Polling continua em done para popular
  // sumário/failure reason, mas paramos de transitar de novo.
  useEffect(() => {
    if (!jobStatus) return
    if (state.kind !== 'applying' && state.kind !== 'preview') return
    if (jobStatus.status === 'COMPLETED') {
      actions.jobCompleted('completed')
    } else if (jobStatus.status === 'FAILED') {
      actions.jobCompleted('failed')
    } else if (jobStatus.status === 'TIMED_OUT') {
      actions.jobCompleted('timed_out')
    } else if (jobStatus.status === 'CANCELLED' && state.kind === 'applying') {
      // Edge case: backend cancelou (watchdog) durante applying — trata como falha.
      actions.jobCompleted('failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus?.status, state.kind])

  // -- Handlers --

  const handleSelectTenant = (tenantId: string) => {
    if (!tenantId) {
      actions.clearTenant()
      return
    }
    const t = tenants.find((x) => x.id === tenantId)
    if (!t) return
    actions.setTenant(t.id, t.name)
  }

  const handleUpload = async (file: File) => {
    actions.setUploadError(undefined)
    setUploadProgress(0)
    setUploading(true)
    try {
      const tenantIdForUpload = mode === 'admin'
        ? (state.kind === 'upload' ? state.tenantId ?? null : null)
        : null
      const result = await importsApi.upload(mode, file, tenantIdForUpload, (pct) => {
        setUploadProgress(pct)
      })
      toast.success('Arquivo enviado. Lendo planilha…')
      actions.uploadSuccess(result.jobId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro no upload'
      actions.setUploadError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleApply = async ({ confirmTenantName, createWorkplaces }: { confirmTenantName: string; createWorkplaces: string[] }) => {
    if (state.kind !== 'preview') return
    setApplying(true)
    try {
      await importsApi.apply(mode, state.jobId, {
        confirmTenantName,
        createWorkplaces,
        markAbsentAsPending: false,
      })
      toast.success('Aplicação iniciada.')
      setShowApplyModal(false)
      actions.applyTriggered()
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'INVALID_CONFIRM_TENANT_NAME') {
        toast.error('Nome digitado não confere com o tenant alvo.')
      } else {
        toast.error(err instanceof Error ? err.message : 'Erro ao aplicar')
      }
    } finally {
      setApplying(false)
    }
  }

  const handleNewImport = () => {
    actions.reset()
    setPreviewData(null)
    setPage(1)
    setStatusFilter('all')
  }

  const handleRetry = () => {
    actions.retry()
    setPreviewData(null)
    setPage(1)
    setStatusFilter('all')
  }

  const handleCancelConfirm = async () => {
    if (state.kind !== 'preview' && state.kind !== 'applying') return
    setCancelling(true)
    try {
      await importsApi.cancel(mode, state.jobId)
      toast.success('Importação cancelada.')
      setShowCancelModal(false)
      actions.cancel()
      setPreviewData(null)
      setPage(1)
      setStatusFilter('all')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar')
    } finally {
      setCancelling(false)
    }
  }

  // -- Render helpers --

  const tenantNameForBanner = state.kind !== 'upload' ? state.tenantName : ''
  const showBanner = mode === 'admin' && state.kind !== 'upload'

  const counts = previewData?.counts ?? jobStatus?.previewSummary?.counts ?? {
    create: 0, update: 0, unchanged: 0, reactivation: 0, invalid: 0, absent: 0,
  }
  const totalRows = jobStatus?.previewSummary?.totalRows ?? jobStatus?.totalRows ?? 0
  const newWorkplaces = previewData?.newWorkplaces ?? jobStatus?.previewSummary?.newWorkplaces ?? []

  return (
    <div className={showBanner ? 'pt-10' : ''}>
      {showBanner && (
        <ImportTenantBanner
          tenantName={tenantNameForBanner}
          onCancel={() => setShowCancelModal(true)}
          cancelHidden={state.kind === 'applying' || state.kind === 'done'}
        />
      )}

      <div className="px-6 py-6 max-w-6xl mx-auto space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Importar colaboradores</h1>
          <p className="text-sm text-slate-400">
            Suba uma planilha exportada do Tirvu (.xlsx) para criar ou atualizar colaboradores em lote.
          </p>
        </header>

        {state.kind === 'upload' && (
          <UploadStep
            mode={mode}
            tenants={tenants}
            tenantsLoading={tenantsLoading}
            tenantId={state.tenantId}
            tenantNameForTenantMode={user?.name ? user?.tenantId ?? '' : ''}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadError={state.uploadError}
            onSelectTenant={handleSelectTenant}
            onUpload={handleUpload}
            onShowFormat={() => setShowFormatModal(true)}
          />
        )}

        {state.kind === 'preview' && (
          <PreviewStep
            previewReady={!!previewReady}
            failureReason={jobStatus?.failureReason}
            totalRows={totalRows}
            counts={counts}
            newWorkplaces={newWorkplaces}
            newWorkplacesMode={state.newWorkplacesMode}
            onNewWorkplacesModeChange={actions.setNewWorkplacesMode}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            previewLoading={previewLoading}
            previewRows={previewData?.rows ?? []}
            pagination={pagination}
            onPageChange={setPage}
            onCancel={() => setShowCancelModal(true)}
            onApply={() => setShowApplyModal(true)}
          />
        )}

        {state.kind === 'applying' && (
          <ImportApplyingView
            rowsProcessed={jobStatus?.rowsProcessed ?? null}
            totalRows={jobStatus?.totalRows ?? null}
            rowsCreated={jobStatus?.rowsCreated ?? null}
            rowsUpdated={jobStatus?.rowsUpdated ?? null}
            rowsInvalid={jobStatus?.rowsInvalid ?? null}
            rowsAbsent={jobStatus?.rowsAbsent ?? null}
            appliedAt={jobStatus?.appliedAt ?? null}
          />
        )}

        {state.kind === 'done' && state.result === 'completed' && (
          <ImportSummaryView
            mode={mode}
            jobId={state.jobId}
            tenantId={state.tenantId}
            tenantName={state.tenantName}
            rowsCreated={jobStatus?.rowsCreated ?? null}
            rowsUpdated={jobStatus?.rowsUpdated ?? null}
            workplacesCreated={jobStatus?.workplacesCreated ?? null}
            rowsInvalid={jobStatus?.rowsInvalid ?? null}
            rowsAbsent={jobStatus?.rowsAbsent ?? null}
            rowsReactivated={jobStatus?.previewSummary?.counts?.reactivation ?? null}
            appliedAt={jobStatus?.appliedAt ?? null}
            completedAt={jobStatus?.completedAt ?? null}
            onNewImport={handleNewImport}
          />
        )}

        {state.kind === 'done' && state.result !== 'completed' && (
          <ImportFailureView
            mode={mode}
            jobId={state.jobId}
            tenantName={state.tenantName}
            result={state.result}
            failureReason={jobStatus?.failureReason ?? null}
            appliedAt={jobStatus?.appliedAt ?? null}
            completedAt={jobStatus?.completedAt ?? null}
            onRetry={handleRetry}
          />
        )}
      </div>

      {showFormatModal && <FormatHelpModal onClose={() => setShowFormatModal(false)} />}

      <ImportConfirmCancelModal
        open={showCancelModal}
        loading={cancelling}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancelConfirm}
      />

      {state.kind === 'preview' && (
        <ImportConfirmApplyModal
          open={showApplyModal}
          mode={mode}
          tenantName={state.tenantName}
          counts={counts}
          newWorkplaces={newWorkplaces}
          newWorkplacesMode={state.newWorkplacesMode}
          loading={applying}
          onClose={() => setShowApplyModal(false)}
          onConfirm={handleApply}
        />
      )}
    </div>
  )
}

// =============================================================================
// Step components (locais, internos)
// =============================================================================

interface UploadStepProps {
  mode: ImportMode
  tenants: TenantOption[]
  tenantsLoading: boolean
  tenantId?: string
  tenantNameForTenantMode: string
  uploading: boolean
  uploadProgress: number
  uploadError?: string
  onSelectTenant: (id: string) => void
  onUpload: (file: File) => void | Promise<void>
  onShowFormat: () => void
}

function UploadStep({
  mode,
  tenants,
  tenantsLoading,
  tenantId,
  uploading,
  uploadProgress,
  uploadError,
  onSelectTenant,
  onUpload,
  onShowFormat,
}: UploadStepProps) {
  const { user } = useAuth()
  const dropzoneDisabled = mode === 'admin' && !tenantId

  return (
    <div className="space-y-5">
      {mode === 'admin' && !tenantId && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200 flex items-center gap-2"
          role="status"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          Selecione o tenant alvo antes de subir o arquivo.
        </div>
      )}

      {mode === 'admin' ? (
        <div className="space-y-1.5">
          <label htmlFor="tenant-picker" className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
            <span>Tenant alvo <span className="text-red-400">*</span></span>
            <InfoTooltip text="Os colaboradores da planilha serão criados/atualizados neste tenant. SuperAdmin pode importar para qualquer tenant ativo." />
          </label>
          <select
            id="tenant-picker"
            className="w-full md:max-w-md px-3 py-2 rounded-lg bg-slate-800/60 border border-white/10 text-slate-100 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            value={tenantId ?? ''}
            disabled={tenantsLoading || uploading}
            onChange={(e) => onSelectTenant(e.target.value)}
          >
            <option value="">{tenantsLoading ? 'Carregando…' : 'Selecione um tenant...'}</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="text-sm text-slate-300">
          Tenant: <span className="font-medium text-white">{
            ((user as { branding?: { brandName?: string } } | null)?.branding?.brandName)
              ?? user?.tenantId
              ?? '—'
          }</span>{' '}
          <span className="text-slate-500">— você está logado como admin desse tenant.</span>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
          <span>Arquivo Tirvu (.xlsx)</span>
          <InfoTooltip text="Esperamos o formato padrão Tirvu com 46 colunas. O sistema rejeita layouts diferentes." />
        </div>
        <ImportDropzone
          disabled={dropzoneDisabled}
          uploading={uploading}
          uploadProgress={uploadProgress}
          externalError={uploadError}
          onFile={onUpload}
        />
        <div className="text-xs text-slate-500">
          <button
            type="button"
            onClick={onShowFormat}
            className="text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Ver formato esperado →
          </button>
        </div>
      </div>
    </div>
  )
}

interface PreviewStepProps {
  previewReady: boolean
  failureReason?: string | null
  totalRows: number
  counts: PreviewPageResponse['counts']
  newWorkplaces: string[]
  newWorkplacesMode: 'create-all' | 'decide-each'
  onNewWorkplacesModeChange: (m: 'create-all' | 'decide-each') => void
  statusFilter: RowCategory | 'all'
  onStatusFilter: (s: RowCategory | 'all') => void
  previewLoading: boolean
  previewRows: PreviewPageResponse['rows']
  pagination: PaginationMeta
  onPageChange: (p: number) => void
  onCancel: () => void
  onApply: () => void
}

function PreviewStep({
  previewReady,
  failureReason,
  totalRows,
  counts,
  newWorkplaces,
  newWorkplacesMode,
  onNewWorkplacesModeChange,
  statusFilter,
  onStatusFilter,
  previewLoading,
  previewRows,
  pagination,
  onPageChange,
  onCancel,
  onApply,
}: PreviewStepProps) {
  if (!previewReady) {
    if (failureReason) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
          <strong>Importação falhou:</strong> {failureReason}
        </div>
      )
    }
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <div className="text-sm text-slate-400">Lendo planilha…</div>
        <div className="rounded-lg border border-white/10 bg-slate-900/30 p-4 space-y-2 animate-pulse">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-slate-800/60" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ImportPreviewCounts counts={counts} />
      <ImportNewWorkplacesBlock
        newWorkplaces={newWorkplaces}
        mode={newWorkplacesMode}
        onChange={onNewWorkplacesModeChange}
      />
      <ImportPreviewFilters
        counts={counts}
        totalRows={totalRows}
        active={statusFilter}
        onChange={onStatusFilter}
      />
      <ImportPreviewTable
        rows={previewRows}
        pagination={pagination}
        loading={previewLoading}
        onPageChange={onPageChange}
      />
      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <InfoTooltip text="Linhas inválidas serão ignoradas; após aplicar você pode baixar um relatório .xlsx com elas." />
        Linhas inválidas serão ignoradas; receberá um relatório .xlsx baixável após aplicar.
      </p>
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Cancelar e voltar
        </button>
        <button
          type="button"
          onClick={onApply}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Aplicar importação ▶
        </button>
      </div>
    </div>
  )
}

function FormatHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fmt-title"
        className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 id="fmt-title" className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" /> Formato esperado (Tirvu v1)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none px-2"
            aria-label="Fechar"
          >×</button>
        </div>
        <p className="text-sm text-slate-300">
          A planilha precisa ter exatamente {TIRVU_V1_COLUMNS.length} colunas, na ordem abaixo, na aba <code>Plan1</code>.
        </p>
        <div className="max-h-80 overflow-y-auto border border-white/10 rounded p-3 bg-slate-800/40 text-xs text-slate-200 grid grid-cols-2 gap-x-4 gap-y-1">
          {TIRVU_V1_COLUMNS.map((c, i) => (
            <div key={`${c}-${i}`}>
              <span className="text-slate-500 mr-2">{i + 1}.</span>{c}
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-100 hover:bg-slate-600"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
