-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "event_id" TEXT;

-- CreateTable
CREATE TABLE "organizer_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "id_document_url" TEXT,
    "id_document_type" TEXT,
    "id_document_holder_name" TEXT,
    "phone_call_confirmed_at" TIMESTAMP(3),
    "phone_call_notes" TEXT,
    "phone_call_by" TEXT,
    "payout_provider" TEXT,
    "payout_phone" TEXT,
    "payout_account_name" TEXT,
    "name_match_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "rejection_reason" TEXT,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "organizer_fee_percent" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
    "buyer_fee_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buyer_fee_flat_fcfa" INTEGER NOT NULL DEFAULT 0,
    "free_period_enabled" BOOLEAN NOT NULL DEFAULT false,
    "discounts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "payout_delay_new_organizer_days" INTEGER NOT NULL DEFAULT 7,
    "payout_delay_trusted_organizer_days" INTEGER NOT NULL DEFAULT 2,
    "trusted_organizer_event_threshold" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_payouts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "gross_amount_fcfa" INTEGER NOT NULL,
    "commission_fcfa" INTEGER NOT NULL,
    "net_amount_fcfa" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "eligible_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "paid_by" TEXT,
    "payout_reference" TEXT,
    "hold_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_verifications_user_id_key" ON "organizer_verifications"("user_id");

-- CreateIndex
CREATE INDEX "organizer_verifications_status_idx" ON "organizer_verifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "event_payouts_event_id_key" ON "event_payouts"("event_id");

-- CreateIndex
CREATE INDEX "event_payouts_organizer_id_status_idx" ON "event_payouts"("organizer_id", "status");

-- CreateIndex
CREATE INDEX "event_payouts_status_eligible_at_idx" ON "event_payouts"("status", "eligible_at");

-- CreateIndex
CREATE INDEX "promo_codes_event_id_idx" ON "promo_codes"("event_id");

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_verifications" ADD CONSTRAINT "organizer_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_payouts" ADD CONSTRAINT "event_payouts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_payouts" ADD CONSTRAINT "event_payouts_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
