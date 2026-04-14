'use client'

import React, { useState, useEffect } from 'react'
import { HttpClient } from '@/lib/api-client'
import { Shield, Building2, Users, Plus, Trash2, UserPlus, X, Edit3, ChevronDown, ChevronRight } from 'lucide-react'
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
  createdAt: string
  _count: { users: number; employees: number }
}

export default function AdminPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tenantUsers, setTenantUsers] = useState<any[]>([])

  // Modals
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [selectedTenantId, setSelectedTenantId] = useState('')

  const [tenantForm, setTenantForm] = useState({
    name: '', cnpj: '', email: '', phone: '', address: '', city: '', state: '', responsible: ''
  })
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'ADMIN' })

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
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const expandTenant = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    try {
      const users = await HttpClient.get(`/admin/tenants/${id}/users`)
      setTenantUsers(users)
    } catch { setTenantUsers([]) }
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
        toast.success('Empresa atualizada!')
      } else {
        await HttpClient.post('/admin/tenants', tenantForm)
        toast.success('Empresa criada!')
      }
      setShowTenantModal(false)
      fetchData()
    } catch (err: any) { toast.error(err.message) }
  }

  const deleteTenant = async (id: string) => {
    if (!confirm('Tem certeza? Esta acao nao pode ser desfeita.')) return
    try {
      await HttpClient.delete(`/admin/tenants/${id}`)
      toast.success('Empresa removida.')
      fetchData()
    } catch (err: any) { toast.error(err.message) }
  }

  const createUser = async () => {
    try {
      await HttpClient.post(`/admin/tenants/${selectedTenantId}/users`, userForm)
      toast.success('Usuario criado!')
      setShowUserModal(false)
      setUserForm({ name: '', email: '', password: '', role: 'ADMIN' })
      expandTenant(selectedTenantId)
      fetchData()
    } catch (err: any) { toast.error(err.message) }
  }

  if (user?.role !== 'SUPERADMIN') {
    return <div className="flex-1 flex items-center justify-center text-slate-400">Acesso restrito ao Super Administrador.</div>
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  }

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-amber-500" />
            Painel Super Admin
          </h1>
          <p className="text-slate-400 mt-1">Gerenciamento de empresas, usuarios e plataforma.</p>
        </div>

        {/* KPIs */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Empresas', value: stats.tenants, color: 'text-indigo-400' },
              { label: 'Usuarios', value: stats.users, color: 'text-emerald-400' },
              { label: 'Colaboradores', value: stats.employees, color: 'text-sky-400' },
              { label: 'Solicitacoes', value: stats.vacations, color: 'text-amber-400' },
            ].map((kpi) => (
              <div key={kpi.label} className="glass-card p-4 rounded-xl border border-white/5 text-center">
                <p className="text-xs text-slate-500 uppercase font-bold">{kpi.label}</p>
                <p className={`text-2xl font-black mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tenants */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Empresas
            <InfoTooltip text="Cada empresa opera isolada com seus proprios dados, colaboradores e configuracoes." />
          </h2>
          <button onClick={openCreateTenant}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm">
            <Plus className="w-4 h-4" /> Nova Empresa
          </button>
        </div>

        <div className="space-y-3">
          {tenants.map((t) => (
            <div key={t.id} className="bg-slate-800/50 border border-white/5 rounded-xl overflow-hidden">
              <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/5" onClick={() => expandTenant(t.id)}>
                <div className="flex items-center gap-3">
                  {expandedId === t.id ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  <div>
                    <h3 className="font-bold text-white">{t.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      CNPJ: {t.cnpj}
                      {t.city && ` | ${t.city}`}{t.state && `/${t.state}`}
                      {t.responsible && ` | Resp: ${t.responsible}`}
                      {` | ${t._count.users} usuarios | ${t._count.employees} colaboradores`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEditTenant(t)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-400 border border-white/10 rounded-lg hover:bg-white/5">
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button onClick={() => { setSelectedTenantId(t.id); setShowUserModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/10">
                    <UserPlus className="w-3.5 h-3.5" /> Usuario
                  </button>
                  <button onClick={() => deleteTenant(t.id)}
                    className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded: users + details */}
              {expandedId === t.id && (
                <div className="border-t border-white/5 p-5 space-y-4">
                  {/* Company details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {t.email && <div><span className="text-slate-500">Email:</span> <span className="text-white">{t.email}</span></div>}
                    {t.phone && <div><span className="text-slate-500">Telefone:</span> <span className="text-white">{t.phone}</span></div>}
                    {t.address && <div className="col-span-2"><span className="text-slate-500">Endereco:</span> <span className="text-white">{t.address}</span></div>}
                  </div>

                  {/* Users list */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-400 mb-2">Usuarios desta empresa</h4>
                    {tenantUsers.length > 0 ? (
                      <div className="space-y-2">
                        {tenantUsers.map((u: any) => (
                          <div key={u.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                                {u.name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{u.name}</p>
                                <p className="text-xs text-slate-500">{u.email}</p>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.role === 'ADMIN' ? 'bg-amber-500/20 text-amber-400' :
                              u.role === 'USER' ? 'bg-emerald-500/20 text-emerald-400' :
                              'bg-slate-700 text-slate-400'
                            }`}>{u.role}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 italic">Nenhum usuario cadastrado.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {tenants.length === 0 && (
            <p className="text-center text-slate-500 py-8">Nenhuma empresa cadastrada.</p>
          )}
        </div>
      </div>

      {/* Modal: Tenant (criar/editar) */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{editingTenant ? 'Editar Empresa' : 'Nova Empresa'}</h2>
              <button onClick={() => setShowTenantModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Nome da Empresa * <InfoTooltip text="Razao social ou nome fantasia da empresa." />
                  </label>
                  <input type="text" value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    CNPJ * <InfoTooltip text="Cadastro Nacional da Pessoa Juridica." />
                  </label>
                  <input type="text" value={tenantForm.cnpj} onChange={(e) => setTenantForm({ ...tenantForm, cnpj: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                    placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Responsavel <InfoTooltip text="Nome do responsavel ou representante legal da empresa." />
                  </label>
                  <input type="text" value={tenantForm.responsible} onChange={(e) => setTenantForm({ ...tenantForm, responsible: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Email <InfoTooltip text="Email comercial da empresa para contato." />
                  </label>
                  <input type="email" value={tenantForm.email} onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Telefone <InfoTooltip text="Telefone comercial com DDD." />
                  </label>
                  <input type="text" value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                    placeholder="(00) 00000-0000" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">
                    Endereco <InfoTooltip text="Endereco comercial da empresa." />
                  </label>
                  <input type="text" value={tenantForm.address} onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-400 mb-1 block">Cidade</label>
                  <input type="text" value={tenantForm.city} onChange={(e) => setTenantForm({ ...tenantForm, city: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-400 mb-1 block">UF</label>
                  <input type="text" value={tenantForm.state} onChange={(e) => setTenantForm({ ...tenantForm, state: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none"
                    placeholder="DF" maxLength={2} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTenantModal(false)} className="flex-1 py-2.5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 font-bold text-sm">Cancelar</button>
              <button onClick={saveTenant} disabled={!tenantForm.name || !tenantForm.cnpj}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/80 font-bold text-sm disabled:opacity-50">
                {editingTenant ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Usuario */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Criar Usuario</h2>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">Nome * <InfoTooltip text="Nome completo do usuario." /></label>
                <input type="text" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">Email * <InfoTooltip text="Email para login. Unico por empresa." /></label>
                <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">Senha * <InfoTooltip text="Senha inicial. O usuario podera alterar depois." /></label>
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-400 mb-1">Perfil * <InfoTooltip text="ADMIN: gestao completa do RH. USER: colaborador. AUDITOR: somente leitura." /></label>
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
