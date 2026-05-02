# Postman — v3-2 Import Tirvu

Collection + environment para smoke testing dos endpoints da feature de importação Tirvu (Stories 1.2/1.3/3.2/4.0a/4.0b).

## Como importar

1. Abra o Postman → **File → Import** (ou `Ctrl+O`)
2. Arraste **ambos** os arquivos:
   - `v3-2-import-tirvu.postman_collection.json` (a collection)
   - `v3-2-import-tirvu.postman_environment.json` (o environment)
3. No canto superior direito, selecione o environment **"v3-2 Import Tirvu (local dev)"**

## Como configurar

### 1. Subir o backend localmente
```bash
docker-compose up backend
# OU
cd backend-api && npm run dev
```

### 2. Gerar JWT
Postman → cole isso numa nova request temporária:
```
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{ "email": "rh@greenhousedf.com.br", "password": "<sua-senha-superadmin>" }
```
Copie o `accessToken` da resposta para `JWT_SUPER` no environment.

Repita com credenciais de ADMIN de um tenant para `JWT_ADMIN`. Repita com credenciais de ADMIN de **outro** tenant para `JWT_OTHER_TENANT` (testes cross-tenant).

### 3. Pegar TENANT_ID
```
GET http://localhost:3000/api/v1/admin/tenants
Authorization: Bearer <JWT_SUPER>
```
Copie o `id` do tenant que vai usar no smoke (ex: Servi-Plus) para `TENANT_ID`. Copie o `name` exato para `TENANT_NAME`.

### 4. Selecionar arquivos nos requests com upload
A collection tem 4 requests com `file` form-data (em **1. Upload SuperAdmin** e **2. Upload TenantAdmin**). Postman não persiste paths de arquivo — você precisa clicar no botão **Select Files** em cada um e apontar para:
- `docs/exemplo/Colaboradores, para fins de validação.xlsx` (fixture base)
- `backend-api/test/fixtures/imports/tirvu-mixed-errors.xlsx` (com 5 inválidos — para testar error-report)

## Fluxo recomendado

1. **1.1 Upload SuperAdmin (happy path)** — script salva `JOB_ID` automaticamente
2. **3.1 GET status** — polle 5-10× até `status=PREVIEW_READY` (~5-30s)
3. **4.1 GET preview** — verifica rows, counts, paginação
4. **5.1 POST apply** — confirma com `TENANT_NAME`
5. **3.1 GET status** — polle até `status=COMPLETED`
6. **7.1 GET error-report** — apenas se houver inválidos

## Idempotência manual

Após o passo 6, repita do passo 1 com o **mesmo arquivo**. No 2º apply o `rowsCreated`/`rowsUpdated` finais devem ser `0` (todos `unchanged`).

## Edge cases prontos

A collection inclui requests negativos:
- 1.2/1.3: file/tenantId inválidos → 400
- 3.3: cross-tenant → 404
- 4.4: preview em PARSING → 409
- 5.2/5.3: confirmação errada / job em estado errado → 400/409
- 6.2: cancel 2× → 409
- 8.1: ADMIN tentando rota /admin/* → 403
- 8.2: sem Authorization → 401

Cada um tem assertion `pm.test('...')` no script de teste — basta clicar **Send** e olhar a aba "Test Results".

## Troubleshooting

- **Erro `Redis indisponível`** no log do backend: subir Redis antes (`docker ps` deve listar `gv-redis`)
- **Erro `BANK_DATA_ENCRYPTION_KEY required`** no startup: conferir que `backend-api/.env` tem a chave (Story 5.1)
- **Polling em PARSING infinito**: worker BullMQ pode ter caído. Restart o backend.
- **204 vazio no error-report mesmo com inválidos**: verificar `previewSummary.counts.invalid > 0` via GET status. Se é 0, fixture estava limpo.
