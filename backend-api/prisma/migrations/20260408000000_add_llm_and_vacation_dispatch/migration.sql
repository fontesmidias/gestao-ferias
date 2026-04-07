ALTER TABLE "tenants" ADD COLUMN "openai_key" TEXT;
ALTER TABLE "tenants" ADD COLUMN "anthropic_key" TEXT;
ALTER TABLE "tenants" ADD COLUMN "gemini_key" TEXT;

ALTER TABLE "vacation_requests" ADD COLUMN "dispatch_note" TEXT;
ALTER TABLE "vacation_requests" ADD COLUMN "original_start_date" TIMESTAMP(3);
ALTER TABLE "vacation_requests" ADD COLUMN "original_end_date" TIMESTAMP(3);
