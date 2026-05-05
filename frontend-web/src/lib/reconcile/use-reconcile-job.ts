'use client'

import { useEffect, useRef, useState } from 'react'
import { HttpClient } from '@/lib/api-client'

export interface ReconcileJobStatus {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  totalEmployees: number | null
  matched: number
  queued: number
  ignored: number
  errors: number
  durationMs: number | null
  failureReason: string | null
  progressPct: number
  startedAt: string | null
  completedAt: string | null
}

const TERMINAL = new Set(['COMPLETED', 'FAILED'])
const POLL_MS = 2000

export function useReconcileJob(jobId: string | null) {
  const [job, setJob] = useState<ReconcileJobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    queueMicrotask(() => {
      if (!aliveRef.current) return
      setJob(null)
      setError(null)
    })
    if (!jobId) {
      return () => {
        aliveRef.current = false
      }
    }
    let cancelled = false

    async function tick() {
      try {
        const res = await HttpClient.get(`/admin/reconcile/jobs/${jobId}`)
        if (cancelled || !aliveRef.current) return
        const data = (res?.data ?? res) as ReconcileJobStatus
        setJob(data)
        setError(null)
        if (TERMINAL.has(data.status) && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch (e: unknown) {
        if (cancelled || !aliveRef.current) return
        setError(e instanceof Error ? e.message : 'Erro ao consultar progresso')
      }
    }

    queueMicrotask(() => {
      if (!cancelled && aliveRef.current) setLoading(true)
    })
    tick().finally(() => {
      if (!cancelled && aliveRef.current) setLoading(false)
    })
    intervalRef.current = setInterval(tick, POLL_MS)

    return () => {
      cancelled = true
      aliveRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobId])

  return { job, error, loading }
}
