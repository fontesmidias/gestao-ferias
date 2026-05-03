'use client'

import { Database, X } from 'lucide-react'

interface ImportTenantBannerProps {
  tenantName: string
  onCancel: () => void
  /** Esconde o botão de cancelar (D5: apply é commit point — não permitir cancel durante APPLYING). */
  cancelHidden?: boolean
}

export function ImportTenantBanner({ tenantName, onCancel, cancelHidden = false }: ImportTenantBannerProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-30 h-10 bg-blue-600 text-white px-4 flex items-center justify-between shadow-md animate-in slide-in-from-top duration-200"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Database className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-wide opacity-85 shrink-0">
          Importando para:
        </span>
        <span className="text-lg font-bold truncate" title={tenantName}>
          {tenantName}
        </span>
      </div>
      {!cancelHidden && (
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600 transition-colors"
          aria-label="Cancelar importação"
        >
          <X className="w-4 h-4" aria-hidden="true" />
          <span>Cancelar</span>
        </button>
      )}
    </div>
  )
}
