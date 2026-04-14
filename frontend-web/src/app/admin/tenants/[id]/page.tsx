'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { HttpClient } from '@/lib/api-client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Building2, Users, Briefcase, CalendarDays,
  MapPin, Edit3, X, LogIn, Shield, UserCheck, UserX,
  Mail, Phone, User, AlertTriangle
} from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'

interface TenantDetail {
  id: string
  name: string
  cnpj: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  responsible?: string
  createdAt: string
  users?: TenantUser[]
  _count: { users: number; employees: number }
}

interface TenantUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  employee?: { id: string; name: string } | null
}

interface TenantMetrics {
  employees: Record<string, number>
  totalEmployees: number
  pendingVacations: number
  totalWorkplaces: number
  activeAllocations: number
  coverageGaps: number
}

export default function TenantDetailPage() {
  const params = useParams()
  const tenantId = params.id as string
  const { user, switchTenant } = useAuth()

  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)

  // Modals
  const [showEditTenantModal, setShowEditTenantModal] = useState(false)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null)

  const [tenantForm, setTenantForm] = useState({
    name: '', cnpj: '', email: '', phone: '', address: '', city: '', state: '', responsible: ''
  })
  const [userEditForm, setUserEditForm] = useState({ name: '', role: '', isActive: true })
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [t, m, u] = await Promise.all([
        HttpClient.get(`/admin/tenants/${tenantId}`),
        HttpClient.get(`/admin/tenants/${tenantId}/metrics`).catch(() => null),
        HttpClient.get(`/admin/tenants/${tenantId}/users`)
      ])
      setTenant(t)
      setMetrics(m)
      setUsers(u)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar dados da empresa.')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    if (user?.role === 'SUPERADMIN' && tenantId) fetchData()
  }, [user, tenantId, fetchData])

  const openEditTenant = () => {
    if (!tenant) return
    setTenantForm({
      name: tenant.name, cnpj: tenant.cnpj, email: tenant.email || '',
      phone: tenant.phone || '', address: tenant.address || '',
      city: tenant.city || '', state: tenant.state || '', responsible: tenant.responsible || ''
    })
    setShowEditTenantModal(true)
  }

  const saveTenant = async () => {
    try {
      await HttpClient.patch(`/admin/tenants/${tenantId}`, tenantForm)
      toast.success('Empresa atualizada com sucesso!')
      setShowEditTenantModal(false)
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar empresa.')
    }
  }

  const handleSwitchTenant = async () => {
    try {
      setSwitching(true)
      await switchTenant(tenantId)
      toast.success('Você entrou na empresa. Use "Voltar ao Admin" para retornar.')
    } catch {
      // handled by switchTenant
    } finally {
      setSwitching(false)
    }
  }

  const openEditUser = (u: TenantUser) => {
    setEditingUser(u)
    setUserEditForm({ name: u.name, role: u.role, isActive: u.isActive })
    setShowEditUserModal(true)
  }

  const saveUser = async () => {
    if (!editingUser) return
    try {
      await HttpClient.patch(`/admin/tenants/${tenantId}/users/${editingUser.id}`, userEditForm)
      toast.success('Usuário atualizado com sucesso!')
      setShowEditUserModal(false)
      setEditingUser(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar usuário.')
    }
  }

  const toggleUserActive = async (u: TenantUser) => {
    const newStatus = !u.isActive
    const action = newStatus ? 'ativar' : 'desativar'
    if (!confirm(`Deseja ${action} o usuário "${u.name}"?`)) return
    try {
      setTogglingUserId(u.id)
      if (newStatus) {
        await HttpClient.patch(`/admin/tenants/${tenantId}/users/${u.id}`, { isActive: true })
      } else {
        await HttpClient.delete(`/admin/tenants/${tenantId}/users/${u.id}`)
      }
      toast.success(`Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso!`)
      fetchData()
    } catch (err: any) {
      toast.error(err.message || `Erro ao ${action} usuário.`)
    } finally {
      setTogglingUserId(null)
    }
  }

  const roleBadge = (role: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      ADMIN: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Admin' },
      USER: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Colaborador' },
      AUDITOR: { bg: 'bg-sky-500/20', text: 'text-sky-400', label: 'Auditor' },
      SUPERADMIN: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Super Admin' },
    }
    const cfg = map[role] || { bg: 'bg-slate-700', text: 'text-slate-400', label: role }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
    )
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

  if (!tenant) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-dashboard text-slate-400 gap-3">
        <AlertTriangle className="w-8 h-8" />
        <p>Empresa não encontrada.</p>
        <Link href="/admin" className="text-primary hover:underline text-sm">Voltar ao painel</Link>
      </div>
    )
  }

  const kpis = [
    {
      label: 'Colaboradores',
      value: metrics?.totalEmployees ?? tenant._count.employees,
      icon: Briefcase,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      tooltip: 'Total de colaboradores cadastrados nesta empresa.'
    },
    {
      label: 'Férias Pendentes',
      value: metrics?.pendingVacations ?? 0,
      icon: CalendarDays,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      tooltip: 'Solicitações de férias aguardando aprovação.'
    },
    {
      label: 'Postos de Trabalho',
      value: metrics?.totalWorkplaces ?? 0,
      icon: MapPin,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      tooltip: 'Total de postos de trabalho cadastrados.'
    },
    {
      label: 'Lacunas de Cobertura',
      value: metrics?.coverageGaps ?? 0,
      icon: AlertTriangle,
      color: metrics?.coverageGaps ? 'text-rose-400' : 'text-emerald-400',
      bg: metrics?.coverageGaps ? 'bg-rose-500/10' : 'bg-emerald-500/10',
      tooltip: 'Postos sem cobertura completa durante períodos de férias.'
    },
  ]

  return (
    <div className="flex-1 p-8 overflow-auto bg-dashboard">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao painel
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Building2 className="w-7 h-7 text-indigo-400" />
                {tenant.name}
              </h1>
              <p className="text-slate-500 text-sm mt-1 font-mono">{tenant.cnpj}</p>
            </div>
            <button
              onClick={handleSwitchTenant}
              disabled={switching}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 font-bold text-sm transition-colors disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {switching ? 'Entrando...' : 'Entrar nesta empresa'}
            </button>
          </div>
        </div>

        {/* Company Details */}
        <div className="glass-card rounded-xl border border-white/5 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-400" />
              Dados da Empresa
              <InfoTooltip text="Informações cadastrais da empresa. Clique em editar para alterar." />
            </h2>
            <button
              onClick={openEditTenant}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" /> Editar
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="flex items-center gap-1 text-slate-500 text-xs mb-0.5">
                <Mail className="w-3 h-3" /> Email
                <InfoTooltip text="Email comercial da empresa." />
              </span>
              <p className="text-white">{tenant.email || '—'}</p>
            </div>
            <div>
              <span className="flex items-center gap-1 text-slate-500 text-xs mb-0.5">
                <Phone className="w-3 h-3" /> Telefone
                <InfoTooltip text="Telefone comercial com DDD." />
              </span>
              <p className="text-white">{tenant.phone || '—'}</p>
            </div>
            <div>
              <span className="flex items-center gap-1 text-slate-500 text-xs mb-0.5">
                <MapPin className="w-3 h-3" /> Cidade/UF
                <InfoTooltip text="Localização da sede da empresa." />
              </span>
              <p className="text-white">
                {tenant.city ? `${tenant.city}${tenant.state ? `/${tenant.state}` : ''}` : '—'}
              </p>
            </div>
            <div>
              <span className="flex items-center gap-1 text-slate-500 text-xs mb-0.5">
                <User className="w-3 h-3" /> Responsável
                <InfoTooltip text="Representante ou responsável legal da empresa." />
              </span>
              <p className="text-white">{tenant.responsible || '—'}</p>
            </div>
            {tenant.address && (
              <div className="col-span-2 md:col-span-4">
                <span className="flex items-center gap-1 text-slate-500 text-xs mb-0.5">
                  <MapPin className="w-3 h-3" /> Endereço
                  <InfoTooltip text="Endereço comercial completo da empresa." />
                </span>
                <p className="text-white">{tenant.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Mini Dashboard KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="glass-card p-4 rounded-xl border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wide flex items-center gap-1">
                  {kpi.label}
                  <InfoTooltip text={kpi.tooltip} />
                </span>
                <div className={`p-1.5 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Users Table */}
        <div className="glass-card rounded-xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              Usuários ({users.length})
              <InfoTooltip text="Usuários com acesso ao sistema desta empresa. Alterne o status para ativar ou desativar." />
            </h2>
          </div>

          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="py-3 px-3 text-xs text-slate-500 uppercase font-bold">
                      <span className="flex items-center gap-1">
                        Nome <InfoTooltip text="Nome completo do usuário." />
                      </span>
                    </th>
                    <th className="py-3 px-3 text-xs text-slate-500 uppercase font-bold">
                      <span className="flex items-center gap-1">
                        Email <InfoTooltip text="Email utilizado para login." />
                      </span>
                    </th>
                    <th className="py-3 px-3 text-xs text-slate-500 uppercase font-bold">
                      <span className="flex items-center gap-1">
                        Perfil <InfoTooltip text="Nível de acesso do usuário no sistema." />
                      </span>
                    </th>
                    <th className="py-3 px-3 text-xs text-slate-500 uppercase font-bold text-center">
                      <span className="flex items-center gap-1 justify-center">
                        Status <InfoTooltip text="Ativo: pode acessar o sistema. Inativo: acesso bloqueado." />
                      </span>
                    </th>
                    <th className="py-3 px-3 text-xs text-slate-500 uppercase font-bold text-center">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                            {u.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-white">{u.name}</p>
                            {u.employee && (
                              <p className="text-[10px] text-slate-500">Vinculado: {u.employee.name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-400">{u.email}</td>
                      <td className="py-3 px-3">{roleBadge(u.role)}</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => toggleUserActive(u)}
                          disabled={togglingUserId === u.id}
                          className="inline-flex items-center gap-1.5 disabled:opacity-50"
                          title={u.isActive ? 'Clique para desativar' : 'Clique para ativar'}
                        >
                          {u.isActive ? (
                            <>
                              <div className="w-9 h-5 bg-emerald-600 rounded-full relative transition-colors">
                                <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full transition-all" />
                              </div>
                              <span className="text-xs text-emerald-400 font-bold">Ativo</span>
                            </>
                          ) : (
                            <>
                              <div className="w-9 h-5 bg-slate-600 rounded-full relative transition-colors">
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-slate-400 rounded-full transition-all" />
                              </div>
                              <span className="text-xs text-slate-500 font-bold">Inativo</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => openEditUser(u)}
                          className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                          title="Editar usuário"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">Nenhum usuário cadastrado nesta empresa.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Editar Empresa */}
      {showEditTenantModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Editar Empresa</h2>
              <button onClick={() => setShowEditTenantModal(false)} className="text-slate-400 hover:text-white">
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
                onClick={() => setShowEditTenantModal(false)}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveTenant}
                disabled={!tenantForm.name || !tenantForm.cnpj}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuário */}
      {showEditUserModal && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Editar Usuário</h2>
              <button onClick={() => { setShowEditUserModal(false); setEditingUser(null) }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Nome
                  <InfoTooltip text="Nome completo do usuário." />
                </label>
                <input
                  type="text"
                  value={userEditForm.name}
                  onChange={(e) => setUserEditForm({ ...userEditForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Perfil
                  <InfoTooltip text="Nível de acesso: Admin gerencia tudo, Colaborador tem acesso limitado, Auditor apenas visualiza." />
                </label>
                <select
                  value={userEditForm.role}
                  onChange={(e) => setUserEditForm({ ...userEditForm, role: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                >
                  <option value="ADMIN">Administrador (RH)</option>
                  <option value="USER">Colaborador</option>
                  <option value="AUDITOR">Auditor</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Status
                  <InfoTooltip text="Desativar um usuário impede o acesso ao sistema sem excluir os dados." />
                </label>
                <div className="flex items-center gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setUserEditForm({ ...userEditForm, isActive: !userEditForm.isActive })}
                    className="inline-flex items-center gap-2"
                  >
                    {userEditForm.isActive ? (
                      <>
                        <div className="w-9 h-5 bg-emerald-600 rounded-full relative">
                          <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full" />
                        </div>
                        <span className="text-sm text-emerald-400 font-bold">Ativo</span>
                      </>
                    ) : (
                      <>
                        <div className="w-9 h-5 bg-slate-600 rounded-full relative">
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-slate-400 rounded-full" />
                        </div>
                        <span className="text-sm text-slate-500 font-bold">Inativo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowEditUserModal(false); setEditingUser(null) }}
                className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveUser}
                disabled={!userEditForm.name}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
