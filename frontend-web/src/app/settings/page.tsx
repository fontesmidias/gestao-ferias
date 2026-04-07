'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Settings, Save, Server, Building2, KeyRound } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'

export default function SettingsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    openaiKey: '',
    anthropicKey: '',
    geminiKey: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: ''
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const data = await HttpClient.get('/tenants/settings')
      setFormData({
        openaiKey: data.openaiKey || '',
        anthropicKey: data.anthropicKey || '',
        geminiKey: data.geminiKey || '',
        smtpHost: data.smtpHost || '',
        smtpPort: data.smtpPort || '',
        smtpUser: data.smtpUser || '',
        smtpPass: data.smtpPass || '',
        smtpFrom: data.smtpFrom || ''
      })
    } catch (err) {
      console.error(err)
      toast.error("Falha ao carregar configurações.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      await HttpClient.patch('/tenants/settings', formData)
      toast.success("Configurações atualizadas com sucesso!")
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar configurações.")
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Você não tem permissão para acessar esta página.
      </div>
    )
  }

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-4xl mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Settings className="w-8 h-8 text-primary" />
              Configurações do Tenant
            </h2>
            <p className="text-slate-400 mt-2">Gerencie as integrações da sua Empresa Mestre.</p>
          </div>
        </div>

        <ErrorBoundary>
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Oráculo AI Settings */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <KeyRound className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Chaves do Oráculo (LLMs)</h3>
                  <p className="text-sm text-slate-400">Configure as APIs para liberar a Inteligência Artificial no módulo Predict.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label htmlFor="openaiKey" className="block text-sm font-medium text-slate-300 mb-2">
                    OpenAI API Key (GPT-4o)
                  </label>
                  <input
                    id="openaiKey"
                    type="password"
                    value={formData.openaiKey}
                    onChange={handleChange}
                    placeholder="sk-proj-..."
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="anthropicKey" className="block text-sm font-medium text-slate-300 mb-2">
                    Anthropic API Key (Claude 3.5)
                  </label>
                  <input
                    id="anthropicKey"
                    type="password"
                    value={formData.anthropicKey}
                    onChange={handleChange}
                    placeholder="sk-ant-api03-..."
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="geminiKey" className="block text-sm font-medium text-slate-300 mb-2">
                    Google Gemini API Key (Gemini 1.5 Pro)
                  </label>
                  <input
                    id="geminiKey"
                    type="password"
                    value={formData.geminiKey}
                    onChange={handleChange}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            {/* SMTP Settings */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                <div className="p-2 bg-rose-500/20 rounded-lg">
                  <Server className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Servidor de E-mail (SMTP)</h3>
                  <p className="text-sm text-slate-400">Configure o disparador automático de aprovações e assinaturas.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="smtpHost" className="block text-sm font-medium text-slate-300 mb-2">Servidor SMTP</label>
                  <input
                    id="smtpHost"
                    type="text"
                    value={formData.smtpHost}
                    onChange={handleChange}
                    placeholder="smtp.empresa.com"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="smtpPort" className="block text-sm font-medium text-slate-300 mb-2">Porta</label>
                  <input
                    id="smtpPort"
                    type="number"
                    value={formData.smtpPort}
                    onChange={handleChange}
                    placeholder="465"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                  />
                </div>
                <div className="col-span-full">
                  <label htmlFor="smtpFrom" className="block text-sm font-medium text-slate-300 mb-2">E-mail Remetente (From)</label>
                  <input
                    id="smtpFrom"
                    type="email"
                    value={formData.smtpFrom}
                    onChange={handleChange}
                    placeholder="no-reply@suaempresa.com"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="smtpUser" className="block text-sm font-medium text-slate-300 mb-2">Usuário SMTP</label>
                  <input
                    id="smtpUser"
                    type="text"
                    value={formData.smtpUser}
                    onChange={handleChange}
                    placeholder="usuario@dominio.com"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="smtpPass" className="block text-sm font-medium text-slate-300 mb-2">Senha SMTP</label>
                  <input
                    id="smtpPass"
                    type="password"
                    value={formData.smtpPass}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 mb-12">
              <button
                type="submit"
                disabled={loading || saving}
                className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {saving ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
            
          </form>
        </ErrorBoundary>
      </main>
    </div>
  )
}
