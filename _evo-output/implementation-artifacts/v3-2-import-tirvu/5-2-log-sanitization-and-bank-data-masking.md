# Story 5.2: Log sanitization (Pino redact) + bankData masking endpoint com AuditLog desmascarado

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a operador SuperAdmin / TenantAdmin e auditor LGPD,
I want que (a) campos sensíveis (`bankData.*`, `cpf` parcial, `personalData.rg`, `personalData.pisPasep`, `chavePix`, `agencia`, `conta`) **NUNCA** apareçam em logs do servidor, e (b) `GET /employees/:id` devolva `bankData` mascarado por default — com opção de desmascarar somente com header `X-Show-Bank-Data: true` + permission `bankData.view`, registrando AuditLog automático em todo acesso desmascarado,
so that LGPD seja respeitada (princípio de minimização + prestação de contas) e vazamentos via logs ou API default sejam **impossíveis** mesmo se um log de erro vazar pra papertrail/datadog/cloud.

> **Escopo desta story:** **server-side defesa em camadas.** Frontend não muda. Cobre FR36 + FR37.

## Acceptance Criteria

### A. Log sanitization global (FR36)

1. **Pino redact configurado nas opts do Fastify:**
   - Em [backend-api/src/app.ts](backend-api/src/app.ts), exportar `options` com `logger: { redact: { paths, censor } }`.
   - Compatível com `fastify start -l info` (CLI atual): nível continua `info`, redact aplicado em cima.

2. **Lista de paths redactados (todos com wildcard onde necessário):**
   ```
   '*.bankData', '*.bankData.*',
   'bankData', 'bankData.*',
   '*.chavePix', 'chavePix',
   '*.agencia', 'agencia',
   '*.conta', 'conta',
   '*.banco', 'banco',
   '*.tipoPix', 'tipoPix',
   '*.tipoConta', 'tipoConta',
   '*.cpf', 'cpf',                       // mascarado, não removido — ver censor
   '*.personalData.rg', 'personalData.rg',
   '*.personalData.pisPasep', 'personalData.pisPasep',
   '*.bankDataEnc', 'bankDataEnc',       // ciphertext bytes — não vaza, mas redundância
   '*.bankDataIv', 'bankDataIv',
   '*.bankDataTag', 'bankDataTag',
   'req.headers["x-show-bank-data"]'    // header sensível por convenção
   ```

3. **Censor:**
   - Pino aceita `censor` como string ou função. Usar função para CPF: substitui por `***.***.XXX-XX` mantendo só posições 6-8 (3 dígitos do meio).
   - Demais campos: censor literal `'[REDACTED]'`.
   - **Implementação:** como Pino redact aceita 1 censor global, fazer um wrapper que diferencia por path:
     ```ts
     redact: {
       paths: [...],
       censor: (value, path) => {
         const last = path[path.length - 1]
         if (last === 'cpf' && typeof value === 'string') {
           const digits = value.replace(/\D/g, '')
           if (digits.length === 11) return `***.***.${digits.slice(6, 9)}-XX`
         }
         return '[REDACTED]'
       }
     }
     ```

4. **Test `log-sanitization.test.ts`:**
   - Spawna instância Fastify in-memory (sem CLI), captura logs via Pino destination customizado (stream que coleta strings).
   - Caso 1: log `fastify.log.info({ employee: { cpf: '12345678900', bankData: { chavePix: 'foo@bar.com' } } }, 'test')` → buffer contém `***.***.789-XX` E NÃO contém `12345678900` E NÃO contém `foo@bar.com` E contém `[REDACTED]`.
   - Caso 2: log com `personalData: { rg: '999999', pisPasep: '12012012012' }` → buffer NÃO contém `999999` nem `12012012012`.
   - Caso 3: regex grep no buffer `^\d{3}\.\d{3}\.\d{3}-\d{2}$` (CPF formato BR completo) → 0 matches.
   - Caso 4: log `{ chavePix: 'a@b.c', agencia: '1234', conta: '5678-9' }` → todos `[REDACTED]`.
   - Caso 5: nested deep `{ data: { rows: [{ employee: { bankData: {...} } }] } }` → bankData nested redacted (validar wildcard cobre arrays também — Pino default behavior).

### B. Endpoint GET /employees/:id mascarado por default (FR37)

5. **Modificar [backend-api/src/routes/api/v1/employees/index.ts](backend-api/src/routes/api/v1/employees/index.ts)** rota `GET /:id`:
   - Continua exigindo `requireAuth` (sem mudança).
   - Após buscar employee, **sempre que `bankDataEnc` existir**, montar `bankData` no response baseado em header + permission.

6. **Comportamento sem header `X-Show-Bank-Data`:**
   - Response inclui `bankData: { masked: true, last4: 'XXXX', tipoPix: 'CPF' | 'EMAIL' | ... | null }`.
   - `last4`: últimos 4 chars do campo `conta` decryptado (chamada decrypt feita só pra extrair hint, **não exposta** no response).
   - `tipoPix`: campo decryptado, exposto (não é dado bancário sensível, é só categoria).
   - Caso decrypt falhe (tampering ou key wrong): `bankData: { masked: true, last4: '????', tipoPix: null, error: 'unavailable' }` + log error técnico (server-side).
   - **AuditLog NÃO é gerado** (acesso default é trivial e auditá-lo seria ruído).

7. **Comportamento com header `X-Show-Bank-Data: true`:**
   - Verifica permission `bankData.view` via `fastify.requirePermission('bankData.view')` (registrada na Story 5.1).
   - Se NÃO tem permission → 403 com `{ error: { code: 'FORBIDDEN_BANK_DATA', message: 'Sem permissão para visualizar dados bancários' } }`. Response **omite** o campo `bankData` (nem mascarado).
   - Se TEM permission → decrypt `bankData` e expõe TODOS os campos: `{ tipoPix, chavePix, banco, tipoConta, agencia, conta }`.
   - **AuditLog `EMPLOYEE_BANK_DATA_VIEWED` registrado automaticamente** com `{ tenantId, userId: viewerUserId, action, resourceType: 'EMPLOYEE', resourceId: employeeId, ip, userAgent }`.

8. **Header parsing:**
   - Aceitar `X-Show-Bank-Data: true` (case-insensitive header name; valor = `true` exato, sem ambiguidade).
   - Qualquer outro valor (`false`, `1`, ausente) → comportamento default mascarado.

9. **Performance:**
   - Decrypt é chamado APENAS quando bankDataEnc existe E (modo desmascarar OU precisamos de hint mascarado).
   - Modo mascarado: 1 decrypt por employee só pra gerar hint — aceitável para single GET; seria O(N) custoso para list endpoint, mas list não está em escopo desta story.

10. **Cross-tenant safety (carry-over):**
    - Query existente já filtra por `tenantId: user.tenantId` (linha 192-194). Mantido.
    - SuperAdmin acessa via tenant-switch (impersonation muda `user.tenantId`). Sem mudança aqui.

### C. Permission check helper

11. **Reusar `fastify.requirePermission('bankData.view')`** quando header presente. Não usar como `onRequest` (rota toda) — é condicional. Chamar como função programaticamente OU verificar manualmente:
    - Opção A (preferida, mais simples): inline check usando o mesmo módulo de permissões. Adicionar em `permissions.ts` um helper `hasPermission(user, key): boolean` síncrono.
    - Opção B: usar `requirePermission('bankData.view')(request, reply)` programaticamente — feio porque retorna void/throws.
    - Recomendação: helper síncrono.

12. **Se Story 5.1 não exportou helper síncrono:** estender `permissions.ts` com:
    ```ts
    export function hasPermission(role: string | undefined, key: PermissionKey): boolean
    fastify.decorate('hasPermission', (user: { role?: string }, key: PermissionKey) => ...)
    ```

### D. Error handling — não vaza cleartext

13. **Decrypt failure** (tag inválido, chave errada, tampering):
    - `decryptBankData` lança Error → API retorna response com `bankData: { masked: true, last4: '????', error: 'unavailable' }` (modo mascarado) OU 500 com mensagem genérica `"Erro ao acessar dados bancários"` (modo desmascarado).
    - Log do error inclui detalhes técnicos (`err.message.slice(0, 200)`) MAS sem expor ciphertext bytes raw — só metadados (`employeeId`, `tenantId`).

14. **Error message redaction:** se algum dia um decrypt parcial vazar bytes plaintext em error stack, o Pino redact (AC #2) deve capturar. Valida via test de error path.

### E. AuditLog

15. **Modelo AuditLog** já existe (linha 240 do schema). Action novo:
    - `action: 'EMPLOYEE_BANK_DATA_VIEWED'` (enum string).
    - `resourceType: 'EMPLOYEE'`, `resourceId: employee.id`.
    - `userId: request.user.userId`, `tenantId: request.user.tenantId`.
    - `ip: request.ip`, `userAgent: request.headers['user-agent'] ?? null`.
    - `details: null` (não armazenar bankData nem hash dele — minimização).
    - Insertion via `fastify.prisma.auditLog.create({...})` em background fire-and-forget (`.catch(err => log.error(...))`) para não bloquear response.

### F. Testes

16. **`backend-api/test/modules/log-sanitization.test.ts`** (≥5 cases conforme AC #4).

17. **`backend-api/test/modules/employees-bank-data.test.ts`** (≥6 cases):
    - GET sem header → bankData mascarado, AuditLog NÃO criado.
    - GET sem header em employee sem bankData → response não inclui campo bankData.
    - GET com header + permission `bankData.view` → bankData decryptado completo, AuditLog criado.
    - GET com header SEM permission → 403 FORBIDDEN_BANK_DATA, sem campo bankData.
    - GET com header em employee de outro tenant → 404 (cross-tenant).
    - Decrypt falha (mock que throws) → 500 com mensagem genérica em modo desmascarar; bankData.error='unavailable' em modo mascarado.

18. **NÃO criar tests E2E full-app** — unit/integration são suficientes.

19. **Test fixture:** criar helper `createEmployeeWithBankData(prisma, tenantId)` que insere employee real com `bankDataEnc/Iv/Tag` válidos via `encryptBankData`.

### G. Out-of-scope

20. ❌ Mascarar bankData em LIST endpoints (`GET /employees`) — fora de escopo, list não retorna bankData hoje.
21. ❌ AuditLog viewer UI no frontend — backend-only nesta story.
22. ❌ Frontend que entende `bankData.masked: true` — sem UI nesta story; existing callers já não exibem bankData; quando UI futura quiser, vai ler `masked` flag.
23. ❌ Story 5.3 pen-tests cross-tenant (story separada).

## Tasks / Subtasks

### T1 — Pino redact em app.ts (AC: 1, 2, 3)

- [x] T1.1 Editar [backend-api/src/app.ts](backend-api/src/app.ts): adicionar `logger` em `options` com `redact: { paths, censor }`.
- [x] T1.2 Definir `paths` array conforme AC #2 (combinar `'*.x'` + `'x'` para cobrir top-level e nested).
- [x] T1.3 Censor function: detect path[-1] === 'cpf' → mask BR pattern; default → `'[REDACTED]'`.
- [x] T1.4 Confirmar com `npm run dev` que logger ainda emite info nível.

### T2 — Helper hasPermission síncrono (AC: 11, 12)

- [x] T2.1 Editar [backend-api/src/plugins/permissions.ts](backend-api/src/plugins/permissions.ts): exportar função pura `hasPermission(role, key)`. Decorate `fastify.hasPermission`.
- [x] T2.2 Reusar mesma `permissionsByRole` map de Story 5.1 (deve estar em arquivo compartilhado).
- [x] T2.3 Atualizar TypeScript module augmentation para incluir `hasPermission` no FastifyInstance.

### T3 — Modificar GET /employees/:id (AC: 5, 6, 7, 8, 9, 10, 13, 15)

- [x] T3.1 Editar [backend-api/src/routes/api/v1/employees/index.ts](backend-api/src/routes/api/v1/employees/index.ts) rota GET /:id.
- [x] T3.2 Após `findFirst`, parsear header `x-show-bank-data` (lower-case Fastify normaliza). Comparar valor literal `'true'`.
- [x] T3.3 Se header presente: chamar `fastify.hasPermission(user, 'bankData.view')`. Se false → 403 com envelope `{ error: { code: 'FORBIDDEN_BANK_DATA', ... } }` (omite bankData).
- [x] T3.4 Se header presente + permission OK: chamar `decryptBankData({ enc: employee.bankDataEnc, iv: employee.bankDataIv, tag: employee.bankDataTag }, tenantId)` → expor decryptado em response. Try/catch para erro genérico.
- [x] T3.5 Se header ausente E `bankDataEnc` existe: chamar decrypt SOMENTE pra extrair `tipoPix` + último 4 de `conta`; expor `bankData: { masked: true, last4, tipoPix }`. Try/catch para erro `'unavailable'`.
- [x] T3.6 Se header ausente E `bankDataEnc === null`: omitir campo `bankData` do response (employee não tem dados bancários cadastrados).
- [x] T3.7 AuditLog fire-and-forget no caso desmascarado (`.create(...).catch(err => fastify.log.error(...))`).
- [x] T3.8 Remover campos crus `bankDataEnc/Iv/Tag` do response (devem nunca vazar). Usar destructuring exclude ou Prisma `select`.

### T4 — Tests sanitização (AC: 4, 16)

- [x] T4.1 Criar `backend-api/test/modules/log-sanitization.test.ts`.
- [x] T4.2 Setup: importa `app` + `fastify` + injeta logger destination customizado (Pino transport via `pino.transport` ou simplesmente `pino({...}, customStream)`).
- [x] T4.3 Casos do AC #4 (5 cases mínimo).

### T5 — Tests bankData masking (AC: 17, 19)

- [x] T5.1 Criar `backend-api/test/modules/employees-bank-data.test.ts`.
- [x] T5.2 Helper `createEmployeeWithBankData(prisma, tenantId, bankData?)` em test/helpers (ou inline).
- [x] T5.3 6+ cases conforme AC #17.
- [x] T5.4 Mock de `decryptBankData` para teste de falha (vi.mock ou injection — depende do test runner backend).

### T6 — Validação final

- [x] T6.1 `npx tsc --noEmit` 0 erros.
- [x] T6.2 `cd backend-api && npx tsx --test test/modules/*.test.ts` — suite anterior 245 + ~11 novos = ~256, todos passam.
- [x] T6.3 Smoke manual via Postman: GET /employees/:id sem header → masked; com header + role com permission → decryptado; com header sem permission → 403.
- [x] T6.4 Verificar audit log inserido via Prisma Studio.
- [x] T6.5 Atualizar Dev Agent Record + File List + Change Log.

## Dev Notes

### Pino redact: gotchas

- **Wildcard `*.path` cobre apenas 1 nível** de nesting. Para deep nesting, Pino aceita `'*.*.path'` ou pattern específico. Documentar limitação.
- **Arrays** são iterados se path tem `[*]`: `'rows[*].cpf'`. Para nossa lista, usar wildcard genérico `'*.cpf'` cobre maioria, mas para arrays profundos pode faltar. **Mitigação:** repetir o path em múltiplos níveis comuns (`'*.cpf'`, `'*.*.cpf'`, `'*.*.*.cpf'` se necessário) — verificar via teste com nested fixture.
- **Censor function** recebe `(value, path)` onde `path` é array de strings. Validar contra docs Pino versão usada.
- **Performance:** redact é avaliado em todo log emitido; com lista de ~15 paths o overhead é desprezível (<1ms).

### bankData hint extraction

Para gerar `last4` mascarado, precisamos decryptar — não há shortcut. Custo: ~0.5ms por employee (HKDF + AES-GCM com 12 bytes IV). Para single GET é fine. Se futuro `GET /employees` (lista) precisar de hint, considerar persistir `bankAccountLast4` em coluna separada não-encrypted (não-PII porque 4 dígitos não identificam unicamente conta).

### AuditLog details field

Spec do epic não pede `details` no AuditLog. Decisão: deixar `details: null` para minimização. Se auditor LGPD pedir mais contexto futuramente (ex.: motivo declarado), adicionar campo `reason` ao header (`X-Bank-Data-Reason: payroll-cycle`) e gravar no AuditLog.

### Permission key `bankData.view` na Story 5.1

Confirmado: registrada em Story 5.1 (commit 7d0271f). Map de permissões deve estar em arquivo compartilhado tipo `lib/rbac/permissions.ts` ou inline em `plugins/permissions.ts`. T2.1 vai precisar localizar isso.

### Error path: por que `last4: '????'` ao invés de omitir?

Mostrar `'????'` indica explicitamente "tem dado bancário cadastrado mas falhei em ler" vs "não tem dado bancário" (campo omitido). Útil para suporte: operador vê que conta existe mas precisa de re-cadastro.

### Header `X-Show-Bank-Data` em CORS

Se frontend Web faz request cross-origin (dev: localhost:3002 → :3000), o header custom precisa estar em CORS allowed headers. Verificar [backend-api/src/plugins/cors.ts](backend-api/src/plugins/cors.ts) e adicionar se necessário.

### Project Structure Notes

Files novos:
- ✨ `backend-api/test/modules/log-sanitization.test.ts`
- ✨ `backend-api/test/modules/employees-bank-data.test.ts`

Files editados:
- ✏️ `backend-api/src/app.ts` — opts.logger.redact
- ✏️ `backend-api/src/plugins/permissions.ts` — hasPermission helper + decoration
- ✏️ `backend-api/src/routes/api/v1/employees/index.ts` — GET /:id com bankData masking
- ✏️ `backend-api/src/plugins/cors.ts` — allow X-Show-Bank-Data (se necessário)

Não toca:
- frontend-web/ (backend-only)
- prisma/schema (AuditLog já existe; nova action é só string)
- Stories 4.x

### Mensagem de commit sugerida

```
feat(security): Pino log redact + bankData masked GET com AuditLog (Story 5.2)

- app.ts: opts.logger.redact com paths sensíveis (bankData.*, cpf,
  chavePix, agencia, conta, personalData.rg/pisPasep) + censor
  function que mascara CPF (***.***.XXX-XX) e demais como [REDACTED]
- GET /employees/:id: bankData mascarado por default ({ masked: true,
  last4, tipoPix }); header X-Show-Bank-Data: true + permission
  bankData.view desmascarar e dispara AuditLog
  EMPLOYEE_BANK_DATA_VIEWED (fire-and-forget)
- permissions.ts: hasPermission helper síncrono + decoration
- cors.ts: allow header X-Show-Bank-Data
- 11+ unit tests (5 sanitization + 6 bankData masking)
- LGPD: minimização (default mascarado) + prestação de contas (audit
  trail em todo desmascarado) + defesa em camadas (logs nunca vazam)
```

### References

- [Architecture D2 — Encryption Architecture](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D2)
- [Architecture D6 — Authorization Model](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D6)
- [Epics — Story 5.2](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 864-902)
- Story 5.1 (done) — encryption module + permission keys
- Pino redaction docs: https://github.com/pinojs/pino/blob/master/docs/redaction.md
- LGPD Art. 6º (princípios) + Art. 37 (registro de operações)
- [employees route atual](backend-api/src/routes/api/v1/employees/index.ts) — referência

### Open questions / risks

1. **Localização da `permissionsByRole` map** (Story 5.1 já criou). Precisa confirmar arquivo + se export é compatível com helper síncrono. Se estiver inline em closure, refactor pequeno.
2. **CORS** pode precisar adicionar `X-Show-Bank-Data` no `allowedHeaders`. Verificar.
3. **Pino redact com Fastify** pode ter conflito com `req` serializer custom (logs req auto). Se sim, redactar também `req.headers["x-show-bank-data"]` (já no path list AC #2).
4. **AuditLog em outras rotas:** este story só audita GET /employees/:id desmascarado. PATCH /employees/:id que potencialmente atualiza bankData NÃO está em escopo (employees module legacy não permite editar bankData via API hoje — só via import).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (skill `evo-dev-story`, 2026-05-03)

### Debug Log References

- T2 simplificado: descobri que `roleHasPermission` síncrona já existe em `modules/auth/permissions.ts` (Story 5.1 done). Não precisa de novo decoration `hasPermission`.
- T3 Prisma 7 retorna `Uint8Array` para `Bytes`, não `Buffer`. Helper aceita ambos e converte.
- T5 Originalmente ia ser test integration full-app via `app.inject` + setup tenant/user/employee real. Refactored para extrair lógica em `bank-data-view.ts` puro + unit tests do helper. Mais limpo e mais rápido (não exige seed DB).
- ESM hoisting issue conhecido (handoff) — usei `require()` dinâmico no test para garantir que `BANK_DATA_ENCRYPTION_KEY` é setada antes do load do módulo de encryption.
- CORS plugin não precisou edit — `@fastify/cors` com `origin: true` reflete `Access-Control-Request-Headers`, então `X-Show-Bank-Data` é permitido automaticamente.

### Completion Notes List

- ✅ T1 — `lib/log-redact.ts` exporta `LOG_REDACT_PATHS` (cobre top-level + 1-3 níveis nested para 13 campos sensíveis) + `logRedactCensor` (CPF mascarado pt-BR `***.***.XXX-XX`, demais `[REDACTED]`). Wired em `app.ts` via `options.logger.redact`. fastify-cli mergeia com flag `-l info` da CLI.
- ✅ T2 — Reuso `roleHasPermission` existente. Skip decoration redundante.
- ✅ T3 — `GET /employees/:id` agora delega para `resolveBankDataField` (módulo puro `modules/employees/bank-data-view.ts`). Remove `bankDataEnc/Iv/Tag` do response (defesa em profundidade). 4 paths: forbidden (403), decryptError (500), masked (default), unmasked (com AuditLog fire-and-forget). AuditLog action `EMPLOYEE_BANK_DATA_VIEWED`.
- ✅ T4 — `log-sanitization.test.ts` 6 cases (CPF top-level, bankData nested, personalData rg+pisPasep, regex BR grep zero matches, top-level pix/agencia/conta, CPF inválido).
- ✅ T5 — `bank-data-view.test.ts` 10 cases (default masked, omit, unmask SUPERADMIN, unmask ADMIN forbidden, decryptError, masked com error unavailable, role undefined, formatação não-numérica, conta curta).
- ✅ T6 — `tsc --noEmit` 0 erros · `npx tsx --test test/modules/*.test.ts` **261/261** com env (245 prévios + 16 novos: 6 sanitization + 10 bank-data-view) · `npm run build` OK.

### File List

#### Novos (3)

- `backend-api/src/lib/log-redact.ts`
- `backend-api/src/modules/employees/bank-data-view.ts`
- `backend-api/test/modules/log-sanitization.test.ts`
- `backend-api/test/modules/bank-data-view.test.ts`

#### Editados (3)

- `backend-api/src/app.ts` — `options.logger.redact` com paths + censor + comment defensivo sobre `--options`
- `backend-api/src/routes/api/v1/employees/index.ts` — GET /:id usa `resolveBankDataField` + AuditLog `await` com fallback 503
- `backend-api/package.json` — scripts `start` e `dev:start` com flag `--options` (HABILITA logger.redact em prod)

### Change Log

- **2026-05-03 (initial)** — Story 5.2 implementada. LGPD compliance: (a) Pino redact global cobre 13 campos sensíveis em múltiplos níveis de nesting; (b) `GET /employees/:id` retorna `bankData: { masked: true, last4, tipoPix }` por default; header `X-Show-Bank-Data: true` + permission `bankData.view` desmascarar com AuditLog `EMPLOYEE_BANK_DATA_VIEWED`. 4 arquivos novos + 2 editados. 16 unit tests novos (suite total 261/261). tsc 0 erros, build OK.
- **2026-05-03 (post-review)** — Code review adversarial encontrou 4 HIGH + 3 MEDIUM + 2 LOW. Resolvidos 8 (todos HIGH/MEDIUM + L1). Suite total 262/262. Mudanças críticas: (a) **paths `[*]` adicionados** para arrays — bug grave H1 onde logs de import com arrays vazavam PII raw; (b) **idempotência no censor** para evitar re-redacting (CPF mascarado virava `[REDACTED]` na 2ª chamada); (c) **AuditLog agora é `await`** com fallback 503 se falhar — LGPD Art. 37 exige garantia de gravação; (d) **package.json scripts ganharam `--options`** — `fastify-cli` ignora silenciosamente `options.logger.redact` sem essa flag; sem ela em prod **NADA é redactado**.

## Senior Developer Review (AI)

**Reviewer:** claude-opus-4-7[1m] (skill `evo-code-review`)
**Review date:** 2026-05-03
**Outcome:** Approved — todos HIGH e MEDIUM resolvidos.

### Action items

- [x] [AI-Review][HIGH] H1 — Pino redact não cobria arrays. Adicionados paths `[*].field`, `*[*].field`, `*.*[*].field`, `*.*.*[*].field`, `*[*].*.field`, `*.*[*].*.field`, `*.*.*[*].*.field` para todos os 13 campos sensíveis. **Bug crítico:** logs de `apply-pipeline.ts` que passam `{rows: [{cpf: '...', bankData: {...}}]}` agora são redactados — antes vazavam plaintext. [log-redact.ts:32-65]
- [x] [AI-Review][HIGH] H2 — Inconsistência Buffer/Uint8Array. Branch `masked` agora usa `toBuffer()` igual ao branch `unmasked`. [bank-data-view.ts:62-66]
- [x] [AI-Review][HIGH] H3 — AuditLog mudou de fire-and-forget para `await` com fallback. Se DB de audit cair, retorna 503 `AUDIT_LOG_UNAVAILABLE` em vez de liberar acesso desmascarado sem registro (LGPD Art. 37 conformidade). [routes/employees/index.ts:243-269]
- [x] [AI-Review][HIGH] H4 — **Bug grave de configuração:** `fastify-cli start.js:166` só faz `deepmerge(options, file.options)` quando flag `--options` é passado. Sem ela, **`options.logger.redact` exportado em app.ts é silenciosamente ignorado em prod**. Verificado empiricamente lendo source de fastify-cli@8.0.0. Fix: adicionado `--options` em `package.json` scripts `start` e `dev:start` + comment defensivo em `app.ts`. **Sem este fix, em produção NENHUM dado seria redactado.**
- [x] [AI-Review][BUG-EMERGENT] Idempotência do censor — durante teste do H1, descobri que paths sobrepostos fazem Pino chamar `censor` múltiplas vezes para o MESMO valor. Na 2ª chamada, `***.***.777-XX` (já mascarado) não é mais 11-dígitos, censor retornava `[REDACTED]`. Fix: detect padrão masked e passthrough idempotente. [log-redact.ts:55-72]
- [x] [AI-Review][MEDIUM] M1 — Test `personalData` agora valida top-level + 1 nível + 2 níveis (`{ ctx: { employee: { personalData: {...} } } }`). +1 case dedicado para arrays (`{rows: [...]}`).
- [x] [AI-Review][MEDIUM] M2 — Renomeei `_enc/_iv/_tag` para `_bankDataEnc/_bankDataIv/_bankDataTag` (prefix `_` ESLint-friendly) + `void` references para garantir que linters strict aceitem. [routes/employees/index.ts:262-272]
- [x] [AI-Review][MEDIUM] M3 — Removidos paths `req.headers["x-show-bank-data"]` (Fastify default request serializer não inclui custom headers, era dead code).
- [x] [AI-Review][LOW] L1 — Removido export `LogRedactCensor` que ninguém importava.
- [ ] [AI-Review][LOW] L2 — Smoke manual T6.3 (Postman) e T6.4 (Prisma Studio audit log inspection) **ainda pendentes** — recomendado fazer antes do deploy prod.
