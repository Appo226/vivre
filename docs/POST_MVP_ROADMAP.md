# VIVRE — Post-MVP Roadmap

> Updated 2026-08-19. The MVP is live at [vivrebf.com](https://vivrebf.com) — buy/browse
> tickets, QR check-in, ticket transfer, organizer publishing + KYC, admin dashboard, and
> email notifications all work end to end, plus everything in "Shipped this session" below.
> Nothing in this list blocks testing, demoing, or a hands-on pilot where you're personally
> following up on transactions. Tackle these once there's real traction, or once a specific
> one becomes the actual bottleneck — not on a fixed schedule.

---

## Blocked on your action, not a build task

- **WhatsApp Business Cloud API for real OTP delivery — the most important item
  on this whole list, still open.** Right now, in production, the *only* way anyone
  logs into VIVRE is if their number is on the OTP allowlist or they have the
  demo-access link. **A random stranger who visits vivrebf.com and tries to sign up
  with their own number gets a hard error.** This is what stands between VIVRE and
  any real, organic user ever creating an account. In progress: Meta account
  verification has been fighting you (codes not delivering across email/SMS/multiple
  browsers) — paused, picking back up when you're ready. The code path is fully
  ready and waiting (`lib/otp-channel.ts`, `OTP_CHANNEL=whatsapp`) — just needs real
  `WHATSAPP_BUSINESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` once the Meta App is set up.
  Also decided against Twilio/SMS — WhatsApp is free per message and the dominant
  channel in Burkina Faso; SMS would cost real money per message for a worse fit.
- **CinetPay activation** — needs RCCM business registration first, then CinetPay
  merchant onboarding. Once you have `CINETPAY_API_KEY`/`CINETPAY_SITE_ID`, the
  integration is already built (`lib/cinetpay.ts`) and goes live with zero code
  changes. Until then, paid tickets use a manual mobile-money bridge (organizer's
  verified payout number shown to the buyer, organizer confirms receipt).
- ~~Resend email domain verification~~ **Done** — `vivrebf.com` verified, email
  notifications live and confirmed delivering (checked via Resend's own send log).
- **Capacitor iOS/Android app-store wrapping** — real costs ($99/yr Apple Developer
  Program, $25 one-time Google Play). Not required for testing or demos — the app
  is already a PWA, installable via "Add to Home Screen" on any phone with no
  store review. Only worth doing once you want VIVRE discoverable by searching the
  App Store / Play Store by name.

## Shipped this session (2026-08-19)

A lot landed since the roadmap was first written — listed here so this doc doesn't
go stale against what's actually live. Full technical detail lives in session
memory; this is just the "what exists now" summary.

- **Location & maps** — city filter on the browse page, real venue address +
  "Itinéraire" directions link on event pages (free `maps.google.com` deep link, no
  paid API), mandatory lat/lng enforced server-side, one-tap "use my GPS position"
  button for organizers publishing an event.
- **Event-staff scanning access** — organizer can grant scan-only access to a phone
  number for one specific event, without sharing their own login. Panel in the
  Réservations page; the person just logs in with their own OTP.
- **Category taxonomy expanded (8 → 14) + multi-tagging** — added Général, Soirée,
  Mariage, Humour, Formation, Art & Expo. An event keeps one required primary
  category (drives its badge color) plus up to 5 optional secondary tags for
  discovery. **Known gap:** secondary tags aren't shown anywhere visually on the
  event itself — they only affect what a buyer sees when browsing by that category.
- **Merch — both patterns built:**
  - *Mandatory bundle* (Pattern A): a ticket tier can include free-text "included
    items" (e.g. "1 T-shirt VIVRE") and a variant picker (e.g. sizes), already
    priced into the ticket.
  - *Optional add-on* (Pattern B): a separate catalog of products a buyer can add
    to any ticket purchase, own price/stock/variants, same oversell protection as
    tickets.
- **Dead code removed** — `apps/api` (unused Fastify service), `apps/admin` and
  `apps/supplier` (pre-pivot food/transport consoles) deleted. Everything real
  lives in `apps/web` now; the workspace is simpler.
- **Landing/home redesign** — textured hero (replacing a flat solid-color block),
  a live "X événements à venir" badge with real counts, a scrolling ticker of
  actual upcoming events, and a crossfading photo backdrop built from real event
  cover photos (not stock video). Applied to both `/auth` (the real first
  impression) and the post-login home.
- **Logo mark replaced** — swapped for a cleaner, more symmetric version found
  among the brand assets already in the repo; fixed a real bug where the source
  art's white stroke outline didn't blend on VIVRE's dark surfaces.
- **Ad marketplace, including video** — submit → admin pre-approves → advertiser
  pays → runs automatically on its date window, no cron job (same "just check the
  date live" trick already used for ticket sale windows). Two placements defined
  (`hero_carousel`, `browse_tile`); **only `hero_carousel` is actually wired into a
  page** — it shows as a labeled "Sponsorisé" entry in the home ticker with click
  tracking. `browse_tile` has full pricing/approval support but nothing renders it
  yet. Pricing is admin-editable in `/admin/parametres` under "Publicité" (no
  code/DB access needed to change rates). Video creative (MP4 only, ≤15s, ≤20MB) is
  supported with real server-side duration enforcement (reads the MP4 container's
  own metadata — no ffmpeg) — proven to reject an over-length video even when the
  browser-side check is bypassed entirely.

## Testing & reliability

- **QR scanner on real hardware** — never verified on an actual phone camera,
  only in a desktop browser. Camera permission behavior and scan performance can
  differ meaningfully on real iOS/Android. Do this before relying on it at a real
  event door.
- **Automated regression suite** — money paths (overselling, promo-code races,
  cancel/refund windows, payout eligibility) and the newer ad-campaign lifecycle
  (approve/pay/date-window auto-start-stop) were all verified with real adversarial
  scripts as each feature was built — but those were one-off, not a standing suite
  that runs on every future change. Worth turning into real tests once things
  stabilize and change less often.
- **Error tracking / uptime monitoring** — nothing wired up (no Sentry, no
  external status checks). Fine while you're the one testing everything by hand;
  worth adding before real strangers are transacting unsupervised.

## AI Assistant ("Merlin")

Frontend widget exists (`components/AiChat.tsx`) but is currently unrendered —
no backend (`/api/ai/chat` doesn't exist). Decide if/when this is worth building;
it was originally spec'd to answer FR/EN/Mooré/Dioula questions contextualized to
Burkina Faso ("Où dormir pas cher à Bobo ?" style), never mention being powered
by Claude/Anthropic.

## Legal

`terms`, `privacy`, and `conditions-organisateur` pages are explicit drafts,
written to cover the real policies in place (24h buyer report window, refund
rules, cancellation/reschedule handling) but **not lawyer-reviewed**. Fine for a
supervised pilot; get real legal review before wide public launch, especially
once real money is moving without your manual oversight of every transaction.

## Hosting

Vercel Hobby (current, free) works fine through the pilot/demo phase, but its
terms are for non-commercial use. Budget for **Vercel Pro ($20/mo)** before wide
real-user or paid traffic — that's a plan upgrade, not a migration, so no rebuild
needed. If VIVRE ever needs to leave Vercel entirely, the domain is unaffected
(DNS is decoupled from hosting) and the stack (Next.js + Supabase/Postgres) is
portable — not a rewrite.

## Old super-app modules (separate doc)

Food delivery, transport, hotels, ride-hailing, tourist guides — see
[`LEGACY_SUPERAPP_ROADMAP.md`](./LEGACY_SUPERAPP_ROADMAP.md) for what's archived
and the reasoning for revisiting them as cross-sells once ticketing has real
organizer + attendee traction.
