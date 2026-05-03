'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ImportMode, NewWorkplacesMode } from './types'

export type ImportFlowState =
  | { kind: 'upload'; mode: ImportMode; tenantId?: string; tenantName?: string; uploadError?: string }
  | { kind: 'preview'; mode: ImportMode; jobId: string; tenantId: string; tenantName: string; newWorkplacesMode: NewWorkplacesMode }
  | { kind: 'applying'; mode: ImportMode; jobId: string; tenantId: string; tenantName: string }
  | { kind: 'done'; mode: ImportMode; jobId: string; tenantId: string; tenantName: string; result: 'completed' | 'failed' | 'timed_out' }

export type ImportFlowAction =
  | { type: 'SET_TENANT'; tenantId: string; tenantName: string }
  | { type: 'CLEAR_TENANT' }
  | { type: 'SET_UPLOAD_ERROR'; error: string | undefined }
  | { type: 'UPLOAD_SUCCESS'; jobId: string }
  | { type: 'SET_NEW_WORKPLACES_MODE'; mode: NewWorkplacesMode }
  | { type: 'HYDRATE_PREVIEW'; jobId: string; tenantId: string; tenantName: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' }

export function reducer(state: ImportFlowState, action: ImportFlowAction): ImportFlowState {
  switch (action.type) {
    case 'SET_TENANT':
      if (state.kind !== 'upload') return state
      return { ...state, tenantId: action.tenantId, tenantName: action.tenantName, uploadError: undefined }

    case 'CLEAR_TENANT':
      if (state.kind !== 'upload') return state
      return { kind: 'upload', mode: state.mode }

    case 'SET_UPLOAD_ERROR':
      if (state.kind !== 'upload') return state
      return { ...state, uploadError: action.error }

    case 'UPLOAD_SUCCESS':
      if (state.kind !== 'upload') return state
      if (state.mode === 'admin' && (!state.tenantId || !state.tenantName)) return state
      return {
        kind: 'preview',
        mode: state.mode,
        jobId: action.jobId,
        tenantId: state.tenantId ?? '',
        tenantName: state.tenantName ?? '',
        newWorkplacesMode: 'decide-each',
      }

    case 'SET_NEW_WORKPLACES_MODE':
      if (state.kind !== 'preview') return state
      return { ...state, newWorkplacesMode: action.mode }

    case 'HYDRATE_PREVIEW':
      return {
        kind: 'preview',
        mode: state.mode,
        jobId: action.jobId,
        tenantId: action.tenantId,
        tenantName: action.tenantName,
        newWorkplacesMode: 'decide-each',
      }

    case 'CANCEL':
      return state.kind === 'upload'
        ? state
        : {
            kind: 'upload',
            mode: state.mode,
            tenantId: state.tenantId,
            tenantName: state.tenantName,
          }

    case 'RESET':
      return { kind: 'upload', mode: state.mode }

    default:
      return state
  }
}

function buildQuery(state: ImportFlowState): string {
  const params = new URLSearchParams()
  params.set('step', state.kind)
  if (state.kind === 'upload') {
    if (state.tenantId) params.set('tenantId', state.tenantId)
  } else {
    params.set('jobId', state.jobId)
    if (state.tenantId) params.set('tenantId', state.tenantId)
  }
  return params.toString()
}

interface UseImportFlowOptions {
  mode: ImportMode
  /** Resolve nome legível do tenant em deep-links (chamado quando hidratamos do URL com tenantId mas sem name). */
  resolveTenantName?: (tenantId: string) => Promise<string | null>
}

export function useImportFlow({ mode, resolveTenantName }: UseImportFlowOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, dispatch] = useReducer(reducer, { kind: 'upload', mode } as ImportFlowState)
  const hydratedRef = useRef(false)

  // Hidratação inicial a partir do URL.
  // CRÍTICO: hydratedRef.current só vira true APÓS o dispatch — caso contrário
  // o sync-URL effect (abaixo) roda com state inicial e sobrescreve o querystring.
  useEffect(() => {
    if (hydratedRef.current) return
    const step = searchParams?.get('step')
    const jobId = searchParams?.get('jobId')
    const tenantId = searchParams?.get('tenantId') ?? undefined

    const finish = (action?: ImportFlowAction) => {
      if (action) dispatch(action)
      hydratedRef.current = true
    }

    if (step === 'preview' && jobId) {
      const tid = tenantId ?? ''
      if (tid && resolveTenantName) {
        resolveTenantName(tid).then((name) => {
          finish({ type: 'HYDRATE_PREVIEW', jobId, tenantId: tid, tenantName: name ?? tid })
        })
      } else {
        finish({ type: 'HYDRATE_PREVIEW', jobId, tenantId: tid, tenantName: tid })
      }
      return
    }
    if (tenantId && resolveTenantName) {
      resolveTenantName(tenantId).then((name) => {
        finish(name ? { type: 'SET_TENANT', tenantId, tenantName: name } : undefined)
      })
      return
    }
    // Sem nada para hidratar — marca como completo imediatamente.
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync URL com state.
  useEffect(() => {
    if (!hydratedRef.current) return
    const qs = buildQuery(state)
    const current = searchParams?.toString() ?? ''
    if (qs !== current) {
      router.replace(`?${qs}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const setTenant = useCallback((tenantId: string, tenantName: string) => {
    dispatch({ type: 'SET_TENANT', tenantId, tenantName })
  }, [])

  const clearTenant = useCallback(() => dispatch({ type: 'CLEAR_TENANT' }), [])
  const setUploadError = useCallback((error: string | undefined) => dispatch({ type: 'SET_UPLOAD_ERROR', error }), [])
  const uploadSuccess = useCallback((jobId: string) => dispatch({ type: 'UPLOAD_SUCCESS', jobId }), [])
  const setNewWorkplacesMode = useCallback((m: NewWorkplacesMode) => dispatch({ type: 'SET_NEW_WORKPLACES_MODE', mode: m }), [])
  const cancel = useCallback(() => dispatch({ type: 'CANCEL' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    state,
    actions: {
      setTenant,
      clearTenant,
      setUploadError,
      uploadSuccess,
      setNewWorkplacesMode,
      cancel,
      reset,
    },
  }
}
