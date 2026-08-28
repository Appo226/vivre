/*
  Warnings:

  - You are about to drop the column `phone` on the `otp_codes` table. All the data in the column will be lost.
  - Added the required column `email` to the `otp_codes` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "otp_codes_phone_code_purpose_idx";

-- AlterTable
ALTER TABLE "otp_codes" DROP COLUMN "phone",
ADD COLUMN     "email" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE INDEX "otp_codes_email_code_purpose_idx" ON "otp_codes"("email", "code", "purpose");
