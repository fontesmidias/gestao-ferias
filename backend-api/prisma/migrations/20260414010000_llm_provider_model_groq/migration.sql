-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "llm_provider" TEXT;
ALTER TABLE "tenants" ADD COLUMN "llm_model" TEXT;
ALTER TABLE "tenants" ADD COLUMN "groq_key" TEXT;
