'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, AlertCircle, CheckCircle2, Sparkles, Calendar, AlertTriangle } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { differenceInDays, parseISO, format, addDays, getDay } from 'date-fns'

interface EmployeeLite {
  id: string
  name: string
  registration?: string
  position?: string
  workplace?: string
}

interface BalancePeriod {
  startDate: string
  endDate: string
  concessiveEndDate: string
  daysOfRight: number
  status: 'AQUISITIVO' | 'CONCESSIVO' | 'VENCIDO' | 'QUITADO'
}

interface BalanceData {
  employeeId: string
  employeeName: string
  hireDate: string
  totalAvailable: number
  periods: BalancePeriod[]
  suggestion: {
    startDate: string
    endDate: string
    days: number
    reason: string
  } | null
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

type Conflict = { id: string; startDate: string; endDate: string; status: string }

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  AQUISITIVO: { label: 'Aquisitivo', className: 'bg-slate-700 text-slate-300' },
  CONCESSIVO: { label: 'Concessivo', className: 'bg-sky-500/20 text-sky-300 border border-sky-500/30' },
  VENCIDO:    { label: 'VENCIDO', className: 'bg-rose-500/20 text-rose-300 border border-rose-500/30' },
  QUITADO:    { label: 'Quitado', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
}

/**
 * V3.4 FASE B: Modal "Programar Férias" rico.
 * - Mostra saldo CLT por período aquisitivo ao selecionar colaborador.
 * - Botão "Sugerir período" pré-preenche datas com janela do VENCIDO/CONCESSIVO aberto.
 * - Calculadora viva: edita 2 dos 3 campos (start, end, days) e o terceiro recalcula.
 * - Avisos CLT inline em tempo real (saldo, fração mínima, dia da semana).
 * - Trata 409 overlap e 422 CLT do backend com botões de override (auditados).
 */
export function ProgramVacationModal({ open, onClose, onCreated }: Props) {
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<EmployeeLite | null>(null)
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [days, setDays] = useState<number | null>(null)
  const [lastEdited, setLastEdited] = useState<'start' | 'end' | 'days' | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [overlapConfirm, setOverlapConfirm] = useState<Conflict[] | null>(null)
  const [cltConfirm, setCltConfirm] = useState<string[] | null>(null)

  // Busca colaborador por nome/matrícula.
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

  // Carrega saldo + sugestão quando seleciona colaborador.
  useEffect(() => {
    if (!selected) { setBalance(null); return }
    setBalanceLoading(true)
    HttpClient.get(`/employees/${selected.id}/vacation-balance`)
      .then((res: any) => {
        const data = (res?.data ?? res) as BalanceData
        setBalance(data)
      })
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false))
  }, [selected])

  // Calculadora viva: ao mudar 2 campos, recalcula o terceiro.
  useEffect(() => {
    if (!lastEdited) return
    try {
      if (lastEdited === 'days') {
        if (startDate && days != null && days > 0) {
          const e = addDays(parseISO(startDate), days - 1)
          setEndDate(format(e, 'yyyy-MM-dd'))
        } else if (endDate && days != null && days > 0) {
          const s = addDays(parseISO(endDate), -(days - 1))
          setStartDate(format(s, 'yyyy-MM-dd'))
        }
      } else if (lastEdited === 'start') {
        if (startDate && days != null && days > 0) {
          const e = addDays(parseISO(startDate), days - 1)
          setEndDate(format(e, 'yyyy-MM-dd'))
        } else if (startDate && endDate) {
          const d = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1
          if (d > 0) setDays(d)
        }
      } else if (lastEdited === 'end') {
        if (startDate && endDate) {
          const d = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1
          if (d > 0) setDays(d)
        } else if (endDate && days != null && days > 0) {
          const s = addDays(parseISO(endDate), -(days - 1))
          setStartDate(format(s, 'yyyy-MM-dd'))
        }
      }
    } catch { /* parse fail */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, days, lastEdited])

  // Avisos CLT inline.
  const warnings = useMemo<string[]>(() => {
    const list: string[] = []
    if (!startDate || !endDate || !days || days <= 0) return list
    try {
      const start = parseISO(startDate)
      const startDow = getDay(start) // 0=dom 6=sáb
      // CLT Art. 134 §3º: início não pode em dia que antecede feriado/sexta.
      if (startDow === 5) list.push('Início numa sexta-feira — CLT Art. 134 §3º veda início nos 2 dias anteriores a feriado/repouso semanal.')
      if (startDow === 6) list.push('Início num sábado — CLT recomenda iniciar em dia útil.')
      if (startDow === 0) list.push('Início num domingo — CLT veda início em domingo (Art. 134 §3º).')

      // Saldo
      if (balance && days > balance.totalAvailable) {
        list.push(`Saldo insuficiente: faltam ${days - balance.totalAvailable} dias (saldo total disponível: ${balance.totalAvailable}).`)
      }

      // Fração mínima 14 dias se for fracionar
      if (days < 14) {
        list.push('Período < 14 dias — CLT Art. 134 §1º exige que pelo menos UMA fração tenha ≥14 dias.')
      }
    } catch { /* parse fail */ }
    return list
  }, [startDate, endDate, days, balance])

  const reset = () => {
    setSearch('')
    setSelected(null)
    setBalance(null)
    setStartDate('')
    setEndDate('')
    setDays(null)
    setLastEdited(null)
    setNote('')
    setOverlapConfirm(null)
    setCltConfirm(null)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const applySuggestion = () => {
    if (!balance?.suggestion) return
    setStartDate(balance.suggestion.startDate)
    setEndDate(balance.suggestion.endDate)
    setDays(balance.suggestion.days)
    setLastEdited(null)
  }

  const submit = async (overrides?: { overrideOverlap?: boolean; overrideBalance?: boolean }) => {
    if (!selected || !startDate || !endDate || !days || days < 1) {
      toast.error('Preencha colaborador, datas e dias.')
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
        className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold text-white">Programar Férias</h3>
          <button onClick={handleClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Cadastro direto em nome do colaborador. Entra como
          <span className="text-emerald-400 font-bold mx-1">APROVADA</span>.
          O sistema mostra saldo CLT, sugere a melhor janela e calcula datas/dias automaticamente.
        </p>

        {/* Busca colaborador */}
        <div className="mb-4">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Colaborador <span className="text-rose-400">*</span></label>
          {selected ? (
            <div className="flex items-center justify-between bg-slate-950 border border-slate-700 rounded-lg px-3 py-2">
              <div className="text-sm">
                <p className="font-bold text-white">{selected.name}</p>
                <p className="text-[11px] text-slate-500">
                  Matr. <span className="text-sky-400 font-mono">{selected.registration || 'S/N'}</span>
                  {' · '}{selected.position || 'Cargo n/d'} · {selected.workplace || 'Posto n/d'}
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
                      <p className="font-bold text-white text-[13px] flex items-center gap-2">
                        {e.name}
                        <span className="text-[10px] font-mono text-sky-400">[{e.registration || 'S/N'}]</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{e.position || '—'} · {e.workplace || '—'}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Saldo CLT + Sugestão */}
        {selected && (
          <div className="mb-4 bg-slate-950/40 border border-white/5 rounded-xl p-3">
            {balanceLoading ? (
              <p className="text-xs text-slate-500 animate-pulse">Calculando saldo CLT...</p>
            ) : balance ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Saldo CLT</p>
                  <p className="text-xs text-slate-400">
                    Total disponível: <span className="text-white font-bold">{balance.totalAvailable}</span> dias
                  </p>
                </div>
                <div className="space-y-1 mb-2">
                  {balance.periods.length === 0 && (
                    <p className="text-xs text-slate-500">Sem períodos elegíveis ainda (admissão recente).</p>
                  )}
                  {balance.periods.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${STATUS_BADGE[p.status]?.className || 'bg-slate-700'}`}>
                          {STATUS_BADGE[p.status]?.label || p.status}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {p.startDate} → {p.endDate}
                        </span>
                      </div>
                      <span className={`font-bold ${p.daysOfRight > 0 ? 'text-white' : 'text-slate-600'}`}>
                        {p.daysOfRight} dias
                      </span>
                    </div>
                  ))}
                </div>
                {balance.suggestion && (
                  <button
                    type="button"
                    onClick={applySuggestion}
                    className="w-full mt-1 flex items-center justify-between gap-2 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2 text-[12px] text-indigo-200">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span><strong className="text-white">{balance.suggestion.startDate}</strong> → <strong className="text-white">{balance.suggestion.endDate}</strong> · {balance.suggestion.days} dias</span>
                    </div>
                    <span className="text-[10px] text-indigo-300">Aplicar sugestão</span>
                  </button>
                )}
                {balance.suggestion && (
                  <p className="text-[10px] text-slate-500 mt-1">{balance.suggestion.reason}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">Não foi possível carregar o saldo.</p>
            )}
          </div>
        )}

        {/* Calculadora viva: 3 campos */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Início <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setLastEdited('start') }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Dias <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={days ?? ''}
              onChange={e => { const v = Number(e.target.value); setDays(Number.isFinite(v) ? v : null); setLastEdited('days') }}
              placeholder="Ex: 30"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Fim <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setLastEdited('end') }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-600 mb-3">Edite 2 dos 3 campos — o terceiro é calculado automaticamente.</p>

        {/* Avisos CLT inline */}
        {warnings.length > 0 && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-200">
            <div className="flex items-start gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-bold text-xs">Avisos CLT (não bloqueiam, mas confira)</p>
            </div>
            <ul className="text-[11px] space-y-0.5 list-disc list-inside ml-5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
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

        {/* Violação CLT do backend */}
        {cltConfirm && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-200">
            <div className="flex items-start gap-2 mb-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-bold">Bloqueio CLT (Art. 134)</p>
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
            disabled={submitting || !selected || !startDate || !endDate || !days || days < 1}
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
