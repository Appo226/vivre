-- CreateTable
CREATE TABLE "event_tickets" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "qr_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "price_fcfa_at_purchase" INTEGER NOT NULL,
    "checked_in_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "transferred_to_id" TEXT,
    "transferred_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_qr_code_key" ON "event_tickets"("qr_code");

-- CreateIndex
CREATE INDEX "event_tickets_booking_id_idx" ON "event_tickets"("booking_id");

-- CreateIndex
CREATE INDEX "event_tickets_event_id_status_idx" ON "event_tickets"("event_id", "status");

-- CreateIndex
CREATE INDEX "event_tickets_user_id_status_idx" ON "event_tickets"("user_id", "status");

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "event_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_transferred_to_id_fkey" FOREIGN KEY ("transferred_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
