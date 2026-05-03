'use client'

import { Sparkles } from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import type { NewWorkplacesMode } from '@/lib/imports/types'

interface ImportNewWorkplacesBlockProps {
  newWorkplaces: string[]
  mode: NewWorkplacesMode
  onChange: (mode: NewWorkplacesMode) => void
}

export function ImportNewWorkplacesBlock({
  newWorkplaces,
  mode,
  onChange,
}: ImportNewWorkplacesBlockProps) {
  if (newWorkplaces.length === 0) return null

  return (
    <div className="rounded-lg border-l-4 border-blue-500 bg-blue-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm text-blue-200">
        <Sparkles className="w-4 h-4" aria-hidden="true" />
        <span className="font-medium">Lotações novas detectadas:</span>
        <span className="font-bold">{newWorkplaces.join(', ')}</span>
        <InfoTooltip text="Lotações são gerenciadas em /workplaces. Decidir caso a caso é mais seguro em re-imports." />
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="sr-only">Como tratar lotações novas</legend>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="radio"
            name="newWorkplacesMode"
            value="create-all"
            checked={mode === 'create-all'}
            onChange={() => onChange('create-all')}
            className="accent-primary"
          />
          Criar todas automaticamente
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="radio"
            name="newWorkplacesMode"
            value="decide-each"
            checked={mode === 'decide-each'}
            onChange={() => onChange('decide-each')}
            className="accent-primary"
          />
          Decidir caso a caso na aplicação
        </label>
      </fieldset>
    </div>
  )
}
