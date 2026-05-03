'use client'

import { Plus, Pencil, AlertTriangle, UserMinus, RotateCcw, Minus } from 'lucide-react'
import type { RowCategory } from '@/lib/imports/types'

interface BadgeStyle {
  Icon: typeof Plus
  label: string
  className: string
}

const STYLES: Record<RowCategory, BadgeStyle> = {
  create: {
    Icon: Plus,
    label: 'Criar',
    className: 'bg-green-500/15 text-green-300 border border-green-500/30',
  },
  update: {
    Icon: Pencil,
    label: 'Atualizar',
    className: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  },
  invalid: {
    Icon: AlertTriangle,
    label: 'Inválido',
    className: 'bg-red-500/15 text-red-300 border border-red-500/30',
  },
  absent: {
    Icon: UserMinus,
    label: 'Ausente',
    className: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  },
  reactivation: {
    Icon: RotateCcw,
    label: 'Reativação',
    className: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
  },
  unchanged: {
    Icon: Minus,
    label: 'Sem alterações',
    className: 'bg-slate-700/30 text-slate-400 border border-slate-700/50',
  },
}

export interface ImportStatusBadgeProps {
  status: RowCategory
  className?: string
}

export function ImportStatusBadge({ status, className = '' }: ImportStatusBadgeProps) {
  const s = STYLES[status]
  if (!s) return null
  const { Icon, label } = s
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.className} ${className}`}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

export const STATUS_LABELS: Record<RowCategory, string> = Object.fromEntries(
  (Object.entries(STYLES) as [RowCategory, BadgeStyle][]).map(([k, v]) => [k, v.label]),
) as Record<RowCategory, string>
