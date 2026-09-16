-- Migrates Refund.status and EventPayout.status from bare String to domain-specific Prisma
-- enums (RefundStatus, PayoutStatus) — deliberately NOT one universal status enum shared with
-- PaymentAttempt, per the approved Stage 1 architecture.
--
-- SAFETY: this uses an in-place ALTER COLUMN ... TYPE ... USING cast, not Prisma's default
-- DROP COLUMN + ADD COLUMN (which would silently discard existing data in that column, or in
-- this exact case would also drop and require rebuilding the indexes below). A USING cast
-- FAILS LOUDLY if any existing value doesn't map cleanly onto the new enum's labels, rather
-- than silently coercing or losing unexpected data.
--
-- Pre-flight check (2026-09-11, before this migration was written): both "refunds" and
-- "event_payouts" are empty (zero rows) in production, so this cast has nothing to convert.
-- Written as a safe cast anyway, not because data exists today, but because that's the correct
-- pattern regardless of table contents at apply time.

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('held', 'eligible', 'paid', 'on_hold_dispute');

-- AlterTable: refunds.status String -> RefundStatus (in place — existing indexes on this
-- column, refunds_payment_id_status_idx and refunds_status_refund_method_idx, are preserved
-- automatically by Postgres since the column is never dropped).
ALTER TABLE "refunds" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "refunds" ALTER COLUMN "status" TYPE "RefundStatus" USING "status"::"RefundStatus";
ALTER TABLE "refunds" ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable: event_payouts.status String -> PayoutStatus (in place — existing indexes
-- event_payouts_organizer_id_status_idx and event_payouts_status_eligible_at_idx preserved).
ALTER TABLE "event_payouts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "event_payouts" ALTER COLUMN "status" TYPE "PayoutStatus" USING "status"::"PayoutStatus";
ALTER TABLE "event_payouts" ALTER COLUMN "status" SET DEFAULT 'held';
