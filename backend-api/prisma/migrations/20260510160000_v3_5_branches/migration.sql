-- V3.5 Story 5.1: tabela Branch (filiais) e FK Employee.branchId
-- Migration aditiva — campo string Employee.branch permanece durante 1 release.

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "legal_name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imported_by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branches_tenant_name_unique_idx" ON "branches" ("tenant_id", lower("name"));

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employees" ADD COLUMN "branch_id" UUID;

CREATE INDEX "employees_branch_id_idx" ON "employees" ("branch_id");

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
