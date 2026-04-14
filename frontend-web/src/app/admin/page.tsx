'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Shield, Building2, Users, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { InfoTooltip } from '@/components/InfoTooltip'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'

interface Tenant {
  id: string
  name: string
  cnpj: string
  createdAt: string
  _count: { users: number; employees: number }
}

interface Stats {
  tenants: number
  users: number
  employees: number
  vacations: number
}

export default function AdminPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [tenantForm, setTenantForm] = useState({ name: '', cnpj: '' })
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'ADMIN' })

  useEffect(() => {
    if (user?.role !== 'SUPERADMIN') return
    fetchData()
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
    } finally {
      setLoading(false)
    }
  }

  const createTenant = async () => {
    try {
      await HttpClient.post('/admin/tenants', tenantForm)
      toast.success('Empresa criada com sucesso!')
      setShowTenantModal(false)
      setTenantForm({ name: '', cnpj: '' })
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const deleteTenant = async (id: string) => {
    try {
      await HttpClient.delete(`/admin/tenants/${id}`)
      toast.success('Empresa removida.')
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
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
      toast.error(err.message)
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
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Shield className="w-7 h-7 text-amber-500" />
              Painel Super Admin
            </h1>
            <p className="text-slate-400 mt-1">Gerenciamento global de empresas e usuários.</p>
          </div>
        </div>

        {/* KPIs */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Empresas', value: stats.tenants, icon: Building2, color: 'text-indigo-400' },
              { label: 'Usuários', value: stats.users, icon: Users, color: 'text-emerald-400' },
              { label: 'Colaboradores', value: stats.employees, icon: Users, color: 'text-sky-400' },
              { label: 'Férias', value: stats.vacations, icon: Users, color: 'text-amber-400' },
            ].map((kpi) => (
              <div key={kpi.label} className="glass-card p-5 rounded-2xl border border-white/5">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{kpi.label}</p>
                <p className={`text-3xl font-black mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tenants List */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Empresas Cadastradas
            <InfoTooltip text="Lista de todas as empresas (tenants) cadastradas na plataforma. Cada empresa opera de forma isolada com seus próprios colaboradores e dados." />
          </h2>
          <button
            onClick={() => setShowTenantModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm"
          >
            <Plus className="w-4 h-4" /> Nova Empresa
          </button>
        </div>

        <div className="space-y-3">
          {tenants.map((t) => (
            <div key={t.id} className="bg-slate-800/50 border border-white/5 rounded-xl p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">{t.name}</h3>
                <p className="text-sm text-slate-400 mt-0.5">CNPJ: {t.cnpj} | {t._count.users} usuários | {t._count.employees} colaboradores</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSelectedTenantId(t.id); setShowUserModal(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/10"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Criar Usuário
                </button>
                <button
                  onClick={() => deleteTenant(t.id)}
                  className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {tenants.length === 0 && (
            <p className="text-center text-slate-500 py-8">Nenhuma empresa cadastrada. Crie a primeira.</p>
          )}
        </div>
      </div>

      {/* Modal: Nova Empresa */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Nova Empresa</h2>
              <button onClick={() => setShowTenantModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Nome da Empresa *
                  <InfoTooltip text="Nome oficial da empresa que será exibido em toda a plataforma." />
                </label>
                <input type="text" value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" placeholder="Ex: Green House Terceirização" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  CNPJ *
                  <InfoTooltip text="Cadastro Nacional da Pessoa Jurídica. Deve ser único para cada empresa." />
                </label>
                <input type="text" value={tenantForm.cnpj} onChange={(e) => setTenantForm({ ...tenantForm, cnpj: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" placeholder="00.000.000/0000-00" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTenantModal(false)} className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm">Cancelar</button>
              <button onClick={createTenant} disabled={!tenantForm.name || !tenantForm.cnpj} className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50">Criar</button>
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
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Nome *
                  <InfoTooltip text="Nome completo do usuário que será exibido na plataforma." />
                </label>
                <input type="text" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Email *
                  <InfoTooltip text="Email usado para login. Deve ser único dentro desta empresa." />
                </label>
                <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Senha *
                  <InfoTooltip text="Senha inicial do usuário. Ele poderá alterá-la depois." />
                </label>
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                  Perfil *
                  <InfoTooltip text="ADMIN: acesso total ao painel de RH da empresa. USER: colaborador que solicita férias. AUDITOR: acesso somente leitura." />
                </label>
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none">
                  <option value="ADMIN">Administrador (RH)</option>
                  <option value="USER">Colaborador</option>
                  <option value="AUDITOR">Auditor</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowUserModal(false)} className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm">Cancelar</button>
              <button onClick={createUser} disabled={!userForm.name || !userForm.email || !userForm.password}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
