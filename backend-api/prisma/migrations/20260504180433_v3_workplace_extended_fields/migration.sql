-- AlterTable
ALTER TABLE "workplaces" ADD COLUMN     "cep" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "contract_status" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "imported_at" TIMESTAMP(3),
ADD COLUMN     "imported_by" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "responsible" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT;

-- CreateIndex
CREATE INDEX "workplaces_tenant_cnpj_idx" ON "workplaces"("tenant_id", "cnpj");
