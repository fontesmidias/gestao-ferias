'use client'

import React, { useState, useEffect } from 'react'
import { Check, X, Clock, Filter, Search, RotateCcw, Edit3, Trash2, ShieldAlert, FileSignature, ExternalLink, FileSpreadsheet, Upload } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { HttpClient } from '@/lib/api-client'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'APPROVE' | 'REJECT' | 'RETURN' | 'EDIT' | 'DELETE' | null>(null)
  const [dispatchNote, setDispatchNote] = useState('')
  const [editDates, setEditDates] = useState({ startDate: '', endDate: '' })
  
  // Single or Bulk context
  const [actionTarget, setActionTarget] = useState<string | 'BULK' | null>(null)

  useEffect(() => {
    fetchRequests()
  }, [])

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

  const openModal = (target: string | 'BULK', mode: 'APPROVE' | 'REJECT' | 'RETURN' | 'EDIT' | 'DELETE') => {
    setActionTarget(target)
    setModalMode(mode)
    setDispatchNote('')
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
  }

  const confirmAction = async () => {
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
         // Placeholder for real delete if API supports it, else we treat it as REJECT
         payload.status = 'REJECTED'
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
      toast.error(err.message || 'Erro ao realizar ação')
    }
  }

  const filtered = requests.filter(r => 
    r.employee?.name.toLowerCase().includes(search.toLowerCase()) ||
    r.status.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full relative">
      <main className="max-w-7xl mx-auto px-4 pt-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500" />
            Caixa de Aprovações
          </h2>
          <p className="text-slate-400 mt-2 flex items-center gap-1">
            Valide, Devolva ou Edite as solicitações de férias (Ações em Massa suportadas).
            <InfoTooltip text="Aqui você gerencia todas as solicitações de férias dos colaboradores. Pode aprovar, reprovar, devolver para correção ou editar datas." />
          </p>
        </div>

        <ErrorBoundary>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 pb-20">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
              <h3 className="font-bold text-lg">Solicitações Registradas ({filtered.length})</h3>
              <div className="flex items-center gap-2">
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL}/vacations/import/template`}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 text-emerald-400 rounded-lg hover:bg-slate-800 text-xs font-bold"
                  title="Baixar modelo de planilha para programação de férias em massa"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Modelo
                </a>
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
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar colaborador ou status..." 
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700">
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-6 py-2 bg-indigo-500/5 border-b border-white/5 flex items-center gap-2 text-xs text-slate-500">
              <InfoTooltip text="Dica: Selecione múltiplas solicitações com as caixas de seleção para realizar ações em lote (aprovar, reprovar ou devolver várias de uma vez)." />
              <span>Dica: Use as caixas de seleção para ações em lote.</span>
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
                      <th className="px-6 py-4 font-medium"><span className="inline-flex items-center gap-1">Colaborador <InfoTooltip text="Nome do colaborador e status atual da solicitação (Pendente, Aprovado, Reprovado, Devolvido)." /></span></th>
                      <th className="px-6 py-4 font-medium"><span className="inline-flex items-center gap-1">Situação / Datas <InfoTooltip text="Período solicitado para as férias e total de dias. Se as datas foram editadas, mostra o pedido original." /></span></th>
                      <th className="px-6 py-4 font-medium text-right"><span className="inline-flex items-center gap-1">Ações Abertas <InfoTooltip text="Botões de ação disponíveis para cada solicitação." /></span></th>
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
                              <p className="font-bold text-white">{req.employee?.name || 'Vazio'}</p>
                              <p className="text-xs font-bold mt-1 uppercase tracking-wider text-slate-500">
                                {req.status === 'PENDING' && <span className="text-amber-500">Pendente</span>}
                                {req.status === 'APPROVED' && <span className="text-emerald-500">Aprovado</span>}
                                {req.status === 'REJECTED' && <span className="text-rose-500">Reprovado</span>}
                                {req.status === 'RETURNED' && <span className="text-indigo-400">Devolvido (Corrigir)</span>}
                                {req.status === 'SIGNED' && <span className="text-emerald-400">Assinado</span>}
                              </p>
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
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                             <button onClick={() => openModal(req.id, 'RETURN')} className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-lg" title="Devolver para Correção">
                               <RotateCcw className="w-4 h-4" />
                             </button>
                             <button onClick={() => openModal(req.id, 'EDIT')} className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg" title="Editar Datas">
                               <Edit3 className="w-4 h-4" />
                             </button>
                             <button onClick={() => openModal(req.id, 'REJECT')} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg" title="Reprovar/Excluir">
                               <Trash2 className="w-4 h-4" />
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
                disabled={((modalMode === 'RETURN' || modalMode === 'REJECT') && dispatchNote.length < 5) || (modalMode === 'EDIT' && (!editDates.startDate || !editDates.endDate))}
                className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
              >
                Confirmar Ação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
