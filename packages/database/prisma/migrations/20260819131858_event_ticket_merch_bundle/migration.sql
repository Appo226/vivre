-- AlterTable
ALTER TABLE "event_bookings" ADD COLUMN     "selected_variant" TEXT;

-- AlterTable
ALTER TABLE "event_ticket_types" ADD COLUMN     "included_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "variant_options" TEXT[] DEFAULT ARRAY[]::TEXT[];
