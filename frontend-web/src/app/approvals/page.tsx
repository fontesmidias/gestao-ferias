'use client'

import React, { useState } from 'react'
import { Check, X, Clock, Filter, Search } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const mockRequests = [
  { 
    id: 'req-1', 
    employee: 'Bruno Santos', 
    position: 'Product Manager', 
    startDate: '2026-05-11', 
    endDate: '2026-05-25',
    days: 15,
    status: 'PENDING',
    createdAt: '2026-04-02T10:00:00Z'
  },
  { 
    id: 'req-2', 
    employee: 'Diego Ferreira', 
    position: 'Sales Lead', 
    startDate: '2026-06-01', 
    endDate: '2026-06-30',
    days: 30,
    status: 'PENDING',
    createdAt: '2026-04-01T15:30:00Z'
  }
]

export default function ApprovalsPage() {
  const [requests, setRequests] = useState(mockRequests)

  const handleAction = (id: string, action: 'APPROVE' | 'REJECT') => {
    setRequests(prev => prev.filter(r => r.id !== id))
    // Call backend to trigger Webhook and PDF generation if APPROVED
  }

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-7xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500" />
            Caixa de Aprovações
          </h2>
          <p className="text-slate-400 mt-2">
            Valide e assine as solicitações de férias para disparar a geração de recibos.
          </p>
        </div>

        <ErrorBoundary>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
              <h3 className="font-bold text-lg">Solicitações Pendentes ({requests.length})</h3>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Buscar solicitação..." 
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700">
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>

            {requests.length === 0 ? (
               <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                 <Check className="w-12 h-12 text-emerald-500/50 mb-4" />
                 <p className="text-lg font-bold text-white">Nenhuma solicitação pendente.</p>
                 <p className="text-sm">Trabalho concluído! Tudo em dia no Departamento Pessoal.</p>
               </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-900/30 text-slate-400 uppercase text-xs tracking-wider">
                      <th className="px-6 py-4 font-medium">Colaborador</th>
                      <th className="px-6 py-4 font-medium">Período Solicitado</th>
                      <th className="px-6 py-4 font-medium">Dias</th>
                      <th className="px-6 py-4 font-medium text-right">Ações (RH)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-xs border border-amber-500/30">
                              {req.employee.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-white">{req.employee}</p>
                              <p className="text-xs text-slate-500">{req.position}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-300">
                          <span className="font-mono bg-slate-800/50 px-2 py-1 rounded">
                            {new Date(req.startDate).toLocaleDateString('pt-BR')}
                          </span>
                          <span className="mx-2 text-slate-500">até</span>
                          <span className="font-mono bg-slate-800/50 px-2 py-1 rounded">
                            {new Date(req.endDate).toLocaleDateString('pt-BR')}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-white">
                          {req.days} dias
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleAction(req.id, 'REJECT')}
                              className="p-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg border border-rose-500/20 transition-colors"
                              title="Recusar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleAction(req.id, 'APPROVE')}
                              className="px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 font-bold rounded-lg transition-transform active:scale-95 flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                            >
                              <Check className="w-4 h-4" />
                              Aprovar
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
      </main>
    </div>
  )
}
