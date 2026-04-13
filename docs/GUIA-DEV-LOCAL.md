# Guia de Desenvolvimento Local - Gestao de Ferias

## Como subir o ambiente

### 1. Iniciar o PostgreSQL
O PostgreSQL 15 ja esta instalado como servico Windows. Ele inicia automaticamente com o PC.
Para verificar se esta rodando:
```bash
powershell -Command "Get-Service postgresql-x64-15"
```

### 2. Iniciar o Backend (Terminal 1)
```bash
cd C:/Users/cery0/projetos/gestao-ferias/backend-api
npm run build && npm run start
```
- Roda na porta **3000**
- Logs aparecem no terminal
- Redis ausente: filas desativadas (warn no log), core funcional

### 3. Iniciar o Frontend (Terminal 2)
```bash
cd C:/Users/cery0/projetos/gestao-ferias/frontend-web
npx next dev -p 3002
```
- Roda na porta **3002**
- Hot-reload ativo (Turbopack)

### 4. Acessar no navegador
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

| Endpoint | Metodo | Status |
|----------|--------|--------|
| `/api/v1/setup/status` | GET | OK |
| `/api/v1/setup` | POST | OK |
| `/api/v1/auth/login` | POST | OK |
| `/api/v1/auth/me` | GET | OK (com token) |
| `/api/v1/employees` | GET | OK (com token) |
| `/api/v1/dashboard/metrics` | GET | OK (com token) |
| `/api/v1/vacations` | GET | OK (com token) |

## Proximo passo

Sprint 1: Seguranca e Isolamento (ver docs/PLANO-REVISAO-COMPLETA-V3.md)
