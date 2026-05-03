// Story 2.4 / L3 — Pub/sub in-memory para eventos de cobertura por tenant.
// Frontend /coverage assina via SSE e re-fetcha dados quando algo muda.
// NÃO escala para multi-instance: usar Redis Pub/Sub se houver mais de 1 nó.

export type CoverageEvent =
  | { type: 'coverage.created'; coverageId: string; vacationRequestId: string }
  | { type: 'coverage.updated'; coverageId: string }
  | { type: 'coverage.deleted'; coverageId: string }
  | { type: 'gap.changed'; vacationRequestId: string }

export type EventListener = (event: CoverageEvent) => void

class TenantEventBus {
  private listeners = new Map<string, Set<EventListener>>()

  subscribe(tenantId: string, listener: EventListener): () => void {
    let set = this.listeners.get(tenantId)
    if (!set) {
      set = new Set()
      this.listeners.set(tenantId, set)
    }
    set.add(listener)
    return () => {
      const s = this.listeners.get(tenantId)
      if (!s) return
      s.delete(listener)
      if (s.size === 0) this.listeners.delete(tenantId)
    }
  }

  emit(tenantId: string, event: CoverageEvent): void {
    const set = this.listeners.get(tenantId)
    if (!set) return
    for (const fn of set) {
      try { fn(event) } catch { /* listener falha não derruba publisher */ }
    }
  }

  /** count de listeners (testing/diag). */
  listenerCount(tenantId: string): number {
    return this.listeners.get(tenantId)?.size ?? 0
  }
}

export const coverageEventBus = new TenantEventBus()
