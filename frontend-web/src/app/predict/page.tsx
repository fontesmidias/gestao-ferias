'use client'

import React from 'react'
import { BrainCircuit, TrendingDown, Users, ShieldAlert, Sparkles, ArrowRight } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const aiRecommendations = [
  { id: 1, name: 'Diego Ferreira', risk: 'HIGH', multaSaving: 'R$ 15.420,00', deadline: 'Vence em 15 dias', action: 'Agendar Férias Urgente' },
  { id: 2, name: 'Beatriz Almeida', risk: 'MEDIUM', multaSaving: 'R$ 8.300,00', deadline: 'Vence em 45 dias', action: 'Planejar Férias' },
  { id: 3, name: 'Carlos Costa', risk: 'LOW', multaSaving: 'R$ 5.100,00', deadline: 'Vence em 4 meses', action: 'Sugerir Banco de Horas' },
]

export default function AIPredictDashboard() {
  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-7xl mx-auto px-4 pt-8">
        
        {/* Header Hero */}
        <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/20 border border-indigo-500/30 rounded-3xl p-8 mb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none"></div>
          
          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-400">
              <BrainCircuit className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white flex items-center gap-2">
                Oráculo <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Predict</span> AI
                <Sparkles className="w-5 h-5 text-purple-400" />
              </h2>
              <p className="text-indigo-200/70 mt-1">Inteligência Operacional Analisando 120 Colaboradores</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
            <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-white/5">
              <div className="flex items-center gap-3 text-rose-400 mb-2">
                <ShieldAlert className="w-5 h-5" />
                <span className="font-bold text-sm tracking-widest uppercase">Risco de Passivo (Q3)</span>
              </div>
              <p className="text-4xl font-black text-white">R$ 48.5k</p>
              <p className="text-xs text-slate-400 mt-2">Multas estimadas CLT Art. 137 se ignorado.</p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.1)]">
              <div className="flex items-center gap-3 text-emerald-400 mb-2">
                <TrendingDown className="w-5 h-5" />
                <span className="font-bold text-sm tracking-widest uppercase">Savings Sugerido</span>
              </div>
              <p className="text-4xl font-black text-emerald-400">R$ 28.8k</p>
              <p className="text-xs text-slate-400 mt-2">Seguindo as 3 recomendações imediatas da AI.</p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-white/5">
              <div className="flex items-center gap-3 text-sky-400 mb-2">
                <Users className="w-5 h-5" />
                <span className="font-bold text-sm tracking-widest uppercase">Gargalos Críticos</span>
              </div>
              <p className="text-4xl font-black text-white">3 <span className="text-lg font-medium text-slate-500">pessoas</span></p>
              <p className="text-xs text-slate-400 mt-2">Colaboradores com duplo período concessivo iminente.</p>
            </div>
          </div>
        </div>

        <ErrorBoundary>
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              Plano de Ação Estratégico gerado por AI
            </h3>
            <button className="text-sm text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1">
              Exportar Relatório <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {aiRecommendations.map(rec => (
              <div key={rec.id} className="glass-card rounded-2xl p-6 border border-white/5 hover:border-indigo-500/30 transition-all group flex flex-col md:flex-row items-center justify-between gap-6 cursor-pointer">
                
                <div className="flex items-center gap-6 w-full md:w-1/3">
                   <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-lg text-slate-300">
                        {rec.name.charAt(0)}
                      </div>
                      {rec.risk === 'HIGH' && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-rose-500 rounded-full border-2 border-slate-900 animate-pulse"></div>
                      )}
                      {rec.risk === 'MEDIUM' && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-slate-900"></div>
                      )}
                   </div>
                   <div>
                     <p className="font-bold text-white text-lg">{rec.name}</p>
                     <p className="text-sm text-rose-400 font-medium">{rec.deadline}</p>
                   </div>
                </div>

                <div className="w-full md:w-1/3 text-left md:text-center p-4 bg-slate-900/50 rounded-xl border border-white/5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Risco Evitado</p>
                  <p className="text-2xl font-black text-emerald-400">{rec.multaSaving}</p>
                </div>

                <div className="w-full md:w-1/3 flex justify-end">
                  <button className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]">
                    {rec.action}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ErrorBoundary>
        
      </main>
    </div>
  )
}
