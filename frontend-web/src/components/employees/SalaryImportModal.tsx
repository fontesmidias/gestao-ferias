'use client'

import React, { useMemo, useState } from 'react'
import { X, Upload, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface PreviewItem {
  rowIndex: number
  matricula: string
  nome: string
  cargo: string | null
  cpf: string | null
  salarioDexion: number
  employeeId?: string
  employeeName?: string
  salarioAtual?: number | null
  delta?: number
  deltaPct?: number | null
  matchBy?: 'matricula' | 'cpf'
}

interface PreviewResponse {
  summary: {
    totalRows: number
    skippedFromParse: number
    unchanged: number
    divergent: number
    unmatched: number
  }
  unchanged: PreviewItem[]
  divergent: PreviewItem[]
  unmatched: PreviewItem[]
}

interface Props {
  open: boolean
  onClose: () => void
  onApplied: () => void
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * V3.4 FASE F5: Modal de importação de salários (Dexion).
 * - Step 1: upload do XLSX
 * - Step 2: preview com 3 abas (Sem mudança / Divergentes / Sem match)
 * - Step 3: operador seleciona divergentes e aplica
 */
export function SalaryImportModal({ open, onClose, onApplied }: Props) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [tab, setTab] = useState<'divergent' | 'unchanged' | 'unmatched'>('divergent')
  const [selected, setSelected] = useState<Set<string>>(new Set()) // employeeId set
  const [applying, setApplying] = useState(false)

  const handleClose = () => {
    if (uploading || applying) return
    setPreview(null)
    setSelected(new Set())
    setTab('divergent')
    onClose()
  }

  const onUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/employees/salaries/preview`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error?.message || 'Erro ao processar planilha.')
        return
      }
      const data = json?.data as PreviewResponse
      setPreview(data)
      // Pré-seleciona todos os divergentes (decisão padrão segura).
      const initSel = new Set<string>(data.divergent.map(d => d.employeeId!).filter(Boolean))
      setSelected(initSel)
    } catch (err: any) {
      toast.error(err?.message || 'Erro de rede.')
    } finally {
      setUploading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllDivergent = () => {
    if (!preview) return
    setSelected(new Set(preview.divergent.map(d => d.employeeId!).filter(Boolean)))
  }
  const selectNone = () => setSelected(new Set())

  const applySelected = async () => {
    if (!preview || selected.size === 0) {
      toast.error('Nenhum salário selecionado.')
      return
    }
    const updates = preview.divergent
      .filter(d => d.employeeId && selected.has(d.employeeId))
      .map(d => ({ employeeId: d.employeeId!, newSalary: d.salarioDexion }))
    if (updates.length === 0) {
      toast.error('Nenhum salário válido para aplicar.')
      return
    }
    if (!confirm(`Aplicar mudança de salário em ${updates.length} colaborador(es)?`)) return

    setApplying(true)
    try {
      const res = await HttpClient.post('/admin/employees/salaries/apply', { updates, source: 'dexion' }) as any
      const s = res?.data?.summary
      toast.success(`${s?.applied ?? 0} salários atualizados · ${s?.noop ?? 0} já estavam corretos · ${s?.errors ?? 0} erros`, { duration: 8000 })
      onApplied()
      handleClose()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || err?.message || 'Erro ao aplicar.')
    } finally {
      setApplying(false)
    }
  }

  const visible = useMemo<PreviewItem[]>(() => {
    if (!preview) return []
    return preview[tab]
  }, [preview, tab])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className="text-xl font-bold text-white">Importar Salários (Dexion)</h3>
          <button onClick={handleClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!preview ? (
          <div className="p-10 flex flex-col items-center gap-4">
            <Upload className="w-12 h-12 text-primary opacity-60" />
            <div className="text-center max-w-md">
              <p className="text-sm text-slate-300 mb-1 font-bold">Suba o XLSX exportado pelo Dexion</p>
              <p className="text-xs text-slate-500">
                O sistema detecta automaticamente o formato (cabeçalhos, separadores de lotação e
                sumários são ignorados). Match por matrícula (zeros à esquerda normalizados) com
                fallback por CPF.
              </p>
            </div>
            <label className="px-5 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg shadow-lg shadow-primary/20 cursor-pointer flex items-center gap-2">
              <Upload className="w-4 h-4" />
              {uploading ? 'Processando...' : 'Selecionar arquivo'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) await onUpload(f)
                  e.target.value = ''
                }}
              />
            </label>
            <p className="text-[11px] text-slate-600">
              Após o upload, você verá divergências e poderá deliberar individual ou em massa.
            </p>
          </div>
        ) : (
          <>
            {/* Tabs com contadores */}
            <div className="flex gap-1 px-5 pt-3 border-b border-white/5">
              {([
                { key: 'divergent' as const, label: '⚠ Divergentes', count: preview.summary.divergent, color: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
                { key: 'unchanged' as const, label: '✓ Sem mudança', count: preview.summary.unchanged, color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
                { key: 'unmatched' as const, label: '? Sem match', count: preview.summary.unmatched, color: 'text-slate-400 border-slate-600 bg-slate-700/30' },
              ]).map(t => {
                const active = tab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors ${
                      active ? `${t.color} border-current` : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                  >
                    {t.label} <span className="ml-1 opacity-70">({t.count})</span>
                  </button>
                )
              })}
            </div>

            {/* Toolbar */}
            {tab === 'divergent' && preview.divergent.length > 0 && (
              <div className="px-5 py-2 border-b border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-slate-400">
                  <span className="font-bold">{selected.size}</span> de {preview.divergent.length} selecionados
                </div>
                <div className="flex gap-2">
                  <button onClick={selectAllDivergent} className="px-2 py-1 text-[10px] font-bold border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50">
                    Selecionar todos
                  </button>
                  <button onClick={selectNone} className="px-2 py-1 text-[10px] font-bold border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50">
                    Desmarcar
                  </button>
                </div>
              </div>
            )}

            {/* Tabela */}
            <div className="flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  {tab === 'divergent' && '✓ Nenhuma divergência encontrada. Salários do sistema batem com Dexion.'}
                  {tab === 'unchanged' && 'Nenhum salário sem mudança nesse import.'}
                  {tab === 'unmatched' && 'Todos os trabalhadores Dexion casaram com o sistema.'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/5">
                    <tr>
                      {tab === 'divergent' && <th className="px-3 py-2 w-10"></th>}
                      <th className="px-3 py-2 text-left">Matrícula</th>
                      <th className="px-3 py-2 text-left">Nome</th>
                      <th className="px-3 py-2 text-left">Cargo (Dexion)</th>
                      {tab !== 'unmatched' && <th className="px-3 py-2 text-right">Salário atual</th>}
                      <th className="px-3 py-2 text-right">Salário Dexion</th>
                      {tab === 'divergent' && <th className="px-3 py-2 text-right">Δ</th>}
                      {tab !== 'unmatched' && <th className="px-3 py-2 text-center">Match</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {visible.map((it, idx) => {
                      const isSel = it.employeeId ? selected.has(it.employeeId) : false
                      const deltaColor = it.delta == null ? '' : it.delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                      return (
                        <tr key={`${tab}-${idx}`} className="hover:bg-white/[0.02]">
                          {tab === 'divergent' && (
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isSel}
                                onChange={() => it.employeeId && toggleSelect(it.employeeId)}
                                className="accent-primary"
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono text-sky-400 text-xs">{it.matricula}</td>
                          <td className="px-3 py-2 text-white text-[13px] font-bold">{it.employeeName || it.nome}</td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{it.cargo || '—'}</td>
                          {tab !== 'unmatched' && (
                            <td className="px-3 py-2 text-right text-slate-300 font-mono text-xs">
                              {it.salarioAtual != null ? fmtBRL(it.salarioAtual) : '—'}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right text-white font-mono font-bold text-xs">
                            {fmtBRL(it.salarioDexion)}
                          </td>
                          {tab === 'divergent' && (
                            <td className={`px-3 py-2 text-right font-mono font-bold text-xs ${deltaColor}`}>
                              {it.delta != null && (it.delta > 0 ? '+' : '')}{it.delta != null ? fmtBRL(it.delta) : '—'}
                              {it.deltaPct != null && (
                                <span className="block text-[9px] opacity-70">({it.deltaPct > 0 ? '+' : ''}{it.deltaPct}%)</span>
                              )}
                            </td>
                          )}
                          {tab !== 'unmatched' && (
                            <td className="px-3 py-2 text-center">
                              {it.matchBy === 'matricula' ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">matrícula</span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">CPF</span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/10 bg-slate-900/40 flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                {preview.summary.totalRows} trabalhadores na planilha · {preview.summary.skippedFromParse} linhas ignoradas (cabeçalhos/separadores)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50"
                >
                  Fechar
                </button>
                {tab === 'divergent' && (
                  <button
                    onClick={applySelected}
                    disabled={applying || selected.size === 0}
                    className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {applying ? 'Aplicando...' : `Aplicar ${selected.size} salário(s)`}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
