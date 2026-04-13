# Plano de Revisao Completa - Gestao de Ferias V3.0

**Data:** 12 de Abril de 2026
**Empresa:** Green House - Terceirizacao de Mao de Obra
**Objetivo:** Transformar o projeto em uma plataforma SaaS completa de gestao de ferias com planejamento de cobertura, substituicao inteligente e AI preditiva para tomada de decisao gerencial.
**Estrategia:** Desenvolvimento local-first, commits frequentes, validacao antes de deploy.

---

## Visao do Produto

O Gestao de Ferias NAO e apenas um sistema de marcar ferias. E uma **plataforma de gestao operacional** para empresas de terceirizacao que precisam:

1. **Planejar cobertura** — Quando um colaborador sai de ferias, o posto dele precisa de substituto
2. **Decidir tipo de cobertura** — Contratar intermitente (temporario) ou usar ferista efetivo (permanente rotativo)?
3. **Prever demanda** — Quantos intermitentes preciso em setembro? Para quais postos? Quanto custa?
4. **Responder perguntas da diretoria** — AI em linguagem natural: "Qual posto fica descoberto semana que vem?"

### Conceitos-Chave do Dominio
- **Posto**: Local fisico onde o colaborador trabalha (ex: INEP, Tribunal, Hospital)
- **Intermitente**: Trabalhador temporario contratado so para cobrir ferias especificas
- **Ferista Efetivo**: Funcionario permanente dedicado a cobrir ferias de forma rotativa/continua
- **Cobertura**: Plano de quem substitui quem, onde e quando
- **Gap de Cobertura**: Periodo em que um posto fica sem funcionario alocado

---

## Fluxo de Trabalho do Desenvolvimento

```
Dev Local (docker-compose up) -> Testar -> Commit + Push -> Validar -> Deploy VPS
```

Cada sprint gera:
- Commits com conventional commits (fix:, feat:, security:, refactor:)
- Relatorio de teste documentando o que foi validado
- CHANGELOG atualizado

---

## SPRINT 0: Fundacao Local (Pre-requisito)
**Objetivo:** Garantir que o ambiente local funciona do zero.

### Epic 0.1: Ambiente Local Funcional
| Story | Descricao | Criterio de Aceite |
|-------|-----------|-------------------|
| 0.1.1 | Configurar .env local | Arquivo .env criado com valores de dev |
| 0.1.2 | Subir docker-compose.yml | Postgres, Redis, Backend, Frontend rodando |
| 0.1.3 | Executar migrations Prisma | Banco criado com schema completo |
| 0.1.4 | Testar fluxo Setup | Criar tenant + admin via /auth/setup |
| 0.1.5 | Testar fluxo Login | Login com credenciais criadas no setup |
| 0.1.6 | Documentar estado inicial | Relatorio: o que funciona e o que nao funciona localmente |

**Entregavel:** Ambiente local rodando + relatorio base de funcionamento.

---

## SPRINT 1: Seguranca e Isolamento (CRITICO)
**Objetivo:** Fechar todas as brechas de seguranca antes de qualquer outra feature.

### Epic 1.1: Proteger Endpoints Expostos
| Story | Descricao | Risco Atual |
|-------|-----------|-------------|
| 1.1.1 | Adicionar auth em `GET /api/v1/tenants` | CRITICO: Expoe todos os tenants + senhas SMTP + API keys |
| 1.1.2 | Adicionar auth nas rotas de assinatura (`/auth/signature/*`) | CRITICO: Qualquer um assina documentos |
| 1.1.3 | Adicionar auth no WebSocket `/ws` | CRITICO: Espionagem de broadcasts |
| 1.1.4 | Remover ou proteger rota `GET /api/v1/tenants` (listar todos) | So admin do sistema deveria ver |

### Epic 1.2: Corrigir Isolamento Multi-tenant
| Story | Descricao | Risco Atual |
|-------|-----------|-------------|
| 1.2.1 | Trocar `findUnique` por `findFirst` com tenantId nas queries de vacations | Tenant isolation furado |
| 1.2.2 | Padronizar uso de middleware: sempre `requireAuth` (nunca so `authenticate`) | Inconsistencia permite bypass |
| 1.2.3 | Tornar Email unique por tenant (composite unique: email + tenantId) | Colisao entre empresas |
| 1.2.4 | Tornar CPF unique por tenant (composite unique: cpf + tenantId) | Colisao entre empresas |

### Epic 1.3: Fortalecer Autenticacao
| Story | Descricao |
|-------|-----------|
| 1.3.1 | Remover JWT_SECRET default hardcoded; forcar variavel de ambiente |
| 1.3.2 | Implementar refresh token (access token curto + refresh token longo) |
| 1.3.3 | Adicionar rate limiting nas rotas de auth (prevenir brute force) |

**Entregavel:** Backend seguro. Relatorio de seguranca com cada fix validado.

---

## SPRINT 2: Modelo de Dados - Postos, Cobertura e Substituicao
**Objetivo:** Criar a fundacao de dados para o diferencial do produto.

### Epic 2.1: Modelo de Postos (Workplace)
| Story | Descricao |
|-------|-----------|
| 2.1.1 | Criar model `Workplace` no Prisma: id, name, address, client (empresa contratante), minStaff (qtd minima), tenantId |
| 2.1.2 | Criar model `WorkplacePosition` (funcao no posto): id, workplaceId, role (ex: "Agente de Portaria"), shiftPattern, requiredCount |
| 2.1.3 | Migrar campo `workplace` (string livre) do Employee para FK do novo model Workplace |
| 2.1.4 | Criar CRUD de Workplaces: `POST/GET/PATCH/DELETE /api/v1/workplaces` |
| 2.1.5 | Criar CRUD de Positions: `POST/GET/PATCH/DELETE /api/v1/workplaces/:id/positions` |
| 2.1.6 | Criar UI de gestao de Postos (listagem, cadastro, edicao) |

### Epic 2.2: Tipos de Colaborador e Alocacao
| Story | Descricao |
|-------|-----------|
| 2.2.1 | Adicionar campo `employeeType` no model Employee: EFETIVO, INTERMITENTE, FERISTA |
| 2.2.2 | Criar model `WorkplaceAllocation`: employeeId, workplacePositionId, startDate, endDate (nullable = alocacao corrente), status |
| 2.2.3 | Endpoint para alocar/desalocar colaborador de um posto |
| 2.2.4 | UI para visualizar quem esta alocado em cada posto |

### Epic 2.3: Modelo de Cobertura (Coverage)
| Story | Descricao |
|-------|-----------|
| 2.3.1 | Criar model `CoverageAssignment`: id, vacationRequestId, replacementEmployeeId, workplacePositionId, startDate, endDate, type (INTERMITENTE/FERISTA), status (PLANNED/ACTIVE/COMPLETED), cost |
| 2.3.2 | Vincular cobertura ao fluxo de aprovacao de ferias (ao aprovar, sistema pergunta: quem cobre?) |
| 2.3.3 | Endpoint para criar/listar/atualizar coberturas: `/api/v1/coverages` |
| 2.3.4 | Endpoint para detectar gaps: `GET /api/v1/coverages/gaps?from=&to=` (postos sem cobertura) |
| 2.3.5 | Endpoint para sugerir cobertura: `GET /api/v1/coverages/suggestions?vacationRequestId=` (feristas disponiveis, custo de intermitente) |

### Epic 2.4: Migrations e Seed Data
| Story | Descricao |
|-------|-----------|
| 2.4.1 | Gerar e aplicar migrations Prisma para os novos models |
| 2.4.2 | Criar seed com dados de exemplo: 3 postos, 10 colaboradores alocados, 2 feristas |
| 2.4.3 | Testar integridade referencial completa |

**Entregavel:** Schema completo com postos, alocacoes e coberturas. Seed funcional para demo.

---

## SPRINT 3: Backend Funcional Completo
**Objetivo:** Garantir que TODA rota do backend funciona de verdade.

### Epic 3.1: Corrigir Rotas Stub/Incompletas
| Story | Descricao | Estado Atual |
|-------|-----------|-------------|
| 3.1.1 | Implementar `POST /vacations/requests` (criar solicitacao real) | Stub |
| 3.1.2 | Implementar `PATCH /vacations/requests/:id/approve` com fluxo de cobertura | Stub |
| 3.1.3 | Implementar calculo real de absences (buscar do banco) | Hardcode 0 |
| 3.1.4 | Criar endpoint `GET /employees/:id/balance` (saldo real) | Nao existe |

### Epic 3.2: Motor de Planejamento (CoverageEngine)
| Story | Descricao |
|-------|-----------|
| 3.2.1 | Criar `CoverageEngine` com logica: dado um periodo de ferias + posto, calcular opcoes de cobertura |
| 3.2.2 | Calcular custo real de intermitente vs reaproveitamento de ferista |
| 3.2.3 | Detectar encadeamento: se ferista cobre posto A em maio, pode cobrir posto B em junho? |
| 3.2.4 | Gerar timeline de cobertura por posto (quem esta cobrindo, quando, gaps) |

### Epic 3.3: Integracao AI/Oraculo com Contexto Real
| Story | Descricao |
|-------|-----------|
| 3.3.1 | Endpoint `GET /api/v1/predict/risks` — riscos reais com ROIEngine + dados de cobertura |
| 3.3.2 | Endpoint `GET /api/v1/predict/coverage-forecast` — previsao de demanda de intermitentes por mes |
| 3.3.3 | Endpoint `POST /api/v1/predict/ask` — pergunta em linguagem natural para a LLM com contexto do banco |
| 3.3.4 | Montar prompt da LLM com dados reais: ferias agendadas, postos, gaps, custos |
| 3.3.5 | Exemplos de perguntas suportadas: "Quantos intermitentes preciso em setembro?", "Qual posto fica descoberto?", "Quanto vai custar a cobertura do proximo trimestre?" |

### Epic 3.4: Webhooks Funcionais
| Story | Descricao |
|-------|-----------|
| 3.4.1 | CRUD de webhooks: `POST/GET/PATCH/DELETE /api/v1/webhooks` |
| 3.4.2 | Disparo nos eventos reais (aprovacao, rejeicao, cobertura atribuida) |
| 3.4.3 | Retry logic (3 tentativas com backoff) |
| 3.4.4 | Endpoint de teste: `POST /api/v1/webhooks/:id/test` |

### Epic 3.5: Notificacoes e Audit
| Story | Descricao |
|-------|-----------|
| 3.5.1 | Implementar envio real de email via SMTP do tenant |
| 3.5.2 | Audit log em todas as acoes criticas |
| 3.5.3 | Endpoint `GET /api/v1/audit-logs` |

**Entregavel:** Backend 100% funcional. Relatorio de testes de cada endpoint.

---

## SPRINT 4: Frontend Funcional Completo
**Objetivo:** Conectar toda a UI ao backend real + novas telas de cobertura.

### Epic 4.1: Gestao de Postos (Nova Pagina)
| Story | Descricao |
|-------|-----------|
| 4.1.1 | Pagina `/workplaces` — listagem de postos com cliente, endereco, capacidade |
| 4.1.2 | Modal de cadastro/edicao de posto |
| 4.1.3 | Visualizacao de quem esta alocado em cada posto |
| 4.1.4 | Indicador visual de postos com gap de cobertura (alerta vermelho) |

### Epic 4.2: Painel de Cobertura (Nova Pagina)
| Story | Descricao |
|-------|-----------|
| 4.2.1 | Pagina `/coverage` — timeline visual de cobertura por posto (estilo Gantt simplificado) |
| 4.2.2 | Cards de gap: postos sem cobertura no periodo selecionado |
| 4.2.3 | Acao: atribuir cobertura (selecionar ferista disponivel ou marcar "contratar intermitente") |
| 4.2.4 | Filtros: por posto, por mes, por status de cobertura |
| 4.2.5 | KPIs: total de gaps, custo estimado de cobertura, feristas disponiveis |

### Epic 4.3: Fluxo de Aprovacao com Cobertura
| Story | Descricao |
|-------|-----------|
| 4.3.1 | Ao aprovar ferias, modal pergunta: "Quem cobre este posto?" |
| 4.3.2 | Sugestoes automaticas de feristas disponiveis no periodo |
| 4.3.3 | Opcao de marcar "Sem cobertura (contratar intermitente depois)" |
| 4.3.4 | Indicador visual na lista de aprovacoes: ferias COM vs SEM cobertura definida |

### Epic 4.4: Oraculo AI Real
| Story | Descricao | Estado Atual |
|-------|-----------|-------------|
| 4.4.1 | Conectar ao endpoint real de riscos/cobertura | Mock |
| 4.4.2 | Chat em linguagem natural: campo de pergunta + resposta da LLM | Nao existe |
| 4.4.3 | Dashboard de previsao: grafico de demanda de intermitentes por mes | Mock |
| 4.4.4 | Exportar relatorio em PDF | Sem handler |

### Epic 4.5: PWA do Colaborador
| Story | Descricao | Estado Atual |
|-------|-----------|-------------|
| 4.5.1 | Buscar saldo real do backend | Hardcode 30 |
| 4.5.2 | Submit real de solicitacao de ferias | Sem handler |
| 4.5.3 | Historico de solicitacoes | Sem handler |
| 4.5.4 | Mostrar posto atual do colaborador | Nao existe |

### Epic 4.6: Limpeza e Integracao
| Story | Descricao |
|-------|-----------|
| 4.6.1 | Redirecionar pagina raiz (/) conforme auth |
| 4.6.2 | Integrar VacationDrawer ou remover dead code |
| 4.6.3 | Integrar WebSocket para notificacoes em tempo real |
| 4.6.4 | Remover /auth/callback (OAuth nao existe) |
| 4.6.5 | Atualizar Sidebar com novos links: Postos, Cobertura |
| 4.6.6 | Webhooks UI conectada ao backend real |

**Entregavel:** UI 100% funcional. Relatorio com screenshots de cada fluxo.

---

## SPRINT 5: Qualidade e Testes
**Objetivo:** Garantir que nada quebra com alteracoes futuras.

### Epic 5.1: Testes Backend
| Story | Descricao |
|-------|-----------|
| 5.1.1 | Testes de auth (login, JWT, refresh token, rate limiting) |
| 5.1.2 | Testes de tenant isolation (2 tenants, dados cruzados) |
| 5.1.3 | Testes de CoverageEngine (sugestoes, gaps, encadeamento) |
| 5.1.4 | Testes de rotas: vacations, employees, workplaces, coverages |
| 5.1.5 | Testes de AI/predict com mock de LLM |

### Epic 5.2: Testes Frontend
| Story | Descricao |
|-------|-----------|
| 5.2.1 | Testes do AuthContext |
| 5.2.2 | Testes das paginas principais |
| 5.2.3 | Testes do fluxo de cobertura |

### Epic 5.3: Validacao End-to-End
| Story | Descricao |
|-------|-----------|
| 5.3.1 | Fluxo completo: Setup -> Cadastrar postos -> Importar funcionarios -> Alocar em postos -> Solicitar ferias -> Aprovar com cobertura -> Verificar gap zero |
| 5.3.2 | Fluxo multi-tenant: 2 tenants, isolamento total |
| 5.3.3 | Fluxo PWA: Colaborador solicita ferias, RH aprova com cobertura |
| 5.3.4 | Fluxo AI: Perguntar "quantos intermitentes preciso em setembro?" e validar resposta |

**Entregavel:** Suite de testes. Relatorio de cobertura >70%.

---

## SPRINT 6: Producao e Deploy
**Objetivo:** Versao validada pronta para VPS.

### Epic 6.1: Corrigir Infra Swarm
| Story | Descricao |
|-------|-----------|
| 6.1.1 | Fix NEXT_PUBLIC_API_URL (build-time) |
| 6.1.2 | Documentar rede Traefik |
| 6.1.3 | Health checks nos containers |
| 6.1.4 | Retry logic no entrypoint.sh |
| 6.1.5 | .dockerignore para ambos projetos |

### Epic 6.2: CI/CD e Versionamento
| Story | Descricao |
|-------|-----------|
| 6.2.1 | Testes automaticos no GitHub Actions |
| 6.2.2 | Semantic versioning com tags |
| 6.2.3 | README atualizado com instrucoes completas |

### Epic 6.3: Deploy e Validacao Final
| Story | Descricao |
|-------|-----------|
| 6.3.1 | Deploy na VPS via Portainer |
| 6.3.2 | Fluxo E2E em producao |
| 6.3.3 | Relatorio final V3.0 com tudo documentado |

**Entregavel:** Produto em producao, funcional, seguro, com diferencial competitivo real.

---

## Resumo de Prioridades

```
SPRINT 0  [Fundacao]     ████░░░░░░  Ambiente local rodando
SPRINT 1  [Seguranca]    ██████████  CRITICO - brechas fechadas
SPRINT 2  [Dados]        ██████████  Postos + Cobertura + Substituicao (CORE DO PRODUTO)
SPRINT 3  [Backend]      ██████████  Tudo funcional no servidor
SPRINT 4  [Frontend]     ██████████  UI conectada + novas telas de cobertura/AI
SPRINT 5  [Qualidade]    ████████░░  Testes e validacao
SPRINT 6  [Producao]     ██████░░░░  Deploy final
```

## Metricas de Sucesso

| Metrica | Hoje | Meta V3.0 |
|---------|------|-----------|
| Endpoints funcionais | ~60% | 100% |
| Paginas conectadas ao backend | ~50% | 100% |
| Falhas de seguranca | 6 criticas | 0 |
| Cobertura de testes | ~15% | >70% |
| Features mock/fake | 4+ | 0 |
| Deploy local funcional | Nao testado | Validado |
| Gestao de postos/cobertura | 0% | 100% |
| AI com dados reais | 0% | Funcional |
| Chat linguagem natural | 0% | Funcional |

## Diferencial Competitivo (V3.0)

O que torna este produto unico no mercado:
1. **Gestao integrada ferias + cobertura** — Nao existe no mercado para terceirizadoras
2. **AI preditiva de demanda** — Responde "quantos intermitentes preciso?" com dados reais
3. **Chat em linguagem natural** — Diretoria faz perguntas sem precisar navegar dashboards
4. **Otimizacao financeira** — Sistema sugere ferista efetivo vs intermitente baseado em custo-beneficio
5. **Timeline de cobertura** — Visualizacao clara de quem cobre quem, onde e quando

---

**Proximo passo:** Iniciar Sprint 0 — subir o ambiente local e mapear o estado real.
