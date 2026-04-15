-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_fkey";

-- DropIndex
DROP INDEX "employees_tenant_is_ferista_idx";

-- AlterTable
ALTER TABLE "coverage_assignments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "brand_logo_url" TEXT,
ADD COLUMN     "brand_name" TEXT,
ADD COLUMN     "brand_primary_color" TEXT,
ADD COLUMN     "brand_secondary_color" TEXT;

-- AlterTable
ALTER TABLE "workplace_allocations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workplace_positions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workplaces" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
