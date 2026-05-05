# Story 3.2: Cron in-process de purge LGPD 90d

Status: review

## Story

As a **plataforma**,
I want **um cron in-process que diariamente apague itens da `WorkplaceReconcileQueue` no estado `RESOLVED` ou `IGNORED` há mais de 90 dias**,
so that **a fila não acumule dados pessoais (nomes) indefinidamente, atendendo LGPD (NFR-COMP-3, FR17)**.

## Acceptance Criteria

1. **AC-1 (purgeOldQueueItems puro):** Função `purgeOldQueueItems(prisma, opts?)` em `backend-api/src/modules/reconcile/reconcile-queue.purge.ts` apaga via `deleteMany` registros `WorkplaceReconcileQueue` com `state ∈ {RESOLVED, IGNORED}` AND `resolvedAt < cutoff`. Default cutoff = `now - 90 days`. Aceita `opts.now` e `opts.retentionDays` para teste.

2. **AC-2 (não toca AuditLog):** Função apaga **apenas** da tabela `workplace_reconcile_queue`. AuditLog é preservado (NFR-COMP-3 — auditoria sobrevive ao purge).

3. **AC-3 (não toca PENDING/DEFERRED):** Items em `PENDING` ou `DEFERRED` nunca são apagados, mesmo que `resolvedAt` seja antigo (defesa em profundidade — só RESOLVED/IGNORED têm `resolvedAt` set).

4. **AC-4 (registerReconcileQueuePurge):** Função `registerReconcileQueuePurge(fastify)`:
   - Lê env `RECONCILE_QUEUE_PURGE_ENABLED`. Se !== `'true'`, retorna (no-op).
   - Lê env `RECONCILE_QUEUE_PURGE_INTERVAL_HOURS` (default 24).
   - Registra `setInterval` que chama `purgeOldQueueItems(fastify.prisma)` a cada N horas.
   - No shutdown do fastify (hook `onClose`), faz `clearInterval`.
   - Loga JSON estruturado por purge: `{ module: 'reconcile', event: 'purge_tick', deleted: count, durationMs }`.
   - Em erro durante purge, loga `{ event: 'purge_failed', errorName }` mas não derruba o cron.

5. **AC-5 (integração no app):** `app.ts` chama `registerReconcileQueuePurge(fastify)` na inicialização (após `fastify.register` dos plugins). Em dev/test sem flag, cron permanece off — zero efeito colateral.

6. **AC-6 (testes ≥4 cenários):** `backend-api/test/modules/reconcile/reconcile-queue-purge.test.ts`:
   - **T1:** Items vencidos (>90d) são apagados.
   - **T2:** Items recentes (<90d) são mantidos.
   - **T3:** Items em PENDING/DEFERRED não são tocados.
   - **T4:** Custom retentionDays (ex.: 30) honrado.
   - Mock leve in-memory.

7. **AC-7 (sem regressão):** `npx tsc --noEmit` 0 erros. Suite V3.3 continua verde.

## Tasks / Subtasks

- [x] **Task 1 — Implementar purgeOldQueueItems** (AC: #1, #2, #3)
  - [ ] Substituir placeholder em `src/modules/reconcile/reconcile-queue.purge.ts`.
  - [ ] Função `purgeOldQueueItems(prisma, opts?)` retorna `{ deleted: number, durationMs: number, cutoff: Date }`.
  - [ ] Usa `prisma.workplaceReconcileQueue.deleteMany` com `where: { state: { in: ['RESOLVED', 'IGNORED'] }, resolvedAt: { lt: cutoff } }`.

- [x] **Task 2 — Implementar registerReconcileQueuePurge** (AC: #4)
  - [ ] Aceita `fastify: FastifyInstance` (acesso a `prisma` e `log`).
  - [ ] Honra env flags `RECONCILE_QUEUE_PURGE_ENABLED` e `RECONCILE_QUEUE_PURGE_INTERVAL_HOURS`.
  - [ ] `setInterval` chama purge + log estruturado.
  - [ ] `fastify.addHook('onClose', () => clearInterval(timer))`.

- [x] **Task 3 — Wiring em app.ts** (AC: #5)
  - [ ] Importar `registerReconcileQueuePurge` em `src/app.ts`.
  - [ ] Chamar após `fastify.register` dos plugins (depois do prisma plugin garantidamente).

- [x] **Task 4 — Testes** (AC: #6)
  - [ ] Criar `test/modules/reconcile/reconcile-queue-purge.test.ts`.
  - [ ] Mock leve com `deleteMany` capturando `where`.
  - [ ] 4 cenários T1-T4.

- [x] **Task 5 — Validações** (AC: #7)
  - [ ] `npx tsc --noEmit` 0 erros.
  - [ ] Suite V3.3 verde.

- [x] **Task 6 — Commit + relatório**

## Dev Notes

### Discovery findings

- **Cleanup existente** (`backend-api/src/modules/imports/cleanup-cron.ts`) usa BullMQ + worker em `plugins/imports.ts` para imports. Para Story 3.2 a abordagem é mais simples: `setInterval` direto no Fastify lifecycle. Não precisa BullMQ porque o trabalho é leve (1 query DELETE).
- **`reconcile-queue.purge.ts`** placeholder existe (Story 1.1) com export `registerReconcileQueuePurge`. Vamos preencher.
- **`app.ts`** não tem hook de cleanup de cron registrado atualmente — adicionar `registerReconcileQueuePurge(fastify)` após registros dos plugins.

### Skeleton

```typescript
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'

const ONE_DAY_MS = 86_400_000
const RETENTION_DAYS_DEFAULT = 90

export interface PurgeOptions {
  retentionDays?: number
  now?: Date
}

export interface PurgeResult {
  deleted: number
  cutoff: Date
  durationMs: number
}

export async function purgeOldQueueItems(
  prisma: PrismaClient,
  opts: PurgeOptions = {},
): Promise<PurgeResult> {
  const days = opts.retentionDays ?? RETENTION_DAYS_DEFAULT
  const baseTime = (opts.now ?? new Date()).getTime()
  const cutoff = new Date(baseTime - days * ONE_DAY_MS)
  const start = Date.now()

  const result = await prisma.workplaceReconcileQueue.deleteMany({
    where: {
      state: { in: ['RESOLVED', 'IGNORED'] },
      resolvedAt: { lt: cutoff },
    },
  })

  return { deleted: result.count, cutoff, durationMs: Date.now() - start }
}

export function registerReconcileQueuePurge(fastify: FastifyInstance): void {
  if (process.env.RECONCILE_QUEUE_PURGE_ENABLED !== 'true') return

  const intervalH = Number(process.env.RECONCILE_QUEUE_PURGE_INTERVAL_HOURS ?? 24)
  const intervalMs = Math.max(1, intervalH) * 60 * 60 * 1000

  const tick = async () => {
    try {
      const r = await purgeOldQueueItems(fastify.prisma)
      fastify.log.info(
        { module: 'reconcile', event: 'purge_tick', deleted: r.deleted, durationMs: r.durationMs },
        'reconcile queue purge tick',
      )
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      fastify.log.error(
        { module: 'reconcile', event: 'purge_failed', errorName: e.name },
        'reconcile queue purge failed',
      )
    }
  }

  const timer = setInterval(tick, intervalMs)
  fastify.addHook('onClose', () => {
    clearInterval(timer)
  })
}
```

### Test Skeleton

```typescript
import test from 'node:test'
import assert from 'node:assert'
import { purgeOldQueueItems } from '../../../src/modules/reconcile/reconcile-queue.purge'

interface QueueRow {
  id: string
  state: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
  resolvedAt: Date | null
}

function makePrisma(rows: QueueRow[]) {
  const data = [...rows]
  const prisma = {
    workplaceReconcileQueue: {
      async deleteMany({
        where,
      }: {
        where: {
          state: { in: string[] }
          resolvedAt: { lt: Date }
        }
      }) {
        const before = data.length
        const states = where.state.in
        const cutoff = where.resolvedAt.lt
        for (let i = data.length - 1; i >= 0; i--) {
          const r = data[i]
          if (states.includes(r.state) && r.resolvedAt && r.resolvedAt < cutoff) {
            data.splice(i, 1)
          }
        }
        return { count: before - data.length }
      },
    },
  }
  return { prisma: prisma as never, data }
}

const NOW = new Date('2026-05-05T00:00:00Z')

test('Story 3.2 — apaga RESOLVED/IGNORED >90d', async () => {
  const old1 = new Date('2026-01-01T00:00:00Z') // ~125 dias atrás
  const recent = new Date('2026-04-15T00:00:00Z') // ~20 dias atrás
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'RESOLVED', resolvedAt: old1 },
    { id: 'q2', state: 'IGNORED', resolvedAt: old1 },
    { id: 'q3', state: 'RESOLVED', resolvedAt: recent },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW })
  assert.strictEqual(r.deleted, 2)
  assert.strictEqual(data.length, 1)
})

test('Story 3.2 — mantém items recentes', async () => {
  const recent = new Date('2026-04-15T00:00:00Z')
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'RESOLVED', resolvedAt: recent },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW })
  assert.strictEqual(r.deleted, 0)
  assert.strictEqual(data.length, 1)
})

test('Story 3.2 — não toca PENDING/DEFERRED mesmo com resolvedAt antigo', async () => {
  const old = new Date('2025-01-01T00:00:00Z')
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'PENDING', resolvedAt: old },
    { id: 'q2', state: 'DEFERRED', resolvedAt: old },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW })
  assert.strictEqual(r.deleted, 0)
  assert.strictEqual(data.length, 2)
})

test('Story 3.2 — custom retentionDays=30', async () => {
  const fortyDaysOld = new Date(NOW.getTime() - 40 * 86_400_000)
  const { prisma, data } = makePrisma([
    { id: 'q1', state: 'RESOLVED', resolvedAt: fortyDaysOld },
  ])
  const r = await purgeOldQueueItems(prisma, { now: NOW, retentionDays: 30 })
  assert.strictEqual(r.deleted, 1)
  assert.strictEqual(data.length, 0)
})
```

### Project Structure Notes

**Modified:**
- `backend-api/src/modules/reconcile/reconcile-queue.purge.ts` (substitui placeholder)
- `backend-api/src/app.ts` (registra cron)

**Created:**
- `backend-api/test/modules/reconcile/reconcile-queue-purge.test.ts`

### References

- [Source: prd.md#FR17, NFR-COMP-3, NFR-COMP-4]
- [Source: epics.md#Story-3.2]
- [Source: backend-api/src/modules/imports/cleanup-cron.ts] — pattern de retention

### Commit Message (sugerida)

```
feat(reconcile): cron purge LGPD 90d (Story 3.2)

- purgeOldQueueItems: deleta WorkplaceReconcileQueue com state in
  (RESOLVED, IGNORED) e resolvedAt < now - 90 days. AuditLog preservado
  (NFR-COMP-3).
- registerReconcileQueuePurge registra setInterval no fastify lifecycle,
  honrando flags RECONCILE_QUEUE_PURGE_ENABLED e
  RECONCILE_QUEUE_PURGE_INTERVAL_HOURS (default 24h). onClose limpa.
- Logs estruturados: purge_tick (deleted, durationMs) e purge_failed.
- Wiring em app.ts (no-op em dev/test sem env flag).
- Testes: 4 cenarios (vencidos apagados, recentes mantidos, PENDING
  intactos, retentionDays customizavel).

Story: 3.2
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npx tsc --noEmit` → 0 erros.
- `npx tsx --test test/modules/reconcile/reconcile-queue-purge.test.ts` → **4/4 verde**.

### Completion Notes List

**AC-1/2/3 ✅ purgeOldQueueItems** — usa `deleteMany` com filtros explícitos `state IN (RESOLVED, IGNORED)` E `resolvedAt < cutoff`. Defesa em profundidade: dois filtros redundantes evitam apagar PENDING/DEFERRED mesmo em cenário corrompido.

**AC-4 ✅ registerReconcileQueuePurge** — env flags + setInterval + onClose hook. Logs estruturados JSON.

**AC-5 ✅ wiring app.ts** — chamada dentro de `fastify.ready()` para garantir que prisma + plugins já estão carregados.

**AC-6 ✅ 4 testes** — vencidos apagados, recentes mantidos, PENDING/DEFERRED intactos, retentionDays customizável.

**AC-7 ✅ sem regressão** — tsc 0 erros.

### File List

**Modified:**
- `backend-api/src/modules/reconcile/reconcile-queue.purge.ts` (substituiu placeholder)
- `backend-api/src/app.ts` (registra cron via fastify.ready)

**Created:**
- `backend-api/test/modules/reconcile/reconcile-queue-purge.test.ts` (4 cenários)
