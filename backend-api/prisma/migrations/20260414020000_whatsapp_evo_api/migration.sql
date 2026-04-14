-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "evo_api_url" TEXT;
ALTER TABLE "tenants" ADD COLUMN "evo_api_key" TEXT;
ALTER TABLE "tenants" ADD COLUMN "evo_instance_name" TEXT;
ALTER TABLE "tenants" ADD COLUMN "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "phone" TEXT;
