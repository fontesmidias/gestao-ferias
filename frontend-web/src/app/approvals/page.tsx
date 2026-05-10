'use client'

import React, { useState, useEffect } from 'react'
import { Check, X, Clock, Filter, Search, RotateCcw, Edit3, Trash2, ShieldAlert, FileSignature, ExternalLink, FileSpreadsheet, Upload, Plus, Send, Loader2, Table2, CalendarPlus } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { HttpClient } from '@/lib/api-client'
import { format, parseISO, differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import { ProgramVacationModal } from '@/components/vacations/ProgramVacationModal'

// --- Bulk Create Types ---
interface BulkRow {
  employeeSearch: string
  employeeId: string | null
  employeeName: string | null
  startDate: string
  endDate: string
  days: number | null
  result: { status: 'created' | 'error'; message?: string } | null
}

const emptyRow = (): BulkRow => ({
  employeeSearch: '',
  employeeId: null,
  employeeName: null,
  startDate: '',
  endDate: '',
  days: null,
  result: null,
})

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // V3.4 FASE E2: filtros multi-faceta
  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'RETURNED' | 'SIGNED' | 'COMPLETED'>('TODOS')
  const [filterSource, setFilterSource] = useState<'TODOS' | 'PROGRAMMED' | 'EMPLOYEE'>('TODOS')

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalMode, setModalMode] = useState<'APPROVE' | 'REJECT' | 'RETURN' | 'EDIT' | 'DELETE' | null>(null)
  const [dispatchNote, setDispatchNote] = useState('')
  const [editDates, setEditDates] = useState({ startDate: '', endDate: '' })

  // Single or Bulk context
  const [actionTarget, setActionTarget] = useState<string | 'BULK' | null>(null)

  // Coverage suggestion state (Story 3.5)
  const [coverageSuggestions, setCoverageSuggestions] = useState<any>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [selectedCoverageId, setSelectedCoverageId] = useState<string | null>(null)

  // --- Programar Férias (V3.4 MVP M5) ---
  const [programOpen, setProgramOpen] = useState(false)

  // --- Bulk Create State (Story 3.4) ---
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(() => Array.from({ length: 5 }, emptyRow))
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string }[]>([])
  const [bulkSearchResults, setBulkSearchResults] = useState<Record<number, { id: string; name: string }[]>>({})
  const [bulkFocusIdx, setBulkFocusIdx] = useState<number | null>(null)

  useEffect(() => {
    fetchRequests()
  }, [])

  // Fetch employees list for bulk create search
  useEffect(() => {
    if (bulkMode && allEmployees.length === 0) {
      HttpClient.get('/employees').then((data: any) => {
        const list = Array.isArray(data) ? data : data.data || []
        setAllEmployees(list.map((e: any) => ({ id: e.id, name: e.name })))
      }).catch(() => {})
    }
  }, [bulkMode])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const data = await HttpClient.get('/vacations')
      setRequests(data)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar aprovações')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(requests.map(r => r.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id])
    } else {
      setSelectedIds(prev => prev.filter(reqId => reqId !== id))
    }
  }

  const openModal = async (target: string | 'BULK', mode: 'APPROVE' | 'REJECT' | 'RETURN' | 'EDIT' | 'DELETE') => {
    setActionTarget(target)
    setModalMode(mode)
    setDispatchNote('')
    setSelectedCoverageId(null)
    setCoverageSuggestions(null)
    if (mode === 'EDIT' && target !== 'BULK') {
      const req = requests.find(r => r.id === target)
      if (req) {
        setEditDates({
          startDate: req.startDate.split('T')[0],
          endDate: req.endDate.split('T')[0]
        })
      }
    }
    setModalOpen(true)
    // Story 3.5: Buscar sugestões de cobertura ao abrir modal de aprovação
    if (mode === 'APPROVE' && target !== 'BULK') {
      setCoverageLoading(true)
      try {
        const data = await HttpClient.get(`/coverages/suggestions?vacationRequestId=${target}`)
        setCoverageSuggestions(data)
      } catch {
        setCoverageSuggestions(null)
      } finally {
        setCoverageLoading(false)
      }
    }
  }

  const confirmAction = async () => {
    setSubmitting(true)
    try {
      const payload: any = { dispatchNote }
      let endpoint = ''
      let isBulk = actionTarget === 'BULK'

      if (modalMode === 'EDIT' && !isBulk) {
        payload.status = 'PENDING'
        payload.startDate = editDates.startDate
        payload.endDate = editDates.endDate
        endpoint = `/vacations/${actionTarget}`
        await HttpClient.patch(endpoint, payload)
      } 
      else if (modalMode === 'DELETE') {
         // V3.4 FASE D3: lixeira agora é CANCELLED (não REJECTED). Não exige
         // motivo formal. Saldo do colaborador é restaurado (não conta).
         payload.status = 'CANCELLED'
         payload.dispatchNote = (payload.dispatchNote && payload.dispatchNote.trim()) || `Cancelada em ${new Date().toLocaleDateString('pt-BR')}`
         if (isBulk) {
           payload.requestIds = selectedIds
           await HttpClient.patch('/vacations/bulk', payload)
         } else {
           await HttpClient.patch(`/vacations/${actionTarget}`, payload)
         }
      }
      else {
        // APPROVE, REJECT, RETURN
        payload.status = modalMode === 'RETURN' ? 'RETURNED' : modalMode === 'APPROVE' ? 'APPROVED' : 'REJECTED'
        // Story 3.5: Incluir coverageEmployeeId ao aprovar com cobertura
        if (modalMode === 'APPROVE' && selectedCoverageId) {
          payload.coverageEmployeeId = selectedCoverageId
        }

        if (isBulk) {
          payload.requestIds = selectedIds
          await HttpClient.patch('/vacations/bulk', payload)
        } else {
          await HttpClient.patch(`/vacations/${actionTarget}`, payload)
        }
      }

      toast.success('Ação realizada com sucesso!')
      setModalOpen(false)
      setSelectedIds([])
      fetchRequests()
    } catch (err: any) {
      // V3.4 FASE D2/D4: tratamento explícito de erros do backend (422 sem
      // motivo, 409 conflito, etc). UI nunca pinta status sem confirmação.
      const errBody = err?.body?.error || err?.body
      const message = errBody?.message || err?.message || 'Erro ao realizar ação'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  // --- Bulk Create Helpers (Story 3.4) ---
  const updateBulkRow = (idx: number, patch: Partial<BulkRow>) => {
    setBulkRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, ...patch }
      // Auto-calculate days
      if (updated.startDate && updated.endDate) {
        try {
          const d = differenceInDays(parseISO(updated.endDate), parseISO(updated.startDate)) + 1
          updated.days = d > 0 ? d : null
        } catch { updated.days = null }
      } else {
        updated.days = null
      }
      return updated
    }))
  }

  const handleBulkEmployeeSearch = (idx: number, value: string) => {
    updateBulkRow(idx, { employeeSearch: value, employeeId: null, employeeName: null, result: null })
    setBulkFocusIdx(idx)
    if (value.length >= 2) {
      const matches = allEmployees.filter(e => e.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
      setBulkSearchResults(prev => ({ ...prev, [idx]: matches }))
    } else {
      setBulkSearchResults(prev => ({ ...prev, [idx]: [] }))
    }
  }

  const selectBulkEmployee = (idx: number, emp: { id: string; name: string }) => {
    updateBulkRow(idx, { employeeSearch: emp.name, employeeId: emp.id, employeeName: emp.name, result: null })
    setBulkSearchResults(prev => ({ ...prev, [idx]: [] }))
    setBulkFocusIdx(null)
  }

  const handleBulkSubmit = async () => {
    const validRows = bulkRows.filter(r => r.employeeId && r.startDate && r.endDate)
    if (validRows.length === 0) {
      toast.error('Preencha ao menos uma linha completa (colaborador + datas).')
      return
    }
    setBulkSubmitting(true)
    try {
      const payload = {
        items: validRows.map(r => ({
          employeeId: r.employeeId!,
          startDate: r.startDate,
          endDate: r.endDate,
        }))
      }
      const res = await HttpClient.post('/vacations/bulk-create', payload)
      // Map results back to rows
      setBulkRows(prev => {
        const resultMap = new Map<string, { status: 'created' | 'error'; message?: string }>()
        if (res.results) {
          for (const r of res.results) {
            resultMap.set(r.employeeId, { status: r.status, message: r.message })
          }
        }
        return prev.map(row => {
          if (!row.employeeId) return row
          const match = resultMap.get(row.employeeId)
          return match ? { ...row, result: match } : row
        })
      })
      toast.success(`${res.created} criada(s), ${res.errors} erro(s).`)
      fetchRequests()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar cadastro em massa.')
    } finally {
      setBulkSubmitting(false)
    }
  }

  // V3.4 FASE E2: filtros combinados — status (chip), origem (programada/employee), busca livre.
  // 'Programada pelo RH' detectada pelo dispatchNote começando com 'Programada' ou 'Plano importado'.
  const isProgrammed = (r: any): boolean => {
    const note = (r.dispatchNote ?? '').toString().toLowerCase()
    return note.startsWith('programada') || note.startsWith('plano importado')
  }
  const filtered = requests.filter(r => {
    // 'TODOS' = solicitacoes ativas. CANCELLED e REJECTED so aparecem nas tabs proprias.
    if (filterStatus === 'TODOS' && (r.status === 'CANCELLED' || r.status === 'REJECTED')) return false
    if (filterStatus !== 'TODOS' && r.status !== filterStatus) return false
    if (filterSource === 'PROGRAMMED' && !isProgrammed(r)) return false
    if (filterSource === 'EMPLOYEE' && isProgrammed(r)) return false
    if (search) {
      const term = search.toLowerCase()
      const hay = `${r.employee?.name ?? ''} ${r.employee?.registration ?? ''} ${r.dispatchNote ?? ''}`.toLowerCase()
      if (!hay.includes(term)) return false
    }
    return true
  })

  const statusCounts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full relative">
      <main className="max-w-7xl mx-auto px-4 pt-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500" />
            Programação de Férias
          </h2>
          <p className="text-slate-400 mt-2 flex items-center gap-1">
            Cadastre, valide, edite ou cancele solicitações de férias (lança você mesmo ou aprova solicitações de colaboradores).
            <InfoTooltip text="Página única para o RH gerenciar férias da operação: programar diretamente, aprovar pedidos, reprovar com motivo formal, ou cancelar (libera saldo)." />
          </p>
        </div>

        <ErrorBoundary>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 pb-20">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
              <h3 className="font-bold text-lg">Solicitações Registradas ({filtered.length})</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setProgramOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 transition-colors"
                  title="Cadastrar férias diretamente em nome do colaborador (admin)"
                >
                  <CalendarPlus className="w-3.5 h-3.5" /> Programar Férias
                </button>
                <label
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-cyan-500/40 text-cyan-300 rounded-lg hover:bg-cyan-500/10 text-xs font-bold cursor-pointer transition-colors"
                  title="Importar férias ATUAIS e suas coberturas a partir do XLS 'Gestao Operacional' do Tirvu. Idempotente."
                >
                  <Upload className="w-3.5 h-3.5" /> Importar Tirvu Operacional
                  <input type="file" accept=".xls,.xlsx" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (!confirm('Importar Gestão Operacional do Tirvu:\n\nCria VacationRequest APPROVED para cada férias atual + CoverageAssignment quando há substituto. Match por matrícula (titular e substituto). Idempotente (rodar 2x = mesmo resultado).\n\nContinuar?')) {
                      e.target.value = ''; return
                    }
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      toast.loading('Importando...', { id: 'imp-op' })
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/vacations/import-operational`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: formData,
                      })
                      const json = await res.json()
                      toast.dismiss('imp-op')
                      if (res.ok) {
                        const s = json?.data?.summary
                        toast.success(
                          `Férias: ${s?.created ?? 0} criadas, ${s?.alreadyExists ?? 0} já existiam, ${s?.noMatch ?? 0} sem match · Coberturas: ${s?.coverageCreated ?? 0} criadas, ${s?.coverageNoMatch ?? 0} sem match`,
                          { duration: 12000 },
                        )
                        fetchRequests()
                      } else {
                        toast.error(json?.error?.message || 'Erro ao importar')
                      }
                    } catch { toast.dismiss('imp-op'); toast.error('Erro de rede ao importar') }
                    e.target.value = ''
                  }} />
                </label>
                <label
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-500/40 text-emerald-400 rounded-lg hover:bg-emerald-500/10 text-xs font-bold cursor-pointer transition-colors"
                  title="Importar plano de férias em massa (admin) — cria já APROVADO e detecta sobreposições/duplicatas"
                >
                  <Upload className="w-3.5 h-3.5" /> Importar Plano (Admin)
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/vacations/plan/import`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: formData,
                      })
                      const json = await res.json()
                      if (res.ok) {
                        const s = json?.data?.summary
                        toast.success(
                          `Plano: ${s?.created ?? 0} criadas · ${s?.skipped_idempotent ?? 0} duplicatas · ${s?.skipped_overlap ?? 0} sobreposições · ${s?.errors ?? 0} erros`,
                          { duration: 8000 }
                        )
                        if (s?.errors > 0) {
                          const firstErrors = (json?.data?.results || [])
                            .filter((r: any) => r.outcome === 'error')
                            .slice(0, 3)
                            .map((r: any) => `Linha ${r.rowIndex}: ${r.message}`)
                            .join('\n')
                          if (firstErrors) toast.error(firstErrors, { duration: 12000 })
                        }
                        fetchRequests()
                      } else {
                        toast.error(json?.error?.message || 'Erro ao importar plano')
                      }
                    } catch { toast.error('Erro de rede ao importar') }
                    e.target.value = ''
                  }} />
                </label>
                <button
                  onClick={() => { setBulkMode(prev => !prev); setBulkRows(Array.from({ length: 5 }, emptyRow)) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    bulkMode
                      ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                      : 'border-slate-700 text-amber-400 hover:bg-slate-800'
                  }`}
                  title="Abrir tabela para cadastro de férias em massa"
                >
                  <Table2 className="w-3.5 h-3.5" /> Cadastro em Massa
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/vacations/import/template`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                      })
                      if (!res.ok) throw new Error('Erro ao baixar template')
                      const blob = await res.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'modelo-ferias.xlsx'
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      window.URL.revokeObjectURL(url)
                    } catch (err) {
                      alert('Erro ao baixar template: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 text-emerald-400 rounded-lg hover:bg-slate-800 text-xs font-bold cursor-pointer"
                  title="Baixar modelo de planilha para programação de férias em massa"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Modelo
                </button>
                <label className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 text-sky-400 rounded-lg hover:bg-slate-800 text-xs font-bold cursor-pointer"
                  title="Importar programação de férias via planilha">
                  <Upload className="w-3.5 h-3.5" /> Importar Férias
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/vacations/import`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: formData
                      })
                      const data = await res.json()
                      if (res.ok) { toast.success(data.message); fetchRequests() }
                      else { toast.error(data.message || 'Erro na importação') }
                    } catch { toast.error('Erro ao importar') }
                    e.target.value = ''
                  }} />
                </label>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar nome, matrícula ou despacho..."
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <select
                  value={filterSource}
                  onChange={e => setFilterSource(e.target.value as any)}
                  className="bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  title="Origem da solicitação"
                >
                  <option value="TODOS">Todas as origens</option>
                  <option value="PROGRAMMED">Programada pelo RH</option>
                  <option value="EMPLOYEE">Pedido do colaborador</option>
                </select>
              </div>
            </div>

            {/* V3.4 FASE E2: chips de filtro de status com contadores. */}
            <div className="px-6 py-2 bg-slate-900/30 border-b border-white/5 flex items-center gap-2 text-xs flex-wrap">
              {([
                { value: 'TODOS' as const, label: 'Todos', color: 'bg-slate-700/50 text-slate-300 border-slate-600' },
                { value: 'PENDING' as const, label: 'Pendentes', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                { value: 'APPROVED' as const, label: 'Aprovadas', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
                { value: 'SIGNED' as const, label: 'Assinadas', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
                { value: 'COMPLETED' as const, label: 'Concluídas', color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
                { value: 'RETURNED' as const, label: 'Devolvidas', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
                { value: 'REJECTED' as const, label: 'Reprovadas', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
                { value: 'CANCELLED' as const, label: 'Canceladas', color: 'bg-slate-600/30 text-slate-400 border-slate-600' },
              ]).map(chip => {
                // 'Todos' = ativos (exclui canceladas + reprovadas, que tem tabs proprias)
                const activeCount = requests.filter(r => r.status !== 'CANCELLED' && r.status !== 'REJECTED').length
                const count = chip.value === 'TODOS' ? activeCount : (statusCounts[chip.value] || 0)
                const active = filterStatus === chip.value
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setFilterStatus(chip.value)}
                    className={`px-2.5 py-1 rounded-full font-bold border text-[11px] transition-colors ${
                      active ? `${chip.color} ring-2 ring-white/10` : 'bg-slate-900/30 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    {chip.label} <span className="ml-1 opacity-70">({count})</span>
                  </button>
                )
              })}
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500">Recuperando registros...</div>
            ) : filtered.length === 0 ? (
               <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                 <Check className="w-12 h-12 text-emerald-500/50 mb-4" />
                 <p className="text-lg font-bold text-white">Nenhum registro encontrado.</p>
               </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-900/30 text-slate-400 uppercase text-xs tracking-wider">
                      <th className="px-6 py-4 w-12">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.length === filtered.length && filtered.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary/50 cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-4 font-medium"><span className="inline-flex items-center gap-1">Colaborador <InfoTooltip text="Nome, matrícula e status atual da solicitação." /></span></th>
                      <th className="px-6 py-4 font-medium"><span className="inline-flex items-center gap-1">Situação / Datas <InfoTooltip text="Período solicitado para as férias e total de dias. Se as datas foram editadas, mostra o pedido original." /></span></th>
                      <th className="px-6 py-4 font-medium"><span className="inline-flex items-center gap-1">Despacho / Motivo <InfoTooltip text="Texto registrado pelo RH no momento da decisão (motivo de reprovação, observação de programação, motivo de cancelamento, etc)." /></span></th>
                      <th className="px-6 py-4 font-medium text-right"><span className="inline-flex items-center gap-1">Ações <InfoTooltip text="Botões de ação disponíveis para cada solicitação." /></span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map((req) => (
                      <tr key={req.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(req.id)}
                            onChange={(e) => handleSelectOne(req.id, e.target.checked)}
                            className="rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary/50 cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-white/5">
                              {req.employee?.name?.charAt(0) || 'C'}
                            </div>
                            <div>
                              <p className="font-bold text-white flex items-center gap-2 flex-wrap">
                                {req.employee?.name || 'Vazio'}
                                {req.employee?.registration && (
                                  <span className="text-[10px] font-mono font-normal text-sky-400/80">Matr. {req.employee.registration}</span>
                                )}
                              </p>
                              <p className="text-xs font-bold mt-1 uppercase tracking-wider text-slate-500">
                                {req.status === 'PENDING' && <span className="text-amber-500">Pendente</span>}
                                {req.status === 'APPROVED' && <span className="text-emerald-500">Aprovado</span>}
                                {req.status === 'REJECTED' && <span className="text-rose-500">Reprovado</span>}
                                {req.status === 'RETURNED' && <span className="text-indigo-400">Devolvido (Corrigir)</span>}
                                {req.status === 'SIGNED' && <span className="text-emerald-400">Assinado</span>}
                              </p>
                              {/* Badge hasCoverage (Story 3.3) */}
                              {req.status === 'APPROVED' && (
                                <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full uppercase ${
                                  req.hasCoverage
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-red-500/15 text-red-400'
                                }`}>
                                  {req.hasCoverage ? 'Com Cobertura' : 'Sem Cobertura'}
                                </span>
                              )}
                            </div>
                            {/* Badges de assinatura digital */}
                            {req.status === 'APPROVED' && req.signature?.signUrl && !req.signature?.signedAt && (
                              <a
                                href={req.signature.signUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 text-[10px] font-bold rounded-full uppercase hover:bg-amber-500/25 transition-colors"
                              >
                                <FileSignature className="w-3 h-3" />
                                Aguardando Assinatura
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {req.status === 'SIGNED' && (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold rounded-full uppercase">
                                <FileSignature className="w-3 h-3" />
                                Assinado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-300">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded text-xs">
                              {format(parseISO(req.startDate), 'dd/MM/yyyy')}
                            </span>
                            <span className="text-slate-500 text-xs">até</span>
                            <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded text-xs">
                              {format(parseISO(req.endDate), 'dd/MM/yyyy')}
                            </span>
                            <span className="font-bold text-white text-xs ml-1">({req.days}d)</span>
                          </div>
                          {req.originalStartDate && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Edit3 className="w-3 h-3" />
                              Pedido Original: {format(parseISO(req.originalStartDate), 'dd/MM')} a {format(parseISO(req.originalEndDate), 'dd/MM')}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-300 max-w-[260px]">
                          {req.dispatchNote ? (
                            <p className="text-xs text-slate-300 break-words" title={req.dispatchNote}>
                              {req.dispatchNote}
                            </p>
                          ) : (
                            <span className="text-[11px] text-slate-600 italic">— sem despacho —</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                             <button onClick={() => openModal(req.id, 'RETURN')} className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-lg" title="Devolver para Correção">
                               <RotateCcw className="w-4 h-4" />
                             </button>
                             <button onClick={() => openModal(req.id, 'EDIT')} className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg" title="Editar Datas">
                               <Edit3 className="w-4 h-4" />
                             </button>
                             <button onClick={() => openModal(req.id, 'DELETE')} className="p-2 text-slate-400 hover:bg-slate-700/40 rounded-lg" title="Cancelar (libera saldo)">
                               <Trash2 className="w-4 h-4" />
                             </button>
                             <button onClick={() => openModal(req.id, 'REJECT')} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg" title="Reprovar (exige motivo formal)">
                               <ShieldAlert className="w-4 h-4" />
                             </button>
                             <button onClick={() => openModal(req.id, 'APPROVE')} className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg border border-emerald-500/20" title="Aprovar">
                               <Check className="w-4 h-4" />
                             </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ErrorBoundary>

        {/* Bulk Create Table (Story 3.4) */}
        {bulkMode && (
          <div className="glass-card rounded-2xl overflow-hidden border border-amber-500/20 mt-6">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-amber-500/5">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Table2 className="w-5 h-5 text-amber-400" />
                Cadastro em Massa
                <InfoTooltip text="Preencha as linhas com colaborador e datas para criar múltiplas solicitações de férias de uma vez. Máximo 50 itens." />
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBulkRows(prev => [...prev, emptyRow()])}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Linha
                </button>
                <button
                  onClick={handleBulkSubmit}
                  disabled={bulkSubmitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/80 text-xs font-bold disabled:opacity-50"
                >
                  {bulkSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Enviar Todas
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-900/30 text-slate-400 uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 font-medium w-8">#</th>
                    <th className="px-4 py-3 font-medium min-w-[250px]">Colaborador</th>
                    <th className="px-4 py-3 font-medium w-40">Inicio</th>
                    <th className="px-4 py-3 font-medium w-40">Fim</th>
                    <th className="px-4 py-3 font-medium w-20 text-center">Dias</th>
                    <th className="px-4 py-3 font-medium w-36 text-center">Resultado</th>
                    <th className="px-4 py-3 font-medium w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bulkRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2 text-slate-500 text-xs font-mono">{idx + 1}</td>
                      <td className="px-4 py-2 relative">
                        <input
                          type="text"
                          value={row.employeeSearch}
                          onChange={(e) => handleBulkEmployeeSearch(idx, e.target.value)}
                          onFocus={() => setBulkFocusIdx(idx)}
                          placeholder="Buscar colaborador..."
                          className={`w-full bg-slate-900/50 border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 ${
                            row.employeeId ? 'border-emerald-500/30 text-emerald-300' : 'border-slate-800 text-white'
                          }`}
                        />
                        {bulkFocusIdx === idx && bulkSearchResults[idx]?.length > 0 && (
                          <div className="absolute z-30 left-4 right-4 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {bulkSearchResults[idx].map((emp) => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => selectBulkEmployee(idx, emp)}
                                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                              >
                                {emp.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={row.startDate}
                          onChange={(e) => updateBulkRow(idx, { startDate: e.target.value, result: null })}
                          className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={row.endDate}
                          onChange={(e) => updateBulkRow(idx, { endDate: e.target.value, result: null })}
                          className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="font-mono text-white text-sm">
                          {row.days != null ? `${row.days}d` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.result ? (
                          row.result.status === 'created' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs font-bold rounded-full">
                              <Check className="w-3 h-3" /> Criada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500/15 text-rose-400 text-xs font-bold rounded-full" title={row.result.message}>
                              <X className="w-3 h-3" /> {row.result.message?.slice(0, 30) || 'Erro'}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {bulkRows.length > 1 && (
                          <button
                            onClick={() => setBulkRows(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded"
                            title="Remover linha"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bulk Action Toolbar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 shadow-2xl shadow-black rounded-full px-6 py-3 flex items-center gap-4 z-40 animate-in slide-in-from-bottom-5 fade-in">
            <span className="text-white font-bold text-sm bg-slate-900 px-3 py-1 rounded-full inline-flex items-center gap-1">
              {selectedIds.length} selecionados
              <InfoTooltip text="Solicitações marcadas para ação em lote." />
            </span>
            <div className="h-6 w-px bg-slate-700" />
            <button onClick={() => openModal('BULK', 'RETURN')} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-medium">
              <RotateCcw className="w-4 h-4" /> Devolver
            </button>
            <button onClick={() => openModal('BULK', 'REJECT')} className="flex items-center gap-2 text-sm text-rose-500 hover:text-rose-400 font-medium">
              <Trash2 className="w-4 h-4" /> Recusar
            </button>
            <div className="h-6 w-px bg-slate-700" />
            <button onClick={() => openModal('BULK', 'APPROVE')} className="flex items-center gap-2 text-sm text-emerald-500 hover:text-emerald-400 font-bold">
              <Check className="w-4 h-4" /> Aprovar Lote
            </button>
          </div>
        )}

      </main>

      {/* Dispatch Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className={`p-4 border-b border-white/5 flex items-center gap-3 ${
              modalMode === 'APPROVE' ? 'bg-emerald-500/10' :
              modalMode === 'RETURN' ? 'bg-indigo-500/10' :
              modalMode === 'REJECT' || modalMode === 'DELETE' ? 'bg-rose-500/10' :
              'bg-amber-500/10'
            }`}>
              <ShieldAlert className={`w-6 h-6 ${
                modalMode === 'APPROVE' ? 'text-emerald-500' :
                modalMode === 'RETURN' ? 'text-indigo-400' :
                modalMode === 'REJECT' || modalMode === 'DELETE' ? 'text-rose-500' :
                'text-amber-500'
              }`} />
              <h3 className="font-bold text-white">
                {actionTarget === 'BULK' ? 'Ação em Lote!' : 'Despacho Administrativo'}
              </h3>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-300">
                Ação selecionada: <strong className="text-white">{modalMode}</strong>
              </p>
              
              {modalMode === 'EDIT' && actionTarget !== 'BULK' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">Início Real <InfoTooltip text="Nova data de início das férias definida pelo RH. A data original do pedido do colaborador será preservada como referência." /></label>
                    <input type="date" value={editDates.startDate} onChange={e => setEditDates({...editDates, startDate: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">Fim Real <InfoTooltip text="Nova data de término das férias definida pelo RH." /></label>
                    <input type="date" value={editDates.endDate} onChange={e => setEditDates({...editDates, endDate: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none" />
                  </div>
                </div>
              )}

              {/* Story 3.5: Seção de Cobertura no modal de aprovação */}
              {modalMode === 'APPROVE' && actionTarget !== 'BULK' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                    Quem cobre este posto?
                    <InfoTooltip text="Selecione um ferista disponível para cobrir o posto durante as férias, ou aprove sem cobertura (gap permanece para resolução posterior)." />
                  </label>
                  {coverageLoading ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-center text-slate-500 text-sm">
                      Buscando feristas disponíveis...
                    </div>
                  ) : coverageSuggestions ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {coverageSuggestions.suggestions?.feristas?.length > 0 || coverageSuggestions.suggestions?.intermitentes?.length > 0 ? (
                        <>
                          {[...(coverageSuggestions.suggestions?.feristas || []), ...(coverageSuggestions.suggestions?.intermitentes || [])].map((s: any) => (
                            <label
                              key={s.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedCoverageId === s.id
                                  ? 'border-emerald-500/50 bg-emerald-500/10'
                                  : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name="coverageEmployee"
                                value={s.id}
                                checked={selectedCoverageId === s.id}
                                onChange={() => setSelectedCoverageId(s.id)}
                                className="accent-emerald-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{s.name}</p>
                                <p className="text-[10px] text-slate-500">
                                  {s.type === 'FERISTA'
                                    ? (s.employeeType === 'EFETIVO' ? 'GHS Ferista' : 'Ferista Intermitente')
                                    : 'Intermitente'
                                  }
                                </p>
                              </div>
                              {s.estimatedCost != null && (
                                <span className="text-xs font-mono text-amber-400">
                                  R$ {Number(s.estimatedCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </label>
                          ))}
                          <label
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedCoverageId === null
                                ? 'border-amber-500/50 bg-amber-500/10'
                                : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="coverageEmployee"
                              value=""
                              checked={selectedCoverageId === null}
                              onChange={() => setSelectedCoverageId(null)}
                              className="accent-amber-500"
                            />
                            <div>
                              <p className="text-sm font-bold text-amber-400">Aprovar sem cobertura</p>
                              <p className="text-[10px] text-slate-500">Gap permanece — definir depois</p>
                            </div>
                          </label>
                        </>
                      ) : (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-center text-sm">
                          <p className="text-amber-400 font-bold">Nenhum ferista disponível no período</p>
                          <p className="text-slate-500 text-xs mt-1">A aprovação criará um gap de cobertura.</p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">Despacho / Motivo <InfoTooltip text="Justificativa do RH para a decisão tomada. Este texto será visível para o colaborador. Obrigatório para reprovações e devoluções." /></label>
                <textarea
                  value={dispatchNote}
                  onChange={(e) => setDispatchNote(e.target.value)}
                  placeholder="Justificativa do RH (visível ao colaborador)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-white focus:ring-1 focus:ring-primary/50 outline-none resize-none h-24"
                  required={modalMode === 'RETURN' || modalMode === 'REJECT'}
                />
              </div>
            </div>

            <div className="p-4 border-t border-white/5 flex justify-end gap-3 bg-slate-900/50">
              <button 
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAction}
                disabled={((modalMode === 'RETURN' || modalMode === 'REJECT') && dispatchNote.length < 5) || (modalMode === 'EDIT' && (!editDates.startDate || !editDates.endDate)) || submitting}
                className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
              >
                {modalMode === 'APPROVE' && selectedCoverageId
                  ? 'Aprovar com Cobertura'
                  : modalMode === 'APPROVE'
                    ? 'Aprovar sem Cobertura'
                    : 'Confirmar Ação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V3.4 MVP M5: Modal Programar Férias */}
      <ProgramVacationModal
        open={programOpen}
        onClose={() => setProgramOpen(false)}
        onCreated={fetchRequests}
      />
    </div>
  )
}
