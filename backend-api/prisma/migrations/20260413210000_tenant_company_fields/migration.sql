-- AlterTable: add company detail fields to tenants
ALTER TABLE "tenants" ADD COLUMN "email" TEXT;
ALTER TABLE "tenants" ADD COLUMN "phone" TEXT;
ALTER TABLE "tenants" ADD COLUMN "address" TEXT;
ALTER TABLE "tenants" ADD COLUMN "city" TEXT;
ALTER TABLE "tenants" ADD COLUMN "state" TEXT;
ALTER TABLE "tenants" ADD COLUMN "responsible" TEXT;
