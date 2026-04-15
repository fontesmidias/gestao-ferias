'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Building2, MapPin, Users, Plus, ChevronDown, ChevronRight, X, FileSpreadsheet, Upload } from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'

interface Allocation {
  id: string
  employee: { id: string; name: string; employeeType: string; isFerista?: boolean }
}

interface Position {
  id: string
  role: string
  shiftPattern: string | null
  requiredCount: number
  _count: { allocations: number }
  allocations: Allocation[]
}

interface Workplace {
  id: string
  name: string
  address: string | null
  client: string | null
  minStaff: number
  positions: Position[]
  _count: { employees: number }
}

export default function WorkplacesPage() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingWorkplace, setEditingWorkplace] = useState<Workplace | null>(null)
  const [form, setForm] = useState({ name: '', address: '', client: '', minStaff: 1 })

  // Allocation management state (Story 1.5)
  const [detailedWorkplaces, setDetailedWorkplaces] = useState<Record<string, Workplace>>({})
  const [allocFormVisible, setAllocFormVisible] = useState<string | null>(null) // positionId
  const [allocSearch, setAllocSearch] = useState('')
  const [allocSearchResults, setAllocSearchResults] = useState<{ id: string; name: string }[]>([])
  const [allocSelectedEmployee, setAllocSelectedEmployee] = useState<{ id: string; name: string } | null>(null)
  const [allocLoading, setAllocLoading] = useState(false)
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetchWorkplaces()
  }, [])

  // Fetch employees list once for allocation search
  useEffect(() => {
    HttpClient.get('/employees').then((data: any) => {
      const list = Array.isArray(data) ? data : data.data || []
      setAllEmployees(list.map((e: any) => ({ id: e.id, name: e.name })))
    }).catch(() => {})
  }, [])

  const fetchWorkplaces = async () => {
    try {
      setLoading(true)
      const data = await HttpClient.get('/workplaces')
      setWorkplaces(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch detailed workplace with allocation IDs (Story 1.5)
  const fetchWorkplaceDetail = async (wpId: string) => {
    try {
      const detail = await HttpClient.get(`/workplaces/${wpId}`)
      setDetailedWorkplaces(prev => ({ ...prev, [wpId]: detail }))
    } catch (err) {
      console.error('Error fetching workplace detail', err)
    }
  }

  const handleExpand = async (wpId: string) => {
    if (expandedId === wpId) {
      setExpandedId(null)
    } else {
      setExpandedId(wpId)
      await fetchWorkplaceDetail(wpId)
    }
    // Reset alloc form
    setAllocFormVisible(null)
    setAllocSearch('')
    setAllocSelectedEmployee(null)
    setAllocSearchResults([])
  }

  const handleAllocSearch = (value: string) => {
    setAllocSearch(value)
    setAllocSelectedEmployee(null)
    if (value.length >= 2) {
      setAllocSearchResults(allEmployees.filter(e => e.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8))
    } else {
      setAllocSearchResults([])
    }
  }

  const handleAllocate = async (positionId: string) => {
    if (!allocSelectedEmployee) return
    setAllocLoading(true)
    try {
      await HttpClient.post('/allocations', {
        employeeId: allocSelectedEmployee.id,
        workplacePositionId: positionId,
        startDate: new Date().toISOString(),
      })
      toast.success('Colaborador alocado com sucesso!')
      setAllocFormVisible(null)
      setAllocSearch('')
      setAllocSelectedEmployee(null)
      setAllocSearchResults([])
      // Refresh data
      await fetchWorkplaces()
      if (expandedId) await fetchWorkplaceDetail(expandedId)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alocar colaborador.')
    } finally {
      setAllocLoading(false)
    }
  }

  const handleDeallocate = async (allocationId: string) => {
    setAllocLoading(true)
    try {
      await HttpClient.delete(`/allocations/${allocationId}`)
      toast.success('Colaborador desalocado com sucesso!')
      await fetchWorkplaces()
      if (expandedId) await fetchWorkplaceDetail(expandedId)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao desalocar colaborador.')
    } finally {
      setAllocLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingWorkplace(null)
    setForm({ name: '', address: '', client: '', minStaff: 1 })
    setShowModal(true)
  }

  const openEditModal = (wp: Workplace) => {
    setEditingWorkplace(wp)
    setForm({ name: wp.name, address: wp.address || '', client: wp.client || '', minStaff: wp.minStaff })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    try {
      if (editingWorkplace) {
        await HttpClient.patch(`/workplaces/${editingWorkplace.id}`, form)
        toast.success('Posto atualizado com sucesso!')
      } else {
        await HttpClient.post('/workplaces', form)
        toast.success('Posto criado com sucesso!')
      }
      setShowModal(false)
      fetchWorkplaces()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar posto.')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await HttpClient.delete(`/workplaces/${id}`)
      toast.success('Posto removido.')
      fetchWorkplaces()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover posto.')
    }
  }

  const totalAllocated = (wp: Workplace) =>
    wp.positions.reduce((sum, p) => sum + p._count.allocations, 0)
  const totalRequired = (wp: Workplace) =>
    wp.positions.reduce((sum, p) => sum + p.requiredCount, 0)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Building2 className="w-7 h-7 text-primary" />
            Postos de Trabalho
          </h1>
          <p className="text-slate-400 mt-1">{workplaces.length} postos cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workplaces/import/template`, {
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                })
                if (!res.ok) throw new Error('Erro ao baixar template')
                const blob = await res.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'modelo-postos.xlsx'
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                window.URL.revokeObjectURL(url)
              } catch (err) {
                alert('Erro ao baixar template: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
              }
            }}
            className="flex items-center gap-2 px-3 py-2 border border-slate-700 text-emerald-400 rounded-xl hover:bg-slate-800 text-sm font-bold cursor-pointer"
            title="Baixar modelo de planilha para importar postos"
          >
            <FileSpreadsheet className="w-4 h-4" /> Modelo
          </button>
          <label className="flex items-center gap-2 px-3 py-2 border border-slate-700 text-sky-400 rounded-xl hover:bg-slate-800 text-sm font-bold cursor-pointer"
            title="Importar postos via planilha (CSV/Excel)">
            <Upload className="w-4 h-4" /> Importar
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const formData = new FormData()
              formData.append('file', file)
              try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workplaces/import`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                  body: formData
                })
                const data = await res.json()
                if (res.ok) {
                  toast.success(data.message || 'Importacao concluida!')
                  fetchWorkplaces()
                } else {
                  toast.error(data.message || 'Erro na importacao')
                }
              } catch { toast.error('Erro ao importar') }
              e.target.value = ''
            }} />
          </label>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 transition-colors font-bold text-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Posto
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="space-y-4">
        {workplaces.map((wp) => {
          const allocated = totalAllocated(wp)
          const required = totalRequired(wp)
          const isExpanded = expandedId === wp.id
          const hasGap = allocated < required

          return (
            <div key={wp.id} className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
              {/* Workplace Header */}
              <div
                className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => handleExpand(wp.id)}
              >
                <div className="flex items-center gap-4">
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                  <div>
                    <h3 className="text-lg font-bold text-white">{wp.name}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                      {wp.client && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" /> {wp.client}
                        </span>
                      )}
                      {wp.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> {wp.address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right group/stat relative">
                    <div className={`text-lg font-bold ${hasGap ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {allocated}/{required}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      alocados/necessários
                      <InfoTooltip text="Quantos colaboradores estão trabalhando neste posto vs. quantos são necessários. Vermelho indica que faltam pessoas." />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-300">{wp.positions.length}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      posições
                      <InfoTooltip text="Funções diferentes neste posto (ex: Vigilante, Recepcionista). Cada posição pode ter múltiplos colaboradores." />
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditModal(wp) }}
                    className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    Editar
                  </button>
                </div>
              </div>

              {/* Expanded: Positions + Allocations (with add/remove - Story 1.5) */}
              {isExpanded && (() => {
                const detailedWp = detailedWorkplaces[wp.id]
                const positions = detailedWp?.positions || wp.positions
                return (
                  <div className="border-t border-white/5 p-5 space-y-3">
                    {positions.map((pos) => (
                      <div key={pos.id} className="bg-slate-900/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{pos.role}</span>
                            {pos.shiftPattern && (
                              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                                {pos.shiftPattern}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setAllocFormVisible(allocFormVisible === pos.id ? null : pos.id)
                                setAllocSearch('')
                                setAllocSelectedEmployee(null)
                                setAllocSearchResults([])
                              }}
                              className="p-1 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Alocar colaborador nesta posição"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className={`text-sm font-bold ${(pos._count?.allocations ?? pos.allocations?.length ?? 0) < pos.requiredCount ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {pos._count?.allocations ?? pos.allocations?.length ?? 0}/{pos.requiredCount}
                          </span>
                        </div>

                        {/* Allocation add form (Story 1.5) */}
                        {allocFormVisible === pos.id && (
                          <div className="mb-3 flex items-center gap-2 bg-slate-800/50 rounded-lg p-2 border border-white/5 relative">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={allocSearch}
                                onChange={(e) => handleAllocSearch(e.target.value)}
                                placeholder="Buscar colaborador por nome..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary/50"
                                autoFocus
                              />
                              {allocSearchResults.length > 0 && (
                                <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                  {allocSearchResults.map((emp) => (
                                    <button
                                      key={emp.id}
                                      type="button"
                                      onClick={() => {
                                        setAllocSelectedEmployee(emp)
                                        setAllocSearch(emp.name)
                                        setAllocSearchResults([])
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                                    >
                                      {emp.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleAllocate(pos.id)}
                              disabled={!allocSelectedEmployee || allocLoading}
                              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/80 disabled:opacity-50 whitespace-nowrap"
                            >
                              {allocLoading ? 'Alocando...' : 'Alocar'}
                            </button>
                            <button
                              onClick={() => { setAllocFormVisible(null); setAllocSearch(''); setAllocSelectedEmployee(null) }}
                              className="p-1.5 text-slate-500 hover:text-white rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {pos.allocations?.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {pos.allocations.map((alloc) => (
                              <span key={alloc.id || alloc.employee.id} className="flex items-center gap-1.5 text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full group/alloc">
                                <Users className="w-3 h-3" />
                                {alloc.employee.name}
                                <span className="text-slate-500">({alloc.employee.employeeType}{alloc.employee.isFerista ? ' · Ferista' : ''})</span>
                                {alloc.id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeallocate(alloc.id) }}
                                    className="ml-0.5 p-0.5 text-slate-600 hover:text-rose-400 rounded transition-colors opacity-0 group-hover/alloc:opacity-100"
                                    title="Remover alocação"
                                    disabled={allocLoading}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">Nenhum colaborador alocado</p>
                        )}
                      </div>
                    ))}
                    {positions.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-4">Nenhuma posição cadastrada neste posto.</p>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}

        {workplaces.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-bold">Nenhum posto cadastrado</p>
            <p className="text-sm mt-1">Crie o primeiro posto de trabalho para começar.</p>
          </div>
        )}
      </div>

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">
                {editingWorkplace ? 'Editar Posto' : 'Novo Posto'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Nome do Posto *
                  <InfoTooltip text="Nome de identificação do local de trabalho onde os colaboradores são alocados. Ex: INEP - Sede, Tribunal Regional Federal." />
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:border-primary focus:outline-none"
                  placeholder="Ex: INEP - Sede"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Cliente (Contratante)
                  <InfoTooltip text="A empresa ou órgão que contrata o serviço terceirizado neste posto. Quem paga pela equipe alocada." />
                </label>
                <input
                  type="text"
                  value={form.client}
                  onChange={(e) => setForm({ ...form, client: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:border-primary focus:outline-none"
                  placeholder="Ex: INEP/MEC"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Endereço
                  <InfoTooltip text="Endereço físico do posto de trabalho. Útil para logística e remanejamento de equipe." />
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:border-primary focus:outline-none"
                  placeholder="Ex: SIG Quadra 6, Brasília-DF"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Equipe Mínima
                  <InfoTooltip text="Quantidade mínima de colaboradores que este posto precisa ter para funcionar. Se a equipe ficar abaixo desse número (ex: por férias), o sistema alerta que é necessário cobertura." />
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.minStaff}
                  onChange={(e) => setForm({ ...form, minStaff: parseInt(e.target.value) || 1 })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim()}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50"
              >
                {editingWorkplace ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
