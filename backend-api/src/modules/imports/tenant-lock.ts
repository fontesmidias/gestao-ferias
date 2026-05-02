// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

export const TENANT_LOCK_TTL_SEC = Number(
  process.env.IMPORT_TENANT_LOCK_TTL_SEC ?? 960,
)

export interface RedisLike {
  set(
    key: string,
    value: string,
    mode: 'EX',
    ttl: number,
    flag: 'NX',
  ): Promise<'OK' | null>
  del(key: string): Promise<number>
}

export function lockKey(tenantId: string): string {
  return `imports:lock:${tenantId}`
}

export async function acquireTenantLock(
  redis: RedisLike,
  tenantId: string,
  ttlSec: number = TENANT_LOCK_TTL_SEC,
): Promise<boolean> {
  const result = await redis.set(lockKey(tenantId), '1', 'EX', ttlSec, 'NX')
  return result === 'OK'
}

export async function releaseTenantLock(
  redis: RedisLike,
  tenantId: string,
): Promise<void> {
  await redis.del(lockKey(tenantId))
}
