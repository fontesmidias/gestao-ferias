'use client'

import { useEffect, useRef, useState } from 'react'
import { importsApi } from './api'
import type { ImportJobStatusResponse, ImportMode } from './types'

const TERMINAL_STATUSES = new Set([
  'PREVIEW_READY',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
])

const POLL_INTERVAL_MS = 2000

interface UsePollImportStatusOptions {
  mode: ImportMode
  jobId: string | null
  enabled?: boolean
}

export function usePollImportStatus({ mode, jobId, enabled = true }: UsePollImportStatusOptions) {
  const [status, setStatus] = useState<ImportJobStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    // Reset de status entre jobIds — evita previewReady falso-positivo do job anterior.
    queueMicrotask(() => {
      if (!aliveRef.current) return
      setStatus(null)
      setError(null)
    })
    if (!jobId || !enabled) {
      return () => { aliveRef.current = false }
    }

    let cancelled = false

    async function tick() {
      try {
        if (!jobId) return
        const data = await importsApi.getStatus(mode, jobId)
        if (cancelled || !aliveRef.current) return
        setStatus(data)
        setError(null)
        if (TERMINAL_STATUSES.has(data.status) && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch (err: unknown) {
        if (cancelled || !aliveRef.current) return
        const msg = err instanceof Error ? err.message : 'Erro ao consultar status'
        setError(msg)
      }
    }

    // setLoading via microtask para sair do escopo síncrono do effect (evita
    // cascading-render warning do react-hooks lint).
    queueMicrotask(() => {
      if (!cancelled && aliveRef.current) setLoading(true)
    })
    tick().finally(() => {
      if (!cancelled && aliveRef.current) setLoading(false)
    })

    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      aliveRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [mode, jobId, enabled])

  return { status, error, loading }
}
