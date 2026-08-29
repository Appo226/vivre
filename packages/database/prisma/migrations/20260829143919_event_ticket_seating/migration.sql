-- AlterTable
ALTER TABLE "event_ticket_types" ADD COLUMN "is_seated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add ticket_type_id nullable first, backfill, then enforce NOT NULL
ALTER TABLE "event_tickets" ADD COLUMN "ticket_type_id" TEXT;
ALTER TABLE "event_tickets" ADD COLUMN "seat_number" INTEGER;

UPDATE "event_tickets" AS t
SET "ticket_type_id" = b."ticket_type_id"
FROM "event_bookings" AS b
WHERE t."booking_id" = b."id";

ALTER TABLE "event_tickets" ALTER COLUMN "ticket_type_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_ticket_type_id_seat_number_key" ON "event_tickets"("ticket_type_id", "seat_number");

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
