'use client'

import { Plus, Pencil, AlertTriangle, UserMinus, RotateCcw, Minus } from 'lucide-react'
import type { PreviewCounts } from '@/lib/imports/types'

interface CardDef {
  key: keyof PreviewCounts
  label: string
  Icon: typeof Plus
  iconClass: string
}

const CARDS: CardDef[] = [
  { key: 'create', label: 'Criar', Icon: Plus, iconClass: 'text-green-400' },
  { key: 'update', label: 'Atualizar', Icon: Pencil, iconClass: 'text-amber-400' },
  { key: 'invalid', label: 'Inválido', Icon: AlertTriangle, iconClass: 'text-red-400' },
  { key: 'absent', label: 'Ausente', Icon: UserMinus, iconClass: 'text-slate-400' },
  { key: 'reactivation', label: 'Reativação', Icon: RotateCcw, iconClass: 'text-purple-400' },
  { key: 'unchanged', label: 'Sem alterações', Icon: Minus, iconClass: 'text-slate-500' },
]

interface ImportPreviewCountsProps {
  counts: PreviewCounts
}

export function ImportPreviewCounts({ counts }: ImportPreviewCountsProps) {
  return (
    <div
      role="group"
      aria-label="Resumo do preview"
      className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
    >
      {CARDS.map(({ key, label, Icon, iconClass }) => (
        <div
          key={key}
          role="status"
          className="rounded-lg border border-white/5 bg-slate-800/50 p-3 flex items-center gap-3"
        >
          <Icon className={`w-5 h-5 shrink-0 ${iconClass}`} aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-2xl font-bold text-white leading-tight">{counts[key] ?? 0}</div>
            <div className="text-[11px] text-slate-400 truncate">{label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
