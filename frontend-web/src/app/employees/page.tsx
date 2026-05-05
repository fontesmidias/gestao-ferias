'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { HttpClient } from '@/lib/api-client'
import {
  Users, Search, Download, Upload, FileSpreadsheet, MoreHorizontal, UserCheck,
  UserMinus, CalendarHeart, Briefcase, MapPin, Building2, LayoutGrid, Clock,
  X, Phone
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { toast } from 'sonner'
import { InfoTooltip } from '@/components/InfoTooltip'
import { format, parseISO } from 'date-fns'

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

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Filters State
  const [search, setSearch] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterWorkplace, setFilterWorkplace] = useState('')
  const [filterStatus, setFilterStatus] = useState('TODOS')

  // Edit modal state
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editForm, setEditForm] = useState({
    name: '', cpf: '', phone: '', position: '', employeeType: '', isFerista: false, status: '',
    branch: '', department: '', workplace: '', shift: '', salary: '', registration: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchEmployees()
  }, [])

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const data = await HttpClient.get('/employees')
      setEmployees(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Derived filter options
  const branches = useMemo(() => Array.from(new Set(employees.map(e => e.branch).filter(Boolean))), [employees])
  const workplaces = useMemo(() => Array.from(new Set(employees.map(e => e.workplace).filter(Boolean))), [employees])
  // Status dinâmico — qualquer valor vindo da planilha (Tirvu pode trazer
  // ATESTADO MÉDICO, LICENÇA MATERNIDADE, etc além dos canônicos).
  const statusOptions = useMemo(
    () => Array.from(new Set(employees.map(e => e.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [employees],
  )

  // Apply filters
  const filtered = useMemo(() => {
    return employees.filter(e => {
      // 1. Text Search (Name or Registration)
      if (search && !e.name.toLowerCase().includes(search.toLowerCase()) &&
          !(e.registration && e.registration.toLowerCase().includes(search.toLowerCase()))
      ) return false

      // 2. Branch Filter
      if (filterBranch && e.branch !== filterBranch) return false

      // 3. Workplace Filter
      if (filterWorkplace && e.workplace !== filterWorkplace) return false

      // 4. Status Filter — comparação direta (lista é dinâmica agora)
      if (filterStatus !== 'TODOS' && e.status !== filterStatus) return false

      return true
    })
  }, [employees, search, filterBranch, filterWorkplace, filterStatus])

  // KPIs — agora cobrem os status reais do Tirvu (LICENÇA MATERNIDADE,
  // ATESTADO MÉDICO, AFASTADO INSS contam como "Afastados").
  const totalActives = employees.filter(e => (e.status ?? '').toUpperCase() === 'ATIVO').length
  const totalOnVacation = employees.filter(e => /^F[EÉ]RIAS$/.test((e.status ?? '').toUpperCase())).length
  const totalLeaves = employees.filter(e => /AFASTAD|LICEN[ÇC]A|ATESTAD/.test((e.status ?? '').toUpperCase())).length

  const handleExportCSV = () => {
    const headers = ['ID/Matricula', 'Colaborador', 'CPF', 'Status', 'Empresa/Filial', 'Lotação', 'Cargo', 'Admissão', 'Jornada/Escala']
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
    })
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
      fetchEmployees()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar colaborador.')
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
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Posto de Serviço <InfoTooltip text="Local físico onde o colaborador exerce suas funções (ex: INEP, Tribunal)." /></label>
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

              <div className="flex-[2] min-w-[300px] flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Filtrar por nome ou matrícula..." 
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
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
                        fetchEmployees()
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
                    <th className="px-6 py-3 sticky left-0 z-30 bg-slate-900 border-r border-white/5 min-w-[260px]">
                      <div className="flex items-center gap-1">Colaborador <InfoTooltip text="Nome completo, matrícula e empresa de registro." /></div>
                    </th>
                    <th className="px-6 py-3"><div className="flex items-center gap-1">Status <InfoTooltip text="Situação atual: verde=ativo, azul=férias, amarelo=afastado, etc." /></div></th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Lotação <InfoTooltip text="Posto de serviço/local de trabalho atual do colaborador." /></div>
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
                          <td className="px-6 py-3 sticky left-0 z-10 bg-slate-950 border-r border-white/5">
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
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                        Nenhum colaborador corresponde aos filtros de busca aplicados.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((emp) => (
                      <tr key={emp.id} className="hover:bg-white/[0.03] transition-colors group">
                        <td className="px-6 py-3 sticky left-0 z-10 bg-slate-950 group-hover:bg-[#0d1827] border-r border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-white/5 shrink-0">
                              {emp.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-white text-[13px] truncate">{emp.name}</p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                <span className="text-sky-400/80">{emp.registration || 'S/N'}</span>
                                {emp.branch ? <span className="text-slate-600"> · </span> : null}
                                {emp.branch ? <span className="truncate">{emp.branch.split(' ').slice(0, 2).join(' ')}</span> : null}
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
              <p>Mostrando <span className="text-white font-bold">{filtered.length}</span> registros filtrados</p>
              <p>Orquestração Exclusiva GestãoFérias V2</p>
            </div>
          </div>
        </ErrorBoundary>
      </main>

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingEmployee(null)}>
          <div className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Editar Colaborador</h3>
              <button onClick={() => setEditingEmployee(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors">
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
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">Posto de Serviço <InfoTooltip text="Local físico onde o colaborador exerce suas funções." /></label>
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
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <button onClick={() => setEditingEmployee(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/80 rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
