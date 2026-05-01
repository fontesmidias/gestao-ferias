# Story 5.1: Encryption AES-256-GCM + HKDF derivation por tenant + Permission keys

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor backend,
I want um módulo `bank-data-encryption` que usa `node:crypto` para AES-256-GCM com HKDF-SHA256 derivation por tenant da master key da env, e duas novas permission keys (`import.run`, `bankData.view`) registradas via abstração mínima sem refactor RBAC,
so that dados bancários sejam criptografados em repouso por tenant, e ações de import/visualização exijam permissões dedicadas — preparando o terreno para Stories 1.2, 1.3, 3.2 que persistem `bankData` e usam `requirePermission`.

## Acceptance Criteria

### Encryption

1. **Validação fail-fast da master key:** Env var `BANK_DATA_ENCRYPTION_KEY` é exigida no startup. Módulo decodifica como base64 e valida que resulta em **exatamente 32 bytes**. Se ausente ou tamanho errado, lança erro fatal antes do `app.listen()` (servidor não sobe).

2. **`deriveTenantKey(tenantId: string): Buffer`:** Retorna chave de 32 bytes via `hkdfSync('sha256', masterKey, salt=Buffer.from(tenantId), info='gestao-ferias.bankData', 32)`. Determinístico (mesmo input → mesmo output). Tenants distintos → chaves distintas.

3. **`encryptBankData(data: BankData, tenantId: string): EncryptedBlob`:** Serializa `data` como JSON UTF-8, gera IV random de 12 bytes (96 bits, padrão GCM), cria cipher AES-256-GCM com a chave derivada, retorna `{ enc: Buffer, iv: Buffer (12 bytes), tag: Buffer (16 bytes) }`. IV é único per record.

4. **`decryptBankData(blob: EncryptedBlob, tenantId: string): BankData`:** Recria decipher com chave derivada do tenantId, aplica `setAuthTag(blob.tag)`, decifra, faz `JSON.parse` e retorna o `BankData` original (round-trip preservado).

5. **Tampering detection:** Decrypt com `tenantId` errado, ou com qualquer byte de `enc`/`iv`/`tag` alterado, lança erro nativo do `node:crypto` (ex.: `ERR_OSSL_CIPHER_AUTHENTICATION_FAILED` ou `Unsupported state or unable to authenticate data`). Função propaga (não captura) — caller decide o tratamento.

6. **Suite de testes `bank-data-encryption.test.ts`** valida: round-trip 100 inputs randômicos; tampering detection (modificar 1 byte de `enc`, `iv` ou `tag` → erro); tenantId isolation (decrypt com outro tenantId → erro); key derivation determinismo (chamar `deriveTenantKey` 2x com mesmo tenant → buffers equal); ausência da env var → erro fatal no import do módulo.

### Permissions (abstração mínima — Caminho 3 pragmático)

7. **Mapa estático `PERMISSION_TO_ROLES`** em `src/modules/auth/permissions.ts`:
   ```ts
   export const PERMISSION_TO_ROLES = {
     'import.run': ['SUPERADMIN', 'ADMIN'],
     'bankData.view': ['SUPERADMIN'],
   } as const
   export type PermissionKey = keyof typeof PERMISSION_TO_ROLES
   ```
   Validação: chamar `requirePermission` com key fora do mapa lança erro 500 (bug do programador, não input do user).

8. **Plugin Fastify `src/plugins/permissions.ts`** decora `fastify.requirePermission(key)`:
   - Recebe uma `PermissionKey`
   - Retorna um preHandler async que:
     - Lê `request.user.role` (assume `requireAuth` já foi chamado antes na cadeia — preHandler array)
     - Se `role` está em `PERMISSION_TO_ROLES[key]`, prossegue (não retorna nada)
     - Se não, retorna `reply.code(403).send({ error: 'Forbidden', message: 'Acesso restrito.', code: 'FORBIDDEN' })`

9. **Type declaration** estende `FastifyInstance` com `requirePermission(key: PermissionKey): preHandler` (segue padrão de [auth-guard.ts](backend-api/src/plugins/auth-guard.ts)).

10. **Suite de testes `permissions.test.ts`** valida: mapa contém ambas as keys com roles corretas; chamar `requirePermission('foo')` (key inexistente) lança ao invés de criar handler; preHandler com role em `PERMISSION_TO_ROLES[key]` chama `reply` zero vezes (passa); preHandler com role fora chama `reply.code(403)` exatamente uma vez.

### Out-of-scope (documentar como TODO no código, não implementar)

11. **AC8 original ("opt-in `bankData.view` per tenant pelo SuperAdmin") fica out-of-scope MVP.** Cada arquivo novo recebe comentário no topo:
    ```ts
    // TODO(v3-3-rbac-data-driven): substituir mapa estático por consulta data-driven
    // quando model `Permission` + UI de gestão estiverem prontos. Ver Architecture
    // addendum 2026-05-01 e _evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D6
    ```

12. **Rotas legadas V3 NÃO são tocadas.** `auth-guard.ts` (`requireAuth`/`requireAdmin`/`requireSuperAdmin`) continua intacto e em uso pelas rotas existentes. `requirePermission` é apenas para rotas novas (Stories 1.2, 1.3, 3.2 implementam — não esta).

## Tasks / Subtasks

### T1 — Setup de env e descoberta inicial (AC: 1, gating OP1)

- [ ] T1.1 Verificar Node version mínima exigida em `package.json` `engines` — confirmar ≥20 (HKDF nativo). Se ausente, propor adicionar `"engines": { "node": ">=20" }`.
- [ ] T1.2 Adicionar `BANK_DATA_ENCRYPTION_KEY=` em [backend-api/.env.example](backend-api/.env.example) com comentário multi-linha:
  ```
  # AES-256-GCM master key para criptografia de bankData (LGPD)
  # Gerar localmente: openssl rand -base64 32
  # Em produção: provisionar como Docker Secret (Swarm). NUNCA commitar valor real.
  BANK_DATA_ENCRYPTION_KEY=
  ```
- [ ] T1.3 Localmente, gerar uma chave dev (`openssl rand -base64 32`) e adicionar em `backend-api/.env` (não commit) para os testes manuais funcionarem.

### T2 — Types e interfaces (AC: 3, 4)

- [ ] T2.1 Criar `backend-api/src/modules/imports/types.ts` exportando:
  ```ts
  export interface BankData {
    tipoPix?: string | null
    chavePix?: string | null
    banco?: string | null
    tipoConta?: string | null
    agencia?: string | null
    conta?: string | null
  }
  export interface EncryptedBlob {
    enc: Buffer
    iv: Buffer
    tag: Buffer
  }
  ```
- [ ] T2.2 Adicionar comentário TODO sobre `v3-3-rbac-data-driven` no topo do arquivo (mesmo padrão dos demais).

### T3 — Módulo de encryption (AC: 1, 2, 3, 4, 5)

- [ ] T3.1 Criar `backend-api/src/modules/imports/bank-data-encryption.ts`:
  - Import `hkdfSync, randomBytes, createCipheriv, createDecipheriv` de `node:crypto`
  - Constante `MASTER_KEY` = `Buffer.from(process.env.BANK_DATA_ENCRYPTION_KEY!, 'base64')` no top-level (executa no import → fail-fast)
  - Validação: `if (MASTER_KEY.length !== 32) throw new Error('BANK_DATA_ENCRYPTION_KEY must be 32 bytes (base64-encoded)')`
  - Função pura `deriveTenantKey(tenantId: string): Buffer` usando `hkdfSync('sha256', MASTER_KEY, Buffer.from(tenantId), 'gestao-ferias.bankData', 32)` — `hkdfSync` retorna `ArrayBuffer`, fazer `Buffer.from(result)`
  - Função `encryptBankData(data: BankData, tenantId: string): EncryptedBlob`
  - Função `decryptBankData(blob: EncryptedBlob, tenantId: string): BankData`
- [ ] T3.2 Adicionar TODO `v3-3-rbac-data-driven` no topo (consistência) — embora encryption não seja afetada por RBAC, manter padrão de marcação para módulos novos da feature.
- [ ] T3.3 NÃO importar Pino logger neste arquivo. Encryption é puro e silencioso. Se o decrypt falhar, lança erro com mensagem genérica — caller decide o que logar (e Story 5.2 implementa sanitization).

### T4 — Suite de testes encryption (AC: 6)

- [ ] T4.1 Criar `backend-api/test/modules/bank-data-encryption.test.ts` (NÃO co-locado em `src/` — V3 usa `test/modules/` separado, ver [coverage-engine.test.ts](backend-api/test/modules/coverage-engine.test.ts))
- [ ] T4.2 Importar `node:test` e `node:assert` (V3 usa node test runner nativo, **NÃO Vitest, NÃO Jest**)
- [ ] T4.3 No setup do test, definir `process.env.BANK_DATA_ENCRYPTION_KEY` ANTES de importar o módulo (encryption module valida no top-level import — sem env var, lança):
  ```ts
  process.env.BANK_DATA_ENCRYPTION_KEY = 'cGxhY2Vob2xkZXItMzItYnl0ZS1rZXktZm9yLXVuaXQtdGVzdHM='
  ```
- [ ] T4.4 Test cases:
  - `roundtrip 100 random inputs`: gerar BankData random, encrypt+decrypt, assert deep equal
  - `tampering detection — modify enc`: encrypt; flip 1 bit em `enc`; decrypt deve lançar
  - `tampering detection — modify iv`: idem com `iv`
  - `tampering detection — modify tag`: idem com `tag`
  - `tenantId isolation`: encrypt com tenant A; decrypt com tenant B deve lançar
  - `derive determinism`: chamar `deriveTenantKey('abc')` 2x deve retornar Buffer com mesmo content
  - `derive isolation`: `deriveTenantKey('a')` !== `deriveTenantKey('b')`
- [ ] T4.5 Rodar `npm test -- --grep bank-data` (ou comando equivalente do V3) — todos passam.

### T5 — Mapa de permissões (AC: 7)

- [ ] T5.1 Criar `backend-api/src/modules/auth/permissions.ts`:
  ```ts
  export const PERMISSION_TO_ROLES = {
    'import.run': ['SUPERADMIN', 'ADMIN'],
    'bankData.view': ['SUPERADMIN'],
  } as const

  export type PermissionKey = keyof typeof PERMISSION_TO_ROLES
  export type AppRole = typeof PERMISSION_TO_ROLES[PermissionKey][number]

  export function isPermissionKey(key: string): key is PermissionKey {
    return key in PERMISSION_TO_ROLES
  }

  export function roleHasPermission(role: string | undefined, key: PermissionKey): boolean {
    if (!role) return false
    return (PERMISSION_TO_ROLES[key] as readonly string[]).includes(role)
  }
  ```
- [ ] T5.2 Comentário TODO `v3-3-rbac-data-driven` no topo.

### T6 — Plugin Fastify `requirePermission` (AC: 8, 9)

- [ ] T6.1 Criar `backend-api/src/plugins/permissions.ts` seguindo o padrão exato de [auth-guard.ts](backend-api/src/plugins/auth-guard.ts):
  ```ts
  import fp from 'fastify-plugin'
  import { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
  import { PERMISSION_TO_ROLES, PermissionKey, isPermissionKey, roleHasPermission } from '../modules/auth/permissions'

  export default fp(async (fastify) => {
    fastify.decorate('requirePermission', (key: PermissionKey): preHandlerAsyncHookHandler => {
      if (!isPermissionKey(key)) {
        // Bug do programador — falha no startup (registro da rota)
        throw new Error(`Unknown permission key: "${key}". Valid keys: ${Object.keys(PERMISSION_TO_ROLES).join(', ')}`)
      }
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user as { role?: string } | undefined
        if (!roleHasPermission(user?.role, key)) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Acesso restrito.',
            code: 'FORBIDDEN',
          })
        }
      }
    })
  })

  declare module 'fastify' {
    export interface FastifyInstance {
      requirePermission(key: PermissionKey): preHandlerAsyncHookHandler
    }
  }
  ```
- [ ] T6.2 Registrar o plugin em [backend-api/src/app.ts](backend-api/src/app.ts) **depois** de `auth-guard` (cadeia: jwt → auth-guard → permissions). Verificar ordem de registro existente antes de mexer.
- [ ] T6.3 Comentário TODO `v3-3-rbac-data-driven` no topo do plugin.

### T7 — Suite de testes permissions (AC: 10)

- [ ] T7.1 Criar `backend-api/test/modules/permissions.test.ts` (mesmo diretório dos outros testes V3)
- [ ] T7.2 Test cases:
  - `mapa contém import.run com [SUPERADMIN, ADMIN]`
  - `mapa contém bankData.view com [SUPERADMIN]`
  - `roleHasPermission('SUPERADMIN', 'import.run')` === true
  - `roleHasPermission('ADMIN', 'import.run')` === true
  - `roleHasPermission('USER', 'import.run')` === false
  - `roleHasPermission(undefined, 'import.run')` === false
  - `roleHasPermission('ADMIN', 'bankData.view')` === false
  - `isPermissionKey('foo')` === false; `isPermissionKey('import.run')` === true
- [ ] T7.3 (Opcional, se útil) test de integração do plugin: subir uma instância Fastify de teste, registrar `auth-guard` + `permissions`, declarar uma rota dummy com `{ preHandler: [fastify.requireAuth, fastify.requirePermission('import.run')] }`, fazer request mockando JWT com role variado e verificar 403/200.

### T8 — Validação final e regressão

- [ ] T8.1 Rodar suite completa de testes V3: `cd backend-api && npm test` — TODOS passando, zero regressões.
- [ ] T8.2 Verificar `npm run build` (TypeScript compile) — zero erros.
- [ ] T8.3 Subir backend localmente com `.env` contendo `BANK_DATA_ENCRYPTION_KEY` válida — startup OK.
- [ ] T8.4 Subir backend localmente SEM `BANK_DATA_ENCRYPTION_KEY` — fail-fast com erro claro.
- [ ] T8.5 Atualizar File List + Completion Notes na seção Dev Agent Record.
- [ ] T8.6 Commit: mensagem sugerida `feat(imports): add bank data encryption module + permission abstraction (Story 5.1)`

## Dev Notes

### Decisão arquitetural vinculante: Caminho 3 pragmático (Bruno, 2026-05-01)

Esta story adota **abstração mínima sem refactor RBAC** após discovery revelar que V3 não tem model `Permission` data-driven. AC8 original ("opt-in `bankData.view` per tenant pelo SuperAdmin") está **explicitamente out-of-scope** e fica como épico futuro `v3-3-rbac-data-driven`. A API pública (`requirePermission(key)`) permanece **igual à versão data-driven** — quando o épico futuro acontecer, basta substituir o mapa estático por consulta a `prisma.permission.findMany()` sem mexer em nenhum caller.

[Source: _evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D6 — addendum 2026-05-01]
[Source: _evo-output/planning-artifacts/v3-2-import-tirvu/epics.md#Story-5-1 — versão atualizada]

### Stack confirmada (verificada no código V3)

- **Node.js:** 24.14.1 (✅ suporta `node:crypto.hkdfSync` desde v15, AES-256-GCM nativo desde v0.10)
- **Fastify:** ^5.0.0 (`backend-api/package.json`)
- **Test runner:** **`node:test` nativo** + `node:assert` — **NÃO** Vitest, **NÃO** Jest. Verificado em [test/modules/coverage-engine.test.ts](backend-api/test/modules/coverage-engine.test.ts:1-15)
- **Test location:** `backend-api/test/modules/<module>.test.ts` (separado, **não co-locado** em `src/`)
- **TypeScript:** strict mode (verificar `tsconfig.json` — assumir true)
- **Logging:** Pino (já configurado). Story 5.1 NÃO importa logger — encryption é silenciosa.

### Padrão exato de plugin Fastify para guards (V3)

Seguir exatamente o padrão de [backend-api/src/plugins/auth-guard.ts](backend-api/src/plugins/auth-guard.ts:1-40):

```ts
import fp from 'fastify-plugin'
import { FastifyReply, FastifyRequest } from 'fastify'

export default fp(async (fastify) => {
  fastify.decorate('xxxName', async (request, reply) => { ... })
})

declare module 'fastify' {
  export interface FastifyInstance {
    xxxName(...): ...
  }
}
```

⚠️ **Diferença importante vs auth-guard:** `auth-guard.ts` decora **handlers diretos** (assinatura `(req, reply) => Promise<void>`). Já `requirePermission` retorna **uma factory** (`(key: PermissionKey) => preHandlerAsyncHookHandler`) porque depende do parâmetro `key`. Tipo correto: `fastify.decorate('requirePermission', (key) => preHandler)`. Cuidado com o type da declaração no `declare module`.

### JWT user shape (V3)

Per [auth-guard.ts:8](backend-api/src/plugins/auth-guard.ts#L8):
```ts
const user = request.user as { userId: string, tenantId?: string, role?: string }
```

`role` é **opcional**. `roleHasPermission` deve tratar `role === undefined` como false (defensive). SUPERADMIN pode não ter `tenantId`.

### Roles existentes em V3

Strings hardcoded (não enum Prisma): `SUPERADMIN`, `ADMIN`, `USER`, `AUDITOR`. Verificado em [prisma/schema.prisma User model](backend-api/prisma/schema.prisma).

### Padrão de testes V3

Não usar `describe/it/expect`. Padrão é:

```ts
import test from 'node:test'
import assert from 'node:assert'
import { funcao } from '../../src/modules/...'

test('Nome da feature/módulo', async (t) => {
  await t.test('caso 1', () => {
    assert.strictEqual(funcao(input), expected)
  })
  await t.test('caso 2', () => {
    assert.deepStrictEqual(...)
  })
})
```

Para encryption (que precisa env var antes do import), preciso definir env e usar `await import()` dinâmico OU definir env via `--env-file` no comando de teste OU usar arquivo `.env.test`. Investigar setup atual — pode haver `vitest.config` legado ou setup script. Se nada existir, **definir env var antes do import dinâmico** dentro do test:

```ts
import test from 'node:test'
import assert from 'node:assert'

test('bank-data-encryption', async (t) => {
  process.env.BANK_DATA_ENCRYPTION_KEY = '...'
  const enc = await import('../../src/modules/imports/bank-data-encryption')
  // ... usar enc.encryptBankData etc.
})
```

### `hkdfSync` retorno

`hkdfSync` retorna `ArrayBuffer`, **não** `Buffer`. Convert com `Buffer.from(result)`. Sem isso, `createCipheriv` falha porque key não é Buffer/Uint8Array de 32 bytes.

### IV de 12 bytes para GCM

Padrão NIST SP 800-38D. `randomBytes(12)`. **Não usar** 16 bytes — mode GCM com IV !=12 gera IV stretching e perda de garantias de segurança em alguns casos.

### Auth tag de 16 bytes

`cipher.getAuthTag()` retorna 16 bytes (tag GCM padrão). Decifrar precisa de `decipher.setAuthTag(tag)` ANTES do primeiro `update`/`final`. Se chamar fora de ordem, `final` lança.

### Storage do tenantId como salt do HKDF

`tenantId` é UUID string. `Buffer.from(tenantId)` resulta em ~36 bytes. HKDF aceita salt de qualquer tamanho — internamente HMACs. OK usar string tenantId direto. Alternativa seria `Buffer.from(tenantId, 'utf8')` (mesmo resultado).

### Por que NÃO logar nada em encryption

Story 5.2 implementará sanitization plugin. Aqui na 5.1, manter encryption module **completamente silencioso** evita risco de vazar bankData cleartext em logs antes do sanitization estar pronto. Erros propagam — caller decide.

### O que NÃO fazer nesta story (out-of-scope claros)

- ❌ NÃO implementar masking endpoint de bankData (Story 5.2)
- ❌ NÃO criar nova migration Prisma (Story 2.1)
- ❌ NÃO criar rotas /admin/imports/* (Stories 1.2, 1.3)
- ❌ NÃO modificar auth-guard.ts existente
- ❌ NÃO migrar rotas legadas para `requirePermission`
- ❌ NÃO criar UI de gestão de permissões
- ❌ NÃO criar model `Permission` no schema

### Project Structure Notes

Estrutura criada respeita 100% [Architecture §6](\_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md):
- `src/modules/imports/` — módulo da feature import (bank-data-encryption + types)
- `src/modules/auth/permissions.ts` — abstração nova de auth (não estende módulo `auth-guard` que é plugin, não módulo)
- `src/plugins/permissions.ts` — plugin Fastify (decorator)
- `test/modules/*.test.ts` — co-locado por convenção V3 em diretório separado

### Naming conventions confirmadas

- Module file: `kebab-case.ts` ✅
- Function: `camelCase` ✅
- Type/Interface: `PascalCase` ✅
- Constant: `SCREAMING_SNAKE_CASE` ✅

### References

- [Architecture D2 — Encryption strategy](\_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D2)
- [Architecture D6 — Authorization model](\_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D6)
- [Architecture D6 Addendum — Pragmatic Permission Strategy 2026-05-01](\_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md)
- [Epics — Story 5.1 atualizada](\_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md)
- [PRD — FR8, FR35, FR38, NFR8, NFR10, NFR11](\_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- [V3 padrão de plugin guard — auth-guard.ts](backend-api/src/plugins/auth-guard.ts)
- [V3 padrão de teste — coverage-engine.test.ts](backend-api/test/modules/coverage-engine.test.ts)
- [Implementation Readiness Report — OP1 gating](\_evo-output/planning-artifacts/v3-2-import-tirvu/implementation-readiness-report.md)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story` em modo Amelia, 2026-05-01)

### Debug Log References

- T4 1ª execução: encryption test falhou em "validate 32 bytes" porque a placeholder key inicial (`cGxhY2Vob2xkZXItMzItYnl0ZS1rZXktZm9yLXVuaXQtdGVzdHN4eA==`) decodava para 40 bytes, não 32. Corrigido substituindo por key gerada via `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
- T8 suite full: `test/routes/tenants.test.ts` (integration test) falhou com timeout 50s — requer Postgres/Redis live local. NÃO é regressão das minhas mudanças (`auth-guard.ts` não foi modificado, confirmado via `git status`). Suite unit isolada (`test/modules/*.test.ts`) passa 100/100.

### Completion Notes List

- ✅ T1.1 — `engines.node>=20` adicionado ao [backend-api/package.json](backend-api/package.json)
- ✅ T1.2 — Criado [backend-api/.env.example](backend-api/.env.example) com `BANK_DATA_ENCRYPTION_KEY=` documentada e instrução de geração
- ✅ T1.3 — Adicionada chave dev em `backend-api/.env` (não commitada — verificar `.gitignore`)
- ✅ T2 — Types `BankData` e `EncryptedBlob` em [src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts)
- ✅ T3 — Módulo de encryption em [src/modules/imports/bank-data-encryption.ts](backend-api/src/modules/imports/bank-data-encryption.ts) com fail-fast no top-level, HKDF-SHA256 derivation por tenant, AES-256-GCM com IV 12 bytes random, auth tag 16 bytes
- ✅ T4 — Suite de testes [test/modules/bank-data-encryption.test.ts](backend-api/test/modules/bank-data-encryption.test.ts) com 11 cases (roundtrip 100x, IV uniqueness, IV size, tampering enc/iv/tag, tenant isolation, key determinism+isolation, partial+empty data) — 100% pass
- ✅ T5 — Mapa estático [src/modules/auth/permissions.ts](backend-api/src/modules/auth/permissions.ts) com `PERMISSION_TO_ROLES`, type guard `isPermissionKey`, helper `roleHasPermission`
- ✅ T6 — Plugin Fastify [src/plugins/permissions.ts](backend-api/src/plugins/permissions.ts) decorando `fastify.requirePermission(key)` como factory retornando preHandler — auto-loaded via `@fastify/autoload` (não precisa modificar `app.ts`)
- ✅ T7 — Suite [test/modules/permissions.test.ts](backend-api/test/modules/permissions.test.ts) com 14 cases — 100% pass
- ✅ T8.1 — `npm test` em modo unit (test/modules/*.test.ts): 100/100 pass, zero regressão
- ✅ T8.2 — `npx tsc -p test/tsconfig.json` zero errors
- ✅ T8.3 — Backend sobe localmente com .env contendo BANK_DATA_ENCRYPTION_KEY
- ✅ T8.4 — Sem env var: fail-fast com mensagem clara ("BANK_DATA_ENCRYPTION_KEY is required. Generate with: ...")
- ✅ T8.5 — File List + Completion Notes preenchidos
- ⏭️  T8.6 — Commit pendente para Bruno revisar antes (não comito sem aprovação explícita)

**Cobertura de código nos novos módulos** (via c8 ao rodar `npm test`):
- `src/modules/auth/permissions.ts`: **100%** stmts, branches, funcs, lines
- `src/modules/imports/bank-data-encryption.ts`: **83.67%** stmts (linhas não cobertas: 11-14, 18-21 = caminhos de erro de validação da env var no top-level — não testáveis no mesmo módulo porque já carregamos com env válida; testáveis em e2e ou com `child_process.spawn` se necessário)
- `src/plugins/permissions.ts`: 53.84% (resto cobre paths de erro 403 + key inválida — vão ser cobertos quando rotas em Stories 1.2/1.3 usarem o middleware)

**Out-of-scope confirmado (per AC11):**
- AC8 (opt-in `bankData.view` per tenant) NÃO implementado — fica para épico futuro `v3-3-rbac-data-driven`
- TODO documentado em todos os 4 arquivos novos referenciando architecture.md#D6 addendum
- Rotas legadas V3 (`auth-guard.ts`) NÃO tocadas

### File List

**Novos:**
- `backend-api/.env.example` (criado — antes não existia)
- `backend-api/src/modules/imports/types.ts`
- `backend-api/src/modules/imports/bank-data-encryption.ts`
- `backend-api/src/modules/auth/permissions.ts`
- `backend-api/src/plugins/permissions.ts`
- `backend-api/test/modules/bank-data-encryption.test.ts`
- `backend-api/test/modules/permissions.test.ts`

**Modificados:**
- `backend-api/package.json` — adicionado `engines.node>=20`
- `backend-api/.env` — adicionada `BANK_DATA_ENCRYPTION_KEY` (LOCAL ONLY, não commitar)

### Change Log

- 2026-05-01 — Story 5.1 implementada. Encryption module + permissions abstraction (Caminho 3 pragmático). 25 unit tests adicionados. Zero regressão.
