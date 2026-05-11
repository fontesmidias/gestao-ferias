'use client'

import React, { useState } from 'react'
import { Building2, Briefcase, Clock, ShieldCheck, Database } from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LookupAdminTable, type LookupAdminConfig } from '@/components/admin/LookupAdminTable'

/**
 * V3.5 Stories 5.1.2 + 5.2.2 + 5.3.2 + 5.4.2:
 * Pagina unica para administrar os 4 cadastros relacionais que substituem
 * os campos string legados em Employee.
 */

type TabKey = 'branches' | 'departments' | 'shifts' | 'unions'

const TABS: Array<{ key: TabKey; label: string; icon: any; config: LookupAdminConfig }> = [
  {
    key: 'branches', label: 'Filiais', icon: Building2,
    config: {
      endpoint: '/branches',
      singularLabel: 'Filial', pluralLabel: 'Filiais',
      helpText: 'Empresas/filiais às quais os colaboradores estão vinculados contratualmente.',
      extras: [
        { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
        { key: 'legalName', label: 'Razão Social', placeholder: 'Razão social completa' },
      ],
    },
  },
  {
    key: 'departments', label: 'Departamentos', icon: Briefcase,
    config: {
      endpoint: '/departments',
      singularLabel: 'Departamento', pluralLabel: 'Departamentos',
      helpText: 'Departamentos / centros de custo / contratos onde o colaborador atua.',
    },
  },
  {
    key: 'shifts', label: 'Escalas', icon: Clock,
    config: {
      endpoint: '/shifts',
      singularLabel: 'Escala', pluralLabel: 'Escalas',
      helpText: 'Padrões de jornada (12x36, 8h, 6x1, etc).',
      extras: [
        { key: 'pattern', label: 'Padrão', placeholder: 'Ex: 12x36, 8H, 6x1' },
        { key: 'startTime', label: 'Início', placeholder: '08:00', type: 'time' },
        { key: 'endTime', label: 'Fim', placeholder: '18:00', type: 'time' },
      ],
    },
  },
  {
    key: 'unions', label: 'Sindicatos', icon: ShieldCheck,
    config: {
      endpoint: '/unions',
      singularLabel: 'Sindicato', pluralLabel: 'Sindicatos',
      helpText: 'Sindicatos aos quais os colaboradores são vinculados.',
      extras: [
        { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
        { key: 'category', label: 'Categoria', placeholder: 'Ex: SINDISERVICOS' },
      ],
    },
  },
]

export default function CadastrosPage() {
  const [tab, setTab] = useState<TabKey>('branches')
  const active = TABS.find(t => t.key === tab) ?? TABS[0]

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-6xl mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Database className="w-8 h-8 text-primary" />
              Cadastros base
              <InfoTooltip text="Cadastros estruturais que substituem os campos de texto livre dos colaboradores (filial, departamento, escala, sindicato)." />
            </h2>
            <p className="text-slate-400 mt-2">Filiais, departamentos, escalas e sindicatos. Cada colaborador é vinculado a um registro real (não mais texto livre).</p>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-white/5">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = t.key === tab
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                  isActive
                    ? 'border-primary text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            )
          })}
        </div>

        <ErrorBoundary>
          <div className="glass-card rounded-2xl border border-white/5 p-5">
            <LookupAdminTable config={active.config} />
          </div>
        </ErrorBoundary>
      </main>
    </div>
  )
}
