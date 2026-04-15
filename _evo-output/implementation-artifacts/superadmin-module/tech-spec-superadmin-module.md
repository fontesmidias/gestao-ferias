---
title: 'Modulo SuperAdmin Completo'
slug: 'superadmin-module'
created: '2026-04-13'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Fastify 5', 'Prisma 7', 'PostgreSQL 15', 'Next.js 16', 'Tailwind CSS']
files_to_modify:
  - 'backend-api/prisma/schema.prisma'
  - 'backend-api/src/routes/api/v1/admin/index.ts'
  - 'backend-api/src/routes/api/v1/auth/index.ts'
  - 'frontend-web/src/app/admin/page.tsx'
  - 'frontend-web/src/app/admin/tenants/[id]/page.tsx'
  - 'frontend-web/src/components/Sidebar.tsx'
  - 'frontend-web/src/components/AuthContext.tsx'
  - 'frontend-web/src/app/layout.tsx'
---

# Tech-Spec: Modulo SuperAdmin Completo

## Tasks

### Bloco 1: Schema + Migration

- [ ] Task 1: User.isActive + Tenant.lastLoginAt
  - File: `backend-api/prisma/schema.prisma`
  - Add to User: `isActive Boolean @default(true) @map("is_active")`
  - Add to Tenant: `lastLoginAt DateTime? @map("last_login_at")`
  - Migration SQL: ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true; ALTER TABLE tenants ADD COLUMN last_login_at TIMESTAMP(3);

### Bloco 2: Backend Auth

- [ ] Task 2: Fix refresh token (incluir employeeId + preservar contexto switch)
  - File: `backend-api/src/routes/api/v1/auth/index.ts` line 103
  - Refresh: buscar user com `include: { employee: { select: { id: true } } }`
  - Line 124: adicionar `employeeId: (user as any).employee?.id || null` ao JWT
  - Se role === SUPERADMIN, preservar tenantId do stored token (nao do user.tenantId)

- [ ] Task 3: Login rejeitar inativo + atualizar lastLoginAt do tenant
  - Mesmo arquivo, apos validar senha: `if (user.isActive === false)` retornar 401 "Conta desativada"
  - Se user.tenantId, atualizar `tenant.lastLoginAt = new Date()`

### Bloco 3: Backend Admin routes

- [ ] Task 4: PATCH /admin/tenants/:tenantId/users/:userId
  - File: `backend-api/src/routes/api/v1/admin/index.ts`
  - Body: { name?, email?, role?, isActive? }
  - Nao pode editar usuario com role SUPERADMIN
  - role deve ser ADMIN, USER ou AUDITOR

- [ ] Task 5: DELETE /admin/tenants/:tenantId/users/:userId
  - Mesmo arquivo. Soft delete: set isActive=false

- [ ] Task 6: POST /admin/switch-tenant
  - Recebe { tenantId }. Valida tenant existe.
  - Gera novo JWT: { userId, tenantId: alvo, role: SUPERADMIN, name, email, employeeId: null }
  - Retorna { token, tenant: { id, name } }

- [ ] Task 7: GET /admin/tenants/:id/metrics
  - Retorna: employeesByStatus (groupBy status _count), pendingVacations (count PENDING), totalWorkplaces (count), activeAllocations (count ACTIVE), coverageGaps (count vacations APPROVED sem coverage)
  - Todas as queries WHERE tenantId = param.id

### Bloco 4: Frontend Auth + Layout

- [ ] Task 8: AuthContext — switchTenant, returnToAdmin, isImpersonating
  - File: `frontend-web/src/components/AuthContext.tsx`
  - switchTenant(tenantId): POST /admin/switch-tenant, salvar token atual em localStorage('adminToken'), salvar novo token, setUser, router.push('/dashboard')
  - returnToAdmin(): restaurar token de adminToken, remover adminToken, setUser via /auth/me, router.push('/admin')
  - isImpersonating: computed de localStorage.getItem('adminToken') !== null
  - Exportar switchTenant, returnToAdmin, isImpersonating na interface

- [ ] Task 9: Banner fixo de impersonacao no layout
  - File: `frontend-web/src/app/layout.tsx`
  - Se isImpersonating === true, renderizar banner fixo ACIMA da sidebar+content:
  - Banner: bg-amber-500 text-black, "Visualizando: [tenant name]" + botao "Sair e Voltar ao Admin"
  - Botao chama returnToAdmin()

- [ ] Task 10: Sidebar — modo impersonation
  - File: `frontend-web/src/components/Sidebar.tsx`
  - Se isImpersonating, mostrar menu completo de ADMIN (dashboard, oraculo, aprovacoes, colaboradores, postos, cobertura)
  - Se SuperAdmin normal (nao impersonating), mostrar: Painel Admin, Dashboard Global

### Bloco 5: Frontend Paginas Admin

- [ ] Task 11: /admin page — control room dashboard
  - File: `frontend-web/src/app/admin/page.tsx`
  - KPIs globais: Empresas, Usuarios, Colaboradores, Ferias Pendentes
  - Lista de tenants como cards com: nome, CNPJ, cidade, responsavel, lastLoginAt formatado
  - Indicadores visuais: verde (login < 7 dias), amarelo (7-30 dias), vermelho (> 30 dias ou nunca)
  - Metricas inline por tenant: N usuarios, N employees
  - Botoes: Ver Detalhes, Entrar (switch), Editar, Criar Usuario
  - Modal editar tenant (ja existe, manter)
  - Modal criar usuario com dropdown de role + se USER mostrar select de employees para vincular

- [ ] Task 12: /admin/tenants/[id] page — detalhe do tenant
  - File: `frontend-web/src/app/admin/tenants/[id]/page.tsx` (NOVO)
  - Header: nome da empresa + CNPJ + badges (ativo/inativo)
  - Secao Dados: email, telefone, endereco, cidade, UF, responsavel (editavel via modal)
  - Secao Mini-Dashboard: 4 KPIs do tenant (GET /admin/tenants/:id/metrics): employees ativos, ferias pendentes, postos, gaps
  - Secao Usuarios: tabela com nome, email, role (badge), status (ativo/inativo toggle), botao editar role
  - Botao "Entrar nesta empresa" (switch tenant)
  - InfoTooltips em tudo

## Acceptance Criteria

- [ ] AC1: Given SuperAdmin logado, When acessa /admin, Then ve KPIs globais e tenants com indicadores de atividade (verde/amarelo/vermelho)
- [ ] AC2: Given SuperAdmin, When clica "Entrar" em tenant, Then banner amarelo aparece no topo, sidebar vira menu ADMIN, dashboard mostra dados do tenant
- [ ] AC3: Given SuperAdmin impersonando, When clica "Sair e Voltar", Then banner some, volta ao /admin com token original
- [ ] AC4: Given SuperAdmin no detalhe, When edita role de usuario, Then role atualizado
- [ ] AC5: Given SuperAdmin no detalhe, When desativa usuario, Then usuario nao consegue logar (mensagem "Conta desativada")
- [ ] AC6: Given Colaborador, When refresh token, Then employeeId permanece no JWT
- [ ] AC7: Given SuperAdmin cria USER, When seleciona employee no dropdown, Then usuario fica vinculado
