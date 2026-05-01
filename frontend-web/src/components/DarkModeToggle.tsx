'use client'

import React, { useEffect, useState } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { useAuth } from './AuthContext'

export type ColorScheme = 'LIGHT' | 'DARK' | 'SYSTEM'

const LOCAL_KEY = 'colorScheme'

/**
 * Aplica a classe `dark`/`light` no <html> baseado em ColorScheme.
 * SYSTEM usa prefers-color-scheme do SO.
 */
function applyScheme(scheme: ColorScheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const effective = scheme === 'SYSTEM' ? (prefersDark ? 'DARK' : 'LIGHT') : scheme
  root.classList.toggle('dark', effective === 'DARK')
  root.classList.toggle('light', effective === 'LIGHT')
  root.dataset.theme = effective.toLowerCase()
}

/**
 * Toggle de Light/Dark/System (FR-V31-BRAND-004).
 * Persiste no backend (User.colorScheme) e em localStorage para evitar flash.
 */
export function DarkModeToggle({ className = '' }: { className?: string }) {
  const { user } = useAuth()
  const [scheme, setScheme] = useState<ColorScheme>(() => {
    if (typeof window === 'undefined') return 'SYSTEM'
    return (localStorage.getItem(LOCAL_KEY) as ColorScheme) || 'SYSTEM'
  })

  // Sincroniza com o backend quando user carrega
  useEffect(() => {
    const userScheme = (user as any)?.colorScheme as ColorScheme | undefined
    if (userScheme && userScheme !== scheme) {
      setScheme(userScheme)
      localStorage.setItem(LOCAL_KEY, userScheme)
    }
  }, [user])

  // Aplica a classe e observa mudanças do SO
  useEffect(() => {
    applyScheme(scheme)
    if (scheme !== 'SYSTEM') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyScheme('SYSTEM')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [scheme])

  const change = async (next: ColorScheme) => {
    setScheme(next)
    localStorage.setItem(LOCAL_KEY, next)
    applyScheme(next)
    // Só persiste se user autenticado
    if (user) {
      try { await HttpClient.patch('/auth/me/preferences', { colorScheme: next }) }
      catch { /* falha silenciosa — localStorage já garante persistência local */ }
    }
  }

  const options: { value: ColorScheme; icon: React.ElementType; label: string }[] = [
    { value: 'LIGHT', icon: Sun, label: 'Claro (beta — alguns componentes ainda em refinamento)' },
    { value: 'DARK', icon: Moon, label: 'Escuro' },
    { value: 'SYSTEM', icon: Monitor, label: 'Sistema (usa preferência do SO)' }
  ]

  return (
    <div className={`inline-flex items-center gap-0.5 bg-slate-900/60 border border-white/5 rounded-md p-0.5 ${className}`} role="radiogroup" aria-label="Tema">
      {options.map(opt => {
        const Icon = opt.icon
        const active = scheme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => change(opt.value)}
            role="radio"
            aria-checked={active}
            title={opt.label}
            className={`p-1.5 rounded transition-colors ${active ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Script inline que aplica o tema ANTES do React montar (evita flash).
 * Usar dentro de <head> via dangerouslySetInnerHTML.
 */
export const themeInitScript = `(function(){try{
  var s = localStorage.getItem('${LOCAL_KEY}') || 'SYSTEM';
  var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var eff = s === 'SYSTEM' ? (d ? 'DARK' : 'LIGHT') : s;
  document.documentElement.classList.toggle('dark', eff === 'DARK');
  document.documentElement.classList.toggle('light', eff === 'LIGHT');
  document.documentElement.dataset.theme = eff.toLowerCase();
}catch(e){}})();`
