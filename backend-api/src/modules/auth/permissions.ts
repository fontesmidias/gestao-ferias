// Abstração mínima de RBAC (Caminho 3 pragmático — Bruno 2026-05-01).
// Mapa estático role→permission keys. Mantém API limpa para futuro refactor data-driven.
// TODO(v3-3-rbac-data-driven): substituir mapa estático por consulta a model `Permission`
// quando UI de gestão estiver pronta. Ver architecture.md#D6 addendum 2026-05-01.

export const PERMISSION_TO_ROLES = {
  'import.run': ['SUPERADMIN', 'ADMIN'],
  'bankData.view': ['SUPERADMIN'],
} as const

export type PermissionKey = keyof typeof PERMISSION_TO_ROLES

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSION_TO_ROLES, key)
}

export function roleHasPermission(role: string | undefined, key: PermissionKey): boolean {
  if (!role) return false
  return (PERMISSION_TO_ROLES[key] as readonly string[]).includes(role)
}
