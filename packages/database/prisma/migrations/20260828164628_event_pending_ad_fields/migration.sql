-- Optional ad (photo/video + days) chosen at event submission, activated as a real
-- AdCampaign only once the event itself is approved (see events/[id]/approve).
ALTER TABLE "events" ADD COLUMN "pending_ad_media_url" TEXT;
ALTER TABLE "events" ADD COLUMN "pending_ad_media_type" TEXT;
ALTER TABLE "events" ADD COLUMN "pending_ad_days" INTEGER;
