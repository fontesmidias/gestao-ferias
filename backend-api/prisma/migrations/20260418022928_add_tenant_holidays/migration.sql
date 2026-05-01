-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "uf" CHAR(2);

-- CreateTable
CREATE TABLE "tenant_holidays" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "action" TEXT NOT NULL DEFAULT 'ADD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_holidays_tenant_id_date_idx" ON "tenant_holidays"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_holidays_tenant_id_date_key" ON "tenant_holidays"("tenant_id", "date");

-- AddForeignKey
ALTER TABLE "tenant_holidays" ADD CONSTRAINT "tenant_holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
