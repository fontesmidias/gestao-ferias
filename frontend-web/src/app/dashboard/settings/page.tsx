'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Settings,
  Webhook as WebhookIcon,
  Trash2,
  Check,
  Copy,
  Zap,
  ShieldCheck,
  Code,
  Loader2,
  Send,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { InfoTooltip } from '@/components/InfoTooltip'
import { HttpClient } from '@/lib/api-client'

interface Webhook {
  id: string
  url: string
  secret: string
  events: string[]
  isActive: boolean
  createdAt: string
}

const AVAILABLE_EVENTS = [
  { value: 'VACATION_SIGNED', label: 'Assinatura de F\érias', tooltip: 'Dispara webhook quando um documento de f\érias \é assinado digitalmente pelo colaborador.' },
  { value: 'EMPLOYEE_CREATED', label: 'Novo Colaborador', tooltip: 'Dispara webhook quando um novo colaborador \é cadastrado no sistema.' },
  { value: 'BALANCE_ADJUSTED', label: 'Ajuste de Saldo', tooltip: 'Dispara webhook quando o RH faz um ajuste manual no saldo de f\érias de um colaborador.' },
  { value: 'VACATION_APPROVED', label: 'F\érias Aprovadas', tooltip: 'Dispara webhook quando uma solicita\ç\ão de f\érias \é aprovada pelo gestor.' },
  { value: 'VACATION_REJECTED', label: 'F\érias Rejeitadas', tooltip: 'Dispara webhook quando uma solicita\ç\ão de f\érias \é rejeitada.' },
]

export default function SettingsPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [newUrl, setNewUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['VACATION_SIGNED'])
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await HttpClient.get('/webhooks')
      setWebhooks(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar webhooks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    )
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado para a \área de transfer\ência!')
  }

  const addWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl) {
      toast.error('Informe a URL do webhook.')
      return
    }
    if (selectedEvents.length === 0) {
      toast.error('Selecione pelo menos um evento.')
      return
    }

    setCreating(true)
    try {
      const created = await HttpClient.post('/webhooks', {
        url: newUrl,
        events: selectedEvents,
      })
      setWebhooks((prev) => [created, ...prev])
      setNewUrl('')
      setSelectedEvents(['VACATION_SIGNED'])
      toast.success('Webhook configurado com sucesso! O secret foi gerado automaticamente.')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar webhook.')
    } finally {
      setCreating(false)
    }
  }

  const deleteWebhook = async (id: string) => {
    setDeletingId(id)
    try {
      await HttpClient.delete(`/webhooks/${id}`)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      toast.success('Webhook removido com sucesso.')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover webhook.')
    } finally {
      setDeletingId(null)
    }
  }

  const testWebhook = async (id: string) => {
    setTestingId(id)
    try {
      const result = await HttpClient.post(`/webhooks/${id}/test`, {})
      if (result.success) {
        toast.success(result.message || 'Webhook de teste enviado com sucesso!')
      } else {
        toast.error(result.message || 'Falha ao enviar webhook de teste.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao testar webhook.')
    } finally {
      setTestingId(null)
    }
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
            <h1 className="text-4xl font-bold text-white tracking-tight">Configura\ç\ões</h1>
            <p className="text-slate-400">Gerencie suas integra\ç\ões e seguran\ça. <InfoTooltip text="Central de configura\ç\ões do sistema. Gerencie webhooks, seguran\ça e automa\ç\ões." /></p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Navigation Sidebar */}
          <div className="space-y-2">
            <button className="w-full text-left px-4 py-3 rounded-xl bg-primary/10 text-primary font-bold flex items-center gap-3 transition-all">
              <WebhookIcon className="w-5 h-5" />
              Webhooks & API <InfoTooltip text="Configure integra\ç\ões com sistemas externos via webhooks HTTP." />
            </button>
            <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-slate-400 flex items-center gap-3 transition-all">
              <ShieldCheck className="w-5 h-5" />
              Seguran\ça <InfoTooltip text="Gerencie pol\íticas de senha, autentica\ç\ão e controle de acesso." />
            </button>
            <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-slate-400 flex items-center gap-3 transition-all">
              <Zap className="w-5 h-5" />
              Automa\ç\ões <InfoTooltip text="Configure a\ç\ões autom\áticas como envio de e-mails e alertas baseados em eventos." />
            </button>
          </div>

          {/* Main Content */}
          <div className="md:col-span-2 space-y-8">
            {/* New Webhook Card */}
            <div className="glass-card p-6 rounded-2xl border border-white/5">
              <div className="flex items-center gap-2 mb-6">
                <Code className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Adicionar Novo Webhook <InfoTooltip text="Webhooks enviam notifica\ç\ões HTTP autom\áticas para URLs externas quando eventos ocorrem no sistema." /></h2>
              </div>

              <form onSubmit={addWebhook} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Endpoint URL <InfoTooltip text="URL que receber\á notifica\ç\ões autom\áticas quando eventos de f\érias ocorrerem. Deve ser HTTPS e acess\ível publicamente (ex: Zapier, n8n, Make)." /></label>
                  <input
                    type="url"
                    placeholder="https://sua-api.com/webhook"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Eventos <InfoTooltip text="Selecione quais eventos devem disparar notifica\ç\ões para esta URL." /></label>
                  <div className="flex flex-wrap gap-3 mb-4">
                    {AVAILABLE_EVENTS.map((evt) => (
                      <span key={evt.value} className="flex items-center gap-1">
                        <EventCheckbox
                          label={evt.label}
                          checked={selectedEvents.includes(evt.value)}
                          onChange={() => toggleEvent(evt.value)}
                        />
                        <InfoTooltip text={evt.tooltip} />
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Plus className="w-5 h-5" />
                  )}
                  {creating ? 'Criando...' : 'Configurar Webhook'} <InfoTooltip text="Ativa a integra\ç\ão e come\ça a enviar notifica\ç\ões para a URL configurada. Um secret HMAC-SHA256 ser\á gerado automaticamente." />
                </button>
              </form>
            </div>

            {/* List Webhooks */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase px-2">Webhooks Configurados <InfoTooltip text="Lista de todos os webhooks ativos no seu tenant. Cada um possui um secret \único para valida\ç\ão HMAC." /></h3>

              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              )}

              {!loading && webhooks.length === 0 && (
                <div className="glass-card p-8 rounded-2xl border border-white/5 text-center">
                  <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">Nenhum webhook configurado ainda.</p>
                  <p className="text-slate-600 text-xs mt-1">Adicione um acima para come\çar a receber notifica\ç\ões.</p>
                </div>
              )}

              {webhooks.map((hook) => (
                <div key={hook.id} className="glass-card p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hook.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                        <Check className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-white truncate max-w-[200px] md:max-w-sm">{hook.url}</p>
                        <p className="text-xs text-slate-400">Eventos: {hook.events.join(', ')} <InfoTooltip text="Tipos de evento que disparam notifica\ç\ões para este endpoint." /></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => testWebhook(hook.id)}
                        disabled={testingId === hook.id}
                        className="text-slate-500 hover:text-indigo-400 transition-colors p-1 disabled:opacity-50"
                        title="Enviar teste"
                      >
                        {testingId === hook.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteWebhook(hook.id)}
                        disabled={deletingId === hook.id}
                        className="text-slate-600 hover:text-rose-500 transition-colors p-1 disabled:opacity-50"
                        title="Remover webhook"
                      >
                        {deletingId === hook.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 rounded-xl p-4 flex items-center justify-between border border-white/5">
                    <div className="flex-1 mr-4">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Webhook Secret (HMAC-SHA256) <InfoTooltip text="Chave secreta usada para verificar autenticidade das notifica\ç\ões. Use HMAC-SHA256 para validar que a requisi\ç\ão veio do nosso sistema." /></p>
                      <code className="text-xs text-slate-300 font-mono break-all">{hook.secret}</code>
                    </div>
                    <button
                      onClick={() => copyToClipboard(hook.secret)}
                      className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-all"
                      title="Copiar secret"
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

function EventCheckbox({ label, checked = false, onChange }: { label: string; checked?: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group" onClick={(e) => { e.preventDefault(); onChange() }}>
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
        checked ? 'bg-primary border-primary' : 'bg-slate-900 border-slate-700'
      }`}>
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">{label}</span>
    </label>
  )
}
