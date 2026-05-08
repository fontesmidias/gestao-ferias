'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Database } from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import type { ImportMode, NewWorkplacesMode, PreviewCounts } from '@/lib/imports/types'

interface ImportConfirmApplyModalProps {
  open: boolean
  mode: ImportMode
  tenantName: string
  counts: PreviewCounts
  newWorkplaces: string[]
  newWorkplacesMode: NewWorkplacesMode
  loading?: boolean
  onConfirm: (input: { confirmTenantName: string; createWorkplaces: string[] }) => void | Promise<void>
  onClose: () => void
}

export function ImportConfirmApplyModal({
  open,
  mode,
  tenantName,
  counts,
  newWorkplaces,
  newWorkplacesMode,
  loading = false,
  onConfirm,
  onClose,
}: ImportConfirmApplyModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const [typedName, setTypedName] = useState('')

  const requiresTyping = mode === 'admin'
  const matchesName = useMemo(
    () => requiresTyping && typedName.trim() === tenantName,
    [requiresTyping, typedName, tenantName],
  )
  const showMismatch = requiresTyping && typedName.length > 0 && !matchesName
  const canConfirm = requiresTyping ? matchesName : true

  // Focus trap + Esc + default focus.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelBtnRef.current?.focus()
    queueMicrotask(() => setTypedName(''))

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const operations: string[] = []
  if (counts.create > 0) operations.push(`✚ Criar ${counts.create} colaborador${counts.create === 1 ? '' : 'es'}`)
  if (counts.update > 0) operations.push(`✎ Atualizar ${counts.update} colaborador${counts.update === 1 ? '' : 'es'}`)
  if (counts.reactivation > 0) operations.push(`↻ Reativar ${counts.reactivation} colaborador${counts.reactivation === 1 ? '' : 'es'}`)
  if (newWorkplaces.length > 0) {
    if (newWorkplacesMode === 'create-all') {
      operations.push(`🆕 Criar ${newWorkplaces.length} ${newWorkplaces.length === 1 ? 'posto' : 'postos'} (${newWorkplaces.join(', ')})`)
    } else {
      operations.push(`🆕 Decidir ${newWorkplaces.length} ${newWorkplaces.length === 1 ? 'posto' : 'postos'} caso a caso`)
    }
  }
  if (counts.invalid > 0) operations.push(`⚠ Ignorar ${counts.invalid} linha${counts.invalid === 1 ? '' : 's'} inválida${counts.invalid === 1 ? '' : 's'}`)

  function handleConfirm() {
    if (!canConfirm || loading) return
    void onConfirm({
      confirmTenantName: tenantName,
      createWorkplaces: newWorkplacesMode === 'create-all' ? newWorkplaces : [],
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-apply-title"
        className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4"
      >
        <h2 id="confirm-apply-title" className="text-lg font-bold text-white">
          Confirmar importação
        </h2>

        <div className="text-sm text-slate-300">Você está prestes a importar para:</div>
        <div className="rounded-lg bg-blue-500/15 border border-blue-500/40 px-4 py-3 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-300" aria-hidden="true" />
          <span className="text-lg font-bold text-white">{tenantName}</span>
        </div>

        {operations.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1.5">Operações</div>
            <ul className="space-y-1 text-sm text-slate-200 list-none">
              {operations.map((op, i) => (
                <li key={i}>• {op}</li>
              ))}
            </ul>
          </div>
        )}

        {requiresTyping && (
          <div className="space-y-1.5">
            <label htmlFor="confirm-tenant-input" className="text-sm text-slate-300 flex items-center gap-1.5">
              <span>Para confirmar, digite o nome do tenant:</span>
              <InfoTooltip text="Padrão GitHub-style: digitar o nome exato força atenção e reduz risco de aplicar no tenant errado. Case-sensitive." />
            </label>
            <input
              id="confirm-tenant-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={tenantName}
              aria-invalid={showMismatch || undefined}
              aria-describedby={showMismatch ? 'confirm-tenant-error' : undefined}
              className={`w-full px-3 py-2 rounded-lg bg-slate-800/60 border text-slate-100 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                showMismatch ? 'border-red-400' : matchesName ? 'border-green-500/40' : 'border-white/10'
              }`}
            />
            {showMismatch && (
              <div id="confirm-tenant-error" className="text-xs text-red-400">
                O nome não confere.
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-slate-500">
          Esta ação será auditada e não pode ser desfeita automaticamente.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Cancelar (Esc)
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/85 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {loading ? 'Aplicando…' : 'Confirmar e aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
