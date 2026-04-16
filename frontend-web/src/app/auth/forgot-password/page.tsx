'use client'

import React, { useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await HttpClient.post('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      setSent(true) // Sempre mostrar sucesso (seguranca)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dashboard px-4">
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/10 rounded-full blur-3xl" />

      <div className="glass-card w-full max-w-md p-8 rounded-2xl relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Recuperar Senha</h1>
          <p className="text-slate-400 text-sm">
            Informe seu email e enviaremos um codigo para redefinir sua senha.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
              <p className="text-emerald-400 font-bold mb-2">Codigo enviado!</p>
              <p className="text-slate-400 text-sm">
                Se o email <strong className="text-white">{email}</strong> existir no sistema, voce recebera um codigo de 6 digitos.
              </p>
            </div>
            <Link
              href="/auth/reset-password"
              className="block w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all text-center"
            >
              Inserir Codigo
            </Link>
            <Link href="/auth/login" className="block text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                E-mail cadastrado
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar Codigo'}
            </button>

            <Link href="/auth/login" className="block text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Voltar ao login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
