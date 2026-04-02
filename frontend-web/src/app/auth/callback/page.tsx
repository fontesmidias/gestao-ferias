'use client'

import { useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthContext'

function AuthCallbackHandler() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { verifyToken } = useAuth()
  const called = useRef(false)

  useEffect(() => {
    if (token && !called.current) {
      called.current = true
      verifyToken(token)
    }
  }, [token, verifyToken])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-dashboard px-4 text-center">
      <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-8" />
      <h1 className="text-2xl font-bold text-white mb-2">Verificando sua identidade...</h1>
      <p className="text-slate-400">Você será redirecionado em instantes.</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dashboard flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <AuthCallbackHandler />
    </Suspense>
  )
}
