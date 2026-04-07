# Changelog e Histórico de Arquitetura (Sprint Final: Setup & Banco)

Este documento registra todas as tentativas, os pontos de falha silenciosos e nossas soluções definitivas para a infraestrutura do Gestão de Férias.

## 🟢 v2.1.1 - Hotfix de Migration (Senha)
*Data: 07 de Abril de 2026*

**O que Deu Errado:**
- O servidor iniciou a API, conectou com perfeição no banco e abriu no IP da VPS com *Status 200 OK*, provando que a Arquitetura da V2.1.0 e do Prisma V7 funcionou!!
- Porém, na tentativa de finalizar os passos no Frontend (`/api/v1/setup`), a API esbarrou no erro: `The column password_hash of relation users does not exist`. 
- Isso ocorreu porque, quando reformulamos o sistema de autenticação (de Magic Link para Senha tradicional) em Sprints passados, adicionamos a coluna no arquivo TS, mas o arquivo SQL de Migration da Senha nunca havia sido gerado.

**A Solução Definitiva:**
- Criamos a migration final manual e explícita `20260407222000_add_password_hash` alterando a tabela "users" e garantindo a estrutura correta de colunas de autenticação.

---

## 🟢 v2.1.0 - Correção de Banco (Prisma 7 vs Omit=Dev)
*Data: 07 de Abril de 2026*

**O que Mudou (Refatoração de Infraestrutura):**
- **O PROBLEMA REAL:** Em produção (Stage 2 do Docker), o comando `npm install --omit=dev` apagava os pacotes `prisma` e `dotenv` do contêiner, já que estavam listados como dependências de *Desenvolvimento*. Quando o script de inicialização rodava `npx prisma migrate deploy` e lia o `prisma.config.ts`, ele **crachava** ao tentar dar `import "dotenv/config"`, masjetando a variável para o buraco negro.
- **A SOLUÇÃO DEFINITIVA:** 
  - Movidos os pacotes `prisma` e `dotenv` para dependências oficiais (`dependencies`) no `package.json`.
  - Atualizamos o `Dockerfile` para **copiar** o arquivo `prisma.config.js` explícito.
  - Atualizamos os *Build States* do GitHub Actions inteiramente para **Node 22 (Alpine)**.

---

## 🟡 v2.0.2 - O Conflito do Prisma 7
**O que Deu Errado:**
- O Prisma Versão 7 introduziu uma mudança estrutural "quebrando" arquiteturas antigas: ele proibiu declarar `url = env(DATABASE_URL)` dentro de `schema.prisma`. 
- Ao tentar usar apenas um "Config fallback" para satisfazê-lo, a compilação passou, mas o contêiner em produção começou a dar *Exit Code* com o erro `datasource.url property is required`, entrando em looping.

---

## 🟢 v2.0.1 - Refatoração do Setup Dinâmico (SMTP Opcional)
**O que Deu Certo:**
- Em vez de travar suas configurações de SMTP em pesadas variáveis Portainer/Stack, repensamos a arquitetura!
- **Banco de Dados**: Criadas colunas opcionais `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass` e `smtpFrom` na tabela principal (`Tenant`), transformando a plataforma em SaaS real.
- **Frontend / Login**:
  - Removido o sistema inútil de *Magic Link* que fingia mandar e-mail.
  - O sistema de Login agora é reativo: se o banco estiver virgem, ele automaticamente te redireciona para a página `/auth/setup`.
  - Página de Setup ganhou um lindo design com os campos base e a sessão de e-mail liberados.

---

## 🟢 v2.0.0 - Liberação de Cors e Padronização Web
**O Que Deu Certo:**
- Frontend estava cego e não conseguia consumir a API devido à barreira *Cross-Origin*.
- Instalado e configurado `@fastify/cors`, blindando e permitindo conexões fluídas do NextJS em seu sub-domínio.
- Resolvido o TimeOut do `Traefik` com a rede `ferias_traefik_public`. O Frontend e Backend agiram em sinergia.
