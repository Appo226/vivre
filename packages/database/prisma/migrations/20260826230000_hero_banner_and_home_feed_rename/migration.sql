ALTER TABLE "platform_settings" RENAME COLUMN "ad_price_hero_fcfa_per_day" TO "ad_price_home_feed_fcfa_per_day";
ALTER TABLE "platform_settings" ADD COLUMN "hero_banner_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "hero_banner_media_type" TEXT NOT NULL DEFAULT 'image';
ALTER TABLE "platform_settings" ADD COLUMN "hero_banner_image_url" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "hero_banner_link_url" TEXT;
