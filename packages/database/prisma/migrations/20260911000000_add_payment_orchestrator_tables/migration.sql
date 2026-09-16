-- Stage 1 payment foundation (see PAYMENT_ARCHITECTURE_AUDIT.md + Stage 1 plan).
--
-- PaymentAttempt gives every payment collection attempt its own immutable row, fixing
-- /api/payments/initiate's prior behavior of overwriting the same Payment row on retry (attempt
-- history was silently lost). IdempotencyKey protects booking creation and payment initiation
-- against double-submission. AdCampaign gets a nullable payment_id so ad payments route through
-- the same Payment model as ticket/listing payments instead of their own ad-hoc fields.
--
-- Pre-flight check (2026-09-11, before this migration was written): payments, refunds, and
-- event_payouts tables are all empty (zero rows) in production. No backfill needed or possible.

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('initiated', 'pending', 'completed', 'failed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('cinetpay', 'manual_bridge');

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'initiated',
    "amount_fcfa" INTEGER NOT NULL,
    "provider_ref" TEXT,
    "client_idempotency_key" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "raw_provider_response" JSONB,
    "flagged_for_review_at" TIMESTAMP(3),
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "response_status" INTEGER,
    "response_body" JSONB,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_attempts_payment_id_status_idx" ON "payment_attempts"("payment_id", "status");

-- CreateIndex
CREATE INDEX "payment_attempts_provider_status_initiated_at_idx" ON "payment_attempts"("provider", "status", "initiated_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_scope_key_key" ON "idempotency_keys"("user_id", "scope", "key");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: ad_campaigns gains a nullable link to the unified Payment model
ALTER TABLE "ad_campaigns" ADD COLUMN "payment_id" TEXT;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: matches the default-deny convention from 20260901000000_enable_rls_all_tables. The app
-- never uses the Supabase Data API (all access is server-side Prisma over the BYPASSRLS role);
-- this only blocks PostgREST from ever touching these two new tables.
ALTER TABLE "public"."payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."idempotency_keys" ENABLE ROW LEVEL SECURITY;
