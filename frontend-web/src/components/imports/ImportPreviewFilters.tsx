'use client'

import type { PreviewCounts, RowCategory } from '@/lib/imports/types'

interface ChipDef {
  value: RowCategory | 'all'
  label: string
}

const CHIPS: ChipDef[] = [
  { value: 'all', label: 'Todos' },
  { value: 'create', label: 'Criar' },
  { value: 'update', label: 'Atualizar' },
  { value: 'invalid', label: 'Inválido' },
  { value: 'absent', label: 'Ausente' },
  { value: 'reactivation', label: 'Reativação' },
  { value: 'unchanged', label: 'Sem alterações' },
]

interface ImportPreviewFiltersProps {
  counts: PreviewCounts
  totalRows: number
  active: RowCategory | 'all'
  onChange: (value: RowCategory | 'all') => void
}

export function ImportPreviewFilters({ counts, totalRows, active, onChange }: ImportPreviewFiltersProps) {
  function countFor(value: RowCategory | 'all'): number {
    if (value === 'all') return totalRows
    return counts[value] ?? 0
  }

  return (
    <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Filtrar por status">
      {CHIPS.map((chip) => {
        const isActive = chip.value === active
        const n = countFor(chip.value)
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(chip.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
              isActive
                ? 'bg-primary text-white'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            <span>{chip.label}</span>
            <span className={`ml-1.5 ${isActive ? 'text-white/85' : 'text-slate-500'}`}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}
