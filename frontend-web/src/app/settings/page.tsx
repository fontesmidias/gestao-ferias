'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Settings, Save, Server, Building2, KeyRound, BrainCircuit, ExternalLink, MessageSquare, Wifi, WifiOff, FileSignature, UserCog, Users, UserPlus, X, Trash2, Zap, Play } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'
import { PasswordInput } from '@/components/PasswordInput'
import { ImageUpload } from '@/components/ImageUpload'

// WCAG contrast ratio helper (FR-V31-BRAND-003)
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrastRatio(hex1: string, hex2: string): number {
  try {
    const l1 = luminance(hex1), l2 = luminance(hex2)
    const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1]
    return (a + 0.05) / (b + 0.05)
  } catch { return 1 }
}

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

  // Profile self-service
  const [profileForm, setProfileForm] = useState({ name: '', email: '', currentPassword: '', newPassword: '' })
  const [savingProfile, setSavingProfile] = useState(false)

  // V3.4 Story 4.18: Automacoes — config do cron de coberturas
  const [cronCfg, setCronCfg] = useState<{ enabled: boolean; intervalHours: number; lastRunAt: string | null; lastResult: { toActive: number; toCompleted: number; durationMs: number } | null } | null>(null)
  const [cronSaving, setCronSaving] = useState(false)
  const [cronRunning, setCronRunning] = useState(false)

  // Team management (ADMIN)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'ADMIN' })
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
    if (user) {
      setProfileForm({ name: user.name || '', email: user.email || '', currentPassword: '', newPassword: '' })
      if (user.tenantId) {
        fetchSettings()
        if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
          fetchTeam()
          fetchCronCfg()
        }
      }
    }
  }, [user])

  // V3.4 Story 4.18: handlers do cron de coberturas
  const fetchCronCfg = async () => {
    try {
      const res: any = await HttpClient.get('/admin/coverage-cron')
      setCronCfg(res?.data ?? null)
    } catch { /* operador comum nao acessa */ }
  }
  const saveCronCfg = async (patch: { enabled?: boolean; intervalHours?: number }) => {
    try {
      setCronSaving(true)
      const res: any = await HttpClient.patch('/admin/coverage-cron', patch)
      setCronCfg(res?.data ?? null)
      toast.success('Configuracao salva.')
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro ao salvar.')
    } finally { setCronSaving(false) }
  }
  const runCronNow = async () => {
    try {
      setCronRunning(true)
      const res: any = await HttpClient.post('/admin/coverage-cron/run', {})
      const d = res?.data
      toast.success(`Atualizacao concluida: ${d?.toActive ?? 0} coberturas iniciadas, ${d?.toCompleted ?? 0} encerradas.`, { duration: 8000 })
      await fetchCronCfg()
    } catch (err: any) {
      toast.error(err?.body?.error?.message || 'Erro ao executar.')
    } finally { setCronRunning(false) }
  }

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

  const saveProfile = async () => {
    try {
      setSavingProfile(true)
      const payload: any = {}
      if (profileForm.name) payload.name = profileForm.name
      if (profileForm.email) payload.email = profileForm.email
      if (profileForm.newPassword) {
        // V3.1 FR-V31-PWD-001: campo "currentPassword" é reaproveitado como "Repetir Nova Senha"
        if (profileForm.newPassword !== profileForm.currentPassword) {
          toast.error('A nova senha e a confirmação não conferem.')
          return
        }
        payload.newPassword = profileForm.newPassword
      }
      await HttpClient.patch('/auth/profile', payload)
      toast.success('Perfil atualizado!')
      setProfileForm(p => ({ ...p, currentPassword: '', newPassword: '' }))
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar perfil.')
    } finally {
      setSavingProfile(false)
    }
  }

  const fetchTeam = async () => {
    try {
      const data = await HttpClient.get('/auth/team')
      setTeamMembers(data)
    } catch { /* silent */ }
  }

  const addTeamMember = async () => {
    try {
      await HttpClient.post('/auth/team', newUserForm)
      toast.success('Usuario criado!')
      setShowAddUserModal(false)
      setNewUserForm({ name: '', email: '', password: '', role: 'ADMIN' })
      fetchTeam()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuario.')
    }
  }

  const toggleTeamMember = async (userId: string, isActive: boolean) => {
    try {
      if (!isActive) {
        if (!confirm('Desativar este usuario?')) return
      }
      await HttpClient.patch(`/auth/team/${userId}`, { isActive })
      toast.success(isActive ? 'Usuario reativado.' : 'Usuario desativado.')
      fetchTeam()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar usuario.')
    }
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

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'
  const hasTenant = !!user?.tenantId

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      ADMIN: 'bg-amber-500/20 text-amber-400',
      USER: 'bg-emerald-500/20 text-emerald-400',
      AUDITOR: 'bg-sky-500/20 text-sky-400',
    }
    return colors[role] || 'bg-slate-500/20 text-slate-400'
  }

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-4xl mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Settings className="w-8 h-8 text-primary" />
              Configuracoes
            </h2>
            <p className="text-slate-400 mt-2">Perfil, equipe e integracoes.</p>
          </div>
        </div>

        <ErrorBoundary>
          <div className="space-y-8">

          {/* ─── Meu Perfil (qualquer role) ─────────────────── */}
          <div className="glass-card p-8 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <UserCog className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Meu Perfil</h3>
                <p className="text-sm text-slate-400">Altere seu nome, email e senha.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nome</label>
                <input type="text" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nova Senha <InfoTooltip text="Deixe em branco para não alterar." /></label>
                <PasswordInput value={profileForm.newPassword} onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Repetir Nova Senha</label>
                <PasswordInput value={profileForm.currentPassword} onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                  placeholder="Repita a nova senha"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-primary/50 outline-none" />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button type="button" onClick={saveProfile} disabled={savingProfile}
                className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          </div>

          {/* ─── Equipe (ADMIN only) ───────────────────────── */}
          {isAdmin && hasTenant && (
            <div className="glass-card p-8 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Users className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Equipe</h3>
                    <p className="text-sm text-slate-400">Gerencie os usuarios com acesso ao sistema.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowAddUserModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-xs transition-colors">
                  <UserPlus className="w-4 h-4" /> Novo Usuario
                </button>
              </div>

              {teamMembers.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">Nenhum usuario encontrado.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Nome</th>
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Email</th>
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Perfil</th>
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                      <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((m: any) => (
                      <tr key={m.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 text-white font-medium">{m.name}</td>
                        <td className="py-3 text-slate-300">{m.email}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${roleBadge(m.role)}`}>{m.role}</span>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {m.isActive ? 'ATIVO' : 'INATIVO'}
                          </span>
                        </td>
                        <td className="py-3">
                          {m.id !== user?.id && (
                            <button type="button" onClick={() => toggleTeamMember(m.id, !m.isActive)}
                              className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors ${
                                m.isActive
                                  ? 'text-rose-400 hover:bg-rose-500/10'
                                  : 'text-emerald-400 hover:bg-emerald-500/10'
                              }`}>
                              {m.isActive ? 'Desativar' : 'Reativar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ─── Automações (ADMIN only) ─── V3.4 Story 4.18 ─ */}
          {isAdmin && hasTenant && cronCfg && (
            <div className="glass-card p-8 rounded-2xl border border-white/5">
              <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <Zap className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Automações</h3>
                  <p className="text-sm text-slate-400">Tarefas que o sistema executa sozinho, em segundo plano.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-900/50 border border-white/5 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[280px]">
                      <h4 className="font-bold text-white text-sm mb-1">Atualização automática das coberturas</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        De tempos em tempos, o sistema verifica as coberturas cadastradas e atualiza o status delas automaticamente:
                      </p>
                      <ul className="text-xs text-slate-400 list-disc list-inside mt-2 space-y-0.5">
                        <li>Coberturas <strong className="text-sky-300">Planejadas</strong> viram <strong className="text-emerald-300">Ativas</strong> quando a data de início chega.</li>
                        <li>Coberturas <strong className="text-emerald-300">Ativas</strong> viram <strong className="text-slate-300">Concluídas</strong> quando a data de fim passa.</li>
                      </ul>
                      <p className="text-xs text-slate-500 mt-3">
                        {cronCfg.lastRunAt
                          ? <>Última atualização: <strong className="text-slate-300">{format(parseISO(cronCfg.lastRunAt), 'dd/MM/yyyy HH:mm')}</strong>{cronCfg.lastResult ? <> · {cronCfg.lastResult.toActive} cobertura(s) iniciada(s), {cronCfg.lastResult.toCompleted} encerrada(s)</> : null}</>
                          : <>Ainda não executado.</>}
                      </p>
                    </div>
                    <button
                      onClick={runCronNow}
                      disabled={cronRunning}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50"
                      title="Verificar e atualizar agora, sem esperar o próximo horário"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {cronRunning ? 'Atualizando...' : 'Atualizar agora'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-white/5">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cronCfg.enabled}
                        disabled={cronSaving}
                        onChange={e => saveCronCfg({ enabled: e.target.checked })}
                        className="w-4 h-4 accent-primary"
                      />
                      <div>
                        <p className="text-sm text-slate-200 font-medium">Ligado</p>
                        <p className="text-[11px] text-slate-500">Desligando, as coberturas só serão atualizadas com o botão acima.</p>
                      </div>
                    </label>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Verificar a cada <InfoTooltip text="Quantas horas o sistema espera entre uma verificação e outra. 6 horas é suficiente para a maioria dos casos." />
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={168}
                          value={cronCfg.intervalHours}
                          disabled={cronSaving || !cronCfg.enabled}
                          onChange={e => setCronCfg(c => c ? { ...c, intervalHours: Number(e.target.value) } : c)}
                          onBlur={e => {
                            const v = Number(e.target.value)
                            if (Number.isFinite(v) && v >= 1 && v <= 168) saveCronCfg({ intervalHours: v })
                          }}
                          className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                        />
                        <span className="text-sm text-slate-400">hora(s)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">Mínimo 1 hora, máximo 168 horas (1 semana).</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Configuracoes do Tenant (ADMIN only) ──────── */}
          {isAdmin && hasTenant && (
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

            {/* V3.1: SMTP e WhatsApp agora são gerenciados globalmente pelo Super Admin */}
            <div className="glass-card p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
                  <Server className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Credenciais Globais movidas</h3>
                  <p className="text-sm text-slate-400">
                    A partir do V3.1, as configurações de <strong>SMTP (e-mail)</strong> e <strong>Evolution (WhatsApp)</strong> são gerenciadas centralmente pelo Super Admin.
                    Se precisar alterar essas credenciais, fale com o administrador do sistema.
                  </p>
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
                    <ImageUpload
                      value={formData.brandLogoUrl}
                      maxSizeKB={10240}
                      accept="image/*"
                      recommendedSize="PNG/JPG/SVG/WEBP/GIF — qualquer imagem, recomendado ~300×100px"
                      onUpload={async (file) => {
                        const result = await HttpClient.upload('/tenants/logo', 'file', file)
                        setFormData({ ...formData, brandLogoUrl: result.brandLogoUrl })
                      }}
                      onRemove={async () => {
                        await HttpClient.delete('/tenants/logo')
                        setFormData({ ...formData, brandLogoUrl: '' })
                      }}
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

                {/* Preview + aviso de contraste (FR-V31-BRAND-003) */}
                {(formData.brandPrimaryColor || formData.brandSecondaryColor) && (() => {
                  const primary = formData.brandPrimaryColor || '#2563EB'
                  const secondary = formData.brandSecondaryColor || '#7C3AED'
                  const ratio = contrastRatio(primary, '#FFFFFF')
                  const lowContrast = ratio < 4.5
                  return (
                    <div className="mt-3 p-3 bg-slate-900/40 border border-white/5 rounded-lg">
                      <p className="text-xs font-bold text-slate-400 mb-2">Preview</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="button" style={{ background: primary }}
                          className="px-4 py-1.5 rounded-lg text-sm font-bold text-white pointer-events-none">
                          Botão primário
                        </button>
                        <button type="button" style={{ background: secondary }}
                          className="px-4 py-1.5 rounded-lg text-sm font-bold text-white pointer-events-none">
                          Botão secundário
                        </button>
                        <span className="text-xs text-slate-500">Contraste primário × branco: <strong className="text-slate-300">{ratio.toFixed(2)}:1</strong></span>
                      </div>
                      {lowContrast && (
                        <p className="mt-2 text-xs text-amber-400 flex items-center gap-1.5">
                          ⚠️ Contraste abaixo de WCAG AA (4.5:1). Texto branco nesta cor pode ficar difícil de ler.
                        </p>
                      )}
                    </div>
                  )
                })()}
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
          )}

          {!isAdmin && hasTenant && (
            <div className="text-center py-8 text-slate-500 text-sm">
              As configuracoes de integracao sao gerenciadas pelo administrador da empresa.
            </div>
          )}

          {!hasTenant && user?.role === 'SUPERADMIN' && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Entre em uma empresa pelo painel admin para configurar integracoes.
            </div>
          )}

          </div>
        </ErrorBoundary>

        {/* Modal: Novo Usuario */}
        {showAddUserModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Novo Usuario</h2>
                <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-1">Nome *</label>
                  <input type="text" value={newUserForm.name} onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-1">Email *</label>
                  <input type="email" value={newUserForm.email} onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-1">Senha *</label>
                  <PasswordInput value={newUserForm.password} onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-1">Perfil *</label>
                  <select value={newUserForm.role} onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none">
                    <option value="ADMIN">Administrador (RH)</option>
                    <option value="USER">Colaborador</option>
                    <option value="AUDITOR">Auditor</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddUserModal(false)}
                  className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm">Cancelar</button>
                <button onClick={addTeamMember} disabled={!newUserForm.name || !newUserForm.email || !newUserForm.password}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50">Criar Usuario</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
