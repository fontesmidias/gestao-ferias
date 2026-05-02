-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PARSING', 'PREVIEW_READY', 'APPLYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "address" JSONB,
ADD COLUMN     "bank_data_enc" BYTEA,
ADD COLUMN     "bank_data_iv" BYTEA,
ADD COLUMN     "bank_data_tag" BYTEA,
ADD COLUMN     "geofencing_flags" JSONB,
ADD COLUMN     "inactive_pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "personal_data" JSONB,
ADD COLUMN     "termination_date" TIMESTAMP(3),
ADD COLUMN     "tirvu_id" TEXT,
ADD COLUMN     "union_name" TEXT;

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "operator_user_id" UUID NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "parser_version" TEXT NOT NULL DEFAULT 'tirvu-v1',
    "filename" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "total_rows" INTEGER,
    "rows_processed" INTEGER NOT NULL DEFAULT 0,
    "rows_created" INTEGER NOT NULL DEFAULT 0,
    "rows_updated" INTEGER NOT NULL DEFAULT 0,
    "rows_invalid" INTEGER NOT NULL DEFAULT 0,
    "rows_absent" INTEGER NOT NULL DEFAULT 0,
    "workplaces_created" INTEGER NOT NULL DEFAULT 0,
    "preview_summary" JSONB,
    "error_report_path" TEXT,
    "failure_reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsed_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_tenant_status_created_idx" ON "import_jobs"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "employees_tenant_inactive_pending_idx" ON "employees"("tenant_id", "inactive_pending");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_tirvu_unique_idx" ON "employees"("tenant_id", "tirvu_id");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

