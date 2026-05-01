-- CreateTable
CREATE TABLE "email_credentials" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'SPECIFIC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "smtp_host" TEXT NOT NULL,
    "smtp_port" INTEGER NOT NULL,
    "smtp_user" TEXT NOT NULL,
    "smtp_pass" TEXT NOT NULL,
    "smtp_from" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_credential_tenants" (
    "credential_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_credential_tenants_pkey" PRIMARY KEY ("credential_id","tenant_id")
);

-- CreateTable
CREATE TABLE "whatsapp_credentials" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'SPECIFIC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "evo_api_url" TEXT NOT NULL,
    "evo_api_key" TEXT NOT NULL,
    "evo_instance_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_credential_tenants" (
    "credential_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_credential_tenants_pkey" PRIMARY KEY ("credential_id","tenant_id")
);

-- CreateIndex
CREATE INDEX "email_credential_tenants_tenant_id_idx" ON "email_credential_tenants"("tenant_id");

-- CreateIndex
CREATE INDEX "whatsapp_credential_tenants_tenant_id_idx" ON "whatsapp_credential_tenants"("tenant_id");

-- AddForeignKey
ALTER TABLE "email_credential_tenants" ADD CONSTRAINT "email_credential_tenants_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "email_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_credential_tenants" ADD CONSTRAINT "whatsapp_credential_tenants_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "whatsapp_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
