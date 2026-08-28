-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "greeting_message" TEXT NOT NULL DEFAULT 'Contente de vous revoir sur VIVRE !';
ALTER TABLE "platform_settings" ADD COLUMN "greeting_message_enabled" BOOLEAN NOT NULL DEFAULT true;
