# VIVRE — Strategic Review

**A letter to whoever reads this next — an investor, a grant committee, a future
teammate, or just us in a year, checking whether we still believe what we wrote.**

*Compiled 2026-08-19. Every factual claim below is either linked to a public
source or explicitly marked **[ESTIMATE]** with the method behind it stated in
the open. Where we're not certain, we say so, rather than rounding uncertainty
off into false confidence. Re-verify anything cited here older than about twelve
months before repeating it in a real investor or grant conversation — this
market moves fast, and a stale number is worse than no number.*

---

## Letter to the reader

We started VIVRE with a simple observation: in Burkina Faso, buying a ticket to
a concert, a wedding, a football match, or a conference still mostly means
trusting word of mouth, joining a WhatsApp group, or showing up with cash and
hoping. There was no reliable way to know if "sold out" really meant sold out,
no digital proof of purchase, no easy way for an organizer to reach their own
buyers again if a show moved or got cancelled, and no low-friction way for a
first-time organizer to sell tickets online without a bank account or a
developer on staff.

But we don't want to undersell what's actually at stake underneath the
logistics. A concert, a wedding, a football match, a graduation party — these
are the moments people in Burkina Faso actually live for, the ones that make a
hard week worth it. When buying a ticket is stressful, uncertain, or just
unavailable to someone without a bank card, that friction isn't just a
business inefficiency — it's standing between people and the fun, the joy,
the shared moments that make life better. We think a company that makes those
moments easier to access, easier to trust, and easier to share is doing real
good in the world, not just running a good business. Those two things aren't
in tension for us; we think they're the same project.

That gap is what this document is about — not just describing it, but showing
our work on how we sized it, who else is already standing in it, and why we
believe VIVRE is built to win it. We've written this the way we'd want a real
strategic filing to read: a clear thesis up front, the facts and their sources
laid out honestly, our reasoning shown rather than asserted, and the risks
named instead of buried. Where we're estimating rather than citing, we say so
and show the method — an estimate you can audit is worth more than a number you
have to take on faith.

**The short version of our thesis**: Burkina Faso's population is young (median
age 18), increasingly urban, and already living on mobile money and WhatsApp
far more than on bank cards or generic internet access. Nobody has yet built a
ticketing platform *for* that reality — one where a phone number is the only
identity you need, where a PWA replaces an app-store download, and where the
payment rails match how people already move money. Six real competitors have
proven the category works here. None of them, on the evidence we can find,
have gone all the way down that specific road. That's the space we're building
in.

What follows is organized like a filing, in numbered items, because that
structure makes it easy to find any one thing again. But read start to finish
and it should read as one argument, not a pile of disconnected facts: here is
the problem, here is why it's real and sized correctly, here is who else is
in this fight and why we believe we win it, here is how we plan to grow, and
here is how we think — carefully, not wishfully — about what winning could
someday be worth.

---

## Item 1 — The Business

### 1.1 The problem, stated plainly

Event ticketing in Burkina Faso today runs mostly outside any digital system:
word of mouth, WhatsApp group chats, and cash paid at the door. That leaves
four concrete gaps that a real platform can close — no reliable signal of real
availability ("sold out" is often just a rumor), no digital proof of purchase
a buyer can point to if something goes wrong, no channel for an organizer to
reach their own past buyers again (a refund, a reschedule, a reminder), and no
low-friction way for a *first-time* organizer — someone with no developer, no
merchant account, no institutional backing — to sell tickets online at all.

### 1.2 The solution

VIVRE is a phone-number-only ticketing platform: an organizer publishes an
event in a guided flow in minutes; a buyer signs up and pays with the number
they already have, no bank card and no app-store install required (VIVRE
installs as a PWA — "Add to Home Screen" — with no review cycle and no
storage commitment before a first purchase); every buyer gets a scannable QR
ticket instantly; door staff scan with any phone's camera, no proprietary
hardware. Underneath the mechanics, the goal is simple: getting to the fun
part — the concert, the wedding, the match, the show — should be the easy
part, not the part that costs someone an afternoon of uncertainty. The
product decisions below aren't a generic ticketing template adapted after
the fact — each one was made specifically for how Burkina Faso actually pays,
messages, and browses (see Item 2.1 for the data behind each call):

- **Phone-number authentication**, not email or bank card — matches how
  people in Burkina Faso actually identify themselves online.
- **WhatsApp over SMS** for verification codes — WhatsApp is the dominant
  messaging surface here; SMS delivery is comparatively unreliable and costs
  real money per message.
- **PWA over native app** — removes the App Store/Play Store review cycle and
  the install-friction tax entirely; those costs only become worth paying
  once discoverability-by-store-search matters more than removing friction.
- **Mobile money as the default payment rail**, not cards — a manual
  mobile-money bridge is live today, with a full CinetPay integration already
  built and ready to switch on with zero further code once merchant
  onboarding is complete.

The full, current feature inventory — what's shipped for attendees,
organizers, and advertisers — lives in `docs/PITCH_SOURCE.md`, kept current as
a living build log; this document focuses on the market and competitive
thinking behind those choices rather than repeating the feature list.

### 1.3 The business model

Two revenue lines are live today, not roadmap: an **organizer-side commission**
on paid ticket sales (rate admin-configurable; currently at a reduced launch
rate), and **placement-based advertising**, sold as simple flat-rate,
date-windowed placements rather than a bidding auction — easy to explain to a
first-time advertiser, and it runs and stops automatically on the dates paid
for. A third line — margin on optional merchandise attached to a ticket
purchase — is built and shipping, with volume still to come. Most competitors
we could find (Item 3) appear to run on ticket commission alone; a second and
third revenue line matters specifically in a market where individual ticket
prices run as low as 500 FCFA and thin per-ticket margins are the norm.

---

## Item 2 — Market Opportunity

### 2.1 Burkina Faso, sized

**Population and demographics.** Burkina Faso's population is 23.5 million
people (2026). It is young and getting more urban: median age 18, with 62.1%
of the population under 25 and a 15–29 "youth bulge" that makes up 48.9% of
the population aged 15 and over — the core event-going demographic is not a
niche here, it's the majority of the country
([Worldometer](https://www.worldometers.info/demographics/burkina-faso-demographics/)).
The urban share is 34.5% (~8.1M people), up from 15.5% in 1996 and projected
to reach 52% by 2050, and it is heavily concentrated: Ouagadougou (46.4% of
the urban population, ~3.15M people, growing ~3.9%/year) and Bobo-Dioulasso
(15.4%) together account for roughly 62% of all urban Burkinabè
([UN-Habitat](https://unhabitat.org/burkina-faso),
[World Population Review](https://worldpopulationreview.com/cities/burkina-faso/ouagadougou)).
GDP per capita is roughly $1,319 (~791,000 FCFA) (2026), with the economy growing 5.3–6.3% in
2025–2026, driven by gold production and agriculture
([World Bank](https://thedocs.worldbank.org/en/doc/bae48ff2fefc5a869546775b3f010735-0500062021/related/mpo-bfa.pdf),
[AfDB](https://www.afdb.org/en/countries/west-africa/burkina-faso/burkina-faso-economic-outlook)).

**Connectivity and payments — the infrastructure VIVRE is actually built on.**
This is the fact that shapes every product decision in Item 1.2, so it's
worth stating precisely. Mobile subscriptions run at 120% penetration
(multi-SIM is common, so this overstates unique users), and mobile *internet*
subscriptions specifically sit at 78.6% penetration (~19.4M subscriptions,
March 2026) — but general internet penetration across any device is only
23.4%
([DataReportal](https://datareportal.com/reports/digital-2026-burkina-faso),
[Statista](https://www.statista.com/outlook/co/digital-connectivity-indicators/burkina-faso)).
Mobile money penetration sits at 52–55% of the population — roughly 8.5M
accounts against 22M+ inhabitants, with Orange Money holding about 62% share,
Moov Money about 25%, and Telecel about 10%, though fewer than 20% of adults
are *actively* transacting on it regularly
([The Fintech Times](https://thefintechtimes.com/burkina-fasos-fintech-ecosystem-in-2026/),
[Kolonell](https://kolonell.com/fr/blog/couverture-pays-operateurs-mobile-money-afrique-francophone-2026)).

Put those together and the pattern is unambiguous: mobile money penetration
(52–55%) is more than double general internet penetration (23.4%), and mobile
internet specifically (78.6%) is the connectivity layer that's actually
saturated. A platform built around bank cards or a generic desktop-web
experience would be designing for infrastructure that mostly isn't there. A
platform built around mobile money and WhatsApp — both riding on mobile
internet penetration that's already near-universal — is designing for the
infrastructure that actually exists today. That single fact, more than any
other, is why VIVRE looks the way it does.

### 2.2 Market sizing — how we think about TAM, SAM, and SOM

We want to be direct about the discipline we're applying here, because market
sizing is where it's easiest for a strategy document to quietly start lying to
itself. We only state a number as fact when it's sourced. Where no sourced
number exists — which is the case for Burkina Faso specifically, since it's
too small a market to be broken out by the research firms that publish this
data — we build a bottom-up estimate, label it as an estimate, and show the
exact method, so anyone reading this can check our arithmetic and disagree
with our assumptions if they think we're wrong.

One disclosure up front, since this section is dense with both currencies:
every dollar figure below shows its approximate FCFA equivalent in brackets,
converted at a rounded rate of roughly **600 FCFA per USD** (the CFA franc is
pegged to the euro at 655.957 FCFA, and EUR/USD has hovered close to parity
through 2026 — this is an orientation figure, not a rate to transact on, and
should be refreshed against a live rate before any real financial use).

We also want to be direct about a discipline choice: every dollar figure below
is built two ways where that's possible — a top-down cross-check and a
bottom-up estimate — precisely so the two can be compared against each other.
When they agree, that's real signal. When they disagree, as they do here,
saying so and explaining why is more useful to us than picking whichever
number sounds better and moving on.

**TAM — three levels, continent down to country, each one checked against
the next.** The only fully sourced figure in this space is continent-wide:
Africa-wide event-ticketing revenue was $1.02B (~612B FCFA) in 2024,
projected to reach $1.179B (~707B FCFA) by 2028 (3.69% CAGR), with sports
tickets alone at $456.7M (~274B FCFA) (2024) and music events growing toward
$416.2M (~250B FCFA) (2028)
([Statista](https://www.statista.com/outlook/dmo/eservices/event-tickets/africa)).
Neither West Africa nor Burkina Faso is broken out at that source — both are
too small a slice for the firms that publish continental data to report
separately — so we built each level down from the continental figure
ourselves, checking our method against real numbers wherever they exist
rather than compounding estimates blindly.

**West Africa — the regional figure, checked against Nigeria's real, sourced
number.** Dividing the Africa-wide 2024 figure by Africa's 2024 population
(~1.515 billion,
[StatisticsTimes](https://statisticstimes.com/demographics/africa-population.php))
gives an implied per-capita ticketing spend of about $0.673/person
(~400 FCFA/person). Applied to West Africa's population of roughly 468
million (2025,
[Worldometer](https://www.worldometers.info/world-population/western-africa-population/)),
that implies a **West Africa TAM of roughly $315M (~189B FCFA) [ESTIMATE]**.
We didn't stop at the top-down number, because West Africa — unlike Burkina
Faso — actually has one real, sourced country-level figure to check it
against: Nigeria, the region's largest market by far, reports its own Event
Tickets revenue at $146.90M (~88.1B FCFA) for 2024 against a population of
about 232.7 million
([Statista](https://www.statista.com/outlook/dmo/eservices/event-tickets/nigeria)).
That works out to roughly **$0.631/person for Nigeria specifically** — almost
exactly the $0.673/person continental average, which is a genuinely useful
result: it means the continental per-capita rate is a reasonable basis for
estimating a large, relatively developed West African economy like Nigeria's.
It also does the opposite of reassuring us about Burkina Faso: if Nigeria — a
wealthier, far more digitized ticketing market — sits almost exactly at the
continental average, that average is very likely being pulled up by markets
like Nigeria, Egypt, and South Africa, which is precisely why we don't treat
the same per-capita rate as reliable for a market as different from those as
Burkina Faso's, below. We're showing our work here rather than asserting it,
because it's the same instinct that keeps the rest of this document honest.

**Burkina Faso — the country-specific figure, and where we depart from a pure
top-down method.** No Burkina-Faso-specific figure exists in public
research, and unlike Nigeria there's no sourced country-level number to
anchor against, so we built Burkina Faso's own TAM two independent ways and
compared them, rather than relying on the top-down method alone as we could
for the regional figure above.

*Method A — top-down, per-capita.* Applying the same continental per-capita
rate of about $0.673/person (~400 FCFA/person) to Burkina Faso's population
(23.5M) implies a Burkina Faso TAM of **roughly $15.8M (~9.5B FCFA)
[ESTIMATE]**.

*Method B — bottom-up, attendance × frequency × price.* Assume roughly 40%
of the population — a figure grounded in the youth bulge described in Item
2.1, where 48.9% of the 15+ population is 15–29 — attends at least one paid
ticketed event per year, counting *all* ticketed events, formal and
informal, cash and digital (a wedding entry fee, a small concert at the
door, a football match, not just what a platform like VIVRE processes
directly). That's roughly 9.4M people, attending an average of 2 such events
per year, at a blended average price of 1,500 FCFA — lower than the
~3,500 FCFA figure used for SAM below, because this blend includes cheap,
informal, cash-collected local events alongside the pricier, more formal
ones (Tikerama's own listed range runs 500–25,000 FCFA). That produces
**roughly $45–47M (~27–28.2B FCFA) [ESTIMATE]**.

*Reconciling the two.* These methods disagree by close to 3x, and we think
that's worth explaining rather than smoothing over. Method A likely
understates Burkina Faso specifically: the continental per-capita average is
pulled upward by much larger, wealthier, more formally-digitized ticketing
economies (Nigeria, South Africa, Egypt), and applying that blended average
to a smaller, poorer, more cash-and-informal market probably doesn't
transfer well. Method B is also the only one of the two that actually
accounts for the informal, cash-based event economy that — by every
demographic and payments fact in Item 2.1 — makes up the large majority of
how Burkina Faso currently transacts. We treat **Method B (~$45–47M, ~27–28.2B
FCFA) as the
more defensible primary estimate**, and keep Method A as a disclosed,
lower-bound cross-check rather than discarding it — a real analyst shows
disagreeing methods rather than hiding the one that's inconvenient.

**Projecting the TAM forward — 5, 10, 15, and 20 years.** A market-size
figure that only describes today is of limited use for long-horizon planning,
so we projected all three levels of TAM above forward using the one growth
rate we actually have sourced: the Africa-wide category's own 3.69% CAGR
(2024–2028,
[Statista](https://www.statista.com/outlook/dmo/eservices/event-tickets/africa)).
We want to be explicit about why we used a single rate rather than inventing
separate population-growth and per-capita-spend-growth assumptions to
combine: the sourced 2024–2028 CAGR is a *total-revenue* growth rate, which
already embeds whatever population growth and per-capita spend growth
Statista's own methodology assumes for that period — layering a second,
independently-sourced population-growth rate on top would double-count
growth we can't actually decompose from the public figure. Extending that one
real rate flatly beyond 2028, uniformly across Africa, West Africa, and
Burkina Faso, is a simplifying assumption, not a forecast, and we say so
plainly: it assumes Burkina Faso and West Africa grow in line with the
continental blend, when in reality a younger, faster-urbanizing population
(Item 2.1) could grow this market faster than the continental average, while
a slower digital-payments rollout could grow it slower. Rebasing everything
to a 2026 starting point (compounding the sourced 2024 figures forward two
years first) so all three levels and both Burkina Faso methods share the same
clock:

| Level | Now (2026) | Year 5 (2031) | Year 10 (2036) | Year 15 (2041) | Year 20 (2046) |
|---|---|---|---|---|---|
| **Africa** (sourced base) | ~$1.10B (~659B FCFA) | ~$1.32B (~789B FCFA) | ~$1.58B (~946B FCFA) | ~$1.89B (~1.13T FCFA) | ~$2.26B (~1.36T FCFA) |
| **West Africa** (Method A, Nigeria-validated) | ~$315M (~189B FCFA) | ~$378M (~227B FCFA) | ~$453M (~272B FCFA) | ~$543M (~326B FCFA) | ~$650M (~390B FCFA) |
| **Burkina Faso** — Method B (primary) | ~$45–47M (~27–28.2B FCFA) | ~$54–56M (~32.4–33.8B FCFA) | ~$65–68M (~38.8–40.5B FCFA) | ~$77–81M (~46.5–48.6B FCFA) | ~$93–97M (~55.7–58.2B FCFA) |
| **Burkina Faso** — Method A (cross-check) | ~$15.8M (~9.5B FCFA) | ~$18.9M (~11.4B FCFA) | ~$22.7M (~13.6B FCFA) | ~$27.2M (~16.3B FCFA) | ~$32.6M (~19.6B FCFA) |

The point of carrying this table isn't precision at Year 20 — nobody should
treat a twenty-year-out figure built on a four-year sourced trend as reliable
to the dollar. The point is that the Year-15 and Year-20 valuation
conversation in Item 5 should eventually be checked against a *TAM that has
also grown*, not against today's static number — a target that looks modest
against a 2026 ceiling could look different again against a 2041 one, and we
use the grown figures, not the static ones, when we do that check below.

**SAM — the digitally-addressable slice of that TAM, in dollars.** VIVRE's
serviceable addressable market is the population who could realistically
discover and pay for a ticket through a platform like VIVRE *today*: urban
population, because that's where the ticketed-event economy concretely
exists, multiplied by mobile money penetration, because that's the payment
rail the product is built on. Urban population (8.1M) × mobile money
penetration (52–55%) puts that figure at **roughly 4.2–4.5 million people
[ESTIMATE]** — a ceiling on who *could* plausibly buy a ticket this way, not
a forecast of who will. Converting that population into a dollar figure using
the same frequency and price assumptions we use throughout this document (1.5
tickets/buyer/year at an average price of 3,500 FCFA — see Item 5 for where
that price comes from) gives a **SAM of roughly $37–39M (~22.2–23.4B FCFA)
[ESTIMATE]**. As a sanity check, that figure sits comfortably below the
Method B TAM of $45–47M (~27–28.2B FCFA), which is exactly the relationship
that should hold — the digitally-addressable market should be a subset of
the total market, cash and informal transactions included, not larger than
it. Where the top-down Method A TAM ($15.8M, ~9.5B FCFA) actually falls
*below* this SAM figure is itself further evidence that Method A undercounts
Burkina Faso specifically, as argued above.

**SOM — a framework, with one illustrative pass shown and cross-referenced,
not a confident number invented from nothing.** Six-plus real competitors are
already operating in this exact market (Item 3), so this is not blue ocean,
and a capture-rate assumption picked without real data behind it would be a
guess dressed up as analysis. The honest formula is: (organizer acquisition
rate) × (average events per organizer per year) × (average attendees per
event) × (ticket conversion rate) × (average ticket price) — refined with
VIVRE's own real numbers as they come in. What we do show is one labeled,
illustrative pass at the near-term end of that formula, used consistently
with the Year-5 figures in Item 5: capturing 5–8% of the SAM population as
active annual buyers implies a SOM of roughly **$1.8–3.1M (~1.08–1.86B FCFA)
in gross transaction volume** — a number that falls out of the same SAM figure above,
not a separate assumption invented for this section. We revisit all of this
the moment there are a few months of real platform data to work from; a
bottom-up SOM built on VIVRE's *own* conversion rates will always be more
credible to an investor than one built on category averages, and we'd rather
wait a quarter and be right than publish something today and be wrong.

### 2.3 Key metrics and unit economics — benchmarked against real comparables

Market size tells us the size of the opportunity. It doesn't tell us whether
the business itself works. This section is where we check that, against real
numbers from real, comparable ticketing companies rather than assumptions we
made up ourselves — because a valuation model is only as honest as the
inputs underneath it, and the ones that matter most (take rate and
valuation multiple) shouldn't come from us guessing.

**Take rate, benchmarked.** VIVRE's blended take rate assumption throughout
this document is 8–10% of gross ticket value, combining commission,
advertising, and merch margin. That's not a number we picked in a vacuum:
Eventbrite charges 3.7% + $1.79 (~1,074 FCFA) per ticket in service fees plus 2.9% payment
processing, an effective rate of roughly 10% on a typical ticket; DICE
negotiates in the neighborhood of 7–10%, generally absorbed from the
organizer rather than passed to the buyer; Ticketmaster's fees are
negotiated per partner, with roughly 10% as a typical estimate
([Ticketing Fees UK](https://ticketingfees.co.uk/dice-vs-eventbrite/),
[Checkout Page](https://checkoutpage.com/blog/eventbrite-fees)). VIVRE's
8–10% sits squarely inside that real-world range — which matters two ways:
it tells us we're not underpricing the value we provide, and it tells us we
shouldn't assume we can charge meaningfully more than the category norm
without a specific reason to believe organizers would accept it.

**ARPU — and the strategic conclusion it forces.** At the blended assumptions
used throughout this document (3,500 FCFA average ticket price, 1.5
tickets/buyer/year, 8–10% blended take), each active buyer generates VIVRE
roughly **420–525 FCFA (~$0.70–0.88) in net revenue per year.** We want to
state plainly what that number means rather than let it pass by quietly:
this is a low-ARPU, high-volume business by nature, because it's built on a
market where individual ticket prices are genuinely low. That's not a flaw
in the model — it's a direct, honest consequence of Item 2.1's economics
(GDP per capita ~$1,319, ~791,000 FCFA) — but it has a real strategic implication: growth
here has to come from buyer count and repeat frequency, not from pricing
power, and any customer-acquisition spend has to be judged against a very
small per-buyer revenue number.

**LTV, and the CAC ceiling it implies.** Assuming a buyer stays active for
roughly 3 years (illustrative, not yet observed), that ARPU implies a
lifetime value of **roughly $2.10–2.65 per buyer (~1,260–1,590 FCFA)
[ESTIMATE]**. We're showing this specifically because of what it rules out,
not because it's an impressive number: at this LTV, any paid
customer-acquisition channel costing more than roughly $2–3 per buyer
(~1,200–1,800 FCFA) acquired would not pay back within
a buyer's typical lifetime. That's a real, load-bearing constraint on
strategy, not a caveat — it's the actual, numerical reason organic growth
(Item 4.1: free-first publishing, the ticket-transfer viral loop, WhatsApp
distribution) has to be VIVRE's primary growth engine in this market, not a
values statement we'd make regardless of the math. We have not yet spent
real money on paid acquisition, so we're not fabricating a CAC figure here —
this is a ceiling derived from unit economics, to be tested against real
paid-channel costs if and when we try one.

**Valuation multiple, benchmarked against real transactions — and where our
earlier assumption was too generous.** We looked at what ticketing and
events companies actually trade and sell for, rather than assume a generic
"growth marketplace" multiple. As of March 2025, the events sector's median
EV/Sales multiple across public comparables was about 2.1x, with EV/EBITDA
around 11.8x
([DealMatrix](https://dealmatrix.com/valuation-multiples/by-industry/events/)).
The most directly relevant real transaction is Eventbrite's own acquisition
by Bending Spoons, announced December 2025 and closed March 2026, for
roughly $500M (~300B FCFA) — coverage described this as **approximately 1.7x trailing
revenue**, and characterized it explicitly as "a disciplined acquisition at
a low price point"
([Skift Meetings](https://meetings.skift.com/2025/12/02/bending-spoons-to-acquire-eventbrite-in-500-million-cash-deal/)).
We want to flag directly that these real comps are lower than the 3–8x
range we used in an earlier pass at this model — that range wasn't
sourced to anything, it was a generic assumption for "growth-stage
marketplace businesses," and the real data doesn't support it for this
specific category. We've corrected the multiple used in Item 5 accordingly,
to a range of roughly 1.7–3x net revenue: the low end anchored directly to
the Eventbrite/Bending Spoons transaction and the sector median, the high
end allowing a modest, explicitly-flagged premium for a business
demonstrating real multi-country growth — not a number pulled from nowhere.

**Market-share targets, anchored to a real comparable rather than a round
number.** Rather than invent an organizer-count target, we're anchoring to
one already in this document: My Place Events discloses roughly 400 partner
organizers across the ten countries it operates in, including Burkina Faso
(Item 3.1). A concrete, checkable Year-5 goal is reaching and exceeding
that figure — roughly 400 active organizers — **in Burkina Faso alone**,
which would represent real, comp-anchored evidence of country-specific depth
outcompeting a pan-African platform's thinner footprint here, consistent
with the argument in Item 3.2. On the buyer side, the 5–8% SAM-capture range
used for Year 5 in Item 5 is the equivalent target, expressed as a share of
the addressable population rather than an absolute count.

### 2.4 The financial-inclusion thesis, and the simpler good we're actually after

There's a real, academically-supported "force for good" story available here,
and we want to tell the honest version of it rather than the inflated one.
Mobile money is documented as disproportionately valuable to people without
bank account access, providing services formal banks in these markets don't
extend to them
([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0167624523000495)).
The clearest real-world precedent for exactly this pattern is M-Pesa in Kenya,
which expanded from person-to-person transfer into a full financial-services
platform with **M-Ticketing** as one of its core use cases — direct evidence
that "mobile money rails plus ticketing" is a proven financial-inclusion
vector, not a novel idea VIVRE is the first to attempt
([CIRSD](https://cirsd.org/horizon-article/mobile-money-africas-force-for-social-good/)).

The honest caveat, and we think it matters more than the headline: the same
research finds financial-inclusion gains from mobile money are not evenly
distributed — the benefits skew toward wealthier and more urban users, not
automatically toward the poorest. VIVRE's own addressable market as sized in
Item 2.2 is explicitly urban and youth-skewed, which is consistent with that
pattern. Claiming "we're banking the unbanked poorest" would overreach what
the data supports. The version we're comfortable standing behind is narrower
and, we think, still genuinely meaningful: **we make the mobile-money economy
that already exists work for a real cultural and economic sector — events —
instead of routing around it.**

And underneath the inclusion argument is a plainer one we care about just as
much: culture, music, celebration, and community are not luxuries, they're
part of what makes daily life in Burkina Faso good. A platform that makes it
a little easier, a little happier, and a little more trustworthy for people
to gather, celebrate, and support the artists and organizers building that
culture is doing something worth doing on its own terms — the commercial
case and the "make life better" case point the same direction here, which is
exactly why we think this business is worth building well, not just building
fast.

---

## Item 3 — Competitive Landscape

### 3.1 Who else is in this market

Six real, currently-operating competitors were identified from public
information, plus one larger regional player included for scale context. All
detail below comes from each company's own website or public coverage —
current as of this writing, and worth re-verifying before quoting externally,
since these are small, fast-moving companies whose sites change.

| Company | Geographic scope | Founded / launched | Key features (as marketed) | Notable |
|---|---|---|---|---|
| **[FasoEvent](https://www.fasoevent.com/)** | Burkina Faso only | Not stated | QR-code tickets, Orange Money, real-time sales dashboard, VIP/Standard/Group tiers, smartphone scanning | Closest feature match to VIVRE of any competitor found — but no ticket transfer, merch, or staff-delegation features found in its marketing |
| **[Faso Billetterie](https://www.fasobilleterie.com/)** | Burkina Faso only | Not stated | Mobile money (Orange + Moov), QR codes, route/directions to venue, free + paid events | Official ticketing partner for the National Football Federation, CENASA, and FESPACO — a real institutional-relationship moat |
| **[Temba](https://tembas.com/)** | Burkina Faso only | Not stated | FCFA payment, "instant transfer," markets itself as "#1 in Burkina Faso" | Self-claimed leadership position — limited independently-verifiable detail found |
| **[E-events](https://www.e-events.net/)** | Burkina Faso only | Launched Aug 2023, founder Ulrich Traoré | Mobile money (Orange + Moov), voting systems, transparent automatic raffle draws, trade-show stand reservations | Broader than pure ticketing, leaning toward event *management*; appears to require a native app download (App Store listing found), unlike VIVRE's installless PWA |
| **[Tikerama](https://tikerama.com/en)** | 10 countries incl. Burkina Faso (Côte d'Ivoire primary) | Not stated | Category browsing, physical points-of-sale network, WhatsApp as a distribution channel, progressive commission that grows with success, free event publishing, organizer dashboard, 174+ events, 500–25,000 FCFA price range | Pan-African scale — real cross-border network effects VIVRE doesn't have yet |
| **[My Place Events](https://myplace-events.com/)** | 10 countries incl. Burkina Faso (Abidjan-based) | Not stated | "Web TV" for event promotion, smartphone or printed tickets, event promotion/featuring tools | ~400 partner organizers, 8.77/10 satisfaction, **98% buyer repeat-purchase rate** — the strongest independently-stated traction numbers found among any direct competitor |
| **[eGotickets](https://egotickets.com/)** (regional context, not in Burkina Faso) | Ghana, Nigeria, Kenya, Rwanda, Uganda | 2013, founder Alfred Rowe | Full category range, its own ad product (eGoAds), a 600+-billboard offline partnership (Vendo), a multi-currency payment partner (Startbutton) for regional expansion, SMS/email/social promo tools, an insurance-partnership add-on (StarLife) | 10+ years old, powers 45,000+ events, reports reach to 3M+ potential attendees via its own promotional network, and has done all of this **without raising outside funding** |

Three things stand out once you sit with this table rather than skim it.
First, this market is not empty — a pitch or a filing that implied "no
competition" would be wrong, and would read as under-researched to anyone who
checked. Second, **no competitor found publishes ticket transfer, merch
bundling, delegated door-staff scan access, or an integrated ad marketplace**
in their marketing (eGotickets is the one exception on the ad-marketplace
front, and it's outside Burkina Faso, which we return to below) — these are
real, verifiable differentiators for VIVRE today, not aspirational future
ones, though absence from marketing materials is not the same as proof of
absence in the underlying product, so this is worth confirming directly
before it's used in an external pitch. Third, My Place Events' 400-organizer,
98%-repeat-buyer numbers are the real bar for organizer-side credibility in
this market — that is the number a future VIVRE traction claim should be
measured against, not an arbitrary internal target.

### 3.2 Competitor by competitor: strength, weakness, fear, and the case for beating them

Everything in this section is analysis and inference from public information —
not insider knowledge of any competitor's finances or strategy. We've kept it
that way deliberately: a confident argument built on what's actually
checkable is one we can defend if challenged; a fabricated one isn't.

**FasoEvent**

*Strength, and why it's real.* The closest feature match to VIVRE of any
competitor found — QR tickets, mobile money, a real-time dashboard, tiered
pricing. That matters beyond the feature list itself: it means the category
(digital ticketing on mobile money, in Burkina Faso) is already proven by
someone other than us. We're not evangelizing new behavior, we're competing
for an already-validated one.

*Weakness, and why.* Everything public about them points to a single revenue
line — ticket commission alone. In a market where tickets run as low as 500
FCFA, that's a thin-margin, volume-dependent business with no cushion.

*What they should fear.* A competitor who monetizes the same event three ways
can survive, and even turn a profit, on volume that FasoEvent can only break
even on — and can afford to start a commission price war it cannot.

*Why we believe we beat them.* Enthusiastically: we're not just selling
tickets, we're building the commerce infrastructure for a whole event —
tickets, merch, and the advertising that funds an organizer's next one — a
bigger and more interesting product to build. Practically: three revenue
lines shipped today against their apparent one, on the exact same underlying
event. Rationally: more ways to monetize a transaction lets us out-invest a
single-revenue-line competitor in product, trust infrastructure, and
organizer support over time, even at equal ticket volume. Pragmatically: if a
commission price war ever starts, we can afford to lose on commission alone
because ads and merch aren't at stake for us — they can't say the same.

*What it would take for them to stay in the race.* A second revenue line,
fast, or some other defensibility beyond feature parity — nothing publicly
visible today stops an organizer from switching to whichever platform is
simply better-marketed or better-trusted.

**Faso Billetterie**

*Strength, and why it's real.* Official ticketing partner for the national
football federation, CENASA, and FESPACO. This is a relationship moat, not a
technology moat — the hardest kind to copy, because it's built on trust and
history rather than a feature that can be shipped.

*Weakness, and why.* The same strength is a concentration risk: a handful of
institutional contracts likely drive an outsized share of volume. Lose one —
a federation re-tenders, a festival changes sponsors — and a large chunk of
the business goes with it.

*What they should fear.* A platform that wins the long tail — the hundreds of
small concerts, religious gatherings, networking events, and weddings that
never touch an institutional contract — builds a broader, more diversified,
and ultimately harder-to-dislodge organizer base than a handful of marquee
deals, even if each individual deal is larger.

*Why we believe we beat them.* Enthusiastically: we're building for every
organizer in Burkina Faso, not just the ones with institutional connections —
a bigger, more inclusive vision of what "the ticketing platform for Burkina
Faso" should mean. Practically: a self-serve publish flow that requires no
relationship with us at all to start selling tickets today — zero cold-start
problem for a new organizer. Rationally: revenue diversified across hundreds
of independent organizers is structurally more resilient than revenue
concentrated in a handful of contracts; any single organizer leaving barely
moves the number. Pragmatically: we're not trying to out-negotiate them for
the federation contract on day one — we're building the base that makes VIVRE
the obvious platform to eventually hold that contract, once scale makes the
case for us on its own.

*What it would take for them to stay in the race.* A real self-serve product
for the long tail, built alongside their institutional deals — that appears
to be the actual gap, and it's the same gap that lets a long-tail-first
platform grow underneath them without ever needing to touch their contracts
directly.

**Temba**

*Strength, and why it's real.* A confident, simple brand claim — "#1 in
Burkina Faso" — repeated clearly and consistently. Confident marketing works
even when unverified; it shapes a first impression before anyone checks.

*Weakness, and why.* No independently verifiable detail exists anywhere we
could find — no user numbers, no named partnerships, no feature depth beyond
"secure payment in FCFA." A claim with nothing behind it is fragile the
moment someone looks one level deeper than the homepage.

*What they should fear.* A competitor who can point to specific, sourced,
checkable capability instead of a bare assertion wins any comparison that
goes past the surface.

*Why we believe we beat them.* Enthusiastically: we'd rather be quietly the
best-built platform than loudly claim to be, and let the product prove it.
Practically: every capability in this filing is either linked to its own
source or explicitly marked as an estimate — that discipline is itself a
trust signal Temba's marketing doesn't have. Rationally: an unverified
leadership claim doesn't survive real due diligence, from an investor, a
grant body, or a skeptical organizer comparing options directly; verifiable
specifics do. Pragmatically: this is the cheapest competitor to out-argue —
there's almost nothing publicly on record to counter with.

*What it would take for them to stay in the race.* Publish something real —
actual numbers, actual named partners, actual feature depth — or risk the
claim collapsing the moment a more substantiated competitor stands next to
them.

**E-events**

*Strength, and why it's real.* Broader than pure ticketing — voting systems,
transparent automated raffle draws, trade-show stand reservations. That's a
genuinely different angle (event *management*, not just ticket sales) that
could matter to a different segment — trade shows, contests — that VIVRE
doesn't target today.

*Weakness, and why.* Appears to require a native app download (an App Store
listing was found) — real friction in a market of largely entry-level Android
phones, metered data, and limited storage. Every step of an install funnel is
a buyer lost before they ever see an event.

*What they should fear.* A frictionless competitor out-converts them on
top-of-funnel signup alone, before feature comparison ever enters the
picture.

*Why we believe we beat them.* Enthusiastically: "no download, no wait, no
storage cost, just tap and buy" is a genuinely better first experience, and
first experiences are what decide whether someone becomes a repeat buyer.
Practically: a PWA — "Add to Home Screen" — gives the same icon-on-your-phone
feel with zero App Store review and zero install step. Rationally: the
funnel math is unforgiving — even a conservative 20–30% abandonment at a
forced app-store download, a realistic range for a low-end-Android,
metered-data market, is a structural disadvantage no feature richness fully
offsets. Pragmatically: we're not trying to out-build their raffle or
stand-reservation features today — we're taking the much larger
pure-ticketing segment, where install friction matters most and where most
organizers don't need that extra overhead anyway.

*What it would take for them to stay in the race.* Ship a PWA or a
lightweight web-purchase path alongside the native app — otherwise every
point of install-funnel drop-off compounds against them as awareness grows.

**Tikerama and My Place Events** *(pan-African, both active in Burkina Faso)*

*Strength, and why it's real.* Real, proven multi-country traction. My Place
Events specifically reports around 400 partner organizers, 8.77/10
satisfaction, and a 98% buyer repeat-purchase rate — not marketing copy, a
real, quotable product-market-fit signal. Tikerama adds a genuinely
omnichannel presence — web, mobile, WhatsApp, and physical points of sale —
plus a progressive, free-to-publish commission model that removes upfront
risk for a first-time organizer.

*Weakness, and why.* Ten countries means every product decision — payment
rails, categories, UX language, even the channel mix — is a compromise
averaged across ten different mobile-money splits and cultural contexts, not
tuned specifically for Burkina Faso's Orange/Moov/Telecel mix or its own
event culture. Depth in any one country is necessarily diluted by breadth
across ten.

*What they should fear.* A competitor who goes deep in Burkina Faso
first — building country-specific trust, payment integration, and organizer
relationships that a ten-country platform structurally can't prioritize the
same way — can out-execute them *inside Burkina Faso specifically*, even
while they keep winning on paper by total footprint.

*Why we believe we beat them, in Burkina Faso specifically — not a global
claim.* Enthusiastically: we get to be the platform built *for* Burkina Faso,
not adapted *to* it — every decision, from WhatsApp-based login to the
manual mobile-money bridge, starts from what a Burkinabè organizer actually
needs, not from what works across ten markets at once. Practically: faster
iteration on BF-specific problems — a new mobile-money provider, a local
trust concern, a category the local event scene actually uses — without
weighing nine other markets' constraints first. Rationally: local depth beats
broad-but-shallow specifically where trust and payment-rail specificity
matter most, and ticketing, where real money changes hands before a service
is delivered, is exactly that kind of category. Pragmatically: My Place
Events' own 98% repeat-buyer number is the bar to beat, not to be
intimidated by — it's proof the underlying model works when executed well,
and country-specific execution is the lever a single-country platform can
pull harder than a ten-country one can.

This is also, not incidentally, VIVRE's own playbook for scale, not just a
competitive argument against these two: go deep in one country, prove the
country-specific-tuning discipline actually works, then repeat it market by
market (Item 4.2).

*What it would take for them to stay in the race in Burkina Faso
specifically.* Dedicated BF-specific product resourcing — payment rails,
trust process, a local team — rather than running Burkina Faso through the
same generalized ten-country product. A real organizational choice, not a
feature.

**eGotickets** *(regional context — not currently operating in Burkina
Faso)*

*Strength, and why it's real.* The clearest proof the category scales in
Africa. Ten-plus years old, powers 45,000+ events, claims reach to 3M+
potential attendees through its own promotional network, runs its own ad
product (eGoAds) alongside a 600+-billboard offline partnership, and has done
all of this without raising outside funding — real evidence of a durable,
profitable model, not just a funded growth story.

*Weakness, and why — specific to Burkina Faso.* Not in this market at all
today. Whatever their strength elsewhere, it is zero here right now.

*What they should fear about entering Burkina Faso later.* Arriving after
four local competitors already have organizer relationships and local
payment integrations built — the same late-entrant disadvantage Faso
Billetterie's own institutional partnerships create for anyone else. A
ten-year-old, five-country incumbent still starts from zero *locally* on day
one in a market it hasn't touched.

*Why we believe we'd beat them if they entered.* Enthusiastically: we'll
already be the trusted local name by the time a regional player notices
Burkina Faso is worth entering. Practically: local relationships, payment-
rail nuance, and trust don't transfer with a company's balance sheet — they
have to be rebuilt from zero in every new market, regardless of size
elsewhere. Rationally: their own playbook — an ad product, an offline
billboard partnership, a promotional reach network — is worth studying and
adopting early; eGoAds proves ad monetization works in this exact category at
real scale, and **VIVRE already has an ad marketplace live, ahead of every
Burkina-Faso-specific competitor** — bringing a regional-proven idea to
Burkina Faso before the regional player itself arrives. Pragmatically: the
goal isn't to out-resource eGotickets, it's to make Burkina Faso the market
where they'd rather partner or acquire than compete from scratch, because the
local position is already too costly to build from zero.

*What it would take for them to enter Burkina Faso successfully.* Essentially
rebuild everything a local-first platform is doing now from the ground up —
which is exactly why doing it now, while the market is still open, is the
real strategic move.

### 3.3 The one fear every competitor shares

Not one of the six competitors researched publishes any visible
fraud-prevention, organizer-verification, or dispute-resolution
infrastructure. In a young digital-ticketing market, one visible scam — a
fake event, an organizer who vanishes with mobile-money payments — doesn't
just damage the platform it happened on; it teaches an entire population to
distrust digital ticketing *as a category*, and every platform in that table
pays for it. VIVRE's real KYC and phone-call verification before a first paid
event goes live, its graduated organizer-trust payout system, and genuine
admin review — adversarially tested, not just claimed — aren't just a feature
edge. They're a bet that the platform buyers trust most by default becomes
the platform they default to, categorically, the first time any competitor
has a public trust incident.

### 3.4 Customers — the whitespace, and the needs nobody is fully solving yet

**Customers competitors don't currently have.** Small, informal, first-time
organizers — a birthday party, a small church event, a neighborhood football
tournament — priced out or intimidated by platforms built around
institutional-scale events (Faso Billetterie) or that assume real volume from
day one. A genuinely free, frictionless, no-relationship-required publish
flow for a first-timer's first fifty-ticket event is real whitespace none of
the six visibly own. So are buyers who've never bought a digital ticket at
all — still paying cash at the door or trusting word of mouth — where the
PWA's zero-install path and phone-only auth are built specifically to convert
that group, not just to win buyers who already trust digital ticketing. And
advertisers who want to reach a youth-skewed, event-going audience have no
Burkina-Faso-specific digital placement option today outside generic social
media — a local brand sponsoring a concert has nowhere purpose-built to do
that yet.

**Customers competitors already have — known needs, and needs they haven't
been asked about.** Organizers currently on FasoEvent, Temba, or E-events have
a known need — sell tickets digitally — that's already being met. What's
likely unmet is a second revenue line off the same event they're already
running, since none of those platforms appear built for it; that's a direct,
concrete switching pitch: keep doing what you're doing, earn more doing it.
Organizers on Faso Billetterie have a known need — reach a large, trusted
institutional audience — but likely also run smaller, non-institutional
events on the side that don't fit an institutional-partnership platform; a
federation's own marketing team probably throws smaller internal events, and
FESPACO-adjacent organizers likely run smaller cultural events between the
festival itself. VIVRE can be the platform for that half of their calendar
without ever needing to touch the institutional contract. Buyers on My Place
Events or Tikerama have a known need — buy a ticket easily across markets —
but an unspoken one in Burkina Faso specifically: a payment and trust
experience tuned to exactly how they already use Orange Money or Moov Money
day to day, not a generalized cross-market flow. Small friction differences
like that compound into real preference over repeat use.

We want to be honest about what this section actually is: a set of
hypotheses, reasoned from public information, not confirmed by talking to a
single one of these organizers or buyers yet. The real work isn't writing
this list — it's validating it against real interviews as VIVRE grows, and
being willing to be wrong about any part of it.

### 3.5 What we know, and don't, about competitor technology and tactics

We were not able to find any competitor's actual technology stack through
public research — small West African startups in this category don't publish
engineering blogs, public job-stack listings, or technical case studies at a
level that would let us say anything real here, and we're not going to
speculate to fill the gap.

What tactics *are* discoverable, and worth studying: Tikerama runs a
progressive commission that grows with an organizer's success, publishes
events for free upfront, and maintains a genuinely omnichannel presence
including WhatsApp and physical points of sale, not just a web app — worth
noting they already use WhatsApp as a *discovery and distribution* channel,
distinct from VIVRE's use of WhatsApp specifically for *authentication*,
which remains a different, real innovation rather than something to overclaim
as identical. eGotickets runs a dedicated ad product (eGoAds) and an offline
billboard partnership (600+ billboards via Vendo) — proof that pairing
digital ticketing with an advertising business, and even bridging into
offline reach, is a proven regional playbook; VIVRE's ad marketplace is the
right instinct, already validated by a ten-year-old, profitable regional
player. My Place Events built a "Web TV" content feature specifically to help
organizers promote their own events — a reminder that platforms in this
category win partly on marketing tooling for organizers, not on ticketing
mechanics alone, and a real candidate for a future lightweight organizer-
facing promo tool on VIVRE (even something as simple as auto-generated
shareable event graphics).

---

## Item 4 — Strategy for Growth

Every tactic below is in service of the same underlying idea: growth that
comes from people genuinely enjoying VIVRE and wanting to bring someone else
into that experience compounds in a way that paid acquisition alone never
does. We'd rather grow slower and be loved than grow fast and be merely used.

### 4.1 Organic

Free events already publish with zero friction, and every one of them is a
chance for a first-time organizer to experience the platform before ever
being asked to pay a commission on a paid one. Ticket transfer — a feature we
didn't find on any competitor — gives every ticket a natural viral edge: a
buyer who transfers a ticket to a friend introduces that friend to VIVRE
directly. Fourteen event categories are real browse and search surfaces, not
just filters; as event volume grows, building these out as real city-plus-
category landing pages turns "concerts in Bobo-Dioulasso" into something
genuinely discoverable, not just an in-app dropdown. The graduated trust and
payout system gives an existing organizer a tangible, self-interested reason
to tell another organizer to switch — good behavior compounds into faster
payouts, which is a real thing to talk about. And once WhatsApp OTP is live,
the same channel already carries event sharing and ticket-transfer
notifications, and eventually marketing messages, riding the channel
Burkinabè users already live in daily — the same channel Tikerama already
uses for distribution.

### 4.2 Inorganic

Two acquisition targets stand out from the landscape in Item 3.1, at very
different time horizons and for different reasons. **FasoEvent** is the
realistic near-term target: closest feature overlap of any competitor,
likely the simplest integration, and it removes the most direct feature-for-
feature rival while folding in whatever organizer base they've built — worth
pursuing once VIVRE has real funding and traction to execute on it, not
before. **Faso Billetterie** is the higher-value, longer-horizon target — not
for its technology, but for its institutional relationships with the
football federation, CENASA, and FESPACO. We want to flag a real risk here
rather than wave past it: relationship-based goodwill, built over years with
specific people, doesn't always transfer cleanly with a change of ownership,
and this would need real diligence on how those relationships actually work
before it's treated as a foregone win.

Short of acquisition, direct partnerships are worth pursuing now, before
either deal is realistic: co-marketing with a mobile money provider — Orange,
Moov, or Telecel — around a "buy tickets with the money you already have"
message, or an exclusivity arrangement with one recurring event series as an
early anchor customer. And once Burkina Faso is genuinely deep rather than
just launched, Mali, Niger, and Togo share meaningfully similar mobile-money
and WhatsApp dynamics — natural next markets for the same country-specific-
depth playbook that Item 3.2 argues beats the pan-African incumbents inside
Burkina Faso, applied one market at a time rather than all at once, which is
the specific mistake we think Tikerama and My Place Events already made.

---

## Item 5 — Financial Outlook: How We Actually Think About Long-Term Value

We want to walk through our reasoning here rather than just hand over a
number, because a number without the reasoning behind it isn't useful to
anyone — not to us, and not to whoever reads this next. So this section
explains the method first, then shows what it produces, and is explicit about
why the range is as wide as it is.

**Why we started from a formula instead of a guess.** The temptation with a
long-horizon valuation exercise is to anchor on what a similar company raised
or sold for and work backward. We think that's the wrong instinct for a
market this specific, because Burkina Faso's economics — GDP per capita
around $1,319 (~791,000 FCFA), a market with no cited ticketing-specific size at all (Item
2.2) — don't resemble the markets those comparable numbers usually come from.
Instead we built the estimate the way we'd want an analyst to build it: from
the addressable population up, through a chain of assumptions we can name and
defend individually, to a revenue figure, and only then to a valuation
multiple. If any one assumption turns out wrong, it's visible which one, and
it can be corrected without throwing out the whole model.

**The chain, step by step.** Start from the SAM in Item 2.2 — roughly 4.2 to
4.5 million people in Burkina Faso who could realistically discover and pay
for a ticket through a platform like VIVRE, worth roughly $37–39M
(~22.2–23.4B FCFA) in fully captured annual gross transaction volume (also
Item 2.2). Multiply the
underlying population by an assumed share who become active annual buyers —
this is the least certain number in the whole model, since it depends on
marketing reach, trust, and competitive dynamics we can't observe yet, so
we've used a deliberately modest 5–8% at the five-year mark. That buyer
count, at an assumed average of 1.5 tickets bought per buyer per year and an
average ticket price of roughly 3,500 FCFA — both informed by the price
ranges we found in competitor marketing (as low as 500 FCFA, up to 25,000
FCFA at Tikerama) — produces an annual gross transaction volume. Apply a
blended take rate of 8–10% across ticket commission, advertising, and merch
margin — a rate we benchmarked directly against Eventbrite, DICE, and
Ticketmaster in Item 2.3, not picked in a vacuum — to convert that volume
into net revenue VIVRE actually keeps. Finally, apply a valuation multiple of
roughly **1.7–3x net revenue** — also benchmarked in Item 2.3 against the
events sector's real ~2.1x median EV/Sales and Eventbrite's own 2025
acquisition at ~1.7x trailing revenue, not a generic "growth marketplace"
assumption. We want to be explicit that this multiple is a real correction
from an earlier pass at this model, which used an unsourced 3–8x range; the
number below is smaller than that earlier draft's, on purpose, because it's
now anchored to actual transactions instead of a category cliché.

**What that produces, at each horizon:**

| Horizon | Illustrative penetration assumption | Illustrative active buyers | Illustrative annual GMV | Illustrative net revenue | Illustrative valuation range (1.7–3x net revenue) |
|---|---|---|---|---|---|
| **Year 5** | 5–8% of the ~4.3M Burkina Faso SAM, single-country | ~215,000–345,000 | ~1.1–1.8B FCFA (~$1.8–3.0M) | ~$150,000–300,000 (~90–180M FCFA) (8–10% blended take) | ~$260,000–900,000 (~156–540M FCFA) — not yet a meaningful valuation figure; the honest read at Year 5 is that the model is still validating itself, not producing a number worth quoting externally |
| **Year 10** | Burkina Faso matured, plus 3–4 comparable West African markets (Mali, Niger, Togo, Benin) at similar penetration, per the expansion path in Item 4.2 — roughly 5 countries total | Roughly 4–5x the Year-5 Burkina-Faso-only buyer count | Scaled accordingly across markets | ~$1–3M (~600M–1.8B FCFA) | ~$1.7–9M (~1.02–5.4B FCFA) |
| **Year 15** | A genuine regional platform across roughly 8–10 countries, continuing the same per-country penetration assumption — a ~1.6–2x country-count multiple on Year 10, not a leap to eGotickets' full scale (45,000+ events, 3M+ reachable attendees), which we can't yet justify numerically | Scaled accordingly | Scaled accordingly | ~$1.8–5.4M (~1.08–3.24B FCFA) | ~$3–16M (~1.8–9.6B FCFA) |

**Why the range is this wide, and why the numbers are smaller than an
earlier draft of this model.** The Year-5 row makes an uncomfortable point
worth stating directly rather than softening: Burkina Faso alone is a
genuinely small economy, and staying single-country caps annual revenue in
the low-to-mid hundreds of thousands of dollars even at meaningful market
penetration. We don't think that's a discouraging fact — we think it's the
actual strategic argument for why the expansion path in Item 4.2 isn't an
optional later chapter, it's the only path to the kind of scale this model
is describing at Year 10 and Year 15. We also want to own directly that this
version of the model produces smaller Year 10 and Year 15 numbers than an
earlier pass did — not because the business got worse, but because we
replaced an unsourced multiple assumption with one anchored to Eventbrite's
actual 2025 sale price and the events sector's real trading multiples (Item
2.3). A smaller, defensible number is worth more to us than a bigger one we
can't back up — it's the number we'd actually want an investor or a grant
committee testing, because it survives the question "where did that come
from?" The ranges still widen at each horizon because each one compounds more
unproven assumptions — expansion execution, competitive response, whether
real multi-country growth earns a premium above the mature-comp floor — and
presenting that compounding uncertainty as a false-precision single number
would be exactly the kind of overreach we've tried to avoid everywhere else
in this document. The Year-15 country-count extension is also, if anything,
likely conservative: it doesn't credit VIVRE for network or brand effects
that could compound faster than a linear country-count multiplier — eGotickets'
own ad-network and offline-billboard playbook (Item 3.2, Item 3.5) is an
example of exactly that kind of compounding we haven't tried to price in
here, precisely because we don't have real data to size it yet.

**One more sanity check worth naming directly.** The West Africa TAM built in
Item 2.2 gives us a real regional ceiling to test these numbers against, not
just a Burkina-Faso-specific one — and because Item 2.2 also projects that
TAM forward, we can check the Year-15 revenue range against a Year-15 TAM
instead of comparing a future revenue number to today's market size, which
would understate the real ceiling. By Year 15 (2041), the West Africa TAM is
projected at roughly $543M (~326B FCFA). Even the top of the Year-15 net
revenue range here, ~$5.4M, is under 1% of that grown regional TAM; the
bottom of the range, ~$1.8M, is roughly a third of one percent. We think
that's the right kind of number to be showing: a Year-15 ambition that
requires capturing a small, plausible slice of a real, and by then larger,
regional market — not one that quietly assumes something close to regional
dominance to make the math work.

**What would actually replace this model, and when.** The moment VIVRE has a
few months of its own real conversion rate, average ticket price, take rate,
and buyer-repeat-rate data, that data should replace the assumptions above
directly — the same discipline we applied to SOM in Item 2.2. A model built
on VIVRE's own numbers will always be more credible, to us and to anyone else
reading this, than one built on category assumptions, no matter how carefully
those assumptions are labeled.

---

## Item 6 — Risk Factors

Stated plainly, in one place, rather than scattered as footnotes throughout:

- **Single-market revenue ceiling.** As shown in Item 5, Burkina Faso alone
  likely caps annual revenue in the low-to-mid hundreds of thousands of
  dollars even at meaningful penetration. The long-term thesis depends on
  successful multi-country expansion (Item 4.2), which is unproven for VIVRE
  specifically.
- **Competitive claims are inference, not insider knowledge.** Everything in
  Item 3.2 about competitor weaknesses and strategy is built from public
  marketing and coverage, not from any non-public information. It's confident
  because it's checkable, not because it's certain.
- **Acquisition-target relationship risk.** The Faso Billetterie target in
  Item 4.2 is valuable specifically for institutional relationships that may
  not transfer cleanly with a change of ownership — this needs real diligence
  before being treated as a settled opportunity.
- **Market-sizing estimates are estimates, and our own methods disagree at
  the country level.** The continent-wide TAM in Item 2.2 is sourced; the
  West Africa TAM one level down is a top-down estimate validated against
  Nigeria's real, sourced number and is reasonably solid as a result; the
  Burkina-Faso-specific TAM, SAM, and SOM below that — plus the unit
  economics in Item 2.3 and the entire valuation model in Item 5 — get
  progressively less certain the further we get from a sourced figure. Our
  own top-down and bottom-up Burkina-Faso TAM methods land nearly 3x apart
  (Item 2.2); we picked the bottom-up figure as more defensible and said why,
  but that's a judgment call, not a fact. All of it should be treated as a
  starting model to refine with real data, not settled fact.
- **Valuation multiple depends on comps that may not transfer cleanly.** The
  1.7–3x range in Item 5 is anchored to Eventbrite's 2025 sale and the
  public events sector's trading multiples (Item 2.3) — both mature, larger,
  developed-market businesses. Whether an early-stage, single-country,
  emerging-market platform like VIVRE would actually command a multiple in
  that range, a premium to it, or a discount, is genuinely unknown until
  there's a real transaction or funding round to test it against.
- **Financial-inclusion framing has real limits.** As noted in Item 2.4,
  mobile-money inclusion benefits skew toward wealthier, more urban users —
  consistent with VIVRE's own addressable market, but a real constraint on
  how broadly the "force for good" story can honestly be told.
- **Data recency.** Every sourced figure in this document reflects public
  information as of August 2026. Demographic data ages slowly; competitor
  feature sets, funding, and market share can change quickly. Re-verify
  anything used in an external conversation.

---

## Closing

Every argument in this filing — every competitor weakness, every whitespace
customer, every growth tactic, every number in the valuation model — only
matters if it turns into a product people genuinely love using, not just
tolerate. The fastest way to lose all of the advantages described above would
be to build features because a competitor comparison suggested them, instead
of because a real Burkinabè organizer or buyer said this is what they
actually need. This document tells us *where* to point real product craft.
It isn't a substitute for doing that craft well, and we don't intend it to
read as one.

If we've done our job well a few years from now, the measure of it won't just
be a revenue line or a valuation range — it'll be whether buying a ticket in
Burkina Faso got easier, whether more people made it to more of the moments
that matter to them, and whether organizers who once needed a bank account
and a developer to sell fifty tickets could just do it, simply, on a phone
they already own. That's the version of "winning" worth building toward:
not just beating six competitors on a feature list, but making everyday life
here a little more fun, a little easier, and a little more full of the things
worth celebrating. Innovating in service of that — and building things people
genuinely love, not just tolerate — is the actual job. Everything else in
this document is just the reasoning for how we get there.

---

## Sources index

- [DataReportal — Digital 2026: Burkina Faso](https://datareportal.com/reports/digital-2026-burkina-faso)
- [Statista — Digital & Connectivity Indicators, Burkina Faso](https://www.statista.com/outlook/co/digital-connectivity-indicators/burkina-faso)
- [The Fintech Times — Burkina Faso's Fintech Ecosystem in 2026](https://thefintechtimes.com/burkina-fasos-fintech-ecosystem-in-2026/)
- [Kolonell — Couverture opérateurs mobile money 2026](https://kolonell.com/fr/blog/couverture-pays-operateurs-mobile-money-afrique-francophone-2026)
- [World Bank — Burkina Faso MPO](https://thedocs.worldbank.org/en/doc/bae48ff2fefc5a869546775b3f010735-0500062021/related/mpo-bfa.pdf)
- [AfDB — Burkina Faso Economic Outlook](https://www.afdb.org/en/countries/west-africa/burkina-faso/burkina-faso-economic-outlook)
- [Worldometer — Burkina Faso Demographics](https://www.worldometers.info/demographics/burkina-faso-demographics/)
- [World Population Review — Ouagadougou](https://worldpopulationreview.com/cities/burkina-faso/ouagadougou)
- [UN-Habitat — Burkina Faso](https://unhabitat.org/burkina-faso)
- [Statista — Event Tickets, Africa](https://www.statista.com/outlook/dmo/eservices/event-tickets/africa)
- [Tikerama](https://tikerama.com/en), [My Place Events](https://myplace-events.com/en/events), [FasoEvent](https://www.fasoevent.com/), [Faso Billetterie](https://www.fasobilleterie.com/), [Temba](https://tembas.com/), [E-events](https://www.e-events.net/), [eGotickets](https://egotickets.com/)
- [ScienceDirect — Mobile money and financial inclusion in Sub-Saharan Africa](https://www.sciencedirect.com/science/article/pii/S0167624523000495)
- [CIRSD — Mobile Money, Africa's Force for Social Good](https://cirsd.org/horizon-article/mobile-money-africas-force-for-social-good/)
- [StatisticsTimes — Africa Population](https://statisticstimes.com/demographics/africa-population.php)
- [Ticketing Fees UK — DICE vs Eventbrite Fees](https://ticketingfees.co.uk/dice-vs-eventbrite/)
- [Checkout Page — Eventbrite Fees 2026 Breakdown](https://checkoutpage.com/blog/eventbrite-fees)
- [DealMatrix — Events Sector Valuation Multiples](https://dealmatrix.com/valuation-multiples/by-industry/events/)
- [Skift Meetings — Bending Spoons to Acquire Eventbrite in $500 Million Cash Deal](https://meetings.skift.com/2025/12/02/bending-spoons-to-acquire-eventbrite-in-500-million-cash-deal/)
- [Worldometer — Western Africa Population](https://www.worldometers.info/world-population/western-africa-population/)
- [Statista — Event Tickets, Nigeria](https://www.statista.com/outlook/dmo/eservices/event-tickets/nigeria)
