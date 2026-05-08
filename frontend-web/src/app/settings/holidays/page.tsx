'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { HttpClient } from '@/lib/api-client'
import { CalendarDays, Plus, Trash2, AlertCircle, X } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'

interface ResolvedHoliday {
  date: string // YYYY-MM-DD
  name: string
  source: 'NATIONAL' | 'STATE' | 'MANUAL'
  isOverride: boolean
  overrideId: string | null
  overrideAction: 'ADD' | 'REMOVE' | null
}

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  NATIONAL: { label: 'Nacional', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  STATE:    { label: 'Estadual', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  MANUAL:   { label: 'Manual',   className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
}

function HolidaysPageInner() {
  const { user } = useAuth()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [holidays, setHolidays] = useState<ResolvedHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [companyUf, setCompanyUf] = useState<string | null>(null)

  const [form, setForm] = useState<{ date: string; name: string; action: 'ADD' | 'REMOVE' }>({
    date: '',
    name: '',
    action: 'ADD'
  })
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [list, me] = await Promise.all([
        HttpClient.get(`/tenant-holidays?year=${year}`),
        HttpClient.get('/tenants/me').catch(() => null)
      ])
      setHolidays(list)
      setCompanyUf(me?.uf ?? null)
    } catch (e: any) {
      toast.error(`Falha ao carregar feriados: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year])

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    return [current - 1, current, current + 1, current + 2]
  }, [])

  async function submitOverride(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await HttpClient.post('/tenant-holidays', form)
      toast.success(form.action === 'ADD' ? 'Feriado adicionado' : 'Feriado oficial marcado para remoção')
      setShowAddSheet(false)
      setForm({ date: '', name: '', action: 'ADD' })
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function removeOverride(overrideId: string) {
    if (!confirm('Remover este ajuste manual de feriado?')) return
    try {
      await HttpClient.delete(`/tenant-holidays/${overrideId}`)
      toast.success('Ajuste removido')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-5xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <CalendarDays className="w-8 h-8 text-primary" />
              Feriados
              <InfoTooltip text="Calendário consolidado: feriados nacionais + estaduais (via UF) + ajustes manuais (pontos facultativos da empresa, ou feriados oficiais que sua operação opera normalmente)." />
            </h2>
            <p className="text-slate-400 mt-2 text-sm">
              Este calendário alimenta o bloqueio CLT de início de férias (Art. 134 § 3º).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {isAdmin && (
              <button
                onClick={() => setShowAddSheet(true)}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-lg shadow-primary/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            )}
          </div>
        </div>

        {!companyUf ? (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 text-sm text-amber-200">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
            <span className="flex-1">
              Defina a <strong>UF</strong> da empresa para ativar feriados estaduais:
            </span>
            <select
              defaultValue=""
              onChange={async (e) => {
                const newUf = e.target.value
                if (!newUf) return
                try {
                  await HttpClient.patch('/tenants/settings', { uf: newUf })
                  toast.success(`UF definida: ${newUf}`)
                  setCompanyUf(newUf)
                  await load()
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
              className="bg-slate-950 border border-amber-500/30 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              <option value="">Selecione…</option>
              {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-xs text-slate-400 mb-4">
            UF da empresa: <strong className="text-white">{companyUf}</strong> — feriados estaduais ativos.{' '}
            <button
              onClick={async () => {
                const novaUf = prompt('Nova UF (ex: SP, DF, RJ):', companyUf || '')?.toUpperCase()
                if (!novaUf || novaUf === companyUf) return
                try {
                  await HttpClient.patch('/tenants/settings', { uf: novaUf })
                  toast.success(`UF atualizada para ${novaUf}`)
                  setCompanyUf(novaUf)
                  await load()
                } catch (err: any) { toast.error(err.message) }
              }}
              className="text-primary hover:text-primary/80 underline ml-1"
            >alterar</button>
          </div>
        )}

        <ErrorBoundary>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
            {loading ? (
              <div className="p-8 text-sm text-slate-400 text-center">Carregando…</div>
            ) : holidays.length === 0 ? (
              <div className="p-12 text-sm text-slate-500 text-center">
                Nenhum feriado encontrado para {year}.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-900 border-b border-white/5">
                  <tr className="text-slate-400 uppercase text-[10px] tracking-wider font-bold">
                    <th className="text-left px-4 py-3 w-32">Data</th>
                    <th className="text-left px-4 py-3">Nome</th>
                    <th className="text-left px-4 py-3 w-32">Origem</th>
                    <th className="text-right px-4 py-3 w-20">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {holidays.map((h) => {
                    const src = SOURCE_BADGE[h.source]
                    return (
                      <tr key={h.date} className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[12px] text-slate-300">{h.date}</td>
                        <td className="px-4 py-2.5 text-slate-200">{h.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${src.className}`}>
                            {src.label}
                          </span>
                          {h.isOverride && h.overrideAction === 'REMOVE' && (
                            <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              Removido
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {h.isOverride && h.overrideId && isAdmin && (
                            <button
                              onClick={() => removeOverride(h.overrideId!)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors"
                              title="Remover ajuste manual"
                              aria-label="Remover ajuste manual"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </ErrorBoundary>
      </main>

      {showAddSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddSheet(false)}>
          <div className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">Adicionar Feriado</h3>
              <button
                onClick={() => setShowAddSheet(false)}
                aria-label="Fechar"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitOverride} className="space-y-4 text-sm">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Data</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nome</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Ex: Aniversário da empresa, ponto facultativo carnaval"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  Tipo
                  <InfoTooltip text="ADD: cria um feriado novo (ex: ponto facultativo, aniversário). REMOVE: cancela um feriado oficial que sua empresa opera normalmente." />
                </label>
                <select
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value as 'ADD' | 'REMOVE' })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="ADD">ADD — adicionar feriado</option>
                  <option value="REMOVE">REMOVE — remover feriado oficial</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSheet(false)}
                  className="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700/50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm shadow-lg shadow-primary/20 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HolidaysPage() {
  return (
    <ErrorBoundary>
      <HolidaysPageInner />
    </ErrorBoundary>
  )
}
