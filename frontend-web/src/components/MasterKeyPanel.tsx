'use client'

import React, { useEffect, useState } from 'react'
import { KeyRound, AlertTriangle, Power, LogIn } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { PasswordInput } from '@/components/PasswordInput'
import { InfoTooltip } from '@/components/InfoTooltip'

/**
 * Painel Master Key (acesso emergencial) — renderizado como tab em /admin/credentials.
 * Exige role SUPERADMIN (validado no backend; aqui apenas fornece UI).
 */
export function MasterKeyPanel() {
  const [status, setStatus] = useState<{
    enabled: boolean; hasKey: boolean; preview: string | null; updatedAt: string | null
  }>({ enabled: false, hasKey: false, preview: null, updatedAt: null })
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [loading, setLoading] = useState(false)

  // "Usar MasterKey" — acesso emergencial
  const [useEmail, setUseEmail] = useState('')
  const [useKey, setUseKey] = useState('')
  const [accessing, setAccessing] = useState(false)

  const fetchStatus = async () => {
    try {
      const [s, l] = await Promise.all([
        HttpClient.get('/admin/master-key').catch(() => ({ enabled: false, hasKey: false, preview: null, updatedAt: null })),
        HttpClient.get('/admin/master-key-logs?limit=50').catch(() => ({ logs: [], total: 0 }))
      ])
      setStatus(s)
      setLogs(l.logs || [])
      setTotal(l.total || 0)
    } catch { /* silent */ }
  }

  useEffect(() => { fetchStatus() }, [])

  const generate = async (customKey?: string) => {
    const isCustom = !!(customKey && customKey.trim())
    if (!confirm(isCustom
      ? 'Definir esta MasterKey customizada? A anterior será substituída.'
      : 'Gerar nova MasterKey aleatória? A anterior será substituída.')) return
    setLoading(true)
    try {
      const result = await HttpClient.post('/admin/master-key/generate', isCustom ? { customKey: customKey!.trim() } : {})
      setGeneratedKey(result.key)
      toast.success(isCustom ? 'MasterKey customizada salva!' : 'MasterKey gerada! Copie e guarde em local seguro.')
      setCustomInput('')
      await fetchStatus()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar MasterKey.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = async (enabled: boolean) => {
    setLoading(true)
    try {
      await HttpClient.patch('/admin/master-key', { enabled })
      toast.success(`MasterKey ${enabled ? 'ativada' : 'desativada'}.`)
      await fetchStatus()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status.')
    } finally {
      setLoading(false)
    }
  }

  const revoke = async () => {
    if (!confirm('Revogar MasterKey? O acesso emergencial será desabilitado completamente.')) return
    setLoading(true)
    try {
      await HttpClient.delete('/admin/master-key')
      setGeneratedKey(null)
      toast.success('MasterKey revogada.')
      await fetchStatus()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao revogar.')
    } finally {
      setLoading(false)
    }
  }

  // Usa MasterKey para logar como outro usuário (acesso emergencial)
  const useMasterKey = async () => {
    if (!useEmail.trim() || !useKey.trim()) {
      toast.error('Informe e-mail e MasterKey.')
      return
    }
    if (!confirm(`Acessar a conta de "${useEmail}" usando MasterKey? Esta ação é auditada e substituirá sua sessão atual.`)) return
    setAccessing(true)
    try {
      const result = await HttpClient.post('/masterkey', { email: useEmail.trim(), masterKey: useKey.trim() })
      // Substituir tokens no localStorage (a sessão atual do SUPERADMIN vira a do alvo)
      localStorage.setItem('token', result.token)
      if (result.refreshToken) localStorage.setItem('refreshToken', result.refreshToken)
      toast.success(`Acessando como ${result.user?.email || useEmail}. Redirecionando...`)
      setUseEmail(''); setUseKey('')
      // Refresh forçado da página raiz para reavaliar rota e role
      setTimeout(() => { window.location.href = result.user?.role === 'USER' ? '/employee' : '/dashboard' }, 500)
    } catch (err: any) {
      toast.error(err.message || 'Falha no acesso emergencial. Verifique e-mail e chave.')
    } finally {
      setAccessing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="block mb-0.5">Recurso de emergência</strong>
          Permite acesso como qualquer usuário via rota protegida (<code>POST /api/v1/masterkey</code>). Use apenas quando necessário. Todas as tentativas são auditadas.
        </div>
      </div>

      {/* Status */}
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Status da MasterKey
              <InfoTooltip text="Chave usada para acessar qualquer conta. Guarde em local seguro; só é exibida uma vez após geração." />
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {status.hasKey ? `Chave: ${status.preview}` : 'Nenhuma chave configurada'}
              {status.updatedAt && ` · Atualizada: ${new Date(status.updatedAt).toLocaleString('pt-BR')}`}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            status.enabled
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
              : 'bg-slate-500/20 text-slate-400 border border-slate-500/20'
          }`}>
            {status.enabled ? 'ATIVA' : 'INATIVA'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generate()}
            disabled={loading}
            className="px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 font-bold text-xs disabled:opacity-50"
          >
            {status.hasKey ? 'Rotacionar Chave (auto)' : 'Gerar MasterKey (auto)'}
          </button>
          {status.hasKey && (
            <>
              <button
                onClick={() => toggle(!status.enabled)}
                disabled={loading}
                className={`px-4 py-2 rounded-xl font-bold text-xs border disabled:opacity-50 ${
                  status.enabled
                    ? 'border-amber-500/20 text-amber-400 hover:bg-amber-500/10'
                    : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                <Power className="w-3.5 h-3.5 inline mr-1" />
                {status.enabled ? 'Desativar' : 'Ativar'}
              </button>
              <button
                onClick={revoke}
                disabled={loading}
                className="px-4 py-2 border border-rose-500/20 text-rose-400 rounded-xl hover:bg-rose-500/10 font-bold text-xs disabled:opacity-50"
              >
                Revogar
              </button>
            </>
          )}
        </div>

        {/* Definir manual */}
        <div className="mt-4 p-3 bg-slate-900/50 border border-white/5 rounded-xl">
          <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-indigo-400" /> Ou defina uma MasterKey manual
            <InfoTooltip text="Você escolhe a chave (mínimo 3 caracteres). Útil se quer reutilizar uma passphrase já memorizada." />
          </p>
          <div className="flex gap-2">
            <PasswordInput
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Mínimo 3 caracteres"
              minLength={3}
              className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            />
            <button
              onClick={() => generate(customInput)}
              disabled={loading || customInput.trim().length < 3}
              className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-bold text-xs disabled:opacity-40 shrink-0"
            >
              Salvar Manual
            </button>
          </div>
        </div>

        {/* Chave gerada (uma vez) */}
        {generatedKey && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <p className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Sua nova MasterKey (copie agora — não será exibida novamente):
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
              Uso: <code>POST /api/v1/masterkey</code> com <code>{`{"email":"usuario@empresa.com","masterKey":"<sua_chave>"}`}</code>
            </p>
          </div>
        )}
      </div>

      {/* Usar MasterKey (acesso emergencial) */}
      <div className="bg-slate-900/40 border border-amber-500/20 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <LogIn className="w-4 h-4 text-amber-400" />
          Usar MasterKey — Acesso Emergencial
          <InfoTooltip text="Acessa a conta de qualquer usuário cadastrado (ADMIN, USER, etc.) fornecendo o e-mail dele + sua MasterKey. Útil quando um cliente perdeu acesso. A tentativa é registrada no histórico." />
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Requisitos: MasterKey precisa estar <strong>ATIVA</strong> (acima) e você conhecer o e-mail do usuário alvo.
          Sua sessão atual será <strong>substituída</strong> pela do usuário. Para voltar, faça logout e login novamente.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            type="email"
            value={useEmail}
            onChange={(e) => setUseEmail(e.target.value)}
            placeholder="E-mail do usuário alvo"
            className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            autoComplete="off"
          />
          <PasswordInput
            value={useKey}
            onChange={(e) => setUseKey(e.target.value)}
            placeholder="MasterKey"
            autoComplete="off"
            className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
          />
          <button
            onClick={useMasterKey}
            disabled={accessing || !useEmail.trim() || !useKey.trim() || !status.enabled}
            title={!status.enabled ? 'Ative a MasterKey primeiro' : 'Acessar emergencialmente'}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-xs disabled:opacity-40 flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5" />
            {accessing ? 'Acessando...' : 'Acessar'}
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          Histórico de Usos
          <span className="text-[10px] text-slate-500 font-normal">({total} total, exibindo últimos 50)</span>
        </h3>
        {logs.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Nenhum uso registrado.</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {logs.map(l => (
              <div key={l.id} className="text-xs bg-slate-900/60 rounded-lg px-3 py-1.5 flex items-center gap-2 border border-white/5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.success ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-mono text-slate-500 w-32 shrink-0">{new Date(l.createdAt).toLocaleString('pt-BR')}</span>
                <span className="flex-1 truncate text-slate-300">{l.email}</span>
                <span className="text-slate-500 shrink-0">{l.ip || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
