# Handoff — Continuidade em nova conversa

**Data:** 2026-05-01
**Feature ativa:** `v3-2-import-tirvu` (Importação em massa de colaboradores via planilha Tirvu)
**Status:** Story 5.1 implementada (Status: `review`), aguardando teste manual + decisão da próxima story.

---

## 📍 Onde paramos

### Pipeline BMAD percorrido (todos os artefatos prontos)

| Artefato | Arquivo | Status |
|---|---|---|
| 1. PRD | [_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md) | ✅ Completo (45 FRs + 36 NFRs) |
| 2. Implementation Readiness Report | [_evo-output/planning-artifacts/v3-2-import-tirvu/implementation-readiness-report.md](_evo-output/planning-artifacts/v3-2-import-tirvu/implementation-readiness-report.md) | ✅ Iter 2 completa, score 99.7%, GO |
| 3. Architecture | [_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) | ✅ Completo, 11 decisões D1-D11 + addendum 2026-05-01 |
| 4. UX Design | [_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md](_evo-output/planning-artifacts/v3-2-import-tirvu/ux-design-specification.md) | ✅ Completo, 4 estados wireframed |
| 5. Epics & Stories | [_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) | ✅ 5 epics, 13 stories, 89 ACs Given/When/Then |
| 6. Story 5.1 file | [_evo-output/implementation-artifacts/v3-2-import-tirvu/5-1-encryption-and-permissions.md](_evo-output/implementation-artifacts/v3-2-import-tirvu/5-1-encryption-and-permissions.md) | ✅ Implementada, status `review` |

### Decisão arquitetural crítica travada

**Caminho 3 pragmático sobre RBAC** (Bruno aprovou 2026-05-01):
- V3 atual tem RBAC role-based hardcoded (sem model `Permission` data-driven)
- Story 5.1 implementa **abstração mínima**: mapa estático `PERMISSION_TO_ROLES` em `src/modules/auth/permissions.ts` + middleware Fastify `requirePermission(key)`
- AC8 original ("opt-in `bankData.view` per tenant") **out-of-scope MVP** — fica para épico futuro `v3-3-rbac-data-driven`
- TODOs `v3-3-rbac-data-driven` documentados em todos os 4 arquivos novos
- Rotas legadas V3 (`auth-guard.ts`) **não foram tocadas**

---

## ✅ O que foi implementado na Story 5.1

**Arquivos novos (7):**
- `backend-api/.env.example` (criado — antes não existia)
- `backend-api/src/modules/imports/types.ts` (BankData, EncryptedBlob)
- `backend-api/src/modules/imports/bank-data-encryption.ts` (AES-256-GCM + HKDF + fail-fast)
- `backend-api/src/modules/auth/permissions.ts` (mapa estático + helpers)
- `backend-api/src/plugins/permissions.ts` (Fastify decorator `requirePermission`)
- `backend-api/test/modules/bank-data-encryption.test.ts` (11 cases)
- `backend-api/test/modules/permissions.test.ts` (14 cases)

**Arquivos modificados (4):**
- `backend-api/package.json` — `engines.node>=20`
- `backend-api/.env` — `BANK_DATA_ENCRYPTION_KEY` (LOCAL, não commit)
- `.env` (raiz) — `BANK_DATA_ENCRYPTION_KEY` para Docker Compose
- `docker-compose.override.yml` (criado para resolver conflito de porta 5432)

**Validações:**
- 25 unit tests novos passando + 75 V3 = **100/100**
- TypeScript compile zero erros
- Fail-fast funciona (sem env: erro com instrução; tamanho errado: erro detalhado)
- Cobertura: `permissions.ts` 100%, `bank-data-encryption.ts` 83.67%, `plugin/permissions.ts` 53.84%

---

## 🐳 Como rodar localmente (Docker Compose)

### Reuso de containers existentes (decisão Bruno 2026-05-01)

Containers `gv-postgres` (host:5433) e `gv-redis` (host:6379) do projeto **gestao-vagas** estão rodando e são reusados. **Não sobe novos** containers de DB/Redis para gestao-ferias. Banco `gestaoferias` foi criado dentro do `gv-postgres` (creds `admin/adminpassword`).

`docker-compose.override.yml` desabilita os serviços `postgres` e `redis` (profiles `never`) e aponta o backend para `host.docker.internal:5433` (Postgres) e `:6379` (Redis).

| Serviço | Onde | Acessar do PC |
|---|---|---|
| Postgres `gestaoferias` DB | container `gv-postgres` | **localhost:5433** (creds: admin/adminpassword) |
| Redis | container `gv-redis` | localhost:6379 |
| Backend gestao-ferias | container novo | http://localhost:3000 |
| Frontend gestao-ferias | container novo | http://localhost:3002 |

### Comandos para subir (passo a passo)

**1. Confirmar Docker Desktop rodando + containers gv-* up**
```bash
docker ps --format "{{.Names}}"
# Deve listar gv-postgres e gv-redis. Se não, subir o compose do gestao-vagas primeiro.
```

**2. Da raiz do gestao-ferias, subir só backend + frontend:**
```bash
cd c:/Users/cery0/projetos/gestao-ferias
docker-compose up --build
```

Isso vai (apenas):
- Build + subir Backend gestao-ferias em `localhost:3000` (conecta em gv-postgres:5433 e gv-redis:6379 via host.docker.internal)
- Build + subir Frontend em `localhost:3002`
- **Não sobe Postgres nem Redis** (reusa os existentes do gv-*)

**3. Aguardar logs estabilizarem** (procure por):
- `gestaoferias_db_local | database system is ready to accept connections`
- `gestaoferias_redis_local | Ready to accept connections`
- `gestaoferias_backend_local | Server listening at http://0.0.0.0:3000`
- `gestaoferias_frontend_local | ✓ Ready in ...`

**4. Aplicar migrations Prisma (1ª vez ou após mudanças):**

Em **outro terminal**:
```bash
cd c:/Users/cery0/projetos/gestao-ferias/backend-api
npx prisma migrate deploy
npx prisma db seed
```

**5. Acessar:**
- Frontend: http://localhost:3002
- Backend API: http://localhost:3000
- Prisma Studio (para inspecionar banco): `cd backend-api && npx prisma studio` → abre http://localhost:5555 (a porta varia)

### Como parar
```bash
docker-compose down
# Ou para apagar volumes (banco zerado):
docker-compose down -v
```

---

## 🧪 Como testar a Story 5.1 manualmente

### Teste 1 — Backend sobe sem erro
```bash
docker-compose logs backend
# Procure por "Server listening" e ausência de "BANK_DATA_ENCRYPTION_KEY is required"
```

### Teste 2 — Fail-fast (chave ausente)
1. Edite `.env` raiz e comente `BANK_DATA_ENCRYPTION_KEY`
2. `docker-compose up backend`
3. Deve falhar no startup com:
   ```
   Error: BANK_DATA_ENCRYPTION_KEY is required. Generate with: ...
   ```
4. Restaurar `.env` depois.

### Teste 3 — Suite de testes unit
```bash
cd backend-api
npm test
```
Deve mostrar `100/100 pass` (ou similar) — exclui o `tenants.test.ts` integration que precisa de banco live.

Se quiser rodar **apenas os testes da Story 5.1**:
```bash
cd backend-api
node --test -r ts-node/register "test/modules/bank-data-encryption.test.ts" "test/modules/permissions.test.ts"
```

### Teste 4 — Type check
```bash
cd backend-api
npx tsc --noEmit
# Sem output = OK
```

### Teste 5 — REPL manual de encryption (opcional)
```bash
cd backend-api
node -e "
process.env.BANK_DATA_ENCRYPTION_KEY = '5JtP44Gz4XwhPUi0NCxOOeqgdZtZ18FrQsXkuiXYvwg=';
const enc = require('./dist/modules/imports/bank-data-encryption');
const data = { tipoPix: 'CPF', chavePix: '036.707.881-31', banco: '001' };
const blob = enc.encryptBankData(data, 'tenant-uuid-123');
console.log('Encrypted (não legível):', blob);
console.log('Decrypted:', enc.decryptBankData(blob, 'tenant-uuid-123'));
"
```
**Pré-req:** ter rodado `npm run build` antes (compila TS para `dist/`).

---

## ⚠️ Action Items operacionais pendentes (do IR Report)

Antes de outras stories irem para produção, você precisa:

| OP | Descrição | Quando |
|---|---|---|
| **OP1** | Gerar key prod com `openssl rand -base64 32` e adicionar como Docker Secret no Swarm | Antes deploy prod |
| **OP2** | Adicionar volume `imports-data:/var/imports` em `docker-compose.yml` + Swarm | Antes Story 1.1 |
| **OP3** | Medir LCP atual de `/admin/tenants` (Chrome DevTools) | Antes Story 4.1 |
| **OP4** | Decidir feature flag `imports.enabled=true|false` para Green House | Antes deploy |

**Para dev local agora, OP1-OP4 podem esperar** — basta o `.env` que está pronto.

---

## 🚦 Próximos passos sugeridos para a próxima conversa

### Caminho A — Code review independente (recomendado pelo BMAD)
Rodar `/code-review` com **modelo diferente** (ex.: Sonnet 4.6 em vez do Opus 4.7 que implementou) para peer review do código de Story 5.1 antes de marcar `done` e committar.

### Caminho B — Avançar para próxima story
A sequência crítica do `epics.md` recomenda:
1. ~~Story 5.1~~ ✅ feita
2. **Story 1.1** (file storage handler + cron retenção) — paralelizável
3. **Story 2.1** (Prisma migration — Employee + ImportJob model)
4. **Story 2.2** (parser tirvu-v1 + validator)

Disparar `evo-create-story` para Story 1.1 ou 2.1 (a próxima a ter file standalone gerado), depois `evo-dev-story`.

### Caminho C — Apenas committar Story 5.1
Mensagem sugerida:
```bash
cd backend-api
git add src/modules/imports/types.ts \
        src/modules/imports/bank-data-encryption.ts \
        src/modules/auth/permissions.ts \
        src/plugins/permissions.ts \
        test/modules/bank-data-encryption.test.ts \
        test/modules/permissions.test.ts \
        .env.example \
        package.json
cd ..
git add docker-compose.override.yml _evo-output/

git commit -m "feat(imports): add bank data encryption module + permission abstraction (Story 5.1)

- AES-256-GCM with HKDF-SHA256 per-tenant key derivation
- Fastify requirePermission(key) middleware with static role mapping
- 25 unit tests covering roundtrip, tampering detection, tenant isolation
- AC8 (opt-in per tenant) explicitly out-of-scope, deferred to v3-3-rbac-data-driven

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

⚠️ **NÃO inclua `.env` no commit** (já está no `.gitignore`).

---

## 📋 Para abrir a próxima conversa

**Cole o seguinte como primeira mensagem:**

```
Estou retomando trabalho da feature v3-2-import-tirvu. Por favor leia o arquivo
HANDOFF-NEXT-CONVERSATION.md na raiz do projeto pra contexto completo.

Resumo: Story 5.1 (encryption + permissions) está implementada e em status `review`.
Quero [escolher um]:
(A) rodar code-review com outro modelo
(B) avançar para Story [1.1 ou 2.1]
(C) committar Story 5.1 e validar manualmente

[Sua escolha aqui]
```

A IA da próxima conversa vai abrir o handoff doc e pegar todo o estado.

---

## 🧠 Memória útil sobre o projeto (atualizada)

- **Stack:** Fastify 5 + Prisma 7.6 + Postgres 15 + Redis + BullMQ + Next.js 16 + React 19 + Tailwind + shadcn/ui
- **Test runner:** `node:test` nativo (NÃO Vitest, NÃO Jest) — testes em `backend-api/test/modules/*.test.ts`
- **Multi-tenant:** via Prisma extension de tenant scoping (já implementado)
- **Roles V3:** `SUPERADMIN`, `ADMIN`, `USER`, `AUDITOR` (strings hardcoded)
- **Convenções:** `kebab-case.ts` arquivos, `camelCase` funções, `PascalCase` tipos, `SCREAMING_SNAKE_CASE` constantes
