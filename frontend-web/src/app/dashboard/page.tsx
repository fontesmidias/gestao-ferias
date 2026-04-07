'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  AreaChart, Area
} from 'recharts'
import { 
  LayoutDashboard, Users, Clock, AlertCircle, TrendingUp, CheckSquare, BrainCircuit 
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const res = await HttpClient.get('/dashboard/metrics')
      setData(res)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Formatting helper for Recharts
  const formatMonth = (tickItem: string) => {
    if (!tickItem) return ''
    const date = new Date(`${tickItem}-02T00:00:00Z`)
    return format(date, 'MMM yy', { locale: ptBR }).toUpperCase()
  }

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-[1600px] mx-auto px-4 pt-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <LayoutDashboard className="w-8 h-8 text-primary" />
              Intelligence Dashboard
            </h2>
            <p className="text-slate-400 mt-2">Cockpit preditivo e monitoramento global de férias.</p>
          </div>
          <div className="flex bg-slate-900/50 border border-white/5 p-2 rounded-xl">
             <button className="px-4 py-1 flex items-center gap-2 bg-primary text-white font-bold rounded-lg text-sm shadow-lg shadow-primary/20">
               <TrendingUp className="w-4 h-4"/> 1T 2026
             </button>
          </div>
        </div>

        <ErrorBoundary>
          {loading ? (
             <div className="h-[500px] flex items-center justify-center border border-white/5 glass-card rounded-3xl">
               <div className="flex flex-col items-center gap-4">
                 <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                 <p className="text-slate-400 font-bold tracking-widest text-sm uppercase">Carregando Oráculo...</p>
               </div>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Top KPIs */}
              <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-4 gap-6">
                
                <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Users className="w-24 h-24 text-primary" />
                  </div>
                  <h3 className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-2 z-10 relative">Força de Trabalho</h3>
                  <p className="text-4xl font-black text-white z-10 relative">{data?.kpis.totalEmployees || 0}</p>
                  <div className="mt-4 flex gap-3 text-xs font-medium z-10 relative">
                    <span className="text-emerald-400 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"/> {data?.kpis.composition?.['ATIVO'] || 0} Ativos</span>
                    <span className="text-amber-400 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"/> {data?.kpis.composition?.['AFASTADO'] || 0} Afastados</span>
                  </div>
                </div>

                <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <LayoutDashboard className="w-24 h-24 text-sky-500" />
                  </div>
                  <h3 className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-2 z-10 relative">Em Férias Atualmente</h3>
                  <p className="text-4xl font-black text-white z-10 relative">{data?.kpis.composition?.['FERIAS'] || 0}</p>
                  <p className="mt-4 text-xs text-slate-500 z-10 relative">Colaboradores ausentes da Lotação em D0</p>
                </div>

                <div className="glass-card p-6 rounded-2xl border border-rose-500/10 relative overflow-hidden group shadow-[0_0_30px_-5px_rgba(244,63,94,0.1)]">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Clock className="w-24 h-24 text-rose-500" />
                  </div>
                  <h3 className="text-rose-400 font-bold uppercase text-xs tracking-wider mb-2 z-10 relative flex items-center gap-2">
                    <AlertCircle className="w-4 h-4"/> Fila do RH
                  </h3>
                  <p className="text-4xl font-black text-white z-10 relative">{data?.kpis.pendingApprovals || 0}</p>
                  <p className="mt-4 text-xs text-rose-500/70 z-10 relative">Aprovações aguardando seu despacho urgente.</p>
                </div>
                
                <div className="glass-card p-6 rounded-2xl border border-indigo-500/20 relative overflow-hidden group bg-gradient-to-br from-indigo-500/10 to-transparent cursor-pointer hover:border-indigo-500/50 transition-colors">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <BrainCircuit className="w-24 h-24 text-indigo-400" />
                  </div>
                  <h3 className="text-indigo-400 font-bold uppercase text-xs tracking-wider mb-2 z-10 relative flex items-center gap-2">
                     Oráculo AI
                  </h3>
                  <p className="text-xl font-bold text-white z-10 relative mt-2 leading-tight">Insight Disponível</p>
                  <p className="mt-3 text-xs text-indigo-300 z-10 relative">Analise padrões de concessão de férias via IA Gerativa.</p>
                </div>
              </div>

              {/* Main Chart */}
              <div className="md:col-span-8 glass-card p-6 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary"/> Tendência Preditiva de Saídas
                    </h3>
                    <p className="text-sm text-slate-400">Total de férias agendadas (aprovadas) por mês.</p>
                  </div>
                </div>
                
                <div className="h-[300px] w-full">
                  {data?.trends && data.trends.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.trends} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="name" 
                          tickFormatter={formatMonth}
                          tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                          axisLine={{ stroke: '#334155' }}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis 
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc', fontWeight: 'bold' }}
                          labelFormatter={(label) => `Mês: ${formatMonth(label as string)}`}
                          itemStyle={{ color: '#818cf8' }}
                          cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          name="Funcionários"
                          stroke="#818cf8" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorValue)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                      <BarChart className="w-12 h-12 mb-3 opacity-20" />
                      <p>Nenhuma tendência formatada nos próximos meses.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="md:col-span-4 glass-card rounded-2xl border border-white/5 flex flex-col h-full bg-slate-900/30">
                 <div className="p-6 border-b border-white/5">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <CheckSquare className="w-5 h-5 text-emerald-500"/> Logs Recentes
                    </h3>
                 </div>
                 <div className="flex-1 p-6 overflow-y-auto">
                    {data?.activity && data.activity.length > 0 ? (
                      <div className="space-y-6">
                        {data.activity.map((act: any, idx: number) => (
                           <div key={act.id} className="relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-[-24px] before:w-px before:bg-slate-800 last:before:hidden">
                             <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center z-10">
                               <div className={`w-2 h-2 rounded-full ${
                                 act.action.includes('APPROVE') ? 'bg-emerald-500' :
                                 act.action.includes('REJECT') ? 'bg-rose-500' :
                                 act.action.includes('MANUAL') ? 'bg-amber-500' : 'bg-slate-500'
                               }`} />
                             </div>
                             <p className="text-sm font-bold text-white">{act.user}</p>
                             <p className="text-xs text-slate-400 mt-1 uppercase font-medium">{act.action}</p>
                             <p className="text-[10px] font-mono text-slate-500 mt-2">{format(new Date(act.date), "dd/MM 'às' HH:mm")}</p>
                           </div>
                        ))}
                      </div>
                    ) : (
                       <div className="h-full flex items-center justify-center text-center text-sm text-slate-500">
                         Nenhum despacho administrativo recente para exibir.
                       </div>
                    )}
                 </div>
              </div>

            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
