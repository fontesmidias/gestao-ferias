-- Add global SMTP fields to system_config
ALTER TABLE "system_config" ADD COLUMN "smtp_host" TEXT;
ALTER TABLE "system_config" ADD COLUMN "smtp_port" INTEGER;
ALTER TABLE "system_config" ADD COLUMN "smtp_user" TEXT;
ALTER TABLE "system_config" ADD COLUMN "smtp_pass" TEXT;
ALTER TABLE "system_config" ADD COLUMN "smtp_from" TEXT;
