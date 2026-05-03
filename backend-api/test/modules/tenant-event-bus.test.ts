// Story 2.4 / L3 — unit tests do pub/sub in-memory.
import test from 'node:test'
import assert from 'node:assert'
import { coverageEventBus } from '../../src/modules/coverage-engine/tenant-event-bus'

test('coverageEventBus — subscribe + emit isolado por tenant', () => {
  const receivedA: any[] = []
  const receivedB: any[] = []

  const unsubA = coverageEventBus.subscribe('tenant-a', (e) => receivedA.push(e))
  const unsubB = coverageEventBus.subscribe('tenant-b', (e) => receivedB.push(e))

  coverageEventBus.emit('tenant-a', { type: 'coverage.created', coverageId: '1', vacationRequestId: 'v1' })
  coverageEventBus.emit('tenant-b', { type: 'coverage.deleted', coverageId: '2' })

  assert.equal(receivedA.length, 1)
  assert.equal(receivedB.length, 1)
  assert.equal(receivedA[0].type, 'coverage.created')
  assert.equal(receivedB[0].type, 'coverage.deleted')

  // Cross-tenant: B não recebe evento de A.
  assert.equal(receivedA[0].coverageId, '1')
  assert.equal(receivedB[0].coverageId, '2')

  unsubA(); unsubB()
})

test('coverageEventBus — unsubscribe remove listener', () => {
  const received: any[] = []
  const unsub = coverageEventBus.subscribe('tenant-x', (e) => received.push(e))
  coverageEventBus.emit('tenant-x', { type: 'coverage.updated', coverageId: '1' })
  assert.equal(received.length, 1)
  unsub()
  coverageEventBus.emit('tenant-x', { type: 'coverage.updated', coverageId: '2' })
  assert.equal(received.length, 1, 'após unsub não recebe mais')
})

test('coverageEventBus — múltiplos listeners no mesmo tenant', () => {
  const a: any[] = []
  const b: any[] = []
  const unsubA = coverageEventBus.subscribe('tenant-multi', (e) => a.push(e))
  const unsubB = coverageEventBus.subscribe('tenant-multi', (e) => b.push(e))
  coverageEventBus.emit('tenant-multi', { type: 'gap.changed', vacationRequestId: 'v1' })
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
  assert.equal(coverageEventBus.listenerCount('tenant-multi'), 2)
  unsubA(); unsubB()
  assert.equal(coverageEventBus.listenerCount('tenant-multi'), 0)
})

test('coverageEventBus — listener com erro não derruba publisher', () => {
  const ok: any[] = []
  const unsub1 = coverageEventBus.subscribe('tenant-err', () => { throw new Error('boom') })
  const unsub2 = coverageEventBus.subscribe('tenant-err', (e) => ok.push(e))
  coverageEventBus.emit('tenant-err', { type: 'coverage.deleted', coverageId: 'x' })
  assert.equal(ok.length, 1, 'segundo listener ainda recebeu')
  unsub1(); unsub2()
})

test('coverageEventBus — emit sem listeners não crasha', () => {
  // Sem subscribe.
  coverageEventBus.emit('tenant-vazio', { type: 'coverage.deleted', coverageId: 'z' })
  assert.equal(coverageEventBus.listenerCount('tenant-vazio'), 0)
})
