import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock next/navigation antes de importar o hook.
const replaceMock = vi.fn()
let currentSearch = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

import { useImportFlow } from '../use-import-flow'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  replaceMock.mockClear()
  currentSearch = ''
})

describe('useImportFlow (hook integração)', () => {
  it('hidrata estado upload sem params do URL', async () => {
    currentSearch = ''
    const { result } = renderHook(() => useImportFlow({ mode: 'admin' }))
    await waitFor(() => expect(result.current.state.kind).toBe('upload'))
    expect(result.current.state).toMatchObject({ kind: 'upload', mode: 'admin' })
  })

  it('hidrata estado preview a partir de URL deep-link com tenant resolver', async () => {
    currentSearch = `step=preview&jobId=job-9&tenantId=${TENANT_ID}`
    const resolveTenantName = vi.fn().mockResolvedValue('Servi-Plus')

    const { result } = renderHook(() =>
      useImportFlow({ mode: 'admin', resolveTenantName }),
    )

    await waitFor(() => expect(result.current.state.kind).toBe('preview'))
    expect(resolveTenantName).toHaveBeenCalledWith(TENANT_ID)
    const state = result.current.state as Record<string, unknown>
    expect(state.jobId).toBe('job-9')
    expect(state.tenantName).toBe('Servi-Plus')
  })

  it('NÃO chama router.replace antes da hidratação completar (H2 race fix)', async () => {
    currentSearch = `step=preview&jobId=job-9&tenantId=${TENANT_ID}`
    let resolveLater: (v: string | null) => void = () => {}
    const resolveTenantName = vi.fn().mockImplementation(
      () => new Promise<string | null>((resolve) => { resolveLater = resolve }),
    )

    renderHook(() => useImportFlow({ mode: 'admin', resolveTenantName }))

    // Antes de resolver a promise, NÃO deve ter chamado replace para
    // sobrescrever o querystring.
    expect(replaceMock).not.toHaveBeenCalled()

    // Resolve hidratação.
    await act(async () => {
      resolveLater('Servi-Plus')
    })

    // Após hidratação, sync URL pode rodar mas o querystring resultante
    // deve preservar jobId+tenantId — não voltar pra ?step=upload.
    if (replaceMock.mock.calls.length > 0) {
      const lastCallArg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0])
      expect(lastCallArg).toContain('step=preview')
      expect(lastCallArg).toContain('jobId=job-9')
    }
  })

  it('SET_TENANT atualiza state e dispara sync URL', async () => {
    const { result } = renderHook(() => useImportFlow({ mode: 'admin' }))
    await waitFor(() => expect(result.current.state.kind).toBe('upload'))
    replaceMock.mockClear()

    act(() => {
      result.current.actions.setTenant(TENANT_ID, 'Servi-Plus')
    })

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled()
    })
    const lastCallArg = String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0])
    expect(lastCallArg).toContain(`tenantId=${TENANT_ID}`)
  })

  it('CANCEL retorna ao step=upload preservando tenant no URL', async () => {
    currentSearch = `step=preview&jobId=job-x&tenantId=${TENANT_ID}`
    const resolveTenantName = vi.fn().mockResolvedValue('Servi-Plus')
    const { result } = renderHook(() => useImportFlow({ mode: 'admin', resolveTenantName }))

    await waitFor(() => expect(result.current.state.kind).toBe('preview'))
    replaceMock.mockClear()

    act(() => {
      result.current.actions.cancel()
    })

    await waitFor(() => expect(result.current.state.kind).toBe('upload'))
    const state = result.current.state as Record<string, unknown>
    expect(state.tenantId).toBe(TENANT_ID)
    expect(state.tenantName).toBe('Servi-Plus')
  })

  it('RESET limpa tenant e querystring', async () => {
    currentSearch = `tenantId=${TENANT_ID}`
    const resolveTenantName = vi.fn().mockResolvedValue('Servi-Plus')
    const { result } = renderHook(() => useImportFlow({ mode: 'admin', resolveTenantName }))

    await waitFor(() => {
      const s = result.current.state as Record<string, unknown>
      expect(s.tenantId).toBe(TENANT_ID)
    })

    act(() => result.current.actions.reset())

    await waitFor(() => {
      const s = result.current.state as Record<string, unknown>
      expect(s.tenantId).toBeUndefined()
    })
  })
})
