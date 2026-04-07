'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'

export default function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [formData, setFormData] = useState({
    tenantName: '',
    cnpj: '',
    adminName: '',
    email: '',
    password: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: ''
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
                  Nome da Empresa <span className="text-red-500">*</span>
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
                  CNPJ <span className="text-red-500">*</span>
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
                  Seu Nome Completo <span className="text-red-500">*</span>
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
                  E-mail de Acesso <span className="text-red-500">*</span>
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
                  Defina sua Senha <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl hover:scale-110 transition-transform focus:outline-none"
                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showPassword ? "🐵" : "🙈"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Seção SMTP (Opcional) */}
          <div className="space-y-6 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                [Opcional] Configurações de E-mail (SMTP)
              </h3>
              <span className="text-xs text-slate-500">Para envio de alertas</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="smtpHost" className="block text-xs font-medium text-slate-400 mb-1">Servidor SMTP</label>
                <input
                  id="smtpHost"
                  type="text"
                  value={formData.smtpHost}
                  onChange={handleChange}
                  placeholder="smtp.zoho.com"
                  className="w-full bg-slate-900/30 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-primary/50 outline-none"
                />
              </div>
              <div>
                <label htmlFor="smtpPort" className="block text-xs font-medium text-slate-400 mb-1">Porta SMTP</label>
                <input
                  id="smtpPort"
                  type="number"
                  value={formData.smtpPort}
                  onChange={handleChange}
                  placeholder="465"
                  className="w-full bg-slate-900/30 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-primary/50 outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="smtpFrom" className="block text-xs font-medium text-slate-400 mb-1">E-mail Remetente (From)</label>
                <input
                  id="smtpFrom"
                  type="email"
                  value={formData.smtpFrom}
                  onChange={handleChange}
                  placeholder="nao-responda@empresa.com"
                  className="w-full bg-slate-900/30 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-primary/50 outline-none"
                />
              </div>
              <div>
                <label htmlFor="smtpUser" className="block text-xs font-medium text-slate-400 mb-1">Usuário SMTP</label>
                <input
                  id="smtpUser"
                  type="text"
                  value={formData.smtpUser}
                  onChange={handleChange}
                  placeholder="seu-email@empresa.com"
                  className="w-full bg-slate-900/30 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-primary/50 outline-none"
                />
              </div>
              <div>
                <label htmlFor="smtpPass" className="block text-xs font-medium text-slate-400 mb-1">Senha SMTP</label>
                <div className="relative">
                  <input
                    id="smtpPass"
                    type={showSmtpPass ? "text" : "password"}
                    value={formData.smtpPass}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/30 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-sm text-white focus:border-primary/50 outline-none"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowSmtpPass(!showSmtpPass)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform focus:outline-none"
                    title={showSmtpPass ? "Ocultar senha" : "Ver senha"}
                  >
                    {showSmtpPass ? "🐵" : "🙈"}
                  </button>
                </div>
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
