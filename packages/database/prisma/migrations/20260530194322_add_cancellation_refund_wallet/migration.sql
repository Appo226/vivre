-- AlterTable
ALTER TABLE "event_bookings" ADD COLUMN     "transferred_at" TIMESTAMP(3),
ADD COLUMN     "transferred_to_id" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "refund_cutoff_hours" INTEGER,
ADD COLUMN     "refund_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "cancel_full_refund_h" INTEGER,
ADD COLUMN     "cancel_partial_h" INTEGER,
ADD COLUMN     "cancel_partial_pct" INTEGER,
ADD COLUMN     "cancel_policy" TEXT NOT NULL DEFAULT 'strict';

-- AlterTable
ALTER TABLE "property_bookings" ADD COLUMN     "cancellation_reason" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "booking_id" TEXT,
ADD COLUMN     "booking_type" TEXT,
ADD COLUMN     "refund_method" TEXT NOT NULL DEFAULT 'vivre_credit';

-- AlterTable
ALTER TABLE "routes" ADD COLUMN     "cancel_full_refund_h" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "cancel_partial_h" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "cancel_partial_pct" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "cancel_policy" TEXT NOT NULL DEFAULT 'moderate';

-- CreateTable
CREATE TABLE "vivre_wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance_fcfa" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vivre_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount_fcfa" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reference_id" TEXT,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vivre_wallets_user_id_key" ON "vivre_wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "refunds_status_refund_method_idx" ON "refunds"("status", "refund_method");

-- AddForeignKey
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_transferred_to_id_fkey" FOREIGN KEY ("transferred_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vivre_wallets" ADD CONSTRAINT "vivre_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "vivre_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
