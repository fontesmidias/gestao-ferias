-- CreateIndex
CREATE INDEX "employees_tenant_type_idx" ON "employees"("tenant_id", "employee_type");

-- CreateIndex
CREATE INDEX "employees_tenant_ferista_idx" ON "employees"("tenant_id", "is_ferista");
