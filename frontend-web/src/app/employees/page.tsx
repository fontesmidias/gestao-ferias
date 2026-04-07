'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Users, Search, Plus, Filter, MoreHorizontal, AlertCircle } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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

  const filtered = employees.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.position?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-7xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              Colaboradores
            </h2>
            <p className="text-slate-400 mt-2">Visão geral e gestão de todos os colaboradores do seu Tenant.</p>
          </div>
          <button className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Adicionar Colaborador
          </button>
        </div>

        <ErrorBoundary>
          {/* List Section */}
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
              <h3 className="font-bold text-lg hidden md:block">Gestão de Equipe</h3>
              <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-80 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome, cargo..." 
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <button className="w-full md:w-auto p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 flex items-center justify-center">
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-900/30 text-slate-400 uppercase text-xs tracking-wider">
                    <th className="px-6 py-4 font-medium">Nome / Cargo</th>
                    <th className="px-6 py-4 font-medium">Saldo Férias</th>
                    <th className="px-6 py-4 font-medium">Status Base</th>
                    <th className="px-6 py-4 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        Carregando colaboradores...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        Nenhum colaborador encontrado.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((emp) => (
                      <tr 
                        key={emp.id} 
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-xs">
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-white">{emp.name}</p>
                              <p className="text-xs text-slate-500">{emp.position || 'Colaborador'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${emp.balanceOffset > 30 ? 'text-rose-400' : 'text-slate-300'}`}>
                              {Math.floor(Math.random() * 45)} dias
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-slate-800 text-slate-300 border border-slate-700">
                            Ativo
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors">
                            <MoreHorizontal className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ErrorBoundary>
      </main>
    </div>
  )
}
