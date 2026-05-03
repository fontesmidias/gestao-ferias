'use client'

import { useEffect, useRef } from 'react'

interface ImportConfirmCancelModalProps {
  open: boolean
  onConfirm: () => void
  onClose: () => void
  loading?: boolean
}

export function ImportConfirmCancelModal({
  open,
  onConfirm,
  onClose,
  loading = false,
}: ImportConfirmCancelModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const keepBtnRef = useRef<HTMLButtonElement>(null)

  // Focus trap básico + default focus no botão "Manter".
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    keepBtnRef.current?.focus()

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-import-title"
        className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4"
      >
        <h2 id="cancel-import-title" className="text-lg font-bold text-white">
          Cancelar importação?
        </h2>
        <p className="text-sm text-slate-300">
          Tem certeza? Nenhum dado foi alterado.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            ref={keepBtnRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Manter
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            {loading ? 'Cancelando…' : 'Cancelar importação'}
          </button>
        </div>
      </div>
    </div>
  )
}
