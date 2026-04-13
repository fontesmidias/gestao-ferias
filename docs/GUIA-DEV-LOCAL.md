# Guia de Desenvolvimento Local - Gestao de Ferias

## Como subir o ambiente

### 1. Iniciar o PostgreSQL
O PostgreSQL 15 ja esta instalado como servico Windows. Ele inicia automaticamente com o PC.
Para verificar se esta rodando:
```bash
powershell -Command "Get-Service postgresql-x64-15"
```

### 2. Subir backend + frontend com PM2
PM2 gerencia ambos os processos. Um unico comando sobe tudo:
```bash
cd C:/Users/cery0/projetos/gestao-ferias
npm run pm2:start
```
Isso compila o backend (tsc) e inicia ambos os servicos.

### Comandos PM2 uteis
```bash
npm run pm2:status    # Ver status dos processos
npm run pm2:logs      # Ver logs em tempo real (Ctrl+C para sair)
npm run pm2:restart   # Reiniciar todos os processos
npm run pm2:stop      # Parar todos os processos
pm2 restart backend-api   # Reiniciar apenas o backend
pm2 restart frontend-web  # Reiniciar apenas o frontend
pm2 logs backend-api      # Logs apenas do backend
pm2 logs frontend-web     # Logs apenas do frontend
```

### Modo alternativo (sem PM2, terminais separados)

**Terminal 1 - Backend:**
```bash
cd C:/Users/cery0/projetos/gestao-ferias/backend-api
npm run build && npm run start
```

**Terminal 2 - Frontend:**
```bash
cd C:/Users/cery0/projetos/gestao-ferias/frontend-web
npx next dev -p 3002
```

### 3. Acessar no navegador
- **Frontend:** http://localhost:3002
- **API direta:** http://localhost:3000/api/v1

## Credenciais de teste

| Campo | Valor |
|-------|-------|
| Email | admin@greenhouse.com |
| Senha | Senha@123 |
| Empresa | Green House Terceirizacao |
| Role | ADMIN |

## Resetar o banco (se precisar comecar do zero)

```bash
# No terminal do backend-api:
export PGPASSWORD=adminpassword
"/c/Program Files/PostgreSQL/15/bin/psql.exe" -U postgres -c "DROP DATABASE gestaoferias;"
"/c/Program Files/PostgreSQL/15/bin/psql.exe" -U postgres -c "CREATE DATABASE gestaoferias OWNER admin;"
npx prisma migrate deploy
```
Depois acesse http://localhost:3002 e faca o setup novamente.

## Estrutura de portas

| Servico | Porta | Notas |
|---------|-------|-------|
| PostgreSQL | 5432 | Servico Windows nativo |
| Backend API | 3000 | Fastify |
| Frontend Web | 3002 | Next.js dev |
| Redis | 6379 | NAO INSTALADO - opcional |

## Arquivos .env (NAO commitados)

### backend-api/.env
```
DATABASE_URL="postgresql://admin:adminpassword@localhost:5432/gestaoferias?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=dev_secret_key_local_gestao_ferias_2026
PORT=3000
NODE_ENV=development
```

### frontend-web/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

## Endpoints testados e funcionando

| Endpoint | Metodo | Auth | Status |
|----------|--------|------|--------|
| `/api/v1/setup/status` | GET | Nenhum | OK |
| `/api/v1/setup` | POST | Nenhum (so funciona se DB virgem) | OK |
| `/api/v1/auth/login` | POST | Nenhum (rate limited: 5/min) | OK — retorna access + refresh token |
| `/api/v1/auth/refresh` | POST | Nenhum (rate limited: 10/min) | OK — token rotation |
| `/api/v1/auth/logout` | POST | requireAuth | OK — invalida refresh token |
| `/api/v1/auth/me` | GET | requireAuth | OK |
| `/api/v1/tenants` | GET | requireAuth | OK — retorna apenas o tenant do usuario |
| `/api/v1/tenants` | POST | requireAuth + requireAdmin | OK |
| `/api/v1/tenants/settings` | GET | requireAuth | OK — secrets mascarados |
| `/api/v1/tenants/settings` | PATCH | requireAuth + requireAdmin | OK |
| `/api/v1/employees` | GET | requireAuth | OK |
| `/api/v1/employees/:id` | GET | requireAuth | OK — tenant isolation via findFirst |
| `/api/v1/dashboard/metrics` | GET | requireAuth | OK |
| `/api/v1/vacations` | GET | requireAuth | OK |
| `/api/v1/vacations/:id` | PATCH | requireAuth + requireAdmin | OK — tenant isolation |

## Seguranca (Sprint 1 — concluido)

- Todos os endpoints protegidos com requireAuth (exceto setup e login)
- Isolamento multi-tenant: queries com tenantId obrigatorio
- Email unique por tenant (@@unique([email, tenantId]))
- CPF unique por tenant (@@unique([cpf, tenantId]))
- JWT_SECRET obrigatorio via env (sem fallback hardcoded)
- Access token: 15 minutos / Refresh token: 7 dias com rotation
- Rate limiting: login (5/min), verify-otp (3/min)
- WebSocket autenticado via JWT token
- Secrets mascarados no GET /settings

## Proximo passo

Sprint 2: Modelo de Dados - Postos, Cobertura e Substituicao (ver docs/PLANO-REVISAO-COMPLETA-V3.md)
