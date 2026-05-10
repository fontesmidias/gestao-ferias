-- V3.4 Story 4.5: Anti-overlap constraint para CoverageAssignment ACTIVE/PLANNED
-- Garante no nivel do banco que o mesmo replacement_employee nao pode ter duas
-- coberturas com periodos sobrepostos no mesmo tenant. Hoje so havia validacao
-- aplicacional (race condition possivel sob carga concorrente).
--
-- Implementacao: EXCLUDE constraint usando gist + daterange. Requer btree_gist
-- (instalada se ainda nao existir).

CREATE EXTENSION IF NOT EXISTS "btree_gist";

ALTER TABLE "coverage_assignments"
  ADD CONSTRAINT "coverage_assignments_no_overlap_active"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "replacement_employee_id" WITH =,
    daterange("start_date"::date, "end_date"::date, '[]') WITH &&
  )
  WHERE (status IN ('PLANNED', 'ACTIVE'));
