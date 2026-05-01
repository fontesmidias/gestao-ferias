'use client'

import React, { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthContext'
import { SessionCountdown } from '@/components/SessionCountdown'
import { DarkModeToggle } from '@/components/DarkModeToggle'
import { markActivity } from '@/lib/session-activity'

/**
 * Barra flutuante no canto superior direito com o cronômetro de sessão.
 * Posicionada abaixo do Toaster do sonner (top-right também). Discreta e sempre visível.
 */
export function SessionTopbar() {
  const pathname = usePathname()
  const { user, loading, logout } = useAuth()

  // Atividade do usuário também reseta o timer. Throttle de 10s para não floodar.
  useEffect(() => {
    if (!user) return
    let lastMark = Date.now() // marca já na montagem — evita expirar logo ao abrir uma aba
    markActivity()
    const handler = () => {
      const now = Date.now()
      if (now - lastMark > 10_000) {
        lastMark = now
        markActivity()
      }
    }
    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'click',
      'keydown', 'input',
      'scroll', 'wheel',
      'touchstart', 'touchmove',
      'focus'
    ]
    events.forEach(ev => window.addEventListener(ev, handler, { passive: true, capture: true }))
    return () => {
      events.forEach(ev => window.removeEventListener(ev, handler, { capture: true } as any))
    }
  }, [user])

  // Esconde em telas de auth e quando não autenticado
  if (loading || !user) return null
  if (pathname === '/' || pathname.startsWith('/auth')) return null

  return (
    <div className="fixed top-2 right-3 z-40 pointer-events-none flex items-center gap-2">
      <div className="pointer-events-auto">
        <DarkModeToggle />
      </div>
      <div className="pointer-events-auto rounded-md bg-slate-900/80 backdrop-blur-sm border border-white/5 px-2.5 py-1 shadow-sm">
        <SessionCountdown onExpire={() => logout()} warnAtSeconds={60} />
      </div>
    </div>
  )
}
