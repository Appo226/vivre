-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "ad_price_browse_fcfa_per_day" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "ad_price_hero_fcfa_per_day" INTEGER NOT NULL DEFAULT 3000;

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "advertiser_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "price_fcfa" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "rejection_reason" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "payment_reference_note" TEXT,
    "payment_submitted_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "impressions_count" INTEGER NOT NULL DEFAULT 0,
    "clicks_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_campaigns_status_placement_start_date_end_date_idx" ON "ad_campaigns"("status", "placement", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "ad_campaigns_advertiser_id_idx" ON "ad_campaigns"("advertiser_id");

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
