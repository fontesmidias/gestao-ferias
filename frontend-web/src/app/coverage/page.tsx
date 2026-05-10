'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Shield, AlertTriangle, Users, Calendar, ChevronLeft, ChevronRight, UserCheck, FileSpreadsheet, Upload, ArrowLeft, Pencil, Trash2, X, Sparkles } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { HttpClient } from '@/lib/api-client'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Workplace {
  id: string
  name: string
  positionId: string
  role: string
}

interface Gap {
  vacationRequestId: string
  employeeName: string
  vacationStart: string
  vacationEnd: string
  days: number
  workplace: Workplace | null
  hasCoverage: boolean
}

interface GapsResponse {
  period: string
  totalGaps: number
  gaps: Gap[]
}

interface MatchInfo {
  score: number
  level: 'identical' | 'family' | 'any'
  reason: string
}

interface Suggestion {
  id: string
  name: string
  estimatedCost: number
  type: string
  position?: string | null
  shift?: string | null
  match?: MatchInfo
  canChain?: boolean
}

interface SuggestionsResponse {
  vacationRequest: Record<string, unknown>
  suggestions: {
    feristas: Suggestion[]
    intermitentes: Suggestion[]
  }
}

interface Coverage {
  id: string
  vacationRequestId: string
  replacementEmployeeId: string
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'
  startDate: string
  endDate: string
  type: string
  cost: number | null
  replacementEmployee?: { id: string; name: string; employeeType: string; registration?: string | null }
  workplacePosition?: { id: string; role: string; workplace: { id: string; name: string } }
  vacationRequest?: { id: string; startDate: string; endDate: string; employee: { name: string; registration?: string | null } }
}

interface CoverageKpis {
  month: string
  gapsTotal: number
  estimatedCoverageMonthCost: number
  availableFeristasCount: number
}

interface FeristaLivre {
  id: string
  name: string
  position: string | null
  workplace: string | null
  shift: string | null
  coveragesInPeriod: number
  isFree: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ViewMode = '90d' | 'month'

function buildPeriodRange(ref: Date, mode: ViewMode) {
  if (mode === '90d') {
    const from = format(new Date(), 'yyyy-MM-dd')
    const to = format(addDays(new Date(), 90), 'yyyy-MM-dd')
    return { from, to }
  }
  const from = format(startOfMonth(ref), 'yyyy-MM-dd')
  const to = format(endOfMonth(ref), 'yyyy-MM-dd')
  return { from, to }
}

const MIN_MONTH_OFFSET = -3
const MAX_MONTH_OFFSET = 6

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CoveragePage() {
  // V3.4 FASE A1: default é rolling 90d (corrige bug onde férias futuras não apareciam).
  const [viewMode, setViewMode] = useState<ViewMode>('90d')
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))
  const [gaps, setGaps] = useState<GapsResponse | null>(null)
  const [coverages, setCoverages] = useState<Coverage[]>([])
  const [kpis, setKpis] = useState<CoverageKpis | null>(null)
  const [loading, setLoading] = useState(true)

  // V3.4 FASE C5: feristas livres no periodo da view
  const [feristasLivres, setFeristasLivres] = useState<FeristaLivre[] | null>(null)
  const [showFeristasPanel, setShowFeristasPanel] = useState(false)

  // Sheet (slide-in panel) state
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)
  const [modalGap, setModalGap] = useState<Gap | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [selectedReplacement, setSelectedReplacement] = useState<string | 'NONE' | null>(null)
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedCost, setSelectedCost] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  // V3.4 FASE H: gestao de coberturas atribuidas (listar/editar/excluir/CSV)
  const [showCoveragesPanel, setShowCoveragesPanel] = useState(true)
  const [coverageStatusFilter, setCoverageStatusFilter] = useState<'ALL' | 'PLANNED' | 'ACTIVE' | 'COMPLETED'>('ALL')
  const [editCoverage, setEditCoverage] = useState<Coverage | null>(null)
  const [editStatus, setEditStatus] = useState<'PLANNED' | 'ACTIVE' | 'COMPLETED'>('PLANNED')
  const [editCost, setEditCost] = useState<string>('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  // V3.4 Story 4.16: filtro por posto/workplace e "so com gap"
  const [workplaceFilter, setWorkplaceFilter] = useState<string>('')

  // V3.4 Story 4.3: encadeamento automatico
  const [chainRunning, setChainRunning] = useState(false)
  const autoChain = async (vrId: string) => {
    if (!confirm('Buscar e ENCADEAR ate 3 feristas para cobrir o periodo inteiro?\n\nO sistema escolhe automaticamente feristas com janelas livres compativeis. Se conseguir cobrir 100%, cria as coberturas PLANEJADAS.')) return
    try {
      setChainRunning(true)
      const res: any = await HttpClient.post('/coverages/auto-chain', { vacationRequestId: vrId, maxFeristas: 3, apply: true })
      const s = res?.data?.summary
      const chain = res?.data?.chain ?? []
      if (s?.uncovered > 0) {
        toast.error(`Cobertura parcial: ${s.covered}d cobertos, ${s.uncovered}d ainda sem ferista. ${chain.length} ferista(s) usados.`, { duration: 10000 })
      } else if (s?.applied > 0) {
        toast.success(`Encadeamento aplicado: ${s.applied} ferista(s) em sequencia · ${s.covered} dias · R$ ${Number(s.totalCost || 0).toFixed(2)}`, { duration: 10000 })
        closeSheet()
        fetchData()
      } else {
        toast.error('Nao foi possivel encadear feristas para este periodo.')
      }
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro no encadeamento.')
    } finally { setChainRunning(false) }
  }

  // V3.4 Story 4.4: bulk coverage assign — gaps selecionados.
  const [bulkSelectedVrIds, setBulkSelectedVrIds] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const toggleBulkSelect = (vrId: string) => {
    setBulkSelectedVrIds(prev => { const next = new Set(prev); if (next.has(vrId)) next.delete(vrId); else next.add(vrId); return next })
  }
  const runBulkAssign = async () => {
    if (bulkSelectedVrIds.size === 0) { toast.error('Nenhum gap selecionado.'); return }
    if (!confirm(`Atribuir cobertura automaticamente para ${bulkSelectedVrIds.size} gap(s)?\n\nO sistema escolhe o melhor ferista disponivel (cargo identico > familia > qualquer). Voce pode editar cada cobertura depois.`)) return
    try {
      setBulkRunning(true)
      const res: any = await HttpClient.post('/coverages/bulk-assign', {
        vacationRequestIds: Array.from(bulkSelectedVrIds),
        preferType: 'AUTO',
      })
      const s = res?.data?.summary
      const skipped = (res?.data?.results ?? []).filter((r: any) => r.status === 'skipped')
      const reasonsCount = skipped.reduce((acc: Record<string, number>, r: any) => { acc[r.reason] = (acc[r.reason] || 0) + 1; return acc }, {})
      const reasonsTxt = Object.entries(reasonsCount).map(([k, v]) => `${k}=${v}`).join(', ')
      toast.success(`Aplicadas: ${s?.applied ?? 0} · Puladas: ${s?.skipped ?? 0}${reasonsTxt ? ` (${reasonsTxt})` : ''}`, { duration: 10000 })
      setBulkSelectedVrIds(new Set())
      fetchData()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro no bulk-assign.')
    } finally { setBulkRunning(false) }
  }

  // V3.4: config de cron movida para /settings → Automacoes.

  // V3.4 Story 4.20: colaboradores com status FERIAS no Employee mas sem
  // VacationRequest ativa (sintoma classico de import Tirvu trazendo so o status).
  interface OrphanFerista { id: string; name: string; registration: string | null; cpf: string; position: string | null; workplace: string | null }
  const [orphanFeristas, setOrphanFeristas] = useState<OrphanFerista[]>([])
  const [orphansLoaded, setOrphansLoaded] = useState(false)
  const fetchOrphans = useCallback(async () => {
    try {
      const res: any = await HttpClient.get('/vacations/orphan-on-vacation')
      setOrphanFeristas(res?.data?.items ?? [])
    } catch { setOrphanFeristas([]) }
    finally { setOrphansLoaded(true) }
  }, [])
  useEffect(() => { fetchOrphans() }, [fetchOrphans])

  // ---------- Data fetching ----------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const { from, to } = buildPeriodRange(selectedMonth, viewMode)
      const monthParam = format(selectedMonth, 'yyyy-MM')
      const [gapsRes, coveragesRes, kpisRes, feristasRes] = await Promise.all([
        HttpClient.get(`/coverages/gaps?from=${from}&to=${to}`),
        HttpClient.get('/coverages'),
        HttpClient.get(`/coverages/kpis?month=${monthParam}`),
        HttpClient.get(`/coverages/available-feristas?from=${from}&to=${to}`).catch(() => null),
      ])
      setGaps(gapsRes)
      setCoverages(coveragesRes)
      setKpis(kpisRes)
      const feristasData = (feristasRes as any)?.data?.feristas
      setFeristasLivres(Array.isArray(feristasData) ? feristasData : null)
    } catch (err: unknown) {
      console.error(err)
      toast.error('Erro ao carregar dados de cobertura')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, viewMode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Story 2.4 / L3 — SSE em tempo real. Re-fetcha quando há eventos.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''
    const token = localStorage.getItem('token')
    if (!token) return

    let stopped = false
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

    async function listen() {
      try {
        const res = await fetch(`${apiBase}/coverages/events`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || !res.body) return
        reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        // eslint-disable-next-line no-constant-condition
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          let touched = false
          for (const part of parts) {
            if (part.startsWith(':')) continue // comment/ping
            for (const ln of part.split('\n')) {
              if (ln.startsWith('event:')) {
                const ev = ln.slice(6).trim()
                if (ev.startsWith('coverage.') || ev === 'gap.changed') touched = true
              }
            }
          }
          if (touched) fetchData()
        }
      } catch {/* desconectou — useEffect cleanup faz a limpeza */}
    }

    listen()
    return () => {
      stopped = true
      try { reader?.cancel() } catch { /* ignore */ }
    }
  }, [fetchData])

  // ---------- Month navigation ----------

  const canGoPrev = () => {
    const diff = (selectedMonth.getFullYear() - new Date().getFullYear()) * 12 + selectedMonth.getMonth() - new Date().getMonth()
    return diff > MIN_MONTH_OFFSET
  }

  const canGoNext = () => {
    const diff = (selectedMonth.getFullYear() - new Date().getFullYear()) * 12 + selectedMonth.getMonth() - new Date().getMonth()
    return diff < MAX_MONTH_OFFSET
  }

  const goToPrevMonth = () => {
    if (canGoPrev()) setSelectedMonth(prev => startOfMonth(subMonths(prev, 1)))
  }

  const goToNextMonth = () => {
    if (canGoNext()) setSelectedMonth(prev => startOfMonth(addMonths(prev, 1)))
  }

  // ---------- KPI values ----------
  // Story 2.5 — vindos do endpoint /coverages/kpis (verdade do mês selecionado).

  const totalGaps = kpis?.gapsTotal ?? gaps?.totalGaps ?? 0
  const monthCost = kpis?.estimatedCoverageMonthCost ?? 0
  const availableFeristasCount = kpis?.availableFeristasCount ?? 0
  const allGaps = gaps?.gaps ?? []
  const workplaceOptions = Array.from(new Set(allGaps.map(g => g.workplace?.name).filter(Boolean) as string[])).sort()
  const uncoveredGaps = allGaps
    .filter(g => !g.hasCoverage)
    .filter(g => !workplaceFilter || g.workplace?.name === workplaceFilter)
  const plannedCoverages = coverages.filter(c => c.status === 'PLANNED').length

  // ---------- Modal logic ----------

  const closeSheet = useCallback(() => {
    setSheetVisible(false)
    setTimeout(() => {
      setModalOpen(false)
      setModalGap(null)
    }, 300)
  }, [])

  const openAssignModal = async (gap: Gap) => {
    setModalGap(gap)
    setSelectedReplacement(null)
    setSelectedType('')
    setSelectedCost(0)
    setSuggestions(null)
    setModalOpen(true)
    // Trigger slide-in on next frame so the transition plays
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSheetVisible(true)
      })
    })

    try {
      setSuggestionsLoading(true)
      const res: SuggestionsResponse = await HttpClient.get(
        `/coverages/suggestions?vacationRequestId=${gap.vacationRequestId}`
      )
      setSuggestions(res)
    } catch (err: unknown) {
      console.error(err)
      toast.error('Erro ao buscar sugestoes de cobertura')
    } finally {
      setSuggestionsLoading(false)
    }
  }

  const handleSelectReplacement = (id: string | 'NONE', type: string, cost: number) => {
    setSelectedReplacement(id)
    setSelectedType(type)
    setSelectedCost(cost)
  }

  const confirmCoverage = async () => {
    if (!modalGap) return
    if (selectedReplacement === 'NONE') {
      toast('Nenhuma cobertura atribuida por agora.')
      closeSheet()
      return
    }
    if (!selectedReplacement) return

    try {
      setSubmitting(true)
      await HttpClient.post('/coverages', {
        vacationRequestId: modalGap.vacationRequestId,
        replacementEmployeeId: selectedReplacement,
        workplacePositionId: modalGap.workplace?.positionId ?? null,
        startDate: modalGap.vacationStart,
        endDate: modalGap.vacationEnd,
        type: selectedType,
        cost: selectedCost,
      })
      toast.success('Cobertura atribuida com sucesso!')
      closeSheet()
      fetchData()
    } catch (err: any) {
      // V3.4 C3: trata bloqueio anti-overlap (409 COVERAGE_OVERLAP) com mensagem
      // contextualizada apontando o conflito.
      const errBody = err?.body?.error
      if (err?.status === 409 && errBody?.code === 'COVERAGE_OVERLAP') {
        toast.error(errBody.message || 'Substituto já está em outra cobertura nesse período.', { duration: 8000 })
      } else {
        const message = err instanceof Error ? err.message : 'Erro ao criar cobertura'
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- Coverage management (V3.4 FASE H) ----------

  const filteredCoverages = coverageStatusFilter === 'ALL'
    ? coverages
    : coverages.filter(c => c.status === coverageStatusFilter)

  const exportCoveragesCsv = () => {
    if (filteredCoverages.length === 0) {
      toast.error('Nenhuma cobertura para exportar.')
      return
    }
    const headers = ['Matr. Substituto', 'Substituto', 'Tipo', 'Matr. Cobrindo', 'Cobrindo', 'Posto', 'Cargo', 'Inicio', 'Fim', 'Status', 'Custo']
    const rows = filteredCoverages.map(c => [
      c.replacementEmployee?.registration ?? '',
      c.replacementEmployee?.name ?? '',
      c.type,
      c.vacationRequest?.employee?.registration ?? '',
      c.vacationRequest?.employee?.name ?? '',
      c.workplacePosition?.workplace?.name ?? '',
      c.workplacePosition?.role ?? '',
      format(parseISO(c.startDate), 'dd/MM/yyyy'),
      format(parseISO(c.endDate), 'dd/MM/yyyy'),
      c.status,
      c.cost != null ? Number(c.cost).toFixed(2).replace('.', ',') : '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `coberturas-${format(new Date(), 'yyyy-MM-dd')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${filteredCoverages.length} cobertura(s) exportada(s).`)
  }

  const openEditCoverage = (c: Coverage) => {
    setEditCoverage(c)
    setEditStatus(c.status)
    setEditCost(c.cost != null ? String(c.cost) : '')
  }

  const submitEditCoverage = async () => {
    if (!editCoverage) return
    const payload: { status?: string; cost?: number } = {}
    if (editStatus !== editCoverage.status) payload.status = editStatus
    const costNum = editCost === '' ? null : Number(editCost.replace(',', '.'))
    if (costNum !== null && (!Number.isFinite(costNum) || costNum < 0)) {
      toast.error('Custo invalido.')
      return
    }
    if (costNum !== null && costNum !== editCoverage.cost) payload.cost = costNum
    if (Object.keys(payload).length === 0) {
      toast('Nada a alterar.')
      setEditCoverage(null)
      return
    }
    try {
      setEditSubmitting(true)
      await HttpClient.patch(`/coverages/${editCoverage.id}`, payload)
      toast.success('Cobertura atualizada.')
      setEditCoverage(null)
      fetchData()
    } catch (e: any) {
      toast.error(e?.body?.error?.message || e?.message || 'Erro ao atualizar.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const deleteCoverage = async (c: Coverage) => {
    if (c.status !== 'PLANNED') {
      toast.error('Apenas coberturas PLANEJADAS podem ser excluidas. Para coberturas em andamento, marque como Concluida pela edicao.')
      return
    }
    const who = c.replacementEmployee?.name ?? 'cobertura'
    if (!confirm(`Excluir cobertura de ${who}?\n\nEsta acao nao pode ser desfeita.`)) return
    try {
      await HttpClient.delete(`/coverages/${c.id}`)
      toast.success('Cobertura removida.')
      fetchData()
    } catch (e: any) {
      toast.error(e?.body?.error?.message || e?.message || 'Erro ao excluir.')
    }
  }

  // ---------- Render ----------

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full relative">
      <main className="max-w-[1600px] mx-auto px-4 pt-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary" />
              Painel de Cobertura
              <InfoTooltip text="Gerencie a cobertura de postos de trabalho durante periodos de ferias dos colaboradores. Visualize gaps e atribua substitutos." />
            </h2>
            <p className="text-slate-400 mt-2 flex items-center gap-1">
              Identifique gaps de cobertura e atribua substitutos para cada ferias.
              <InfoTooltip text="Gaps sao periodos de ferias onde o posto de trabalho fica sem cobertura. Atribua feristas ou intermitentes para garantir continuidade." />
            </p>
          </div>

          {/* Actions + Month Selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/allocations/import/template`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                  })
                  if (!res.ok) throw new Error('Erro ao baixar template')
                  const blob = await res.blob()
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'modelo-alocacoes.xlsx'
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  window.URL.revokeObjectURL(url)
                } catch (err) {
                  alert('Erro ao baixar template: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-700 text-emerald-400 rounded-xl hover:bg-slate-800 text-xs font-bold cursor-pointer"
              title="Baixar modelo de planilha de alocacoes"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Modelo Alocacoes
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 border border-slate-700 text-sky-400 rounded-xl hover:bg-slate-800 text-xs font-bold cursor-pointer"
              title="Importar alocacoes via planilha">
              <Upload className="w-3.5 h-3.5" /> Importar
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const formData = new FormData()
                formData.append('file', file)
                try {
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/allocations/import`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: formData
                  })
                  const data = await res.json()
                  if (res.ok) { toast.success(data.message); fetchData() }
                  else { toast.error(data.message || 'Erro na importacao') }
                } catch { toast.error('Erro ao importar') }
                e.target.value = ''
              }} />
            </label>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 p-2 rounded-xl">
            {/* V3.4 A1: toggle entre rolling 90d (default) e mês específico */}
            <button
              onClick={() => setViewMode('90d')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                viewMode === '90d'
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Próximos 90 dias a partir de hoje"
            >
              Próximos 90d
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                viewMode === 'month'
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Visualizar mês específico"
            >
              Por mês
            </button>
            {viewMode === 'month' && (
              <>
                <div className="w-px h-6 bg-slate-700 mx-1" />
                <button
                  onClick={goToPrevMonth}
                  disabled={!canGoPrev()}
                  className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-sm font-bold text-white min-w-[120px] text-center flex items-center justify-center gap-1">
                  <Calendar className="w-4 h-4 text-primary" />
                  {format(selectedMonth, 'MMMM yyyy', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
                  <InfoTooltip text="Período de análise. Navegue até 3 meses no passado ou 6 meses no futuro." />
                </span>
                <button
                  onClick={goToNextMonth}
                  disabled={!canGoNext()}
                  className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* V3.4 Story 4.20: alerta de colaboradores FERIAS sem registro */}
        {orphansLoaded && orphanFeristas.length > 0 && (
          <div className="glass-card rounded-2xl border border-amber-500/40 bg-amber-500/5 mb-6 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-bold text-amber-200 text-sm">
                  {orphanFeristas.length} colaborador(es) com status "Férias" mas sem registro de período
                </h4>
                <p className="text-xs text-amber-100/80 mt-1">
                  Estes colaboradores foram importados com status de férias, mas não há registro de início e fim no sistema —
                  então não aparecem como gap nem permitem cobertura. <strong>Registre o período de cada um</strong> usando o botão
                  "Programar Férias" em "Programação de Férias", informando início e fim observados.
                </p>
                <details className="mt-3">
                  <summary className="text-xs text-amber-300 cursor-pointer hover:text-amber-200 font-bold">Ver lista ({orphanFeristas.length})</summary>
                  <div className="mt-2 max-h-64 overflow-y-auto bg-slate-950/40 rounded-lg border border-white/5">
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/40 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5">Nome</th>
                          <th className="text-left px-3 py-1.5">Matr.</th>
                          <th className="text-left px-3 py-1.5">Cargo</th>
                          <th className="text-left px-3 py-1.5">Posto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {orphanFeristas.map(o => (
                          <tr key={o.id} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-1.5 text-white font-medium">{o.name}</td>
                            <td className="px-3 py-1.5 text-slate-400 font-mono">{o.registration || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-400">{o.position || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-400">{o.workplace || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}

        <ErrorBoundary>
          {loading ? (
            <>
              {/* Skeleton KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse glass-card p-6 rounded-2xl border border-white/5">
                    <div className="h-3 bg-slate-800/50 rounded w-28 mb-4" />
                    <div className="h-10 bg-slate-800/50 rounded w-16 mb-4" />
                    <div className="h-2 bg-slate-800/50 rounded w-40" />
                  </div>
                ))}
              </div>
              {/* Skeleton gap list */}
              <div className="animate-pulse glass-card rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5">
                  <div className="h-5 bg-slate-800/50 rounded w-48" />
                </div>
                <div className="divide-y divide-white/5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-6 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-800/50 shrink-0" />
                        <div className="space-y-2">
                          <div className="h-4 bg-slate-800/50 rounded w-36" />
                          <div className="h-3 bg-slate-800/50 rounded w-52" />
                          <div className="h-2 bg-slate-800/50 rounded w-28" />
                        </div>
                      </div>
                      <div className="h-10 bg-slate-800/50 rounded-lg w-40" />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* KPI Cards — Story 2.5 (alimentados por GET /coverages/kpis) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Total de Gaps — variante Danger se > 0 */}
                <div className={`glass-card p-6 rounded-2xl relative overflow-hidden group border ${totalGaps > 0 ? 'border-rose-500/60 ring-1 ring-rose-500/30' : 'border-white/5'}`}>
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <AlertTriangle className="w-24 h-24 text-rose-500" />
                  </div>
                  <h3 className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-2 z-10 relative flex items-center gap-1">
                    Total de Gaps
                    <InfoTooltip text="Quantidade de periodos de ferias sem cobertura atribuida neste mes. Quanto maior, mais postos ficam descobertos." />
                  </h3>
                  <p className={`text-4xl font-black z-10 relative ${totalGaps > 0 ? 'text-rose-400' : 'text-white'}`}>{totalGaps}</p>
                  <p className="mt-4 text-xs text-slate-500 z-10 relative">
                    {uncoveredGaps.length} sem cobertura atribuida · {plannedCoverages} planejadas
                  </p>
                </div>

                {/* Custo Estimado do Mês */}
                <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Shield className="w-24 h-24 text-emerald-500" />
                  </div>
                  <h3 className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-2 z-10 relative flex items-center gap-1">
                    Custo Estimado do Mes
                    <InfoTooltip text="Soma dos custos estimados das coberturas (PLANNED + ACTIVE) que tocam o mes selecionado. Calculado a partir do salario / 30 x dias do substituto." />
                  </h3>
                  <p className="text-3xl font-black text-white z-10 relative">{fmtBRL(monthCost)}</p>
                  <p className="mt-4 text-xs text-slate-500 z-10 relative">
                    Coberturas tocando o mes
                  </p>
                </div>

                {/* Feristas Disponíveis (do endpoint, não do modal) */}
                <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Users className="w-24 h-24 text-sky-500" />
                  </div>
                  <h3 className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-2 z-10 relative flex items-center gap-1">
                    Feristas Disponiveis
                    <InfoTooltip text="Feristas ATIVOs sem cobertura sobreposta ao mes selecionado. Sao candidatos imediatos para novos gaps." />
                  </h3>
                  <p className="text-4xl font-black text-white z-10 relative">{availableFeristasCount}</p>
                  <p className="mt-4 text-xs text-slate-500 z-10 relative">
                    Profissionais para substituicao
                  </p>
                </div>
              </div>

              {/* V3.4 FASE C5: Painel "Feristas Livres no período" — pre-planejamento. */}
              {feristasLivres && feristasLivres.length > 0 && (
                <div className="glass-card rounded-2xl border border-white/5 overflow-hidden mb-6">
                  <button
                    type="button"
                    onClick={() => setShowFeristasPanel(prev => !prev)}
                    className="w-full p-4 border-b border-white/5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                  >
                    <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-indigo-400" />
                      Feristas no Período
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {feristasLivres.filter(f => f.isFree).length} livres
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {feristasLivres.filter(f => !f.isFree).length} ocupados
                      </span>
                    </h3>
                    <span className="text-xs text-slate-500">{showFeristasPanel ? 'Recolher' : 'Expandir'}</span>
                  </button>
                  {showFeristasPanel && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-900/50 text-[10px] uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="text-left px-4 py-2">Status</th>
                            <th className="text-left px-4 py-2">Ferista</th>
                            <th className="text-left px-4 py-2">Cargo</th>
                            <th className="text-left px-4 py-2">Posto base</th>
                            <th className="text-left px-4 py-2">Escala</th>
                            <th className="text-right px-4 py-2">Coberturas no período</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {feristasLivres.map(f => (
                            <tr key={f.id} className="hover:bg-white/[0.02]">
                              <td className="px-4 py-2">
                                {f.isFree ? (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Livre</span>
                                ) : (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">Ocupado</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-white font-bold text-[13px]">{f.name}</td>
                              <td className="px-4 py-2 text-slate-300 text-xs">{f.position || '—'}</td>
                              <td className="px-4 py-2 text-slate-400 text-xs">{f.workplace || '—'}</td>
                              <td className="px-4 py-2 text-slate-500 text-xs">{f.shift || '—'}</td>
                              <td className="px-4 py-2 text-right text-slate-300 font-mono text-xs">{f.coveragesInPeriod}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Gantt Timeline (Story 2.4) */}
              {(gaps?.gaps?.length ?? 0) > 0 && (
                <div className="glass-card rounded-2xl border border-white/5 overflow-hidden mb-8">
                  <div className="p-4 border-b border-white/5">
                    <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      Timeline de Cobertura
                      <InfoTooltip text="Visualização do mês com barras coloridas: vermelho = gap sem cobertura, verde = coberto. Clique em um gap para atribuir cobertura." />
                    </h3>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    {(() => {
                      const monthStart = startOfMonth(selectedMonth)
                      const monthEnd = endOfMonth(selectedMonth)
                      const daysInMonth = monthEnd.getDate()
                      const allGaps = gaps?.gaps ?? []
                      // Group by workplace
                      const byWorkplace = new Map<string, Gap[]>()
                      allGaps.forEach(g => {
                        const key = g.workplace?.name || 'Sem Posto'
                        if (!byWorkplace.has(key)) byWorkplace.set(key, [])
                        byWorkplace.get(key)!.push(g)
                      })

                      return (
                        <div className="min-w-[700px]">
                          {/* Day headers */}
                          <div className="flex items-center mb-2">
                            <div className="w-36 shrink-0 text-xs text-slate-500 font-bold">Posto</div>
                            <div className="flex-1 flex">
                              {Array.from({ length: daysInMonth }, (_, i) => (
                                <div key={i} className="flex-1 text-center text-[9px] text-slate-600 font-mono">
                                  {i + 1}
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Workplace rows */}
                          {Array.from(byWorkplace.entries()).map(([name, wpGaps]) => (
                            <div key={name} className="flex items-center mb-1">
                              <div className="w-36 shrink-0 text-xs text-slate-300 font-bold truncate pr-2" title={name}>{name}</div>
                              <div className="flex-1 flex h-7 bg-slate-800/30 rounded overflow-hidden relative">
                                {/* Green background (covered) */}
                                <div className="absolute inset-0 bg-emerald-500/10 rounded" />
                                {/* Gap bars (red) */}
                                {wpGaps.map(g => {
                                  const gStart = Math.max(1, parseISO(g.vacationStart).getDate())
                                  const gEnd = Math.min(daysInMonth, parseISO(g.vacationEnd).getDate())
                                  const left = ((gStart - 1) / daysInMonth) * 100
                                  const width = ((gEnd - gStart + 1) / daysInMonth) * 100
                                  return (
                                    <button
                                      key={g.vacationRequestId}
                                      onClick={() => openAssignModal(g)}
                                      className={`absolute top-0.5 bottom-0.5 rounded-sm cursor-pointer transition-colors hover:brightness-125 ${
                                        g.hasCoverage ? 'bg-emerald-500/60' : 'bg-red-500/70'
                                      }`}
                                      style={{ left: `${left}%`, width: `${width}%` }}
                                      title={`${g.employeeName}: ${format(parseISO(g.vacationStart), 'dd/MM')} - ${format(parseISO(g.vacationEnd), 'dd/MM')} (${g.days}d)${g.hasCoverage ? ' ✓ Coberto' : ' ⚠ Gap'}`}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                          {/* Legend */}
                          <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/70 inline-block" /> Gap (sem cobertura)</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500/60 inline-block" /> Coberto</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* V3.4 FASE H: Coberturas Atribuidas (gestao + CSV) */}
              {coverages.length > 0 && (
                <div className="glass-card rounded-2xl border border-white/5 overflow-hidden mb-6">
                  <div className="p-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCoveragesPanel(p => !p)}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <Shield className="w-4 h-4 text-emerald-400" />
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                        Coberturas Atribuídas ({coverages.length})
                      </h3>
                      <InfoTooltip text="Lista de todas as coberturas (planejadas, ativas, concluídas) no escopo carregado. Clique em Editar para alterar status/custo ou em Excluir para remover (apenas PLANEJADAS)." />
                      <span className="text-xs text-slate-500">{showCoveragesPanel ? 'Recolher' : 'Expandir'}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <select
                        value={coverageStatusFilter}
                        onChange={e => setCoverageStatusFilter(e.target.value as 'ALL' | 'PLANNED' | 'ACTIVE' | 'COMPLETED')}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="ALL">Todos os status</option>
                        <option value="PLANNED">Planejadas</option>
                        <option value="ACTIVE">Ativas</option>
                        <option value="COMPLETED">Concluídas</option>
                      </select>
                      <button
                        onClick={exportCoveragesCsv}
                        className="flex items-center gap-1 px-2.5 py-1 border border-slate-700 text-emerald-300 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors"
                        title="Exportar coberturas filtradas para CSV"
                      >
                        <FileSpreadsheet className="w-3 h-3" /> CSV
                      </button>
                    </div>
                  </div>
                  {showCoveragesPanel && (
                    <div className="overflow-x-auto">
                      {filteredCoverages.length === 0 ? (
                        <p className="p-6 text-sm text-slate-500 text-center">Nenhuma cobertura no filtro atual.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-900/50 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="text-left px-4 py-2">Substituto</th>
                              <th className="text-left px-4 py-2">Tipo</th>
                              <th className="text-left px-4 py-2">Cobrindo</th>
                              <th className="text-left px-4 py-2">Posto / Cargo</th>
                              <th className="text-left px-4 py-2">Período</th>
                              <th className="text-right px-4 py-2">Custo</th>
                              <th className="text-left px-4 py-2">Status</th>
                              <th className="text-right px-4 py-2">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredCoverages.map(c => {
                              const typeClass = c.type === 'FERISTA'
                                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              const statusClass = c.status === 'ACTIVE'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : c.status === 'PLANNED'
                                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                  : 'bg-slate-700/40 text-slate-400 border-slate-600/50'
                              const statusLabel = c.status === 'ACTIVE' ? 'Ativa' : c.status === 'PLANNED' ? 'Planejada' : 'Concluída'
                              return (
                                <tr key={c.id} className="hover:bg-white/[0.02]">
                                  <td className="px-4 py-2 text-white font-bold text-[13px]">
                                    {c.replacementEmployee?.name ?? '—'}
                                    {c.replacementEmployee?.registration && (
                                      <span className="ml-1.5 text-[10px] font-mono font-normal text-slate-500">Matr. {c.replacementEmployee.registration}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${typeClass}`}>{c.type}</span>
                                  </td>
                                  <td className="px-4 py-2 text-slate-300 text-xs">
                                    {c.vacationRequest?.employee?.name ?? '—'}
                                    {c.vacationRequest?.employee?.registration && (
                                      <span className="ml-1 text-[10px] font-mono text-slate-500">[{c.vacationRequest.employee.registration}]</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-slate-400 text-xs">
                                    {c.workplacePosition?.workplace?.name ?? '—'}
                                    {c.workplacePosition?.role && <span className="text-slate-600"> / {c.workplacePosition.role}</span>}
                                  </td>
                                  <td className="px-4 py-2 text-slate-300 text-xs font-mono whitespace-nowrap">
                                    {format(parseISO(c.startDate), 'dd/MM')} – {format(parseISO(c.endDate), 'dd/MM/yy')}
                                  </td>
                                  <td className="px-4 py-2 text-right text-emerald-400 font-mono text-xs whitespace-nowrap">
                                    {c.cost != null ? fmtBRL(Number(c.cost)) : '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${statusClass}`}>{statusLabel}</span>
                                  </td>
                                  <td className="px-4 py-2 text-right whitespace-nowrap">
                                    <button
                                      onClick={() => openEditCoverage(c)}
                                      className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800 inline-flex items-center gap-1"
                                      title="Editar status e custo"
                                    >
                                      <Pencil className="w-3 h-3" /> Editar
                                    </button>
                                    <button
                                      onClick={() => deleteCoverage(c)}
                                      disabled={c.status !== 'PLANNED'}
                                      className="text-xs text-rose-300 hover:text-rose-200 px-2 py-1 rounded hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1 ml-1"
                                      title={c.status !== 'PLANNED' ? 'Apenas coberturas PLANEJADAS podem ser excluídas. Para ativas/concluídas, edite o status.' : 'Excluir cobertura'}
                                    >
                                      <Trash2 className="w-3 h-3" /> Excluir
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Gaps List */}
              <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
                  <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Gaps de Cobertura ({uncoveredGaps.length})
                    <InfoTooltip text="Lista de ferias sem substituto atribuido. Marque um ou mais e clique em 'Atribuir em lote' para auto-match, ou abra individualmente para escolher." />
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {workplaceOptions.length > 1 && (
                      <select
                        value={workplaceFilter}
                        onChange={e => setWorkplaceFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                        title="Filtrar gaps por posto"
                      >
                        <option value="">Todos os postos</option>
                        {workplaceOptions.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    )}
                  {uncoveredGaps.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setBulkSelectedVrIds(new Set(bulkSelectedVrIds.size === uncoveredGaps.length ? [] : uncoveredGaps.map(g => g.vacationRequestId)))}
                        className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800"
                      >
                        {bulkSelectedVrIds.size === uncoveredGaps.length ? 'Desmarcar todos' : 'Marcar todos'}
                      </button>
                      <button
                        onClick={runBulkAssign}
                        disabled={bulkSelectedVrIds.size === 0 || bulkRunning}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-500/20"
                        title="Sistema escolhe automaticamente o melhor ferista disponivel para cada gap selecionado"
                      >
                        <Sparkles className="w-3 h-3" />
                        {bulkRunning ? 'Atribuindo...' : `Atribuir em lote (${bulkSelectedVrIds.size})`}
                      </button>
                    </div>
                  )}
                  </div>
                </div>

                {uncoveredGaps.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                    <Shield className="w-12 h-12 text-emerald-500/50 mb-4" />
                    <p className="text-lg font-bold text-white">Nenhum gap de cobertura!</p>
                    <p className="text-sm text-slate-400 mt-1">Todos os periodos de ferias estao cobertos neste mes.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {uncoveredGaps.map((gap) => (
                      <div
                        key={gap.vacationRequestId}
                        className={`p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${bulkSelectedVrIds.has(gap.vacationRequestId) ? 'bg-indigo-500/5' : ''}`}
                      >
                        <div className="flex items-start gap-4">
                          <input
                            type="checkbox"
                            checked={bulkSelectedVrIds.has(gap.vacationRequestId)}
                            onChange={() => toggleBulkSelect(gap.vacationRequestId)}
                            className="accent-indigo-500 cursor-pointer mt-1"
                            title="Marcar para atribuicao em lote"
                          />
                          <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm border border-white/5 shrink-0">
                            {gap.employeeName?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-white flex items-center gap-2">
                              {gap.employeeName}
                              <InfoTooltip text="Colaborador que estara de ferias neste periodo e cujo posto precisa de cobertura." />
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                              <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded text-xs">
                                {format(parseISO(gap.vacationStart), 'dd/MM/yyyy')}
                              </span>
                              <span className="text-slate-500 text-xs">ate</span>
                              <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded text-xs">
                                {format(parseISO(gap.vacationEnd), 'dd/MM/yyyy')}
                              </span>
                              <span className="font-bold text-white text-xs ml-1">({gap.days}d)</span>
                            </div>
                            {gap.workplace && (
                              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {gap.workplace.name}
                                {gap.workplace.role && (
                                  <span className="text-slate-600"> / {gap.workplace.role}</span>
                                )}
                                <InfoTooltip text="Posto de trabalho e funcao que precisam ser cobertos durante a ausencia." />
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => openAssignModal(gap)}
                          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-primary/20 shrink-0"
                        >
                          <UserCheck className="w-4 h-4" />
                          Atribuir Cobertura
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </ErrorBoundary>
      </main>

      {/* Assignment Sheet (slide-in panel) */}
      {modalOpen && modalGap && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ${
              sheetVisible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeSheet}
          />

          {/* Sheet Panel */}
          <div
            className={`fixed top-0 right-0 h-full w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
              sheetVisible ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Sheet Header */}
            <div className="p-4 border-b border-white/5 bg-primary/10 flex items-center gap-3 shrink-0">
              <button
                onClick={closeSheet}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                title="Fechar painel"
              >
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </button>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Shield className="w-6 h-6 text-primary shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-white">Atribuir Cobertura</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {modalGap.employeeName} &mdash; {format(parseISO(modalGap.vacationStart), 'dd/MM')} a {format(parseISO(modalGap.vacationEnd), 'dd/MM')}
                    <InfoTooltip text="Periodo de ferias do colaborador para o qual voce esta atribuindo cobertura." />
                  </p>
                </div>
              </div>
            </div>

            {/* Sheet Body (scrollable) */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {suggestionsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-slate-400 text-sm">Buscando sugestoes...</p>
                </div>
              ) : (
                <>
                  {/* Feristas */}
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1">
                      Feristas
                      <InfoTooltip text="Profissionais contratados especificamente para cobrir ferias. Geralmente mais baratos e ja familiarizados com a funcao." />
                    </h4>
                    {(!suggestions?.suggestions?.feristas || suggestions.suggestions.feristas.length === 0) ? (
                      <p className="text-sm text-slate-500 py-3">Nenhum ferista disponivel para este periodo.</p>
                    ) : (
                      <div className="space-y-2">
                        {suggestions.suggestions.feristas.map((s) => {
                          const matchClass = s.match?.level === 'identical'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : s.match?.level === 'family'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-slate-700/40 text-slate-400 border-slate-600/50'
                          const matchLabel = s.match?.level === 'identical'
                            ? 'Cargo idêntico'
                            : s.match?.level === 'family'
                              ? 'Família compatível'
                              : 'Cargo diferente'
                          return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                              selectedReplacement === s.id
                                ? 'border-primary bg-primary/10'
                                : 'border-white/5 hover:border-white/10 bg-slate-800/30'
                            }`}
                          >
                            <input
                              type="radio"
                              name="replacement"
                              checked={selectedReplacement === s.id}
                              onChange={() => handleSelectReplacement(s.id, s.type, s.estimatedCost)}
                              className="accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-white truncate">{s.name}</p>
                                {s.match && (
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${matchClass}`}
                                    title={s.match.reason}
                                  >
                                    {matchLabel}
                                  </span>
                                )}
                                {s.canChain && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-indigo-500/15 text-indigo-300 border-indigo-500/30" title="Encadeia com cobertura adjacente">
                                    Encadeia
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                {s.position || 'Cargo n/d'}
                                {s.shift && <span className="text-slate-600"> · {s.shift}</span>}
                              </p>
                            </div>
                            <span className="text-sm font-mono font-bold text-emerald-400 shrink-0">
                              R$ {s.estimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              <InfoTooltip text="Custo estimado para este profissional cobrir o periodo completo de ferias." />
                            </span>
                          </label>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Intermitentes */}
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1">
                      Intermitentes
                      <InfoTooltip text="Trabalhadores intermitentes que podem ser convocados para cobertura pontual. Custo por diaria." />
                    </h4>
                    {(!suggestions?.suggestions?.intermitentes || suggestions.suggestions.intermitentes.length === 0) ? (
                      <p className="text-sm text-slate-500 py-3">Nenhum intermitente disponivel para este periodo.</p>
                    ) : (
                      <div className="space-y-2">
                        {suggestions.suggestions.intermitentes.map((s) => (
                          <label
                            key={s.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                              selectedReplacement === s.id
                                ? 'border-primary bg-primary/10'
                                : 'border-white/5 hover:border-white/10 bg-slate-800/30'
                            }`}
                          >
                            <input
                              type="radio"
                              name="replacement"
                              checked={selectedReplacement === s.id}
                              onChange={() => handleSelectReplacement(s.id, s.type, s.estimatedCost)}
                              className="accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{s.name}</p>
                              <p className="text-xs text-slate-500">{s.type}</p>
                            </div>
                            <span className="text-sm font-mono font-bold text-amber-400 shrink-0">
                              R$ {s.estimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              <InfoTooltip text="Custo estimado para este profissional intermitente cobrir o periodo completo." />
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* No coverage option */}
                  <div>
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedReplacement === 'NONE'
                          ? 'border-slate-500 bg-slate-700/30'
                          : 'border-white/5 hover:border-white/10 bg-slate-800/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="replacement"
                        checked={selectedReplacement === 'NONE'}
                        onChange={() => handleSelectReplacement('NONE', '', 0)}
                        className="accent-slate-400"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-300">Sem cobertura por agora</p>
                        <p className="text-xs text-slate-500">
                          Manter o gap aberto para atribuicao futura.
                          <InfoTooltip text="Selecione esta opcao se nao deseja atribuir cobertura neste momento. O gap permanecera visivel para atribuicao posterior." />
                        </p>
                      </div>
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* Sheet Footer (sticky at bottom) */}
            <div className="p-4 border-t border-white/5 flex justify-between gap-3 bg-slate-900 shrink-0 flex-wrap">
              {/* V3.4 Story 4.3: encadeamento automatico multi-ferista */}
              <button
                onClick={() => modalGap && autoChain(modalGap.vacationRequestId)}
                disabled={!modalGap || chainRunning}
                className="px-4 py-2 rounded-lg text-xs font-bold border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                title="Sistema acha 2 ou 3 feristas em sequência para cobrir o período inteiro sem conflito"
              >
                <Sparkles className="w-3 h-3" />
                {chainRunning ? 'Calculando...' : 'Encadear feristas (auto)'}
              </button>
              <div className="flex gap-3 ml-auto">
                <button
                  onClick={closeSheet}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCoverage}
                  disabled={!selectedReplacement || submitting}
                  className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Salvando...' : 'Confirmar Cobertura'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* V3.4 FASE H: modal de edicao de cobertura */}
      {editCoverage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !editSubmitting && setEditCoverage(null)}
        >
          <div
            className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-md mx-4 p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Editar Cobertura</h3>
              <button
                onClick={() => !editSubmitting && setEditCoverage(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md"
                disabled={editSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 bg-slate-900/50 border border-white/5 rounded-xl p-3 text-xs text-slate-300">
              <p><strong className="text-white">{editCoverage.replacementEmployee?.name}</strong> cobrindo <strong className="text-white">{editCoverage.vacationRequest?.employee?.name}</strong></p>
              <p className="text-slate-500 mt-1">{editCoverage.workplacePosition?.workplace?.name} / {editCoverage.workplacePosition?.role}</p>
              <p className="text-slate-500">{format(parseISO(editCoverage.startDate), 'dd/MM/yyyy')} – {format(parseISO(editCoverage.endDate), 'dd/MM/yyyy')}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as 'PLANNED' | 'ACTIVE' | 'COMPLETED')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  disabled={editSubmitting}
                >
                  <option value="PLANNED">Planejada — ainda não começou</option>
                  <option value="ACTIVE">Ativa — substituto trabalhando</option>
                  <option value="COMPLETED">Concluída — cobertura finalizada</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Custo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editCost}
                  onChange={e => setEditCost(e.target.value)}
                  placeholder="Ex: 1862.09"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  disabled={editSubmitting}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <button
                onClick={() => setEditCoverage(null)}
                disabled={editSubmitting}
                className="px-4 py-2 text-sm border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitEditCoverage}
                disabled={editSubmitting}
                className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {editSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
