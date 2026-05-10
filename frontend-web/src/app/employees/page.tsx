'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { HttpClient } from '@/lib/api-client'
import {
  Users, Search, Download, Upload, FileSpreadsheet, MoreHorizontal, UserCheck,
  UserMinus, CalendarHeart, Briefcase, MapPin, Building2, LayoutGrid, Clock,
  X, Phone, Plus, DollarSign, Edit3
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { toast } from 'sonner'
import { InfoTooltip } from '@/components/InfoTooltip'
import { format, parseISO } from 'date-fns'
import { SalaryImportModal } from '@/components/employees/SalaryImportModal'
import { BulkEditModal } from '@/components/employees/BulkEditModal'

interface Employee {
  id: string
  name: string
  cpf: string
  phone?: string
  registration?: string
  birthDate?: string
  position?: string
  employeeType?: string
  isFerista?: boolean
  salary?: number
  status: string
  branch?: string
  department?: string
  workplace?: string
  shift?: string
  hireDate: string
}

interface Summary {
  total: number
  kpis: { active: number; vacation: number; leave: number; inactive: number }
  facets: { branches: string[]; workplaces: string[]; statuses: string[] }
}

const EMPTY_FORM = {
  name: '', cpf: '', phone: '', position: '', employeeType: 'EFETIVO', isFerista: false, status: 'ATIVO',
  branch: '', department: '', workplace: '', shift: '', salary: '', registration: '',
  hireDate: '',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Filters State
  const [search, setSearch] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterWorkplace, setFilterWorkplace] = useState('')
  const [filterStatus, setFilterStatus] = useState('TODOS')
  // V3.4 C4: filtro 'Apenas Feristas' para localizar coberturas potenciais.
  const [filterFerista, setFilterFerista] = useState(false)
  // V3.4 F7: filtro por cargo (string match exato).
  const [filterPosition, setFilterPosition] = useState('')

  // V3.4 F5/F6: seleção em massa + modais.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [salaryImportOpen, setSalaryImportOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  // Modal state — único form serve para criar e editar
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [creating, setCreating] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchSummary = useCallback(async () => {
    try {
      const data = await HttpClient.get('/employees/summary') as Summary
      setSummary(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // Server-side search — só dispara quando há filtro aplicado.
  // Debounce de 300ms no campo de busca livre.
  useEffect(() => {
    const hasFilter =
      search.trim().length > 0 ||
      filterBranch !== '' ||
      filterWorkplace !== '' ||
      filterStatus !== 'TODOS' ||
      filterFerista ||
      filterPosition !== ''
    if (!hasFilter) {
      setEmployees([])
      setHasSearched(false)
      return
    }
    const handle = setTimeout(async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        if (search.trim()) params.set('search', search.trim())
        if (filterBranch) params.set('branch', filterBranch)
        if (filterWorkplace) params.set('workplace', filterWorkplace)
        if (filterStatus !== 'TODOS') params.set('status', filterStatus)
        if (filterFerista) params.set('isFerista', 'true')
        if (filterPosition) params.set('position', filterPosition)
        const data = await HttpClient.get(`/employees?${params.toString()}`) as Employee[]
        setEmployees(data)
        setHasSearched(true)
        setSelectedIds(new Set()) // limpa seleção ao re-buscar
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [search, filterBranch, filterWorkplace, filterStatus, filterFerista, filterPosition])

  const branches = summary?.facets.branches ?? []
  const workplaces = summary?.facets.workplaces ?? []
  const statusOptions = summary?.facets.statuses ?? []
  const positionOptions = (summary as any)?.facets?.positions ?? []

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)))
    }
  }

  // Filtragem é server-side — mostramos o que veio da API.
  const filtered = employees

  // KPIs vêm do summary agregado (não dependem da lista carregada).
  const totalActives = summary?.kpis.active ?? 0
  const totalOnVacation = summary?.kpis.vacation ?? 0
  const totalLeaves = summary?.kpis.leave ?? 0

  const handleExportCSV = () => {
    const headers = ['ID/Matricula', 'Colaborador', 'CPF', 'Status', 'Empresa/Filial', 'Posto', 'Cargo', 'Admissão', 'Jornada/Escala']
    const csvContent = [
      headers.join(';'),
      ...filtered.map(e => [
        `"${e.registration || 'S/N'}"`,
        `"${e.name}"`,
        `"${e.cpf}"`,
        `"${e.status}"`,
        `"${e.branch || '-'}"`,
        `"${e.workplace || '-'}"`,
        `"${e.position || '-'}"`,
        `"${format(parseISO(e.hireDate), 'dd/MM/yyyy')}"`,
        `"${e.shift || '-'}"`
      ].join(';'))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `colaboradores_export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
    link.click()
  }

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp)
    setEditForm({
      name: emp.name || '',
      cpf: emp.cpf || '',
      phone: emp.phone || '',
      position: emp.position || '',
      employeeType: emp.employeeType || '',
      isFerista: emp.isFerista || false,
      status: emp.status || '',
      branch: emp.branch || '',
      department: emp.department || '',
      workplace: emp.workplace || '',
      shift: emp.shift || '',
      salary: emp.salary != null ? String(emp.salary) : '',
      registration: emp.registration || '',
      hireDate: emp.hireDate ? emp.hireDate.slice(0, 10) : '',
    })
  }

  const reloadCurrentList = async () => {
    fetchSummary()
    const hasFilter =
      search.trim().length > 0 || filterBranch !== '' || filterWorkplace !== '' || filterStatus !== 'TODOS'
    if (!hasFilter) return
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (filterBranch) params.set('branch', filterBranch)
    if (filterWorkplace) params.set('workplace', filterWorkplace)
    if (filterStatus !== 'TODOS') params.set('status', filterStatus)
    try {
      const data = await HttpClient.get(`/employees?${params.toString()}`) as Employee[]
      setEmployees(data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingEmployee) return
    try {
      setSaving(true)
      await HttpClient.patch('/employees/' + editingEmployee.id, {
        ...editForm,
        salary: editForm.salary ? Number(editForm.salary) : undefined,
      })
      toast.success('Colaborador atualizado com sucesso!')
      setEditingEmployee(null)
      reloadCurrentList()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar colaborador.')
    } finally {
      setSaving(false)
    }
  }

  const openCreateModal = () => {
    setEditForm({ ...EMPTY_FORM, hireDate: format(new Date(), 'yyyy-MM-dd') })
    setCreating(true)
  }

  const handleSaveCreate = async () => {
    if (!editForm.name.trim() || !editForm.cpf.trim() || !editForm.hireDate) {
      toast.error('Nome, CPF e data de admissão são obrigatórios.')
      return
    }
    try {
      setSaving(true)
      await HttpClient.post('/employees', {
        ...editForm,
        salary: editForm.salary ? Number(editForm.salary) : undefined,
      })
      toast.success('Colaborador criado com sucesso!')
      setCreating(false)
      reloadCurrentList()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao criar colaborador.')
    } finally {
      setSaving(false)
    }
  }

  // Status agora é campo livre (Tirvu: ATESTADO MÉDICO, LICENÇA MATERNIDADE,
  // AFASTADO INSS, etc). Mapeamos exatos primeiro; fallback por keyword.
  const renderStatusBadge = (status: string) => {
    const dot = (color: string) => <div className={`w-1.5 h-1.5 rounded-full ${color}`}/>
    const base = 'px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight border flex items-center gap-1 w-max max-w-full'
    const upper = (status ?? '').toUpperCase().trim()
    // Exatos
    if (upper === 'ATIVO') return <span className={`${base} bg-emerald-500/20 text-emerald-400 border-emerald-500/30`}>{dot('bg-emerald-500')}ATIVO</span>
    if (upper === 'FERIAS' || upper === 'FÉRIAS') return <span className={`${base} bg-sky-500/20 text-sky-400 border-sky-500/30`}>{dot('bg-sky-500')}FÉRIAS</span>
    if (upper === 'INATIVO' || upper === 'DEMITIDO') return <span className={`${base} bg-rose-500/15 text-rose-300 border-rose-500/30`}>{dot('bg-rose-500')}<span className="truncate">{upper}</span></span>
    // Por keyword (cobre LICENÇA MATERNIDADE, ATESTADO MÉDICO, AFASTADO INSS, etc)
    if (/AFASTAD|LICEN[ÇC]A|ATESTAD/.test(upper)) {
      return <span className={`${base} bg-amber-500/15 text-amber-300 border-amber-500/30`} title={status}>{dot('bg-amber-500')}<span className="truncate">{upper}</span></span>
    }
    return <span className={`${base} bg-slate-800 text-slate-400 border-slate-700`} title={status}><span className="truncate">{upper || '—'}</span></span>
  }

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-[1600px] mx-auto px-4 pt-8">
        {/* Header & Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              Gestão de Colaboradores
            </h2>
            <p className="text-slate-400 mt-2">Visão orquestral de contratos, postos, escalas e colaboradores.</p>
          </div>
          
          {/* Quick Metrics KPIs */}
          <div className="flex gap-4">
            <div className="glass-card px-5 py-3 rounded-xl flex items-center gap-4">
              <div className="p-2 bg-emerald-500/20 rounded-lg"><UserCheck className="w-5 h-5 text-emerald-400"/></div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">Ativos <InfoTooltip text="Colaboradores trabalhando normalmente nos seus postos." /></p>
                <p className="text-xl font-bold text-white">{totalActives}</p>
              </div>
            </div>
            <div className="glass-card px-5 py-3 rounded-xl flex items-center gap-4">
              <div className="p-2 bg-sky-500/20 rounded-lg"><CalendarHeart className="w-5 h-5 text-sky-400"/></div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">Em Férias <InfoTooltip text="Colaboradores atualmente em período de férias aprovadas." /></p>
                <p className="text-xl font-bold text-white">{totalOnVacation}</p>
              </div>
            </div>
            <div className="glass-card px-5 py-3 rounded-xl flex items-center gap-4">
              <div className="p-2 bg-amber-500/20 rounded-lg"><UserMinus className="w-5 h-5 text-amber-400"/></div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">Afastados <InfoTooltip text="Colaboradores em licença médica, maternidade ou afastamento legal." /></p>
                <p className="text-xl font-bold text-white">{totalLeaves}</p>
              </div>
            </div>
          </div>
        </div>

        <ErrorBoundary>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
            {/* Filter Toolbar */}
            <div className="p-4 border-b border-white/5 bg-slate-900/30 flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Empresa / Filial <InfoTooltip text="Filtre por empresa ou filial à qual o colaborador está vinculado contratualmente." /></label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                >
                  <option value="">[ TODAS ]</option>
                  {branches.map((b: any) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Posto <InfoTooltip text="Local físico onde o colaborador exerce suas funções (ex: INEP, Tribunal)." /></label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={filterWorkplace} onChange={e => setFilterWorkplace(e.target.value)}
                >
                  <option value="">[ TODOS ]</option>
                  {workplaces.map((w: any) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>

              <div className="flex-1 min-w-[150px]">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Status Base <InfoTooltip text="Situação atual do colaborador: Ativo (trabalhando), Férias, Afastado ou Inativo (desligado)." /></label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-primary font-bold focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="TODOS">[ TODOS ]</option>
                  {statusOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="min-w-[140px] flex flex-col items-start gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  Tipo <InfoTooltip text="Filtre apenas Feristas (colaboradores elegíveis para cobertura de férias de outros)." />
                </label>
                <button
                  type="button"
                  onClick={() => setFilterFerista(prev => !prev)}
                  className={`px-3 py-2 text-xs font-bold rounded-lg border transition-colors w-full ${
                    filterFerista
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                  title="Mostra apenas colaboradores marcados como Ferista"
                >
                  {filterFerista ? '★ Apenas Feristas' : 'Todos os tipos'}
                </button>
              </div>

              <div className="min-w-[180px]">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Cargo <InfoTooltip text="Filtre por cargo exato. Útil para selecionar todos de um cargo e editar em massa (ex: aplicar salário em todos os 'Recepcionista')." /></label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={filterPosition} onChange={e => setFilterPosition(e.target.value)}
                >
                  <option value="">[ TODOS ]</option>
                  {positionOptions.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="flex-[2] min-w-[300px] flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Filtrar por nome, matrícula ou CPF..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20 transition-colors"
                  title="Cadastrar colaborador manualmente"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Novo</span>
                </button>
                <button
                  onClick={() => setSalaryImportOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-sm font-bold rounded-lg hover:bg-emerald-500/20 transition-colors"
                  title="Importar salários (Dexion XLSX) — preview com divergências antes de aplicar"
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="hidden sm:inline">Salários</span>
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setBulkEditOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 text-sm font-bold rounded-lg hover:bg-indigo-500/20 transition-colors"
                    title="Editar campo em todos os selecionados"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Editar {selectedIds.size}</span>
                  </button>
                )}
                <button
                  onClick={handleExportCSV}
                  className="p-2 border border-slate-700 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                  title="Exportar filtrados para CSV"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/employees/import/template`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                      })
                      if (!res.ok) throw new Error('Erro ao baixar template')
                      const blob = await res.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'modelo-colaboradores.xlsx'
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      window.URL.revokeObjectURL(url)
                    } catch (err) {
                      alert('Erro ao baixar template: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
                    }
                  }}
                  className="p-2 border border-slate-700 bg-slate-800 text-emerald-400 rounded-lg hover:bg-slate-700 hover:text-emerald-300 transition-colors cursor-pointer"
                  title="Baixar modelo de planilha para importar colaboradores"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                </button>
                <label
                  className="p-2 border border-slate-700 bg-slate-800 text-sky-400 rounded-lg hover:bg-slate-700 hover:text-sky-300 transition-colors cursor-pointer"
                  title="Importar colaboradores via planilha (CSV/Excel)"
                >
                  <Upload className="w-5 h-5" />
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/employees/import`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: formData
                      })
                      const data = await res.json()
                      if (res.ok) {
                        toast.success(data.message || 'Importacao concluida!')
                        reloadCurrentList()
                      } else {
                        toast.error(data.message || 'Erro na importacao')
                      }
                    } catch { toast.error('Erro ao importar arquivo') }
                    e.target.value = ''
                  }} />
                </label>
              </div>
            </div>

            {/* Datagrid — UX P0 (Sally 2026-05-04):
                - Coluna Colaborador (sticky left): nome + matrícula + empresa
                - Empresa removida (era redundante: 100% Green House)
                - Matrícula removida da grade (vai no card de Colaborador)
                - Coluna ⋯ sticky right, sempre visível (não mais hover-only) */}
            <div className="overflow-auto flex-1 relative">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-900 border-b border-white/5 text-slate-400 uppercase text-[10px] tracking-wider font-bold shadow-sm">
                    <th className="px-3 py-3 sticky left-0 z-30 bg-slate-900 border-r border-white/5 w-10">
                      <input
                        type="checkbox"
                        checked={employees.length > 0 && selectedIds.size === employees.length}
                        onChange={toggleSelectAll}
                        className="accent-primary cursor-pointer"
                        title="Selecionar/desmarcar todos"
                      />
                    </th>
                    <th className="px-6 py-3 sticky left-10 z-30 bg-slate-900 border-r border-white/5 min-w-[260px]">
                      <div className="flex items-center gap-1">Colaborador <InfoTooltip text="Nome completo, matrícula e empresa de registro. Use a checkbox para seleção em massa." /></div>
                    </th>
                    <th className="px-6 py-3"><div className="flex items-center gap-1">Status <InfoTooltip text="Situação atual: verde=ativo, azul=férias, amarelo=afastado, etc." /></div></th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Posto <InfoTooltip text="Posto de trabalho atual do colaborador." /></div>
                    </th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><Briefcase className="w-3 h-3"/> Cargo <InfoTooltip text="Função exercida pelo colaborador no posto de trabalho." /></div>
                    </th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><Clock className="w-3 h-3"/> Escala <InfoTooltip text="Jornada de trabalho: 8h (comercial), 12x36, 6x1, etc." /></div>
                    </th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><Phone className="w-3 h-3"/> Telefone <InfoTooltip text="Número de telefone de contato do colaborador." /></div>
                    </th>
                    <th className="px-6 py-3 text-right"><div className="flex items-center justify-end gap-1">Admissão <InfoTooltip text="Data em que o colaborador foi contratado pela empresa." /></div></th>
                    <th className="px-4 py-3 text-center sticky right-0 z-30 bg-slate-900 border-l border-white/5 w-12">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loading ? (
                    <>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-3 py-3 sticky left-0 z-10 bg-slate-950 border-r border-white/5"></td>
                          <td className="px-6 py-3 sticky left-10 z-10 bg-slate-950 border-r border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800/50 shrink-0" />
                              <div className="space-y-1.5">
                                <div className="h-4 bg-slate-800/50 rounded w-40" />
                                <div className="h-3 bg-slate-800/50 rounded w-24" />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3"><div className="h-4 bg-slate-800/50 rounded w-16" /></td>
                          <td className="px-6 py-3"><div className="h-4 bg-slate-800/50 rounded w-24" /></td>
                          <td className="px-6 py-3"><div className="h-4 bg-slate-800/50 rounded w-20" /></td>
                          <td className="px-6 py-3"><div className="h-4 bg-slate-800/50 rounded w-16" /></td>
                          <td className="px-6 py-3"><div className="h-4 bg-slate-800/50 rounded w-24" /></td>
                          <td className="px-6 py-3"><div className="h-4 bg-slate-800/50 rounded w-20 ml-auto" /></td>
                          <td className="px-4 py-3 sticky right-0 z-10 bg-slate-950 border-l border-white/5" />
                        </tr>
                      ))}
                    </>
                  ) : !hasSearched ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-16 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <Search className="w-8 h-8 opacity-30" />
                          <p className="text-sm">Use os filtros ou a busca para listar colaboradores.</p>
                          <p className="text-xs text-slate-600">{summary?.total ?? 0} colaboradores cadastrados no total.</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                        Nenhum colaborador corresponde aos filtros de busca aplicados.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((emp) => (
                      <tr key={emp.id} className={`hover:bg-white/[0.03] transition-colors group ${selectedIds.has(emp.id) ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-3 sticky left-0 z-10 bg-slate-950 group-hover:bg-[#0d1827] border-r border-white/5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(emp.id)}
                            onChange={() => toggleSelect(emp.id)}
                            className="accent-primary cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-3 sticky left-10 z-10 bg-slate-950 group-hover:bg-[#0d1827] border-r border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-white/5 shrink-0">
                              {emp.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-white text-[13px] truncate flex items-center gap-1.5">
                                {emp.name}
                                {emp.isFerista && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0" title="Ferista — elegível para cobertura">
                                    ★ Ferista
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                <span className="text-sky-400/80">{emp.registration || 'S/N'}</span>
                                {/* Branch só aparece quando há mais de uma — em tenant single-branch
                                    é redundância pura (Sally code review 2026-05-04). */}
                                {branches.length > 1 && emp.branch ? <span className="text-slate-600"> · </span> : null}
                                {branches.length > 1 && emp.branch ? <span className="truncate">{emp.branch.split(' ').slice(0, 2).join(' ')}</span> : null}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          {renderStatusBadge(emp.status)}
                        </td>
                        <td className="px-6 py-3 text-[13px] text-slate-300 max-w-[220px] truncate" title={emp.workplace || ''}>
                          {emp.workplace || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-[13px] text-slate-400 max-w-[200px] truncate" title={emp.position || ''}>
                          {emp.position || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-[12px] text-slate-400 max-w-[150px] truncate" title={emp.shift || ''}>
                          {emp.shift || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-[12px] text-slate-400">
                          {emp.phone || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-right text-[12px] text-slate-400">
                          {format(parseISO(emp.hireDate), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-3 text-center sticky right-0 z-10 bg-slate-950 group-hover:bg-[#0d1827] border-l border-white/5">
                          <button
                            onClick={() => openEditModal(emp)}
                            aria-label={`Ações para ${emp.name}`}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Summary */}
            <div className="p-3 border-t border-white/5 bg-slate-900/50 flex justify-between items-center text-xs text-slate-500">
              <p>Mostrando <span className="text-white font-bold">{filtered.length}</span> de <span className="text-white font-bold">{summary?.total ?? 0}</span> colaboradores</p>
              <p>Orquestração Exclusiva GestãoFérias V2</p>
            </div>
          </div>
        </ErrorBoundary>
      </main>

      {/* Modal compartilhado: Edit ou Create */}
      {(editingEmployee || creating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setEditingEmployee(null); setCreating(false) }}>
          <div className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">{creating ? 'Novo Colaborador' : 'Editar Colaborador'}</h3>
              <button onClick={() => { setEditingEmployee(null); setCreating(false) }} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Nome <InfoTooltip text="Nome completo do colaborador." /></label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">CPF <InfoTooltip text="Cadastro de Pessoa Física do colaborador." /></label>
                <input type="text" value={editForm.cpf} onChange={e => setEditForm({...editForm, cpf: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Telefone <InfoTooltip text="Número de telefone de contato do colaborador." /></label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Matrícula <InfoTooltip text="Número de registro interno do colaborador." /></label>
                <input type="text" value={editForm.registration} onChange={e => setEditForm({...editForm, registration: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Cargo <InfoTooltip text="Função exercida pelo colaborador no posto de trabalho." /></label>
                <input type="text" value={editForm.position} onChange={e => setEditForm({...editForm, position: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Tipo de Vínculo <InfoTooltip text="Tipo de contrato: Efetivo (CLT fixo) ou Intermitente (sob demanda)." /></label>
                <select value={editForm.employeeType} onChange={e => setEditForm({...editForm, employeeType: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">Selecione...</option>
                  <option value="EFETIVO">EFETIVO</option>
                  <option value="INTERMITENTE">INTERMITENTE</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Ferista <InfoTooltip text="Marque se o colaborador é elegível para cobrir postos durante férias de outros colaboradores." /></label>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input type="checkbox" checked={editForm.isFerista} onChange={e => setEditForm({...editForm, isFerista: e.target.checked})} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-primary focus:ring-primary/50" />
                  <span className="text-sm text-slate-300">Elegível para cobertura de postos</span>
                </label>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Status <InfoTooltip text="Situação atual do colaborador na empresa." /></label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">Selecione...</option>
                  <option value="ATIVO">ATIVO</option>
                  <option value="FERIAS">FÉRIAS</option>
                  <option value="AFASTADO">AFASTADO</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Empresa / Filial <InfoTooltip text="Empresa ou filial onde o colaborador é registrado." /></label>
                <input type="text" value={editForm.branch} onChange={e => setEditForm({...editForm, branch: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Departamento <InfoTooltip text="Setor ou departamento ao qual o colaborador pertence." /></label>
                <input type="text" value={editForm.department} onChange={e => setEditForm({...editForm, department: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Posto <InfoTooltip text="Local físico onde o colaborador exerce suas funções." /></label>
                <input type="text" value={editForm.workplace} onChange={e => setEditForm({...editForm, workplace: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Escala <InfoTooltip text="Jornada de trabalho: 8h (comercial), 12x36, 6x1, etc." /></label>
                <input type="text" value={editForm.shift} onChange={e => setEditForm({...editForm, shift: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Salário <InfoTooltip text="Remuneração mensal bruta do colaborador." /></label>
                <input type="number" step="0.01" value={editForm.salary} onChange={e => setEditForm({...editForm, salary: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Data de Admissão {creating && <span className="text-rose-400">*</span>} <InfoTooltip text="Data em que o colaborador foi contratado. Obrigatória ao criar manualmente." /></label>
                <input type="date" value={editForm.hireDate} onChange={e => setEditForm({...editForm, hireDate: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" disabled={!creating} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <button onClick={() => { setEditingEmployee(null); setCreating(false) }} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors">
                Cancelar
              </button>
              <button onClick={creating ? handleSaveCreate : handleSaveEdit} disabled={saving} className="px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/80 rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : creating ? 'Criar Colaborador' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V3.4 FASE F: importer salários Dexion + edição em massa */}
      <SalaryImportModal
        open={salaryImportOpen}
        onClose={() => setSalaryImportOpen(false)}
        onApplied={() => { fetchSummary(); reloadCurrentList() }}
      />
      <BulkEditModal
        open={bulkEditOpen}
        selectedEmployeeIds={Array.from(selectedIds)}
        onClose={() => setBulkEditOpen(false)}
        onApplied={() => { fetchSummary(); reloadCurrentList(); setSelectedIds(new Set()) }}
      />
    </div>
  )
}
