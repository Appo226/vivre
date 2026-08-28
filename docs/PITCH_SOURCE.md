# VIVRE — Pitch & Sales Source Document

> Living document, not a deck. This is raw material — keep adding to it as things
> happen (new features, real traction, decisions made for a reason). When a specific
> deliverable is needed (investor one-pager, PPTX deck, client-facing sales sheet),
> generate it FROM this doc, tailored to that audience — don't try to make one
> document serve every audience at once.
>
> Started 2026-08-19. Everything below is either a real, shipped fact (marked as
> such) or an explicit placeholder for you to fill in — nothing here is invented
> traction, invented numbers, or invented team bios. Fill in the `[ ]` placeholders
> yourself; I won't guess at those.

---

## One-liner

VIVRE is a mobile-first event ticketing platform built for Burkina Faso — buy and
sell tickets with a phone number, no bank card or app-store install required.

## The problem

Event ticketing in Burkina Faso today mostly runs on word of mouth, WhatsApp
group chats, and cash at the door — no reliable way to know if a "sold out" event
is really sold out, no digital proof of purchase, no easy way for an organizer to
reach buyers again (refunds, reschedules, reminders), and no low-friction way for
a first-time organizer to sell tickets online without a bank account or a
developer.

## The solution

VIVRE is a phone-number-only ticketing platform, installable as a PWA (no App
Store review, no download friction) — an organizer publishes an event in minutes,
buyers get a scannable QR ticket instantly, and door staff scan with any phone's
camera. No smartcard readers, no proprietary hardware.

## Why this approach, why now

- **Phone-number auth, not email/bank card** — matches how people in Burkina Faso
  actually identify themselves online. Free events require zero payment friction
  at all; paid events use a manual mobile-money bridge today (organizer's payout
  number shown to the buyer) with CinetPay integration already built and ready to
  flip on once merchant onboarding is done (see roadmap doc).
- **WhatsApp over SMS for verification codes** — WhatsApp is the dominant
  messaging app in Burkina Faso; SMS delivery is comparatively unreliable there
  and costs real money per message. This was a deliberate call, not a default.
- **PWA over native app** — zero App Store/Play Store review cycle, works on any
  phone with a browser, "Add to Home Screen" gives an app-like experience without
  the $99/yr Apple Developer Program or Play Store fee — those only become worth
  paying once discoverability-by-search matters more than removing friction.
- **Built on zero/near-zero-cost infrastructure** — Vercel + Supabase free tiers,
  OpenStreetMap/MapLibre instead of Google Maps' paid API, free-tier email — a
  deliberate discipline that keeps the platform's own margins high before there's
  any real revenue, and means pricing can stay aggressive for early organizers.

## What's actually built and live today (2026-08-19)

**For attendees:**
- Browse events by category (14 categories) or city, free-text search, city filter.
- Buy tickets — free events confirm instantly; paid events via manual mobile-money
  bridge today, CinetPay-ready for zero-code activation later.
- Scannable QR ticket, viewable in-app, no PDF/print required.
- Transfer a ticket to someone else by their phone number.
- Optional merch: an organizer can bundle items into a ticket price (e.g. a
  T-shirt included in VIP), or offer separate optional add-on products a buyer
  chooses to purchase alongside any ticket.
- Directions to the venue (address + one-tap Google Maps link) once the organizer
  has set the exact location on a map.

**For organizers:**
- Publish an event in a guided multi-step form — photos, ticket tiers (unlimited,
  independently priced/named/described), optional merch, safety info.
- Free events publish instantly; paid events go through a short admin review
  (identity + payout-account verification) before going live — a real fraud/trust
  gate, not just a rubber stamp.
- Grant scan-only door access to staff by phone number, without sharing the
  organizer's own login.
- Cancel or reschedule an event with automatic buyer refund queuing.
- Real-time sales dashboard: revenue, capacity fill rate, sell-through by ticket
  tier, check-in rate.
- Graduated trust payout system — new organizers wait longer for payout after an
  event than organizers with a track record of clean, dispute-free paid events;
  this shortens automatically as trust builds, not a manual admin decision each time.

**For advertisers (new: the ad marketplace):**
- Submit a campaign (image or short video, ≤15s) for a placement on the platform.
- Goes through admin pre-approval before any money is discussed — advertiser only
  pays once approved, never speculatively.
- Runs automatically for exactly the date window paid for, then comes down
  automatically — no manual toggling, no risk of billing for time not delivered.
- Pricing admin-adjustable in real time as real traffic data comes in, without a
  code deploy.

**Platform/trust infrastructure:**
- Admin dashboard: event approval queue, organizer identity verification queue,
  refund processing, payout processing, ad campaign review, platform-wide settings
  (commission %, fees, payout delay windows) — all adjustable without a redeploy.
- Overselling and promo-code abuse are prevented with real database-level
  concurrency locks, not just UI validation — verified under actual concurrent
  load, not assumed.
- Email notifications for the moments that matter (ticket transferred, event
  approved/rejected, refund processed, verification decided).

## Market & competition

Full sourced research, competitive deep-dive, growth strategy, and long-term
scale thinking live in `docs/STRATEGIC_REVIEW.md` — this is the pitch-ready
summary of it.

- **Market context (sourced):** Burkina Faso — 23.5M people, median age 18,
  62% under 25. Mobile money penetration (52–55%) is more than double general
  internet penetration (23.4%) — the whole product is built around that gap,
  betting on the payment/messaging rails that are actually there (mobile money +
  WhatsApp) instead of ones that aren't (cards, generic SMS). Africa-wide event
  ticketing revenue: $1.02B (2024) → $1.179B (2028).
- **This is not an empty market — six real competitors found**, four Burkina-Faso-
  specific (FasoEvent, Faso Billetterie, Temba, E-events) and two pan-African
  platforms active in BF (Tikerama, My Place Events — the latter with real stated
  traction: ~400 organizers, 98% buyer repeat-purchase rate). A pitch that claims
  "no competition" would be wrong and would read as under-researched.
- **What no competitor found offers, in their own public marketing:** ticket
  transfer, merch bundling (mandatory or optional add-on), delegated door-staff
  scan access without sharing a login, or an integrated ad marketplace. Real,
  checkable differentiators today, not aspirational ones.
- **The sharpest edge:** none of the six publish any visible fraud-prevention,
  organizer verification, or dispute infrastructure. In a young digital-ticketing
  market, one visible scam anywhere teaches buyers to distrust the *category*, not
  just the platform it happened on — being visibly the most trustworthy platform
  (real KYC, graduated organizer trust/payout, admin review that's actually a
  gate) is a defensive move for the whole space, not just a feature checkbox.
- **The scale playbook:** go deep in one country first — every product decision
  (WhatsApp OTP, FCFA-native, BF-specific category taxonomy, a manual
  mobile-money bridge tuned to how BF organizers are actually paid today) tuned
  for Burkina Faso specifically, not averaged across ten markets like the
  pan-African players. Prove that discipline works here, then repeat it
  market by market — the same expansion Tikerama and My Place Events already
  did, minus the "go deep first" step they appear to have skipped.

## Business model

- **Organizer-side commission** on paid ticket sales (rate admin-configurable;
  currently in a launch period at a reduced/promotional rate — see platform
  settings for the live number).
- **Advertising** — placement-based flat-rate pricing (per day, per placement),
  not a complex bidding auction — simple to explain to a first-time advertiser.
- **Two revenue lines already live, not roadmap** — most competitors researched
  appear to be ticket-commission-only; a second (and eventually third, once merch
  purchases scale) revenue stream means healthier unit economics in a market
  where individual ticket prices run as low as 500 FCFA.
- [ ] Fill in: any target commission rate, any signed/verbal commitments from real
  organizers or advertisers, any actual revenue collected to date.

## Traction

- [ ] This section is intentionally empty except for what's verifiably shipped
  (above) — fill in real numbers here once they exist: organizers signed up,
  events published, tickets sold, GMV processed, advertisers signed. Don't let a
  future version of this doc claim traction that isn't real.

## Team

- [ ] Fill in: founder(s), relevant background, why you're the right team for this.

## What's next (near-term roadmap)

- WhatsApp Business API going live for OTP — the last blocker to any stranger
  signing up with their own phone number without a pre-shared demo link.
- CinetPay activation, pending RCCM business registration.
- Real-device QR scanner testing before relying on it at a live event door.
- See `docs/POST_MVP_ROADMAP.md` for the complete, current technical roadmap.

## Talking points worth remembering for a pitch

- The platform was built with a real, working, adversarially-tested money-safety
  bar throughout — not "trust me," concurrent-load tests were actually run against
  overselling, promo-code abuse, and the ad-campaign billing lifecycle before each
  was considered done.
- Every core decision (WhatsApp over SMS, PWA over native, manual mobile-money
  bridge before CinetPay, phone-only auth) was made *for* the Burkina Faso market
  specifically, not a generic "ticketing app" template adapted after the fact.
- Zero/near-zero infrastructure cost by design means the unit economics work even
  at small early scale — this isn't a platform that needs thousands of users
  before it stops losing money on hosting.
