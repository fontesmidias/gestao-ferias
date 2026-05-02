# Story 3.2: POST /imports/:jobId/apply + import-applier (chunked transactional apply with bankData encryption + AuditLog + COMPLETED transition)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a operador (Bruno SuperAdmin ou Carla TenantAdmin),
I want que ao confirmar Apply num job em PREVIEW_READY, o backend transite para APPLYING, enfileire um job 'apply', o worker re-execute match com snapshot DB atual e aplique em chunks de 100 linhas (criando Employees com bankData cifrado, atualizando diff, marcando ausentes, criando Workplaces, registrando AuditLog por linha), terminando em COMPLETED com contadores atualizados,
so that o operador veja a importação aplicada com auditoria completa, idempotência (2ª aplicação = 0 mudanças) e segurança LGPD (bankData nunca cleartext em DB).

## Acceptance Criteria

### Rota POST `/api/v1/imports/:jobId/apply` (FR10, FR20, D9)

1. **Rotas duplicadas (admin + non-admin):**
   - `POST /api/v1/admin/imports/:jobId/apply` (SUPERADMIN)
   - `POST /api/v1/imports/:jobId/apply` (ADMIN do tenant do job)
   - **Helper compartilhado `applyEntrypoint(fastify, request, reply, jobId, scope)`** com `scope = 'admin' | 'tenant'`. Evita duplicação completa.

2. **Auth chain por rota:**
   - admin: `[requireAuth, requireSuperAdmin, requirePermission('import.run')]`
   - tenant: `[requireAuth, requireAdmin, requirePermission('import.run')]`

3. **Body schema:**
   ```ts
   {
     confirmTenantName: string,                    // obrigatório
     createWorkplaces?: string[],                   // default []
     markAbsentAsPending?: boolean,                 // default false
     reactivateAll?: boolean,                       // default false (D11: keep inactive)
   }
   ```

4. **Validações server-side (ordem):**
   1. Job existe? Se não → 404 `JOB_NOT_FOUND`.
   2. Para tenant route: `job.tenantId === request.user.tenantId`? Se não → 404 `JOB_NOT_FOUND` (não vazar existência cross-tenant).
   3. Tenant existe + ativo? Se não → 400 `INVALID_TARGET_TENANT`.
   4. `confirmTenantName === tenant.name` (case-sensitive)? Se não → 400 `CONFIRMATION_MISMATCH` "Confirme exatamente o nome do tenant".
   5. `job.status === 'PREVIEW_READY'`? Se não → 409 `INVALID_JOB_STATE` "Job não está em estado PREVIEW_READY".

5. **Side effects (em sequência):**
   1. `transition(prisma, jobId, ['PREVIEW_READY'], 'APPLYING')` — guarda em transação.
   2. `prisma.auditLog.create` `EMPLOYEE_IMPORT_JOB_APPLIED` com IP/UA + body como `newData`.
   3. `fastify.tirvuImportQueue.add('apply', { jobId, options: { createWorkplaces, markAbsentAsPending, reactivateAll } })`.
   4. Retorna 202 `{ data: { jobId, status: 'APPLYING' }, error: null, meta: null }`.

6. **Race com outro operador:** `transition` lança `InvalidStateTransitionError` se outro já apertou apply → 409 `INVALID_JOB_STATE`.

### Worker handler 'apply' (FR21, integra Story 3.1)

7. **Extender `plugins/imports.ts`** worker switch — adicionar case `job.name === 'apply'` que chama `runApplyPipeline(deps, { jobId, options })`.

8. **`backend-api/src/modules/imports/apply-pipeline.ts`** orquestra:
   ```
   1. Busca ImportJob (jobId) — verifica status APPLYING.
   2. acquireTenantLock → se falha, re-enqueue 'apply' com delay 5s.
   3. try:
      a. storage.read(buffer com fileHash)
      b. tirvuParser.parseRows + validate (mesmo da Story 3.1) → rows + validRowSet + invalidRows
      c. existingEmployees + existingWorkplaces snapshot
      d. matchAll → matchResult
      e. Se options.createWorkplaces: filtra `result.newWorkplaces` para apenas as escolhidas — ignora as outras (operador pode ter desmarcado).
      f. Loop em chunks de 100 da união ordenada (create + update + reactivation + absent + invalid + workplaces):
         - prisma.$transaction(async tx => {
             para cada item do chunk → applier.applyItem(tx, item, jobId, tenantId, options)
           })
         - update ImportJob.rowsProcessed += chunk.length
      g. Final transition APPLYING → COMPLETED com counts finais
      h. AuditLog EMPLOYEE_IMPORT_JOB_COMPLETED
   4. catch erro fatal → transition APPLYING → FAILED com `failureReason: 'APPLY_ERROR'` + log
   5. finally → releaseTenantLock
   ```

9. **Re-execução do match em vez de usar `previewSummary` armazenado:** snapshot DB pode ter mudado entre preview e apply (operador outro fez algo). Match fresh garante consistência. Custo: 1× parse + 1× findMany. Pequeno (≤30s para 5k).

10. **Idempotência (NFR31):** se rodar Apply 2× no mesmo arquivo, 2ª passada vê todos os Employees já criados/atualizados na 1ª — matcher retorna `unchanged.length = total, create=0, update=0`. Test cobre.

### `import-applier.ts` (FR22, FR23, FR24, FR25, FR27)

11. **Função `applyItem(tx, item, ctx)`** dispatcha por categoria:
    ```ts
    type ApplyItem =
      | { kind: 'create'; row, patch }
      | { kind: 'update'; row, employee, patch, diff }
      | { kind: 'reactivation'; row, employee, patch, diff }
      | { kind: 'absent'; employee }
      | { kind: 'invalid'; row, errors }
      | { kind: 'workplace'; name }
    ```

12. **`applyCreate(tx, item, ctx)`:**
    - Se `row` tem dados bancários (`row.tipoPix || row.banco || ...` qualquer non-null), encripta com `encryptBankData(bankDataObj, tenantId)` (Story 5.1) e seta `bankDataEnc/Iv/Tag` no `data`.
    - `tx.employee.create({ data: { ...patch, tenantId: ctx.tenantId, cpf: row.cpf normalized, hireDate: patch.hireDate (must be Date), ...bankFields } })`.
    - AuditLog `EMPLOYEE_IMPORT_CREATE` com `newData: sanitizeForLog(employee)` (sanitização é Story 5.2, aqui usa helper inline mínimo).

13. **`applyUpdate(tx, item, ctx)`:**
    - `tx.employee.update({ where: { id: employee.id }, data: { ...diffOnlyFields } })`.
    - **Apenas campos no `diff`** (não rewriteAll). Performance + minimiza escrita.
    - **bankData** só atualiza se row tem bankData fields → mesmo padrão de encrypt da create.
    - AuditLog `EMPLOYEE_IMPORT_UPDATE` com `previousData: diff[k].from` e `newData: diff[k].to`.

14. **`applyReactivation(tx, item, ctx)`:**
    - Default: `inactive=false (status='ATIVO')`, `terminationDate=null`. Se `options.reactivateAll === false`, **skipa** (mantém inativo conforme D11).
    - Se reativa: aplica patch + zera terminationDate + status='ATIVO'. AuditLog `EMPLOYEE_IMPORT_REACTIVATE`.

15. **`applyAbsent(tx, item, ctx)`:**
    - Se `options.markAbsentAsPending === true`: `tx.employee.update({ id: employee.id, data: { inactivePending: true } })`. AuditLog `EMPLOYEE_IMPORT_FLAG_INACTIVE_PENDING`.
    - Se false: nada faz (skip).

16. **`applyInvalid(tx, item, ctx)`:**
    - Não escreve em Employee. Apenas AuditLog `EMPLOYEE_IMPORT_INVALID` com `reason: errors[0]` (primeira mensagem) e `resourceId: jobId` (porque não há employee criado).

17. **`applyWorkplaceCreate(tx, item, ctx)`:**
    - `tx.workplace.create({ data: { name: item.name, tenantId, minStaff: 1 } })`.
    - AuditLog `WORKPLACE_CREATED_VIA_IMPORT`.

### Encryption integration (FR35-37, NFR8)

18. **`bankDataObj` constructor** dentro do applier (helper local):
    ```ts
    function buildBankData(row: TirvuRow): BankData | null {
      if (!row.tipoPix && !row.chavePix && !row.banco && !row.tipoConta && !row.agencia && !row.conta) return null
      return { tipoPix: row.tipoPix, chavePix: row.chavePix, banco: row.banco, tipoConta: row.tipoConta, agencia: row.agencia, conta: row.conta }
    }
    ```
    Se retorna `null`, não chama encrypt — `bankDataEnc/Iv/Tag` ficam null.

19. **Cleartext bankData NUNCA persistido nem logado.** AuditLog em create/update **redacted bankData** — não inclui no `newData`. Sanitização total fica para Story 5.2; nesta story, mínimo: omitir `bankData*` do payload de log.

### Counters (FR27, FR28)

20. **Update incremental do `rowsProcessed`** após cada chunk (não a cada row — overhead). `rowsCreated/Updated/Invalid/Absent/workplacesCreated` são atualizados na transição final COMPLETED com totais.

21. **Concurrent counters: ok ler, evitar race.** Apenas o worker do apply atualiza esses campos. Tenant lock + state machine guard cobrem race.

### Final state (FR28, NFR2, integração D5)

22. **Após último chunk:** transition APPLYING → COMPLETED com `{ completedAt, rowsProcessed, rowsCreated, rowsUpdated, rowsInvalid, rowsAbsent, workplacesCreated }`.

23. **Falha em chunk:** log error, `transition(['APPLYING'], 'FAILED', { failureReason: 'APPLY_ERROR' })`. Linhas já aplicadas em chunks anteriores ficam aplicadas (idempotência permite re-run).

24. **`errorReportBuilder.build(jobId)` chamado se `rowsInvalid > 0`** — **mas como Story 4.x ainda não criou esse módulo**, esta story apenas grava `errorReportPath` placeholder string `''` (NULL implícito) e deixa Story 4.x preencher real. Acceptable — UI só baixa quando o builder existir.

### Suite de testes

25. **`test/modules/import-applier.test.ts`** (≥10 cases) com mock Prisma transaction:
    - `applyCreate` cria Employee com tenantId + campos do patch
    - `applyCreate` com bankData → encripta e seta bankDataEnc/Iv/Tag (não cleartext)
    - `applyCreate` sem bankData → bankDataEnc null
    - `applyUpdate` atualiza só campos do diff
    - `applyReactivation` com reactivateAll=false → skipa
    - `applyReactivation` com reactivateAll=true → reativa (status ATIVO, terminationDate null)
    - `applyAbsent` com markAbsentAsPending=true → marca flag
    - `applyAbsent` com markAbsentAsPending=false → skip
    - `applyInvalid` → apenas AuditLog
    - `applyWorkplaceCreate` → cria Workplace + AuditLog
    - Idempotência: 2 chamadas seguidas de applyCreate sobre mesma row → 2ª retorna noop OR aplica de novo (depende da implementação; documentar).

26. **`test/modules/apply-validators.test.ts`** (≥4 cases):
    - `validateConfirmTenantName` retorna ok quando bate exato
    - retorna `CONFIRMATION_MISMATCH` quando difere
    - case-sensitive: 'Servi-Plus' ≠ 'servi-plus' → mismatch
    - tenant null → `INVALID_TARGET_TENANT`

27. **NÃO criar e2e test de full apply** — tem dependência de DB live + BullMQ + storage. Test integration pesado fica para Epic 4 ou QA dedicado.

### Out-of-scope (NÃO implementar)

28. **NÃO criar `error-report-builder.ts`** — Story 4.x.
29. **NÃO chamar VacationEngine.scheduleBalanceComputation** — V3 calcula saldo on-demand (stateless). API mencionada no spec não existe ainda; deferir.
30. **NÃO criar UI ImportConfirmModal** — Story 4.x.
31. **NÃO criar GET `/imports/:jobId/preview`** — Story 4.x.
32. **NÃO criar POST `/imports/:jobId/cancel`** — Story 4.x.
33. **NÃO modificar Story 5.2 (sanitização Pino)** — manter logs do applier mínimos.
34. **NÃO escrever `errorReportPath` real** — placeholder/null aceitável.
35. **NÃO migrar rotas legadas para `requirePermission`**.
36. **NÃO sanitizar AuditLog.previousData/newData além de redact bankData** — Story 5.2 tem o middleware completo.

## Tasks / Subtasks

### T1 — Helper `apply-validators.ts` (AC: 4.4, 26)

- [x] T1.1 Criar `backend-api/src/modules/imports/apply-validators.ts`. TODO header.
- [x] T1.2 Função:
  ```ts
  export type ConfirmResult =
    | { ok: true }
    | { ok: false; code: 'CONFIRMATION_MISMATCH' | 'INVALID_TARGET_TENANT'; message: string }

  export function validateConfirmTenantName(input: {
    tenantName: string | null | undefined
    provided: string | null | undefined
  }): ConfirmResult
  ```
- [x] T1.3 Lógica:
  - Se `tenantName` null/empty → `INVALID_TARGET_TENANT` "Tenant alvo não identificado".
  - Se `provided !== tenantName` (strict ===) → `CONFIRMATION_MISMATCH`.
  - Senão → ok.

### T2 — `import-applier.ts` (AC: 11–17)

- [x] T2.1 Criar `backend-api/src/modules/imports/import-applier.ts`. TODO header.
- [x] T2.2 Tipos `ApplyItem` união discriminada (AC11). Tipo `ApplyContext = { tenantId: string; jobId: string; userId: string; options: ApplyOptions }`. `ApplyOptions = { createWorkplaces: string[]; markAbsentAsPending: boolean; reactivateAll: boolean }`.
- [x] T2.3 Função `applyItem(tx, item, ctx): Promise<void>` que dispatcha por `item.kind`.
- [x] T2.4 `applyCreate`:
  - `bankData = buildBankData(row)`. Se não null → `enc = encryptBankData(bankData, tenantId)` (Story 5.1).
  - `tx.employee.create({ data: { tenantId: ctx.tenantId, cpf: parseCpfNoMask(row.cpf), name, ...patch (sem bankData), bankDataEnc, bankDataIv, bankDataTag } })`. Note que `patch` já não inclui bankData fields (mapper Story 2.3 não mapeia).
  - `auditLog.create` com `action: 'EMPLOYEE_IMPORT_CREATE'`, `resourceType: 'EMPLOYEE'`, `resourceId: emp.id`, `newData: { ...patch, hasBankData: bankData !== null }` (sem cleartext).
- [x] T2.5 `applyUpdate`: `tx.employee.update({ where: { id }, data: { ...diffPatch, bankDataEnc?, bankDataIv?, bankDataTag? } })`. AuditLog `EMPLOYEE_IMPORT_UPDATE` com `previousData: { from: ... }`, `newData: { to: ... }` extraídos do `diff` exceto bank fields.
- [x] T2.6 `applyReactivation` com guard `options.reactivateAll`. Aplica `status: 'ATIVO'`, `terminationDate: null`, demais campos do patch (incluindo bankData se houver).
- [x] T2.7 `applyAbsent` com guard `options.markAbsentAsPending`. `tx.employee.update({ where: { id }, data: { inactivePending: true } })`. AuditLog.
- [x] T2.8 `applyInvalid`: apenas AuditLog `EMPLOYEE_IMPORT_INVALID`. `resourceId: ctx.jobId`. `resourceType: 'IMPORT_JOB'`. `reason: item.errors[0] ?? 'unknown'`.
- [x] T2.9 `applyWorkplaceCreate`: `tx.workplace.create({ data: { name, tenantId: ctx.tenantId, minStaff: 1 } })`. AuditLog `WORKPLACE_CREATED_VIA_IMPORT`.
- [x] T2.10 Helper local `buildBankData(row): BankData | null` conforme AC18.

### T3 — `apply-pipeline.ts` (AC: 7, 8, 9, 10, 22, 23)

- [x] T3.1 Criar `backend-api/src/modules/imports/apply-pipeline.ts`. TODO header.
- [x] T3.2 Função:
  ```ts
  export interface ApplyPipelineInput {
    jobId: string
    options: ApplyOptions
  }
  export async function runApplyPipeline(deps: PipelineDeps & { userId: string }, input: ApplyPipelineInput): Promise<void>
  ```
- [x] T3.3 Implementação conforme AC8. Chunks de 100 (`IMPORT_CHUNK_SIZE` env, default 100).
- [x] T3.4 Counter aggregation: track local counters; final transition update with totals.
- [x] T3.5 Imports: `import { matchAll, ... } from './import-matcher'`, `import { applyItem } from './import-applier'`, `import { read } from './import-storage'`, `import { transition } from './import-job-service'`, etc.
- [x] T3.6 Catch fatal error: log + transition `['APPLYING']` → `'FAILED'` + `failureReason: 'APPLY_ERROR'` + `errorMessage` truncado 500 chars.

### T4 — Estender `plugins/imports.ts` worker switch (AC: 7)

- [x] T4.1 Editar [backend-api/src/plugins/imports.ts](backend-api/src/plugins/imports.ts):
  - Add case `job.name === 'apply'`:
    ```ts
    if (job.name === 'apply') {
      const { jobId, options } = job.data as { jobId: string; options: ApplyOptions }
      const found = await fastify.prisma.importJob.findUnique({ where: { id: jobId }, select: { tenantId: true, operatorUserId: true } })
      if (!found) return
      const acquired = await acquireTenantLock(redisClient, found.tenantId)
      if (!acquired) {
        await fastify.tirvuImportQueue.add('apply', { jobId, options }, { delay: 5000 })
        return
      }
      try {
        await runApplyPipeline({ prisma: fastify.prisma, log: fastify.log, userId: found.operatorUserId }, { jobId, options })
      } finally {
        await releaseTenantLock(redisClient, found.tenantId)
      }
      return
    }
    ```

### T5 — Rotas Apply (AC: 1, 2, 3, 4, 5, 6)

- [x] T5.1 Criar helper `backend-api/src/modules/imports/apply-flow.ts` com função `applyEntrypoint(fastify, request, reply, { jobId, scope })`. Centraliza validações + transition + auditlog + enqueue.
- [x] T5.2 Criar `backend-api/src/routes/api/v1/admin/imports/[jobId]/apply.ts`:
  ```ts
  fastify.post('/', {
    onRequest: [requireAuth, requireSuperAdmin, requirePermission('import.run')],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    return applyEntrypoint(fastify, request, reply, { jobId, scope: 'admin' })
  })
  ```
- [x] T5.3 Criar `backend-api/src/routes/api/v1/imports/[jobId]/apply.ts` análogo com `requireAdmin` em vez de SuperAdmin + `scope: 'tenant'`.
- [x] T5.4 Em `apply-flow.ts`:
  - findUnique job
  - tenant scope check (`scope === 'tenant' && job.tenantId !== user.tenantId` → 404)
  - findUnique tenant
  - validateConfirmTenantName
  - status PREVIEW_READY check
  - transition + auditlog + queue.add
  - 202 envelope

### T6 — Testes do applier (AC: 25)

- [x] T6.1 Criar `backend-api/test/modules/import-applier.test.ts`.
- [x] T6.2 Mock Prisma transaction client (`tx`):
  ```ts
  const calls = { employeeCreates: [], employeeUpdates: [], workplaceCreates: [], auditLogs: [] }
  const tx = {
    employee: {
      async create({ data }) { const e = { id: randomUUID(), ...data }; calls.employeeCreates.push(e); return e },
      async update({ where, data }) { calls.employeeUpdates.push({ id: where.id, data }); return { id: where.id, ...data } },
    },
    workplace: { async create({ data }) { const w = { id: randomUUID(), ...data }; calls.workplaceCreates.push(w); return w } },
    auditLog: { async create({ data }) { calls.auditLogs.push(data); return { id: randomUUID(), ...data } } },
  }
  ```
- [x] T6.3 Setup `process.env.BANK_DATA_ENCRYPTION_KEY` antes de importar applier (encryption module fail-fast). Reusa key dos tests de Story 5.1 ou gera 32 bytes random base64 inline.
- [x] T6.4 Casos do AC25.

### T7 — Testes apply-validators (AC: 26)

- [x] T7.1 Criar `backend-api/test/modules/apply-validators.test.ts`.
- [x] T7.2 4 cases do AC26.

### T8 — Validação final (AC: tudo)

- [x] T8.1 `npx tsc --noEmit` zero erros.
- [x] T8.2 Suite focada novo:
  ```bash
  node --test -r ts-node/register \
    "test/modules/import-applier.test.ts" \
    "test/modules/apply-validators.test.ts"
  ```
- [x] T8.3 Suite full regression: 162 + ≥14 = ≥176, 0 fail.
- [x] T8.4 Atualizar Dev Agent Record com File List.

## Dev Notes

### Por que re-executar match no apply em vez de usar previewSummary?

Snapshot DB em `previewSummary` é **stale snapshot** do parse phase. Operador pode ter:
- Outro operador criou/editou Employees no mesmo tenant entre preview e apply
- Tenant ficou inativo
- Workplace foi criado manualmente

Re-rodar match no apply (com mesmo arquivo persistido + DB atual) garante consistência. Custo: ~1-2s extras para 5k linhas. Aceitável.

### Idempotência (NFR31)

Re-aplicar o mesmo arquivo → matcher 2x retorna `unchanged.length = total`. `applyItem` para `unchanged` é noop (não está no AC11 acima — adicionar `kind: 'unchanged'` ou simplesmente filtrar para nem chamar applyItem). **Decisão:** filtrar `unchanged` antes do loop. Counters ficam: create=0, update=0, etc.

### Por que `applyItem(tx, ...)` recebe `tx` (transaction client)?

Cada chunk roda em `prisma.$transaction(async tx => { ... })`. AuditLog também precisa estar dentro da mesma transação (rollback consistente). Passar `tx` em todas as funções garante isso.

### Counters incrementais

Approach simples: aggregate em memória durante o loop, update DB **apenas ao final** com totais. AC20 sugere update incremental por chunk para UX (operador vê progresso via polling), mas:
- Cada update DB = lock contention
- 5k linhas / 100 chunks = 50 updates extras no DB

**Trade-off:** update por chunk é melhor para UX (Story 4.x polling). Implementar com `prisma.importJob.update({ data: { rowsProcessed: { increment: chunk.length } } })` (atomic increment).

### Sanitização mínima de bankData em logs

Spec aceita "redact bankData fields do log payload" — não precisa do middleware Pino completo (Story 5.2). Helper inline:
```ts
function redactBankData(obj: any) {
  if (!obj || typeof obj !== 'object') return obj
  const { bankData, bankDataEnc, bankDataIv, bankDataTag, ...rest } = obj
  return { ...rest, hasBankData: !!(bankData || bankDataEnc) }
}
```

### Apply rate limit

Apply é operação cara (5k+ linhas). Rate limit 10/min por operador é razoável. Cliente normal faz <5/dia.

### Watchdog APPLYING TIMED_OUT

Story 3.1 watchdog já cuida de jobs travados em APPLYING > 15min. Não precisa adição aqui.

### Erro fatal vs erro de linha

- Erro de linha → row vai pra invalid no preview (Story 2.2/2.3) → `applyInvalid` skipa. Não falha job inteiro.
- Erro fatal (DB unreachable, OOM) → `transition` para FAILED. Linhas anteriores ficam aplicadas (idempotência cobre re-run).

### `markAbsentAsPending` semântica

Architecture/PRD: ausência ≠ demissão automática. Operador pode marcar candidatos a inativar (`inactivePending=true`), revisar, e em seguida aplicar `inactive=true` manualmente. Esta story só seta a flag. Inativação real é fora-de-escopo (futuro).

### O que NÃO fazer

- ❌ NÃO chamar VacationEngine.scheduleBalanceComputation (não existe em V3)
- ❌ NÃO criar error-report-builder (Story 4.x)
- ❌ NÃO criar UI confirm-modal (Story 4.x)
- ❌ NÃO criar GET preview endpoint (Story 4.x)
- ❌ NÃO permitir cleartext bankData em logs ou DB
- ❌ NÃO sanitizar logs além do mínimo (Story 5.2 tem plugin global)

### Project Structure Notes

Files que esta story mexe (esperado):
- ✨ `backend-api/src/modules/imports/import-applier.ts` — applier por categoria
- ✨ `backend-api/src/modules/imports/apply-pipeline.ts` — orquestra worker apply
- ✨ `backend-api/src/modules/imports/apply-validators.ts` — confirm-name validator
- ✨ `backend-api/src/modules/imports/apply-flow.ts` — helper compartilhado das 2 rotas
- ✨ `backend-api/src/routes/api/v1/admin/imports/[jobId]/apply.ts`
- ✨ `backend-api/src/routes/api/v1/imports/[jobId]/apply.ts`
- ✏️ `backend-api/src/plugins/imports.ts` — adicionar case 'apply' no worker
- ✨ `backend-api/test/modules/import-applier.test.ts` — 10+ cases
- ✨ `backend-api/test/modules/apply-validators.test.ts` — 4+ cases

Files que NÃO toca:
- 🚫 `prisma/schema.prisma`
- 🚫 outros módulos imports já existentes
- 🚫 `worker.ts` legacy
- 🚫 frontend-web

### Mensagem de commit sugerida

```
feat(imports): apply route + chunked applier (Story 3.2)

- POST /admin/imports/:jobId/apply (SUPERADMIN) +
  POST /imports/:jobId/apply (TenantAdmin) — confirmTenantName
  required, validates PREVIEW_READY, transitions APPLYING, enqueues
- import-applier.ts: applyCreate/Update/Reactivation/Absent/Invalid/
  WorkplaceCreate; bankData encrypted via Story 5.1; AuditLog per row
- apply-pipeline.ts: worker handler — re-runs match against fresh DB
  snapshot, chunks 100 rows in $transaction, atomic increment of
  rowsProcessed, final transition COMPLETED with totals; FAILED with
  APPLY_ERROR on fatal error
- apply-validators.ts: validateConfirmTenantName helper
- apply-flow.ts: shared route entrypoint (admin/tenant scope)
- 14+ unit tests for applier + validator
- Idempotency: 2nd apply on same file = 0 changes (matcher unchanged)
```

### References

- [Architecture D5 — State Machine](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D5)
- [Architecture D8 — Match + Diff](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D8)
- [Architecture D9 — Endpoints](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D9)
- [Architecture §Communication Patterns — AuditLog actions](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) (linhas 824–836)
- [Epics — Story 3.2](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 584–657)
- [PRD — FR10, FR20, FR22-28, FR31, NFR31](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- Stories prereq (todas done): 5.1 (encryption), 1.1 (storage), 2.1 (schema), 2.2 (parser/validator), 2.3 (matcher/state), 3.1 (worker/lock), 1.2/1.3 (upload routes)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- Convenção V3 não usa diretórios dinâmicos (`[jobId]`/`_jobId_`). Em vez disso, criei `jobs.ts` no diretório `routes/api/v1/admin/imports/` com `fastify.post('/:jobId/apply', ...)` — autoload monta o prefix `/admin/imports` e a rota fica `/admin/imports/:jobId/apply`. Mesmo padrão para `routes/api/v1/imports/jobs.ts` → `/imports/:jobId/apply`.
- `terminationDate` Prisma: para zerar via update, mesmo trick da Story 1.1 — `{ set: null as unknown as Date }`.
- `applyUpdate` filtra `data` por chaves do `diff` para garantir que apenas campos divergentes sejam escritos. bankData fields são adicionados separadamente quando row contém dados bancários (sempre re-escreve mesmo que diff não cite).

### Completion Notes List

- ✅ T1 — `apply-validators.ts` com `validateConfirmTenantName` (5 cases cobertos no test).
- ✅ T2 — `import-applier.ts` com `applyItem(tx, item, ctx)` dispatcher para 6 kinds (create/update/reactivation/absent/invalid/workplace). bankData encryption via Story 5.1. AuditLog por linha. `redactForLog` impede cleartext de `bankDataEnc/Iv/Tag` em logs.
- ✅ T3 — `apply-pipeline.ts` orquestra: lê file → parse → validate → matchAll fresh → buildItems (filtra newWorkplaces por createWorkplaces option) → chunks de 100 em `$transaction` → atomic `increment` de rowsProcessed → final transition COMPLETED com totals + AuditLog `EMPLOYEE_IMPORT_JOB_COMPLETED`. Catch InvalidStateTransitionError (re-throw) e generic (FAILED + APPLY_ERROR).
- ✅ T4 — `plugins/imports.ts` worker switch ganhou case `apply` com tenant lock + delegação para `runApplyPipeline`.
- ✅ T5 — `apply-flow.ts` com `applyEntrypoint(fastify, request, reply, { jobId, scope })`. 2 rotas finas: `routes/api/v1/admin/imports/jobs.ts` (SUPERADMIN) e `routes/api/v1/imports/jobs.ts` (TenantAdmin). Validação completa: 404 cross-tenant, 400 INVALID_TARGET_TENANT, 400 CONFIRMATION_MISMATCH, 409 INVALID_JOB_STATE, 409 race, 202 sucesso.
- ✅ T6 — `import-applier.test.ts` com 10 cases cobrindo todos os kinds + bankData encrypted/redacted + delta correto.
- ✅ T7 — `apply-validators.test.ts` com 5 cases.
- ✅ T8 — tsc zero erros. Suite focada 15/15. Suite full regression 177/177 (162 + 15).

### File List

- ✨ [backend-api/src/modules/imports/apply-validators.ts](backend-api/src/modules/imports/apply-validators.ts)
- ✨ [backend-api/src/modules/imports/import-applier.ts](backend-api/src/modules/imports/import-applier.ts)
- ✨ [backend-api/src/modules/imports/apply-pipeline.ts](backend-api/src/modules/imports/apply-pipeline.ts)
- ✨ [backend-api/src/modules/imports/apply-flow.ts](backend-api/src/modules/imports/apply-flow.ts)
- ✏️ [backend-api/src/plugins/imports.ts](backend-api/src/plugins/imports.ts) — adiciona case 'apply' no worker
- ✨ [backend-api/src/routes/api/v1/admin/imports/jobs.ts](backend-api/src/routes/api/v1/admin/imports/jobs.ts) — POST /admin/imports/:jobId/apply
- ✨ [backend-api/src/routes/api/v1/imports/jobs.ts](backend-api/src/routes/api/v1/imports/jobs.ts) — POST /imports/:jobId/apply
- ✨ [backend-api/test/modules/apply-validators.test.ts](backend-api/test/modules/apply-validators.test.ts) — 5 cases
- ✨ [backend-api/test/modules/import-applier.test.ts](backend-api/test/modules/import-applier.test.ts) — 10 cases

### Change Log

- 2026-05-01 — Story 3.2 implementada. Apply route + chunked transactional applier com bankData encryption + AuditLog completo + idempotência via re-match. 15 unit tests novos. 177/177 full regression.
