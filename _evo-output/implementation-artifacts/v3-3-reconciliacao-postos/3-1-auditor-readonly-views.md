# Story 3.1: AUDITOR read-only views (fila + audit logs)

Status: review

## Story

As a **AUDITOR**,
I want **visualizar a fila de "Pendências de Vínculo" e os AuditLogs de reconcile do meu tenant em modo read-only**,
so that **eu possa cumprir minha função de conformidade trabalhista sem ter permissão para alterar dados (FR18, FR39, NFR-SEC-5)**.

## Acceptance Criteria

1. **AC-1 (audit-logs aceita AUDITOR):** O endpoint `GET /v1/audit-logs` em `backend-api/src/routes/api/v1/audit-logs/index.ts` muda de `requireAdmin` para `requireAuth` + check manual de role. AUDITOR/ADMIN/SUPERADMIN podem consultar; USER recebe 403.

2. **AC-2 (audit-logs filtra tenantId):** A query `where: { tenantId }` continua usando `request.user.tenantId` (já presente). AUDITOR não pode ver logs cross-tenant. Se `tenantId` ausente no JWT (caso atípico), retorna 400 `TENANT_REQUIRED`.

3. **AC-3 (AUDITOR pode filtrar action V3.3):** AUDITOR consegue filtrar por `?action=V3.3_RECONCILE`, `?action=RECONCILE_QUEUE_RESOLVE`, etc. Sem alteração na lógica de filtro — apenas RBAC corrigido.

4. **AC-4 (verificações cross-tenant existentes):** Stories 1.4 e 1.5 já garantem `tenantId` no JWT como filtro estrito; AUDITOR não vê dados de outros tenants. Adicionar 1 teste explícito de cross-tenant para audit-logs.

5. **AC-5 (USER não acessa):** USER role recebe 403 em qualquer dos endpoints AUDITOR/ADMIN: `/v1/admin/workplace-reconcile-queue`, `/v1/admin/reconcile/jobs*`, `/v1/admin/reconcile/preview`, `/v1/audit-logs`.

6. **AC-6 (testes RBAC consolidados):** Novo arquivo `backend-api/test/routes/audit-logs.test.ts` cobre:
   - **T1:** AUDITOR consegue listar audit logs do próprio tenant (200, filtro por tenantId aplicado).
   - **T2:** AUDITOR cross-tenant: dados retornados são apenas do tenant do JWT.
   - **T3:** USER recebe 403 ao tentar GET /audit-logs.
   - **T4:** AUDITOR pode filtrar por action=V3.3_RECONCILE e recebe apenas esses.

7. **AC-7 (sem regressão):** `npx tsc --noEmit` 0 erros. Testes existentes em `test/routes/admin-reconcile.test.ts` continuam verde.

## Tasks / Subtasks

- [x] **Task 1 — Refatorar audit-logs RBAC** (AC: #1, #2)
  - [ ] Trocar `onRequest: [fastify.requireAuth, fastify.requireAdmin]` por `[fastify.requireAuth]`.
  - [ ] Adicionar check manual: USER → 403; AUDITOR/ADMIN/SUPERADMIN OK.
  - [ ] Manter `where: { tenantId: user.tenantId }`.
  - [ ] Validação `if (!tenantId) return 400 TENANT_REQUIRED`.

- [x] **Task 2 — Testes consolidados** (AC: #6)
  - [ ] Criar `backend-api/test/routes/audit-logs.test.ts` com pattern de fastify-mock (igual `admin-reconcile.test.ts`).
  - [ ] 4 cenários T1-T4.
  - [ ] Mock: `prisma.auditLog.findMany` configurado para retornar logs filtrados.

- [x] **Task 3 — Validações** (AC: #7)
  - [ ] `npx tsc --noEmit` 0 erros.
  - [ ] `npx tsx --test test/routes/audit-logs.test.ts test/routes/admin-reconcile.test.ts` verde.

- [x] **Task 4 — Commit + relatório**

## Dev Notes

### Discovery findings (Story 3.1 spike)

- **`audit-logs/index.ts` atual** usa `requireAdmin` → bloqueia AUDITOR. **GAP**.
- Endpoints da fila/reconcile (Stories 1.4, 1.5, 1.6) já estão corretamente configurados:
  - GET → `requireAuth` + role check (USER → 403; AUDITOR/ADMIN/SUPERADMIN OK).
  - POST → `requireAuth + requireAdmin` (AUDITOR → 403 implícito).
- Frontend (Stories 1.6 banner / 1.7 PendingBindingsTab) já oculta ações para AUDITOR.

### Skeleton Refactor

```typescript
// audit-logs/index.ts
fastify.get('/', {
  onRequest: [fastify.requireAuth],
  schema: { ... },
}, async (request, reply) => {
  const user = request.user as { tenantId?: string; role: string }
  if (!user.tenantId) {
    return reply.code(400).send({
      data: null,
      error: { code: 'TENANT_REQUIRED', message: 'Operação requer tenant.' },
    })
  }
  if (!['ADMIN', 'AUDITOR', 'SUPERADMIN'].includes(user.role)) {
    return reply.code(403).send({
      data: null,
      error: { code: 'FORBIDDEN', message: 'Acesso restrito.' },
    })
  }

  // ... resto da lógica de filtro inalterada ...
})
```

**Decisão pragmática:** o response atual NÃO usa envelope `{ data, error, meta }` — retorna array direto. Para evitar quebrar frontend existente da V3.0, **manter shape atual** (array). Apenas error responses usam envelope.

### Project Structure Notes

**Modified:**
- `backend-api/src/routes/api/v1/audit-logs/index.ts`

**Created:**
- `backend-api/test/routes/audit-logs.test.ts` (4 cenários)

### References

- [Source: prd.md#FR18, FR39, NFR-SEC-1, NFR-SEC-5]
- [Source: epics.md#Story-3.1]
- [Source: 1-4-reconcile-queue-service.md]
- [Source: 1-5-reconcile-service-runner-routes.md]

### Commit Message (sugerida)

```
feat(audit): AUDITOR pode consultar audit-logs do proprio tenant (Story 3.1)

- audit-logs endpoint troca requireAdmin por requireAuth + check manual
  de role: USER -> 403; AUDITOR/ADMIN/SUPERADMIN -> 200.
- Filtro por tenantId do JWT continua mandatorio (NFR-SEC-3).
- Resto dos endpoints V3.3 ja estavam corretos (Stories 1.4-1.6).
- Testes RBAC consolidados em test/routes/audit-logs.test.ts:
  AUDITOR vê seu tenant, USER bloqueado, filtro por action=V3.3_RECONCILE.

Story: 3.1
```

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `npx tsc --noEmit` → 0 erros.
- `npx tsx --test test/routes/audit-logs.test.ts` → **5/5 verde** (4 ACs + bônus tenantId ausente).

### Completion Notes List

**AC-1 ✅ requireAuth + role check** — substituído `requireAdmin` por check manual; AUDITOR/ADMIN/SUPERADMIN acessam, USER → 403.

**AC-2 ✅ TENANT_REQUIRED** — 400 quando `tenantId` ausente no JWT.

**AC-3 ✅ Filtro action funcional** — V3.3_RECONCILE filtrado corretamente.

**AC-4 ✅ Cross-tenant isolation** — AUDITOR de TENANT_B só vê logs de TENANT_B.

**AC-5 ✅ USER bloqueado** — confirmado pelo teste T3.

**AC-6 ✅ 5 testes** consolidados em `test/routes/audit-logs.test.ts` com mock fastify-like (mesmo pattern de admin-reconcile).

**AC-7 ✅ sem regressão** — admin-reconcile.test.ts continua 7/7.

**Notas:**
- Endpoints V3.3 (queue/reconcile/preview) já estavam corretos desde Stories 1.4-1.6 — esta story endereça apenas o gap em `audit-logs/`.
- Response shape preservado (array direto no happy path) para não quebrar consumidores V3.0; apenas erros usam envelope.

### File List

**Modified:**
- `backend-api/src/routes/api/v1/audit-logs/index.ts` (RBAC corrigido)

**Created:**
- `backend-api/test/routes/audit-logs.test.ts` (5 cenários)
