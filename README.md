<div align="center">
  <h1>Gestao de Ferias V3.0 - SaaS Multi-tenant</h1>
  <p>Plataforma de gestao de ferias com cobertura inteligente, AI preditiva e conformidade CLT para empresas de terceirizacao.</p>

  [![CI](https://github.com/fontesmidias/gestao-ferias/actions/workflows/ci.yml/badge.svg)](https://github.com/fontesmidias/gestao-ferias/actions/workflows/ci.yml)
  [![Docker](https://img.shields.io/badge/Docker-Ready-0db7ed?logo=docker&logoColor=white&style=flat-square)]()
  [![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&style=flat-square)]()
  [![Fastify](https://img.shields.io/badge/Fastify-5-black?logo=fastify&style=flat-square)]()
</div>

---

## Diferencial Competitivo

1. **Gestao integrada ferias + cobertura** - Nao existe no mercado para terceirizadoras
2. **AI preditiva** - Responde "quantos intermitentes preciso em setembro?" com dados reais
3. **Chat em linguagem natural** - Diretoria pergunta sem navegar dashboards
4. **Otimizacao financeira** - Sugere ferista efetivo vs intermitente por custo-beneficio
5. **Timeline de cobertura** - Quem cobre quem, onde e quando

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 (App Router, Turbopack) |
| Backend | Fastify 5, TypeScript, Prisma 7 |
| Banco | PostgreSQL 15 |
| Cache/Filas | Redis 7 + BullMQ |
| AI | OpenAI / Anthropic / Gemini / Groq |
| Deploy | Docker Swarm, Portainer, Traefik |
| CI | GitHub Actions |

---

## Dev Local (sem Docker)

```bash
# 1. Instalar dependencias
cd backend-api && npm install
cd ../frontend-web && npm install

# 2. Configurar .env
# backend-api/.env
DATABASE_URL="postgresql://admin:adminpassword@localhost:5432/gestaoferias?schema=public"
JWT_SECRET=sua_chave_secreta_aqui
PORT=3000

# frontend-web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

# 3. Migrations + Seed
cd backend-api
npx prisma migrate deploy
npx ts-node prisma/seed.ts

# 4. Subir com PM2
cd .. && npm run pm2:start
```

Acesse: http://localhost:3002 (login: admin@greenhouse.com / Senha@123)

---

## Deploy Docker

### Local
```bash
docker-compose up --build
```

### VPS Solo (Nginx externo)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Swarm + Portainer + Traefik
```bash
docker stack deploy -c docker-stack.yml gestao-ferias
```

Variaveis obrigatorias em producao:
- `DB_USER`, `DB_PASSWORD` - credenciais do PostgreSQL
- `JWT_SECRET` - chave secreta para tokens JWT
- `PUBLIC_API_URL` - URL publica da API (ex: https://api.seudominio.com)

---

## MasterKey (Acesso Emergencial)

A MasterKey permite acessar qualquer conta do sistema sem a senha original. Util quando o administrador perde o acesso.

### Configurar via Painel Admin

1. Faca login como SUPERADMIN
2. Clique em **MasterKey** no header da Sala de Controle
3. Clique em **Gerar MasterKey**
4. **Copie e guarde a chave** em local seguro (ela nao sera exibida novamente)

### Usar a MasterKey

```bash
curl -X POST https://sua-api.com/api/v1/masterkey \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@empresa.com","masterKey":"sua_chave_aqui"}'
```

O token JWT retornado pode ser usado para autenticar qualquer requisicao.

### Reset de Emergencia do SuperAdmin

Se perdeu totalmente o acesso, use o script via terminal no servidor:

```bash
# Via Docker
docker exec -it <container_backend> npx tsx scripts/reset-superadmin.ts --password NovaSenha123!

# Localmente
cd backend-api && npx tsx scripts/reset-superadmin.ts --password NovaSenha123!
```

---

## Deploy e Migrations

Sempre que fizer deploy de uma nova versao, rode as migrations **antes** de reiniciar os servicos:

```bash
cd backend-api && npx prisma migrate deploy
```

Para ambientes Docker, inclua no entrypoint do container ou rode manualmente:

```bash
docker exec -it <container_backend> npx prisma migrate deploy
```

---

## Endpoints Principais

| Endpoint | Descricao |
|----------|-----------|
| POST /auth/login | Login (retorna access + refresh token) |
| POST /auth/refresh | Renovar tokens |
| GET /employees | Listar colaboradores |
| GET /employees/:id/balance | Saldo de ferias (CLT) |
| POST /vacations | Solicitar ferias |
| GET /workplaces | Listar postos de trabalho |
| GET /allocations | Alocacoes ativas |
| GET /coverages/gaps | Detectar postos descobertos |
| GET /coverages/suggestions | Sugerir cobertura |
| GET /predict/risks | Riscos de multa CLT Art. 137 |
| POST /predict/ask | Chat com AI |
| GET /audit-logs | Logs de auditoria |
| PATCH /vacations/:id | Aprovar/rejeitar com cobertura integrada |
| POST /vacations/bulk-create | Cadastro em massa (max 50, CLT) |
| GET /webhooks | Listar webhooks configurados |
| POST /webhooks/:id/test | Testar webhook |
| POST /masterkey | Login emergencial via MasterKey |
| GET /admin/master-key | Status da MasterKey |
| POST /admin/master-key/generate | Gerar nova MasterKey |
| PATCH /admin/master-key | Ativar/desativar MasterKey |
| DELETE /admin/master-key | Revogar MasterKey |
| GET /admin/master-key-logs | Logs de acesso emergencial |

---

## Testes

```bash
# Backend — testes unitarios (modules)
cd backend-api && npm test

# Frontend
cd frontend-web && npx vitest run
```

Cobertura: `c8` gera relatorio automaticamente ao rodar `npm test`.

---

## Licenca

MIT - Veja `LICENSE`.

<div align="center">
  <p>Green House Terceirizacao - Fontes Midias</p>
</div>
