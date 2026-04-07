'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'

export default function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    tenantName: '',
    cnpj: '',
    adminName: '',
    email: '',
    password: ''
  })
  
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await HttpClient.post('/setup', formData)
      toast.success('Sistema inicializado com sucesso!')
      router.push('/auth/login')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao inicializar sistema.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dashboard px-4 py-12">
      {/* Background Decorative Blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />

      <div className="glass-card w-full max-w-2xl p-8 md:p-12 rounded-3xl relative z-10 border border-white/10">
        <div className="text-center mb-10">
          <div className="inline-block px-4 py-1.5 mb-6 text-xs font-semibold tracking-wider text-primary uppercase bg-primary/10 rounded-full border border-primary/20">
            Configuração Inicial
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Bem-vindo ao Gestão<span className="text-gradient">Férias</span>
          </h1>
          <p className="text-slate-400 max-w-md mx-auto">
            Identificamos que este é o seu primeiro acesso. Vamos configurar sua empresa e sua conta de administrador mestre.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Seção Empresa */}
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                Dados da Organização
              </h3>
              
              <div>
                <label htmlFor="tenantName" className="block text-sm font-medium text-slate-300 mb-2">
                  Nome da Empresa
                </label>
                <input
                  id="tenantName"
                  type="text"
                  required
                  value={formData.tenantName}
                  onChange={handleChange}
                  placeholder="Minha Empresa LTDA"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>

              <div>
                <label htmlFor="cnpj" className="block text-sm font-medium text-slate-300 mb-2">
                  CNPJ
                </label>
                <input
                  id="cnpj"
                  type="text"
                  required
                  value={formData.cnpj}
                  onChange={handleChange}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>
            </div>

            {/* Seção Admin */}
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                Administrador Mestre
              </h3>
              
              <div>
                <label htmlFor="adminName" className="block text-sm font-medium text-slate-300 mb-2">
                  Seu Nome Completo
                </label>
                <input
                  id="adminName"
                  type="text"
                  required
                  value={formData.adminName}
                  onChange={handleChange}
                  placeholder="João da Silva"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  E-mail de Acesso
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="admin@empresa.com"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Defina sua Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-4 rounded-2xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-primary/20 mt-8"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Configurando Sistema...
              </div>
            ) : (
              'Finalizar Configuração e Acessar'
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-500">
          Nota: Esta tela só é acessível enquanto o sistema não possui nenhum usuário cadastrado.
        </p>
      </div>
    </div>
  )
}
