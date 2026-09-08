-- CreateTable
CREATE TABLE "event_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_favorites_user_id_event_id_key" ON "event_favorites"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "event_favorites_user_id_idx" ON "event_favorites"("user_id");

-- AddForeignKey
ALTER TABLE "event_favorites" ADD CONSTRAINT "event_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_favorites" ADD CONSTRAINT "event_favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cohérent avec la politique de sécurité appliquée le 2026-09-01 (voir
-- 20260901000000_enable_rls_all_tables) : toute nouvelle table du schéma public a RLS
-- activé -- Prisma se connecte via le rôle postgres (BYPASSRLS), donc ceci ne bloque que
-- l'API Data auto-générée de Supabase, jamais l'application.
ALTER TABLE "event_favorites" ENABLE ROW LEVEL SECURITY;
