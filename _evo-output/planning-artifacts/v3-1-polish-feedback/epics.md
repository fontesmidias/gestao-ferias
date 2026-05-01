---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: 'complete'
completedAt: '2026-04-17'
inputDocuments:
  - C:/Users/cery0/.claude/plans/com-base-na-jazzy-mitten.md (Plano aprovado V3.1)
  - Relatório de Feedback de Navegação (mensagem do usuário, sessão de 2026-04-17)
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/prd.md (referência V3)
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md (referência V3)
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/ux-design-specification.md (referência V3)
  - _evo-output/planning-artifacts/v3-postos-cobertura-ai/epics.md (épicos V3 já entregues — evitar duplicação)
---

# gestao-ferias V3.1 — Epic Breakdown

## 🚦 Implementation Status (atualizado 2026-04-18)

| Bloco | Épicos | Status |
|---|---|---|
| **Bloco 1 — Fundação** | Épico 1 (CLT) + Story 5.1 parcial | ✅ **CONCLUÍDO** |
| **Bloco 2 — Limpeza arquitetural** | Épico 2 (Credenciais Globais) + Épico 3 (Sessão/Senha/Logout) | ✅ **CONCLUÍDO** |
| **Bloco 3 — Polimento visual** | Épico 4 (White-label) + Épico 5 restante (i18n) | ⏭️ Próximo |
| **Bloco 4 — Features novas** | Épicos 6 + 7 + 8 | ⏸️ Aguardando |

**Decisões emergentes (capturadas durante a implementação, ver apêndice no final):**
- Pool multi-credencial (`EmailCredential` + `WhatsappCredential`) substituiu o modelo single-global do plano original (decisão pós-validação do Bruno em 2026-04-18)
- Master Key ganhou 2 novas capabilities: definição manual (≥3 chars) + botão "Usar" para acesso emergencial via UI
- Idle timer alinhado ao JWT TTL (15min) com reset em 9 tipos de eventos de UI
- CLT Art. 134 §1º fracionamento (1ª fração ≥14d, demais ≥5d, máx 3, soma ≤ direito) implementado além do escopo inicial

## Overview

Onda de polimento pós-V3 derivada de sessão de navegação completa do produto. Endereça: compliance CLT crítico (bloqueio de início de férias em domingos/feriados), isolamento de credenciais globais (SMTP/Evolution movidos do tenant para Super Admin), white-label com upload de logo + dark mode, internacionalização (PT-BR/EN/ES), correções de bugs de UI (modais, filtros, tooltips), cadastros individuais (colaborador 1-a-1, cobertura 1-a-1), e fundamentos de UX (sessão visível, logout acessível, ícone-olho em senhas).

## Requirements Inventory

### Functional Requirements

**Credenciais Globais (Super Admin) e Isolamento de Tenant**

FR-V31-CRED-001: Renomear/agrupar menu "SMTP" no Super Admin para "Credenciais Globais", englobando SMTP e Evolution (WhatsApp) numa mesma seção.
FR-V31-CRED-002: Modal de SMTP no Super Admin inclui botão "Testar Conexão" que abre pop-up solicitando e-mail de destino e dispara envio real via SMTP configurado, retornando mensagem de sucesso (e-mail entregue) ou erro (com causa) na tela.
FR-V31-CRED-003: Modal "Salvar SMTP" fecha automaticamente após o success do save E exibe botão "X" sempre visível para fechamento manual.
FR-V31-CRED-004: Modal de configuração Evolution (WhatsApp) inclui botão "Testar Conexão" análogo, com envio de mensagem de teste para número informado.
FR-V31-CRED-005: Painel do Tenant Admin remove os campos de configuração SMTP e Evolution globais — apenas Super Admin gerencia credenciais globais. (Sem suporte a credenciais por tenant — decisão pós-Party Mode 2026-04-17, sem legado em prod.)

**Sessão, Master Key e Logout**

FR-V31-SES-001: Tela de geração de Master Key exibe contador visual discreto (canto superior ou inferior do card) indicando tempo restante até expiração da sessão sensível, atualizado a cada segundo.
FR-V31-SES-002: Super Admin pode configurar por tenant se a criação da Master Key será "automática no setup do tenant" ou "manual sob demanda do Tenant Admin".
FR-V31-SES-003: Sidebar exibe botão "Encerrar Sessão" no canto inferior esquerdo, junto ao nome/avatar do usuário, com ícone claro de logout, acessível em 1 clique.

**Senha e Visibilidade**

FR-V31-PWD-001: Tela "Alterar Senha" do usuário expõe campos "Nova Senha" e "Repetir Nova Senha"; campo "Senha Atual" só é exigido se a security policy do tenant marcar como obrigatório (default: dispensável quando usuário já está autenticado).
FR-V31-PWD-002: Todos os campos de senha do sistema (login, alteração, reset) incluem ícone de visualização (olho/macaquinho) que alterna entre texto/password.

**White-label e Theming**

FR-V31-BRAND-001: Campo "Nome exibido" (`brandName` do Tenant) reflete em tempo real no header (canto superior esquerdo e/ou direito), substituindo placeholder/título padrão.
FR-V31-BRAND-002: Tela de configuração de marca substitui input "URL da imagem" por componente de upload de imagem com preview, ícone de informação (i) detalhando dimensões/formatos recomendados (PNG, 300x100px, ≤200KB).
FR-V31-BRAND-003: Tenant Admin define cor primária e secundária via color pickers (estende FR-UI-010 do V3 — verificar gap de implementação).
FR-V31-BRAND-004: Toggle Dark/Light mode visível no header ou sidebar, persistido por usuário (localStorage + perfil), aplicado dinamicamente sem refresh.

**Dashboard, Filtros e Cadastros**

FR-V31-DASH-001: Bug — botão de filtro do Dashboard (ex: chip "1T 2016") está inativo; deve filtrar os dados exibidos pelo período selecionado e refletir nos KPIs e gráficos.
FR-V31-DASH-002: Dashboard suporta filtros avançados combinados — Período (data início/fim livres), Posto de Serviço, Função, Férias Concomitantes (booleano).
FR-V31-EMP-001: Tela de Colaboradores expõe formulário de cadastro individual (1-a-1) com todos os campos do model Employee, complementar à importação em massa CSV/XLSX existente.
FR-V31-EMP-002: Tela de Colaboradores expõe filtros adicionais: status (ativo/inativo), posto alocado, tipo contratual (EFETIVO/INTERMITENTE), flag isFerista, busca por nome/CPF.

**Aprovações de Férias e Compliance CLT**

FR-V31-VAC-001: Bug — modal de "Cadastro em Massa" de férias está abrindo no rodapé da tela; deve ser centralizado verticalmente, redimensionável e/ou possuir scroll interno adequado em viewports menores.
FR-V31-VAC-002: Campo "Buscar Colaborador" no bulk create tem autocomplete dinâmico (debounce 300ms, filtro instantâneo) — verificar regressão da Story 3.4 do V3 que já especificava cmdk.
FR-V31-CLT-001: 🚨 P0 — VacationEngine bloqueia rigorosamente o início de férias em domingos, feriados (nacionais + estaduais via UF do tenant) e véspera de feriado, retornando HTTP 422 com código `LEGAL_BLOCK_HOLIDAY` e mensagem explicativa em PT-BR conforme CLT Art. 134.
FR-V31-CLT-002: Novo model Prisma `TenantHoliday { id, tenantId, date, name, source: LIB|MANUAL, action: ADD|REMOVE, createdAt }` + serviço `HolidayResolver` que combina lib `date-holidays` (BR nacional + UF do tenant) com overrides manuais (action=ADD para pontos facultativos, action=REMOVE para feriados que a empresa opera). **Nota arquitetural (Winston):** considerar job mensal que materializa lib→tabela para reduzir dependência runtime; decisão fica para implementação.
FR-V31-CLT-003: Tela `/settings/holidays` permite Tenant Admin gerenciar overrides de feriado (CRUD): adicionar pontos facultativos da empresa, remover feriados oficiais que a operação opera, listar agenda consolidada do ano com origem (lib vs manual).
FR-V31-CLT-004: VacationEngine retorna mensagem específica por tipo de violação: domingo, feriado nacional, feriado estadual, ponto facultativo do tenant, véspera de feriado.

**Cobertura — Cadastro Individual e Tipo Ferista**

FR-V31-COV-001: Tela de Cobertura habilita cadastro 1-a-1 de cobertura via formulário dedicado, complementar ao fluxo bulk/automático existente.
FR-V31-COV-002: Formulário individual de cobertura inclui flag/seletor "Ferista Efetivo (GHS)" vs "Ferista Intermitente" para definir o tipo do substituto antes da criação do CoverageAssignment.

**Localização (i18n)**

FR-V31-I18N-001: Infraestrutura i18n no frontend (next-intl ou equivalente compatível com Next.js 16), com PT-BR como idioma default e bundles JSON por idioma (pt-BR.json, en.json, es.json).
FR-V31-I18N-002: Header expõe seletor de idioma com ícone de bandeira próximo ao nome do usuário; suporte inicial: PT-BR (default), EN, ES; preferência persistida por usuário.
FR-V31-I18N-003: Revisão geral de ortografia, acentuação (cedilha, agudo, circunflexo) e padronização para PT-BR oficial em todas as telas, mensagens de erro, e-mails e tooltips.
FR-V31-I18N-004: Renomear "Intelligence Dashboard" para termo em PT-BR oficial — "Dashboard Preditivo" (ou alternativa decidida pelo Tenant Admin).

**UX — Tooltips do Oráculo**

FR-V31-UX-001: Pop-ups de onboarding/tooltips do Oráculo (ex: "Bem-vindo ao centro de processamento...") deixam de ser overlays estáticos centralizados — passam a ser dinâmicos, apontando/iluminando os elementos reais da interface que descrevem (padrão "guided tour", ex: shepherd.js, intro.js, react-joyride) **combinado com tooltips contextuais persistentes (ícone "?" em cada elemento)** — alinhado à preferência de produto registrada em memória ("info icons em tudo, tooltips não intrusivos").

### NonFunctional Requirements

**Novas (V3.1)**

NFR-V31-CLT-001: `HolidayResolver` responde em P95 < 50ms — feriados resolvidos em cache em memória por chave `(tenantId, year)`, invalidado em CRUD de TenantHoliday.
NFR-V31-I18N-001: Bundles de idioma carregados sob demanda (code-splitting); troca de idioma não pode regredir LCP em mais de 200ms vs baseline.
NFR-V31-A11Y-001: Dark mode mantém contraste WCAG 2.1 AA (≥4.5:1) em todos os componentes; cores de status (gap, covered, planned) permanecem semanticamente fixas em ambos os modos.
NFR-V31-SEC-001: Timer visual de sessão (Master Key) é apenas indicador; expiração efetiva continua governada pelo JWT no backend — nenhum bypass via UI.
NFR-V31-UPLOAD-001: Upload de logo aceita PNG/JPG/SVG até 200KB; backend valida content-type, dimensões (≤500x200px) e armazena em `public/tenant-assets/{tenantId}/`.

**Herdadas do V3 (continuam aplicáveis)**

- NFR-PERF-001: API P95 < 200ms (50 req/s).
- NFR-SEC-001: Tenant isolation 100% — TenantHoliday segue padrão.
- NFR-SEC-002: Credenciais SMTP/Evolution nunca retornadas em GET nem logadas.
- NFR-OPS-002: Migrations Prisma rodam automaticamente no startup.
- NFR-ACC-001: Touch targets ≥44×44px em mobile.
- NFR-TEST-001: Cobertura ≥70% para `VacationEngine` (incluindo nova `HolidayValidator`).

### Additional Requirements

**Da Arquitetura (decisões V3.1)**

- Lib `date-holidays` (npm, ~30KB) — fonte oficial de feriados BR nacionais + estaduais por UF.
- Lib `next-intl` (oficial Next.js) — padrão recomendado para i18n em Next.js 16; arquivos em `frontend-web/messages/{locale}.json`.
- Componente novo `<ImageUpload />` no design system (preview, validação dimensional, drag-and-drop) — usar para logo, futuro avatar.
- Componente novo `<DarkModeToggle />` integrado ao `<TenantBrandWrapper />` — não criar wrapper paralelo.
- Componente novo `<SessionCountdown />` — hook `useSessionExpiry()` exposto para reuso.
- Lib de guided tour: avaliar `react-joyride` (mais maduro) vs `shepherd.js` (mais leve) no Step 02.
- Migração Prisma nova: `TenantHoliday` + índice `(tenantId, date)` único; relação com Tenant via `tenantId`.
- `VacationEngine` ganha nova etapa `HolidayValidator` injetada — não reescrever, apenas pluggar.
- `Tenant` ganha campo opcional `uf: String` (UF brasileira para resolução de feriados estaduais).
- `User` ganha campos `preferredLocale: String @default("pt-BR")` e `colorScheme: String @default("system")`.
- Master Key recebe campo `creationMode: AUTOMATIC | MANUAL` no Tenant — default AUTOMATIC para compatibilidade.

**Do UX (continuidade da V3)**

- Manter direção visual Compacta (sidebar 220px, row 28px, font 13px).
- Sheet lateral para CRUD de feriados (não modal) seguindo padrão V3.
- Toast (Sonner) para feedback de teste de conexão SMTP/Evolution.
- Skeleton loading após 200ms em todos os novos endpoints.
- Modais sempre com botão "X" + ESC fecha + click-outside fecha (revisar todos modais existentes).
- Color pickers de marca: usar componente `react-colorful` (já leve) ou nativo HTML5 `<input type="color">`.
- Bandeiras do seletor de idioma: ícones SVG inline (não emojis — inconsistente cross-OS no Windows).

### FR Coverage Map

FR-V31-CLT-001: Epic 1 — Bloqueio rígido de início em domingos/feriados (P0)
FR-V31-CLT-002: Epic 1 — Model TenantHoliday + HolidayResolver híbrido
FR-V31-CLT-003: Epic 1 — Tela /settings/holidays para overrides manuais
FR-V31-CLT-004: Epic 1 — Mensagens específicas por tipo de violação
FR-V31-CRED-001: Epic 2 — Renomear/agrupar como "Credenciais Globais"
FR-V31-CRED-002: Epic 2 — Botão "Testar Conexão" SMTP com pop-up de e-mail destino
FR-V31-CRED-003: Epic 2 — Modal SMTP fecha automaticamente + botão X visível
FR-V31-CRED-004: Epic 2 — Botão "Testar Conexão" Evolution (mensagem WhatsApp)
FR-V31-CRED-005: Epic 2 — Remover SMTP/Evolution do painel Tenant (sem seletor — decisão Party Mode)
FR-V31-SES-001: Epic 3 — Timer visual de sessão na geração de Master Key
FR-V31-SES-002: Epic 3 — creationMode AUTOMATIC | MANUAL por tenant
FR-V31-SES-003: Epic 3 — Botão "Encerrar Sessão" no canto inferior esquerdo
FR-V31-PWD-001: Epic 3 — Campos "Nova Senha" + "Repetir" sem exigir senha atual por padrão
FR-V31-PWD-002: Epic 3 — Ícone olho em todos os campos de senha
FR-V31-BRAND-001: Epic 4 — Bug brandName não reflete no header
FR-V31-BRAND-002: Epic 4 — Upload de imagem com tooltip de dimensões (substitui URL)
FR-V31-BRAND-003: Epic 4 — Color pickers funcionais para primária/secundária
FR-V31-BRAND-004: Epic 4 — Toggle Dark/Light mode persistido
FR-V31-I18N-001: Epic 5 — Infraestrutura next-intl com PT-BR default
FR-V31-I18N-002: Epic 5 — Seletor de idioma (bandeira) com PT-BR/EN/ES
FR-V31-I18N-003: Epic 5 — Revisão geral de ortografia/acentuação PT-BR
FR-V31-I18N-004: Epic 5 — Renomear "Intelligence Dashboard" → "Dashboard Preditivo"
FR-V31-DASH-001: Epic 6 — Bug filtro do Dashboard inativo
FR-V31-DASH-002: Epic 6 — Filtros avançados (Período, Posto, Função, Concomitantes)
FR-V31-EMP-001: Epic 6 — Cadastro individual 1-a-1 de colaborador
FR-V31-EMP-002: Epic 6 — Filtros adicionais na lista de colaboradores
FR-V31-VAC-001: Epic 6 — Bug modal bulk create no rodapé (centralizar/scroll)
FR-V31-VAC-002: Epic 6 — Autocomplete dinâmico no buscar colaborador
FR-V31-COV-001: Epic 7 — Cadastro 1-a-1 de cobertura
FR-V31-COV-002: Epic 7 — Flag "Ferista Efetivo vs Intermitente" no formulário individual
FR-V31-UX-001: Epic 8 — Tooltips dinâmicos do Oráculo apontando elementos reais

## Epic List

### Epic 1: Compliance CLT — Bloqueio Inteligente de Datas 🚨 P0
O VacationEngine impede o início de férias em domingos, feriados (nacionais e estaduais resolvidos por UF do tenant) e véspera de feriado, com mensagens específicas em PT-BR conforme CLT Art. 134. O Tenant Admin gerencia overrides manuais (pontos facultativos da empresa, feriados que a operação opera) numa nova tela `/settings/holidays`. Backend ganha model `TenantHoliday` e serviço `HolidayResolver` híbrido (lib `date-holidays` + overrides).
**FRs covered:** FR-V31-CLT-001, FR-V31-CLT-002, FR-V31-CLT-003, FR-V31-CLT-004
**Bloco sugerido:** 1 (Fundação — P0, toca migration + VacationEngine)

### Epic 2: Credenciais Globais Centralizadas (Super Admin)
O Super Admin gerencia todas as credenciais de integração (SMTP e Evolution/WhatsApp) em uma única seção "Credenciais Globais" com botões de teste de conexão real (envio de e-mail/mensagem de teste). Modais de salvamento se comportam corretamente (fechamento automático após success + botão X sempre visível). O painel do Tenant Admin não exibe mais essas configurações globais — opcionalmente exibe seletor "global vs própria" se o sistema mantiver suporte a credenciais por tenant.
**FRs covered:** FR-V31-CRED-001, FR-V31-CRED-002, FR-V31-CRED-003, FR-V31-CRED-004, FR-V31-CRED-005
**Bloco sugerido:** 2 (Limpeza arquitetural)

### Epic 3: Sessão Visível, Logout Acessível e Senha Segura
O usuário sempre sabe quanto tempo resta da sessão sensível (timer visual durante geração de Master Key), encontra logout em 1 clique no canto inferior esquerdo da sidebar, e troca a senha com fluxo simples (Nova + Repetir, sem exigir senha atual por padrão) com ícone-olho de visibilidade em todos os campos. O Super Admin define por tenant se a Master Key é gerada automaticamente no setup ou manualmente sob demanda do Tenant Admin.
**FRs covered:** FR-V31-SES-001, FR-V31-SES-002, FR-V31-SES-003, FR-V31-PWD-001, FR-V31-PWD-002
**Bloco sugerido:** 2 (Limpeza arquitetural — toca auth)

### Epic 4: White-label Completo — Marca, Logo e Dark Mode
O Tenant Admin reflete a identidade visual da empresa em toda a plataforma: nome exibido funcional no header (corrige bug atual), upload de logo com preview e validação de dimensões (substitui input de URL), color pickers para cor primária e secundária (estende FR-UI-010 do V3), e toggle Dark/Light mode visível no header com persistência por usuário. Cores de status (gap/covered/planned) permanecem semanticamente fixas em ambos os modos para preservar leitura operacional.
**FRs covered:** FR-V31-BRAND-001, FR-V31-BRAND-002, FR-V31-BRAND-003, FR-V31-BRAND-004
**Bloco sugerido:** 3 (Polimento visual)

### Epic 5: Internacionalização e Linguagem Polida (PT-BR/EN/ES)
A plataforma ganha infraestrutura i18n (`next-intl`) com bundles por idioma, default PT-BR, suporte inicial EN e ES. Seletor de idioma com ícones de bandeira no header próximo ao usuário, preferência persistida. Revisão geral de todas as strings para PT-BR oficial (acentuação, cedilha, ortografia), incluindo renomeação de termos em inglês ainda presentes (ex: "Intelligence Dashboard" → "Dashboard Preditivo"). Mensagens de erro, e-mails transacionais e tooltips entram no escopo.
**FRs covered:** FR-V31-I18N-001, FR-V31-I18N-002, FR-V31-I18N-003, FR-V31-I18N-004
**Blocos sugeridos:** infraestrutura (FR-V31-I18N-001) entra no Bloco 1 (cedo, fica caro depois); seletor + tradução completa + renomeações (FR-V31-I18N-002/003/004) entram no Bloco 3 (Polimento visual)

### Epic 6: Filtros, Buscas e Cadastros Operacionais
O RH filtra o Dashboard por período custom + posto + função + férias concomitantes (substitui chips inativos atuais), cadastra colaboradores individualmente em formulário 1-a-1 (complementar à importação CSV/XLSX), aplica filtros avançados na lista de colaboradores, e o modal de cadastro em massa de férias se comporta corretamente (centralizado + scroll interno) com autocomplete dinâmico no campo de busca de colaborador.
**FRs covered:** FR-V31-DASH-001, FR-V31-DASH-002, FR-V31-EMP-001, FR-V31-EMP-002, FR-V31-VAC-001, FR-V31-VAC-002
**Bloco sugerido:** 4 (Features novas e correções)

### Epic 7: Cobertura Individual com Tipo de Ferista
O RH cadastra coberturas individualmente (formulário 1-a-1) quando preferir o caminho manual ao bulk/automático, definindo no momento do cadastro se o substituto é Ferista Efetivo (GHS) ou Ferista Intermitente. Complementa fluxos automáticos do CoverageEngine (V3) sem substituí-los.
**FRs covered:** FR-V31-COV-001, FR-V31-COV-002
**Bloco sugerido:** 4 (Features novas)

### Epic 8: Onboarding Guiado do Oráculo (Tooltips Dinâmicos)
Os pop-ups de boas-vindas/onboarding do Oráculo IA deixam de ser overlays estáticos centralizados e passam a ser tooltips dinâmicos que apontam/destacam os elementos reais da interface descritos (padrão "guided tour" via `react-joyride` ou `shepherd.js`). Usuários novos aprendem o produto navegando, não lendo modais.
**FRs covered:** FR-V31-UX-001
**Bloco sugerido:** 4 (Features novas)

## Epic 1: Compliance CLT — Bloqueio Inteligente de Datas

O VacationEngine ganha validação de feriados; Tenant Admin gerencia overrides em `/settings/holidays`; UF do tenant resolve feriados estaduais.

### Story 1.1: Schema TenantHoliday e UF do Tenant (Migration)

As a **desenvolvedor**,
I want **persistir feriados manuais por tenant e a UF de cada tenant**,
So that **o HolidayResolver tenha as fontes de dados necessárias para validar datas**.

**Acceptance Criteria:**

**Given** o schema Prisma atual sem suporte a feriados
**When** a migration `add_tenant_holidays` é aplicada
**Then** o model `Tenant` ganha campo `uf String?` (sigla UF brasileira, opcional)
**And** o model `TenantHoliday { id, tenantId, date (Date), name (String), source (enum LIB|MANUAL), action (enum ADD|REMOVE), createdAt }` é criado
**And** existe índice único `(tenantId, date)` para evitar overrides duplicados

**Given** a migration aplicada via `npx prisma migrate dev`
**When** o startup do backend executa em ambiente Docker
**Then** a migration roda automaticamente e o `prisma generate` produz o client atualizado (NFR-OPS-002)

**Given** uma query buscando feriados de um tenant
**When** filtra por `tenantId + ano`
**Then** o índice `(tenantId, date)` garante P95 < 50ms (NFR-V31-CLT-001)

### Story 1.2: HolidayResolver Service (Lib + Overrides)

As a **VacationEngine e demais consumidores de calendário**,
I want **uma única fonte de verdade que retorne todos os feriados aplicáveis a um tenant em um período**,
So that **a validação CLT use regra unificada sem duplicação de lógica**.

**Acceptance Criteria:**

**Given** o serviço `modules/holidays/holiday-resolver.ts` instalado com lib `date-holidays@^3`
**When** chamado `resolver.getHolidays({ tenantId, year })`
**Then** retorna lista consolidada: feriados nacionais BR + estaduais (UF do tenant) + ADDs manuais − REMOVEs manuais
**And** cada item inclui `{ date, name, source: 'NATIONAL'|'STATE'|'MANUAL' }`

**Given** o tenant sem UF definida
**When** o resolver é invocado
**Then** retorna apenas feriados nacionais + overrides manuais (não infere UF)

**Given** chamadas repetidas ao resolver para o mesmo `(tenantId, year)`
**When** dentro da janela de cache em memória
**Then** segunda chamada não consulta banco nem lib — responde do cache (NFR-V31-CLT-001)

**Given** um CRUD de TenantHoliday alterando overrides
**When** a alteração é persistida
**Then** o cache do `(tenantId, year)` afetado é invalidado

**Given** os métodos auxiliares `isHoliday(date, tenantId)` e `isHolidayEve(date, tenantId)`
**When** invocados
**Then** retornam boolean baseado na lista resolvida

**Given** testes unitários do resolver
**When** executados
**Then** cobertura ≥80% incluindo: tenant sem UF, tenant com UF, ADD criando feriado novo, REMOVE eliminando feriado oficial, sobreposição ADD+REMOVE no mesmo dia (NFR-TEST-001)

### Story 1.3: HolidayValidator no VacationEngine

As a **Colaborador ou Gestor de RH**,
I want **que o sistema impeça a criação de férias com início inválido conforme CLT Art. 134**,
So that **nenhuma férias seja agendada em domingo, feriado ou véspera de feriado**.

**Acceptance Criteria:**

**Given** o `VacationEngine.validate()` recebe `startDate` que cai em domingo
**When** processa a validação
**Then** retorna erro `LEGAL_BLOCK_SUNDAY` com mensagem PT-BR "Início de férias não pode cair em domingo (CLT Art. 134)"

**Given** `startDate` que coincide com feriado nacional
**When** processa
**Then** retorna erro `LEGAL_BLOCK_HOLIDAY_NATIONAL` com nome do feriado na mensagem

**Given** `startDate` que coincide com feriado estadual da UF do tenant
**When** processa
**Then** retorna erro `LEGAL_BLOCK_HOLIDAY_STATE`

**Given** `startDate` que coincide com override manual ADD (ponto facultativo)
**When** processa
**Then** retorna erro `LEGAL_BLOCK_HOLIDAY_MANUAL`

**Given** `startDate` que cai em véspera de feriado (dia anterior a feriado válido)
**When** processa
**Then** retorna erro `LEGAL_BLOCK_HOLIDAY_EVE`

**Given** `POST /api/v1/vacations/requests` com data inválida
**When** o engine bloqueia
**Then** retorna HTTP 422 com `{ error: "Legal Block", code: "LEGAL_BLOCK_HOLIDAY_*", details: [mensagem específica] }`

**Given** testes do VacationEngine
**When** executados
**Then** cobertura ≥70% incluindo todos os 5 códigos de bloqueio acima (NFR-TEST-001)

### Story 1.4: CRUD de TenantHoliday (API)

As a **Tenant Admin**,
I want **gerenciar feriados manuais do meu tenant via API**,
So that **a interface de configuração tenha backend funcional**.

**Acceptance Criteria:**

**Given** um usuário autenticado com role ADMIN
**When** faz `POST /api/v1/tenant-holidays` com `{ date, name, action: "ADD"|"REMOVE" }`
**Then** o registro é criado com `source: MANUAL`, `tenantId` do JWT, retorna HTTP 201

**Given** uma data já tem override do mesmo tenant
**When** tenta criar outro
**Then** retorna HTTP 409 com mensagem clara

**Given** um usuário ADMIN
**When** faz `GET /api/v1/tenant-holidays?year=2026`
**Then** retorna lista consolidada do ano: feriados resolvidos (lib + overrides) com `{ date, name, source, isOverride }`

**Given** um usuário ADMIN
**When** faz `DELETE /api/v1/tenant-holidays/:id`
**Then** o override é removido, cache do resolver invalidado, retorna HTTP 204

**Given** um usuário sem role ADMIN
**When** acessa qualquer endpoint
**Then** retorna HTTP 403

**Given** queries de outro tenant
**When** acessam recursos
**Then** retornam HTTP 404 (NFR-SEC-001)

### Story 1.5: Tela /settings/holidays (Frontend)

As a **Tenant Admin**,
I want **uma tela visual para adicionar/remover feriados da minha empresa**,
So that **eu controle pontos facultativos e dias-da-empresa sem precisar de DBA**.

**Acceptance Criteria:**

**Given** o Admin acessa `/settings/holidays`
**When** a página carrega
**Then** exibe seletor de UF do tenant (se ainda não definida) e calendário/lista do ano corrente com feriados consolidados
**And** cada item mostra origem visual: badge "Nacional", "Estadual", "Manual", "Removido"

**Given** o Admin clica "Adicionar Feriado"
**When** o Sheet lateral abre
**Then** exibe campos: data (date picker), nome (texto), tipo (ADD = adicionar feriado / REMOVE = remover oficial)
**And** ao salvar, a lista atualiza sem refresh (TanStack Query invalidate)

**Given** o Admin clica "X" em um override manual
**When** confirma a remoção
**Then** o override é deletado e o feriado oficial reaparece (se era REMOVE) ou desaparece (se era ADD)

**Given** a UF do tenant ainda não está definida
**When** o Admin tenta usar feriados estaduais
**Then** banner topo solicita "Defina a UF da sua empresa para ativar feriados estaduais" com link para edição

**Given** a tela renderiza em compacta (220px sidebar)
**When** carregada
**Then** segue padrão visual V3 (row 28px, font 13px, badges semânticos)

## Epic 2: Credenciais Globais Centralizadas (Super Admin)

Super Admin gerencia SMTP+Evolution num só lugar com testes reais; Tenant Admin não vê mais credenciais globais.

### Story 2.1: Renomear Menu para "Credenciais Globais" e Agrupar SMTP+Evolution

As a **Super Admin**,
I want **uma seção única "Credenciais Globais" englobando SMTP e Evolution**,
So that **eu encontre todas as integrações no mesmo lugar conceitual**.

**Acceptance Criteria:**

**Given** o Super Admin acessa o painel
**When** a sidebar/menu renderiza
**Then** o item antes chamado "SMTP" agora é "Credenciais Globais"
**And** ao clicar, exibe sub-itens "SMTP (E-mail)" e "Evolution (WhatsApp)"

**Given** a estrutura de rotas frontend
**When** navegada
**Then** existem `/admin/credentials/smtp` e `/admin/credentials/whatsapp` (ou estrutura equivalente coesa)

**Given** screenshots/testes visuais existentes
**When** atualizados após o rename
**Then** nenhuma string "SMTP" isolada permanece como label de menu de topo

### Story 2.2: Botão "Testar Conexão SMTP" com Pop-up de E-mail Destino

As a **Super Admin**,
I want **disparar um e-mail de teste real direto do modal de SMTP**,
So that **eu valide a configuração antes de confiar nela em produção**.

**Acceptance Criteria:**

**Given** o modal de SMTP aberto com configuração salva ou em edição
**When** o Super Admin clica "Testar Conexão"
**Then** abre pop-up solicitando "E-mail de destino para teste" (input com validação de formato)

**Given** um e-mail válido digitado
**When** o Super Admin clica "Enviar Teste"
**Then** chama `POST /api/v1/admin/credentials/smtp/test` com `{ to }` e usa a config SMTP atual (salva ou em edição)

**Given** o backend recebe a requisição
**When** envia o e-mail de teste com subject "Teste SMTP — GestãoFérias" e corpo padrão
**Then** retorna `{ success: boolean, message: string, durationMs: number }`

**Given** envio bem-sucedido
**When** o frontend recebe a resposta
**Then** exibe toast verde "E-mail enviado com sucesso para {to} em {durationMs}ms"

**Given** erro de envio (auth, conexão, etc.)
**When** o frontend recebe a resposta
**Then** exibe alerta no pop-up com a causa específica retornada (ex: "Falha de autenticação SMTP")

**Given** as credenciais SMTP no payload
**When** logadas no servidor
**Then** apenas username é logado; senha permanece mascarada (NFR-SEC-002)

### Story 2.3: Botão "Testar Conexão" Evolution (WhatsApp)

As a **Super Admin**,
I want **disparar uma mensagem de teste WhatsApp real do modal Evolution**,
So that **eu valide a integração de mensageria antes de confiar nela**.

**Acceptance Criteria:**

**Given** o modal Evolution aberto com configuração salva ou em edição
**When** o Super Admin clica "Testar Conexão"
**Then** abre pop-up solicitando "Número de telefone destino" (input com formato internacional, ex: +5561999999999)

**Given** um número válido digitado
**When** clica "Enviar Teste"
**Then** chama `POST /api/v1/admin/credentials/whatsapp/test` com `{ to }` usando a config Evolution atual

**Given** o backend recebe a requisição
**When** envia mensagem de teste "Teste Evolution — GestãoFérias ✅"
**Then** retorna `{ success: boolean, message: string, evolutionResponseStatus: number }`

**Given** envio bem-sucedido vs erro
**When** o frontend recebe a resposta
**Then** exibe toast/alerta análogo ao fluxo SMTP (Story 2.2)

### Story 2.4: Modais de Credenciais Fecham Automaticamente + Botão X Visível

As a **Super Admin**,
I want **que modais de SMTP/Evolution se fechem após o save com sucesso e tenham botão X sempre visível**,
So that **eu não fique preso na tela achando que travou**.

**Acceptance Criteria:**

**Given** o modal SMTP ou Evolution aberto
**When** o Super Admin clica "Salvar" e o backend retorna 200
**Then** o modal fecha automaticamente
**And** toast de sucesso aparece confirmando "Configuração salva"

**Given** qualquer modal do sistema (auditoria geral)
**When** renderizado
**Then** botão "X" no canto superior direito está sempre visível e funcional
**And** tecla ESC fecha o modal
**And** click fora do modal fecha (a menos que tenha mudanças não salvas — nesse caso pede confirmação)

**Given** mudanças não salvas no formulário
**When** o usuário tenta fechar (X, ESC ou click-outside)
**Then** Dialog confirma "Descartar alterações?"

### Story 2.5: Remover SMTP/Evolution do Painel do Tenant Admin

As a **Tenant Admin**,
I want **não ver mais campos de configuração SMTP/Evolution no meu painel**,
So that **a interface fique focada no que está sob meu controle**.

**Acceptance Criteria:**

**Given** o Tenant Admin acessa `/settings`
**When** a página carrega
**Then** as seções "SMTP" e "Evolution/WhatsApp" não aparecem mais

**Given** os endpoints `PATCH /api/v1/tenants/me/smtp` e equivalentes Evolution
**When** chamados por usuário não-Super-Admin
**Then** retornam HTTP 403 ou 404 (rota removida)

**Given** o schema do `Tenant`
**When** auditado
**Then** os campos `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `evolutionApiKey` etc. são removidos via migration (já que não há legado em prod) ou marcados como deprecated com plano de remoção

**Given** o sistema envia e-mails/mensagens
**When** processa eventos
**Then** usa exclusivamente as credenciais globais configuradas no Super Admin

## Epic 3: Sessão Visível, Logout Acessível e Senha Segura

Usuário vê tempo restante de sessão, faz logout em 1 clique, troca senha sem fricção.

### Story 3.1: Componente <SessionCountdown> + Endpoint /me/session-info

As a **Super Admin gerando Master Key**,
I want **ver um timer visual indicando quanto tempo resta da minha sessão sensível**,
So that **eu não seja surpreendido com "sessão expirada" no meio da operação**.

**Acceptance Criteria:**

**Given** um endpoint novo `GET /api/v1/auth/session-info`
**When** chamado por usuário autenticado
**Then** retorna `{ expiresAt: ISO8601, secondsRemaining: number, type: "ACCESS"|"SENSITIVE" }`

**Given** o componente `<SessionCountdown />` no frontend
**When** renderizado em uma tela sensível (ex: geração de Master Key)
**Then** exibe contador discreto no topo do card (formato `mm:ss`) atualizado a cada segundo client-side
**And** muda cor para amarelo aos 60s restantes e vermelho aos 15s

**Given** o timer chega a zero
**When** o usuário ainda está na tela
**Then** exibe alerta "Sessão expirada — refaça login para continuar" e desabilita ações sensíveis

**Given** o timer client-side
**When** comparado ao backend
**Then** o backend continua sendo a fonte de verdade — o timer é apenas indicador visual (NFR-V31-SEC-001)

### Story 3.2: Botão "Encerrar Sessão" no Canto Inferior da Sidebar

As a **qualquer usuário autenticado**,
I want **um botão claro de logout no canto inferior esquerdo, junto ao meu nome**,
So that **eu saia do sistema em 1 clique sem caçar em menus**.

**Acceptance Criteria:**

**Given** a sidebar de qualquer painel (Super Admin, Tenant Admin, Colaborador)
**When** renderizada
**Then** no rodapé exibe avatar + nome do usuário e, ao lado, ícone de logout (ex: LogOut do lucide-react) com tooltip "Encerrar Sessão"

**Given** o usuário clica no ícone de logout
**When** confirma na Dialog "Tem certeza que deseja encerrar a sessão?"
**Then** chama `POST /api/v1/auth/logout`, limpa tokens locais e redireciona para `/login`

**Given** o estado da sidebar colapsada (mobile/tablet)
**When** renderizada
**Then** o botão de logout permanece acessível dentro do menu de usuário expandido

### Story 3.3: Tela "Alterar Senha" com Nova + Repetir + Ícone Olho

As a **qualquer usuário autenticado**,
I want **trocar minha senha com fluxo simples (Nova + Repetir) com visualização opcional do que digito**,
So that **eu não erre por digitação invisível**.

**Acceptance Criteria:**

**Given** o usuário acessa "Alterar Senha" no menu de perfil
**When** o formulário abre
**Then** exibe apenas campos "Nova Senha" e "Repetir Nova Senha" (campo "Senha Atual" não obrigatório por padrão)

**Given** ambos os campos preenchidos com valores idênticos respeitando regras de força
**When** o usuário clica "Salvar"
**Then** chama `PATCH /api/v1/me/password` com `{ newPassword }`, atualiza o hash bcrypt no backend, retorna 200

**Given** valores divergentes ou senha fraca (< 8 caracteres, ou regras configuradas)
**When** clica "Salvar"
**Then** validação inline mostra erro específico antes do submit

**Given** cada campo de senha
**When** renderizado
**Then** tem ícone "olho" (Eye/EyeOff do lucide-react) que alterna entre `type="password"` e `type="text"`

**Given** o save bem-sucedido
**When** processado
**Then** invalida sessões antigas (refresh tokens revogados), exige novo login no próximo refresh, exibe toast "Senha alterada"

### Story 3.4: Ícone Olho em Todos os Campos de Senha do Sistema

As a **qualquer usuário**,
I want **enxergar o que digito em qualquer campo de senha quando eu quiser**,
So that **eu evite digitação errada em login, reset, setup, etc.**.

**Acceptance Criteria:**

**Given** componente `<PasswordInput />` no design system
**When** criado/extraído
**Then** encapsula input + botão olho com aria-label "Mostrar/Ocultar senha"

**Given** todas as telas com campos de senha (audit completo: login, /forgot-password, /reset-password, /auth/setup, /me/password, modais de criação de usuário)
**When** atualizadas para usar `<PasswordInput />`
**Then** todas as ocorrências passam a ter o ícone olho consistente

**Given** acessibilidade
**When** o ícone é navegado por teclado
**Then** é focável (Tab), ativável (Enter/Space) e tem aria-pressed indicando estado atual

### Story 3.5: Configuração creationMode para Master Key (Backend + Super Admin UI)

As a **Super Admin**,
I want **definir por tenant se a Master Key será gerada automaticamente no setup ou manualmente sob demanda**,
So that **eu adapte o fluxo à criticidade de cada cliente**.

**Acceptance Criteria:**

**Given** o model `Tenant` ganha campo `masterKeyCreationMode: enum AUTOMATIC | MANUAL` (default `MANUAL` por segurança)
**When** a migration é aplicada
**Then** tenants existentes recebem o default e o campo passa a ser obrigatório em novos cadastros

**Given** o Super Admin acessa o card de um tenant
**When** edita configurações
**Then** vê seletor "Geração de Master Key: [Automática no setup] vs [Manual sob demanda]"

**Given** modo `AUTOMATIC` selecionado
**When** o setup do tenant é executado
**Then** a Master Key é gerada e exibida uma única vez no fluxo de onboarding

**Given** modo `MANUAL` selecionado
**When** o setup acontece
**Then** Master Key não é gerada; Tenant Admin pode gerar sob demanda em sua tela
**And** auditoria registra `masterKey.generated` em ambos os modos com `triggeredBy` e timestamp

## Epic 4: White-label Completo — Marca, Logo e Dark Mode

Tenant reflete identidade visual; usuário escolhe dark/light mode.

### Story 4.1: Bug Fix — brandName Reflete no Header

As a **Tenant Admin**,
I want **que o nome exibido configurado apareça no header**,
So that **a marca da minha empresa fique visível na plataforma**.

**Acceptance Criteria:**

**Given** o Tenant Admin define `brandName: "Green House"` em /settings
**When** salva
**Then** o header (canto superior esquerdo e/ou direito) atualiza para exibir "Green House" sem refresh

**Given** qualquer usuário do tenant faz login
**When** acessa qualquer página
**Then** o header exibe `brandName` do tenant (não mais o nome estático "GestãoFérias" ou placeholder)

**Given** `brandName` vazio ou nulo
**When** a página renderiza
**Then** fallback exibe "GestãoFérias"

**Given** o componente `<TenantBrandWrapper />` existente
**When** auditado
**Then** o bug de propagação de `brandName` é identificado e corrigido (sem criar novo wrapper)

### Story 4.2: Componente <ImageUpload /> e Upload de Logo

As a **Tenant Admin**,
I want **fazer upload da logo da empresa direto pela interface (não digitar URL)**,
So that **eu não dependa de hospedar imagem em outro lugar**.

**Acceptance Criteria:**

**Given** componente `<ImageUpload />` novo no design system
**When** instanciado
**Then** suporta drag-and-drop e click-to-select, exibe preview, valida tipo (PNG/JPG/SVG), tamanho (≤200KB) e dimensões (≤500x200px)

**Given** o Admin acessa /settings de marca
**When** vê o campo "Logo"
**Then** o input de URL é substituído pelo `<ImageUpload />` com ícone de info (i) ao lado: "PNG, 300x100px recomendado, máx 200KB" (NFR-V31-UPLOAD-001)

**Given** um arquivo válido selecionado
**When** o Admin clica "Salvar"
**Then** chama `POST /api/v1/tenants/me/logo` (multipart), backend valida e armazena em `public/tenant-assets/{tenantId}/logo.{ext}`, atualiza `Tenant.brandLogoUrl`

**Given** a logo foi atualizada
**When** o frontend recarrega o tenant
**Then** o header e sidebar exibem a nova logo

**Given** arquivo inválido
**When** o usuário tenta upload
**Then** mensagem específica é exibida no próprio componente (tipo errado, tamanho excedido, dimensão fora)

### Story 4.3: Color Pickers Funcionais para Cor Primária e Secundária

As a **Tenant Admin**,
I want **escolher cor primária e secundária da minha marca via color picker visual**,
So that **a plataforma adote minha identidade sem que eu precise saber hex codes**.

**Acceptance Criteria:**

**Given** /settings de marca
**When** carregada
**Then** exibe dois color pickers (`react-colorful` ou `<input type="color">`) para `brandPrimaryColor` e `brandSecondaryColor`
**And** preview ao vivo mostra como ficarão botões e elementos primários

**Given** o Admin escolhe uma cor com contraste < 4.5:1 contra branco/preto
**When** tenta salvar
**Then** aviso amarelo "Cor pode prejudicar leitura — contraste WCAG AA insuficiente" (não bloqueia, alerta)

**Given** as cores salvas
**When** qualquer usuário do tenant carrega a app
**Then** CSS custom properties `--primary`, `--primary-hover`, `--primary-light`, `--secondary` são injetadas no `:root` (estende FR-UI-010 do V3)

**Given** as cores de status (gap=#EF4444, covered=#22C55E etc.)
**When** verificadas após troca de tema
**Then** permanecem fixas (NFR-V31-A11Y-001)

### Story 4.4: Toggle Dark/Light Mode com Persistência

As a **qualquer usuário autenticado**,
I want **alternar entre tema claro e escuro com persistência da minha escolha**,
So that **eu use o sistema confortável com minhas preferências e contexto de uso**.

**Acceptance Criteria:**

**Given** componente `<DarkModeToggle />` integrado ao header
**When** renderizado
**Then** exibe ícone Sun/Moon (lucide-react) com 3 estados: light, dark, system

**Given** o `User` ganha campo `colorScheme: enum LIGHT|DARK|SYSTEM` (default SYSTEM)
**When** a migration é aplicada
**Then** o campo passa a persistir a preferência

**Given** o usuário clica no toggle
**When** muda o estado
**Then** chama `PATCH /api/v1/me/color-scheme` para persistir e aplica `class="dark"` ou ausência no `<html>` instantaneamente
**And** persiste também em localStorage para evitar flash em recargas

**Given** modo SYSTEM selecionado
**When** o sistema operacional muda preferência
**Then** o tema acompanha automaticamente via media query `prefers-color-scheme`

**Given** dark mode ativo
**When** as telas são renderizadas
**Then** todas as superfícies cumprem WCAG 2.1 AA contraste ≥4.5:1 (NFR-V31-A11Y-001)
**And** cores de status permanecem semanticamente fixas e legíveis

## Epic 5: Internacionalização e Linguagem Polida (PT-BR/EN/ES)

Infraestrutura i18n, seletor, tradução completa, revisão PT-BR.

### Story 5.1: Setup Infraestrutura next-intl com Bundle PT-BR Completo

As a **desenvolvedor**,
I want **infraestrutura i18n instalada com PT-BR como bundle default cobrindo 100% das strings atuais**,
So that **futuras traduções sejam apenas adicionar bundles, sem refactor**.

**Acceptance Criteria:**

**Given** `next-intl` instalado em [frontend-web/](frontend-web/)
**When** configurado conforme docs Next.js 16
**Then** existe `frontend-web/messages/pt-BR.json` com todas as strings extraídas das telas atuais
**And** componentes usam `useTranslations()` ou `<FormattedMessage />` em vez de strings hardcoded

**Given** o app inicia
**When** carregado
**Then** detecta locale do usuário (default `pt-BR`) e carrega o bundle correspondente

**Given** um novo desenvolvedor adicionando uma string
**When** segue o padrão
**Then** adiciona chave em `pt-BR.json` e usa `t('chave')` no componente — nunca string literal

**Given** code splitting de bundles
**When** carregados
**Then** bundle é carregado sob demanda, sem regredir LCP em mais de 200ms (NFR-V31-I18N-001)

### Story 5.2: Seletor de Idioma com Bandeiras + Persistência

As a **qualquer usuário**,
I want **escolher o idioma da interface através de um seletor visual com bandeiras**,
So that **eu use a plataforma em português, inglês ou espanhol conforme minha preferência**.

**Acceptance Criteria:**

**Given** o `User` ganha campo `preferredLocale: String @default("pt-BR")`
**When** migration aplicada
**Then** o campo persiste a escolha

**Given** o header da aplicação
**When** renderizado
**Then** exibe dropdown próximo ao nome do usuário com bandeiras SVG inline (não emoji): 🇧🇷 PT-BR, 🇺🇸 EN, 🇪🇸 ES

**Given** o usuário seleciona um idioma
**When** confirma
**Then** chama `PATCH /api/v1/me/locale`, atualiza UI sem refresh recarregando bundle

**Given** o usuário não autenticado
**When** acessa /login
**Then** o seletor está disponível e a escolha persiste em localStorage

### Story 5.3: Bundles EN e ES (Tradução Completa)

As a **usuário internacional**,
I want **a interface completa em inglês ou espanhol**,
So that **eu opere o sistema sem barreiras de idioma**.

**Acceptance Criteria:**

**Given** `frontend-web/messages/en.json` e `es.json`
**When** criados
**Then** contêm tradução completa de TODAS as chaves presentes em `pt-BR.json`

**Given** o usuário troca para EN ou ES
**When** navega
**Then** todas as telas (incluindo mensagens de erro, toasts, tooltips, e-mails transacionais opcionalmente) renderizam no idioma escolhido

**Given** chave faltante em algum bundle
**When** acessada
**Then** fallback para `pt-BR` (default) com warning no console (dev only)

**Given** datas, números e moedas
**When** renderizados
**Then** usam locale formatter apropriado (ex: R$ vs $ vs €)

### Story 5.4: Revisão Geral de Ortografia/Acentuação PT-BR + Renomeações

As a **falante de PT-BR**,
I want **toda a interface em português oficial sem erros de acentuação ou ortografia**,
So that **a plataforma transmita profissionalismo e respeito ao idioma**.

**Acceptance Criteria:**

**Given** todas as strings em `pt-BR.json`
**When** revisadas
**Then** zero ocorrências de palavras sem cedilha (ex: "açao" → "ação"), sem acento agudo ou circunflexo necessário, ou com erro ortográfico

**Given** o termo "Intelligence Dashboard"
**When** auditado em todas as telas
**Then** é renomeado para "Dashboard Preditivo" (ou alternativa final escolhida) e a chave em pt-BR.json reflete

**Given** outros termos em inglês remanescentes (ex: "Settings" como label, "Logout", "Dashboard" se aplicável)
**When** auditados
**Then** são traduzidos para PT-BR oficial mantendo equivalente em EN/ES

**Given** mensagens de erro CLT (Story 1.3)
**When** revisadas
**Then** estão em PT-BR formal correto, com referências de artigo CLT precisas

## Epic 6: Filtros, Buscas e Cadastros Operacionais

RH filtra, busca e cadastra com agilidade.

### Story 6.1: Bug Fix — Filtro do Dashboard Funcional

As a **Gestor de RH**,
I want **que os filtros visíveis no Dashboard (chips de trimestre/ano) realmente filtrem os dados**,
So that **a interface não me engane com botões mortos**.

**Acceptance Criteria:**

**Given** o Dashboard com chips de filtro (ex: "1T 2026", "2T 2026")
**When** o RH clica em um chip
**Then** os dados exibidos (KPIs, gráficos, listas) são filtrados pelo período correspondente
**And** o chip ativo recebe estilo visual distinto (background primário)

**Given** múltiplas chamadas de API ao mudar filtro
**When** disparadas
**Then** TanStack Query gerencia cache evitando requisições redundantes

**Given** nenhum dado no período filtrado
**When** retorna vazio
**Then** o Dashboard exibe estado vazio claro ("Nenhum dado neste período") em cada bloco afetado

### Story 6.2: Filtros Avançados no Dashboard

As a **Gestor de RH**,
I want **filtrar o Dashboard por período custom, posto, função e férias concomitantes**,
So that **eu analise cenários específicos sem exportar para planilha**.

**Acceptance Criteria:**

**Given** o Dashboard
**When** o RH clica "Filtros Avançados"
**Then** Sheet lateral abre com campos: Data Início, Data Fim, Posto (multi-select), Função (multi-select), Férias Concomitantes (toggle)

**Given** filtros aplicados
**When** clica "Aplicar"
**Then** todos os blocos do Dashboard refletem os filtros e a URL ganha query params (`?from=&to=&workplaces=&roles=&concomitant=`) para shareability

**Given** filtros ativos
**When** o RH clica "Limpar"
**Then** todos os filtros são resetados ao default

**Given** combinação de filtros aplicada
**When** processada no backend
**Then** queries respeitam índices compostos sem regredir P95 < 200ms (NFR-PERF-001)

### Story 6.3: Formulário de Cadastro Individual de Colaborador

As a **Gestor de RH**,
I want **cadastrar um colaborador 1-a-1 via formulário**,
So that **eu não precise montar planilha para adicionar uma única pessoa**.

**Acceptance Criteria:**

**Given** a tela `/employees`
**When** o RH clica "Novo Colaborador"
**Then** Sheet ou Dialog abre com formulário completo: nome, CPF, email, data admissão, tipo contratual (EFETIVO/INTERMITENTE), flag isFerista, posto/posição (opcional), telefone

**Given** dados válidos preenchidos
**When** clica "Cadastrar"
**Then** chama `POST /api/v1/employees`, valida unicidade de CPF/email no tenant, cria registro, retorna 201
**And** colaborador aparece na lista sem refresh

**Given** CPF ou email duplicado no tenant
**When** tenta cadastrar
**Then** validação inline mostra erro específico antes do submit (FR-SEC-003, FR-SEC-004 herdadas)

**Given** o RH ainda prefere importação CSV/XLSX
**When** acessa a tela
**Then** o botão "Importar" continua disponível ao lado de "Novo Colaborador"

### Story 6.4: Filtros Adicionais na Lista de Colaboradores

As a **Gestor de RH**,
I want **filtrar a lista de colaboradores por status, posto, tipo contratual e flag ferista**,
So that **eu encontre rapidamente subgrupos específicos**.

**Acceptance Criteria:**

**Given** a tela `/employees`
**When** carregada
**Then** exibe barra de filtros: Status (ativo/inativo/todos), Posto (multi-select), Tipo (EFETIVO/INTERMITENTE/todos), Ferista (sim/não/todos), busca por nome ou CPF

**Given** filtros aplicados
**When** processados
**Then** lista atualiza imediatamente (debounce 300ms na busca livre)

**Given** filtros ativos
**When** o RH navega para outra página e volta
**Then** filtros persistem via query string (URL shareable)

### Story 6.5: Bug Fix — Modal de Bulk Create Centralizado + Autocomplete

As a **Gestor de RH**,
I want **que o modal de cadastro em massa de férias se comporte bem visualmente e tenha autocomplete real no campo de colaborador**,
So that **eu cadastre planejamento anual sem fricção visual**.

**Acceptance Criteria:**

**Given** o modal de "Cadastro em Massa" de férias
**When** aberto em qualquer viewport
**Then** centraliza verticalmente e horizontalmente
**And** quando o conteúdo excede a altura, exibe scroll interno (não scroll da página)

**Given** o modal aberto em viewport ≥1024px
**When** renderizado
**Then** ocupa máximo 90% da altura e largura adequada à tabela editável

**Given** o campo "Buscar Colaborador" em cada linha
**When** o RH digita 2+ caracteres
**Then** lista de colaboradores do tenant filtra instantaneamente (debounce 300ms) usando cmdk
**And** seleção via teclado (↑/↓/Enter) ou mouse funciona

**Given** a Story 3.4 do V3 já especificava cmdk para esse campo
**When** auditado
**Then** se houver regressão, é corrigida; se nunca foi implementado, é implementado agora

## Epic 7: Cobertura Individual com Tipo de Ferista

Cadastro 1-a-1 com flag tipo Ferista.

### Story 7.1: Formulário Cadastro Individual de Cobertura com Flag de Tipo

As a **Gestor de RH**,
I want **cadastrar uma cobertura individualmente escolhendo se o substituto é Ferista Efetivo ou Intermitente**,
So that **eu controle manualmente coberturas que o motor automático não capturou ou que prefiro definir à mão**.

**Acceptance Criteria:**

**Given** a tela `/coverage`
**When** o RH clica "Nova Cobertura"
**Then** Sheet lateral abre com formulário: solicitação de férias (autocomplete), substituto (autocomplete entre feristas do tenant), posto/posição, datas, flag "Tipo: GHS Ferista (Efetivo) | Ferista Intermitente"

**Given** dados válidos
**When** clica "Cadastrar"
**Then** chama `POST /api/v1/coverages` com `type` definido pelo seletor, valida que substituto tem `isFerista: true` (FR-COV-004 do V3)

**Given** flag "Ferista Efetivo" selecionada
**When** o substituto escolhido tem `employeeType: INTERMITENTE`
**Then** validação inline alerta "Substituto é Intermitente — confirme o tipo da cobertura"

**Given** o fluxo bulk/automático existente
**When** comparado
**Then** ambos coexistem; cadastro individual é caminho manual complementar

## Epic 8: Onboarding Guiado do Oráculo (Tooltips Dinâmicos)

Tour guiado + tooltips contextuais persistentes.

### Story 8.1: Setup react-joyride e Migração do Tour do Oráculo

As a **novo usuário**,
I want **um tour interativo que aponta os elementos reais da interface ao invés de overlay estático centralizado**,
So that **eu aprenda navegando, não lendo modais que não conectam ao que vejo**.

**Acceptance Criteria:**

**Given** lib `react-joyride` (ou `shepherd.js`) instalada
**When** integrada ao frontend
**Then** existe wrapper `<GuidedTour steps={...} />` reutilizável

**Given** os textos atuais do tour do Oráculo (ex: "Bem-vindo ao centro de processamento...")
**When** migrados
**Then** cada texto vira um step apontando para o elemento real correspondente via seletor CSS/ref
**And** o overlay estático centralizado é removido

**Given** o usuário inicia o tour
**When** avança pelos steps
**Then** cada step destaca/ilumina o elemento alvo com tooltip ao lado, não cobrindo a tela inteira

**Given** o usuário fecha/skipa o tour
**When** processado
**Then** preferência é persistida em `User` (campo `tourCompleted: Json` por feature) para não repetir

### Story 8.2: Componente <ContextHint /> com Ícone "?" e Tooltip Persistente

As a **qualquer usuário**,
I want **ícones de informação (?) ao lado de elementos não-óbvios que mostrem dica contextual ao hover**,
So that **eu tire dúvidas sobre o produto sem precisar abrir tour ou doc externa**.

**Acceptance Criteria:**

**Given** componente `<ContextHint text="..." />` no design system
**When** instanciado ao lado de qualquer label/elemento
**Then** renderiza ícone "?" (HelpCircle do lucide-react) com tooltip não intrusivo (Tooltip do shadcn/ui) que aparece em hover/focus

**Given** as principais telas operacionais (Postos, Cobertura, Aprovações, Predict)
**When** auditadas pós-V3.1
**Then** `<ContextHint />` é adicionado em conceitos não-óbvios (ex: "O que é GHS Ferista?", "Como o Oráculo calcula o forecast?", "O que muda se eu marcar Concomitantes?")

**Given** a memória de UX do projeto ("info icons em tudo, tooltips não intrusivos")
**When** comparada
**Then** o padrão está alinhado e documentado para uso consistente em features futuras

---

## 📓 Apêndice — Aprendizados e Decisões Emergentes (Blocos 1 e 2)

Registro técnico do que foi descoberto ou ajustado DURANTE a implementação, para referência em futuras ondas.

### Bloco 1 — Aditivos além do escopo inicial

- **CLT Art. 134 §1º Fracionamento (Lei 13.467/2017):** Bruno solicitou durante a Story 1.5. Adicionado ao `VacationEngine.validateRequest` com 4 novos códigos (`LEGAL_BLOCK_FIRST_FRACTION_TOO_SHORT`, `_FRACTION_TOO_SHORT`, `_TOO_MANY_FRACTIONS`, `_TOTAL_EXCEEDS_PERIOD_DAYS`). Regras: 1ª fração ≥14d, demais ≥5d, máx 3 por aquisitivo, soma ≤ direito. Novo método `analyzeFractioning()` guia a UI.
- **Novo endpoint `GET /vacations/fractioning/:employeeId`:** retorna `{ period, analysis, existingFractions, holidaysAhead }` para alimentar o dashboard do colaborador (card com "você já usou X dias, mínimo da próxima Y") + lista de feriados próximos para consulta.
- **Integração visual no `/employee/dashboard`:** card de fracionamento + quick-pick dinâmico + warning inline de domingo/feriado/véspera + lista expansível dos próximos 8 feriados. Substituiu a validação Thu/Fri antiga (legalmente incorreta).
- **Setter de UF inline em `/settings/holidays`:** originalmente a tela só avisava "defina UF"; incorporamos o setter direto ali com CRUD.

### Bloco 2 — Aditivos além do escopo inicial

- **Pool multi-credencial:** o plano original previa SMTP/Evolution globais únicos no `SystemConfig`. Em validação, Bruno pediu capacidade de múltiplas credenciais com escopo (`ALL` vs `SPECIFIC`) + detecção de conflito de cobertura. Implementado como `EmailCredential` + `EmailCredentialTenant` (e gêmeo WhatsApp). Resolução em runtime com fallback para legado `SystemConfig`. Regra: cada tenant deve ser coberto por **no máximo 1 credencial ativa por tipo**.
- **Master Key capabilities extras:** definição manual (≥3 chars) + novo botão "Usar MasterKey — Acesso Emergencial" direto na UI (antes só era documentado via `POST /api/v1/masterkey` manual).
- **UI consolidada em `/admin/credentials`:** 3 abas (SMTP, WhatsApp, Master Key) substituindo 4 botões dispersos no header do `/admin`. Link no Sidebar SUPERADMIN.
- **SessionTopbar global:** evoluiu do plano original (countdown só em operações sensíveis) para **sempre visível no canto superior direito** + idle tracking com 9 tipos de eventos (mouse/keyboard/scroll/touch/focus) + aviso de 60s antes de expirar.
- **UserProfileModal via portal:** clique no nome na sidebar abre modal centralizado no viewport (createPortal) em vez de preso na sidebar.
- **PasswordInput com macaquinho 🙈/🐵:** convenção de produto do Bruno.

### Lições técnicas (críticas para futuras implementações)

1. **Fastify Autoload — regra silenciosa:** se uma pasta contém `index.ts`, arquivos irmãos (.ts na mesma pasta) são **ignorados**. Para adicionar rotas modulares, criar **subpasta com seu próprio `index.ts`**. Exemplo: `admin/credentials.ts` ❌ → `admin/credentials/index.ts` ✅.
2. **Timezone em tests Jest/Node:** `parseISO('2026-05-11T00:00:00Z')` em máquina Windows BRT (UTC-3) vira `2026-05-10 21:00` local → getDay() retorna domingo. Usar `T12:00:00Z` para neutralizar.
3. **Prisma 7:** `migrate dev --skip-seed` foi removido. Use `--name` simples; seeds só rodam se `prisma/seed.ts` existir.
4. **Segurança em campos de senha armazenada:** nunca popular o input com a senha (mesmo mascarada). Começar vazio com placeholder *"Deixe em branco para manter a atual"*. Backend aceita empty string / `••••••••` como "não alterar".
5. **DELETE com Content-Type:** Fastify rejeita `application/json` sem body. No api-client, só incluir Content-Type se `options.body !== undefined`.
6. **Idle session alignment:** frontend idle timer DEVE casar com JWT access token TTL (15min). Desalinhamento gera timer enganoso.
7. **Error payload preservation:** api-client lança `new Error(msg)` perdendo o `response.json()` completo. Preservar como `err.body` para UI extrair dados estruturados (ex: `conflicts[]`).
8. **401 em `/auth/me`:** fluxo esperado ao abrir app com token expirado. Não logar como `console.error` — só limpar tokens silenciosamente.
9. **Idle activity listeners:** usar `capture: true` + múltiplos eventos (mousemove, keydown, scroll, input, touch, focus) para não perder interação de formulários longos.

### Migrations aplicadas (em ordem cronológica)

1. `20260418022928_add_tenant_holidays` — `Tenant.uf CHAR(2)` + table `tenant_holidays`
2. `20260418034340_add_global_evo_and_master_key_mode` — `SystemConfig.evoApi*` + `Tenant.masterKeyCreationMode`
3. `20260418111054_add_credentials_pool` — `email_credentials`, `whatsapp_credentials` e junction tables

### Componentes novos criados

- [PasswordInput.tsx](../../frontend-web/src/components/PasswordInput.tsx)
- [UserProfileModal.tsx](../../frontend-web/src/components/UserProfileModal.tsx)
- [SessionCountdown.tsx](../../frontend-web/src/components/SessionCountdown.tsx)
- [SessionTopbar.tsx](../../frontend-web/src/components/SessionTopbar.tsx)
- [MasterKeyPanel.tsx](../../frontend-web/src/components/MasterKeyPanel.tsx)
- [session-activity.ts](../../frontend-web/src/lib/session-activity.ts)
- [holiday-resolver.ts](../../backend-api/src/modules/holidays/holiday-resolver.ts)
- [credential-resolver.ts](../../backend-api/src/modules/credentials/credential-resolver.ts)

