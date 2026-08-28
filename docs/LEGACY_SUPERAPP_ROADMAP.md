# VIVRE Super-App — Shelved Modules (Future Scalability Roadmap)

> Archived 2026-08-17. VIVRE is pivoting to focus exclusively on event ticketing
> (Posh-style). The modules below are **not deleted** — schema, API routes, and
> web pages remain in the codebase — they are simply removed from nav/home and
> paused. Revisit once the ticketing product has real organizer + attendee
> traction: the natural expansion path is cross-selling these to people who
> are already on the platform for an event (ride to the venue, food at the
> venue, hotel for out-of-town attendees, etc).
>
> Source: this is the non-ticketing subset of the original `VIVRE_PROGRESS.md`
> (session 4, 2026-06-06), preserved verbatim for continuity.

---

## Why keep these instead of deleting

Event ticketing gives VIVRE a wedge: organizers and attendees create a
recurring reason to open the app, plus verified phone auth, payment methods
(Orange Money, Moov, Telecel, Wave, CinetPay, Stripe), and a wallet already
wired. Every module below becomes cheaper to launch once that base exists,
because it's mostly "who's already here and what do they need next":

- Someone buying a concert ticket in Bobo-Dioulasso 3 days out → **hotel**
- Someone leaving a sold-out show at midnight → **ride (course)**
- Someone at an all-day festival → **food delivery** to the venue
- Someone traveling from Ouaga to attend → **intercity transport**

## Food Delivery (/food)
- Page styled, red header, category filters, city filter
- "Trouvez votre prochain repas" empty state
- No restaurant data yet — needs suppliers to register
- Cart flow (/food/panier): needs testing end-to-end
- Order tracking (real-time via WebSocket) — not built

## Hotels / Hébergement (/hebergement)
- Search form: city, dates, travellers, type — built
- Shows seeded hotels (Laïco Ouaga 2000, Hôtel Splendid, Campement Nazinga)
- Detail page (room selection, booking flow) — not built
- Payment checkout — not built
- Booking confirmation + WhatsApp notification — not built

## Intercity Transport (/transport)
- Search form: departure, destination, date, passengers — built
- Shows seeded routes (Ouaga→Bobo 3500F, →Fada 2500F, →Ouahigouya 2000F, →Banfora 4000F)
- Seat selection, booking + ticket PDF, WhatsApp ticket sharing — not built

## Urban Transport (/transport/urbain)
- SOTRACO lines displayed (seeded: 3 lines, 18 stops), multi-operator architecture — built
- Real-time bus tracking (WebSocket, needs driver app) — not built
- Fare payment (tap to pay on bus) — not built

## Ride (Course) (/course)
- Pickup/dropoff location — needs Google Maps / Nominatim geocoder, not built
- Driver matching (WebSocket), real-time tracking, payment flow — not built

## Tourist Guides (/guides) & Attractions (/guides/attractions)
- Guides page exists, no guide data yet, no booking flow
- 7 attractions seeded; detail page needs testing
- Needs to distinguish supplier-registered (ticketed) vs admin-added (info only)

## Services Publics & Urgences
- Emergency numbers (SAMU 15, Police 17, Pompiers 18, Gendarmerie 16) — built, keep visible even post-pivot (low cost, high trust value)
- 13 service categories seeded, but no actual public services data (hospitals, pharmacies)
- On-duty pharmacy rotation, crowd-sourced corrections — not built

## Driver App (Phase 2)
- Delivery driver (livreur) registration (/devenir-livreur) — built
- Driver dashboard, earnings, real-time order requests, navigation — not built
- Taxi/chauffeur: separate dashboard, real-time ride requests, GPS broadcasting — not built

## Supplier Interfaces (restaurant / hotel) — Phase 2
- Restaurant + hotel supplier pages exist (styled, role-gated), but menu/room/inventory management, order/reservation management, and analytics are all unbuilt.

## Wallet (Portefeuille) — general use beyond tickets
- Page + top-up modal (all 5 payment methods) built
- Balance API, transaction history, CinetPay checkout wiring — not built
- `VivreWallet` / `WalletTransaction` Prisma models already support this generally, not just for ticket refunds

## Known infra/tech debt relevant if these modules come back
- Twilio was on trial (only verified numbers get SMS) — must upgrade before any module goes to real users
- No Google Maps / geocoder — blocks ride and delivery location features specifically
- i18n (FR/EN) was only ~5% done (profile page only) — needed platform-wide regardless of module
- Render Postgres DB had a 2026-07-02 expiry noted in the old progress tracker — check current DB status before assuming any of this data still exists

---

**Do not resurrect these by default.** Each one should only come back after
the ticketing product has enough organizer/attendee volume that the
cross-sell hypothesis above is worth testing, and after checking this doc
against current code — it may have drifted.
