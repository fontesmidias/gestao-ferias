-- V3.4 FASE H3: configuracao do cron de transicao de status de CoverageAssignment
ALTER TABLE "system_config"
  ADD COLUMN "coverage_cron_enabled"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "coverage_cron_interval_hours"  INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "coverage_cron_last_run_at"     TIMESTAMP(3),
  ADD COLUMN "coverage_cron_last_result"     JSONB;
