'use client'

import React, { useEffect, useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import {
  KeyRound, Mail, MessageSquare, Plus, Trash2, Edit3, Send,
  CheckCircle2, XCircle, X, AlertTriangle, Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthContext'
import { PasswordInput } from '@/components/PasswordInput'
import { InfoTooltip } from '@/components/InfoTooltip'
import { MasterKeyPanel } from '@/components/MasterKeyPanel'

type Scope = 'ALL' | 'SPECIFIC'

interface EmailCred {
  id: string
  name: string
  description: string | null
  scope: Scope
  isActive: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string // mascarado
  smtpFrom: string | null
  tenantIds: string[]
}

interface WhatsappCred {
  id: string
  name: string
  description: string | null
  scope: Scope
  isActive: boolean
  evoApiUrl: string
  evoApiKey: string // mascarado
  evoInstanceName: string
  tenantIds: string[]
}

interface Tenant { id: string; name: string }

export default function CredentialsPage() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SUPERADMIN'

  const [tab, setTab] = useState<'email' | 'whatsapp' | 'masterkey'>('email')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [emailCreds, setEmailCreds] = useState<EmailCred[]>([])
  const [whatsappCreds, setWhatsappCreds] = useState<WhatsappCred[]>([])
  const [loading, setLoading] = useState(true)

  // Modais
  const [editingEmail, setEditingEmail] = useState<Partial<EmailCred> | null>(null)
  const [editingWhatsapp, setEditingWhatsapp] = useState<Partial<WhatsappCred> | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<any[] | null>(null)

  // Pop-up de teste
  const [testTarget, setTestTarget] = useState<{ kind: 'email' | 'whatsapp'; id: string; name: string } | null>(null)
  const [testInput, setTestInput] = useState('')
  const [testing, setTesting] = useState(false)

  async function loadAll() {
    setLoading(true)
    // Independentes: se uma falhar, as outras devem carregar normalmente
    const results = await Promise.allSettled([
      HttpClient.get('/admin/tenants'),
      HttpClient.get('/admin/credentials/email'),
      HttpClient.get('/admin/credentials/whatsapp')
    ])
    const [tenantsRes, emails, whatsapps] = results

    if (tenantsRes.status === 'fulfilled') {
      setTenants(tenantsRes.value)
    } else {
      toast.error(`Falha ao carregar tenants: ${tenantsRes.reason?.message || 'erro'}`)
    }

    if (emails.status === 'fulfilled') {
      setEmailCreds(emails.value)
    } else {
      const msg = emails.reason?.message || 'erro'
      if (!msg.toLowerCase().includes('fetch')) {
        toast.error(`SMTP: ${msg}`)
      } else {
        toast.error('Falha de rede ao carregar credenciais SMTP. Verifique se o backend foi reiniciado.')
      }
    }

    if (whatsapps.status === 'fulfilled') {
      setWhatsappCreds(whatsapps.value)
    } else {
      const msg = whatsapps.reason?.message || 'erro'
      if (!msg.toLowerCase().includes('fetch')) {
        toast.error(`WhatsApp: ${msg}`)
      }
    }

    setLoading(false)
  }

  useEffect(() => { if (isSuperAdmin) loadAll() }, [isSuperAdmin])

  if (!isSuperAdmin) {
    return <div className="p-8 text-slate-400 text-sm">Apenas Super Admins acessam esta página.</div>
  }

  const tenantsById = new Map(tenants.map(t => [t.id, t.name]))

  // Save handlers ──────────────────────────
  async function saveEmail() {
    if (!editingEmail) return
    setSaving(true); setConflicts(null)
    try {
      const payload: any = { ...editingEmail }
      if (payload.smtpPort) payload.smtpPort = Number(payload.smtpPort)
      if (payload.id) {
        await HttpClient.patch(`/admin/credentials/email/${payload.id}`, payload)
      } else {
        await HttpClient.post('/admin/credentials/email', payload)
      }
      toast.success('Credencial SMTP salva.')
      setEditingEmail(null)
      await loadAll()
    } catch (e: any) {
      if (e.body?.conflicts) {
        setConflicts(e.body.conflicts)
        toast.error(e.body.message || 'Conflito de cobertura.')
        return
      }
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveWhatsapp() {
    if (!editingWhatsapp) return
    setSaving(true); setConflicts(null)
    try {
      const payload: any = { ...editingWhatsapp }
      if (payload.id) {
        await HttpClient.patch(`/admin/credentials/whatsapp/${payload.id}`, payload)
      } else {
        await HttpClient.post('/admin/credentials/whatsapp', payload)
      }
      toast.success('Credencial WhatsApp salva.')
      setEditingWhatsapp(null)
      await loadAll()
    } catch (e: any) {
      if (e.body?.conflicts) {
        setConflicts(e.body.conflicts)
        toast.error(e.body.message || 'Conflito de cobertura.')
        return
      }
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeCred(kind: 'email' | 'whatsapp', id: string, name: string) {
    if (!confirm(`Remover credencial "${name}"?`)) return
    try {
      await HttpClient.delete(`/admin/credentials/${kind}/${id}`)
      toast.success('Removida.')
      await loadAll()
    } catch (e: any) { toast.error(e.message) }
  }

  async function runTest() {
    if (!testTarget || !testInput.trim()) return
    setTesting(true)
    try {
      const result = await HttpClient.post(`/admin/credentials/${testTarget.kind}/${testTarget.id}/test`, { to: testInput.trim() })
      if (result.ok) {
        toast.success(`Teste OK — ${testTarget.kind === 'email' ? 'e-mail entregue' : 'mensagem enviada'}.`)
        setTestTarget(null); setTestInput('')
      } else {
        toast.error(`Falha: ${result.message || result.error || 'erro desconhecido'}`)
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="w-5 h-5 text-indigo-400" />
        <h1 className="text-xl font-semibold text-white">Credenciais Globais</h1>
        <InfoTooltip text="Pool de credenciais SMTP e WhatsApp. Cada credencial pode valer para todos os tenants (ALL) ou apenas para uma seleção (SPECIFIC). O sistema garante que cada tenant é coberto por no máximo UMA credencial ativa por tipo." />
      </div>
      <p className="text-xs text-slate-500 mb-5">
        Gerencie múltiplas credenciais e atribua a tenants específicos. Conflitos (tenant coberto por 2+ credenciais) são bloqueados.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-white/5">
        <button
          onClick={() => setTab('email')}
          className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === 'email' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <Mail className="w-3.5 h-3.5 inline mr-1.5" /> SMTP / E-mail ({emailCreds.length})
        </button>
        <button
          onClick={() => setTab('whatsapp')}
          className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === 'whatsapp' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" /> WhatsApp ({whatsappCreds.length})
        </button>
        <button
          onClick={() => setTab('masterkey')}
          className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === 'masterkey' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <KeyRound className="w-3.5 h-3.5 inline mr-1.5" /> Master Key
        </button>
      </div>

      {tab === 'masterkey' ? (
        <MasterKeyPanel />
      ) : loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">Carregando…</div>
      ) : tab === 'email' ? (
        <CredList
          kind="email"
          rows={emailCreds.map(c => ({
            id: c.id, name: c.name, description: c.description, scope: c.scope, isActive: c.isActive, tenantIds: c.tenantIds,
            details: `${c.smtpUser}@${c.smtpHost}:${c.smtpPort}`
          }))}
          tenantsById={tenantsById}
          onNew={() => setEditingEmail({ scope: 'ALL', isActive: true, tenantIds: [], smtpPort: 587 })}
          onEdit={(id) => setEditingEmail(emailCreds.find(c => c.id === id) || null)}
          onTest={(id, name) => setTestTarget({ kind: 'email', id, name })}
          onRemove={removeCred}
        />
      ) : (
        <CredList
          kind="whatsapp"
          rows={whatsappCreds.map(c => ({
            id: c.id, name: c.name, description: c.description, scope: c.scope, isActive: c.isActive, tenantIds: c.tenantIds,
            details: `${c.evoInstanceName} @ ${c.evoApiUrl}`
          }))}
          tenantsById={tenantsById}
          onNew={() => setEditingWhatsapp({ scope: 'ALL', isActive: true, tenantIds: [] })}
          onEdit={(id) => setEditingWhatsapp(whatsappCreds.find(c => c.id === id) || null)}
          onTest={(id, name) => setTestTarget({ kind: 'whatsapp', id, name })}
          onRemove={removeCred}
        />
      )}

      {/* Modal: Editar Email Credential */}
      {editingEmail && (
        <CredEditorModal
          title={editingEmail.id ? 'Editar credencial SMTP' : 'Nova credencial SMTP'}
          onClose={() => { setEditingEmail(null); setConflicts(null) }}
          onSave={saveEmail}
          saving={saving}
          conflicts={conflicts}
          tenantsById={tenantsById}
        >
          <CommonFields
            value={editingEmail}
            tenants={tenants}
            onChange={(v) => setEditingEmail({ ...editingEmail, ...v })}
          />
          <hr className="border-white/5 my-3" />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-400 mb-1">Servidor SMTP</label>
              <input type="text" value={editingEmail.smtpHost || ''} onChange={(e) => setEditingEmail({ ...editingEmail, smtpHost: e.target.value })}
                placeholder="smtp.gmail.com" className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Porta</label>
              <input type="number" value={editingEmail.smtpPort || ''} onChange={(e) => setEditingEmail({ ...editingEmail, smtpPort: Number(e.target.value) })}
                placeholder="587" className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">Usuário</label>
            <input type="text" value={editingEmail.smtpUser || ''} onChange={(e) => setEditingEmail({ ...editingEmail, smtpUser: e.target.value })}
              placeholder="email@empresa.com" className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">Senha</label>
            <PasswordInput
              value={editingEmail.smtpPass === '••••••••' ? '' : (editingEmail.smtpPass || '')}
              onChange={(e) => setEditingEmail({ ...editingEmail, smtpPass: e.target.value })}
              placeholder={editingEmail.id ? 'Deixe em branco para manter a atual' : 'Senha SMTP'}
              autoComplete="new-password"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            />
            {editingEmail.id && (
              <p className="text-[10px] text-slate-500 mt-1">
                Por segurança, a senha salva nunca é exibida. Deixe em branco para mantê-la.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">From (opcional)</label>
            <input type="email" value={editingEmail.smtpFrom || ''} onChange={(e) => setEditingEmail({ ...editingEmail, smtpFrom: e.target.value })}
              placeholder="noreply@empresa.com" className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
        </CredEditorModal>
      )}

      {/* Modal: Editar WhatsApp Credential */}
      {editingWhatsapp && (
        <CredEditorModal
          title={editingWhatsapp.id ? 'Editar credencial WhatsApp' : 'Nova credencial WhatsApp'}
          onClose={() => { setEditingWhatsapp(null); setConflicts(null) }}
          onSave={saveWhatsapp}
          saving={saving}
          conflicts={conflicts}
          tenantsById={tenantsById}
        >
          <CommonFields
            value={editingWhatsapp}
            tenants={tenants}
            onChange={(v) => setEditingWhatsapp({ ...editingWhatsapp, ...v })}
          />
          <hr className="border-white/5 my-3" />
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">URL da Evolution API</label>
            <input type="text" value={editingWhatsapp.evoApiUrl || ''} onChange={(e) => setEditingWhatsapp({ ...editingWhatsapp, evoApiUrl: e.target.value })}
              placeholder="https://evo.empresa.com" className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            <p className="text-[10px] text-slate-500 mt-1">Pode terminar com / ou sem — ambos funcionam.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">API Key</label>
            <PasswordInput
              value={editingWhatsapp.evoApiKey === '••••••••' ? '' : (editingWhatsapp.evoApiKey || '')}
              onChange={(e) => setEditingWhatsapp({ ...editingWhatsapp, evoApiKey: e.target.value })}
              placeholder={editingWhatsapp.id ? 'Deixe em branco para manter a atual' : 'Cole a API key'}
              autoComplete="new-password"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            />
            {editingWhatsapp.id && (
              <p className="text-[10px] text-slate-500 mt-1">
                Por segurança, a API key salva nunca é exibida. Deixe em branco para mantê-la.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">Nome da Instância</label>
            <input type="text" value={editingWhatsapp.evoInstanceName || ''} onChange={(e) => setEditingWhatsapp({ ...editingWhatsapp, evoInstanceName: e.target.value })}
              placeholder="instance01" className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
        </CredEditorModal>
      )}

      {/* Pop-up: Teste */}
      {testTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => setTestTarget(null)}>
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" /> Testar "{testTarget.name}"
              </h3>
              <button onClick={() => setTestTarget(null)} aria-label="Fechar"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              {testTarget.kind === 'email'
                ? 'Vamos enviar um e-mail real com esta credencial.'
                : 'Vamos enviar uma mensagem WhatsApp real com esta credencial. Pode digitar com ou sem máscara.'}
            </p>
            <input
              type={testTarget.kind === 'email' ? 'email' : 'tel'}
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder={testTarget.kind === 'email' ? 'destino@empresa.com' : '(61) 99999-9999'}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-3"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setTestTarget(null)} className="px-3 py-1.5 border border-white/10 text-slate-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={runTest} disabled={testing || !testInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────── Sub-componentes ──────────────────────────

function CredList({
  kind, rows, tenantsById, onNew, onEdit, onTest, onRemove
}: {
  kind: 'email' | 'whatsapp'
  rows: { id: string; name: string; description: string | null; scope: Scope; isActive: boolean; tenantIds: string[]; details: string }[]
  tenantsById: Map<string, string>
  onNew: () => void
  onEdit: (id: string) => void
  onTest: (id: string, name: string) => void
  onRemove: (kind: 'email' | 'whatsapp', id: string, name: string) => void
}) {
  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={onNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold">
          <Plus className="w-3.5 h-3.5" /> Nova credencial
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400 border border-white/5 rounded-xl p-6 text-center">
          Nenhuma credencial cadastrada. Clique em "Nova credencial" para criar.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-white text-sm">{r.name}</h3>
                    {r.isActive ? (
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">Ativa</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 bg-slate-500/20 text-slate-300 rounded">Inativa</span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded ${r.scope === 'ALL' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
                      {r.scope === 'ALL' ? 'Todos os tenants' : `${r.tenantIds.length} tenant(s)`}
                    </span>
                  </div>
                  {r.description && <p className="text-xs text-slate-400 mb-1">{r.description}</p>}
                  <p className="text-[11px] text-slate-500 font-mono truncate">{r.details}</p>
                  {r.scope === 'SPECIFIC' && r.tenantIds.length > 0 && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      → {r.tenantIds.slice(0, 5).map(tid => tenantsById.get(tid) || tid.slice(0, 8)).join(', ')}
                      {r.tenantIds.length > 5 && ` +${r.tenantIds.length - 5}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onTest(r.id, r.name)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg text-xs font-bold"
                    title="Testar conexão enviando e-mail/mensagem real"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Testar
                  </button>
                  <button onClick={() => onEdit(r.id)} className="p-1.5 text-slate-400 hover:bg-white/5 rounded-lg" title="Editar">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onRemove(kind, r.id, r.name)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg" title="Remover">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function CommonFields({
  value, tenants, onChange
}: {
  value: { name?: string; description?: string | null; scope?: Scope; isActive?: boolean; tenantIds?: string[] }
  tenants: Tenant[]
  onChange: (patch: any) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1">Nome <span className="text-rose-400">*</span></label>
        <input type="text" value={value.name || ''} onChange={(e) => onChange({ name: e.target.value })}
          placeholder='Ex: "Zoho Principal", "AWS SES"' className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1">Descrição</label>
        <input type="text" value={value.description || ''} onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Breve descrição/uso desta credencial" className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={value.isActive ?? true} onChange={(e) => onChange({ isActive: e.target.checked })} />
          Ativa
        </label>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1">
          Escopo <InfoTooltip text="ALL: vale para TODOS os tenants. SPECIFIC: vale apenas para os tenants selecionados abaixo." />
        </label>
        <div className="flex gap-2">
          {(['ALL', 'SPECIFIC'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ scope: s, tenantIds: s === 'ALL' ? [] : value.tenantIds })}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border ${
                value.scope === s
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
            >
              {s === 'ALL' ? 'Todos os tenants' : 'Tenants específicos'}
            </button>
          ))}
        </div>
      </div>
      {value.scope === 'SPECIFIC' && (
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1">Tenants elegíveis</label>
          <div className="bg-slate-900 border border-white/10 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
            {tenants.length === 0 ? (
              <p className="text-xs text-slate-500 px-2 py-1">Nenhum tenant cadastrado.</p>
            ) : tenants.map(t => (
              <label key={t.id} className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value.tenantIds || []).includes(t.id)}
                  onChange={(e) => {
                    const set = new Set(value.tenantIds || [])
                    if (e.target.checked) set.add(t.id); else set.delete(t.id)
                    onChange({ tenantIds: Array.from(set) })
                  }}
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CredEditorModal({
  title, onClose, onSave, saving, conflicts, tenantsById, children
}: {
  title: string
  onClose: () => void
  onSave: () => void
  saving: boolean
  conflicts: any[] | null
  tenantsById: Map<string, string>
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        {conflicts && conflicts.length > 0 && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
            <div className="flex items-center gap-1.5 font-bold mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Conflito de cobertura — esta operação NÃO foi salva
            </div>
            <p className="mb-2">Os tenants abaixo ficariam cobertos por mais de uma credencial ativa do mesmo tipo, o que não é permitido:</p>
            <ul className="space-y-1 ml-4 list-disc">
              {conflicts.map((c) => (
                <li key={c.tenantId}>
                  <strong>{tenantsById.get(c.tenantId) || c.tenantId.slice(0, 8)}</strong> está coberto por: {' '}
                  {c.conflictingCredentials.map((cc: any) => `"${cc.name}" (${cc.scope})`).join(' + ')}
                </li>
              ))}
            </ul>
            <p className="mt-2 italic">Resolva: desative ou ajuste o escopo das credenciais conflitantes antes de salvar.</p>
          </div>
        )}
        <div className="space-y-3">{children}</div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 border border-white/10 text-slate-300 rounded-lg text-sm">Cancelar</button>
          <button onClick={onSave} disabled={saving}
            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
