-- V3.5 Stories 5.2 + 5.3 + 5.4: tabelas Department, Shift, Union + FKs em Employee.
-- Migration aditiva. Strings legados (department, shift, unionName) permanecem.

-- Department
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "branch_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imported_by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_tenant_name_unique_idx" ON "departments" ("tenant_id", lower("name"));
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Shift
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT,
    "start_time" TEXT,
    "end_time" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imported_by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shifts_tenant_name_unique_idx" ON "shifts" ("tenant_id", lower("name"));
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Union
CREATE TABLE "unions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imported_by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "unions_tenant_name_unique_idx" ON "unions" ("tenant_id", lower("name"));
ALTER TABLE "unions" ADD CONSTRAINT "unions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Employee FKs
ALTER TABLE "employees"
  ADD COLUMN "department_id" UUID,
  ADD COLUMN "shift_id" UUID,
  ADD COLUMN "union_id" UUID;

CREATE INDEX "employees_department_id_idx" ON "employees" ("department_id");
CREATE INDEX "employees_shift_id_idx" ON "employees" ("shift_id");
CREATE INDEX "employees_union_id_idx" ON "employees" ("union_id");

ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
