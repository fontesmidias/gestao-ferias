'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import Link from 'next/link'
import {
  Shield, Building2, Users, UserPlus, X, Edit3, Plus,
  Briefcase, CalendarDays, Eye, LogIn, Trash2, UserCog, KeyRound, AlertTriangle, Power, Mail
} from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'

interface Tenant {
  id: string
  name: string
  cnpj: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  responsible?: string
  lastLoginAt?: string | null
  createdAt: string
  _count: { users: number; employees: number }
}

function activityColor(lastLoginAt?: string | null): { dot: string; label: string } {
  if (!lastLoginAt) return { dot: 'bg-rose-500', label: 'Sem atividade' }
  const diff = Date.now() - new Date(lastLoginAt).getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  if (days < 7) return { dot: 'bg-emerald-500', label: 'Ativo recentemente' }
  if (days < 30) return { dot: 'bg-amber-500', label: 'Inativo há mais de 7 dias' }
  return { dot: 'bg-rose-500', label: 'Inativo há mais de 30 dias' }
}

export default function AdminPage() {
  const { user, switchTenant } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [selectedTenantId, setSelectedTenantId] = useState('')

  const [tenantForm, setTenantForm] = useState({
    name: '', cnpj: '', email: '', phone: '', address: '', city: '', state: '', responsible: ''
  })
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'ADMIN' })
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null)

  // Profile modal
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', email: '', password: '' })
  const [savingProfile, setSavingProfile] = useState(false)

  // MasterKey management
  const [masterKeyLogs, setMasterKeyLogs] = useState<any[]>([])
  const [masterKeyTotal, setMasterKeyTotal] = useState(0)
  const [showMasterKeyPanel, setShowMasterKeyPanel] = useState(false)
  const [hasRecentMasterKey, setHasRecentMasterKey] = useState(false)
  const [masterKeyStatus, setMasterKeyStatus] = useState<{
    enabled: boolean; hasKey: boolean; preview: string | null; updatedAt: string | null
  }>({ enabled: false, hasKey: false, preview: null, updatedAt: null })
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [masterKeyLoading, setMasterKeyLoading] = useState(false)

  // SMTP global
  const [showSmtpPanel, setShowSmtpPanel] = useState(false)
  const [smtpForm, setSmtpForm] = useState({ smtpHost: '', smtpPort: '', smtpUser: '', smtpPass: '', smtpFrom: '' })
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)

  useEffect(() => {
    if (user?.role === 'SUPERADMIN') {
      fetchData()
      fetchMasterKeyStatus()
    }
  }, [user])

  const fetchMasterKeyStatus = async () => {
    try {
      const [status, logsData] = await Promise.all([
        HttpClient.get('/admin/master-key').catch(() => ({ enabled: false, hasKey: false, preview: null, updatedAt: null })),
        HttpClient.get('/admin/master-key-logs?limit=1').catch(() => ({ logs: [], total: 0 }))
      ])
      setMasterKeyStatus(status)
      if (logsData.logs?.length > 0) {
        const hoursAgo = (Date.now() - new Date(logsData.logs[0].createdAt).getTime()) / (1000 * 60 * 60)
        setHasRecentMasterKey(hoursAgo < 24)
      }
    } catch { /* silent */ }
  }

  const fetchMasterKeyLogs = async () => {
    try {
      const data = await HttpClient.get('/admin/master-key-logs?limit=50')
      setMasterKeyLogs(data.logs || [])
      setMasterKeyTotal(data.total || 0)
    } catch {
      toast.error('Erro ao carregar logs.')
    }
  }

  const generateMasterKey = async () => {
    if (!confirm('Gerar nova MasterKey? A anterior sera substituida.')) return
    try {
      setMasterKeyLoading(true)
      const result = await HttpClient.post('/admin/master-key/generate', {})
      setGeneratedKey(result.key)
      toast.success('MasterKey gerada! Copie e guarde em local seguro.')
      await fetchMasterKeyStatus()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar MasterKey.')
    } finally {
      setMasterKeyLoading(false)
    }
  }

  const toggleMasterKey = async (enabled: boolean) => {
    try {
      setMasterKeyLoading(true)
      await HttpClient.patch('/admin/master-key', { enabled })
      toast.success(`MasterKey ${enabled ? 'ativada' : 'desativada'}.`)
      await fetchMasterKeyStatus()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status.')
    } finally {
      setMasterKeyLoading(false)
    }
  }

  const revokeMasterKey = async () => {
    if (!confirm('Revogar MasterKey? O acesso emergencial sera desabilitado completamente.')) return
    try {
      setMasterKeyLoading(true)
      await HttpClient.delete('/admin/master-key')
      setGeneratedKey(null)
      toast.success('MasterKey revogada.')
      await fetchMasterKeyStatus()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao revogar.')
    } finally {
      setMasterKeyLoading(false)
    }
  }

  const openMasterKeyPanel = async () => {
    setShowMasterKeyPanel(true)
    await fetchMasterKeyLogs()
  }

  const openSmtpPanel = async () => {
    try {
      const data = await HttpClient.get('/admin/smtp')
      setSmtpForm({
        smtpHost: data.smtpHost || '',
        smtpPort: data.smtpPort || '',
        smtpUser: data.smtpUser || '',
        smtpPass: data.smtpPass || '',
        smtpFrom: data.smtpFrom || ''
      })
      setSmtpConfigured(data.configured || false)
    } catch { /* silent */ }
    setShowSmtpPanel(true)
  }

  const saveSmtp = async () => {
    try {
      setSavingSmtp(true)
      const payload = {
        ...smtpForm,
        smtpPort: smtpForm.smtpPort ? Number(smtpForm.smtpPort) : null
      }
      await HttpClient.patch('/admin/smtp', payload)
      toast.success('SMTP global atualizado!')
      setSmtpConfigured(true)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar SMTP.')
    } finally {
      setSavingSmtp(false)
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const [s, t] = await Promise.all([
        HttpClient.get('/admin/stats'),
        HttpClient.get('/admin/tenants')
      ])
      setStats(s)
      setTenants(t)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar dados do painel.')
    } finally {
      setLoading(false)
    }
  }

  const openCreateTenant = () => {
    setEditingTenant(null)
    setTenantForm({ name: '', cnpj: '', email: '', phone: '', address: '', city: '', state: '', responsible: '' })
    setShowTenantModal(true)
  }

  const openEditTenant = (t: Tenant) => {
    setEditingTenant(t)
    setTenantForm({
      name: t.name, cnpj: t.cnpj, email: t.email || '', phone: t.phone || '',
      address: t.address || '', city: t.city || '', state: t.state || '', responsible: t.responsible || ''
    })
    setShowTenantModal(true)
  }

  const saveTenant = async () => {
    try {
      if (editingTenant) {
        await HttpClient.patch(`/admin/tenants/${editingTenant.id}`, tenantForm)
        toast.success('Empresa atualizada com sucesso!')
      } else {
        await HttpClient.post('/admin/tenants', tenantForm)
        toast.success('Empresa criada com sucesso!')
      }
      setShowTenantModal(false)
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar empresa.')
    }
  }

  // Modal de exclusao com confirmacao forte
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteDeps, setDeleteDeps] = useState<any>(null)

  const openDeleteModal = async (t: Tenant) => {
    setDeleteTarget(t)
    setDeleteConfirmName('')
    try {
      const deps = await HttpClient.get(`/admin/tenants/${t.id}/dependencies`)
      setDeleteDeps(deps)
    } catch { setDeleteDeps(null) }
  }

  const confirmDeleteTenant = async () => {
    if (!deleteTarget) return
    try {
      await HttpClient.post(`/admin/tenants/${deleteTarget.id}/delete`, { confirmName: deleteConfirmName })
      toast.success('Empresa excluida permanentemente.')
      setDeleteTarget(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir empresa.')
    }
  }

  const deactivateTenant = async (id: string, isActive: boolean) => {
    try {
      await HttpClient.patch(`/admin/tenants/${id}`, { isActive })
      toast.success(isActive ? 'Empresa reativada.' : 'Empresa desativada.')
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status.')
    }
  }

  const handleSwitchTenant = async (tenantId: string) => {
    try {
      setSwitchingTenantId(tenantId)
      await switchTenant(tenantId)
      toast.success('Você entrou na empresa. Use "Voltar ao Admin" para retornar.')
    } catch {
      // error handled by switchTenant
    } finally {
      setSwitchingTenantId(null)
    }
  }

  const createUser = async () => {
    try {
      await HttpClient.post(`/admin/tenants/${selectedTenantId}/users`, userForm)
      toast.success('Usuário criado com sucesso!')
      setShowUserModal(false)
      setUserForm({ name: '', email: '', password: '', role: 'ADMIN' })
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuário.')
    }
  }

  const openProfileModal = () => {
    setProfileForm({ name: user?.name || '', email: user?.email || '', password: '' })
    setShowProfileModal(true)
  }

  const saveProfile = async () => {
    try {
      setSavingProfile(true)
      const payload: any = {}
      if (profileForm.name) payload.name = profileForm.name
      if (profileForm.email) payload.email = profileForm.email
      if (profileForm.password) payload.password = profileForm.password
      await HttpClient.patch('/admin/profile', payload)
      toast.success('Perfil atualizado com sucesso!')
      setShowProfileModal(false)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar perfil.')
    } finally {
      setSavingProfile(false)
    }
  }

  if (user?.role !== 'SUPERADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        Acesso restrito ao Super Administrador.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dashboard">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const kpis = [
    { label: 'Empresas', value: stats?.tenants ?? 0, icon: Building2, color: 'text-indigo-400', bg: 'bg-indigo-500/10', tooltip: 'Total de empresas cadastradas na plataforma.' },
    { label: 'Usuários', value: stats?.users ?? 0, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10', tooltip: 'Total de usuários com acesso ao sistema.' },
    { label: 'Colaboradores', value: stats?.employees ?? 0, icon: Briefcase, color: 'text-sky-400', bg: 'bg-sky-500/10', tooltip: 'Total de colaboradores registrados em todas as empresas.' },
    { label: 'Férias', value: stats?.vacations ?? 0, icon: CalendarDays, color: 'text-amber-400', bg: 'bg-amber-500/10', tooltip: 'Total de solicitações de férias no sistema.' },
  ]

  return (
    <div className="flex-1 p-8 overflow-auto bg-dashboard">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-amber-500" />
            Sala de Controle
          </h1>
          <p className="text-slate-400 mt-1">
            Visão geral de todas as empresas, usuários e métricas da plataforma.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openSmtpPanel}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-colors border ${
              smtpConfigured
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
            }`}
          >
            <Mail className="w-4 h-4" /> SMTP
          </button>
          <button
            onClick={openMasterKeyPanel}
            className="relative flex items-center gap-2 px-4 py-2 bg-rose-500/10 text-rose-400 rounded-xl hover:bg-rose-500/20 font-bold text-sm transition-colors border border-rose-500/20"
          >
            <KeyRound className="w-4 h-4" /> MasterKey
            {hasRecentMasterKey && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
          <button
            onClick={openProfileModal}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-700 font-bold text-sm transition-colors border border-white/10"
          >
            <UserCog className="w-4 h-4" /> Meu Perfil
          </button>
        </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="glass-card p-5 rounded-xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wide flex items-center gap-1.5">
                  {kpi.label}
                  <InfoTooltip text={kpi.tooltip} />
                </span>
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
              <p className={`text-3xl font-black ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Tenant List Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Empresas
            <InfoTooltip text="Cada empresa opera de forma isolada com seus próprios dados, colaboradores e configurações." />
          </h2>
          <button
            onClick={openCreateTenant}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova Empresa
          </button>
        </div>

        {/* Tenant Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tenants.map((t) => {
            const activity = activityColor(t.lastLoginAt)
            return (
              <div key={t.id} className={`glass-card rounded-xl border p-5 flex flex-col gap-4 ${(t as any).isActive === false ? 'border-rose-500/20 opacity-60' : 'border-white/5'}`}>
                {/* Top row: name + activity */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-base truncate">{t.name}</h3>
                      {(t as any).isActive === false && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400">INATIVA</span>
                      )}
                      <span title={activity.label} className={`w-2.5 h-2.5 rounded-full ${activity.dot} shrink-0`} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{t.cnpj}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  {t.city && (
                    <span>{t.city}{t.state ? `/${t.state}` : ''}</span>
                  )}
                  {t.responsible && (
                    <span>Resp: {t.responsible}</span>
                  )}
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-bold">{t._count.users}</span> usuários
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Briefcase className="w-3.5 h-3.5 text-sky-400" />
                    <span className="font-bold">{t._count.employees}</span> colaboradores
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-300 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver Detalhes
                  </Link>
                  <button
                    onClick={() => handleSwitchTenant(t.id)}
                    disabled={switchingTenantId === t.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    {switchingTenantId === t.id ? 'Entrando...' : 'Entrar'}
                  </button>
                  <button
                    onClick={() => openEditTenant(t)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => { setSelectedTenantId(t.id); setShowUserModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/10 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Criar Usuário
                  </button>
                  <button
                    onClick={() => deactivateTenant(t.id, (t as any).isActive === false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      (t as any).isActive === false
                        ? 'text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10'
                        : 'text-amber-400 border border-amber-500/20 hover:bg-amber-500/10'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {(t as any).isActive === false ? 'Reativar' : 'Desativar'}
                  </button>
                  <button
                    onClick={() => openDeleteModal(t)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {tenants.length === 0 && (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhuma empresa cadastrada.</p>
            <p className="text-slate-600 text-sm mt-1">Clique em "Nova Empresa" para começar.</p>
          </div>
        )}
      </div>

      {/* Modal: Tenant (criar/editar) */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">
                {editingTenant ? 'Editar Empresa' : 'Nova Empresa'}
              </h2>
              <button onClick={() => setShowTenantModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Nome da Empresa *
                    <InfoTooltip text="Razão social ou nome fantasia da empresa." />
                  </label>
                  <input
                    type="text"
                    value={tenantForm.name}
                    onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    CNPJ *
                    <InfoTooltip text="Cadastro Nacional da Pessoa Jurídica." />
                  </label>
                  <input
                    type="text"
                    value={tenantForm.cnpj}
                    onChange={(e) => setTenantForm({ ...tenantForm, cnpj: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Responsável
                    <InfoTooltip text="Nome do responsável ou representante legal da empresa." />
                  </label>
                  <input
                    type="text"
                    value={tenantForm.responsible}
                    onChange={(e) => setTenantForm({ ...tenantForm, responsible: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Email
                    <InfoTooltip text="Email comercial da empresa para contato." />
                  </label>
                  <input
                    type="email"
                    value={tenantForm.email}
                    onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Telefone
                    <InfoTooltip text="Telefone comercial com DDD." />
                  </label>
                  <input
                    type="text"
                    value={tenantForm.phone}
                    onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Endereço
                    <InfoTooltip text="Endereço comercial da empresa." />
                  </label>
                  <input
                    type="text"
                    value={tenantForm.address}
                    onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Cidade
                    <InfoTooltip text="Cidade onde a empresa está localizada." />
                  </label>
                  <input
                    type="text"
                    value={tenantForm.city}
                    onChange={(e) => setTenantForm({ ...tenantForm, city: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    UF
                    <InfoTooltip text="Unidade federativa (estado) da empresa." />
                  </label>
                  <input
                    type="text"
                    value={tenantForm.state}
                    onChange={(e) => setTenantForm({ ...tenantForm, state: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                    placeholder="DF"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowTenantModal(false)}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveTenant}
                disabled={!tenantForm.name || !tenantForm.cnpj}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50"
              >
                {editingTenant ? 'Salvar Alterações' : 'Criar Empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Meu Perfil */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserCog className="w-5 h-5 text-amber-400" /> Meu Perfil
              </h2>
              <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Nome
                  <InfoTooltip text="Seu nome de exibição no sistema." />
                </label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Email
                  <InfoTooltip text="Seu email de login." />
                </label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Nova Senha
                  <InfoTooltip text="Deixe em branco para manter a senha atual." />
                </label>
                <input
                  type="password"
                  value={profileForm.password}
                  onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                  placeholder="Deixe em branco para não alterar"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowProfileModal(false)}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveProfile}
                disabled={savingProfile || (!profileForm.name && !profileForm.email && !profileForm.password)}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50"
              >
                {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: MasterKey — Gerenciamento + Logs */}
      {showMasterKeyPanel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-rose-400" /> Acesso Emergencial (MasterKey)
              </h2>
              <button onClick={() => { setShowMasterKeyPanel(false); setGeneratedKey(null) }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-6">
              {/* Status Card */}
              <div className="glass-card p-5 rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Status da MasterKey
                      <InfoTooltip text="A MasterKey permite acessar qualquer conta do sistema via API, sem precisar da senha. Use para emergencias de acesso." />
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {masterKeyStatus.hasKey
                        ? `Chave: ${masterKeyStatus.preview}`
                        : 'Nenhuma chave configurada'}
                      {masterKeyStatus.updatedAt && ` | Atualizada: ${new Date(masterKeyStatus.updatedAt).toLocaleString('pt-BR')}`}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    masterKeyStatus.enabled
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    {masterKeyStatus.enabled ? 'ATIVA' : 'INATIVA'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={generateMasterKey}
                    disabled={masterKeyLoading}
                    className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    {masterKeyStatus.hasKey ? 'Rotacionar Chave' : 'Gerar MasterKey'}
                  </button>

                  {masterKeyStatus.hasKey && (
                    <>
                      <button
                        onClick={() => toggleMasterKey(!masterKeyStatus.enabled)}
                        disabled={masterKeyLoading}
                        className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 border ${
                          masterKeyStatus.enabled
                            ? 'border-amber-500/20 text-amber-400 hover:bg-amber-500/10'
                            : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        {masterKeyStatus.enabled ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={revokeMasterKey}
                        disabled={masterKeyLoading}
                        className="px-4 py-2 border border-rose-500/20 text-rose-400 rounded-xl hover:bg-rose-500/10 font-bold text-xs transition-colors disabled:opacity-50"
                      >
                        Revogar
                      </button>
                    </>
                  )}
                </div>

                {/* Chave gerada (exibida apenas uma vez) */}
                {generatedKey && (
                  <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <p className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" /> Sua nova MasterKey (copie agora, ela nao sera exibida novamente):
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-slate-900 text-emerald-300 px-3 py-2 rounded-lg text-xs font-mono break-all select-all">
                        {generatedKey}
                      </code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(generatedKey); toast.success('Copiado!') }}
                        className="px-3 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 text-xs font-bold shrink-0"
                      >
                        Copiar
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      Uso: POST /api/v1/masterkey com {`{"email":"usuario@empresa.com","masterKey":"<sua_chave>"}`}
                    </p>
                  </div>
                )}
              </div>

              {/* Logs */}
              <div>
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  Historico de Acessos
                  <span className="text-xs font-normal text-slate-500">({masterKeyTotal} registros)</span>
                </h3>
                {masterKeyLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <KeyRound className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">Nenhum acesso registrado.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left">
                        <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Data/Hora</th>
                        <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Email</th>
                        <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Role</th>
                        <th className="pb-3 text-xs font-bold text-slate-500 uppercase">IP</th>
                        <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {masterKeyLogs.map((log: any) => (
                        <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-3 text-slate-300 text-xs whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 text-white font-medium">{log.email}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              log.targetRole === 'SUPERADMIN' ? 'bg-rose-500/20 text-rose-400' :
                              log.targetRole === 'ADMIN' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-slate-500/20 text-slate-400'
                            }`}>
                              {log.targetRole || 'N/A'}
                            </span>
                          </td>
                          <td className="py-3 text-slate-400 font-mono text-xs">{log.ip || '-'}</td>
                          <td className="py-3">
                            {log.success ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">SUCESSO</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 flex items-center gap-1 w-fit">
                                <AlertTriangle className="w-3 h-3" /> FALHA
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Usuário */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Criar Usuário</h2>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Nome *
                  <InfoTooltip text="Nome completo do usuário." />
                </label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Email *
                  <InfoTooltip text="Email para login. Deve ser único por empresa." />
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Senha *
                  <InfoTooltip text="Senha inicial. O usuário poderá alterar depois." />
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Perfil *
                  <InfoTooltip text="ADMIN: gestão completa do RH. USER: colaborador com acesso limitado. AUDITOR: somente leitura." />
                </label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                >
                  <option value="ADMIN">Administrador (RH)</option>
                  <option value="USER">Colaborador</option>
                  <option value="AUDITOR">Auditor</option>
                </select>
              </div>
              {userForm.role === 'USER' && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-xs text-amber-300">
                  <strong>Nota:</strong> Vincule este usuário a um colaborador na página de detalhes da empresa após a criação.
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowUserModal(false)}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={createUser}
                disabled={!userForm.name || !userForm.email || !userForm.password}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50"
              >
                Criar Usuário
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: SMTP Global */}
      {showSmtpPanel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-400" /> SMTP Global
              </h2>
              <button onClick={() => setShowSmtpPanel(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              Configure o servidor de email usado para enviar notificacoes de toda a plataforma (reset de senha, verificacao, aprovacoes).
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-400 mb-1">Servidor SMTP</label>
                  <input type="text" value={smtpForm.smtpHost} onChange={(e) => setSmtpForm({ ...smtpForm, smtpHost: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-1">Porta</label>
                  <input type="number" value={smtpForm.smtpPort} onChange={(e) => setSmtpForm({ ...smtpForm, smtpPort: e.target.value })}
                    placeholder="465"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">Usuario</label>
                <input type="text" value={smtpForm.smtpUser} onChange={(e) => setSmtpForm({ ...smtpForm, smtpUser: e.target.value })}
                  placeholder="email@empresa.com"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">Senha</label>
                <input type="password" value={smtpForm.smtpPass} onChange={(e) => setSmtpForm({ ...smtpForm, smtpPass: e.target.value })}
                  placeholder="App Password ou senha SMTP"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-1">Email Remetente (From)</label>
                <input type="email" value={smtpForm.smtpFrom} onChange={(e) => setSmtpForm({ ...smtpForm, smtpFrom: e.target.value })}
                  placeholder="noreply@empresa.com"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSmtpPanel(false)}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm">Cancelar</button>
              <button onClick={saveSmtp} disabled={savingSmtp || !smtpForm.smtpHost || !smtpForm.smtpUser}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50">
                {savingSmtp ? 'Salvando...' : 'Salvar SMTP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Excluir Empresa (confirmacao forte) */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-rose-500/20 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Excluir Empresa
              </h2>
              <button onClick={() => setDeleteTarget(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-300 text-sm mb-4">
              Esta acao e <strong className="text-rose-400">irreversivel</strong>. Todos os dados serao removidos permanentemente:
            </p>

            {deleteDeps && (
              <div className="bg-slate-900 rounded-xl p-4 mb-4 text-xs space-y-1">
                {deleteDeps.employees > 0 && <p className="text-slate-300">{deleteDeps.employees} colaboradores</p>}
                {deleteDeps.users > 0 && <p className="text-slate-300">{deleteDeps.users} usuarios</p>}
                {deleteDeps.vacations > 0 && <p className="text-slate-300">{deleteDeps.vacations} solicitacoes de ferias</p>}
                {deleteDeps.workplaces > 0 && <p className="text-slate-300">{deleteDeps.workplaces} postos de trabalho</p>}
                {deleteDeps.coverages > 0 && <p className="text-slate-300">{deleteDeps.coverages} coberturas</p>}
                {deleteDeps.auditLogs > 0 && <p className="text-slate-300">{deleteDeps.auditLogs} logs de auditoria</p>}
                {deleteDeps.webhooks > 0 && <p className="text-slate-300">{deleteDeps.webhooks} webhooks</p>}
              </div>
            )}

            <p className="text-slate-400 text-sm mb-2">
              Digite <strong className="text-white">{deleteTarget.name}</strong> para confirmar:
            </p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={deleteTarget.name}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-rose-500 focus:outline-none mb-4"
            />

            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm">
                Cancelar
              </button>
              <button
                onClick={confirmDeleteTenant}
                disabled={deleteConfirmName !== deleteTarget.name}
                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-500 font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Excluir Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
