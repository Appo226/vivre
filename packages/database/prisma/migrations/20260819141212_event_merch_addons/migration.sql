-- CreateTable
CREATE TABLE "event_merch_items" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_fcfa" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "variant_options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "event_merch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_booking_merch_items" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "merch_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "variant" TEXT,
    "price_fcfa_at_purchase" INTEGER NOT NULL,

    CONSTRAINT "event_booking_merch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_merch_items_event_id_is_active_idx" ON "event_merch_items"("event_id", "is_active");

-- CreateIndex
CREATE INDEX "event_booking_merch_items_booking_id_idx" ON "event_booking_merch_items"("booking_id");

-- CreateIndex
CREATE INDEX "event_booking_merch_items_merch_item_id_idx" ON "event_booking_merch_items"("merch_item_id");

-- AddForeignKey
ALTER TABLE "event_merch_items" ADD CONSTRAINT "event_merch_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_booking_merch_items" ADD CONSTRAINT "event_booking_merch_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "event_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_booking_merch_items" ADD CONSTRAINT "event_booking_merch_items_merch_item_id_fkey" FOREIGN KEY ("merch_item_id") REFERENCES "event_merch_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
