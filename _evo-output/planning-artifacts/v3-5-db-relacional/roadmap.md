# V3.5 — Refactor DB para esquema relacional pleno

**Status:** roadmap (pre-PRD)
**Data:** 2026-05-08
**Owner:** Bruno (fontesmidias) + EVO Master
**Pré-condição:** V3.4 estável em produção (FASES A-F implementadas).

## Contexto

Bruno levantou em 2026-05-08:

> "veja que o banco de dados precisa ser coerente e sempre que for viavel,
> uma tabela esta ligada a outra para nao termos a necessidade de ter colunas
> repetidas e sim tudo se conecte"

V3.0 escolheu modelo pragmático com vários campos `String` no `Employee`
(branch, department, workplace, shift, position, unionName) por velocidade
de desenvolvimento e por o sistema-fonte (Tirvu) entregar tudo como string.

V3.3 corrigiu **um** desses (`workplace` → `workplaceId` FK + `Workplace` table)
mas manteve o campo string como legado de compatibilidade.

V3.5 deve completar a normalização para os campos restantes onde fizer sentido.

## Mapa de campos — análise por campo

| Campo (string atual) | FK proposta | Tabela alvo | Custo | Prioridade |
|---|---|---|---|---|
| `Employee.workplace` | já tem `workplaceId` (FK V3.3) — string é legado | `Workplace` | Limpeza fácil (drop coluna após migração) | Alta |
| `Employee.branch` | virar FK para nova `Branch` | `Branch { id, name, cnpj?, addressData? }` | Migration média | Alta |
| `Employee.department` | virar FK para nova `Department` | `Department { id, name, branchId? }` | Migration média | Média |
| `Employee.shift` | virar FK para nova `Shift`/`Schedule` | `Shift { id, name, pattern?, startTime?, endTime? }` | Migration média + UX para gerenciar escalas | Média |
| `Employee.position` | **DEIXAR como string**. É "cargo geral" do colaborador, não atrelado a um posto. `WorkplacePosition.role` (que é por posto) cobre o caso relacional. Position genérico vira tag/string para reports. | — | Sem mudança | N/A |
| `Employee.unionName` | virar FK para nova `Union` | `Union { id, name, cnpj?, sindicalCategoria? }` | Migration menor | Baixa |

## Decisões pendentes (precisam de PM antes de detalhar V3.5)

1. **Backwards compat:** manter campo string + FK convivendo por X tempo,
   ou cortar string imediatamente?
   - **Sugestão EVO Master:** convivência por 1 release. `Employee.branch`
     vira opcional + `branchId` adicionado. Após validação em produção,
     próxima migration drop a coluna string.

2. **Importer Tirvu vs nova FK:**
   - Tirvu manda `branch="GREEN HOUSE SERVICOS DE..."` como string.
     Importer V3.5 precisa fazer ensureBranch (igual ensureWorkplace) ou
     o operador pré-cadastra `Branch` e o importer só faz match?
   - **Sugestão EVO Master:** auto-criar via importer com flag
     `importedBy='AUTO_TIRVU'`, igual ao Workplace V3.3.

3. **UX de gerenciamento das novas tabelas:**
   - Páginas dedicadas `/branches`, `/departments`, `/shifts`, `/unions`?
   - Ou modal embutido no `/employees` toolbar?
   - **Sugestão EVO Master:** páginas dedicadas (consistente com
     `/workplaces`).

4. **Migration retroativa:**
   - Como popular as FKs nos 1045 colaboradores existentes? Backfill
     automático lendo o campo string e criando registros únicos? Ou
     operador faz cleanup manual?
   - **Sugestão EVO Master:** backfill automático (similar ao
     `position-rematerialization` da V3.4 M3) com transparência via
     AuditLog.

5. **Multi-tenant isolation:**
   - Cada nova tabela (Branch, Department, etc) precisa de `tenantId`.
     Confirmar que Prisma extension cobre.
   - **Sugestão EVO Master:** confirmar com testes de cross-tenant
     antes de release (igual à pen-test da V3.3).

## Stories candidatas

### Epic V3.5.1 — Branches (filiais)
- 5.1.1: Schema `Branch` + migration aditiva.
- 5.1.2: CRUD admin de Branches em `/branches`.
- 5.1.3: Importer Tirvu auto-cria via `ensureBranchFromImport`.
- 5.1.4: Backfill `Employee.branchId` lendo `Employee.branch` legado.
- 5.1.5: UI de `/employees` consome `branch.name` via include.

### Epic V3.5.2 — Departments (CC/contratos)
- Mesma estrutura, com `departmentId` opcional referenciando `Branch`.

### Epic V3.5.3 — Shifts (jornadas)
- Mais complexo: `Shift` precisa modelar pattern (12x36, 8h, 6x1, etc).
- Pode evoluir para `Schedule` com horas de início/fim e dias da semana.
- Bem-vindo no frontend para wizard de cobertura (V3.4.1 — match por escala).

### Epic V3.5.4 — Unions (sindicatos)
- Mais simples. Pode ser feito junto com 5.1.

### Epic V3.5.5 — Cleanup legado
- Drop colunas string `Employee.{branch,department,shift,unionName}` após
  validação.

## Fluxo pós-MVP V3.4

Quando V3.4 estabilizar e Bruno operar a Green House com ela por 1-2 semanas:

1. **Retrospectiva V3.4** (`/evo-retrospective`)
2. **PRD V3.5** (`/evo-create-prd`) com decisões 1-5 acima validadas
3. **Architecture V3.5** (`/evo-create-architecture`)
4. **Stories detalhadas** (`/evo-create-epics-and-stories`)
5. **Execução story-by-story** (`/evo-dev-story`)

## Referências

- PRD V3.3: `_evo-output/planning-artifacts/v3-3-reconciliacao-postos/prd.md`
- Roadmap V3.4: `_evo-output/planning-artifacts/v3-4-admin-driven-vacations/roadmap.md`
- Diagnóstico Bruno (2026-05-08): pedido de DB coerente em chat
