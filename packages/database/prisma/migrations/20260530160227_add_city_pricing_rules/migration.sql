-- CreateTable
CREATE TABLE "city_pricing_rules" (
    "id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "months" INTEGER[],
    "weekdays" INTEGER[],
    "hour_start" INTEGER,
    "hour_end" INTEGER,
    "date_from" TIMESTAMP(3),
    "date_to" TIMESTAMP(3),
    "taxi_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "zemidjan_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "city_pricing_rules_city_id_is_active_idx" ON "city_pricing_rules"("city_id", "is_active");

-- AddForeignKey
ALTER TABLE "city_pricing_rules" ADD CONSTRAINT "city_pricing_rules_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
