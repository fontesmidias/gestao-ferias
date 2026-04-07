'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { HttpClient } from '@/lib/api-client'
import { 
  Users, Search, Download, Filter, MoreHorizontal, UserCheck, 
  UserMinus, CalendarHeart, Briefcase, MapPin, Building2, LayoutGrid, Clock
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { format, parseISO } from 'date-fns'

interface Employee {
  id: string
  name: string
  cpf: string
  registration?: string
  birthDate?: string
  position?: string
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
  const [filterStatus, setFilterStatus] = useState('ATIVOS')

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

      // 4. Status Filter
      if (filterStatus !== 'TODOS') {
        if (filterStatus === 'ATIVOS' && e.status !== 'ATIVO') return false
        if (filterStatus === 'FÉRIAS' && e.status !== 'FERIAS') return false
        if (filterStatus === 'AFASTADOS' && e.status !== 'AFASTADO') return false
        if (filterStatus === 'INATIVOS' && e.status !== 'INATIVO') return false
      }

      return true
    })
  }, [employees, search, filterBranch, filterWorkplace, filterStatus])

  // KPIs
  const totalActives = employees.filter(e => e.status === 'ATIVO').length
  const totalOnVacation = employees.filter(e => e.status === 'FERIAS').length
  const totalLeaves = employees.filter(e => e.status === 'AFASTADO').length

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

  const renderStatusBadge = (status: string) => {
    switch(status) {
      case 'ATIVO': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-max"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>ATIVO</span>
      case 'FERIAS': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1 w-max"><div className="w-1.5 h-1.5 rounded-full bg-sky-500"/>FÉRIAS</span>
      case 'AFASTADO': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-max"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"/>AFASTADO</span>
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight bg-slate-800 text-slate-400 border border-slate-700 w-max">{status}</span>
    }
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
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ativos</p>
                <p className="text-xl font-bold text-white">{totalActives}</p>
              </div>
            </div>
            <div className="glass-card px-5 py-3 rounded-xl flex items-center gap-4">
              <div className="p-2 bg-sky-500/20 rounded-lg"><CalendarHeart className="w-5 h-5 text-sky-400"/></div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Em Férias</p>
                <p className="text-xl font-bold text-white">{totalOnVacation}</p>
              </div>
            </div>
            <div className="glass-card px-5 py-3 rounded-xl flex items-center gap-4">
              <div className="p-2 bg-amber-500/20 rounded-lg"><UserMinus className="w-5 h-5 text-amber-400"/></div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Afastados</p>
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
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Empresa / Filial</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                >
                  <option value="">[ TODAS ]</option>
                  {branches.map((b: any) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Posto de Serviço</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={filterWorkplace} onChange={e => setFilterWorkplace(e.target.value)}
                >
                  <option value="">[ TODOS ]</option>
                  {workplaces.map((w: any) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>

              <div className="flex-1 min-w-[150px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status Base</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-primary font-bold focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="TODOS">[ TODOS ]</option>
                  <option value="ATIVOS">ATIVOS</option>
                  <option value="FÉRIAS">FÉRIAS</option>
                  <option value="AFASTADOS">AFASTADOS</option>
                  <option value="INATIVOS">INATIVOS</option>
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
                  title="Exportar Filtrados para CSV"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Datagrid */}
            <div className="overflow-auto flex-1 relative">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 border-b border-white/5 text-slate-400 uppercase text-[10px] tracking-wider font-bold shadow-sm">
                    <th className="px-6 py-3 w-16">Matrícula</th>
                    <th className="px-6 py-3">Colaborador</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3"/> Empresa</div>
                    </th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Lotação</div>
                    </th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><Briefcase className="w-3 h-3"/> Cargo</div>
                    </th>
                    <th className="px-6 py-3">
                      <div className="flex items-center gap-1.5"><Clock className="w-3 h-3"/> Escala</div>
                    </th>
                    <th className="px-6 py-3 text-right">Admissão</th>
                    <th className="px-4 py-3 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                        Sincronizando banco de dados de colaboradores...
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
                      <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-3 font-mono text-xs text-sky-400">
                          {emp.registration || '---'}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-white/5 shrink-0">
                              {emp.name.charAt(0)}
                            </div>
                            <p className="font-bold text-white text-[13px]">{emp.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          {renderStatusBadge(emp.status)}
                        </td>
                        <td className="px-6 py-3 text-[13px] text-slate-300 max-w-[200px] truncate" title={emp.branch || ''}>
                          {emp.branch || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-[13px] text-slate-300 max-w-[200px] truncate" title={emp.workplace || ''}>
                          {emp.workplace || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-[13px] text-slate-400 max-w-[200px] truncate">
                          {emp.position || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-[12px] text-slate-400 max-w-[150px] truncate">
                          {emp.shift || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-6 py-3 text-right text-[12px] text-slate-400">
                          {format(parseISO(emp.hireDate), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
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
    </div>
  )
}
