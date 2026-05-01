'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { toast } from 'sonner'
import { getRemainingMs, getIdleTimeoutMs } from '@/lib/session-activity'
import { useTranslation } from '@/lib/i18n'

interface Props {
  /** Callback ao expirar (ex: logout). */
  onExpire?: () => void
  /** Quantos segundos antes de expirar exibir aviso. Default 60s. */
  warnAtSeconds?: number
  /** Mostrar label completo ("Esta sessão expira em mm:ss"). Default true. */
  showLabel?: boolean
  className?: string
}

/**
 * Cronômetro regressivo de inatividade da sessão (FR-V31-SES-001).
 *
 * - Reseta a cada chamada HTTP bem-sucedida (via session-activity.ts)
 * - Aviso visual aos `warnAtSeconds` antes de zerar (toast warning)
 * - Quando zera, dispara `onExpire` (geralmente logout)
 *
 * Permanente e discreto no rodapé da Sidebar para que o usuário NUNCA seja
 * deslogado sem aviso.
 */
export function SessionCountdown({
  onExpire,
  warnAtSeconds = 60,
  showLabel = true,
  className = ''
}: Props) {
  const { t } = useTranslation()
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => Math.floor(getRemainingMs() / 1000))
  const warnedRef = useRef(false)
  const expiredRef = useRef(false)

  useEffect(() => {
    const tick = () => {
      const ms = getRemainingMs()
      const s = Math.floor(ms / 1000)
      setSecondsRemaining(s)

      if (s <= warnAtSeconds && s > 0 && !warnedRef.current) {
        warnedRef.current = true
        toast.warning(t('session.warning', { seconds: s }), { duration: 8000 })
      }
      // Re-arma o aviso quando voltar a sessão "cheia" após atividade
      if (s > warnAtSeconds + 10 && warnedRef.current) {
        warnedRef.current = false
      }

      if (s === 0 && !expiredRef.current) {
        expiredRef.current = true
        toast.error(t('session.expiredLogout'), { duration: 6000 })
        onExpire?.()
      }
      if (s > 0 && expiredRef.current) {
        expiredRef.current = false
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [warnAtSeconds, onExpire])

  const totalSeconds = Math.floor(getIdleTimeoutMs() / 1000)
  const mm = Math.floor(secondsRemaining / 60).toString().padStart(2, '0')
  const ss = (secondsRemaining % 60).toString().padStart(2, '0')

  // Cor: cinza > amarelo (≤ 2× warn) > vermelho (≤ warn)
  const color =
    secondsRemaining <= warnAtSeconds ? 'text-rose-400' :
    secondsRemaining <= warnAtSeconds * 2 ? 'text-amber-400' :
    'text-slate-500'

  return (
    <div
      className={`inline-flex items-center gap-1 text-[10px] font-mono ${color} ${className}`}
      title={`Tempo total de inatividade permitido: ${Math.floor(totalSeconds / 60)} min`}
      aria-live="polite"
    >
      <Clock className="w-3 h-3" />
      {showLabel ? (
        <span>{t('session.expiresIn')} <strong>{mm}:{ss}</strong></span>
      ) : (
        <span>{mm}:{ss}</span>
      )}
    </div>
  )
}
