'use client'

import React, { useState } from 'react'
import { 
  Plus, 
  Settings, 
  Webhook as WebhookIcon, 
  Trash2, 
  Check, 
  Copy,
  Zap,
  ShieldCheck,
  Code
} from 'lucide-react'
import { toast } from 'sonner'

const mockWebhooks = [
  { id: '1', url: 'https://hooks.zapier.com/123/456', events: ['VACATION_SIGNED'], active: true, secret: 'sk_test_51...abc' },
]

export default function SettingsPage() {
  const [webhooks, setWebhooks] = useState(mockWebhooks)
  const [newUrl, setNewUrl] = useState('')

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado para a área de transferência!')
  }

  const addWebhook = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl) return
    
    const newHook = {
      id: Math.random().toString(),
      url: newUrl,
      events: ['VACATION_SIGNED'],
      active: true,
      secret: 'sk_live_' + Math.random().toString(36).substring(7)
    }
    
    setWebhooks([...webhooks, newHook])
    setNewUrl('')
    toast.success('Webhook configurado com sucesso!')
  }

  return (
    <div className="min-h-screen bg-dashboard text-slate-200 pb-12 pt-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">Configurações</h1>
            <p className="text-slate-400">Gerencie suas integrações e segurança.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Navigation Sidebar */}
          <div className="space-y-2">
            <button className="w-full text-left px-4 py-3 rounded-xl bg-primary/10 text-primary font-bold flex items-center gap-3 transition-all">
              <WebhookIcon className="w-5 h-5" />
              Webhooks & API
            </button>
            <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-slate-400 flex items-center gap-3 transition-all">
              <ShieldCheck className="w-5 h-5" />
              Segurança
            </button>
            <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-slate-400 flex items-center gap-3 transition-all">
              <Zap className="w-5 h-5" />
              Automações
            </button>
          </div>

          {/* Main Content */}
          <div className="md:col-span-2 space-y-8">
            {/* New Webhook Card */}
            <div className="glass-card p-6 rounded-2xl border border-white/5">
              <div className="flex items-center gap-2 mb-6">
                <Code className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Adicionar Novo Webhook</h2>
              </div>
              
              <form onSubmit={addWebhook} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Endpoint URL</label>
                  <input 
                    type="url" 
                    placeholder="https://sua-api.com/webhook" 
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                
                <div className="flex flex-wrap gap-4 mb-4">
                  <EventCheckbox label="Assinatura de Férias" checked />
                  <EventCheckbox label="Novo Colaborador" />
                  <EventCheckbox label="Ajuste de Saldo" />
                </div>

                <button 
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-primary/20"
                >
                  <Plus className="w-5 h-5" />
                  Configurar Webhook
                </button>
              </form>
            </div>

            {/* List Webhooks */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase px-2">Webhooks Ativos</h3>
              
              {webhooks.map((hook) => (
                <div key={hook.id} className="glass-card p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center">
                        <Check className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-white truncate max-w-[200px] md:max-w-sm">{hook.url}</p>
                        <p className="text-xs text-slate-400">Eventos: {hook.events.join(', ')}</p>
                      </div>
                    </div>
                    <button className="text-slate-600 hover:text-rose-500 transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="bg-slate-950/50 rounded-xl p-4 flex items-center justify-between border border-white/5">
                    <div className="flex-1 mr-4">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Webhook Secret (HMAC-SHA256)</p>
                      <code className="text-xs text-slate-300 font-mono break-all">{hook.secret}</code>
                    </div>
                    <button 
                      onClick={() => copyToClipboard(hook.secret)}
                      className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-all"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EventCheckbox({ label, checked = false }: any) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
        checked ? 'bg-primary border-primary' : 'bg-slate-900 border-slate-700'
      }`}>
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">{label}</span>
    </label>
  )
}
