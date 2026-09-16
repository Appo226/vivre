# VIVRE Payment Architecture Audit — PI-SPI Readiness

**Scope:** Read-only inventory of everything payment/checkout/order/ticket/organizer-balance/refund/payout/webhook-related in the VIVRE monorepo. No code was modified to produce this report.
**Audited:** `apps/web` (live Next.js app), `apps/api` (legacy, confirmed dormant), `packages/database`, `packages/types`, `packages/utils`.
**Date:** 2026-09-09.

---

## A. Executive summary

VIVRE today runs **one live payment path in production: a fully manual mobile-money bridge.** The buyer sends money directly to the organizer's own verified mobile-money account (outside the app), and the organizer or an admin clicks a button to confirm receipt, which issues the ticket. A complete, well-written **CinetPay aggregator integration exists in code** (Orange Money / Moov / Telecel via one API) but **has never been configured** — no `CINETPAY_API_KEY`/`CINETPAY_SITE_ID` exist in `.env.local` or in Vercel production. Every payment-configured check in the code (`cinetpayConfigured()`) is false today, everywhere.

The core ticketing money-flow (checkout → booking → payment → ticket issuance → refund → organizer payout) is **genuinely solid engineering**: row-level locks prevent overselling, ticket issuance is idempotent and transactional, the webhook re-verifies against the provider instead of trusting the payload, commission is snapshotted at creation time (not recomputed later), and organizer payouts use a real graduated-trust model — but every money movement past "record that a booking is paid" is **manual**. Nothing auto-transfers. An admin always clicks a button and pastes a reference number, whether it's a payout or a refund.

Three structural findings matter most for a PI-SPI integration:

1. **There is no provider abstraction today.** `/api/payments/initiate` and `/api/events/[id]/submit` import `lib/cinetpay.ts` directly. There's no `PaymentOrchestrator`, no adapter interface, no provider field driving a dispatch. Adding PI-SPI as a second live rail means either branching inline on every route, or building the abstraction layer first (Section S proposes this).
2. **Three separate, non-unified manual-payment implementations exist** for three different money flows (ticket purchase, event-listing/ad fee, marketplace ad campaign) — one goes through the generic `Payment`/`Refund` models, one is CinetPay-only with no manual fallback (so it 503s today if it's ever triggered), and one bypasses `Payment` entirely with its own ad-hoc fields on `AdCampaign`.
3. **A significant amount of code is dead weight from the pre-pivot "super-app"** (transport/property/food/ride modules) sitting alongside the live event-ticketing code, including an entire unused types package (`@vivre/types`), an unused currency/commission utility package, two unused payment-logo UI components, and a fully-schema'd-but-never-touched wallet/credit system. None of this is dangerous, but a PI-SPI integration should not build on any of it, and some of it (stale docs, the orange-branded `/paiement/retour` page referencing dead modules) should be cleaned up as part of Stage 1.

**Bottom line for PI-SPI:** you can safely do real design and adapter-layer work today (Stage 1 in Section T) without any PI-SPI credentials — the existing CinetPay code is a good template for the request/verify/webhook shape PI-SPI will need. You cannot exercise a real PI-SPI transaction until enrollment + fiscal ID are done (Stage 3).

---

## B. Current architecture diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BUYER                                                                   │
│  EventDetailClient.tsx → POST /api/events/bookings                      │
│      (creates EventBooking, status="pending", locks ticket_type row)    │
│      free ticket ─────────────────────────────► issueTicketsForBooking()│
│      paid ticket ─► redirected to /evenements/mes-billets/[id]          │
└───────────────┬───────────────────────────────────────────────────────┬─┘
                │ cinetpayConfigured()===false (TODAY, always)          │ if ever true
                ▼                                                       ▼
┌───────────────────────────────────┐   ┌─────────────────────────────────┐
│ MANUAL MOBILE-MONEY BRIDGE (LIVE)  │   │ CINETPAY (built, not configured)│
│ Buyer sends $ to organizer's       │   │ POST /api/payments/initiate     │
│ verified payout phone directly.    │   │  → initiateCinetPayPayment()    │
│ Organizer/admin: PATCH             │   │  → redirect to hosted page      │
│ /events/bookings/[id]/             │   │ buyer pays via USSD/OTP         │
│  confirm-payment                   │   │ CinetPay → POST /payments/      │
│  → Payment(completed,              │   │  webhook → ALWAYS re-verifies   │
│    manual_mobile_money)            │   │  via verifyCinetPayPayment()    │
└───────────────┬─────────────────────┘   │  before trusting anything      │
                │                         └────────────────┬────────────────┘
                └──────────────┬───────────────────────────┘
                                ▼
                  EventBooking.status = "confirmed"
                  issueTicketsForBooking() (transactional, idempotent,
                  row-locked seat numbering, per-ticket QR)
                                │
                ┌───────────────┴────────────────┐
                ▼                                 ▼
   Buyer cancels within 1h of        Event ends → getOrCreateEventPayout()
   issuance / admin cancels          (lazy, triggered when admin opens
   ticket / organizer cancels        /admin/versements) → EventPayout
   event / buyer "report issue"      status=held→eligible (T+2 or T+4 days,
   after event ends → Refund         graduated trust) → admin clicks "paid",
   (status=pending) → admin          pastes payout_reference (ALWAYS MANUAL,
   clicks "complete", ALWAYS         organizer's own verified mobile-money
   MANUAL, sends $ by hand           account)
```

Two other money flows exist **outside** this diagram, structurally separate:
- **Event listing fee + inline ad** (`PATCH /events/[id]/submit`): same `Payment` model, but CinetPay-only — **no manual bridge**. Currently masked because the default listing fee is 0 FCFA.
- **Marketplace ad campaigns** (`/api/ads/*`): entirely bypasses `Payment`/`Refund` — its own `payment_reference_note`/`payment_submitted_at`/`paid_at`/`confirmed_by` fields directly on `AdCampaign`.

---

## C. Full payment file inventory

### Live, active (event-ticketing era)

| Path | Purpose | Status | Provider coupling |
|---|---|---|---|
| `apps/web/src/lib/cinetpay.ts` | CinetPay HTTP client: initiate, verify, URL builders | Active, fully coded, **not configured anywhere** | CinetPay-specific, no abstraction |
| `apps/web/src/app/api/payments/initiate/route.ts` | Starts a CinetPay payment for a pending `EventBooking` | Active | Direct `cinetpay.ts` import |
| `apps/web/src/app/api/payments/webhook/route.ts` | CinetPay IPN handler — re-verifies before trusting | Active | Direct `cinetpay.ts` import; branches on `booking_type` (`event` / `event_listing`) |
| `apps/web/src/app/api/payments/[id]/route.ts` | `GET` payment status, used by the polling page | Active | None (reads DB only) |
| `apps/web/src/app/api/events/bookings/route.ts` | Checkout: creates `EventBooking`, locks inventory, computes totals | Active | None — provider-agnostic |
| `apps/web/src/app/api/events/bookings/[id]/route.ts` | `GET` booking detail; also decides whether to show manual-payment instructions | Active | Branches on `cinetpayConfigured()` |
| `apps/web/src/app/api/events/bookings/[id]/confirm-payment/route.ts` | Manual mobile-money confirmation bridge (organizer/admin) | Active — **the only live payment-completion path today** | None (bypasses CinetPay entirely) |
| `apps/web/src/app/api/events/bookings/[id]/report-issue/route.ts` | Buyer-reported post-event issue → creates `Refund` | Active | None |
| `apps/web/src/app/api/events/tickets/[id]/route.ts` | `DELETE` — admin-only single-ticket cancellation + partial refund | Active | None |
| `apps/web/src/app/api/events/tickets/[id]/transfer/route.ts` | Ticket ownership transfer (not money, but touches `price_fcfa_at_purchase`) | Active | None |
| `apps/web/src/app/api/events/[id]/cancel/route.ts` | Organizer/admin cancels event → auto-refunds all active bookings | Active | None |
| `apps/web/src/app/api/events/[id]/reschedule/route.ts` | Reschedule → grants unconditional cancel rights, no auto-refund | Active | None |
| `apps/web/src/app/api/events/[id]/submit/route.ts` | Event submission: listing fee + inline ad payment | Active | Direct `cinetpay.ts` import, **no manual bridge** |
| `apps/web/src/app/api/events/[id]/request-refund/route.ts` | Organizer requests refund of listing fee on a rejected event | Active | None |
| `apps/web/src/app/api/events/[id]/reject/route.ts` | Admin rejects event, optional immediate refund | Active | Calls `refundEventListingPayment()` |
| `apps/web/src/lib/events.ts` | `issueTicketsForBooking`, `cancelTickets`, `refundEventListingPayment`, refund-window logic | Active — core money/ticket logic | None |
| `apps/web/src/lib/event-payout.ts` | Graduated-trust payout eligibility calculation | Active | None |
| `apps/web/src/lib/platform-settings.ts` | Fee/commission formula helpers, reads `PlatformSettings` singleton | Active | None |
| `apps/web/src/lib/promo-codes.ts` | Promo code validation, with a locking variant for checkout | Active | None |
| `apps/web/src/app/api/admin/payouts/route.ts` | Admin payout queue (`GET`), lazily syncs pending payouts | Active | None |
| `apps/web/src/app/api/admin/payouts/[id]/pay/route.ts` | Admin marks a payout paid (manual) | Active | None |
| `apps/web/src/app/api/admin/refunds/route.ts` | Admin refund queue (`GET`) | Active | None |
| `apps/web/src/app/api/admin/refunds/[id]/decision/route.ts` | Admin completes/rejects a refund (manual) | Active | None |
| `apps/web/src/app/api/admin/settings/route.ts` | `GET`/`PATCH` `PlatformSettings` (fees, delays, toggles) | Active | None |
| `apps/web/src/app/api/admin/organizer-discount/route.ts` | Admin sets a per-organizer fee discount | Active | None |
| `apps/web/src/app/api/events/[id]/promo-codes/validate/route.ts` | Read-only promo preview for checkout UI | Active | None |
| `apps/web/src/app/api/events/[id]/analytics/route.ts` | Organizer-facing revenue analytics (reads `commission_percent`) | Active | None |
| `apps/web/src/app/(app)/paiement/retour/page.tsx` | CinetPay return/polling page | Active but **stale**: orange-branded (inconsistent with VIVRE green), routes to dead modules (`/food/...`, `/hebergement/...`, `/transport/...`) that no longer exist | CinetPay-shaped, generic underneath |
| `apps/web/src/app/(app)/evenements/mes-billets/[id]/page.tsx` | Buyer-facing payment completion screen — shows manual instructions OR CinetPay method picker | Active | Branches on `manual_payment_instructions` presence |
| `apps/web/src/app/(app)/fournisseur/evenements/[id]/reservations/page.tsx` | Organizer confirms manual payments received | Active | None |
| `apps/web/src/app/(app)/admin/remboursements/page.tsx` | Admin refund queue UI | Active | None |
| `apps/web/src/app/(app)/admin/versements/page.tsx` | Admin payout queue UI | Active | None |
| `apps/web/src/app/api/ads/[id]/submit-payment/route.ts` | Advertiser reports having sent payment for an ad campaign | Active | None — **entirely separate pattern from `Payment` model** |
| `apps/web/src/app/api/ads/[id]/confirm-payment/route.ts` | Admin confirms ad campaign payment | Active | Same — no `Payment` row created |
| `apps/web/src/app/api/admin/ads/route.ts` | Admin ad campaign moderation/payment queue | Active | None |

### Legacy / dead (pre-pivot "super-app" era — transport, property, food, rides)

| Path | Status | Notes |
|---|---|---|
| `apps/api/*` | **Dormant.** Only compiled `dist/` artifacts remain in the main tree; zero active `src/` for payments. Real source only survives in orphaned `.claude/worktrees/agent-*/` copies (not part of the deployed app). | Safe to archive/delete; nothing imports it. |
| `packages/types/src/payments.ts`, `packages/types/src/enums.ts`, `packages/types/src/driver.ts` | **Dead — zero imports anywhere in `apps/web/src`.** Describes a different, non-existent architecture: direct Orange/Moov USSD integration, Stripe cards, a "Cash" method, hardcoded 12% commission. None of this matches the live CinetPay-aggregator + manual-bridge + configurable-8%-commission reality. | The whole `@vivre/types` package is unused by the live app. |
| `packages/utils/src/currency.ts` (`calculateCommission`, `formatFCFA`, `parseFCFA`, `isValidFCFAAmount`) | **Dead — zero call sites.** Every live route reimplements FCFA formatting (`.toLocaleString("fr-FR")`) and commission math (`Math.round(x * pct / 100)`) inline instead. `calculateCommission()`'s hardcoded 12% default also disagrees with the live 8% default in `PlatformSettings`. | Duplicated-formula risk if ever revived without updating the default. |
| `apps/web/src/components/PaymentSelector.tsx` | **Dead — never imported anywhere.** Full Uber-style payment picker (Orange/Moov/Telecel/Wave/card/wallet radio list). | Offers "card" and "wallet" options that don't work anywhere in the live code (no card processing, no wallet debit implementation). |
| `apps/web/src/components/PaymentLogos.tsx` | **Dead — never imported anywhere.** A second, independent implementation of payment-brand SVG logos. | Redundant with the inline logos duplicated inside `PaymentSelector.tsx` itself. |
| `VivreWallet`, `WalletTransaction` (schema models) | **Schema-complete, code-dead.** Zero reads or writes anywhere in `apps/web/src`. `Refund.refund_method` has a `"vivre_credit"` value in its (string, not enum) domain, but every real `Refund.create()` call in the live code hardcodes `"mobile_money"` — `vivre_credit` is never actually produced. | If a buyer is ever told "you'll get VIVRE credit," nothing currently implements it. |
| `TransportBooking`, `PropertyBooking`, `Order`/`OrderItem`, `GuideBooking`, `DriverPayout`, `Driver` (schema models) | **Zero usage in `apps/web/src`.** Confirmed via search — no query, no mutation, no import. | Still referenced by `Payment`'s polymorphic relations (harmless — an unused relation, not a broken one) and by `.env.example` (root) which documents Firebase vars for "chauffeurs" (drivers) — pre-pivot doc, unrelated to the live event-ticketing Firebase push work done separately this week. |
| `VIVRE_PROGRESS.md`, `docs/LEGACY_SUPERAPP_ROADMAP.md` | **Stale.** Describe wallet top-up flows, food/ride/property payment checkout, SOTRACO multi-operator transport — none of which exist in the current codebase. | See Section P for the specific mismatches. |

---

## D. Current payment flow (exact call chain)

**1. Buyer starts checkout** — taps a ticket-type quantity stepper on the event detail page (`apps/web/src/app/(app)/evenements/[id]/EventDetailClient.tsx`), which drives a React Query mutation.

**2. Frontend component** — `bookingMutation` in `EventDetailClient.tsx` (line ~134) calls `apiClient.post("/events/bookings", {...})`.

**3. Backend route** — `POST /api/events/bookings` (`apps/web/src/app/api/events/bookings/route.ts`). Inside one Prisma transaction: locks the `event_ticket_types` row (and any selected `event_merch_items` rows, in deterministic id order) with `SELECT ... FOR UPDATE`, re-counts sold quantity against `ACTIVE_BOOKING_STATUSES = ["pending","confirmed","checked_in"]`, rejects if oversold, validates/locks the promo code the same way, computes `subtotal_fcfa → discount_fcfa → buyer_fee_fcfa → total_amount` and `commission_fcfa` (from the event's own **snapshotted** `commission_percent`, set once at event-creation time — never re-read from live settings), creates the `EventBooking` row with `status = isFree ? "confirmed" : "pending"`.

**4. Provider/method currently used** — none automatically. If `total_amount === 0`, `issueTicketsForBooking()` runs immediately, no payment involved. If `total_amount > 0`, the booking sits `"pending"` and the buyer is redirected to `/evenements/mes-billets/[id]`.

**5. Payment status storage** — on the generic `Payment` model (`payment_id` FK on `EventBooking`, nullable until a payment is actually attempted). `Payment.status` is a bare string: `pending | completed | failed | cancelled`.

**6. How success is confirmed** — two possible paths, mutually exclusive in practice today because `cinetpayConfigured()` is false:
   - **Manual bridge (live today):** the ticket page shows `manual_payment_instructions` (organizer's verified payout provider/phone/name, from `OrganizerVerification`). The buyer pays outside the app. The organizer (or an admin) opens `/fournisseur/evenements/[id]/reservations` and calls `PATCH /events/bookings/[id]/confirm-payment` with a free-text reference note. This directly sets `Payment.status = "completed"` and `EventBooking.status = "confirmed"`, then calls `issueTicketsForBooking()`.
   - **CinetPay (built, dormant):** `handlePay()` in `mes-billets/[id]/page.tsx` calls `POST /api/payments/initiate`, which creates/reuses a `Payment` row and calls `initiateCinetPayPayment()`, redirecting the buyer to CinetPay's hosted page.

**7. Webhook used?** Yes, for the CinetPay path only — `POST /api/payments/webhook`. It extracts `cpm_trans_id`/`transaction_id`, looks up the matching `Payment`, and — critically — **never trusts the payload**: it always calls `verifyCinetPayPayment(transactionId)` against CinetPay's own check endpoint before updating anything. On `"completed"`, updates `Payment` and (for `booking_type === "event"`) confirms the booking and calls `issueTicketsForBooking()`; for `booking_type === "event_listing"`, moves the `Event` to `"pending_approval"`.

**8. Polling/status verification used?** Yes — `/paiement/retour/page.tsx` polls `GET /api/payments/[id]` every 2s for up to 30s after CinetPay redirects the buyer back, because the redirect can arrive before the IPN does. This endpoint only reads the DB row; it does **not** itself re-ping CinetPay, so if the webhook never arrives, polling will time out and the payment stays `"pending"` indefinitely (see Section K/R).

**9. If payment is pending** — the booking blocks the reserved inventory (counted in `ACTIVE_BOOKING_STATUSES`) indefinitely. **No expiry/TTL exists** despite a code comment claiming a 10-minute hold — nothing currently enforces it (see Section R).

**10. If payment fails** — CinetPay path: webhook sets `Payment.status = "failed"`, `failed_at`, `failure_reason`; the booking stays `"pending"` (the buyer can retry via `handlePay()` again, which reuses the same `Payment` row rather than creating a new attempt — see Section H weakness). Manual bridge: there's no explicit "failed" state — a booking just stays `"pending"` until someone confirms it or it's abandoned.

**11. If the frontend reloads** — safe. `GET /events/bookings/[id]` is idempotent and re-derives everything from the DB (including whether to show manual instructions, via a live `cinetpayConfigured()` check). The polling page reads `payment_id` from the URL query string, so a reload just resumes polling.

**12. Duplicate payment attempts** — the webhook is idempotent (`if (payment.status === "completed") return {ok:true}` — early exit). But there is **no idempotency key** anywhere in the flow; protection is entirely via application-level state checks, not a dedicated mechanism (see Section I).

**13. Ticket creation timing** — inside `issueTicketsForBooking()` (`apps/web/src/lib/events.ts:130`), called the moment a booking's payment is confirmed (free-instant, manual-confirm, or CinetPay-webhook — all three call the same function).

**14. QR issuance trigger** — same function: for each of `quantity` tickets, generates a per-ticket QR (`generateTicketQr`) inside the same DB transaction that creates the `EventTicket` rows.

**15. Payment succeeds but ticket creation fails** — `issueTicketsForBooking()` runs inside `prisma.$transaction(...)`, so a failure rolls back ticket creation atomically; the booking would be left `"confirmed"` with zero tickets and no automatic retry. This is a real gap: there's no reconciliation sweep that would notice "confirmed booking, zero tickets" and retry.

**16. Ticket creation succeeds twice** — cannot happen: `issueTicketsForBooking()` locks the booking row (`SELECT ... FOR UPDATE`) and checks `existing = await tx.eventTicket.count(...); if (existing > 0) return;` inside that same lock, before creating anything. A DB-level unique constraint (`@@unique([booking_id, ticket_number])`) is a second line of defense.

**17. Free vs. paid tickets** — identical code path up to `EventBooking` creation; the only branch is `status: isFree ? "confirmed" : "pending"` and whether `issueTicketsForBooking()` is called synchronously in the same request (free) or later, via one of the two confirmation paths (paid).

---

## E. Database / schema audit

### Payment (generic, polymorphic — `apps/web` calls it `prisma.payment`)
- Fields: `user_id`, `amount` (FCFA int), `currency` (always `"XOF"`, unused as a real multi-currency field), `payment_method` (string, not enum — set post-hoc), `provider_ref` (CinetPay token or manual reference note — **one field for two different meanings**), `status` (string: pending/completed/failed/cancelled), `booking_type` (string: transport/property/food/event/event_listing), `booking_id` (string, **no FK** — polymorphic by necessity), `platform_fee`, `supplier_amount`, `paid_at`/`failed_at`/`failure_reason`.
- Indexes: `[user_id,status]`, `[booking_type,booking_id]`, `[status,payment_method]`.
- **Multiple attempts per order?** No. `/api/payments/initiate` reuses the same `Payment` row (`prisma.payment.update(...status:"pending")`) if `booking.payment_id` already exists, rather than creating a new attempt — **retry history is lost**.
- **Multiple providers?** Architecturally yes (`payment_method` is a free string), but no code branches on more than one provider today.
- **Refunds?** Yes, via the separate `Refund` model.
- **Payouts?** Not on `Payment` directly — payouts are event-level, via `EventPayout`.
- **Immutable financial history?** Partially — `Payment` itself is mutated in place across its lifecycle (status transitions, and the retry-reuse above); there's no append-only ledger of what happened.

### Refund
- Fields: `payment_id` FK, `amount` (supports partial), `reason`, `status` (pending/completed/rejected), `refund_method` (mobile_money/vivre_credit — `vivre_credit` dead, see Section C), `booking_type`/`booking_id` (**duplicated from `Payment`**, avoids a join for admin display but is a normalization smell), `processed_by`/`processed_at`.
- No DB-level uniqueness prevents two open refunds on one `payment_id` — enforced only by application `findFirst(status != rejected)` checks at each of the three refund-creation call sites (`cancelTickets`, `report-issue`, `events/[id]/cancel`).

### EventBooking
- The real "Order" of this domain. Snapshots `unit_price_fcfa`, `subtotal_fcfa`, `discount_fcfa`, `buyer_fee_fcfa`, `total_amount`, `commission_fcfa` all at creation time — **correct pattern**, nothing here is recomputed later from live settings.
- `status`: pending/confirmed/cancelled/checked_in (string). `payment_id` nullable FK to `Payment`.
- Row-locked at creation (`SELECT...FOR UPDATE` on the ticket-type row) to prevent overselling.

### EventTicket
- One row per physical ticket (introduced later than `EventBooking` — a prior single-QR-per-order design was replaced). `@@unique([booking_id, ticket_number])` and `@@unique([ticket_type_id, seat_number])` are real DB-level anti-duplication guarantees, not just application checks.
- `price_fcfa_at_purchase` — per-ticket share of the order total, base for partial refunds.

### EventPayout
- One row per event (`@@unique event_id`). `status`: held/eligible/paid/on_hold_dispute. `gross_amount_fcfa`/`commission_fcfa`/`net_amount_fcfa` computed once, never recomputed. `eligible_at` computed from graduated trust (Section H). **Nothing pays automatically** — `paid` only ever set by an admin via `PATCH /admin/payouts/[id]/pay`.

### VivreWallet / WalletTransaction
- Schema-complete, **zero code usage** (Section C). Not a real ledger even on paper — single mutable `balance_fcfa` field, no double-entry, no invariant enforcement.

### OrganizerVerification
- Holds the **same payout account** used both for the manual buyer→organizer bridge today and for the eventual VIVRE→organizer payout — i.e., one phone number serves two different money-flow directions. Worth flagging for PI-SPI: if PI-SPI requires distinct participant/account registration per flow, this will need to split.

### PlatformSettings
- Singleton row (`id="default"`), admin-editable without redeploy: `organizer_fee_percent` (8% default), `buyer_fee_percent`/`buyer_fee_flat_fcfa` (0/0 default — "organizer pays" model), `free_period_enabled` kill-switch, `payout_delay_new_organizer_days`(4)/`payout_delay_trusted_organizer_days`(2)/`trusted_organizer_event_threshold`(3), ad/listing pricing.

### Schema weaknesses flagged
- **One `provider_ref` field on `Payment`, not a separate `PaymentAttempt` table** — retried payments lose attempt history (see D.12, H).
- **No idempotency key column anywhere.**
- **`status`/`payment_method`/`booking_type`/`refund_method` are bare strings, not Postgres enums or CHECK constraints** — no schema-level guard against a typo'd status value (none observed in practice, but nothing prevents it).
- **No ledger table** — `WalletTransaction` was clearly meant to be this, but it's dead and wasn't a true double-entry ledger design anyway.
- **No dispute/chargeback model** — a reasonable omission for mobile-money-only today (CinetPay mobile money doesn't chargeback the way cards do), but a gap to fill before any card or bank rail (PI-SPI included, depending on its return/dispute semantics).
- **Refund/Payment `booking_type`+`booking_id` polymorphism has no FK** — by necessity (multiple possible parent tables), but means the DB can't enforce referential integrity here; orphaned rows are only prevented by the fact that nothing in the live code hard-deletes bookings/events.

---

## F. Routes / API endpoints

| Method | Path | File | Auth | Purpose | Provider | DB writes | Idempotent? |
|---|---|---|---|---|---|---|---|
| POST | `/api/events/bookings` | `events/bookings/route.ts` | user (phone-verified) | Create booking, lock inventory | none | `EventBooking`, `EventBookingMerchItem`, `PromoCode.uses_count` | No — two rapid clicks create two pending bookings (see I) |
| GET | `/api/events/bookings/[id]` | `events/bookings/[id]/route.ts` | user (owner/ticket-holder/admin) | Booking detail + manual-payment instructions | reads `cinetpayConfigured()` | none | Yes (read) |
| PATCH | `/api/events/bookings/[id]/confirm-payment` | same dir | organizer or admin | Manual payment confirmation → issue tickets | none (manual bridge) | `Payment`, `EventBooking`, `EventTicket`×N | Guarded by `status !== "pending"` check |
| POST | `/api/events/bookings/[id]/report-issue` | same dir | buyer (original) | Post-event issue report → `Refund` | none | `Refund` | Yes — `findFirst` guard |
| DELETE | `/api/events/tickets/[id]` | `events/tickets/[id]/route.ts` | **admin only** | Cancel one ticket, conditional partial refund | none | `EventTicket`, `Refund`, maybe `EventBooking` | Yes — write-guarded `updateMany` |
| PATCH | `/api/events/tickets/[id]/transfer` | `.../transfer/route.ts` | ticket holder | Transfer ticket ownership | none | `TicketTransfer`, `EventTicket` | n/a (not payment) |
| POST | `/api/payments/initiate` | `payments/initiate/route.ts` | user (booking owner) | Start CinetPay payment | CinetPay | `Payment` | Reuses existing `Payment` row (loses attempt history) |
| POST | `/api/payments/webhook` | `payments/webhook/route.ts` | **none — public IPN endpoint** | CinetPay IPN, always re-verified server-side | CinetPay | `Payment`, `EventBooking`/`Event`, tickets | Yes — early-return on `status==="completed"` |
| GET | `/api/payments/[id]` | `payments/[id]/route.ts` | user (payment owner) | Poll payment status | reads DB only | none | Yes (read) |
| PATCH | `/api/events/[id]/cancel` | `events/[id]/cancel/route.ts` | organizer or admin | Cancel event → auto-refund all active bookings | none | `Event`, `EventBooking`×N, `Refund`×N | Guarded by `event.status !== "approved"` |
| PATCH | `/api/events/[id]/reschedule` | `events/[id]/reschedule/route.ts` | organizer or admin | Reschedule, grant free cancellation | none | `Event` | n/a |
| PATCH | `/api/events/[id]/submit` | `events/[id]/submit/route.ts` | organizer | Pay listing fee + optional ad, CinetPay only | CinetPay, **no manual fallback** | `Payment`, `Event` | Reuses prior completed payment if it covers the new total |
| POST | `/api/events/[id]/request-refund` | `events/[id]/request-refund/route.ts` | organizer | Refund listing fee on a rejected event | none | `Refund` | Yes — `refundEventListingPayment()` is idempotent |
| PATCH | `/api/events/[id]/reject` | `events/[id]/reject/route.ts` | admin | Reject event, optional immediate refund | none | `Event`, maybe `Refund` | Delegates to same idempotent helper |
| GET | `/api/admin/refunds` | `admin/refunds/route.ts` | admin | Refund queue | none | none | n/a |
| PATCH | `/api/admin/refunds/[id]/decision` | `admin/refunds/[id]/decision/route.ts` | admin | Complete/reject a refund (manual money movement) | none | `Refund` | Guarded by `status !== "pending"` |
| GET | `/api/admin/payouts` | `admin/payouts/route.ts` | admin | Payout queue, lazily syncs eligible payouts | none | `EventPayout` (via sync) | n/a |
| PATCH | `/api/admin/payouts/[id]/pay` | `admin/payouts/[id]/pay/route.ts` | admin | Mark payout paid (manual money movement) | none | `EventPayout` | Guarded by `status !== "eligible"` |
| GET/PATCH | `/api/admin/settings` | `admin/settings/route.ts` | admin | Read/write `PlatformSettings` (fees, delays) | none | `PlatformSettings` | n/a |
| PATCH | `/api/admin/organizer-discount` | `admin/organizer-discount/route.ts` | admin | Per-organizer fee discount | none | `User.fee_discount_percent` | n/a |
| GET | `/api/events/[id]/promo-codes/validate` | `events/[id]/promo-codes/validate/route.ts` | user | Read-only promo preview | none | none | n/a |
| PATCH | `/api/ads/[id]/submit-payment` | `ads/[id]/submit-payment/route.ts` | advertiser | Report ad payment sent | none — **bypasses `Payment` entirely** | `AdCampaign` | Guarded by `status !== "approved_unpaid"` |
| PATCH | `/api/ads/[id]/confirm-payment` | `ads/[id]/confirm-payment/route.ts` | admin | Confirm ad payment (manual) | none — same bypass | `AdCampaign` | Guarded by `status !== "approved_unpaid"` |
| GET | `/api/admin/ads` | `admin/ads/route.ts` | admin | Ad moderation/payment queue | none | none | n/a |

**Reconciliation routes:** none exist.

**Should these remain after PI-SPI integration?** All the ticket-purchase and refund/payout *queue and decision* routes (booking creation, confirm-payment as a manual fallback, admin refund/payout decision endpoints) should remain largely as-is — PI-SPI should slot in as a new *initiation/verification* path alongside (not instead of) the manual bridge, since the manual bridge is genuinely useful for organizers without a bank/PI-SPI account. The `events/[id]/submit` CinetPay-only path and the entirely separate `ads/*` payment pattern are the two spots that most need unification before adding a third provider (see Section S).

---

## G. Provider coupling

| Provider | Files | Env vars | Webhook | Status mapping | Frontend assumptions | Payout logic | Refund logic | Isolatable behind adapter? | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **CinetPay** | `lib/cinetpay.ts`, `payments/initiate`, `payments/webhook`, `events/[id]/submit` | `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `APP_URL` (all **unset** everywhere) | `POST /api/payments/webhook`, always re-verified via `verifyCinetPayPayment()` | `ACCEPTED→completed`, `REFUSED→failed`, else `pending` | `mes-billets/[id]/page.tsx` hard-codes 3 methods in its picker UI (Orange/Moov/Telecel — no Wave despite backend support) | None — CinetPay doesn't touch payouts | None automated — refunds are always manual regardless of how the payment was collected | **Yes** — cleanly isolated already in one file; the main work is extracting the call sites in `initiate`/`webhook`/`submit` into an adapter interface | **WRAP** |
| **Manual mobile-money bridge** | `events/bookings/[id]/confirm-payment`, `OrganizerVerification.payout_*` fields | none (no provider account — literally a human sending money by hand) | n/a | Binary — pending → completed on admin/organizer click | `mes-billets/[id]/page.tsx` shows `manual_payment_instructions` | Same account used for buyer→organizer AND (conceptually) VIVRE→organizer | Fully manual (`Refund` queue) | **N/A — not really a "provider," it's a manual process.** Should stay as a permanent fallback, not be "replaced" by PI-SPI. | **KEEP** |
| **Marketplace ad payments** | `ads/[id]/submit-payment`, `ads/[id]/confirm-payment` | none | n/a | Binary, on `AdCampaign` directly | Advertiser dashboard | None | **None at all — no refund path exists for ad campaigns** | Should be folded into the same `Payment`/orchestrator pattern as everything else, not kept as a third parallel implementation | **REFACTOR** |
| **Stripe / cards** | Only in dead `@vivre/types` (`packages/types/src/payments.ts`) and decorative UI (`PaymentSelector.tsx`'s "card" option) | none | n/a | n/a | n/a | n/a | n/a | Never actually implemented | **ARCHIVE** (or delete — nothing depends on it) |
| **Direct Orange/Moov USSD** (pre-CinetPay design) | Only in dead `@vivre/types` | none | n/a | n/a | n/a | n/a | n/a | Superseded by the CinetPay aggregator approach | **DELETE LATER** |
| **PI-SPI** | None yet | None yet | None yet | None yet | None yet | None yet | None yet | This is the audit's purpose | **UNKNOWN — greenfield** |

---

## H. Organizer money flow

- **Organizer balance?** Not a running balance — `EventPayout` is a **per-event queue entry**, not an account balance. There is no "total owed to this organizer across all events" view anywhere in the code (it could be derived by summing `EventPayout` rows, but nothing does this today).
- **PENDING vs AVAILABLE?** Conceptually yes via `EventPayout.status` (`held`→`eligible`→`paid`), but it's a status enum on a per-event row, not a two-bucket balance.
- **Reserve?** No explicit reserve mechanism, but the graduated trust delay (2–4 days post-event before eligibility) functions as a de facto short hold.
- **Event-level aggregation?** Yes — this is the core unit. One `EventPayout` per event, summing all its confirmed/checked-in bookings.
- **Payout eligibility?** Computed in `lib/event-payout.ts`: `eligible_at = event.ends_at + delayDays`, where `delayDays` is 2 (trusted) or 4 (new/reset), determined by `countTrustedHistory()` — count of prior **paid, non-zero-net** payouts since the organizer's `getLastTrustIncident()` (their own last cancellation, or last non-rejected buyer dispute against them). A single incident resets the trust clock to zero.
- **Trust tier?** Binary trusted/not-trusted based on `trusted_organizer_event_threshold` (default 3 clean paid events).
- **Payout manual or automated?** **100% manual.** `getOrCreateEventPayout()`/`syncPendingPayouts()` only compute *eligibility*; an admin must open `/admin/versements`, see the queue, send money by hand outside the app, and click `PATCH /admin/payouts/[id]/pay` with a reference string. Nothing in the codebase calls any payment provider's payout/disbursement API.
- **Per ticket or per event?** Per event — one `EventPayout` row aggregates all bookings for that event.
- **Tied to one PSP?** No PSP involved at all today (fully manual); the destination account is whatever `OrganizerVerification.payout_provider/payout_phone` says.
- **Withdrawal request model?** No — organizers don't request anything; the system computes eligibility and an admin acts on it. There's no organizer-initiated "please pay me now" flow.
- **Multiple events grouped?** No — strictly one payout per event, never batched across an organizer's several events.
- **Fees deducted before payout?** Yes — `net_amount_fcfa = gross_amount_fcfa − commission_fcfa`, computed once at payout creation from the event's own snapshotted numbers.
- **Can balances go negative?** Not applicable (no running balance exists), but nothing in the domain model would prevent a negative `net_amount_fcfa` if, hypothetically, refunds exceeded gross sales after payout creation — `getOrCreateEventPayout()` only guards `netFcfa <= 0` at creation time (skips creating a payout), it doesn't re-check after the fact if refunds happen later.
- **Record of what's economically owed?** Only implicitly, via the sum of `eligible`-status `EventPayout` rows. No dedicated "amount owed" ledger/report.

---

## I. Refund flow

| Scenario | Implemented? | Where |
|---|---|---|
| Single ticket refund | ✅ | `DELETE /api/events/tickets/[id]` → `cancelTickets()`, admin-only, gated by a 1-hour post-issuance window (`isWithinRefundWindow`) |
| Partial refund (subset of an order's tickets) | ✅ | Same — `cancelTickets()` accepts a `ticketIds[]` subset; the order (`EventBooking`) only flips to `"cancelled"` once its *last* active ticket is cancelled |
| Full refund | ✅ | Same mechanism, all tickets in the order |
| Cancelled event | ✅ automatic **creation** of `Refund` rows (not automatic money movement) | `PATCH /events/[id]/cancel` — loops every active booking, creates a `Refund` per paid booking |
| Rescheduled event | ⚠️ Indirect — no auto-refund; buyers instead get an unconditional cancellation right (bypasses the normal "event must not have started" / 1h-window gates implicitly, per the route's own comment) which then routes through the same single-ticket refund path | `PATCH /events/[id]/reschedule` |
| Bulk refund | ⚠️ Effectively yes for event cancellation (loops all bookings in one transaction), but no admin-initiated "refund N tickets at once" tool exists outside that trigger |
| Refund to original payment method | ❌ Not programmatically — `refund_method` is always `"mobile_money"` in every real call site; "to original method" is an operational assumption the admin fulfills by hand, not something the code verifies or enforces |
| Manual refund | ✅ **This is the only kind that exists** — `PATCH /admin/refunds/[id]/decision` with `action:"complete"` just records that the admin already sent money |
| Refund status | ✅ `pending`/`completed`/`rejected` on `Refund.status` |
| Refund retry | ❌ No retry concept — a rejected refund stays rejected; nothing resubmits |
| Refund failure | ❌ No "failed" status distinct from "rejected" — there's no automated refund attempt that could fail |
| Duplicate refund protection | ✅ Application-level `findFirst({status: {not:"rejected"}})` guards at all three creation sites (report-issue, ticket cancel, event cancel) — no DB-level uniqueness backing it up |

**Documented-but-not-implemented:** "vivre_credit" as a refund method (schema supports it, `VivreWallet` schema exists, nothing wires them together — see Section C). **Ad campaign refunds are entirely unimplemented** — no route, no model field, nothing.

---

## J. Event cancellation / reschedule

- **Who can cancel:** organizer or admin (`event.organizer_id === auth.sub || auth.roles.includes("admin")`).
- **Event states:** `draft → pending_approval → approved → (cancelled | completed implicitly via ends_at) `, plus `rejected` as a dead-end requiring resubmission. Cancellation only allowed from `"approved"`, and only before `starts_at` (an event that has already started can't be "cancelled," only individually disputed via buyer `report-issue`).
- **What happens to paid tickets:** all active (`pending`/`confirmed`) bookings for the event flip to `"cancelled"` in one transaction; a `Refund` (`status:"pending"`) is created for every booking with `total_amount > 0 && payment_id`.
- **Refunds queued, not paid:** yes, exactly — created as pending, an admin processes them from `/admin/remboursements` afterward.
- **Buyers notified:** yes — best-effort, outside the transaction (`notify()` per affected user, deliberately non-blocking so a notification failure can't undo the cancellation).
- **Organizer balance adjusted:** there's no live balance to adjust (Section H) — but note `getLastTrustIncident()` explicitly looks at `event.cancelled_at` to reset the organizer's trust clock, so a self-cancellation does penalize future payout speed.
- **Payout blocked:** implicitly — `getOrCreateEventPayout()` requires `event.status === "approved"`, so a cancelled event never gets a payout row created for it at all.
- **Settlement timing changes:** N/A — no payout exists to delay for a cancelled event.
- **Race conditions:** the cancellation transaction (`maxWait` default, `timeout: 30_000` — deliberately widened for events with hundreds of bookings) is the sole writer of booking status in this path; a buyer trying to self-cancel a ticket concurrently would hit the same `updateMany`-with-status-guard pattern used elsewhere, so a double-refund is prevented by the write itself being the source of truth, not a prior read.

---

## K. Idempotency and duplicate safety

| Risk | Current protection | DB-level? | App-level? | Remaining risk |
|---|---|---|---|---|
| Duplicate checkout (double-click "Buy") | **None specific.** Inventory locking prevents *overselling*, but nothing stops the same user creating two separate `pending` `EventBooking`s for the same ticket type in quick succession — each would independently hold inventory and be independently payable. | No | No | **Real gap** — a fast double-tap or a retried network request creates two live pending orders. |
| Duplicate payment creation | Reuses the existing `Payment` row via `booking.payment_id` check | No | Yes | Low — but loses attempt history (Section E) |
| Duplicate webhook | `if (payment.status === "completed") return {ok:true}` | No | Yes | Low |
| Duplicate success callback | Same as above | No | Yes | Low |
| Duplicate ticket issuance | Row lock (`FOR UPDATE` on the booking) + `existing = count(...); if (existing>0) return` inside the lock, **plus** DB `@@unique([booking_id, ticket_number])` as a second line of defense | **Yes** | Yes | Very low — two independent layers |
| Duplicate refund | `findFirst({status: {not:"rejected"}})` at each of the three creation sites | No | Yes | Low-moderate — no DB constraint backs this up; a future new refund-creation call site that forgets this check would silently double-refund |
| Duplicate payout | `payout.status !== "eligible"` guard before allowing `PATCH .../pay` | No | Yes | Low — single `@@unique(event_id)` on `EventPayout` also prevents two payout rows for the same event |

**No idempotency-key mechanism (header or column) exists anywhere in the payment stack.** All protection is bespoke, per-endpoint, state-check-based. This is adequate for the current low-volume manual-approval world but is exactly the pattern that breaks down once a provider (PI-SPI) can retry a request-creation call itself.

---

## L. Webhook / callback handling

Exactly one webhook exists: `POST /api/payments/webhook` (CinetPay IPN).

- **Signature/auth verification:** **None on the incoming request itself** — the endpoint is fully public, unauthenticated, and accepts either form-encoded or JSON bodies. This is mitigated, not eliminated, by the next point.
- **Raw payload handling:** the endpoint extracts only `transaction_id`, looks up the matching `Payment` by it, and then — this is the important part — **always calls `verifyCinetPayPayment(transactionId)` against CinetPay's own check API before writing anything**. A forged webhook POST can trigger a wasted outbound verification call (a mild probe/DoS surface) but cannot move money, because the actual status written to the DB comes from CinetPay's own response, never from the inbound payload.
- **Duplicate protection:** yes (`status === "completed"` early return).
- **Status normalization:** `ACCEPTED→completed`, `REFUSED→failed`, anything else → left as `pending` (no write at all on ambiguous/pending re-checks).
- **Retries:** none initiated by VIVRE — it relies entirely on CinetPay retrying its own IPN if VIVRE's endpoint errors. No dead-letter handling, no retry-tracking.
- **Logging:** none beyond default Next.js/Vercel request logs — no structured audit log of webhook receipts.
- **Failure handling:** a verification-check failure (network error, etc.) returns a plain `502` and does **not** persist anything — the payment silently stays `pending` until CinetPay's own retry succeeds or the buyer's polling page times out. No alerting.

**Flag:** this webhook would fail a naive "trusts provider data without verification" check on the payload alone, but passes on the substance — the actual state-changing decision is always re-derived from a direct, authenticated call to the provider, not the webhook body. This is the right pattern to preserve and generalize for PI-SPI.

---

## M. Reconciliation

**There is no reconciliation process anywhere in VIVRE today.** Specifically:
- **PENDING payments:** never swept. A payment stuck `pending` (buyer paid, but the webhook never arrived, or the buyer never opened the polling page and CinetPay's redirect never fired) stays `pending` forever with no cron, no admin alert, no manual "recheck this payment" button.
- **UNKNOWN payments:** N/A — no concept of an unmatched/orphan transaction exists.
- **Failed callbacks:** not tracked or retried by VIVRE (relies entirely on CinetPay's own retry behavior for its IPN).
- **Missing webhooks:** not detected.
- **Payout states:** `syncPendingPayouts()` (in `lib/event-payout.ts`) does sweep ended events into payout eligibility, but it's **lazily triggered only when an admin loads `/admin/versements`** — not a cron, not proactive. If no admin opens that page, payouts never get created or promoted from `held` to `eligible`, though nothing is lost (just delayed) since the calculation is deterministic and re-run on next load.
- **Refund states:** no sweep exists at all.

The one and only scheduled job in the entire app is `apps/web/src/app/api/cron/event-reminders/route.ts` (daily, 08:00 UTC) — it sends "your event is coming up" reminders, unrelated to payments.

**This is the single biggest operational gap this audit found** — worth prioritizing early in Stage 1, independent of PI-SPI, since it affects the CinetPay path the moment it's turned on.

---

## N. Financial calculation audit

| Formula | Lives in | Notes |
|---|---|---|
| Buyer total (`subtotal − discount + buyer_fee`) | `apps/web/src/app/api/events/bookings/route.ts` (inline, at booking creation) | Snapshotted into `EventBooking.total_amount` — never recomputed later |
| Organizer commission (`afterDiscount × commission_percent / 100`) | Same file, inline | Uses `event.commission_percent`, itself snapshotted at event-creation time in `apps/web/src/app/api/events/route.ts:160` from `effectiveOrganizerFeePercent()` |
| `effectiveOrganizerFeePercent`, `effectiveBuyerFee`, `effectiveListingFeeFcfa`, `effectiveAdPricePerDayFcfa` | `apps/web/src/lib/platform-settings.ts` | The one real shared formula module — correctly used by both `events/route.ts` (creation) and `events/[id]/submit/route.ts` (listing fee) |
| Per-ticket partial-refund share (`floor(total/qty)`, remainder on the last ticket) | `apps/web/src/lib/events.ts` (`issueTicketsForBooking`) | Consistent, single source |
| Payout net (`gross − commission`) | `apps/web/src/lib/event-payout.ts` | Snapshotted once into `EventPayout`, never recomputed |
| **Duplicate/conflicting:** `calculateCommission()` in `packages/utils/src/currency.ts` | **Dead, unused** | Hardcodes 12% default — **disagrees with the live 8% default** in `PlatformSettings.organizer_fee_percent`. Harmless only because nothing calls it. |
| FCFA display formatting | Reimplemented inline via `.toLocaleString("fr-FR")` in every UI file that shows an amount | `formatFCFA()` in the same dead utils file was meant to centralize this |
| Promo discount (`percent` or `fixed`, capped at subtotal) | `apps/web/src/lib/promo-codes.ts` | Single source, used both for the checkout-time locked validation and the read-only preview |
| Taxes | **Not modeled at all** — no tax field anywhere | N/A today; would need to be added for any jurisdiction requiring it |
| Reserve / hold-back | Not a formula — implicit via payout delay days, not a percentage withheld | See Section H |

**No amount is ever recomputed from live settings after the fact** — every financially-relevant number on `EventBooking`/`EventPayout` is a point-in-time snapshot. This is the single most important correctness property this audit confirmed, and it should be preserved by any PI-SPI integration.

---

## O. Payment UI audit

- **Current checkout components:** `EventDetailClient.tsx` (ticket/merch selection, creates the booking — no payment method chosen here at all), `mes-billets/[id]/page.tsx` (the actual payment-completion screen — shows either the manual bridge instructions or an inline 3-method radio picker).
- **Available payment methods shown to buyers today:** Orange Money, Moov Money, Telecel Money (hardcoded inline in `mes-billets/[id]/page.tsx`) — **Wave is missing from this live picker** despite being supported in `cinetpay.ts`'s `METHOD_MAP` and offered in the dead `PaymentSelector.tsx`.
- **Hard-coded provider names:** yes, directly in JSX (`{ v: "orange_money", l: "Orange Money", i: "🟠" }` etc.) rather than driven from a shared config — the exact same list exists independently (and more completely) in the dead `PaymentSelector.tsx`/`PaymentLogos.tsx`.
- **The selected method is decorative:** `payMethod` state is tracked in the UI but **never sent** to `POST /payments/initiate` (the request body is just `{booking_type, booking_id}`) — CinetPay's own hosted page lets the buyer choose again regardless. Worth knowing before PI-SPI, which will likely want the chosen method upfront for request creation.
- **Loading/pending/failure states:** present and reasonably done — `isPaying` spinner text, `payError` display, the dedicated `/paiement/retour` polling page with distinct pending/success/failure renders.
- **Retry behavior:** "Réessayer" button on payment failure just does `router.back()` — no explicit retry-the-same-payment affordance; a fresh `handlePay()` call would be needed, reusing the same underlying `Payment` row (Section E).
- **Receipt/ticket state:** handled well — the ticket detail page (`TicketRevealModal`) is fully built (QR, save-to-device via `html2canvas` + Web Share API with a download fallback, transfer flow).
- **Provider implementation exposed unnecessarily:** the `/paiement/retour` page's `METHOD_LABELS` and `getSuccessUrl()` switch statement leak CinetPay/multi-module assumptions (still branches on `food`/`property`/`transport`/`event` — three of which are dead modules) directly into a user-facing page; and it's visually orange-branded, inconsistent with VIVRE's green design system used everywhere else in the live app.
- **"Choose a payment method, not a PSP" goal:** partially met — the live picker already shows method names (Orange/Moov/Telecel), not "CinetPay," which is the right instinct. But since the choice isn't actually transmitted anywhere, it's cosmetic today, and would need to become real once a second provider (PI-SPI) can serve the same method.

---

## P. Environment variables (names only)

| Variable | Required? | Scope | Status |
|---|---|---|---|
| `CINETPAY_API_KEY` | Required for CinetPay path | Server | **Unset** everywhere (local + Vercel prod) |
| `CINETPAY_SITE_ID` | Required for CinetPay path | Server | **Unset** everywhere |
| `APP_URL` | Required for CinetPay return/notify URLs | Server | Present locally (defaults to `http://localhost:3000` if unset) — should be confirmed set in Vercel prod separately from this audit |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Required (auth, not payment-specific, but gates every payment route via `requireAuth`) | Server | Set |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional — push notifications, unrelated to payments (built earlier this week) | Server | Not yet provided by user |
| `NEXT_PUBLIC_FIREBASE_*` (6 vars) + `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Optional — same, push notifications | Client | Not yet provided |
| `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` | **Legacy/unused** — documented in the stale root `.env.example` for the pre-pivot "drivers" push-notification use case; superseded by `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.production.example` | N/A | Never set, doc is stale |
| `NEXT_PUBLIC_API_URL` | Required (routes all client API calls) | Client | Set (`/api`) |

**No payment secret was found committed in source anywhere** — `CINETPAY_API_KEY`/`CINETPAY_SITE_ID` are read purely via `process.env` in `lib/cinetpay.ts`, with an explicit thrown error if absent (`getCredentials()`), and `cinetpayConfigured()` is checked before every use so the app degrades gracefully (falls back to the manual bridge, or 503s for the listing-fee path) rather than crashing.

**Production-only vs sandbox-only:** CinetPay's API URLs (`api-checkout.cinetpay.com`) are hardcoded as constants in `lib/cinetpay.ts`, not environment-driven — there is currently no sandbox/production URL switch at all. This will matter for PI-SPI, which explicitly has a sandbox phase before production enrollment (per the user's stated constraint) — the adapter design in Section S should make the base URL configurable per environment from day one.

---

## Q. Test coverage

**None.** Zero automated tests exist anywhere in the live codebase for checkout, payments, webhooks, refunds, payouts, cancellation, settlement, duplicate handling, overselling, or ticket issuance. The only test files in the repository (`pricing.test.ts`, `haversine.test.ts`, `health.test.ts`) live in `apps/api` — itself confirmed dormant — and don't touch payments even when it was active. Several are further orphaned inside old `.claude/worktrees/agent-*/` copies, not part of the deployed tree at all.

Verification of payment/ticket-money correctness in this project has, per prior session history, been done through live adversarial HTTP testing against the dev database at ship time — never captured as a repeatable regression suite. This is a real gap to close before PI-SPI goes live: a provider swap/addition with zero regression coverage on overselling, idempotent ticket issuance, and refund duplication protection is a meaningfully riskier change than it needs to be.

---

## R. Docs vs. code mismatches

| Document | Claim | Actual code behavior | Correction |
|---|---|---|---|
| `VIVRE_PROGRESS.md` | Describes a wallet top-up modal "with all 5 payment methods," food cart, ride booking, SOTRACO multi-operator transport, driver payouts (~90% built) | None of these modules exist in the live app — confirmed zero usage of `TransportBooking`, `PropertyBooking`, `Order`, `GuideBooking`, `Driver`, `DriverPayout` anywhere in `apps/web/src` | Archive this file or clearly mark it "pre-pivot, historical only" — it currently reads as a live progress tracker |
| `docs/LEGACY_SUPERAPP_ROADMAP.md` | "Payment methods (Orange Money, Moov, Telecel, Wave, CinetPay, Stripe), and a wallet already [built]" | Stripe was never implemented (only referenced in dead `@vivre/types`); `VivreWallet` is schema-only, zero code usage | The filename itself ("legacy") suggests this is already understood as historical — no action needed beyond making sure nobody mistakes it for current scope |
| `CINETPAY_INTEGRATION.md` | "Le code de paiement est entièrement écrit et branché" (payment code is fully written and wired) | **Accurate** — this is true and matches the code exactly, including the graceful 503 degradation | None — this doc is current and correct, just doesn't yet mention the manual mobile-money bridge that was added after it was written |
| `docs/POST_MVP_ROADMAP.md`, `docs/PITCH_SOURCE.md`, `docs/STRATEGIC_REVIEW.md` | Describe the manual mobile-money bridge, graduated organizer trust payout, admin-configurable commission/fees — all accurately | **Matches the code** in every detail checked (manual bridge behavior, trust-based payout delay, admin settings surface) | None — these are the reliable, current docs |
| *(implicit assumption to watch for)* | "CinetPay is the production provider" | CinetPay is fully coded but has never been the production provider — the manual bridge has been the only live path since it was added | Any PI-SPI planning conversation should start from "manual bridge is production today," not "CinetPay is production today" |
| *(implicit assumption to watch for)* | "Automatic 48h hold" / any fixed-hold-period assumption | The actual hold is **graduated**: 4 days for new/reset organizers, 2 days for trusted ones (≥3 clean paid events), not a flat 48h for everyone | Confirm this graduated model (not a flat window) is what any PI-SPI settlement-timing design should key off |

---

## S. PI-SPI readiness matrix

| Capability | Status | Why |
|---|---|---|
| Online payment SDK / request creation | **PARTIAL** | The CinetPay `initiate → redirect/token → webhook → re-verify` shape is architecturally the right template, but it's hardwired into route handlers with no adapter interface to plug a second provider into today. |
| Payment status polling | **READY** | `GET /api/payments/[id]` + the `/paiement/retour` polling pattern only read `Payment.status` from the DB — generalizes to any provider with no changes to the polling mechanism itself, only to who writes the status. |
| Webhooks / callbacks | **PARTIAL** | The "never trust the payload, always re-verify against the provider" pattern is exactly right and should be reused — but the webhook handler is CinetPay-specific code today, not a router that dispatches by provider. |
| Refunds / returns | **NOT READY** | 100% manual today; no code calls any provider's refund API. Automating this via PI-SPI would be entirely new work, not a swap of an existing automated path. |
| Business-originated payments (organizer payouts) | **NOT READY** | Same — 100% manual (admin sends money by hand, pastes a reference). The `EventPayout` eligibility/queue model is a strong foundation to trigger *from*, but nothing today calls a disbursement API. |
| Bulk payments | **NOT READY** | No batch/bulk payment concept exists anywhere (payouts are strictly one-event-at-a-time). |
| QR code payments | **NOT READY / different concept** | VIVRE has ticket-entry QR codes (unrelated purpose) but no payment-QR flow. |
| Aliases (e.g. phone-as-account-alias) | **UNKNOWN** | Depends entirely on PI-SPI's alias semantics; `OrganizerVerification.payout_phone` is the closest existing concept (human-entered, admin-verified) but isn't validated against any live registry. |
| Multiple financial participants | **PARTIAL** | The domain model already distinguishes buyer / organizer (`EventPayout.organizer_id`) / VIVRE (implicit via `commission_fcfa`) — a genuinely solid three-party foundation, even though money movement between them is entirely manual today. |
| Provider-independent ledger | **NOT READY** | No ledger exists. `WalletTransaction` was the closest candidate but is dead code and wasn't a true double-entry design regardless. |

---

## T. Target architecture recommendation

Given everything found, the target shape (not implemented — description only, per your explicit instruction):

```
Checkout/ticketing code (events/bookings, events/tickets, events/[id]/cancel, ...)
        │  never calls a provider directly
        ▼
   PaymentOrchestrator
        │  picks an adapter by requested/configured payment method
        ├──► CinetPayAdapter        (wraps today's lib/cinetpay.ts almost as-is)
        ├──► ManualBridgeAdapter    (formalizes today's confirm-payment flow —
        │                            NOT a real "provider," but modeling it as
        │                            one lets the orchestrator treat it uniformly)
        └──► PISPIAdapter           (new — request creation, status check,
                                     webhook verification, refund/return,
                                     payout/disbursement, all behind the
                                     same interface the other two implement)
```

Key structural changes this implies, grounded in what was actually found:

1. **Separate `Order` (already `EventBooking` — keep as-is, it's well designed) from `PaymentAttempt`.** Today `Payment` is mutated/reused in place across retries (Section E, D.12) — introduce a child table so a booking can have N attempts, each immutable once terminal, with the `EventBooking`/`Event` pointing at whichever attempt succeeded.
2. **Normalize payment states** into a real enum (Postgres enum or CHECK constraint) shared by `Payment`, `Refund`, `EventPayout`, `AdCampaign` — today each uses ad-hoc string values independently.
3. **Server-side verification stays mandatory** for every adapter — this is CinetPay's best property today and should be a hard requirement of the `PaymentOrchestrator` interface, not a per-adapter choice.
4. **Webhook + polling reconciliation**, generalized: today's `/paiement/retour` polling pattern and the (currently absent) reconciliation sweep (Section M) should both become provider-agnostic — a scheduled job that re-verifies any `Payment` stuck `pending` past some threshold, for whichever adapter it belongs to.
5. **Idempotency**, formalized: add an `idempotency_key` on `PaymentAttempt` (client-supplied on `POST /events/bookings` too, to close the duplicate-checkout gap in Section K) rather than continuing to rely purely on ad-hoc status checks.
6. **Immutable/auditable financial history**: keep the excellent snapshot discipline already present on `EventBooking`/`EventPayout` (Section N) — extend the same discipline to a `PaymentAttempt` table instead of mutating `Payment` in place.
7. **Separate organizer-payable from VIVRE-revenue**: already conceptually true (`net_amount_fcfa` vs `commission_fcfa` on `EventPayout`) — just needs a queryable "total owed" view once a second money-out rail (PI-SPI payouts) exists.
8. **Separate pay-in from payout/settlement**: already true architecturally (`Payment` vs `EventPayout` are unrelated tables) — preserve this distinction inside the orchestrator (a `PISPIAdapter.payIn()` vs `PISPIAdapter.payout()` should be two distinct interface methods, not one).
9. **Settlement policy stays configurable**: `PlatformSettings`' graduated-trust delay model is genuinely good and should remain the trigger for *when* a payout is eligible, regardless of which adapter eventually executes it.
10. **Fold the two orphaned manual-payment patterns (event-listing/ad-submit, marketplace ads) into the same `Payment`/orchestrator model** — today's three-implementations-of-the-same-idea (Section G) is the most concrete unification opportunity, and doesn't require any PI-SPI credentials to start.
11. **Retire the dead weight** (Section C) as part of this work, not as a separate cleanup pass — `@vivre/types`, the unused `currency.ts` commission formula, the two orphaned payment-logo components, and the stale `/paiement/retour` branding/dead-route-list should be removed or fixed while touching this code anyway, so the new adapter code isn't built next to (or confused with) parallel dead implementations.

---

## U. Staged migration plan

### Stage 0 — Audit (this document)
Done. No code changed.

### Stage 1 — Safe abstractions, no live PI-SPI credentials needed
- **Files affected:** new `PaymentOrchestrator` + adapter interface (new files); refactor `payments/initiate`, `payments/webhook`, `events/[id]/submit`, `ads/[id]/submit-payment`, `ads/[id]/confirm-payment` to go through it; wrap existing `lib/cinetpay.ts` as `CinetPayAdapter`; formalize the manual bridge as `ManualBridgeAdapter`.
- **Schema changes:** add `PaymentAttempt` (child of `Payment`/`Order`), add `idempotency_key` columns, normalize status enums. Fold `AdCampaign` payments into the shared `Payment` model.
- **Also in scope:** add the missing reconciliation cron (Section M — this is independently valuable regardless of PI-SPI), fix the double-checkout gap (Section K) with an idempotency key on booking creation, remove/archive dead code (`@vivre/types`, unused `currency.ts` functions, `PaymentSelector.tsx`/`PaymentLogos.tsx`, stale docs), rebrand/fix `/paiement/retour` (drop dead-module routing, match the current design system).
- **Risk:** Low-medium — touches live money-moving code, needs the adversarial-HTTP-testing discipline already established in this project, ideally backed by the regression tests that don't exist yet (Section Q).
- **Rollback:** straightforward — the orchestrator can be introduced additively (old direct calls kept working) and cut over route-by-route; each route is independently revertible via git.
- **Tests required:** this is the moment to introduce the first real regression tests for overselling, idempotent ticket issuance, refund duplication, and webhook idempotency — currently zero coverage exists to protect this refactor.

### Stage 2 — PI-SPI local/mock integration
- **Files affected:** new `PISPIAdapter` implementing the Stage 1 interface, using PI-SPI's published SDK/API docs against a local mock (no live credentials needed, per your stated constraint).
- **Schema changes:** likely none beyond Stage 1's `PaymentAttempt`/provider field, unless PI-SPI's participant/alias model needs new fields (e.g., a fiscal-ID field on `OrganizerVerification` or a platform-level equivalent) — flag this once PI-SPI's docs are reviewed in detail, out of scope for this audit.
- **Risk:** Low — no live money moves in this stage.
- **Rollback:** trivial — mock-backed adapter, feature-flagged off from real traffic.
- **Tests required:** contract tests against the mock (request/response shape, status mapping, webhook payload shape), building on Stage 1's regression suite.

### Stage 3 — BCEAO sandbox validation, after VIVRE enrollment + fiscal ID
- **Files affected:** same `PISPIAdapter`, now pointed at PI-SPI's real sandbox base URL (configurable, per Section P's flagged gap that CinetPay's URL is hardcoded — don't repeat that for PI-SPI).
- **Schema changes:** none expected beyond Stage 2.
- **Risk:** Medium — first real network calls to an external financial rail, even in sandbox; needs careful handling of sandbox-vs-prod credential separation from day one.
- **Rollback:** feature flag off, revert to CinetPay/manual-bridge-only.
- **Tests required:** live sandbox smoke tests for request creation, status polling, webhook receipt, refund, and payout — run manually first (per this project's established verification style), then captured as automated where the sandbox allows repeatable runs.

### Stage 4 — Production preparation
- **Files affected:** env var wiring (Vercel production), monitoring/alerting for the reconciliation sweep introduced in Stage 1, admin UI updates if PI-SPI exposes a genuinely different organizer-facing flow than the manual bridge.
- **Schema changes:** none expected.
- **Risk:** High by nature (real money, real BCEAO rail) — mitigate via a staged rollout (e.g., PI-SPI available for new bookings only, or a percentage rollout) rather than a hard cutover from the manual bridge.
- **Rollback:** keep the `ManualBridgeAdapter` and `CinetPayAdapter` (if ever activated) as permanent fallback options in the orchestrator, not code to delete — this project's whole payment story to date has been "always have a fallback that doesn't depend on a provider," and that instinct is worth preserving.

---

## V. Questions requiring your business decision

1. **Keep CinetPay as a second live rail alongside PI-SPI, or let PI-SPI supersede it?** CinetPay is fully built and free to finish activating (just needs your merchant credentials) — it could go live independently of the PI-SPI timeline if you want a faster path to automated payments while PI-SPI enrollment is pending.
2. **Does PI-SPI cover payouts/disbursements (business-originated payments), or only pay-in?** This determines whether Stage 2+ needs to design a `PISPIAdapter.payout()` at all, or whether the manual payout bridge stays permanent regardless of PI-SPI adoption on the buyer side.
3. **What should happen to the dead `VivreWallet`/`WalletTransaction` system** — finish it (so "refund to VIVRE credit" becomes real) as part of this work, or formally retire it? It's currently promised nowhere in live UI, so retiring it is low-risk, but PI-SPI's alias/wallet concepts (if any) might make it worth reviving instead.
4. **Priority of the reconciliation cron (Section M) and the double-checkout idempotency gap (Section K)** relative to PI-SPI work — both are real gaps independent of PI-SPI and could be fixed in Stage 1 regardless of the PI-SPI timeline; do you want them bundled into this migration or handled as a separate, sooner fix?
5. **Ad campaign payments and refunds** — fold into the unified `Payment` model now (Stage 1) or leave as its own thing, given ads are 100% VIVRE revenue (no organizer split) and may not need the same machinery as ticket money?
6. **Test coverage investment** — given zero automated tests exist today, how much regression-test build-out do you want bundled into Stage 1 versus treated as ongoing debt paid down over time?

---

## W. What can be safely built now, without PI-SPI sandbox credentials

Everything in **Stage 1** and most of **Stage 2**:
- The `PaymentOrchestrator` interface and adapter pattern itself.
- Wrapping the existing, working `CinetPayAdapter` and formalizing `ManualBridgeAdapter` behind it — zero new external dependency.
- The `PaymentAttempt` schema addition and status-enum normalization.
- The missing reconciliation cron (independently valuable today, even before PI-SPI).
- The idempotency-key fix for double-checkout.
- Folding `AdCampaign` payments into the shared model.
- Cleaning up dead code (`@vivre/types`, unused `currency.ts`, orphaned UI components, stale docs, the `/paiement/retour` rebrand).
- A `PISPIAdapter` built and unit-tested against a **local mock** of PI-SPI's documented request/response shapes — genuinely useful work that de-risks Stage 3, and exactly what you flagged as available today ("we can already build locally and with mocks using the PI-SPI SDK/API documentation").

**Blocked until enrollment + fiscal ID (Stage 3+):** any call against PI-SPI's real sandbox, any credential wiring, any live transaction of any kind.
