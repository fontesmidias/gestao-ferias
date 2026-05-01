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

const SOURCE_LABEL: Record<string, { label: string; className: string }> = {
  NATIONAL: { label: 'Nacional', className: 'bg-blue-100 text-blue-800' },
  STATE: { label: 'Estadual', className: 'bg-purple-100 text-purple-800' },
  MANUAL: { label: 'Manual', className: 'bg-amber-100 text-amber-800' },
}

function HolidaysPageInner() {
  const { user } = useAuth()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [holidays, setHolidays] = useState<ResolvedHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [tenantUf, setTenantUf] = useState<string | null>(null)

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
      setTenantUf(me?.uf ?? null)
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
    if (!confirm('Remover este override de feriado?')) return
    try {
      await HttpClient.delete(`/tenant-holidays/${overrideId}`)
      toast.success('Override removido')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Feriados do Tenant
            <InfoTooltip text="Calendário consolidado: feriados nacionais + estaduais (via UF) + overrides manuais (pontos facultativos da empresa, ou feriados oficiais que sua operação opera normalmente)." />
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Este calendário alimenta o bloqueio CLT de início de férias (Art. 134 § 3º).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <button
              onClick={() => setShowAddSheet(true)}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
          )}
        </div>
      </div>

      {!tenantUf ? (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded p-3 mb-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
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
                setTenantUf(newUf)
                await load()
              } catch (err: any) {
                toast.error(err.message)
              }
            }}
            className="border border-amber-300 rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Selecione…</option>
            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="text-xs text-gray-500 mb-3">
          UF do tenant: <strong>{tenantUf}</strong> — feriados estaduais ativos.
          {' '}
          <button
            onClick={async () => {
              const novaUf = prompt('Nova UF (ex: SP, DF, RJ):', tenantUf || '')?.toUpperCase()
              if (!novaUf || novaUf === tenantUf) return
              try {
                await HttpClient.patch('/tenants/settings', { uf: novaUf })
                toast.success(`UF atualizada para ${novaUf}`)
                setTenantUf(novaUf)
                await load()
              } catch (err: any) { toast.error(err.message) }
            }}
            className="text-blue-600 underline ml-1"
          >alterar</button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Carregando…</div>
      ) : holidays.length === 0 ? (
        <div className="text-sm text-gray-500 border rounded p-6 text-center">
          Nenhum feriado encontrado para {year}.
        </div>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 w-32">Data</th>
                <th className="text-left px-3 py-2">Nome</th>
                <th className="text-left px-3 py-2 w-28">Origem</th>
                <th className="text-right px-3 py-2 w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => {
                const src = SOURCE_LABEL[h.source]
                return (
                  <tr key={h.date} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-xs">{h.date}</td>
                    <td className="px-3 py-1.5">{h.name}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${src.className}`}>
                        {src.label}
                      </span>
                      {h.isOverride && h.overrideAction === 'REMOVE' && (
                        <span className="ml-1 text-xs px-2 py-0.5 rounded bg-red-100 text-red-800">Removido</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {h.isOverride && h.overrideId && isAdmin && (
                        <button
                          onClick={() => removeOverride(h.overrideId!)}
                          className="text-red-600 hover:text-red-800"
                          title="Remover override"
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
        </div>
      )}

      {showAddSheet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAddSheet(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Adicionar Feriado</h2>
              <button onClick={() => setShowAddSheet(false)} aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitOverride} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Nome</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Ex: Aniversário da empresa, ponto facultativo carnaval"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                  Tipo
                  <InfoTooltip text="ADD: cria um feriado novo (ex: ponto facultativo, aniversário). REMOVE: cancela um feriado oficial que sua empresa opera normalmente." />
                </label>
                <select
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value as 'ADD' | 'REMOVE' })}
                  className="w-full border rounded px-2 py-1"
                >
                  <option value="ADD">ADD — adicionar feriado</option>
                  <option value="REMOVE">REMOVE — remover feriado oficial</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSheet(false)}
                  className="px-3 py-1.5 border rounded text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
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
