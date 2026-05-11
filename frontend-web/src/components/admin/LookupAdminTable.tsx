'use client'

import React, { useEffect, useState } from 'react'
import { Plus, Edit3, Trash2, X, RotateCcw, Sparkles } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'

export interface LookupRow {
  id: string
  name: string
  active: boolean
  importedBy: string | null
  _count?: { employees: number }
  // campos extras (opcional, exibidos como colunas se config os declarar)
  [k: string]: unknown
}

export interface LookupExtraField {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'time'
}

export interface LookupAdminConfig {
  endpoint: string // ex: '/branches', '/departments'
  singularLabel: string // 'Filial'
  pluralLabel: string // 'Filiais'
  helpText: string
  extras?: LookupExtraField[] // ex: [{ key: 'pattern', label: 'Padrão' }, { key: 'startTime', label: 'Início', type: 'time' }]
}

/**
 * V3.5 Stories 5.1.2-5.4.2: tabela admin reusavel para Branch/Department/Shift/Union.
 * Backend ja prove CRUD + backfill com mesmo formato — esta componente espelha.
 */
export function LookupAdminTable({ config }: { config: LookupAdminConfig }) {
  const [items, setItems] = useState<LookupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<LookupRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  const reset = () => {
    const base: Record<string, string> = { name: '' }
    for (const e of config.extras ?? []) base[e.key] = ''
    setForm(base)
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const res: any = await HttpClient.get(config.endpoint)
      setItems(res?.data ?? [])
    } catch (err: any) {
      toast.error(err?.body?.error?.message || `Erro ao carregar ${config.pluralLabel.toLowerCase()}.`)
    } finally { setLoading(false) }
  }
  useEffect(() => { fetchData() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [config.endpoint])

  const openCreate = () => { setEditing(null); setCreating(true); reset() }
  const openEdit = (r: LookupRow) => {
    setCreating(false); setEditing(r)
    const base: Record<string, string> = { name: r.name }
    for (const e of config.extras ?? []) base[e.key] = (r[e.key] as string) ?? ''
    setForm(base)
  }
  const closeModal = () => { if (saving) return; setEditing(null); setCreating(false) }
  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatorio.'); return }
    try {
      setSaving(true)
      const payload: Record<string, string | undefined> = { name: form.name.trim() }
      for (const e of config.extras ?? []) {
        const v = (form[e.key] || '').trim()
        if (v) payload[e.key] = v
      }
      if (editing) {
        await HttpClient.patch(`${config.endpoint}/${editing.id}`, payload)
        toast.success(`${config.singularLabel} atualizada.`)
      } else {
        await HttpClient.post(config.endpoint, payload)
        toast.success(`${config.singularLabel} criada.`)
      }
      closeModal()
      fetchData()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }
  const toggleActive = async (r: LookupRow) => {
    try {
      if (r.active && !confirm(`Desativar "${r.name}"?\n\nColaboradores vinculados ficam sem ${config.singularLabel.toLowerCase()} mas continuam ativos.`)) return
      await HttpClient.patch(`${config.endpoint}/${r.id}`, { active: !r.active })
      fetchData()
    } catch (err: any) { toast.error(err?.body?.error?.message || 'Erro.') }
  }
  const runBackfill = async () => {
    if (!confirm(`Vincular colaboradores automaticamente?\n\nO sistema percorre TODOS os colaboradores com campo "${config.singularLabel}" preenchido (texto livre) e que ainda nao tem vinculo. Cria os registros automaticamente quando necessario e liga.\n\nIdempotente. Continuar?`)) return
    try {
      setBackfilling(true)
      const res: any = await HttpClient.post(`${config.endpoint}/backfill`, {})
      const d = res?.data
      toast.success(`Vinculados: ${d?.updated ?? 0} colaboradores · Criados: ${d?.createdBranches ?? d?.createdLookups ?? 0} ${config.pluralLabel.toLowerCase()}.`, { duration: 10000 })
      fetchData()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro no backfill.')
    } finally { setBackfilling(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm text-slate-400">{config.helpText}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={runBackfill}
            disabled={backfilling}
            className="flex items-center gap-1.5 px-3 py-1.5 h-9 text-xs font-bold border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 rounded-lg hover:bg-indigo-500/20 disabled:opacity-50"
            title={`Cria ${config.pluralLabel.toLowerCase()} a partir do texto livre nos colaboradores e vincula automaticamente.`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {backfilling ? 'Vinculando...' : 'Vincular colaboradores'}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 h-9 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg shadow-lg shadow-primary/20"
          >
            <Plus className="w-3.5 h-3.5" /> Novo
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">
            Nenhum cadastro ainda. Use <strong>"Vincular colaboradores"</strong> para criar automaticamente a partir dos dados já existentes.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left px-4 py-2.5">Nome</th>
                {(config.extras ?? []).map(e => (
                  <th key={e.key} className="text-left px-4 py-2.5">{e.label}</th>
                ))}
                <th className="text-right px-4 py-2.5">Colaboradores</th>
                <th className="text-left px-4 py-2.5">Origem</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map(r => (
                <tr key={r.id} className={`hover:bg-white/[0.02] ${!r.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 text-white font-bold">{r.name}</td>
                  {(config.extras ?? []).map(e => (
                    <td key={e.key} className="px-4 py-2 text-slate-400 text-xs">{(r[e.key] as string) || '—'}</td>
                  ))}
                  <td className="px-4 py-2 text-right text-slate-300 font-mono">{r._count?.employees ?? 0}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${r.importedBy === 'AUTO_TIRVU' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' : 'bg-slate-700/40 text-slate-400 border-slate-600/50'}`}>
                      {r.importedBy === 'AUTO_TIRVU' ? 'Auto' : r.importedBy === 'MANUAL' ? 'Manual' : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${r.active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`}>
                      {r.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(r)} className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800 inline-flex items-center gap-1"><Edit3 className="w-3 h-3" /> Editar</button>
                    <button onClick={() => toggleActive(r)} className={`text-xs px-2 py-1 rounded hover:bg-slate-800 inline-flex items-center gap-1 ml-1 ${r.active ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {r.active ? <Trash2 className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                      {r.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(editing || creating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeModal}>
          <div className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">{creating ? `Novo${/a$/i.test(config.singularLabel) ? 'a' : ''} ${config.singularLabel}` : `Editar ${config.singularLabel}`}</h3>
              <button onClick={closeModal} disabled={saving} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nome <span className="text-rose-400">*</span></label>
                <input type="text" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              {(config.extras ?? []).map(e => (
                <div key={e.key}>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{e.label}</label>
                  <input
                    type={e.type ?? 'text'}
                    value={form[e.key] || ''}
                    onChange={ev => setForm({ ...form, [e.key]: ev.target.value })}
                    placeholder={e.placeholder}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <button onClick={closeModal} disabled={saving} className="px-4 py-2 text-sm border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-50">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50">{saving ? 'Salvando...' : (creating ? 'Criar' : 'Salvar')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
