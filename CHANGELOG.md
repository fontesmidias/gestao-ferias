# Changelog - GestãoFérias SaaS

Todas as mudanças notáveis para este projeto serão documentadas neste arquivo.

## [2.0.0] - 2026-04-02 (Lançamento Enterprise)

Esta versão marca a transição de um MVP utilitário para uma plataforma corporativa completa (SaaS) com suporte a múltiplos clientes (tenants) e inteligência artificial.

### 🚀 Novidades (Features)
- **Multi-tenancy Isolation:** Implementação de isolamento rigoroso de banco de dados por `tenantId`. Agora, diferentes empresas (Ex: Indústrias Stark e Oscorp) residem no mesmo sistema sem cruzamento de dados.
- **Portal Mobile PWA (Employee Self-Service):** Lançamento da interface mobile-first para colaboradores em `/employee/dashboard`. O funcionário pode consultar saldo e solicitar férias de forma autônoma.
- **Oráculo AI (Predict Engine):** Novo dashboard estratégico em `/predict` que utiliza regras CLT para prever riscos de passivo trabalhista (periodização de férias) e sugerir ROI de economia financeira para o RH.
- **Autenticação Segura (Magic Link):** Substituição de logins simples por fluxo de token seguro (JWT) enviado via link oficial, eliminando a necessidade de gerenciar senhas.

### 🛠️ Infraestrutura e DevOps
- **Conteinerização Completa:** Orquestração via `docker-compose` de 4 microsserviços (Front-end Next.js, Back-end Fastify, Banco Postgres, Cache Redis).
- **Security Guards:** Implementação de hooks de segurança (RBAC) que protegem rotas administrativas e garantem que usuários comuns só acessem seus próprios dados.
- **Standardization:** Padronização de erros globais (Fastify Error Handler) e tipagem rigorosa para evitar falhas em produção.

### 🐛 Correções (Fixes)
- **Validação Art. 134 CLT:** Ajuste no motor de datas para bloquear rigorosamente o início de férias em quintas e sextas-feiras, prevenindo multas trabalhistas.
- **Sincronização de Banco de Dados:** Correção de conflitos de migração Prisma no ambiente conteinerizado.
- **Testes Unitários:** Atualização das suítes de testes Vitest/Node.js para refletir os novos fluxos de aprovação de RH da V2.

### 📐 Melhorias de UX
- **Design System Glassmorphism:** Interface modernizada com transparências, cartões dinâmicos e micro-animações premium.
- **Sidebar Global:** Navegação unificada para o RH com colapso inteligente e identificação do usuário logado.

---

## [1.0.0] - 2026-03-31 (MVP Core)
- Implementação inicial do Motor de Regras CLT.
- Sistema básico de cálculo de ROI.
- Cadastro de funcionários e banco de dados inicial (SQLite para testes).
- PDF Generator para recibos de férias.
