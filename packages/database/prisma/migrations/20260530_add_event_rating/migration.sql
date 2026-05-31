-- Add rating_avg to events table for review aggregation
ALTER TABLE "events" ADD COLUMN "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0;
