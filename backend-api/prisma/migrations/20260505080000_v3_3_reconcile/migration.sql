-- V3.3 — Reconciliação Postos×Funcionários (Story 1.1)
-- Migration aditiva: cria tabelas/enums novos + índices custom + UNIQUE partial + pg_trgm
-- Reversível via DROP TABLE/INDEX/EXTENSION (não destrói dados existentes).
-- Ver _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D4

-- CreateEnum
CREATE TYPE "ReconcileJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconcileQueueState" AS ENUM ('PENDING', 'DEFERRED', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "reconcile_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "operator_user_id" UUID NOT NULL,
    "status" "ReconcileJobStatus" NOT NULL DEFAULT 'PENDING',
    "parser_version" TEXT NOT NULL DEFAULT 'reconcile-v1',
    "total_employees" INTEGER,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "queued" INTEGER NOT NULL DEFAULT 0,
    "ignored" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "failure_reason" TEXT,
    "triggered_by" TEXT NOT NULL DEFAULT 'ADMIN',
    "batch_parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reconcile_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workplace_reconcile_queue" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reconcile_job_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "workplace_name_raw" TEXT NOT NULL,
    "state" "ReconcileQueueState" NOT NULL DEFAULT 'PENDING',
    "suggestions" JSONB,
    "resolved_to_workplace_id" UUID,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workplace_reconcile_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconcile_jobs_tenant_status_created_idx" ON "reconcile_jobs"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "workplace_reconcile_queue_tenant_state_created_idx" ON "workplace_reconcile_queue"("tenant_id", "state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "workplace_reconcile_queue_unique_active" ON "workplace_reconcile_queue"("tenant_id", "employee_id", "state");

-- AddForeignKey
ALTER TABLE "reconcile_jobs" ADD CONSTRAINT "reconcile_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconcile_jobs" ADD CONSTRAINT "reconcile_jobs_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reconcile_queue" ADD CONSTRAINT "workplace_reconcile_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reconcile_queue" ADD CONSTRAINT "workplace_reconcile_queue_reconcile_job_id_fkey" FOREIGN KEY ("reconcile_job_id") REFERENCES "reconcile_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reconcile_queue" ADD CONSTRAINT "workplace_reconcile_queue_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reconcile_queue" ADD CONSTRAINT "workplace_reconcile_queue_resolved_to_workplace_id_fkey" FOREIGN KEY ("resolved_to_workplace_id") REFERENCES "workplaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reconcile_queue" ADD CONSTRAINT "workplace_reconcile_queue_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SQL custom (não-gerado pelo Prisma) — D4, D5, D6 da architecture V3.3
-- ============================================================================

-- D5: Índice funcional para matching determinístico (case-insensitive via lower(name))
CREATE INDEX "workplaces_tenant_name_lower_idx"
  ON "workplaces" ("tenant_id", lower("name"));

-- D2: UNIQUE partial — apenas uma allocation ACTIVE por (employee, position)
-- Garante idempotência forte no nível do banco; histórico de allocations ENDED é preservado.
CREATE UNIQUE INDEX "workplace_allocations_unique_active_per_position"
  ON "workplace_allocations" ("employee_id", "workplace_position_id")
  WHERE "status" = 'ACTIVE';

-- D6: Extension pg_trgm para fuzzy matching (similarity operator % e função similarity())
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- D6: Índice GIN trigram para fuzzy matching escalável
CREATE INDEX "workplaces_tenant_name_trgm_idx"
  ON "workplaces" USING gin ("tenant_id", "name" gin_trgm_ops);
