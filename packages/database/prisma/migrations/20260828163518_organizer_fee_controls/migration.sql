-- Per-organizer fee discount (admin-set, 0-100%, covers listing fee + ad price + commission)
ALTER TABLE "users" ADD COLUMN "fee_discount_percent" INTEGER NOT NULL DEFAULT 0;

-- New event listing fee + media-type-based ad pricing
ALTER TABLE "platform_settings" ADD COLUMN "event_listing_fee_fcfa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_settings" ADD COLUMN "ad_price_photo_fcfa_per_day" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "platform_settings" ADD COLUMN "ad_price_video_fcfa_per_day" INTEGER NOT NULL DEFAULT 2000;
