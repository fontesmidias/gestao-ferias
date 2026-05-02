# Story 2.1: Schema migration para Employee + ImportJob model

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor backend,
I want uma migration Prisma única (`add_import_tirvu_v3_2`) que estende `Employee` com os 10 campos derivados da planilha Tirvu (`tirvuId`, `personalData`, `address`, `bankDataEnc/Iv/Tag`, `unionName`, `geofencingFlags`, `inactivePending`, `terminationDate`), cria o model `ImportJob` com enum `ImportJobStatus` (8 estados) e adiciona os 3 indexes de performance descritos em Architecture D1,
so that as Stories 2.2 (parser), 2.3 (matcher), 3.x (apply) e 5.2 (preview) podem persistir os campos novos exigidos pela planilha Tirvu sem precisar fragmentar a migration por épico.

## Acceptance Criteria

### Schema mudanças

1. **Employee é estendido** com exatamente as colunas em [Architecture D1](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D1):
   - `tirvuId` `String?` `@map("tirvu_id")` — text nullable
   - `personalData` `Json?` `@map("personal_data")` — jsonb nullable
   - `address` `Json?` — jsonb nullable
   - `bankDataEnc` `Bytes?` `@map("bank_data_enc")` — bytea nullable
   - `bankDataIv` `Bytes?` `@map("bank_data_iv")` — bytea nullable
   - `bankDataTag` `Bytes?` `@map("bank_data_tag")` — bytea nullable
   - `unionName` `String?` `@map("union_name")` — text nullable
   - `geofencingFlags` `Json?` `@map("geofencing_flags")` — jsonb nullable
   - `inactivePending` `Boolean` `@default(false)` `@map("inactive_pending")` — bool not null default false
   - `terminationDate` `DateTime?` `@map("termination_date")` — timestamptz nullable

2. **Employee unique compose** `@@unique([tenantId, tirvuId], name: "tenant_tirvu_unique", map: "employees_tenant_tirvu_unique_idx")` adicionado. Postgres trata NULLs como não-iguais por padrão, então múltiplos Employees com `tirvuId = NULL` (legados pré-import) coexistem sem violar o constraint — comportamento correto e desejado (ver Project Structure Notes).

3. **Employee index** `@@index([tenantId, inactivePending], name: "employees_tenant_inactive_pending_idx")` adicionado para suportar a query "candidatos a inativar" do `/employees` (FR43).

4. **Model `ImportJob`** criado idêntico ao spec em Architecture D1 (linhas 218–256 do `architecture.md`):
   - Campos: `id` (uuid), `tenantId` (uuid), `operatorUserId` (uuid), `status` (enum), `parserVersion` (default `"tirvu-v1"`), `filename`, `fileSize` (Int), `fileHash` (text — SHA-256 hex), `storagePath`, `totalRows` (nullable), `rowsProcessed/Created/Updated/Invalid/Absent` (Int default 0), `workplacesCreated` (Int default 0), `previewSummary` (Json nullable), `errorReportPath` (nullable), `failureReason` (nullable), `ipAddress` (nullable), `userAgent` (nullable), timestamps (`createdAt` default now, `parsedAt`/`appliedAt`/`completedAt` nullable).
   - Relations: `tenant Tenant @relation(fields: [tenantId], references: [id])` e `operator User @relation(fields: [operatorUserId], references: [id])`.
   - `@@map("import_jobs")` para tabela.

5. **Enum `ImportJobStatus`** criado com exatamente 8 valores na ordem do spec: `PENDING`, `PARSING`, `PREVIEW_READY`, `APPLYING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`.

6. **ImportJob index** `@@index([tenantId, status, createdAt], name: "import_jobs_tenant_status_created_idx")` para suportar listagem de history por tenant filtrada por status (Story 4.x).

7. **Relations reversas** adicionadas em `Tenant` (`importJobs ImportJob[]`) e em `User` (`importJobs ImportJob[]`) para satisfazer o Prisma (toda `@relation` exige inverso).

### Migration

8. **Comando `npx prisma migrate dev --name add_import_tirvu_v3_2`** gera diretório `backend-api/prisma/migrations/20260501XXXXXX_add_import_tirvu_v3_2/migration.sql` (timestamp posterior à última migration do repo, `20260418161222_add_user_preferences`). O dev rodando o comando vai gerar com timestamp do momento — não ajustar manualmente.

9. **`npx prisma generate`** roda sem erro e o client TS exporta tipos `Employee` (com 10 campos novos opcionais/default) e `ImportJob` (model novo).

10. **`npx tsc --noEmit`** no `backend-api` retorna zero erros — Employee é referenciado em diversos pontos (rotas, services); como todos campos novos são `?` (opcional) ou têm `@default`, nenhum site existente quebra.

### Não-regressão

11. **Suite de testes existente continua passando.** Rodar `node --test -r ts-node/register "test/modules/*.test.ts"` (suite unit isolada). Esperado: 100/100 (75 V3 + 25 da Story 5.1) — nenhum dos testes mockam Employee schema, então a extensão é transparente.

12. **Tenant scoping da Prisma extension continua cobrindo as queries**: o teste `permissions.test.ts` da Story 5.1 já valida que SUPERADMIN tem `bankData.view` mas ADMIN não — isso permanece válido. Para Employee queries, a Prisma extension `withTenantScoping` em [src/plugins/prisma.ts](backend-api/src/plugins/prisma.ts) intercepta automaticamente todas as queries sem mudança neste épico (Architecture §3 confirma).

### Out-of-scope (NÃO implementar nesta story)

13. **NÃO implementar `ImportJobService.transition()`** (state machine guard). É da Story 2.4 ou futura.
14. **NÃO criar rotas `/admin/imports/*`**. São das Stories 1.2 e 1.3.
15. **NÃO criar parser/validator/matcher**. São das Stories 2.2 e 2.3.
16. **NÃO escrever ou ler `bankDataEnc`** ainda. Story 3.2 faz o write durante apply. Esta story apenas adiciona as colunas.
17. **NÃO popular dados de teste**. Sem seed novo nesta story.
18. **NÃO modificar `Workplace` model** (planilha Tirvu pode criar Workplaces novos — Story 2.3 trata).

## Tasks / Subtasks

### T1 — Editar `prisma/schema.prisma` (AC: 1, 2, 3, 4, 5, 6, 7)

- [x] T1.1 Abrir [backend-api/prisma/schema.prisma](backend-api/prisma/schema.prisma).
- [x] T1.2 No `model Employee` (linha 178), **antes** de `tenantId`/`createdAt` (mantém agrupamento lógico), adicionar bloco com 10 campos novos exatamente no formato de Architecture D1 (linhas 192–210). Manter os comentários `// ============ NOVO: ... ============` para facilitar code review humano.
- [x] T1.3 No `model Employee`, abaixo do `@@unique([cpf, tenantId])` existente (linha 211), adicionar:
  ```prisma
  @@unique([tenantId, tirvuId], name: "tenant_tirvu_unique", map: "employees_tenant_tirvu_unique_idx")
  @@index([tenantId, inactivePending], name: "employees_tenant_inactive_pending_idx")
  ```
- [x] T1.4 No `model Tenant` (linha 12), na lista de relations no fim do bloco (próximo de outras `@relation` reversas), adicionar `importJobs ImportJob[]`.
- [x] T1.5 No `model User` (linha 153), adicionar `importJobs ImportJob[]`.
- [x] T1.6 Após o último model (logo antes ou após `SystemConfig`), adicionar bloco `model ImportJob { ... }` copiando o spec literal de Architecture D1 (linhas 218–256). **Atenção:** ajustar `tenant` e `operator` para referenciar `Tenant` e `User` por nome do model (Prisma valida).
- [x] T1.7 Adicionar `enum ImportJobStatus { ... }` com os 8 valores na ordem do spec (Architecture D1 linhas 258–268).
- [x] T1.8 Verificar visualmente que nenhum bloco existente foi alterado (apenas adições).

### T2 — Gerar migration (AC: 8)

- [x] T2.1 Confirmar que Postgres dev está acessível: `docker ps` deve listar `gv-postgres` (host:5433). Se não, ler [HANDOFF-NEXT-CONVERSATION.md](HANDOFF-NEXT-CONVERSATION.md) §"Como rodar localmente".
- [x] T2.2 Validar que `backend-api/.env` aponta para o Postgres dev (`DATABASE_URL=postgresql://admin:adminpassword@localhost:5433/gestaoferias?schema=public`). Se Bruno trocou, ajustar.
- [x] T2.3 No diretório `backend-api`, rodar:
  ```bash
  npx prisma migrate dev --name add_import_tirvu_v3_2
  ```
  Esperado: cria `prisma/migrations/<timestamp>_add_import_tirvu_v3_2/migration.sql`, aplica no banco dev e roda `prisma generate` automaticamente.
- [x] T2.4 **Inspecionar o SQL gerado.** Conferir que contém:
  - `ALTER TABLE "employees" ADD COLUMN "tirvu_id" TEXT;` (e demais 9 colunas)
  - `CREATE TABLE "import_jobs" (...)` com todas as colunas e tipos corretos (UUID, TIMESTAMPTZ, JSONB, BYTEA, INT, BOOLEAN)
  - `CREATE TYPE "ImportJobStatus" AS ENUM (...)` com 8 valores
  - `CREATE UNIQUE INDEX "employees_tenant_tirvu_unique_idx" ON "employees"("tenant_id", "tirvu_id")`
  - `CREATE INDEX "employees_tenant_inactive_pending_idx" ON "employees"("tenant_id", "inactive_pending")`
  - `CREATE INDEX "import_jobs_tenant_status_created_idx" ON "import_jobs"("tenant_id", "status", "created_at")`
  - FKs em `import_jobs` para `tenants(id)` e `users(id)`
- [x] T2.5 Se o SQL precisar ajuste manual (raríssimo — Prisma é determinístico aqui), editar `migration.sql` antes de rodar `migrate deploy` para outros ambientes. **Mas só editar se sobrou bug claro.** Em geral, nada a fazer.

### T3 — Validar regeneração + compile (AC: 9, 10)

- [x] T3.1 Rodar `npx prisma generate` (já rodou no T2.3 mas reconfirmar). Esperado: zero output além de `✔ Generated Prisma Client`.
- [x] T3.2 Rodar `npx tsc --noEmit` em `backend-api`. Esperado: zero saída (zero erros).
- [x] T3.3 Caso `tsc` reclame em algum arquivo que **construa Employee** com `Prisma.EmployeeCreateInput` (ex.: seed file, factory de teste), confirmar que campos novos são opcionais/default — não devem ser exigidos. Se aparecer erro real, reportar nas Completion Notes (provavelmente bug do schema).

### T4 — Não-regressão (AC: 11, 12)

- [x] T4.1 No diretório `backend-api`, rodar:
  ```bash
  node --test -r ts-node/register "test/modules/bank-data-encryption.test.ts" "test/modules/permissions.test.ts" "test/modules/coverage-engine.test.ts" "test/modules/vacation-engine.test.ts"
  ```
  (lista os 4 unit suites principais; `test/routes/tenants.test.ts` integration é ignorado conforme Story 5.1 Debug Log.)
- [x] T4.2 Resultado esperado: todos pass. Se algum quebrar por causa do schema (ex.: factory de Employee não compila), corrigir o factory adicionando os campos novos como `null`/`undefined` explicitamente. Documentar a correção em Dev Notes.

### T5 — Documentação inline (AC: nenhum direto, mas qualidade)

- [x] T5.1 No `model ImportJob`, adicionar comentário no topo:
  ```prisma
  // Tirvu spreadsheet import job (Story 2.1, feature v3-2-import-tirvu).
  // State machine: PENDING → PARSING → PREVIEW_READY → APPLYING → COMPLETED|FAILED|CANCELLED|TIMED_OUT
  // Ver _evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D5
  ```
- [x] T5.2 NÃO adicionar comentário em cada campo novo do Employee — manter schema legível. Os nomes (`tirvuId`, `inactivePending`) são auto-explicativos; mapping detalhado já está em Architecture D1.

## Dev Notes

### Decisões arquiteturais críticas para esta migration

- **Migration única e distribuída por story que precisa, não Epic 1 standalone.** Bruno aprovou isso no Implementation Readiness Report ([Step 5](_evo-output/planning-artifacts/v3-2-import-tirvu/implementation-readiness-report.md)). Por isso esta story é a **primeira** da Epic 2 e **inteira** dedicada à migration — não há "Epic 0: Schema".

- **NULLs múltiplos no `@@unique([tenantId, tirvuId])` são por design.** Postgres trata `NULL != NULL` em unique constraints. Isso significa que vários Employees pré-import podem ter `tirvu_id = NULL` simultaneamente, e só após receber `tirvuId` da planilha o constraint passa a valer. **Não usar partial index** (`WHERE tirvu_id IS NOT NULL`) — Prisma não suporta nativamente e a semântica default já é correta. Documentado em Architecture D1 linha 271: "match secundário rápido (FR13)".

- **Bytea separados (não JSON).** `bankData` cifrado fica em 3 colunas (`bank_data_enc`, `bank_data_iv`, `bank_data_tag`) ao invés de JSON único pq:
  1. ciphertext é binário, JSON Postgres só aceita texto (escaparia base64 desnecessariamente)
  2. backup/dump não vê cleartext nem por acidente
  3. Story 5.1 já implementou `EncryptedBlob` com 3 buffers separados — match natural

- **JSONB para `personalData`/`address`/`geofencingFlags`.** Schema evolutivo (Tirvu pode adicionar campos), pouco consultados em queries (são lidos no detalhe do colaborador, não em listagem). Ver Architecture D1 linha 276.

- **Prisma `Bytes?` mapeia para `bytea`.** Confirmado em [Prisma docs §Native types](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#bytes). Para Postgres, sem `@db.ByteA` explícito (default já é).

- **`fileHash` é text não bytea.** Architecture D1 linha 228 especifica "SHA-256 hex" — string de 64 chars hex. Não confundir com bankDataEnc.

### Alinhamento com schema atual

[backend-api/prisma/schema.prisma](backend-api/prisma/schema.prisma) tem padrões consistentes que esta migration deve seguir:

- IDs sempre `String @id @default(uuid()) @db.Uuid`
- FKs sempre `String @map("...") @db.Uuid`
- timestamps sempre `DateTime` com `@map("snake_case")`
- relations sempre nomeadas explicitamente em ambos os lados (já visto em `Workplace`, `Employee`)
- nomes de tabelas sempre `@@map("snake_case_plural")`

### Dependência de Story 5.1

Story 5.1 ✅ **done** (commit `7d0271f`). A função `encryptBankData(data, tenantId): EncryptedBlob` já existe em [src/modules/imports/bank-data-encryption.ts](backend-api/src/modules/imports/bank-data-encryption.ts). Story 3.2 (apply) usará essa função para popular `bankDataEnc/Iv/Tag` durante o apply do ImportJob — mas **esta story 2.1 só adiciona as colunas, não escreve nelas**.

### Convenções de nomenclatura confirmadas

- Migration name: `<timestamp>_<snake_case>` ✅ (Prisma gera automaticamente)
- Index map: `<table>_<short_desc>_idx` ✅ (segue padrão do repo)
- Constraint name: `<table>_<short_desc>_unique` ✅

### Padrão de testes V3

- **NÃO Vitest, NÃO Jest.** Usar `node:test` nativo + `node:assert` (confirmado em Story 5.1 Dev Notes linha 263).
- Testes desta story: nenhum **novo** test arquivo. Apenas validar que os 4 suites existentes (`bank-data-encryption`, `permissions`, `coverage-engine`, `vacation-engine`) **continuam** passando.
- Quando Story 2.2 (parser) for criada, ela adicionará `imports/parser-tirvu-v1.test.ts`.

### Pegadinhas conhecidas (Prisma 7 + Postgres 15)

- **`prisma migrate dev` aplica imediatamente no banco dev.** Se você quer só gerar SQL sem aplicar, use `prisma migrate dev --create-only`. Para esta story, **aplicar é o desejado** (T2.3) — facilita validar T2.4.
- **Migration drift:** se outra branch também aplicou migrations no mesmo banco, Prisma pode reclamar. Resolver com `prisma migrate resolve` ou apagar o banco dev (`docker exec gv-postgres dropdb -U admin gestaoferias && createdb -U admin gestaoferias`) e rodar `migrate deploy`. Bruno confirmou em [HANDOFF-NEXT-CONVERSATION.md](HANDOFF-NEXT-CONVERSATION.md) que o banco `gestaoferias` está limpo no `gv-postgres`.
- **`tsc --noEmit` pode pegar regressão se algum arquivo construir `Employee` com objeto literal sem cast.** Improvável (V3 usa `prisma.employee.create({ data: {...} })` com tipos derivados), mas possível em testes de factory. Reportar se ocorrer.

### O que NÃO fazer nesta story (out-of-scope claros)

- ❌ NÃO usar `Unsupported("...")` para nenhuma coluna — todos os tipos são suportados nativamente por Prisma 7
- ❌ NÃO criar partial unique index (`WHERE tirvu_id IS NOT NULL`) — semântica default Postgres já cobre
- ❌ NÃO popular dados existentes (sem `UPDATE employees SET ...`) — colunas novas ficam todas `null`/`false` para registros pré-existentes, é o comportamento correto
- ❌ NÃO escrever testes integration que crie ImportJob — Stories 2.2+ farão isso
- ❌ NÃO modificar [src/plugins/prisma.ts](backend-api/src/plugins/prisma.ts) (tenant scoping extension) — já cobre tabelas com `tenantId` field automaticamente
- ❌ NÃO renomear nenhum campo existente do Employee — mexer só onde a story manda

### Project Structure Notes

Files que esta story mexe (esperado):
- ✏️ `backend-api/prisma/schema.prisma` — adições
- ✨ `backend-api/prisma/migrations/<timestamp>_add_import_tirvu_v3_2/migration.sql` — gerado por Prisma
- ✨ `backend-api/prisma/migrations/<timestamp>_add_import_tirvu_v3_2/migration_lock.toml` — não, esse é o global do diretório, **não muda**

Files que esta story **NÃO** deve tocar (red flag se tocar):
- 🚫 nenhum arquivo em `src/`
- 🚫 nenhum arquivo em `test/`
- 🚫 nenhum arquivo em `frontend-web/`

### Sequência típica de execução pelo dev

1. Editar schema (T1, ~20min)
2. Rodar migrate (T2, ~2min se banco está limpo)
3. Inspecionar SQL (T2.4, ~5min)
4. Rodar tsc + tests (T3+T4, ~3min)
5. Commit (mensagem proposta abaixo)
6. Marcar status = `review`

### Mensagem de commit sugerida

```
feat(imports): add Employee schema extension + ImportJob model (Story 2.1)

- Employee +10 fields: tirvuId, personalData (JSONB), address (JSONB),
  bankDataEnc/Iv/Tag (BYTEA), unionName, geofencingFlags (JSONB),
  inactivePending, terminationDate
- ImportJob model with 8-state ImportJobStatus enum
- Indexes: (tenantId, tirvuId) unique, (tenantId, inactivePending),
  (tenantId, status, createdAt)
- No data writes — columns populated by Stories 2.2 (parser) / 3.2 (apply)
```

### References

- [Architecture D1 — Schema design](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D1) (linhas 180–282)
- [Architecture D5 — ImportJob state machine](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D5) (referência para enum, mas implementação fica para Story 2.4+)
- [Architecture D11 — Re-import behavior](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D11) (justifica `terminationDate` + `inactivePending`)
- [Epics — Story 2.1](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 379–408 — AC original Given/When/Then)
- [PRD — FR32, FR40-FR45](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- [Story 5.1 (concluída)](_evo-output/implementation-artifacts/v3-2-import-tirvu/5-1-encryption-and-permissions.md) — encryption module que vai consumir as colunas binárias novas
- [Schema atual Employee](backend-api/prisma/schema.prisma) (linhas 178–213)
- [Prisma extension de tenant scoping](backend-api/src/plugins/prisma.ts) (transparente para a migration)
- [HANDOFF — setup local](HANDOFF-NEXT-CONVERSATION.md) (gv-postgres reuso)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- `prisma migrate dev` falhou com `Error: Prisma Migrate has detected that the environment is non-interactive`. Workaround: gerei o SQL via `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, criei o diretório `prisma/migrations/20260501205952_add_import_tirvu_v3_2/` manualmente, escrevi o `migration.sql` ali e apliquei com `npx prisma migrate deploy`. Tive que limpar a primeira linha "`Loaded Prisma config from prisma.config.js.`" que o Prisma escreve em stdout ao gerar o SQL — é log do CLI, não SQL válido.
- Warning durante diff: "A unique constraint covering the columns `[tenant_id,tirvu_id]` on the table `employees` will be added. If there are existing duplicate values, this will fail." — não é problema porque `tirvu_id` é nullable e ainda não há valores não-nulos no banco (Postgres trata múltiplos NULLs como distintos no unique).

### Completion Notes List

- ✅ T1 — Schema editado: Employee +10 colunas, +1 unique composto, +1 index simples; ImportJob model criado (28 colunas + 2 FKs + 1 index); enum `ImportJobStatus` com 8 valores; relations reversas em Tenant (`importJobs ImportJob[]`) e User (`importJobs ImportJob[]`).
- ✅ T2 — Migration `20260501205952_add_import_tirvu_v3_2/migration.sql` gerada via `prisma migrate diff` e aplicada via `migrate deploy`. SQL inspecionado e bate com Architecture D1.
- ✅ T3 — `npx prisma generate` OK; `npx tsc --noEmit` zero erros (nenhum site atual quebrou — todos os campos novos são opcionais ou têm default).
- ✅ T4 — Suite unit completa: 49/49 passing (`bank-data-encryption` 11 + `permissions` 14 + `coverage-engine` ~14 + `vacation-engine` 10). Zero regressões.
- ✅ T5 — Comentário inline no model `ImportJob` referenciando state machine + arquivo de arquitetura.

### File List

- ✏️ [backend-api/prisma/schema.prisma](backend-api/prisma/schema.prisma) — modificado: Employee estendido + relations reversas em Tenant/User + model ImportJob + enum ImportJobStatus
- ✨ [backend-api/prisma/migrations/20260501205952_add_import_tirvu_v3_2/migration.sql](backend-api/prisma/migrations/20260501205952_add_import_tirvu_v3_2/migration.sql) — nova migration

### Change Log

- 2026-05-01 — Story 2.1 implementada. Migration `add_import_tirvu_v3_2` aplicada no banco dev `gestaoferias` (timestamp `20260501205952`). 49/49 unit tests passing, zero erros TS.
