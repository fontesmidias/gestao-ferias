'use client'

import React, { useState } from 'react'
import { useAuth } from '@/components/AuthContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { login } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await login(email)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dashboard px-4">
      {/* Background Decorative Blobs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/10 rounded-full blur-3xl" />

      <div className="glass-card w-full max-w-md p-8 rounded-2xl relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Gestão<span className="text-gradient">Férias</span>
          </h1>
          <p className="text-slate-400 text-sm">
            O futuro da sua gestão de RH, hoje.
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                E-mail corporativo
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@empresa.com"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Enviando link...
                </div>
              ) : (
                'Acessar plataforma'
              )}
            </button>
          </form>
        ) : (
          <div className="text-center py-6 animate-in fade-in zoom-in duration-500">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Link enviado!</h2>
            <p className="text-slate-400">
              Enviamos um link de acesso para <strong>{email}</strong>. Por favor, verifique sua caixa de entrada.
            </p>
            <button 
              onClick={() => setSent(false)} 
              className="mt-8 text-primary hover:underline text-sm font-medium"
            >
              Tentar com outro e-mail
            </button>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            Ao entrar, você concorda com nossos <a href="#" className="hover:text-slate-300 underline">Termos de Uso</a> e <a href="#" className="hover:text-slate-300 underline">Privacidade</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
