# Handoff — Continuidade em nova conversa

**Data:** 2026-05-03 (épico v3-2-import-tirvu fechado)
**Status:** ✅ feature `v3-2-import-tirvu` 100% concluída e pushed para `origin/main` (`c94bbd9..69c0969`).
**Próximo:** escolher próximo épico do roadmap V3 ou cuidar de smoke tests / action items abertos.

---

## ✅ O que foi entregue na sessão 2026-05-03

13 stories + 8 review fixes:
- Frontend 4.1 (`1581450`) — UI Upload + Preview
- Frontend 4.2 (`a1cb91c`) — UI Apply + Confirm + Progress + Done
- Backend 5.2 (`7885273`) — Pino redact + bankData masked GET com AuditLog
- Backend 5.3 (`18c25dc`) — Suite pen-tests cross-tenant
- Review fixes 5.3 (`69c0969`) — 5 HIGH + 3 MEDIUM resolvidos, 23 cases na suite security

**Métricas finais:** backend 285/285 verde, frontend 72/72 verde, ~35 arquivos novos.

Detalhes em `_evo-output/implementation-artifacts/v3-2-import-tirvu/` e na memória `project_v32_import_tirvu.md`.

---

## 🎯 Opções de próximo épico

### Opção A — V3 Epic 1: Gestão de Postos e Alocações (caminho crítico V3 original)

Maior peso de negócio. 5 stories no `_evo-output/planning-artifacts/v3-postos-cobertura-ai/epics.md`:
- 1.1 CRUD de Postos de Trabalho (linhas 175+)
- 1.2 CRUD de Posições por Posto (203+)
- 1.3 Alocação de Colaboradores em Postos (227+)
- 1.4 Classificação de Tipos de Colaborador (`isFerista` boolean — ver `roadmap.md:11-34`)
- 1.5 Página /workplaces com Lista e Modal de CRUD (283+)

**Por quê primeiro:** habilita Epic 2 (Motor de Cobertura) e Epic 3 (Aprovação com Cobertura). É o coração da plataforma de cobertura/substituição.

**Atenção:** Story 1.4 redefine `EmployeeType` (3 → 2 valores) + adiciona `isFerista`. Migration que afeta dados existentes — checar se há dados em prod com `FERISTA` antes.

### Opção B — V3 Epic 4: AI Preditiva e Oráculo (alto valor diferencial)

5 stories (linhas 588+ do epics.md): PromptBuilder, riscos dobra CLT, forecast intermitentes, chat LLM, dashboard AI.

**Por quê:** Bruno priorizou AI como diferencial competitivo. Já existe rota `/predict` mocada de V3.0; aqui vira real.

**Pré-requisito:** PromptBuilder precisa de dados reais — funciona melhor depois de Epic 1+2 popularem postos/coberturas. Isolado dá pra fazer com mocks.

### Opção C — V3.1 Polish Wave Bloco 3+ (incrementais)

Blocos 1-2 já concluídos. Restam itens em `project_v31_polish_wave.md` (não li detalhes ainda — checar se precisar).

### Opção D — Tarefas pendentes do v3-2 antes de fechar tudo

- Smoke tests manuais (4.1 T11.5, 4.2 T9.5, 5.2 T6.3/T6.4)
- Backend `GET /imports/:jobId/file` (open question da 4.2)
- L1, L2 da Story 5.3
- OP1 (gerar prod `BANK_DATA_ENCRYPTION_KEY` + Docker Secret)

---

## 💡 Recomendação

**Opção A (Epic 1 V3 Postos)** é o caminho crítico do produto V3 original. Sem ele, nem Coverage Engine nem Aprovação com Cobertura saem do papel. AI (Opção B) ganha muito mais valor com dados reais de Epic 1+2 já populados.

Mas se Bruno quiser estabilidade antes de novo épico grande, **Opção D** (smoke + OP1) é defensiva e fecha tudo do v3-2 antes de novo trabalho.

---

## 🔁 Como retomar

```
Quero atacar o próximo épico. Opção [A|B|C|D].
Ler _evo-output/planning-artifacts/v3-postos-cobertura-ai/epics.md
e disparar /evo-create-story para a primeira story.
```

Ou se for opção D:
```
Vamos limpar pendências do v3-2: smoke tests + OP1 (gerar BANK_DATA_ENCRYPTION_KEY prod).
```

---

## 📚 Arquivos de referência

- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/prd.md` — PRD V3
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/epics.md` — todas as 7 epics V3 + stories
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/architecture.md` — arquitetura
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/ux-design-specification.md` — UX
- `_evo-output/planning-artifacts/v3-postos-cobertura-ai/roadmap.md` — backlog de melhorias
- `CLAUDE.md` — guia repo + status V3
- `docs/postman/v3-2-import-tirvu.postman_collection.json` — smoke tests v3-2

---

## 🧠 Memórias relevantes (auto-loaded)

- `project_v32_import_tirvu.md` — V3.2 fechado (atualizado nesta sessão)
- `project_v31_polish_wave.md` — Polish Wave V3.1 (consultar se Opção C)
- `feedback_engineering_practices.md` — commits frequentes, CI verde
- `feedback_technical_gotchas.md` — Fastify autoload, env vars CI, UUID validation
