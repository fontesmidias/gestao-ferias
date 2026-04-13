-- DropIndex: remove global unique constraints
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "employees_cpf_key";

-- CreateIndex: composite unique (email + tenant_id) on users
CREATE UNIQUE INDEX "users_email_tenant_id_key" ON "users"("email", "tenant_id");

-- CreateIndex: composite unique (cpf + tenant_id) on employees
CREATE UNIQUE INDEX "employees_cpf_tenant_id_key" ON "employees"("cpf", "tenant_id");
