'use client'
import { useAuth } from '@/components/AuthContext'

export function ImpersonationBanner() {
  const { isImpersonating, returnToAdmin, user } = useAuth()
  if (!isImpersonating) return null

  return (
    <div className="bg-amber-500 text-black px-4 py-2 flex items-center justify-between text-sm font-bold z-50">
      <span>Visualizando empresa como administrador</span>
      <button onClick={returnToAdmin} className="bg-black/20 hover:bg-black/30 px-3 py-1 rounded-lg text-xs font-bold transition-colors">
        Sair e Voltar ao Admin
      </button>
    </div>
  )
}
