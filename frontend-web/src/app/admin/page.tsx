'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import Link from 'next/link'
import {
  Shield, Building2, Users, UserPlus, X, Edit3, Plus,
  Briefcase, CalendarDays, Eye, LogIn, Trash2
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

  useEffect(() => {
    if (user?.role === 'SUPERADMIN') fetchData()
  }, [user])

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

  const deleteTenant = async (id: string) => {
    if (!confirm('Tem certeza? Esta ação não pode ser desfeita. Todos os dados da empresa serão removidos.')) return
    try {
      await HttpClient.delete(`/admin/tenants/${id}`)
      toast.success('Empresa removida com sucesso.')
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover empresa.')
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-amber-500" />
            Sala de Controle
          </h1>
          <p className="text-slate-400 mt-1">
            Visão geral de todas as empresas, usuários e métricas da plataforma.
          </p>
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
              <div key={t.id} className="glass-card rounded-xl border border-white/5 p-5 flex flex-col gap-4">
                {/* Top row: name + activity */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-base truncate">{t.name}</h3>
                      <span title={activity.label} className={`w-2.5 h-2.5 rounded-full ${activity.dot} shrink-0`} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{t.cnpj}</p>
                  </div>
                  <button
                    onClick={() => deleteTenant(t.id)}
                    className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0"
                    title="Excluir empresa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
    </div>
  )
}
