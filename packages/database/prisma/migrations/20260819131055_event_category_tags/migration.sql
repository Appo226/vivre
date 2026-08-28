-- CreateTable
CREATE TABLE "event_category_tags" (
    "event_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "event_category_tags_pkey" PRIMARY KEY ("event_id","category_id")
);

-- CreateIndex
CREATE INDEX "event_category_tags_category_id_idx" ON "event_category_tags"("category_id");

-- AddForeignKey
ALTER TABLE "event_category_tags" ADD CONSTRAINT "event_category_tags_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_category_tags" ADD CONSTRAINT "event_category_tags_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
