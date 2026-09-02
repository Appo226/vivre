-- CreateTable
CREATE TABLE "ticket_transfers" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "recipient_id" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "ticket_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_transfers_token_key" ON "ticket_transfers"("token");

-- CreateIndex
CREATE INDEX "ticket_transfers_ticket_id_status_idx" ON "ticket_transfers"("ticket_id", "status");

-- CreateIndex
CREATE INDEX "ticket_transfers_token_idx" ON "ticket_transfers"("token");

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cohérent avec la politique de sécurité appliquée le 2026-09-01 : toute nouvelle table du
-- schéma public doit avoir RLS activé (voir 20260901000000_enable_rls_all_tables) — Prisma
-- se connecte via le rôle postgres (BYPASSRLS), donc ceci ne bloque que l'API Data
-- auto-générée de Supabase, jamais l'application.
ALTER TABLE "ticket_transfers" ENABLE ROW LEVEL SECURITY;
