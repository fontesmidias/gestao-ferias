# Story 3.4: Documentação CLAUDE.md — princípio importadores escrevem no grafo

Status: review

## Story

As a **futuro contribuidor (humano ou AI agent)**,
I want **o `CLAUDE.md` do projeto explicitar que importadores devem escrever no grafo relacional (não em campos legados) e que `WorkplaceAllocationService.upsertFromImport()` é o único point-of-write para allocations**,
so that **futuros importers (CSV, Senior, TOTVS) não recriem o bug que V3.3 corrige (NFR-MAINT-3, Enforcement Guidelines)**.

## Acceptance Criteria

1. **AC-1 (seção V3.3 adicionada):** `CLAUDE.md` ganha seção "Regras V3.3 — Importadores e Reconciliação" após a seção "Regras criticas".

2. **AC-2 (princípios fundamentais):** Documenta:
   - Único point-of-write `WorkplaceAllocationService.upsertFromImport()` (Enforcement #1).
   - Helper `ensureWorkplaceFromImport` para resolver/criar Workplace + Position padrão.
   - Idempotência via UNIQUE partial index + check aplicacional.
   - Princípio "encerrar+criar, nunca DELETE" (CLT).
   - Endpoint reconcile + fila de revisão.
   - 6 AuditLog actions V3.3.
   - Cron LGPD 90d.

3. **AC-3 (referência aos artefatos):** Aponta para PRD/architecture/epics da V3.3 + diretório de stories.

4. **AC-4 (sem regressão lint/build):** Apenas markdown — sem impacto em código.

## Tasks / Subtasks

- [x] **Task 1 — Editar CLAUDE.md** — adicionada seção "Regras V3.3 — Importadores e Reconciliação" com 7 itens.
- [x] **Task 2 — Commit + relatório**

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Completion Notes List

**AC-1 ✅** Seção "Regras V3.3 — Importadores e Reconciliação" adicionada após "Regras criticas".

**AC-2 ✅** 7 itens cobrindo: ponto único de escrita, resolver helper, idempotência, encerrar+criar (CLT), reconciliação retroativa, AuditLog actions, LGPD purge.

**AC-3 ✅** Referência ao diretório `_evo-output/planning-artifacts/v3-3-reconciliacao-postos/` e implementation-artifacts.

**AC-4 ✅** Apenas markdown — sem build/lint impacto.

### File List

**Modified:**
- `CLAUDE.md` (seção nova)

**Created:**
- `_evo-output/implementation-artifacts/v3-3-reconciliacao-postos/3-4-claude-md-importer-rules.md`
