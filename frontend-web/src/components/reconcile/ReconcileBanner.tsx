'use client'

import { useEffect, useState, useCallback } from 'react'
import { HttpClient } from '@/lib/api-client'
import { useAuth } from '@/components/AuthContext'
import { RefreshCw } from 'lucide-react'
import { ReconcileProgressModal } from './ReconcileProgressModal'

interface PreviewData {
  pendingEmployees: number
  hasRunningJob: boolean
  runningJobId?: string
}

export function ReconcileBanner() {
  const { user } = useAuth()
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [open, setOpen] = useState(false)
  const [existingJobId, setExistingJobId] = useState<string | undefined>()

  const reload = useCallback(async () => {
    try {
      const res = await HttpClient.get('/admin/reconcile/preview')
      const data = (res?.data ?? res) as PreviewData
      setPreview(data)
    } catch {
      setPreview(null)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void reload()
    })
  }, [reload])

  const role = user?.role
  const canSee = role === 'ADMIN' || role === 'SUPERADMIN'
  if (!canSee || !preview || preview.pendingEmployees === 0) return null

  const handleOpen = () => {
    setExistingJobId(preview.hasRunningJob ? preview.runningJobId : undefined)
    setOpen(true)
  }
  const handleClose = () => {
    setOpen(false)
    reload()
  }

  return (
    <>
      <div
        role="status"
        className="flex items-center justify-between gap-3 rounded border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 mb-3 text-[13px]"
      >
        <div className="flex items-center gap-2">
          <RefreshCw size={16} className="text-yellow-600" />
          <span>
            {preview.hasRunningJob
              ? 'Reconciliação em andamento'
              : `Reconciliação V3.3 disponível — vincular ${preview.pendingEmployees} colaboradores aos seus postos`}
          </span>
        </div>
        <button
          onClick={handleOpen}
          className="px-3 py-1 rounded bg-blue-600 text-white text-[12px] hover:bg-blue-700"
        >
          {preview.hasRunningJob ? 'Ver progresso' : 'Iniciar reconciliação'}
        </button>
      </div>
      {open && (
        <ReconcileProgressModal
          open={open}
          onClose={handleClose}
          existingJobId={existingJobId}
        />
      )}
    </>
  )
}
