-- Add isFerista boolean flag to employees
-- Ferista is NOT a contract type — it's a role flag.
-- Types are: EFETIVO, INTERMITENTE
-- isFerista: true means eligible for coverage suggestions

-- Step 1: Add the column with default false
ALTER TABLE "employees" ADD COLUMN "is_ferista" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Migrate existing FERISTA type to flag
UPDATE "employees" SET "is_ferista" = true WHERE "employee_type" = 'FERISTA';

-- Step 3: Convert FERISTA type to EFETIVO (GHS Ferista = efetivo + isFerista)
UPDATE "employees" SET "employee_type" = 'EFETIVO' WHERE "employee_type" = 'FERISTA';

-- Step 4: Add index for coverage queries
CREATE INDEX "employees_tenant_is_ferista_idx" ON "employees"("tenant_id", "is_ferista");
