'use client'

import React, { useState, useEffect } from 'react'
import { X, Calendar, AlertTriangle, CheckCircle2, DollarSign } from 'lucide-react'
import { format, addDays, getDay, differenceInDays, parseISO, isAfter } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface VacationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  employee: any;
}

export default function VacationDrawer({ isOpen, onClose, employee }: VacationDrawerProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // Live Validation (Art. 134 CLT)
  useEffect(() => {
    if (startDate && endDate) {
      const errors: string[] = []
      const start = parseISO(startDate)
      const end = parseISO(endDate)
      const days = differenceInDays(end, start) + 1
      const startDay = getDay(start) // 0=Dom, 4=Qui, 5=Sex

      if (days < 5) errors.push('O período mínimo permitido é de 5 dias.')
      if (startDay === 4 || startDay === 5) errors.push('As férias não podem iniciar em quintas ou sextas (Art. 134 § 3º).')
      if (days > employee.balance) errors.push('Saldo insuficiente para este período.')

      setValidationErrors(errors)
    } else {
      setValidationErrors([])
    }
  }, [startDate, endDate, employee.balance])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Content */}
      <div className="relative w-full max-w-lg bg-slate-900 border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center font-bold text-lg">
              {employee.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{employee.name}</h2>
              <p className="text-sm text-slate-400">{employee.position}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Balance Overview */}
          <section className="grid grid-cols-2 gap-4">
            <div className="glass p-4 rounded-xl border border-white/5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Saldo Total</p>
              <p className="text-2xl font-bold text-white">{employee.balance} dias</p>
            </div>
            <div className="glass p-4 rounded-xl border border-white/5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Salário Base</p>
              <p className="text-2xl font-bold text-white font-mono">
                R$ {employee.salary.toLocaleString('pt-BR')}
              </p>
            </div>
          </section>

          {/* Request Form */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Solicitar Novo Período
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="startDate" className="text-xs font-bold text-slate-500 uppercase">Data de Início</label>
                <input 
                  id="startDate"
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="endDate" className="text-xs font-bold text-slate-500 uppercase">Data de Término</label>
                <input 
                  id="endDate"
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>

            {/* Live Validation UI */}
            {validationErrors.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl space-y-2">
                {validationErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-rose-400 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {startDate && endDate && validationErrors.length === 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-2 text-emerald-400 text-sm animate-in fade-in zoom-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Período válido conforme as regras da CLT.</span>
              </div>
            )}
          </section>

          {/* Financial Impact Mock */}
          <section className="glass-card p-6 rounded-2xl bg-gradient-to-br from-slate-800/30 to-slate-900/30">
            <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Impacto Financeiro Estimado
            </h3>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Valor das Férias (Pro-rata):</span>
                <span className="text-white">R$ 4.250,50</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">1/3 Constitucional:</span>
                <span className="text-white">R$ 1.416,83</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/5 font-bold text-lg">
                <span className="text-primary tracking-tight">Total Contingência:</span>
                <span className="text-white">R$ 5.667,33</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-slate-900/80 backdrop-blur-md">
          <button 
            disabled={!startDate || !endDate || validationErrors.length > 0 || loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-20 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            Enviar para Avaliação do RH
          </button>
        </div>
      </div>
    </div>
  )
}
