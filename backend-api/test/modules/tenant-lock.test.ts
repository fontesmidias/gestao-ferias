import test from 'node:test'
import assert from 'node:assert'
import {
  acquireTenantLock,
  lockKey,
  releaseTenantLock,
  TENANT_LOCK_TTL_SEC,
  type RedisLike,
} from '../../src/modules/imports/tenant-lock'

function makeMockRedis(): RedisLike & { _store: Map<string, { expiresAt: number }> } {
  const store = new Map<string, { expiresAt: number }>()
  return {
    _store: store,
    async set(key, _value, _ex, ttl, flag) {
      const existing = store.get(key)
      if (flag === 'NX' && existing && existing.expiresAt > Date.now()) {
        return null
      }
      store.set(key, { expiresAt: Date.now() + ttl * 1000 })
      return 'OK'
    },
    async del(key) {
      return store.delete(key) ? 1 : 0
    },
  }
}

test('lockKey produz string canônica imports:lock:<tenantId>', () => {
  assert.strictEqual(lockKey('tenant-abc'), 'imports:lock:tenant-abc')
})

test('TENANT_LOCK_TTL_SEC default ≥900 (>15min)', () => {
  assert.ok(TENANT_LOCK_TTL_SEC >= 900)
})

test('acquireTenantLock retorna true quando key livre', async () => {
  const redis = makeMockRedis()
  const got = await acquireTenantLock(redis, 'tenant-1')
  assert.strictEqual(got, true)
})

test('acquireTenantLock retorna false quando lock já existe', async () => {
  const redis = makeMockRedis()
  await acquireTenantLock(redis, 'tenant-1')
  const second = await acquireTenantLock(redis, 'tenant-1')
  assert.strictEqual(second, false)
})

test('acquireTenantLock obtido após release', async () => {
  const redis = makeMockRedis()
  await acquireTenantLock(redis, 'tenant-1')
  await releaseTenantLock(redis, 'tenant-1')
  const second = await acquireTenantLock(redis, 'tenant-1')
  assert.strictEqual(second, true)
})

test('locks de tenants distintos são independentes', async () => {
  const redis = makeMockRedis()
  const a = await acquireTenantLock(redis, 'tenant-A')
  const b = await acquireTenantLock(redis, 'tenant-B')
  assert.strictEqual(a, true)
  assert.strictEqual(b, true)
})

test('TTL custom é respeitado', async () => {
  const redis = makeMockRedis()
  await acquireTenantLock(redis, 'tenant-X', 100)
  const entry = redis._store.get('imports:lock:tenant-X')
  assert.ok(entry)
  // Aproximadamente 100s = 100_000ms à frente. Margem de 200ms para execução.
  assert.ok(entry.expiresAt - Date.now() > 99_500)
  assert.ok(entry.expiresAt - Date.now() <= 100_500)
})
