'use client'

import React from 'react'
import { useTranslation, Locale, LOCALES } from '@/lib/i18n'

/** Bandeiras SVG inline (não emoji — inconsistente cross-OS). */
const flags: Record<Locale, React.ReactElement> = {
  'pt-BR': (
    <svg viewBox="0 0 20 14" className="w-5 h-3.5 rounded-sm overflow-hidden" aria-hidden>
      <rect width="20" height="14" fill="#009c3b" />
      <polygon points="10,2 18,7 10,12 2,7" fill="#ffdf00" />
      <circle cx="10" cy="7" r="2.5" fill="#002776" />
    </svg>
  ),
  en: (
    <svg viewBox="0 0 20 14" className="w-5 h-3.5 rounded-sm overflow-hidden" aria-hidden>
      <rect width="20" height="14" fill="#012169" />
      <path d="M0,0 L20,14 M20,0 L0,14" stroke="#fff" strokeWidth="2.8" />
      <path d="M0,0 L20,14 M20,0 L0,14" stroke="#c8102e" strokeWidth="1.2" />
      <path d="M10,0 L10,14 M0,7 L20,7" stroke="#fff" strokeWidth="4" />
      <path d="M10,0 L10,14 M0,7 L20,7" stroke="#c8102e" strokeWidth="2.4" />
    </svg>
  ),
  es: (
    <svg viewBox="0 0 20 14" className="w-5 h-3.5 rounded-sm overflow-hidden" aria-hidden>
      <rect width="20" height="14" fill="#c60b1e" />
      <rect y="3.5" width="20" height="7" fill="#ffc400" />
    </svg>
  )
}

const labels: Record<Locale, string> = {
  'pt-BR': 'PT-BR',
  en: 'EN',
  es: 'ES'
}

export function LocaleToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation()
  return (
    <div className={`inline-flex items-center gap-0.5 bg-slate-900/60 border border-white/5 rounded-md p-0.5 ${className}`} role="radiogroup" aria-label="Idioma">
      {LOCALES.map(loc => {
        const active = locale === loc
        return (
          <button
            key={loc}
            type="button"
            onClick={() => setLocale(loc)}
            role="radio"
            aria-checked={active}
            title={t(`locale.${loc === 'pt-BR' ? 'ptBR' : loc}`)}
            className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${active ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {flags[loc]}
            <span className="text-[10px] font-bold">{labels[loc]}</span>
          </button>
        )
      })}
    </div>
  )
}
