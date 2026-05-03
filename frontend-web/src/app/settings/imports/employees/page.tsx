'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthContext'
import { ImportEmployeesFlow } from '@/components/imports/ImportEmployeesFlow'

function GuardedFlow() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) return
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  if (loading) {
    return <div className="px-6 py-6 text-sm text-slate-400">Carregando…</div>
  }
  if (!user) return null
  if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') return null

  return <ImportEmployeesFlow mode="tenant" />
}

export default function SettingsImportEmployeesPage() {
  return (
    <Suspense fallback={<div className="px-6 py-6 text-sm text-slate-400">Carregando…</div>}>
      <GuardedFlow />
    </Suspense>
  )
}
