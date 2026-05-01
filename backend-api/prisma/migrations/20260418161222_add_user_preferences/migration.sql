-- AlterTable
ALTER TABLE "users" ADD COLUMN     "color_scheme" TEXT NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "preferred_locale" TEXT NOT NULL DEFAULT 'pt-BR';
