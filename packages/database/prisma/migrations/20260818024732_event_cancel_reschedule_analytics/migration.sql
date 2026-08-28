-- AlterTable
ALTER TABLE "events" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "original_starts_at" TIMESTAMP(3),
ADD COLUMN     "reschedule_reason" TEXT,
ADD COLUMN     "rescheduled_at" TIMESTAMP(3),
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;
