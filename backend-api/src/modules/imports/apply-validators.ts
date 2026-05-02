// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

export type ConfirmResult =
  | { ok: true }
  | {
      ok: false
      code: 'CONFIRMATION_MISMATCH' | 'INVALID_TARGET_TENANT'
      message: string
    }

export function validateConfirmTenantName(input: {
  tenantName: string | null | undefined
  provided: string | null | undefined
}): ConfirmResult {
  if (!input.tenantName || input.tenantName.trim().length === 0) {
    return {
      ok: false,
      code: 'INVALID_TARGET_TENANT',
      message: 'Tenant alvo não identificado',
    }
  }
  if (!input.provided || input.provided !== input.tenantName) {
    return {
      ok: false,
      code: 'CONFIRMATION_MISMATCH',
      message: 'Confirme exatamente o nome do tenant',
    }
  }
  return { ok: true }
}
