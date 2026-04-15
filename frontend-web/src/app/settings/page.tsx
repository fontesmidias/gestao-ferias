'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Settings, Save, Server, Building2, KeyRound, BrainCircuit, ExternalLink, MessageSquare, Wifi, WifiOff, FileSignature } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'

export default function SettingsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showOpenai, setShowOpenai] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [showGemini, setShowGemini] = useState(false)
  const [showGroq, setShowGroq] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [showEvoApiKey, setShowEvoApiKey] = useState(false)
  const [showZapSignToken, setShowZapSignToken] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState<{ loading: boolean; connected?: boolean; state?: string; error?: string }>({ loading: false })
  const [formData, setFormData] = useState({
    openaiKey: '',
    anthropicKey: '',
    geminiKey: '',
    groqKey: '',
    llmProvider: '',
    llmModel: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    evoApiUrl: '',
    evoApiKey: '',
    evoInstanceName: '',
    whatsappEnabled: false,
    zapSignToken: '',
    brandName: '',
    brandPrimaryColor: '',
    brandSecondaryColor: '',
    brandLogoUrl: '',
  })

  const providerModels: Record<string, { label: string; models: { value: string; label: string }[]; tooltip: string }> = {
    openai: {
      label: 'OpenAI',
      models: [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      ],
      tooltip: 'Modelos GPT da OpenAI. GPT-4o é o mais capaz, 4o-mini é mais barato e rápido.',
    },
    anthropic: {
      label: 'Anthropic',
      models: [
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      ],
      tooltip: 'Modelos Claude da Anthropic. Sonnet é equilibrado, Haiku é mais rápido e barato.',
    },
    gemini: {
      label: 'Gemini',
      models: [
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      ],
      tooltip: 'Modelos do Google. Pro é mais capaz, Flash é mais rápido.',
    },
    groq: {
      label: 'Groq (Gratuito)',
      models: [
        { value: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B' },
        { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
      ],
      tooltip: 'Acesso GRATUITO com limite de requisições. Usa modelos open-source (LLaMA, Mixtral). Ideal para testar sem custo. Crie sua chave em console.groq.com',
    },
  }

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
        groqKey: data.groqKey || '',
        llmProvider: data.llmProvider || '',
        llmModel: data.llmModel || '',
        smtpHost: data.smtpHost || '',
        smtpPort: data.smtpPort || '',
        smtpUser: data.smtpUser || '',
        smtpPass: data.smtpPass || '',
        smtpFrom: data.smtpFrom || '',
        evoApiUrl: data.evoApiUrl || '',
        evoApiKey: data.evoApiKey || '',
        evoInstanceName: data.evoInstanceName || '',
        whatsappEnabled: data.whatsappEnabled || false,
        zapSignToken: data.zapSignToken || '',
        brandName: data.brandName || '',
        brandPrimaryColor: data.brandPrimaryColor || '',
        brandSecondaryColor: data.brandSecondaryColor || '',
        brandLogoUrl: data.brandLogoUrl || '',
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

  const testWhatsappConnection = async () => {
    setWhatsappStatus({ loading: true })
    try {
      const result = await HttpClient.get('/tenants/whatsapp/status')
      setWhatsappStatus({ loading: false, ...result })
      if (result.connected) {
        toast.success('WhatsApp conectado com sucesso!')
      } else {
        toast.error(`WhatsApp desconectado. Estado: ${result.state || result.error || 'desconhecido'}`)
      }
    } catch (err: any) {
      setWhatsappStatus({ loading: false, connected: false, error: err.message })
      toast.error('Falha ao testar conexão WhatsApp.')
    }
  }

  if (user?.role !== 'ADMIN' && user?.role !== 'SUPERADMIN') {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Você não tem permissão para acessar esta página.
      </div>
    )
  }

  // SuperAdmin sem impersonar não tem tenant para configurar
  if (user?.role === 'SUPERADMIN' && !user?.tenantId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 flex-col gap-2">
        <p className="font-bold">Entre em uma empresa para configurar.</p>
        <p className="text-sm">Use o painel SuperAdmin para selecionar uma empresa.</p>
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
            
            {/* Configuração Unificada do Oráculo AI */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <BrainCircuit className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Oráculo AI</h3>
                  <p className="text-sm text-slate-400">Escolha o provedor, modelo e configure a chave de API para ativar a inteligência artificial.</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Provider selector */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">
                    Provedor de IA <InfoTooltip text="Selecione o provedor preferido. Cada provedor exige sua propria chave de API. O Groq oferece acesso gratuito." />
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(providerModels).map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          const newProvider = formData.llmProvider === key ? '' : key
                          const defaultModel = newProvider ? config.models[0].value : ''
                          setFormData({ ...formData, llmProvider: newProvider, llmModel: defaultModel })
                        }}
                        className={`relative p-4 rounded-xl border text-left transition-all ${
                          formData.llmProvider === key
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                            : 'border-white/10 bg-slate-900/50 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-bold ${formData.llmProvider === key ? 'text-white' : 'text-slate-300'}`}>
                            {config.label}
                          </span>
                          <InfoTooltip text={config.tooltip} />
                        </div>
                        {key === 'groq' && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full uppercase">
                            Gratuito
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model selector (when provider is selected) */}
                {formData.llmProvider && providerModels[formData.llmProvider] && (
                  <div>
                    <label htmlFor="llmModel" className="block text-sm font-medium text-slate-300 mb-2">
                      Modelo <InfoTooltip text="Modelo especifico do provedor. Modelos maiores tem melhor raciocinio mas custam mais." />
                    </label>
                    <select
                      id="llmModel"
                      value={formData.llmModel}
                      onChange={(e) => setFormData({ ...formData, llmModel: e.target.value })}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                    >
                      {providerModels[formData.llmProvider].models.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* API Key field for selected provider */}
                {formData.llmProvider === 'openai' && (
                  <div>
                    <label htmlFor="openaiKey" className="block text-sm font-medium text-slate-300 mb-2">
                      Chave API OpenAI <InfoTooltip text="Obtenha em platform.openai.com. Necessaria para usar modelos GPT." />
                    </label>
                    <div className="relative">
                      <input id="openaiKey" type={showOpenai ? "text" : "password"} value={formData.openaiKey} onChange={handleChange}
                        placeholder="sk-proj-..." className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-2 focus:ring-primary/50 outline-none" />
                      <button type="button" onClick={() => setShowOpenai(!showOpenai)} className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl">{showOpenai ? "🐵" : "🙈"}</button>
                    </div>
                  </div>
                )}

                {formData.llmProvider === 'anthropic' && (
                  <div>
                    <label htmlFor="anthropicKey" className="block text-sm font-medium text-slate-300 mb-2">
                      Chave API Anthropic <InfoTooltip text="Obtenha em console.anthropic.com. Necessaria para usar modelos Claude." />
                    </label>
                    <div className="relative">
                      <input id="anthropicKey" type={showAnthropic ? "text" : "password"} value={formData.anthropicKey} onChange={handleChange}
                        placeholder="sk-ant-api03-..." className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-2 focus:ring-primary/50 outline-none" />
                      <button type="button" onClick={() => setShowAnthropic(!showAnthropic)} className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl">{showAnthropic ? "🐵" : "🙈"}</button>
                    </div>
                  </div>
                )}

                {formData.llmProvider === 'gemini' && (
                  <div>
                    <label htmlFor="geminiKey" className="block text-sm font-medium text-slate-300 mb-2">
                      Chave API Google Gemini <InfoTooltip text="Obtenha em aistudio.google.com. Alternativa com tier gratuito." />
                    </label>
                    <div className="relative">
                      <input id="geminiKey" type={showGemini ? "text" : "password"} value={formData.geminiKey} onChange={handleChange}
                        placeholder="AIzaSy..." className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-2 focus:ring-primary/50 outline-none" />
                      <button type="button" onClick={() => setShowGemini(!showGemini)} className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl">{showGemini ? "🐵" : "🙈"}</button>
                    </div>
                  </div>
                )}

                {/* Groq API Key (only when Groq is selected) */}
                {formData.llmProvider === 'groq' && (
                  <div>
                    <label htmlFor="groqKey" className="block text-sm font-medium text-slate-300 mb-2">
                      Groq API Key <InfoTooltip text="Chave de acesso à API da Groq. Gratuita com limites de requisições por minuto." />
                    </label>
                    <div className="relative">
                      <input
                        id="groqKey"
                        type={showGroq ? "text" : "password"}
                        value={formData.groqKey}
                        onChange={handleChange}
                        placeholder="gsk_..."
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGroq(!showGroq)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl hover:scale-110 transition-transform focus:outline-none"
                        title={showGroq ? "Ocultar chave" : "Ver chave"}
                      >
                        {showGroq ? "🐵" : "🙈"}
                      </button>
                    </div>
                    <a
                      href="https://console.groq.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Não tem chave? Crie gratuitamente em console.groq.com
                    </a>
                  </div>
                )}
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
                  <label htmlFor="smtpHost" className="block text-sm font-medium text-slate-300 mb-2">Servidor SMTP <InfoTooltip text="Endereço do servidor de e-mail da sua empresa (ex: smtp.zoho.com, smtp.gmail.com). Usado para enviar notificações automáticas de férias." /></label>
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
                  <label htmlFor="smtpPort" className="block text-sm font-medium text-slate-300 mb-2">Porta <InfoTooltip text="Porta de conexão do servidor de e-mail. Use 465 para SSL ou 587 para TLS. Consulte seu provedor de e-mail." /></label>
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
                  <label htmlFor="smtpFrom" className="block text-sm font-medium text-slate-300 mb-2">E-mail Remetente (From) <InfoTooltip text="Endereço que aparecerá como remetente em todas as notificações automáticas enviadas pelo sistema." /></label>
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
                  <label htmlFor="smtpUser" className="block text-sm font-medium text-slate-300 mb-2">Usuário SMTP <InfoTooltip text="Login de autenticação no servidor de e-mail. Geralmente é o próprio endereço de e-mail." /></label>
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
                  <label htmlFor="smtpPass" className="block text-sm font-medium text-slate-300 mb-2">Senha SMTP <InfoTooltip text="Senha de acesso ao servidor de e-mail. Em provedores como Gmail, use uma 'Senha de App' ao invés da senha normal." /></label>
                  <div className="relative">
                    <input
                      id="smtpPass"
                      type={showSmtpPass ? "text" : "password"}
                      value={formData.smtpPass}
                      onChange={handleChange}
                      placeholder="••••••••"
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowSmtpPass(!showSmtpPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform focus:outline-none"
                      title={showSmtpPass ? "Ocultar senha" : "Ver senha"}
                    >
                      {showSmtpPass ? "🐵" : "🙈"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp (Evolution API) */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">WhatsApp (Evolution API)</h3>
                  <p className="text-sm text-slate-400">Configure a integração com WhatsApp para envio automático de notificações de férias.</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Toggle WhatsApp habilitado */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-300">WhatsApp habilitado</label>
                    <InfoTooltip text="Ativa ou desativa o envio de notificações automáticas via WhatsApp. Quando habilitado, aprovações e reprovações de férias serão notificadas ao colaborador." />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, whatsappEnabled: !formData.whatsappEnabled })}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      formData.whatsappEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        formData.whatsappEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-full">
                    <label htmlFor="evoApiUrl" className="block text-sm font-medium text-slate-300 mb-2">
                      URL da Evolution API <InfoTooltip text="URL do servidor da Evolution API. Ex: https://evo.suaempresa.com" />
                    </label>
                    <input
                      id="evoApiUrl"
                      type="text"
                      value={formData.evoApiUrl}
                      onChange={handleChange}
                      placeholder="https://evo.suaempresa.com"
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="evoApiKey" className="block text-sm font-medium text-slate-300 mb-2">
                      API Key <InfoTooltip text="Chave de autenticação da Evolution API. Gerada durante a configuração da sua instância." />
                    </label>
                    <div className="relative">
                      <input
                        id="evoApiKey"
                        type={showEvoApiKey ? "text" : "password"}
                        value={formData.evoApiKey}
                        onChange={handleChange}
                        placeholder="sua-api-key-aqui"
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEvoApiKey(!showEvoApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform focus:outline-none"
                        title={showEvoApiKey ? "Ocultar chave" : "Ver chave"}
                      >
                        {showEvoApiKey ? "🐵" : "🙈"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="evoInstanceName" className="block text-sm font-medium text-slate-300 mb-2">
                      Nome da Instância <InfoTooltip text="Nome da instância configurada na Evolution API. Ex: gestaoferias" />
                    </label>
                    <input
                      id="evoInstanceName"
                      type="text"
                      value={formData.evoInstanceName}
                      onChange={handleChange}
                      placeholder="gestaoferias"
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none"
                    />
                  </div>
                </div>

                {/* Testar Conexão */}
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={testWhatsappConnection}
                    disabled={whatsappStatus.loading || !formData.evoApiUrl || !formData.evoApiKey || !formData.evoInstanceName}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {whatsappStatus.loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : whatsappStatus.connected ? (
                      <Wifi className="w-4 h-4" />
                    ) : (
                      <WifiOff className="w-4 h-4" />
                    )}
                    Testar Conexão
                  </button>
                  {whatsappStatus.state && !whatsappStatus.loading && (
                    <span className={`text-sm ${whatsappStatus.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                      Estado: {whatsappStatus.state}
                      {whatsappStatus.error && ` — ${whatsappStatus.error}`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Assinatura Digital (ZapSign) */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <FileSignature className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Assinatura Digital (ZapSign)</h3>
                  <p className="text-sm text-slate-400">Configure a integração com a ZapSign para assinatura digital dos avisos de férias.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label htmlFor="zapSignToken" className="block text-sm font-medium text-slate-300 mb-2">
                    ZapSign API Token <InfoTooltip text="Token de acesso à API da ZapSign. Necessário para enviar documentos para assinatura digital. Obtenha no painel da ZapSign em app.zapsign.com.br > Integrações > API." />
                  </label>
                  <div className="relative">
                    <input
                      id="zapSignToken"
                      type={showZapSignToken ? "text" : "password"}
                      value={formData.zapSignToken}
                      onChange={handleChange}
                      placeholder="Seu token da API ZapSign..."
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowZapSignToken(!showZapSignToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl hover:scale-110 transition-transform focus:outline-none"
                      title={showZapSignToken ? "Ocultar token" : "Ver token"}
                    >
                      {showZapSignToken ? "🐵" : "🙈"}
                    </button>
                  </div>
                  <a
                    href="https://www.zapsign.com.br"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Não tem conta? Crie em zapsign.com.br
                  </a>
                </div>
              </div>
            </div>

            {/* Identidade Visual (Story 7.2) */}
            <div className="glass-card rounded-xl overflow-hidden border border-white/5">
              <div className="p-4 bg-pink-500/5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-white">Identidade Visual</h3>
                  <p className="text-sm text-slate-400">Personalize a aparência da plataforma com as cores e logo da sua empresa.</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Nome exibido</label>
                    <input
                      type="text"
                      value={formData.brandName}
                      onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                      placeholder="Nome da empresa no sistema"
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">URL do Logo</label>
                    <input
                      type="url"
                      value={formData.brandLogoUrl}
                      onChange={(e) => setFormData({ ...formData, brandLogoUrl: e.target.value })}
                      placeholder="https://exemplo.com/logo.png"
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Cor Primária</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.brandPrimaryColor || '#2563EB'}
                        onChange={(e) => setFormData({ ...formData, brandPrimaryColor: e.target.value })}
                        className="w-10 h-10 rounded border border-slate-700 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.brandPrimaryColor}
                        onChange={(e) => setFormData({ ...formData, brandPrimaryColor: e.target.value })}
                        placeholder="#2563EB"
                        className="flex-1 bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Cor Secundária</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.brandSecondaryColor || '#7C3AED'}
                        onChange={(e) => setFormData({ ...formData, brandSecondaryColor: e.target.value })}
                        className="w-10 h-10 rounded border border-slate-700 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.brandSecondaryColor}
                        onChange={(e) => setFormData({ ...formData, brandSecondaryColor: e.target.value })}
                        placeholder="#7C3AED"
                        className="flex-1 bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                      />
                    </div>
                  </div>
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
                {saving ? 'Salvando...' : 'Salvar Configurações'} <InfoTooltip text="Salva todas as configurações de API e e-mail. As alterações entram em vigor imediatamente." />
              </button>
            </div>
            
          </form>
        </ErrorBoundary>
      </main>
    </div>
  )
}
