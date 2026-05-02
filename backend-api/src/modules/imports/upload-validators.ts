// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

export type FileValidationResult =
  | { ok: true }
  | {
      ok: false
      code: 'INVALID_FILE_FORMAT' | 'FILE_TOO_LARGE'
      message: string
    }

export const DEFAULT_MAX_BYTES = 10_000_000

export function validateUploadedFile(input: {
  filename: string | null | undefined
  size: number
  maxBytes?: number
}): FileValidationResult {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES

  if (!input.filename || input.filename.trim().length === 0) {
    return {
      ok: false,
      code: 'INVALID_FILE_FORMAT',
      message: 'Arquivo é obrigatório',
    }
  }

  const lower = input.filename.trim().toLowerCase()
  if (!lower.endsWith('.xlsx')) {
    return {
      ok: false,
      code: 'INVALID_FILE_FORMAT',
      message: 'Apenas arquivos .xlsx são aceitos',
    }
  }

  if (input.size > maxBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `Arquivo excede o limite de ${Math.floor(maxBytes / 1_000_000)}MB`,
    }
  }

  return { ok: true }
}
