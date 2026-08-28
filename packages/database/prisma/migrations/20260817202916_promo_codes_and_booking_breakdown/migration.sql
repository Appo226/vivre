-- AlterTable
ALTER TABLE "event_bookings" ADD COLUMN     "buyer_fee_fcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discount_fcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promo_code_id" TEXT,
ADD COLUMN     "subtotal_fcfa" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "event_bookings_promo_code_id_idx" ON "event_bookings"("promo_code_id");

-- AddForeignKey
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
