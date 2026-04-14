-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "zapsign_token" TEXT;

-- AlterTable
ALTER TABLE "signatures" ADD COLUMN "zapsign_doc_token" TEXT;
ALTER TABLE "signatures" ADD COLUMN "zapsign_signer_token" TEXT;
ALTER TABLE "signatures" ADD COLUMN "sign_url" TEXT;
