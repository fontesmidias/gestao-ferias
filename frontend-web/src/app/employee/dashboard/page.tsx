'use client'

import React, { useState } from 'react'
import { Calendar, AlertCircle, Plane, CheckCircle2, Navigation, LogOut } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuth } from '@/components/AuthContext'

export default function EmployeeDashboard() {
  const [requestMode, setRequestMode] = useState(false)
  const [selectedDays, setSelectedDays] = useState(15)
  const { user, logout, loading } = useAuth()

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Dados consolidados do usuário logado
  const employee = {
    name: user.name,
    role: user.role === 'ADMIN' ? 'Gestor de RH' : 'Colaborador',
    balance: {
      available: 30, // TODO: Buscar saldo real do backend
      nextExpiration: "2026-03-10", 
    }
  }

  return (
    <div className="bg-slate-950 text-slate-200 min-h-screen pb-24 md:pb-12 text-center md:text-left select-none">
      
      {/* Mobile Top App Bar */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold shadow-lg shadow-indigo-500/20">
            {employee.name.charAt(0)}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white leading-tight">Olá, {employee.name.split(' ')[0]}!</p>
            <p className="text-xs text-slate-400">{employee.role}</p>
          </div>
        </div>
        <button 
          onClick={logout}
          className="w-10 h-10 flex items-center justify-center bg-slate-800 text-rose-400 rounded-full hover:bg-rose-500/10 transition"
          title="Sair"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <main className="max-w-md mx-auto px-4 pt-8 pb-12">
        <ErrorBoundary>
          
          <h2 className="text-xl font-bold mb-4 px-2">Seu Saldo de Férias</h2>

          {/* Balance Hero Card */}
          <div className="glass-card rounded-[2rem] p-8 mb-8 bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 relative overflow-hidden shadow-2xl shadow-indigo-900/20">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/20 blur-3xl rounded-full"></div>
            <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-purple-500/20 blur-3xl rounded-full"></div>
            
            <div className="flex flex-col items-center justify-center relative z-10">
              <span className="text-sm font-medium text-indigo-300 tracking-wider uppercase mb-2">Dias Disponíveis</span>
              <div className="flex items-baseline gap-2">
                <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">
                  {employee.balance.available}
                </span>
                <span className="text-xl font-bold text-slate-500">dias</span>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between bg-slate-950/50 rounded-2xl p-4 border border-white/5 relative z-10">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-rose-400" />
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Vence em</p>
                  <p className="text-sm font-bold text-rose-300">{new Date(employee.balance.nextExpiration).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Area */}
          {!requestMode ? (
            <div className="space-y-4">
              <button 
                onClick={() => setRequestMode(true)}
                className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-xl shadow-white/10"
              >
                <Plane className="w-6 h-6" />
                Solicitar Férias Agora
              </button>
              <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 border border-white/5 active:scale-[0.98] transition-transform">
                Ver Histórico de Recibos
              </button>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-300">
              <h3 className="font-bold text-lg mb-4 text-white">Quantos dias deseja tirar?</h3>
              
              <div className="flex bg-slate-950 p-2 rounded-xl mb-6">
                 {[10, 15, 20, 30].map(d => (
                   <button 
                    key={d}
                    onClick={() => setSelectedDays(d)}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${selectedDays === d ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400'}`}
                   >
                     {d}
                   </button>
                 ))}
              </div>

              <div className="space-y-4 mb-8 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-4 mb-2 block">Data de Início (A partir de)</label>
                  <input type="date" className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono" />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setRequestMode(false)}
                  className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-xl"
                >Cancelar</button>
                <button 
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-transform"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Enviar RH
                </button>
              </div>
            </div>
          )}

        </ErrorBoundary>
      </main>

      {/* Mobile Bottom Navigation (PWA feel) */}
      <div className="md:hidden fixed bottom-0 left-0 w-full glass border-t border-white/5 pb-safe pt-2 px-6 flex justify-between items-center z-50">
        <button className="flex flex-col items-center p-2 text-indigo-400">
          <Navigation className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">Início</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500">
          <Calendar className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">Calendário</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500">
          <AlertCircle className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">Avisos</span>
        </button>
      </div>

    </div>
  )
}
