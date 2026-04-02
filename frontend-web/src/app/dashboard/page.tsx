'use client'

import React from 'react'
import { 
  Users, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Search, 
  Filter, 
  MoreHorizontal,
  FileText,
  AlertCircle
} from 'lucide-react'
import { useState } from 'react'
import VacationDrawer from '@/components/VacationDrawer'
import { useSocket } from '@/hooks/use-socket'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const mockEmployees = [
  { id: '1', name: 'Ana Oliveira', position: 'Software Engineer', salary: 12500, balance: 30, status: 'CONCESSIVO' },
  { id: '2', name: 'Bruno Santos', position: 'Product Manager', salary: 15000, balance: 14, status: 'AQUISITIVO' },
  { id: '3', name: 'Carla Lima', position: 'UX Designer', salary: 9800, balance: 45, status: 'VENCIDO' },
  { id: '4', name: 'Diego Ferreira', position: 'Sales Lead', salary: 11000, balance: 22, status: 'CONCESSIVO' },
]

import { useAuth } from '@/components/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null)
  
  // Ativação do Real-time (Story 5.3)
  useSocket('tenant-1')

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">

      <main className="max-w-7xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="mb-8">
          <h2 className="text-3xl font-bold text-white">Bem-vindo, {user?.name?.split(' ')[0] || 'Gestor'}!</h2>
          <p className="text-slate-400 mt-2">Aqui está o panorama das férias da sua equipe hoje.</p>
        </div>
          <button className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-primary/20">
            Importar Colaboradores
          </button>
        </div>

        <ErrorBoundary>
          {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            title="Total de Colaboradores" 
            value="142" 
            icon={<Users className="w-5 h-5" />} 
            trend="+12% este mês"
          />
          <StatCard 
            title="Dias a Vencer" 
            value="1.240" 
            icon={<Calendar className="w-5 h-5" />} 
            trend="Risco Médio"
            trendColor="text-amber-400"
          />
          <StatCard 
            title="Contingência Financeira" 
            value="R$ 452k" 
            icon={<DollarSign className="w-5 h-5" />} 
            trend="Calculado (98%)"
          />
          <StatCard 
            title="ROI de Substituição" 
            value="R$ 84k" 
            icon={<TrendingUp className="w-5 h-5" />} 
            trend="Economia Potencial"
            trendColor="text-emerald-400"
          />
        </div>

        {/* List Section */}
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
          <div className="p-6 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <h3 className="font-bold text-lg">Colaboradores & Saldos</h3>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Buscar funcionário..." 
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700">
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-900/30 text-slate-400 uppercase text-xs tracking-wider">
                  <th className="px-6 py-4 font-medium">Nome / Cargo</th>
                  <th className="px-6 py-4 font-medium">Saldo (Dias)</th>
                  <th className="px-6 py-4 font-medium">Status do Período</th>
                  <th className="px-6 py-4 font-medium">Salário Base</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {mockEmployees.map((emp) => (
                  <tr 
                    key={emp.id} 
                    onClick={() => setSelectedEmployee(emp)}
                    className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-xs">
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-white">{emp.name}</p>
                          <p className="text-xs text-slate-500">{emp.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${emp.balance > 30 ? 'text-rose-400' : 'text-white'}`}>
                          {emp.balance} dias
                        </span>
                        {emp.balance > 30 && <AlertCircle className="w-3 h-3 text-rose-400" />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight ${
                        emp.status === 'VENCIDO' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                        emp.status === 'CONCESSIVO' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                        'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono">
                      R$ {emp.salary.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedEmployee && (
          <VacationDrawer 
            isOpen={!!selectedEmployee} 
            onClose={() => setSelectedEmployee(null)} 
            employee={selectedEmployee} 
          />
        )}
        </ErrorBoundary>
      </main>
    </div>
  )
}

function StatCard({ title, value, icon, trend, trendColor = 'text-slate-500' }: any) {
  return (
    <div className="glass-card p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-primary/30 transition-all">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-secondary opacity-0 group-hover:opacity-100 transition-all" />
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-primary/10 text-primary rounded-lg">
          {icon}
        </div>
        <span className={`text-xs font-medium ${trendColor}`}>{trend}</span>
      </div>
      <div>
        <h4 className="text-slate-400 text-sm font-medium mb-1">{title}</h4>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  )
}
