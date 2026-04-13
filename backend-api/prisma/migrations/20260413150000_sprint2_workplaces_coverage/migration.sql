-- AlterTable: add employeeType and workplaceId to employees
ALTER TABLE "employees" ADD COLUMN "employee_type" TEXT NOT NULL DEFAULT 'EFETIVO';
ALTER TABLE "employees" ADD COLUMN "workplace_id" UUID;

-- CreateTable: workplaces
CREATE TABLE "workplaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT,
    "client" TEXT,
    "min_staff" INTEGER NOT NULL DEFAULT 1,
    "tenant_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workplaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable: workplace_positions
CREATE TABLE "workplace_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workplace_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "shift_pattern" TEXT,
    "required_count" INTEGER NOT NULL DEFAULT 1,
    "tenant_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workplace_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: workplace_allocations
CREATE TABLE "workplace_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "workplace_position_id" UUID NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tenant_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workplace_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: coverage_assignments
CREATE TABLE "coverage_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vacation_request_id" UUID NOT NULL,
    "replacement_employee_id" UUID NOT NULL,
    "workplace_position_id" UUID NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "cost" DECIMAL(10,2),
    "tenant_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coverage_assignments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: employees.workplace_id -> workplaces.id
ALTER TABLE "employees" ADD CONSTRAINT "employees_workplace_id_fkey" FOREIGN KEY ("workplace_id") REFERENCES "workplaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: workplaces.tenant_id -> tenants.id
ALTER TABLE "workplaces" ADD CONSTRAINT "workplaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: workplace_positions
ALTER TABLE "workplace_positions" ADD CONSTRAINT "workplace_positions_workplace_id_fkey" FOREIGN KEY ("workplace_id") REFERENCES "workplaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workplace_positions" ADD CONSTRAINT "workplace_positions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: workplace_allocations
ALTER TABLE "workplace_allocations" ADD CONSTRAINT "workplace_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workplace_allocations" ADD CONSTRAINT "workplace_allocations_workplace_position_id_fkey" FOREIGN KEY ("workplace_position_id") REFERENCES "workplace_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workplace_allocations" ADD CONSTRAINT "workplace_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: coverage_assignments
ALTER TABLE "coverage_assignments" ADD CONSTRAINT "coverage_assignments_vacation_request_id_fkey" FOREIGN KEY ("vacation_request_id") REFERENCES "vacation_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coverage_assignments" ADD CONSTRAINT "coverage_assignments_replacement_employee_id_fkey" FOREIGN KEY ("replacement_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coverage_assignments" ADD CONSTRAINT "coverage_assignments_workplace_position_id_fkey" FOREIGN KEY ("workplace_position_id") REFERENCES "workplace_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coverage_assignments" ADD CONSTRAINT "coverage_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
