'use client'

import { useCallback, useEffect, useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import { useAuth } from '@/components/AuthContext'
import { toast } from 'sonner'
import { Link2, Plus, Clock, XCircle, Inbox, Loader2 } from 'lucide-react'

interface Suggestion {
  id: string
  name: string
  score: number
}

export interface QueueItem {
  id: string
  workplaceNameRaw: string
  state: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
  suggestions: Suggestion[] | null
  employee: { id: string; name: string }
  createdAt: string
}

type StateFilter = 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'

interface Props {
  onCountChange?: () => void
}

export function PendingBindingsTab({ onCountChange }: Props) {
  const { user } = useAuth()
  const [items, setItems] = useState<QueueItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [stateFilter, setStateFilter] = useState<StateFilter>('PENDING')
  const [readOnly, setReadOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createOpenFor, setCreateOpenFor] = useState<string | null>(null)

  const isAuditor = user?.role === 'AUDITOR'
  const canAct =
    !isAuditor &&
    !readOnly &&
    (stateFilter === 'PENDING' || stateFilter === 'DEFERRED')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await HttpClient.get(
        `/admin/workplace-reconcile-queue?state=${stateFilter}&page=${page}&pageSize=${pageSize}`,
      )
      const list = (res?.data ?? []) as QueueItem[]
      const meta = res?.meta ?? {}
      setItems(list)
      setTotal(meta.total ?? 0)
      setReadOnly(!!meta.readOnly)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar pendências')
    } finally {
      setLoading(false)
    }
  }, [stateFilter, page])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  async function handleResolve(
    item: QueueItem,
    payload: Record<string, unknown>,
    successMsg: string,
  ) {
    try {
      await HttpClient.post(
        `/admin/workplace-reconcile-queue/${item.id}/resolve`,
        payload,
      )
      toast.success(successMsg)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
      onCountChange?.()
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string }
      if (err.status === 409) {
        toast.error('Item já resolvido. Recarregando lista.')
        void load()
      } else {
        toast.error(err.message ?? 'Erro ao resolver item')
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-3 mb-3">
        <label htmlFor="state-filter" className="text-slate-500">
          Filtro:
        </label>
        <select
          id="state-filter"
          value={stateFilter}
          onChange={(e) => {
            setPage(1)
            setStateFilter(e.target.value as StateFilter)
          }}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
        >
          <option value="PENDING">Pendentes</option>
          <option value="DEFERRED">Adiados</option>
          <option value="RESOLVED">Resolvidos</option>
          <option value="IGNORED">Ignorados</option>
        </select>
        {loading && (
          <Loader2 size={14} className="animate-spin text-slate-400" />
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {total} {total === 1 ? 'item' : 'itens'}
        </span>
      </div>

      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center text-slate-500 py-12">
          <Inbox size={36} />
          <div className="mt-2">Nenhuma pendência neste estado.</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="border border-slate-200 dark:border-slate-700 rounded p-3"
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div>
                  <div className="font-medium">{item.employee.name}</div>
                  <div className="text-xs text-slate-500">
                    Posto da planilha:{' '}
                    <span className="font-mono">{item.workplaceNameRaw}</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </div>
              </div>

              {Array.isArray(item.suggestions) && item.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {item.suggestions.map((s) => (
                    <button
                      key={s.id}
                      disabled={!canAct}
                      onClick={() =>
                        handleResolve(
                          item,
                          { action: 'link', workplaceId: s.id },
                          `Vinculado a ${s.name}`,
                        )
                      }
                      className="px-2 py-1 rounded bg-blue-600 text-white text-[12px] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      title={canAct ? 'Vincular ao posto sugerido' : 'Apenas visualização'}
                    >
                      <Link2 size={12} />
                      {s.name}
                      <span className="text-[10px] bg-blue-800 px-1 rounded ml-1">
                        {Math.round(s.score * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {canAct && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCreateOpenFor(item.id)}
                    className="px-2 py-1 rounded border border-green-500 text-green-700 text-[12px] hover:bg-green-50 dark:hover:bg-green-900/20 inline-flex items-center gap-1"
                  >
                    <Plus size={12} /> Criar novo posto
                  </button>
                  <button
                    onClick={() =>
                      handleResolve(item, { action: 'defer' }, 'Item adiado')
                    }
                    className="px-2 py-1 rounded border border-slate-400 text-slate-600 dark:text-slate-300 text-[12px] hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1"
                  >
                    <Clock size={12} /> Adiar
                  </button>
                  <button
                    onClick={() =>
                      handleResolve(item, { action: 'ignore' }, 'Item ignorado')
                    }
                    className="px-2 py-1 rounded border border-red-300 text-red-600 text-[12px] hover:bg-red-50 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                  >
                    <XCircle size={12} /> Ignorar
                  </button>
                </div>
              )}

              {createOpenFor === item.id && (
                <CreateWorkplaceDialog
                  onCancel={() => setCreateOpenFor(null)}
                  onConfirm={async (name, role) => {
                    setCreateOpenFor(null)
                    await handleResolve(
                      item,
                      {
                        action: 'create',
                        workplaceName: name,
                        ...(role ? { workplacePositionRole: role } : {}),
                      },
                      `Posto "${name}" criado e vinculado`,
                    )
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
          >
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}

function CreateWorkplaceDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (name: string, role: string) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  return (
    <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
      <input
        placeholder="Nome do posto (obrigatório)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
      />
      <input
        placeholder="Cargo (opcional, default Operacional)"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-[12px]"
        >
          Cancelar
        </button>
        <button
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim(), role.trim())}
          className="px-2 py-1 rounded bg-green-600 text-white text-[12px] disabled:opacity-50"
        >
          Confirmar
        </button>
      </div>
    </div>
  )
}
