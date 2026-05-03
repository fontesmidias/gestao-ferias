# Getting Started with [Fastify-CLI](https://www.npmjs.com/package/fastify-cli)
This project was bootstrapped with Fastify-CLI.

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm start`

For production mode

### `npm run test`

Run the test cases.

## Test Suites

### `test/modules/*.test.ts`

Unit tests para módulos isolados (parsers, encryption, pipelines, validators).
Roda em CI via `npx tsx --test test/modules/*.test.ts`.

### `test/security/*.test.ts` — pen-tests obrigatórios (Story 5.3)

Suite de **penetration tests** que valida **NFR10 (0 vazamentos cross-tenant)** em todas
as rotas `/imports/*` e `/employees/*`. **OBRIGATÓRIO no CI** — se falhar, merge é
bloqueado.

Cobre:
- Cross-tenant ImportJob access (TenantAdmin → endpoints de outro tenant = 404
  `JOB_NOT_FOUND`, anti-leak de existência).
- Forbidden cross-role (TenantAdmin → rotas `/admin/*` = 403).
- Payload tampering (`tenantId` no body silenciosamente ignorado, `INVALID_TARGET_TENANT`
  para tenant inativo / faltando).
- Cross-tenant Employee + bankData (`X-Show-Bank-Data` não bypassa filter por tenant).
- AES-GCM tampering (1 byte alterado em `bankDataTag` → 500
  `BANK_DATA_DECRYPT_FAILED`).

**Política:** qualquer mudança em `src/routes/api/v1/imports/`, `src/routes/api/v1/admin/imports/`,
`src/modules/imports/` ou `src/routes/api/v1/employees/index.ts` (GET /:id) **requer**
revisão desta suite. Adicione test antes de mergear novas rotas que tocam dados
multi-tenant.

Roda local com:
```bash
DATABASE_URL=... BANK_DATA_ENCRYPTION_KEY=... JWT_SECRET=... \
  npx tsx --test test/security/*.test.ts
```

## Learn More

To learn Fastify, check out the [Fastify documentation](https://fastify.dev/docs/latest/).
