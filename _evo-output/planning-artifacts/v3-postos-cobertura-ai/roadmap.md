---
type: roadmap
feature: v3-postos-cobertura-ai
createdAt: '2026-04-15'
---

# Roadmap de Melhorias — V3 Postos & Cobertura AI

## Pendente

### 1. Correção do modelo de classificação de colaboradores (Ferista)

**Prioridade:** Alta (afeta modelo de dados e CoverageEngine)
**Status:** A implementar

**Problema:** O PRD original define `employeeType` com 3 valores: `EFETIVO`, `INTERMITENTE`, `FERISTA`. Na realidade do negócio da Green House, "ferista" não é um tipo contratual — é um papel. Um ferista pode ser efetivo (chamado internamente de "GHS Ferista") ou intermitente.

**Modelo correto:**
- `employeeType`: enum `EFETIVO` | `INTERMITENTE` (tipo contratual, 2 valores)
- `isFerista`: boolean (flag que indica elegibilidade para cobertura de postos)
- Combinações válidas:
  - `EFETIVO` + `isFerista: true` = **GHS Ferista** (ferista efetivo)
  - `INTERMITENTE` + `isFerista: true` = **Ferista Intermitente**
  - `EFETIVO` + `isFerista: false` = colaborador efetivo regular
  - `INTERMITENTE` + `isFerista: false` = intermitente regular

**Impacto:**
- **Prisma schema:** alterar enum `EmployeeType` de 3 para 2 valores, adicionar campo `isFerista` boolean no model Employee
- **Índice:** `(tenantId, employeeType)` + `(tenantId, isFerista)` ou composto `(tenantId, employeeType, isFerista)`
- **CoverageEngine:** sugestões filtram por `isFerista: true` em vez de `employeeType: FERISTA`
- **Frontend:** filtros e badges adaptados para mostrar tipo + flag ferista
- **Seed/dados:** migrar dados existentes que usem `FERISTA` como tipo

**Quando implementar:** Na Story 1.4 (Classificação de Tipos de Colaborador) do Epic 1, já com o modelo correto.
