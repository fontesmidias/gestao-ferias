'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HttpClient } from '@/lib/api-client'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'
import { Shield } from 'lucide-react'

export default function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', password: '' })
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await HttpClient.post('/setup', formData)
      toast.success('Super Administrador criado com sucesso!')
      router.push('/auth/login')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao inicializar sistema.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dashboard px-4 py-12">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />

      <div className="glass-card w-full max-w-md p-8 md:p-10 rounded-3xl relative z-10 border border-white/10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 rounded-2xl flex items-center justify-center">
            <Shield className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Gestao<span className="text-gradient">Ferias</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Primeiro acesso. Crie a conta do Super Administrador para gerenciar toda a plataforma.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
              Nome completo *
              <InfoTooltip text="Nome do responsavel pela plataforma. Tera acesso total para criar empresas, usuarios e gerenciar tudo." />
            </label>
            <input
              type="text" required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
              placeholder="Seu nome completo"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
              Email *
              <InfoTooltip text="Email usado para login do Super Administrador. Nao esta vinculado a nenhuma empresa especifica." />
            </label>
            <input
              type="email" required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
              placeholder="admin@suaempresa.com"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
              Senha *
              <InfoTooltip text="Senha segura para o Super Administrador. Recomendamos no minimo 8 caracteres com letras, numeros e simbolos." />
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'} required minLength={6}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 pr-12 text-white focus:border-primary focus:outline-none"
                placeholder="Minimo 6 caracteres"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xl"
              >
                {showPassword ? '🐵' : '🙈'}
              </button>
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <Shield className="w-5 h-5" />
            )}
            {loading ? 'Criando...' : 'Criar Super Administrador'}
          </button>
        </form>

        <p className="text-xs text-slate-600 text-center mt-6">
          Apos criar o Super Admin, voce podera cadastrar empresas e usuarios pelo painel.
        </p>
      </div>
    </div>
  )
}
