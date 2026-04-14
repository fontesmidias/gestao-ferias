'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Building2, MapPin, Users, Plus, ChevronDown, ChevronRight, X, FileSpreadsheet, Upload } from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'

interface Position {
  id: string
  role: string
  shiftPattern: string | null
  requiredCount: number
  _count: { allocations: number }
  allocations: { employee: { id: string; name: string; employeeType: string } }[]
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

  useEffect(() => {
    fetchWorkplaces()
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
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/workplaces/import/template`}
            className="flex items-center gap-2 px-3 py-2 border border-slate-700 text-emerald-400 rounded-xl hover:bg-slate-800 text-sm font-bold"
            title="Baixar modelo de planilha para importar postos"
          >
            <FileSpreadsheet className="w-4 h-4" /> Modelo
          </a>
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
                onClick={() => setExpandedId(isExpanded ? null : wp.id)}
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

              {/* Expanded: Positions + Allocations */}
              {isExpanded && (
                <div className="border-t border-white/5 p-5 space-y-3">
                  {wp.positions.map((pos) => (
                    <div key={pos.id} className="bg-slate-900/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-bold text-white">{pos.role}</span>
                          {pos.shiftPattern && (
                            <span className="ml-2 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                              {pos.shiftPattern}
                            </span>
                          )}
                        </div>
                        <span className={`text-sm font-bold ${pos._count.allocations < pos.requiredCount ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {pos._count.allocations}/{pos.requiredCount}
                        </span>
                      </div>
                      {pos.allocations.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {pos.allocations.map((alloc) => (
                            <span key={alloc.employee.id} className="flex items-center gap-1.5 text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full">
                              <Users className="w-3 h-3" />
                              {alloc.employee.name}
                              <span className="text-slate-500">({alloc.employee.employeeType})</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Nenhum colaborador alocado</p>
                      )}
                    </div>
                  ))}
                  {wp.positions.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">Nenhuma posição cadastrada neste posto.</p>
                  )}
                </div>
              )}
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
