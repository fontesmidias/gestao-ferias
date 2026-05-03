import { describe, it, expect } from 'vitest'
import { reducer, type ImportFlowState } from '../use-import-flow'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'

describe('useImportFlow reducer', () => {
  it('estado inicial é upload sem tenant', () => {
    const init: ImportFlowState = { kind: 'upload', mode: 'admin' }
    expect(init.kind).toBe('upload')
    expect((init as Record<string, unknown>).tenantId).toBeUndefined()
  })

  it('SET_TENANT preenche tenantId+tenantName', () => {
    const next = reducer(
      { kind: 'upload', mode: 'admin' },
      { type: 'SET_TENANT', tenantId: TENANT_ID, tenantName: 'Servi-Plus' },
    )
    expect(next.kind).toBe('upload')
    expect((next as Record<string, unknown>).tenantId).toBe(TENANT_ID)
    expect((next as Record<string, unknown>).tenantName).toBe('Servi-Plus')
  })

  it('UPLOAD_SUCCESS transita para preview com newWorkplacesMode default', () => {
    const after = reducer(
      { kind: 'upload', mode: 'admin', tenantId: TENANT_ID, tenantName: 'Servi-Plus' },
      { type: 'UPLOAD_SUCCESS', jobId: 'job-1' },
    )
    expect(after.kind).toBe('preview')
    expect((after as Record<string, unknown>).jobId).toBe('job-1')
    expect((after as Record<string, unknown>).newWorkplacesMode).toBe('decide-each')
  })

  it('UPLOAD_SUCCESS no modo admin sem tenant é noop', () => {
    const before: ImportFlowState = { kind: 'upload', mode: 'admin' }
    const after = reducer(before, { type: 'UPLOAD_SUCCESS', jobId: 'job-1' })
    expect(after.kind).toBe('upload')
  })

  it('UPLOAD_SUCCESS no modo tenant funciona sem tenantId', () => {
    const after = reducer(
      { kind: 'upload', mode: 'tenant' },
      { type: 'UPLOAD_SUCCESS', jobId: 'job-2' },
    )
    expect(after.kind).toBe('preview')
    expect((after as Record<string, unknown>).jobId).toBe('job-2')
  })

  it('CANCEL volta para upload mantendo tenant selecionado', () => {
    const preview: ImportFlowState = {
      kind: 'preview',
      mode: 'admin',
      jobId: 'job-x',
      tenantId: TENANT_ID,
      tenantName: 'Servi-Plus',
      newWorkplacesMode: 'decide-each',
    }
    const after = reducer(preview, { type: 'CANCEL' })
    expect(after.kind).toBe('upload')
    expect((after as Record<string, unknown>).tenantId).toBe(TENANT_ID)
    expect((after as Record<string, unknown>).tenantName).toBe('Servi-Plus')
  })

  it('RESET limpa tenant e volta para upload', () => {
    const preview: ImportFlowState = {
      kind: 'preview',
      mode: 'admin',
      jobId: 'job-x',
      tenantId: TENANT_ID,
      tenantName: 'Servi-Plus',
      newWorkplacesMode: 'decide-each',
    }
    const after = reducer(preview, { type: 'RESET' })
    expect(after.kind).toBe('upload')
    expect((after as Record<string, unknown>).tenantId).toBeUndefined()
  })

  it('SET_NEW_WORKPLACES_MODE atualiza apenas em preview', () => {
    const upload: ImportFlowState = { kind: 'upload', mode: 'admin' }
    const noop = reducer(upload, { type: 'SET_NEW_WORKPLACES_MODE', mode: 'create-all' })
    expect(noop).toBe(upload)

    const preview: ImportFlowState = {
      kind: 'preview',
      mode: 'admin',
      jobId: 'job-x',
      tenantId: TENANT_ID,
      tenantName: 'Servi-Plus',
      newWorkplacesMode: 'decide-each',
    }
    const after = reducer(preview, { type: 'SET_NEW_WORKPLACES_MODE', mode: 'create-all' })
    expect((after as Record<string, unknown>).newWorkplacesMode).toBe('create-all')
  })

  it('HYDRATE_PREVIEW preenche state vindo de URL deep-link', () => {
    const upload: ImportFlowState = { kind: 'upload', mode: 'admin' }
    const after = reducer(upload, {
      type: 'HYDRATE_PREVIEW',
      jobId: 'job-9',
      tenantId: TENANT_ID,
      tenantName: 'Servi-Plus',
    })
    expect(after.kind).toBe('preview')
    expect((after as Record<string, unknown>).jobId).toBe('job-9')
    expect((after as Record<string, unknown>).tenantName).toBe('Servi-Plus')
  })
})
