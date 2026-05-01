'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import ptBR from '@/messages/pt-BR.json'
import en from '@/messages/en.json'
import es from '@/messages/es.json'

export type Locale = 'pt-BR' | 'en' | 'es'
export const LOCALES: Locale[] = ['pt-BR', 'en', 'es']
const LOCAL_KEY = 'preferredLocale'

const bundles: Record<Locale, any> = { 'pt-BR': ptBR, en, es }

/** Resolve chave tipo "sidebar.dashboard" no bundle. Retorna a própria chave se não existir. */
function resolve(bundle: any, key: string): string {
  const parts = key.split('.')
  let cur = bundle
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p]
    else return key
  }
  return typeof cur === 'string' ? cur : key
}

/** Interpola {variáveis} no texto traduzido. */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`))
}

interface I18nCtx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nCtx>({
  locale: 'pt-BR',
  setLocale: () => {},
  t: (k) => k
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'pt-BR'
    const stored = localStorage.getItem(LOCAL_KEY) as Locale | null
    return stored && LOCALES.includes(stored) ? stored : 'pt-BR'
  })

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    if (typeof window !== 'undefined') localStorage.setItem(LOCAL_KEY, l)
    if (typeof document !== 'undefined') document.documentElement.lang = l
    // Persiste no backend de forma silenciosa (não-crítico)
    if (typeof window !== 'undefined' && localStorage.getItem('token')) {
      import('@/lib/api-client').then(({ HttpClient }) => {
        HttpClient.patch('/auth/me/preferences', { preferredLocale: l }).catch(() => {})
      })
    }
  }, [])

  // Aplica lang HTML no mount
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale
  }, [locale])

  // Sincroniza com backend apenas se o usuário NUNCA definiu locale localmente.
  // Evita sobrescrever escolha explícita com o default do servidor.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(LOCAL_KEY)) return // já tem escolha local — intento do usuário vence
    const token = localStorage.getItem('token')
    if (!token) return
    import('@/lib/api-client').then(({ HttpClient }) => {
      HttpClient.get('/auth/me').then((me: any) => {
        const server = me?.preferredLocale as Locale | undefined
        if (server && LOCALES.includes(server)) {
          setLocaleState(server)
          localStorage.setItem(LOCAL_KEY, server)
          document.documentElement.lang = server
        }
      }).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza entre abas via storage event
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === LOCAL_KEY && e.newValue && LOCALES.includes(e.newValue as Locale)) {
        setLocaleState(e.newValue as Locale)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const raw = resolve(bundles[locale], key)
    return interpolate(raw, params)
  }, [locale])

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export function useTranslation() {
  return useContext(I18nContext)
}
