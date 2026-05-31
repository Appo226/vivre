-- AlterTable
ALTER TABLE "driver_payouts" ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "provider_transaction_id" TEXT,
ALTER COLUMN "status" SET DEFAULT 'processing';
