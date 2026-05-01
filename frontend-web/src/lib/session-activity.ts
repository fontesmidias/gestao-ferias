/**
 * Rastreador de atividade de sessão (idle timer).
 *
 * Cada chamada HTTP bem-sucedida marca atividade e reinicia o cronômetro.
 * O <SessionTimer /> consome `getRemainingMs()` e dispara aviso/logout quando zerado.
 *
 * Default: 15 minutos — alinhado com o TTL do access token JWT (`expiresIn: '15m'` em src/routes/api/v1/auth/index.ts).
 */

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000

let lastActivity = Date.now()
let idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS

export function markActivity() {
  lastActivity = Date.now()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('session:activity'))
  }
}

export function getRemainingMs(): number {
  return Math.max(0, idleTimeoutMs - (Date.now() - lastActivity))
}

export function getIdleTimeoutMs(): number {
  return idleTimeoutMs
}

export function setIdleTimeoutMs(ms: number): void {
  idleTimeoutMs = ms
  markActivity()
}
