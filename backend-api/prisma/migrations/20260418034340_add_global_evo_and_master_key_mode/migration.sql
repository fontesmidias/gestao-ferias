-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "evo_api_key" TEXT,
ADD COLUMN     "evo_api_url" TEXT,
ADD COLUMN     "evo_instance_name" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "master_key_creation_mode" TEXT NOT NULL DEFAULT 'MANUAL';
