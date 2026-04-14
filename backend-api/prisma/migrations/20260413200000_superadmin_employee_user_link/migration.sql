-- AlterTable: make User.tenant_id nullable (for SUPERADMIN)
ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- AlterTable: add user_id FK to employees
ALTER TABLE "employees" ADD COLUMN "user_id" UUID;

-- CreateIndex: unique user_id on employees
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
