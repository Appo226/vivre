-- CreateTable
CREATE TABLE "event_staff" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "event_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_staff_event_id_phone_revoked_at_idx" ON "event_staff"("event_id", "phone", "revoked_at");

-- AddForeignKey
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
