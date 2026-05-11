'use client'

import React, { useEffect, useState } from 'react'
import { Building2, Plus, Edit3, Trash2, X, RotateCcw, Sparkles } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ErrorBoundary } from '@/components/ErrorBoundary'

interface Branch {
  id: string
  name: string
  cnpj: string | null
  legalName: string | null
  active: boolean
  importedBy: string | null
  _count?: { employees: number }
}

export default function BranchesPage() {
  const [items, setItems] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', cnpj: '', legalName: '' })
  const [saving, setSaving] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      const res: any = await HttpClient.get('/branches')
      setItems(res?.data ?? [])
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro ao carregar filiais.')
    } finally { setLoading(false) }
  }
  useEffect(() => { fetchData() }, [])

  const openCreate = () => {
    setEditing(null); setCreating(true); setForm({ name: '', cnpj: '', legalName: '' })
  }
  const openEdit = (b: Branch) => {
    setCreating(false); setEditing(b); setForm({ name: b.name, cnpj: b.cnpj ?? '', legalName: b.legalName ?? '' })
  }
  const closeModal = () => {
    if (saving) return
    setEditing(null); setCreating(false)
  }
  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatorio.'); return }
    try {
      setSaving(true)
      const payload = { name: form.name.trim(), cnpj: form.cnpj.trim() || undefined, legalName: form.legalName.trim() || undefined }
      if (editing) {
        await HttpClient.patch(`/branches/${editing.id}`, payload)
        toast.success('Filial atualizada.')
      } else {
        await HttpClient.post('/branches', payload)
        toast.success('Filial criada.')
      }
      closeModal()
      fetchData()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro ao salvar.')
    } finally { setSaving(false) }
  }
  const toggleActive = async (b: Branch) => {
    try {
      if (b.active && !confirm(`Desativar "${b.name}"?\n\nColaboradores vinculados ficam sem filial mas continuam ativos.`)) return
      await HttpClient.patch(`/branches/${b.id}`, { active: !b.active })
      fetchData()
    } catch (err: any) { toast.error(err?.body?.error?.message || 'Erro.') }
  }
  const runBackfill = async () => {
    if (!confirm('Backfill de filiais:\n\nVai percorrer TODOS os colaboradores com campo "Empresa/Filial" preenchido e ainda sem filial vinculada, criar a filial automaticamente quando necessario e ligar o colaborador.\n\nIdempotente. Continuar?')) return
    try {
      setBackfilling(true)
      const res: any = await HttpClient.post('/branches/backfill', {})
      const d = res?.data
      toast.success(`Backfill OK: ${d?.updated ?? 0} colaboradores vinculados · ${d?.createdBranches ?? 0} filiais criadas.`, { duration: 10000 })
      fetchData()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro no backfill.')
    } finally { setBackfilling(false) }
  }

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-5xl mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Building2 className="w-8 h-8 text-primary" />
              Filiais
              <InfoTooltip text="Empresas/filiais às quais os colaboradores estão vinculados contratualmente." />
            </h2>
            <p className="text-slate-400 mt-2">Cadastro de filiais. Substitui o campo de texto livre — agora cada colaborador é vinculado a uma filial real.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 rounded-lg hover:bg-indigo-500/20 disabled:opacity-50"
              title="Vincula colaboradores existentes às filiais com base no campo de texto antigo. Cria filiais automaticamente quando necessário."
            >
              <Sparkles className="w-3.5 h-3.5" />
              {backfilling ? 'Vinculando...' : 'Vincular colaboradores'}
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Nova filial
            </button>
          </div>
        </div>

        <ErrorBoundary>
          <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500">Carregando...</div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Building2 className="w-12 h-12 opacity-30 mx-auto mb-3" />
                <p className="text-sm">Nenhuma filial cadastrada ainda.</p>
                <p className="text-xs text-slate-600 mt-1">Use "Vincular colaboradores" pra importar as filiais a partir dos dados existentes.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left px-6 py-3">Nome</th>
                    <th className="text-left px-6 py-3">CNPJ</th>
                    <th className="text-left px-6 py-3">Razão Social</th>
                    <th className="text-right px-6 py-3">Colaboradores</th>
                    <th className="text-left px-6 py-3">Origem</th>
                    <th className="text-left px-6 py-3">Status</th>
                    <th className="text-right px-6 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map(b => (
                    <tr key={b.id} className={`hover:bg-white/[0.02] ${!b.active ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-3 text-white font-bold">{b.name}</td>
                      <td className="px-6 py-3 text-slate-400 font-mono text-xs">{b.cnpj || '—'}</td>
                      <td className="px-6 py-3 text-slate-400 text-xs">{b.legalName || '—'}</td>
                      <td className="px-6 py-3 text-right text-slate-300 font-mono">{b._count?.employees ?? 0}</td>
                      <td className="px-6 py-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${b.importedBy === 'AUTO_TIRVU' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' : 'bg-slate-700/40 text-slate-400 border-slate-600/50'}`}>
                          {b.importedBy === 'AUTO_TIRVU' ? 'Auto (import)' : b.importedBy === 'MANUAL' ? 'Manual' : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${b.active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`}>
                          {b.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(b)} className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-800 inline-flex items-center gap-1"><Edit3 className="w-3 h-3" /> Editar</button>
                        <button onClick={() => toggleActive(b)} className={`text-xs px-2 py-1 rounded hover:bg-slate-800 inline-flex items-center gap-1 ml-1 ${b.active ? 'text-rose-300' : 'text-emerald-300'}`}>
                          {b.active ? <Trash2 className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                          {b.active ? 'Desativar' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ErrorBoundary>
      </main>

      {(editing || creating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeModal}>
          <div className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-white">{creating ? 'Nova Filial' : 'Editar Filial'}</h3>
              <button onClick={closeModal} disabled={saving} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nome <span className="text-rose-400">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Green House Matriz" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">CNPJ</label>
                <input type="text" value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Razão Social</label>
                <input type="text" value={form.legalName} onChange={e => setForm({ ...form, legalName: e.target.value })} placeholder="Razão social completa" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
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
