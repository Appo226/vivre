-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_booking_id_ticket_number_key" ON "event_tickets"("booking_id", "ticket_number");
