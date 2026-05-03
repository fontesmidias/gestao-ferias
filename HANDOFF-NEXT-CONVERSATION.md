# Handoff — Continuidade em nova conversa

**Data:** 2026-05-03 (sessão fechada)
**Feature ativa:** `v3-2-import-tirvu`
**Status do épico:** **Quase 100% completo** — Story 5.3 commitada mas com **8 issues de code review pendentes para resolver**.

---

## 🎯 Próximo passo imediato

Aplicar **opção 1** do code review da Story 5.3: **corrigir automaticamente os 5 HIGH + 3 MEDIUM** encontrados na suite de pen-tests `backend-api/test/security/imports-cross-tenant.test.ts`.

### Como retomar (cole na primeira mensagem da nova conversa)

```
Estou retomando o trabalho na feature v3-2-import-tirvu.

Acabei de fechar a sessão após implementar Story 5.3 (pen-tests cross-tenant)
— commit a1cb91c…18c25dc, suite 276/276 verde. Mas o code review adversarial
encontrou 5 HIGH + 3 MEDIUM + 2 LOW que ainda preciso resolver.

Por favor:
1. Leia HANDOFF-NEXT-CONVERSATION.md na raiz pra contexto completo dos issues.
2. Aplique opção 1 (corrigir automaticamente HIGH + MEDIUM, deixar LOW como
   action items registrados na story file).
3. Re-valide com `npx tsx --test test/modules/*.test.ts test/security/*.test.ts`
   (276/276 atual, deve subir após mirror tests A↔B).
4. Atualize a Senior Developer Review section da story 5-3 com action items
   marcados [x] + commit final.
```

---

## 📋 Os 8 issues a resolver

### 🔴 HIGH (5)

**H1 — SuperAdmin com `tenantId: null` não é testado**
`backend-api/test/security/imports-cross-tenant.test.ts:60` — só cobre SuperAdmin com `tenantId=tenantA` (impersonação). Schema permite `tenantId: null` para SUPERADMIN, e branch `!user.tenantId` em `status-flow.ts:39` nunca é exercitada.
**Fix:** criar `superAdminNullTenant` user + 2 tests:
- GET admin endpoint em jobA com SuperAdmin null-tenant → 200 OK
- GET tenant endpoint `/imports/:jobId` com SuperAdmin null-tenant → 404 (defesa em profundidade)

**H2 — CNPJ UNIQUE flakiness via timestamp truncado**
`test:27-34` — `Date.now().toString().slice(-7)` + seq counter pode colidir entre runs locais ou processos paralelos. Schema `cnpj @unique` → P2002 trava suite.
**Fix:** trocar `uniqCnpj()` para usar `randomBytes(7).toString('hex')` (14 chars únicos cripto-fortes) ou `randomUUID().replace(/-/g, '').slice(0, 14)`.

**H3 — Body JSON com tenantId malicioso não testado**
`test:251` cobre só multipart. Atacante pode tentar `Content-Type: application/json` body `{tenantId: 'B'}`. Backend hoje rejeita por "missing file" antes, mas se ordem de validações mudar, vetor não é coberto.
**Fix:** adicionar test:
```ts
await t.test('POST /imports/employees JSON sem multipart com tenantId malicioso → não cria em B', ...)
```
Assert: `statusCode !== 201` E `prisma.importJob.findMany({where: {tenantId: tenantB.id, filename: matching}}).length === 0`.

**H4 — Test "→ 403" não valida ORIGEM do 403 (false positive risk)**
`test:234, 242` — assert apenas `statusCode === 403`. Se rate limit ou outro middleware retornar 403 por motivo errado, test passa por motivo errado.
**Fix:** assertar `body.message` contém `"Acesso restrito"` (mensagem específica do `requireSuperAdmin` em `auth-guard.ts:29`) OU `body.error === 'Forbidden'`.

**H5 — Cobertura assimétrica: só TenantAdminA→B testado**
`test:52-57` cria `tenantAdminB` mas nunca usa em test. Mirror tests B→A faltam.
**Fix:** extrair helper `runCrossTenantSuite(t, adminToken, otherJobId, label)` e chamar 2× (A→B e B→A). Dobra cobertura para 10 cases (5 endpoints × 2 direções).

### 🟡 MEDIUM (3)

**M1 — Rate limit pode causar flakiness em dev local**
Rotas `/imports/employees` têm `{max: 5, timeWindow: '1 minute'}`. Test T4 faz 3 uploads consecutivos. Em dev local, 2 runs em <1min batem 429.
**Fix:** opção (a) usar `request.ip` único por test injetando header `X-Forwarded-For` artificial; (b) registrar `fastify.rateLimit.global.reset()` no `t.before`; ou (c) aceitar limitação documentada.

**M2 — Cleanup `t.after` sem try/catch**
`test:152-159` — se uma `deleteMany` falhar, runs subsequentes têm dados órfãos. Falha em silêncio.
**Fix:** wrap cada deleteMany em try/catch + log + adicionar pre-setup que limpa `tenant.name LIKE 'PenTest-%' AND createdAt < NOW() - 1h`.

**M3 — `confirmTenantName` validation no apply não é testada explicitamente**
Só testes de cross-tenant. Validation gambiarra `confirmTenantName: 'wrong'` poderia regredir.
**Fix:** opcional — 1 case adicional: `SuperAdmin com jobId válido (tenantA) + body { confirmTenantName: 'NomeErrado' } → 400 INVALID_CONFIRM_TENANT_NAME`.

### 🟢 LOW (2 — deixar como action items na story)

**L1** — assert que decryptError NÃO grava AuditLog (5 linhas extras, baixo valor).
**L2** — CPF fixture com formato `xxx.yyy.000-99` não-validado BR (defensivo se algum futuro hook validar).

---

## 📦 Estado do épico

| Story | Status | Commit |
|---|---|---|
| 5.1 / 1.1-1.3 / 2.1-2.3 / 3.1-3.2 / 4.0a / 4.0b | ✅ done | (sessão anterior) |
| 4.1 — UI Upload + Preview | ✅ done | `1581450` |
| 4.2 — UI Apply + Done | ✅ done | `a1cb91c` |
| 5.2 — Pino redact + bankData masked GET | ✅ done | `7885273` |
| 5.3 — Pen-tests cross-tenant | ⚠️ done com 8 issues review | `18c25dc` |

**Branch:** `main`, **5 commits ahead of origin/main**, working tree clean.

---

## 📁 Arquivos relevantes para os fixes

### Editar diretamente
- `backend-api/test/security/imports-cross-tenant.test.ts` — todas as mudanças HIGH+MEDIUM ficam aqui

### Para consultar (não editar — referência)
- `backend-api/src/routes/api/v1/admin/imports/jobs.ts` — confirmar middleware chain ADMIN_GUARD
- `backend-api/src/routes/api/v1/imports/jobs.ts` — confirmar TENANT_GUARD
- `backend-api/src/plugins/auth-guard.ts` — mensagens exatas dos guards (para H4 assert)
- `backend-api/src/modules/imports/status-flow.ts` linha 39 — branch `!user.tenantId` (para H1 cobertura)
- `backend-api/src/routes/api/v1/admin/imports/employees/index.ts` — config rate limit + validation order

### Story file a atualizar no fim
- `_evo-output/implementation-artifacts/v3-2-import-tirvu/5-3-pen-tests-cross-tenant.md`
  - Adicionar action items resolvidos como `[x] [AI-Review][HIGH] H1 — ...`
  - L1 e L2 ficam `[ ] [AI-Review][LOW]` para futuro

---

## 🧪 Como rodar a suite localmente

Postgres + Redis devem estar rodando (containers `gv-postgres`/`gv-redis`):

```bash
cd c:/Users/cery0/projetos/gestao-ferias/backend-api

# tsc check
npx tsc --noEmit

# CI-style full regression (atual: 276/276; após fixes deve subir para ~280-285)
DATABASE_URL="postgresql://admin:adminpassword@localhost:5433/gestaoferias?schema=public" \
BANK_DATA_ENCRYPTION_KEY="0+5mYyV8DG7BUSmJ6ugef35NARVs5HJ+TbogSnOD0D4=" \
JWT_SECRET="ci_test_secret_key_not_for_production" \
IMPORT_FILE_STORAGE_PATH="/tmp/imports-security-test" \
npx tsx --test test/modules/*.test.ts test/security/*.test.ts

# Build
npm run build
```

---

## 🔑 Decisões já tomadas (não mudar)

- **Bypass fastify-cli helper** em pen-tests via `Fastify({...}).register(fp(appModule.default))` — fastify-cli era incompatível com tsx. Manter padrão.
- **Cleanup ordem:** auditLog → importJob → employee → user → tenant (FK cascade manual).
- **Workaround AC#14:** test usa SuperAdmin com tenantId=tenantA tentando employee de tenantB (em vez de TenantAdmin com permission gambiarra) — alinhado com permission map atual onde só SUPERADMIN tem `bankData.view`.

---

## 📝 Após resolver os 8 issues

1. Commit final com mensagem tipo:
   ```
   test(security): address Story 5.3 review findings (5 HIGH + 3 MEDIUM)

   - H1: cobre SuperAdmin com tenantId=null (admin OK + tenant 404)
   - H2: random hex CNPJ/email para evitar P2002 UNIQUE flakiness
   - H3: test JSON body com tenantId malicioso (sem multipart)
   - H4: assert body.message origin para evitar false positive 403
   - H5: mirror tests A↔B (10 cross-tenant cases ao invés de 5)
   - M1: reset rate limit no setup
   - M2: try/catch + pre-cleanup defensivo
   - M3: case adicional para INVALID_CONFIRM_TENANT_NAME
   ```

2. Atualizar story 5.3 Senior Developer Review section.

3. **Épico v3-2-import-tirvu fica 100% completo** — atualizar este HANDOFF para refletir conclusão e próximos épicos sugeridos:
   - Smoke tests manuais via Postman + browser (T11.5 da 4.1, T9.5 da 4.2, T6.3/T6.4 da 5.2)
   - Backend `GET /imports/:jobId/file` (download arquivo original — open question da 4.2)
   - Push pra origin/main (5+ commits ahead)
   - Próximo épico: V3.x.x roadmap (consultar `_evo-output/planning-artifacts/v3-postos-cobertura-ai/roadmap.md`)

---

## 🧠 Memórias relevantes (auto-loaded)

- `feedback_engineering_practices.md` — commits frequentes, CI verde
- `feedback_technical_gotchas.md` — Pino redact com `--options` flag (Story 5.2 fix), tsx hoist env
- `project_v32_import_tirvu.md` — feature overview (atualizar para refletir Story 5.3 done)

---

## 📊 Métricas desta sessão (2026-05-03)

- **Stories completadas:** 4 (4.2 + 5.2 + 5.3 + parcial pre-4.2 spec)
- **Commits:** 4 (`a1cb91c` 4.2, `7885273` 5.2, `18c25dc` 5.3, mais 1 pendente para review fixes)
- **Suite backend:** 245 → **276** (+31 tests; +14 modules + 14 security + 3 misc)
- **Suite frontend:** 6 → **72** (+66 tests; 4.1 + 4.2)
- **Arquivos novos:** ~35 (frontend 22 da 4.1 + 9 da 4.2 + backend 6 da 5.2/5.3)
- **CI status:** ✅ esperado verde (todos commits passam local)
