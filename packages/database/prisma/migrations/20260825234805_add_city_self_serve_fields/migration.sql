-- AlterTable
ALTER TABLE "cities" ADD COLUMN "is_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "cities" ADD COLUMN "created_by_user_id" TEXT;
