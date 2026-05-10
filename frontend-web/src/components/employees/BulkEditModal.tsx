'use client'

import React, { useState } from 'react'
import { X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface Props {
  open: boolean
  selectedEmployeeIds: string[]
  onClose: () => void
  onApplied: () => void
}

type Field = 'salary' | 'isFerista' | 'status' | 'position' | 'shift'

const FIELD_LABELS: Record<Field, string> = {
  salary: 'Salário',
  isFerista: 'Ferista (elegível para cobertura)',
  status: 'Status',
  position: 'Cargo',
  shift: 'Escala',
}

/**
 * V3.4 FASE F6: edição em massa de campo único nos employees selecionados.
 * Preview obrigatório ('Aplicar em N colaboradores?') antes de submeter.
 */
export function BulkEditModal({ open, selectedEmployeeIds, onClose, onApplied }: Props) {
  const [field, setField] = useState<Field>('salary')
  const [value, setValue] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const handleClose = () => {
    if (submitting) return
    setField('salary')
    setValue('')
    onClose()
  }

  const apply = async () => {
    if (selectedEmployeeIds.length === 0) {
      toast.error('Nenhum colaborador selecionado.')
      return
    }
    if (value === '' && field !== 'isFerista') {
      toast.error('Informe o valor.')
      return
    }
    let typedValue: unknown = value
    if (field === 'salary') {
      const n = Number(value.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Salário inválido.')
        return
      }
      typedValue = n
    } else if (field === 'isFerista') {
      typedValue = value === 'true'
    }

    if (!confirm(`Aplicar ${FIELD_LABELS[field]} = "${value}" em ${selectedEmployeeIds.length} colaborador(es)?\n\nEsta ação será registrada em auditoria.`)) {
      return
    }

    setSubmitting(true)
    try {
      const res = await HttpClient.patch('/employees/bulk-edit', {
        employeeIds: selectedEmployeeIds,
        patch: { [field]: typedValue },
      }) as any
      const s = res?.data?.summary
      toast.success(`${s?.applied ?? 0} aplicados · ${s?.noop ?? 0} já estavam corretos · ${s?.skippedNotFound ?? 0} não encontrados`, { duration: 8000 })
      onApplied()
      handleClose()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || err?.message || 'Erro ao aplicar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="glass-card bg-slate-800 border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold text-white">Editar em massa</h3>
          <button onClick={handleClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <p className="text-xs text-amber-200">
            <strong>{selectedEmployeeIds.length}</strong> colaborador(es) selecionado(s). A mudança será aplicada em TODOS, com 1 registro de auditoria por colaborador.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Campo a editar</label>
            <select
              value={field}
              onChange={e => { setField(e.target.value as Field); setValue('') }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {(Object.keys(FIELD_LABELS) as Field[]).map(f => (
                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Novo valor</label>
            {field === 'isFerista' && (
              <select
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">Selecione...</option>
                <option value="true">Sim — ferista (elegível para cobertura)</option>
                <option value="false">Não — não é ferista</option>
              </select>
            )}
            {field === 'status' && (
              <select
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">Selecione...</option>
                <option value="ATIVO">ATIVO</option>
                <option value="FERIAS">FÉRIAS</option>
                <option value="AFASTADO">AFASTADO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
            )}
            {field === 'salary' && (
              <input
                type="number"
                step="0.01"
                min={0}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Ex: 1862.09"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
            {(field === 'position' || field === 'shift') && (
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={field === 'position' ? 'Ex: Recepcionista' : 'Ex: 12x36'}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-sm border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={apply}
            disabled={submitting}
            className="px-5 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Aplicando...' : 'Aplicar em massa'}
          </button>
        </div>
      </div>
    </div>
  )
}
