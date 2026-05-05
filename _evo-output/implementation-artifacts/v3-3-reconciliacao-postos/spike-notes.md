# V3.3 Spike Notes — descobertas durante Story 1.1

**Data:** 2026-05-05
**Story:** 1.1 — Migration aditiva V3.3 + scaffold do módulo reconcile

Este arquivo registra descobertas que afetam decisões da Architecture V3.3 e devem ser respeitadas pelas Stories seguintes (1.2, 1.3, 1.4, 1.5, 2.1–2.4, 3.1–3.4).

---

## 1. Convenção de testes — testes centralizados, NÃO co-located

**Achado:** o projeto centraliza testes em `backend-api/test/<categoria>/*.test.ts`.

- Categorias atuais identificadas:
  - `backend-api/test/modules/` — services, engines, builders (ex.: `coverage-engine.test.ts`, `vacation-engine.test.ts`, `webhook-service.test.ts`, `email-service.test.ts`, `prompt-builder.test.ts`, `bank-data-encryption.test.ts`, `permissions.test.ts`).
  - `backend-api/test/plugins/` — plugins Fastify (ex.: `support.test.ts`).
  - `backend-api/test/routes/` — testes de integração de rotas (ex.: `tenants.test.ts`, `root.test.ts`, `example.test.ts`).
- **Não há nenhum** `*.test.ts` co-located ao lado dos arquivos de produção em `src/`.

**Implicação para V3.3:** todas as Stories devem usar:

| Tipo | Path correto |
|---|---|
| Service / matcher / runner / queue | `backend-api/test/modules/reconcile/<arquivo>.test.ts` |
| WorkplaceAllocationService | `backend-api/test/modules/workplace-allocation.service.test.ts` |
| Rotas admin reconcile | `backend-api/test/routes/admin-reconcile.test.ts` (ou `admin/reconcile.test.ts` se a categoria suportar subdir) |
| Importer Tirvu refactorado (Stories 2.x) | `backend-api/test/modules/imports/<arquivo>.test.ts` (criar subdir `imports/` se necessário) |
| Cron de purge (Story 3.2) | `backend-api/test/modules/reconcile/queue-purge.test.ts` |

**Ação tomada na Story 1.1:**
- Diretório `backend-api/test/modules/reconcile/` criado (com `.gitkeep` para versionar).
- Architecture V3.3 atualizada para refletir a convenção real (ver seção 3 abaixo).

---

## 2. Prisma Extension de tenant isolation — NÃO existe

**Achado:** o projeto **não possui** Prisma extension de tenant isolation. Tenant isolation é feita manualmente em cada query.

**Evidência:** `backend-api/src/plugins/prisma.ts` (29 linhas):

```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import fp from 'fastify-plugin'

export default fp(async (fastify) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })
  await prisma.$connect()
  fastify.decorate('prisma', prisma)
  fastify.addHook('onClose', async (server) => {
    await server.prisma.$disconnect()
  })
}, { name: 'prisma' })
```

O plugin apenas:
- Cria `PrismaClient` com adapter `PrismaPg`.
- Decora `fastify.prisma`.
- Sem `.$extends({ ... })`, sem middleware, sem nenhum mecanismo automático de tenant filtering.

**Implicação para Architecture V3.3:**

A decisão **D7 (RBAC: Batch Super-Admin com Isolamento)** mencionou `prismaTenantFactory.forTenant(tenantId)` como helper que impersona contexto via Prisma extension. Esta semântica precisa ser revisada:

- **Não há extension para impersonar.** O batch super-admin (Phase 2 / Story 4.1) deve receber `tenantId` como parâmetro explícito em cada chamada de service, e o service propaga em todas as queries Prisma via `where: { tenantId }`.
- **O isolamento de falha entre tenants** (FR29: \"falha em um não cascata\") continua válido — implementado por loop com `try/catch` por iteração, cada iteração abrindo seu próprio escopo transacional.
- **Em V3.3 Phase 1 (single-tenant), nada muda:** `tenantId` vem do JWT em cada rota, queries filtram explicitamente por `tenantId`. Convenção atual do projeto preservada.

**Implicação para Story 4.1 (Phase 2):**
- `PrismaTenantFactory.forTenant()` na implementação real **não retorna um client impersonado** (não há como). Em vez disso, é um helper que:
  1. Valida se o tenant existe e está ativo.
  2. Retorna o mesmo `PrismaClient` (ou um wrapper de logging) — o `tenantId` é propagado pelo caller, não pelo factory.
  3. Opcionalmente, em modo SUPERADMIN, registra MasterKeyLog/AuditLog ao iniciar a operação no tenant.

**Ação tomada na Story 1.1:**
- Achado documentado em JSDoc no topo de `backend-api/src/modules/shared/prisma-tenant-factory.ts`.
- Arquivo criado como placeholder com método `forTenant()` que lança erro \"not implemented — Story 4.1\".
- Architecture V3.3 atualizada (ver seção 3 abaixo).

---

## 3. Atualizações aplicadas à Architecture V3.3

Modificações em `_evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md`:

1. **\"File Organization Patterns > Test organization\"** (Step 6) e **árvore do delta V3.3**: substituir `co-located *.test.ts ao lado do arquivo testado` por `centralizado em backend-api/test/modules/reconcile/<arquivo>.test.ts` (e equivalentes para outros tipos).
2. **D7 — RBAC Batch Super-Admin:** complementar com nota sobre ausência de Prisma extension; redefinir contrato de `PrismaTenantFactory.forTenant()` para propagação explícita de `tenantId` em vez de impersonação via extension.

---

## 4. Tasks afetadas (a executar nas próximas stories)

| Story | Tarefa derivada do spike |
|---|---|
| 1.2 | Criar testes em `backend-api/test/modules/workplace-allocation.service.test.ts` (não co-located) |
| 1.3 | Criar testes em `backend-api/test/modules/reconcile/{normalize,deterministic-matcher,fuzzy-matcher}.test.ts` |
| 1.4 | Criar testes em `backend-api/test/modules/reconcile/reconcile-queue.service.test.ts` + `backend-api/test/routes/admin-workplace-reconcile-queue.test.ts` |
| 1.5 | Testes em `backend-api/test/modules/reconcile/{reconcile.service,reconcile.runner}.test.ts` + `backend-api/test/routes/admin-reconcile.test.ts` |
| 4.1 (Phase 2) | Implementar `PrismaTenantFactory.forTenant()` com semântica de propagação explícita; rota batch super-admin recebe `tenantIds[] | 'all'` e itera com try/catch por tenant |
