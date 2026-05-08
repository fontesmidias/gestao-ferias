'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { differenceInDays, parseISO } from 'date-fns'

interface EmployeeLite {
  id: string
  name: string
  registration?: string
  position?: string
  workplace?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

type Conflict = { id: string; startDate: string; endDate: string; status: string }

/**
 * V3.4 MVP M5: Modal "Programar Férias" admin-driven.
 * Cria VacationRequest direto APPROVED via POST /admin/vacations/programmed.
 * Trata 409 overlap (com botão de forçar) e 422 CLT (warnings + força).
 */
export function ProgramVacationModal({ open, onClose, onCreated }: Props) {
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<EmployeeLite | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [overlapConfirm, setOverlapConfirm] = useState<Conflict[] | null>(null)
  const [cltConfirm, setCltConfirm] = useState<string[] | null>(null)

  useEffect(() => {
    if (!open) return
    HttpClient.get('/employees/summary').then(() => {
      // facets só, lista vem dinâmica abaixo
    }).catch(() => {})
  }, [open])

  // Busca leve (server-side) ao digitar.
  useEffect(() => {
    if (!open) return
    const term = search.trim()
    if (term.length < 2) {
      setEmployees([])
      return
    }
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: term })
        const data = await HttpClient.get(`/employees?${params.toString()}`) as EmployeeLite[]
        setEmployees(data.slice(0, 20))
      } catch {
        setEmployees([])
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [search, open])

  const days = useMemo(() => {
    if (!startDate || !endDate) return null
    try {
      const d = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1
      return d >= 0 ? d : null
    } catch { return null }
  }, [startDate, endDate])

  const reset = () => {
    setSearch('')
    setSelected(null)
    setStartDate('')
    setEndDate('')
    setNote('')
    setOverlapConfirm(null)
    setCltConfirm(null)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const submit = async (overrides?: { overrideOverlap?: boolean; overrideBalance?: boolean }) => {
    if (!selected || !startDate || !endDate) {
      toast.error('Selecione colaborador e datas.')
      return
    }
    if (!days || days < 1) {
      toast.error('Período inválido.')
      return
    }
    setSubmitting(true)
    try {
      const res = await HttpClient.post('/admin/vacations/programmed', {
        employeeId: selected.id,
        startDate,
        endDate,
        dispatchNote: note.trim() || undefined,
        overrideOverlap: overrides?.overrideOverlap ?? false,
        overrideBalance: overrides?.overrideBalance ?? false,
      })
      // Sucesso: HttpClient não levanta para 2xx
      const meta = (res as any)?.meta
      if (meta?.cltWarnings?.length) {
        toast.warning(`Programada com avisos CLT: ${meta.cltWarnings.join('; ')}`)
      } else {
        toast.success('Férias programada com sucesso!')
      }
      reset()
      onCreated()
      onClose()
    } catch (err: any) {
      const errBody = err?.body?.error || err?.error
      const status = err?.status
      if (status === 409 && errBody?.code === 'VACATION_OVERLAP') {
        setOverlapConfirm(errBody.conflicts ?? [])
        setSubmitting(false)
        return
      }
      if (status === 422 && errBody?.code === 'CLT_VIOLATION') {
        setCltConfirm(errBody.details ?? [errBody.message])
        setSubmitting(false)
        return
      }
      toast.error(errBody?.message || err?.message || 'Erro ao programar férias.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold text-white">Programar Férias</h3>
          <button onClick={handleClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Cadastro direto em nome do colaborador. As férias entram já como
          <span className="text-emerald-400 font-bold mx-1">APROVADAS</span>
          (modo admin-driven). Útil para refletir o plano de férias da operação.
        </p>

        {/* Busca colaborador */}
        <div className="mb-4">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Colaborador <span className="text-rose-400">*</span></label>
          {selected ? (
            <div className="flex items-center justify-between bg-slate-950 border border-slate-700 rounded-lg px-3 py-2">
              <div className="text-sm">
                <p className="font-bold text-white">{selected.name}</p>
                <p className="text-[11px] text-slate-500">
                  {selected.position || 'Cargo n/d'} · {selected.workplace || 'Posto n/d'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); setSearch('') }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Alterar
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Digite ao menos 2 letras do nome ou matrícula..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              {employees.length > 0 && (
                <div className="mt-1 max-h-44 overflow-y-auto bg-slate-950 border border-slate-700 rounded-lg divide-y divide-white/5">
                  {employees.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => { setSelected(e); setSearch('') }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/5"
                    >
                      <p className="font-bold text-white text-[13px]">{e.name}</p>
                      <p className="text-[11px] text-slate-500">{e.position || '—'} · {e.workplace || '—'}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Datas */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Início <span className="text-rose-400">*</span></label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Fim <span className="text-rose-400">*</span></label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>

        {days != null && (
          <p className="text-xs text-slate-400 mb-4">Período: <span className="font-bold text-white">{days}</span> dia(s).</p>
        )}

        {/* Observação */}
        <div className="mb-4">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Observação (opcional)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ex: Plano anual 2026 · Decisão da diretoria · etc."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Conflito de overlap */}
        {overlapConfirm && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-200">
            <div className="flex items-start gap-2 mb-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-bold">Conflito de período</p>
            </div>
            <p className="text-xs mb-2">Este colaborador já tem férias sobrepondo o período pedido:</p>
            <ul className="text-[11px] space-y-1 mb-3">
              {overlapConfirm.map(c => (
                <li key={c.id} className="font-mono">
                  {c.startDate.slice(0, 10)} → {c.endDate.slice(0, 10)} ({c.status})
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOverlapConfirm(null)}
                className="px-3 py-1.5 text-xs border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50"
              >
                Ajustar datas
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit({ overrideOverlap: true })}
                className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg disabled:opacity-50"
              >
                Programar mesmo assim
              </button>
            </div>
          </div>
        )}

        {/* Violação CLT */}
        {cltConfirm && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-200">
            <div className="flex items-start gap-2 mb-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-bold">Aviso CLT (Art. 134)</p>
            </div>
            <ul className="text-[11px] space-y-1 mb-3 list-disc list-inside">
              {cltConfirm.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
            <p className="text-[11px] mb-3 text-rose-300">
              Forçar criação será registrado em auditoria. Use somente quando há
              decisão administrativa documentada.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCltConfirm(null)}
                className="px-3 py-1.5 text-xs border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50"
              >
                Ajustar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit({ overrideBalance: true, overrideOverlap: !!overlapConfirm })}
                className="px-3 py-1.5 text-xs bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-lg disabled:opacity-50"
              >
                Forçar criação (auditado)
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
          <button onClick={handleClose} disabled={submitting} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => submit()}
            disabled={submitting || !selected || !startDate || !endDate || days == null || days < 1}
            className="px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/80 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Salvando...' : 'Programar Férias'}
          </button>
        </div>
      </div>
    </div>
  )
}
