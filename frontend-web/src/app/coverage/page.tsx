'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Shield, AlertTriangle, Users, Calendar, ChevronLeft, ChevronRight, UserCheck, FileSpreadsheet, Upload, ArrowLeft } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { HttpClient } from '@/lib/api-client'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
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

interface Suggestion {
  id: string
  name: string
  estimatedCost: number
  type: string
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
  status: string
  startDate: string
  endDate: string
  type: string
  cost: number
}

interface CoverageKpis {
  month: string
  gapsTotal: number
  estimatedCoverageMonthCost: number
  availableFeristasCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPeriodRange(ref: Date) {
  const from = format(startOfMonth(ref), 'yyyy-MM-dd')
  const to = format(endOfMonth(ref), 'yyyy-MM-dd')
  return { from, to }
}

const MIN_MONTH_OFFSET = -3
const MAX_MONTH_OFFSET = 3

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CoveragePage() {
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))
  const [gaps, setGaps] = useState<GapsResponse | null>(null)
  const [coverages, setCoverages] = useState<Coverage[]>([])
  const [kpis, setKpis] = useState<CoverageKpis | null>(null)
  const [loading, setLoading] = useState(true)

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

  // ---------- Data fetching ----------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const { from, to } = buildPeriodRange(selectedMonth)
      const monthParam = format(selectedMonth, 'yyyy-MM')
      const [gapsRes, coveragesRes, kpisRes] = await Promise.all([
        HttpClient.get(`/coverages/gaps?from=${from}&to=${to}`),
        HttpClient.get('/coverages'),
        HttpClient.get(`/coverages/kpis?month=${monthParam}`),
      ])
      setGaps(gapsRes)
      setCoverages(coveragesRes)
      setKpis(kpisRes)
    } catch (err: unknown) {
      console.error(err)
      toast.error('Erro ao carregar dados de cobertura')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    fetchData()
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
  const uncoveredGaps = (gaps?.gaps ?? []).filter(g => !g.hasCoverage)
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar cobertura'
      toast.error(message)
    } finally {
      setSubmitting(false)
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
              <InfoTooltip text="Periodo de analise. Navegue ate 3 meses no passado ou no futuro a partir do mes atual." />
            </span>
            <button
              onClick={goToNextMonth}
              disabled={!canGoNext()}
              className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

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

              {/* Gaps List */}
              <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Gaps de Cobertura ({uncoveredGaps.length})
                    <InfoTooltip text="Lista de ferias sem substituto atribuido. Clique em Atribuir Cobertura para designar um profissional." />
                  </h3>
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
                        className="p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-4">
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
                        {suggestions.suggestions.feristas.map((s) => (
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
                            <span className="text-sm font-mono font-bold text-emerald-400 shrink-0">
                              R$ {s.estimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              <InfoTooltip text="Custo estimado para este profissional cobrir o periodo completo de ferias." />
                            </span>
                          </label>
                        ))}
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
            <div className="p-4 border-t border-white/5 flex justify-end gap-3 bg-slate-900 shrink-0">
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
        </>
      )}
    </div>
  )
}
