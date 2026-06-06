# VIVRE — Progress Tracker
> Living document. Read this at the start of every session to know exactly where we are.
> Last updated: 2026-06-06

---

## HOW TO USE
- ✅ Done and working
- 🔄 In progress / partially done
- ❌ Not started
- ⚠️ Known issue / needs fix

---

## PHASE 1 — Consumer App (Web PWA)

### Infrastructure & Deployment
- ✅ Monorepo: pnpm + Turborepo, 4 apps (web, api, admin, supplier) + 5 packages
- ✅ PostgreSQL + PostGIS + Redis running (Docker local, Render production)
- ✅ Render deployment: API live at https://vivre-api-ndmq.onrender.com
- ✅ Render Redis: vivre-redis provisioned and wired
- ✅ DB seeded: 10 cities, emergency numbers, 13 service categories, 7 attractions, 3 SOTRACO lines, admin account
- ✅ CI: GitHub Actions typechecks on push
- ✅ PostCSS config added — Tailwind CSS now compiles correctly (was missing, caused all styling to break)

### Auth
- ✅ OTP via Twilio Verify (not raw SMS — no phone number needed)
- ✅ Twilio trial: user's US number (+15747100846) verified on Twilio console
- ✅ International phone numbers accepted (+226 BF, +1 US, +33 FR, etc.)
- ✅ Dev mode: dev_code returned in response, OTP boxes auto-filled — no SMS needed for testing
- ✅ JWT access + refresh tokens, Redis-backed, graceful Redis fallback
- ✅ Profile setup screen after first login
- ✅ Supplier redirect banner on auth page
- ⚠️ Twilio is still on trial — only verified numbers receive real SMS. Must upgrade Twilio account before launch.

### Branding & Design
- ✅ Real VIVRE logo SVGs in `/logo & core documents/` — all variants installed to `public/icons/`
- ✅ Logo SVG inline on auth page (icon + wordmark + tagline)
- ✅ Logo SVG inline on home page header
- ✅ Tailwind design system: green #1A6B3A, gold #F5A623, red #EF2B2D, dark #1A1A2E
- ✅ Fonts: Sora, DM Sans, Plus Jakarta Sans loaded via Next.js

### Home Page (H-001)
- ✅ VIVRE logo header, green gradient
- ✅ City selector: interactive dropdown, reads cities from API, saves to localStorage
- ✅ Search bar: connected to GET /v1/search — shows results when data exists
- ✅ Module grid: Course, Repas, Hôtels, Voyage, Événements, Guides, Urgences
- ✅ Marketing banners: dynamic (events + attractions from API), falls back to static promos
- ✅ Emergency numbers banner (SAMU 15, Police 17, Pompiers 18)
- ✅ "Rejoindre VIVRE" section: Devenir livreur / Devenir chauffeur / Publier établissement / Organiser événement
- ✅ Profile icon (top-right) links to /profile
- ✅ AI assistant button (bottom-right)
- ❌ "Populaire près de vous" section — needs real data from suppliers

### User Profile
- ✅ Profile page: phone, VIVRE ID (VIV-XXXXXX), member since, verified badge
- ✅ Activity section: all bookings, orders, rides, reservations, tickets, events
- ✅ Settings: language toggle FR/EN (bilingual profile page, reloads on toggle)
- ✅ Finances: wallet link
- ✅ Account: become driver, help, logout
- 🔄 Profile photo upload: code exists, needs Firebase Storage configured (set FIREBASE_SERVICE_ACCOUNT_JSON on Render)
- ❌ Edit profile (first name, last name, email): UI exists but PUT /users/me may need testing
- ❌ Permanent VIVRE ID in DB (currently derived from UUID prefix — needs migration for sequential VIV-00001 style)
- ❌ Notifications settings page (/profile/notifications)

### Language / i18n
- ✅ Profile page: fully bilingual FR/EN with translation map + localStorage persistence
- ❌ All other pages: hardcoded French — full i18n system needed (Phase 2)
- ❌ HTML lang attribute doesn't change globally (only profile page reloads with lang)

### Payments (PaymentLogos shared component)
- ✅ Orange Money SVG logo
- ✅ Moov Money SVG logo  
- ✅ Telecel Money SVG logo
- ✅ Wave SVG logo
- ✅ Carte bancaire (card) SVG logo
- ✅ All 5 methods in shared PAYMENT_METHODS array used everywhere
- 🔄 CinetPay integration: backend routes exist, frontend checkout not fully wired
- ❌ Stripe integration: backend routes exist, no frontend checkout for tourists

### Food Delivery (/food)
- ✅ Page styled, red header, category filters, city filter
- ✅ "Trouvez votre prochain repas" empty state
- ❌ No restaurant data yet — needs suppliers to register
- ❌ Cart flow (/food/panier): needs testing end-to-end
- ❌ Order tracking (real-time via WebSocket)

### Hotels / Hébergement (/hebergement)
- ✅ Search form: city, dates, travellers, type
- ✅ Shows seeded hotels (Laïco Ouaga 2000, Hôtel Splendid, Campement Nazinga)
- ❌ Detail page: room selection, booking flow
- ❌ Payment checkout
- ❌ Booking confirmation + WhatsApp notification

### Intercity Transport (/transport)
- ✅ Search form: departure, destination, date, passengers
- ✅ Shows seeded routes (Ouaga→Bobo 3500F, →Fada 2500F, →Ouahigouya 2000F, →Banfora 4000F)
- ❌ Seat selection (seat map for intercity)
- ❌ Booking + ticket PDF
- ❌ WhatsApp ticket sharing

### Urban Transport (/transport/urbain)
- ✅ SOTRACO lines displayed (seeded: 3 lines, 18 stops)
- ✅ Multi-operator architecture: lines grouped by operator_name
- ✅ No seat maps (correct — urban buses don't need them)
- ❌ Real-time bus tracking (WebSocket — needs driver app)
- ❌ Fare payment (tap to pay on bus)

### Ride (Course) (/course)
- ❌ Pickup/dropoff location (needs Google Maps / Nominatim geocoder)
- ❌ Driver matching (WebSocket — needs driver app)
- ❌ Real-time tracking
- ❌ Payment flow

### Events (/evenements)
- ✅ Page exists, styled
- ❌ No event data yet — needs suppliers
- ❌ Ticket purchase flow
- ❌ QR code scanner for entry (/evenements/scanner)
- ❌ Event organizer publish flow (/evenements/publier)

### Tourist Guides (/guides)
- ✅ Page exists
- ❌ No guide data yet
- ❌ Guide booking flow

### Attractions (/guides/attractions)
- ✅ Seeded: 7 attractions
- ❌ Detail page needs testing
- ❌ Distinguish: supplier-registered (has tickets) vs admin-added (info only, no tickets)

### Services Publics & Urgences
- ✅ Emergency numbers: SAMU 15, Police 17, Pompiers 18, Gendarmerie 16
- ✅ 13 service categories seeded
- ❌ Public services list has no data (hospitals, pharmacies, etc.)
- ❌ On-duty pharmacy rotation
- ❌ Crowd-sourced corrections

### Wallet / Portefeuille
- ✅ Page exists, styled
- ✅ Top-up modal with all 5 payment methods (Orange Money, Moov, Telecel, Wave, Card)
- ❌ Wallet balance: API endpoint needs testing
- ❌ Transaction history
- ❌ CinetPay checkout wired to top-up

---

## PHASE 2 — Supplier Interfaces

### Restaurant Supplier (/fournisseur/restaurant)
- ✅ Page exists, styled, loads supplier's restaurants
- ✅ Role notice: amber banner if user lacks supplier role
- ❌ Add new restaurant: form with name, city, cuisine, address, opening hours, photos
- ❌ Menu management: categories, items, prices, availability
- ❌ Order management: incoming orders, accept/reject, status updates
- ❌ Analytics dashboard

### Hotel Supplier (/fournisseur/hebergement)
- ✅ Page exists, styled, loads supplier's properties
- ✅ Role notice: amber banner if user lacks supplier role
- ❌ Add property: name, type, city, address, photos, amenities
- ❌ Room type management: capacity, price, availability calendar
- ❌ Reservation management
- ❌ Analytics

### Event Organizer (/evenements/publier)
- ❌ Entire flow needs building: event creation, ticket tiers, capacity, map location
- ❌ QR code ticket generation

### Transport Company Supplier
- ❌ Company registration (intercity: STMB, TCV, etc.)
- ❌ Route + schedule management
- ❌ Pricing management

### SOTRACO / Urban Transport Operator
- ✅ Routes seeded and displayed
- ❌ Operator dashboard: update routes, fares, stops
- ❌ Admin can also edit on behalf

### Guide Registration
- ❌ Guide profile: languages, specialties, certifications
- ❌ Availability calendar
- ❌ Booking management

### Tourist Attraction Supplier
- ❌ Supplier-registered: full profile + ticket booking
- ❌ Admin-added: info only (no tickets, users find tickets at site)

---

## PHASE 2 — Driver App

### Delivery Driver (Livreur)
- ✅ Registration page (/devenir-livreur): vehicle type (zémidjan/taxi), city, documents
- ❌ Driver dashboard (/livreur): active orders, status toggle
- ❌ Earnings (/livreur/gains)
- ❌ Real-time order requests (WebSocket)
- ❌ Navigation integration

### Taxi/Transport Driver (Chauffeur)
- ✅ Registration via same /devenir-livreur page (taxi option)
- ❌ Separate driver dashboard for rides vs deliveries
- ❌ Real-time ride requests
- ❌ GPS position broadcasting

---

## PHASE 2 — Admin Dashboard (apps/admin)

- ✅ ~90% built (overview, drivers, restaurants, payouts, pricing all done)
- ❌ Supplier approval workflow
- ❌ City/module management
- ❌ Analytics dashboard
- ❌ Tourist attraction management (admin-added places)
- ❌ Refund processing

---

## KNOWN TECHNICAL DEBT / ISSUES TO FIX

### Critical
- ⚠️ Twilio trial: only verified numbers get SMS — must upgrade before launch
- ⚠️ Firebase Storage not configured — profile photo upload fails silently
- ⚠️ No Google Maps / geocoder — ride pickup/dropoff location doesn't work
- ⚠️ Render free tier: DB expires 2026-07-02 — need to upgrade or export data before then

### Important
- ⚠️ Search bar: works when data exists, empty state when no suppliers registered
- ⚠️ City management: suppliers can't add new cities yet — admin must add them
- ⚠️ VIVRE ID: currently derived from UUID prefix (VIV-XXXXXX) — needs DB migration for sequential IDs
- ⚠️ Language: only profile page is bilingual — full i18n needs next-intl or similar
- ⚠️ WhatsApp notifications: backend code exists but not wired to frontend flows
- ⚠️ CinetPay webhooks: need ngrok/public URL for local testing

### Minor
- ⚠️ Dev mode banner on auth: visible in production builds — should only show in development
- ⚠️ Marketing banners: static fallback promos are hardcoded — should come from DB/CMS
- ⚠️ Promo codes table exists in DB but no UI anywhere

---

## MISSING MODULES (Phase 3+)

- ❌ Vols Domestiques (domestic flights)
- ❌ Location de Voitures (car rental)
- ❌ WhatsApp Business: ticket sharing, order confirmations, ride updates

---

## ENVIRONMENT / CREDENTIALS

### Render (production)
- API: https://vivre-api-ndmq.onrender.com
- Web: https://vivre-web.onrender.com
- DB: dpg-d8fks267r5hc73a7lah0-a (expires 2026-07-02 ⚠️)
- Redis: red-d8gaecv7f7vs73fnaavg
- TWILIO_AUTH_TOKEN: set manually in Render dashboard
- FIREBASE_SERVICE_ACCOUNT_JSON: NOT SET — needed for profile photos

### Local
- Web: http://localhost:3000
- API: http://localhost:3001
- Docker: PostgreSQL :5432, Redis :6379, pgAdmin :5050
- Dev OTP: returned as dev_code in API response — no SMS needed

### Twilio
- Account SID: see Render dashboard env vars
- Verify Service SID: see Render dashboard env vars
- Status: Trial account — only verified numbers receive SMS

---

## NEXT SESSION PRIORITIES

When resuming, do these in order:

1. **Test all consumer flows end-to-end** (food, transport, hotels) — fix anything broken
2. **Add real supplier data** — register a test restaurant, hotel, event so pages have content
3. **Wire CinetPay checkout** — end-to-end payment for at least one flow (food delivery)
4. **Profile photo upload** — set Firebase credentials on Render
5. **Google Maps / Nominatim** — wire geocoder to ride booking and supplier address fields
6. **Start Phase 2: Restaurant supplier interface** — menu, orders, analytics
7. **Start Phase 2: Hotel supplier interface** — rooms, calendar, reservations

---

## SESSION LOG

| Date | What was done |
|------|--------------|
| 2026-05-31 | Routing fixes (auth, admin/supplier root conflicts), payout service |
| 2026-06-02 | Render deployment setup, Docker fixes, Prisma binary targets |
| 2026-06-03 | Redis on Render, DB seeded, Twilio Verify integration, OTP auth working |
| 2026-06-05 | PostCSS config (Tailwind was broken!), real logos, payment SVG logos, city picker, dynamic banners, SOTRACO multi-operator, Twilio trial fix, international phone numbers |
| 2026-06-06 | Core documents read, Wave payment added, profile VIVRE ID, FR/EN language toggle, Rejoindre VIVRE expanded (4 cards), supplier role notice, auth supplier banner, progress tracker created |
