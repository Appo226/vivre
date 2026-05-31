-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "application_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "documents" JSONB,
ADD COLUMN     "payout_method" TEXT,
ADD COLUMN     "payout_phone" TEXT,
ADD COLUMN     "rejection_reason" TEXT;

-- CreateTable
CREATE TABLE "driver_payouts" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "amount_fcfa" INTEGER NOT NULL,
    "deliveries_count" INTEGER NOT NULL,
    "period_from" TIMESTAMP(3) NOT NULL,
    "period_to" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_payouts_driver_id_status_idx" ON "driver_payouts"("driver_id", "status");

-- CreateIndex
CREATE INDEX "driver_payouts_status_created_at_idx" ON "driver_payouts"("status", "created_at");

-- CreateIndex
CREATE INDEX "drivers_application_status_idx" ON "drivers"("application_status");

-- AddForeignKey
ALTER TABLE "driver_payouts" ADD CONSTRAINT "driver_payouts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
