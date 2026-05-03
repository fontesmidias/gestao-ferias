'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react'
import { ImportStatusBadge } from './ImportStatusBadge'
import { maskCpf } from '@/lib/imports/mask-cpf'
import { fieldLabel, formatDiffEntry } from '@/lib/imports/format-diff'
import type { PaginationMeta, PreviewRow } from '@/lib/imports/types'

interface ImportPreviewTableProps {
  rows: PreviewRow[]
  pagination: PaginationMeta
  loading?: boolean
  onPageChange: (page: number) => void
}

const ROW_HEIGHT = 44
const EXPANDED_EXTRA = 140

function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, 2, current - 1, current, current + 1, total - 1, total])
  const filtered = Array.from(pages).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | 'ellipsis')[] = []
  for (let i = 0; i < filtered.length; i++) {
    if (i > 0 && filtered[i] - filtered[i - 1] > 1) out.push('ellipsis')
    out.push(filtered[i])
  }
  return out
}

export function ImportPreviewTable({ rows, pagination, loading, onPageChange }: ImportPreviewTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // M2: limpar expanded quando rows mudam (page/filter change). Mantém apenas
  // rowIndexes que ainda existem no novo dataset.
  useEffect(() => {
    const visibleIndexes = new Set(rows.map((r) => r.rowIndex))
    setExpanded((prev) => {
      let changed = false
      const next = new Set<number>()
      prev.forEach((idx) => {
        if (visibleIndexes.has(idx)) next.add(idx)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [rows])

  const rowSizes = useMemo(() => {
    return rows.map((r) => (expanded.has(r.rowIndex) ? ROW_HEIGHT + EXPANDED_EXTRA : ROW_HEIGHT))
  }, [rows, expanded])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => rowSizes[i] ?? ROW_HEIGHT,
    overscan: 8,
  })

  function toggle(rowIndex: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  const pageList = buildPageList(pagination.page, Math.max(1, pagination.totalPages))
  const startIdx = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const endIdx = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div role="table" aria-label="Linhas do preview" aria-rowcount={pagination.total} className="rounded-lg border border-white/10 bg-slate-900/30 overflow-hidden">
      {/* Sticky header */}
      <div role="row" className="grid grid-cols-[64px_1fr_140px_180px_140px_40px] items-center px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400 border-b border-white/10 bg-slate-800/60">
        <div role="columnheader">#</div>
        <div role="columnheader">Nome</div>
        <div role="columnheader">CPF</div>
        <div role="columnheader">Lotação</div>
        <div role="columnheader">Status</div>
        <div role="columnheader" className="sr-only">Expandir</div>
      </div>

      {/* Rows */}
      <div
        ref={parentRef}
        className="relative overflow-auto"
        style={{ height: 480, opacity: loading ? 0.5 : 1, transition: 'opacity 150ms' }}
        aria-busy={loading || undefined}
      >
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {loading ? 'Carregando…' : 'Nenhuma linha com este status.'}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index]
              const isOpen = expanded.has(row.rowIndex)
              return (
                <div
                  key={row.rowIndex}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    role="row"
                    aria-rowindex={row.rowIndex + 1}
                    onClick={() => toggle(row.rowIndex)}
                    aria-expanded={isOpen}
                    className="w-full grid grid-cols-[64px_1fr_140px_180px_140px_40px] items-center px-3 text-left border-b border-white/5 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:bg-white/5"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div role="cell" className="text-xs text-slate-400">{row.rowIndex}</div>
                    <div role="cell" className="text-sm text-white truncate" title={row.name ?? ''}>
                      {row.name ?? '—'}
                    </div>
                    <div role="cell" className="text-xs text-slate-300 font-mono">{maskCpf(row.cpf)}</div>
                    <div role="cell" className="text-xs text-slate-300 truncate" title={row.workplace ?? ''}>
                      {row.workplace ?? '—'}
                    </div>
                    <div role="cell">
                      <ImportStatusBadge status={row.status} />
                    </div>
                    <div role="cell" className="flex justify-center text-slate-400">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div
                      className="px-3 py-3 bg-slate-800/40 border-b border-white/5"
                      style={{ minHeight: EXPANDED_EXTRA }}
                    >
                      <ExpandedDetails row={row} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer paginação */}
      <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400 border-t border-white/10 bg-slate-800/40">
        <div>
          {pagination.total === 0
            ? 'Sem resultados'
            : `${startIdx}-${endIdx} / ${pagination.total} linhas`}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pagination.page <= 1 || loading}
            onClick={() => onPageChange(pagination.page - 1)}
            className="px-2 py-1 rounded hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Página anterior"
          >
            ◀
          </button>
          {pageList.map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`e-${i}`} className="px-1 text-slate-500">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === pagination.page ? 'page' : undefined}
                className={`min-w-[28px] px-2 py-1 rounded ${
                  p === pagination.page
                    ? 'bg-primary text-white font-bold'
                    : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => onPageChange(pagination.page + 1)}
            className="px-2 py-1 rounded hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Próxima página"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  )
}

function ExpandedDetails({ row }: { row: PreviewRow }) {
  if (row.status === 'invalid') {
    const errors = row.errors ?? []
    return (
      <div>
        <div className="text-xs uppercase tracking-wide text-red-400 mb-1.5">Erros</div>
        {errors.length === 0 ? (
          <div className="text-sm text-slate-400">Sem detalhes.</div>
        ) : (
          <ul className="space-y-1 text-sm text-red-300 list-disc list-inside">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
      </div>
    )
  }

  if (row.status === 'reactivation') {
    const diff = row.diff ?? {}
    return (
      <div className="space-y-2">
        <div className="text-sm text-purple-300">
          Colaborador previamente demitido; planilha indica que está ativo. Default = manter inativo;
          decisão final no apply.
        </div>
        <DiffTable diff={diff} />
      </div>
    )
  }

  if (row.status === 'update') {
    const diff = row.diff ?? {}
    const count = Object.keys(diff).length
    return (
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-amber-400">
          {count} alteraç{count === 1 ? 'ão' : 'ões'}
        </div>
        <DiffTable diff={diff} />
      </div>
    )
  }

  // create / unchanged / absent — sem diff útil pra mostrar.
  return <div className="text-sm text-slate-400">Sem detalhes adicionais.</div>
}

function DiffTable({ diff }: { diff: Record<string, { from: unknown; to: unknown }> }) {
  const entries = Object.entries(diff)
  if (entries.length === 0) {
    return <div className="text-sm text-slate-500">Nenhum campo alterado.</div>
  }
  return (
    <table className="text-sm w-full">
      <thead className="sr-only">
        <tr><th>Campo</th><th>Antes</th><th>Depois</th></tr>
      </thead>
      <tbody>
        {entries.map(([field, entry]) => {
          const f = formatDiffEntry(field, entry)
          return (
            <tr key={field}>
              <td className="py-1 pr-3 text-slate-400 align-top w-32">{fieldLabel(field)}:</td>
              <td className="py-1 pr-2 text-slate-300 align-top">{f.fromText}</td>
              <td className="py-1 pr-2 text-slate-500 align-top w-6">
                <ArrowRight className="w-4 h-4 inline" aria-hidden="true" />
              </td>
              <td className="py-1 text-slate-100 align-top">
                {f.toText}
                {f.delta && <span className="ml-2 text-amber-300 text-xs">[{f.delta}]</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
