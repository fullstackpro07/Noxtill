/**
 * Ground-truth knowledge base for the marketing-site chatbot (`ChatWidget` / the Gemini-backed
 * `/api/marketing-chat` route handler). Kept as a single exported string rather than scattered
 * across the individual page-content files so it's easy to review and update in one place as the
 * site's real copy changes — this is what stops the model from inventing features, prices or
 * policies that don't actually exist on the site.
 */
export const CHATBOT_KNOWLEDGE_BASE = `
# NOXTILL — PRODUCT KNOWLEDGE BASE

## 1. COMPANY OVERVIEW
Noxtill is an AI-powered business management platform for small and growing businesses (salons,
restaurants, clinics, retail shops, gyms, auto repair, bakeries, and similar service/retail
businesses). It brings point of sale, bookings, customer credit, inventory, reporting, messaging
and AI tools into one connected system, so a business doesn't need five separate apps.

The signature feature is the "Nightly Close": every night at a time the owner picks, Noxtill sends
one WhatsApp (or email) message with that day's sales, profit, tomorrow's bookings and outstanding
customer credit — a full daily summary without opening a dashboard.

## 2. CORE PRODUCT MODULES

### Run your day
- Nightly Close — the whole day summarised in one WhatsApp message at a chosen time (commonly 10pm).
- Fast Sale — point of sale that takes payment in under ten seconds, works offline (syncs when
  reconnected), sends receipts/invoices on WhatsApp, and updates stock, margin and staff commission
  with every sale. Supports cash, card, QR, UPI and other payment methods, multiple currencies and
  tax rates, and multiple locations/tills/staff.
- Orders — counter, delivery, dine-in and table orders in one board.
- Bookings — appointment scheduling with automatic reminders (one the day before, one closer to the
  time) and automatic waitlist offers when a slot cancels. Fewer no-shows, no paper diary.
- Customer Credit — a digital "Record Book" ledger: put a sale on credit in one tap, track the
  balance, its age, and partial payments, with polite WhatsApp reminders (with a payment link) on a
  schedule the owner sets.
- Products & Services (Catalogue) — the full catalogue with real cost prices so margins are known,
  not guessed.

### Know your numbers
- Profit & Loss — profit per item, per hour and per staff member, calculated from real cost prices,
  not just top-line sales.
- Inventory — stock levels, purchases, wastage, low-stock alerts; a sale automatically deducts the
  stock behind it.
- Analytics — cohorts, retention, and where revenue is actually coming from.
- Reports — PDF and Excel reports sent straight to WhatsApp.
- Business Health Score — one number summarising how the business is doing overall.
- Staff & Commissions — attendance, sales attribution, and what each staff member earned.

### Grow
- Reviews & Reputation — monitors reviews across Google, Facebook, Yelp, Trustpilot, BBB, G2,
  Capterra, Clutch, GoodFirms and more; drafts AI-assisted replies the owner approves before they
  post; automates review requests; catches complaints privately before they become public reviews;
  tracks a reputation score and sentiment over time; supports a public review-request QR flow and an
  embeddable review widget.
- Unified Inbox — WhatsApp, Instagram, Messenger, TikTok, LinkedIn, SMS, email and website chat in
  one inbox, with full customer context (past orders, bookings, payments, notes) visible before you
  reply, plus AI-suggested replies and auto-translation.
- Marketing & Campaigns — reach the right customers at the right time (segments, campaigns,
  automations, coupons/vouchers, referrals).
- Business Listings — keeps business details (address, hours, etc.) correct across the directories
  and platforms customers actually search on.
- Social & Advertising — post and run ads without leaving Noxtill.
- Multi-location — one account, every branch: each location keeps its own sales/stock/staff/bookings
  while reporting rolls up into one combined view, comparable branch by branch.

## 3. AI FEATURES ("Powered by AI")
- Business Assistant — ask a business question in plain language (WhatsApp, email, voice, or by
  uploading a file) and get an answer pulled from the business's own connected records (sales,
  stock, bookings, customers, credit). It never uses public internet data to answer business
  questions, and says so plainly if the answer isn't in the connected records — it does not invent
  numbers.
- AI Phone Receptionist — answers business calls 24/7, understands natural conversation (not a phone
  tree), gives approved information, captures leads, books appointments, and escalates to a person
  the moment a call needs one (complaints, custom requests, anything outside what it's approved to
  handle) — the transcript and captured intent stay attached to the lead either way.
- Voice-Entry Sales — say a sale out loud the way you'd say it to a colleague; Noxtill transcribes
  and parses it, then shows a confirmation card with every line item and the total — nothing posts
  to the records until the owner confirms once.
- Photo Digitizer — photograph a paper ledger, receipt book or handwritten register; it reads both
  handwritten and printed rows and turns each into a structured record the owner reviews and
  confirms before saving — no manual re-typing.
- AI Insights — continuously reviews connected data and surfaces what changed, why it likely
  changed, and a suggested next action — flagging things before the owner would have noticed.

### The three AI commitments (what Noxtill's AI never does)
1. No invented numbers — every figure comes from the business's own connected records; if the data
   isn't there, the AI says so rather than guessing.
2. Honest uncertainty — when a question can't be answered confidently from the data, it says so
   plainly instead of presenting a guess as fact.
3. Human approval first — anything sensitive (a sale, a message to a customer, a record change)
   waits for the owner's confirmation before it happens.
Business data is never used to train public/shared AI models — it's encrypted, private, and used
only to answer that business's own questions.

## 4. WHO NOXTILL IS FOR
Built for businesses that sell or book, take payment, keep stock or customer records, and need to
know their real numbers. Dedicated pages exist for: Salons & Barbershops, Restaurants & Cafés,
Dental & Medical Clinics, Gyms & Fitness Studios, Retail & Shops, Auto Repair, Spas & Beauty,
Bakeries, Pet Grooming, Tailors & Alterations, Photographers, Tutoring & Academies, Home Services,
Cleaning, Event Venues, and Laundry & Dry Cleaning — plus more than 300 business types overall.

Common needs Noxtill solves regardless of industry: reducing no-shows, collecting more reviews,
tracking customer credit, knowing real profit (not just sales), digitising paper records, and
running several locations from one account.

## 5. PRICING
Four plans plus Enterprise, billed monthly or yearly (yearly is paid upfront for 12 months and is
about 25% cheaper than monthly). No per-user fees: each plan includes a set number of users. Every
plan starts with a 14-day free trial with no credit card required (trials include 200 AI credits;
AI Receptionist calls and paid SMS or marketing campaigns unlock after a payment method is added).
When a trial ends there is a 72-hour grace period to activate a plan and a 30-day window to export
data.

- Starter — $39/mo, or $29/mo billed yearly ($348/year). For single-location businesses getting
  organized. 2 users, 1 location, 500 AI credits/month, 2,000 emails/month. Includes Dashboard &
  Nightly Close, Fast Sale (POS), orders/quotes/invoices, Products & Services, Inventory, Customer
  Credit, Bookings, Customers (CRM), Staff, AI Assistant, AI Photo Digitizer, WhatsApp alerts and
  receipts, Reports, integrations.
- Growth — $79/mo, or $59/mo billed yearly ($708/year). Most popular. For growing businesses that
  market and message customers. 5 users, 1 location, 1,500 AI credits, 10,000 emails, 2,000
  automation runs. Everything in Starter, plus Unified Inbox, Marketing & Campaigns, Reviews &
  Reputation, Social Media Management, Business Listings, Website & Commerce, Automations &
  Workflows, Projects & Tasks, Delivery & Riders, Profit & Analytics, sales pipeline, the AI
  Receptionist agent and calling tools, live chat support.
- Professional — $159/mo, or $119/mo billed yearly ($1,428/year). For established businesses
  running finance, field teams and support. 15 users, 3 locations, 4,000 AI credits, 25,000 emails,
  10,000 automation runs. Everything in Growth, plus Finance & Accounting, People & Payroll,
  Payments & Billing, Field Service, Helpdesk, Customer Portal, Contracts & eSign, more AI voice
  agents, AI agents in workflows, AI Copilot, custom roles, full audit trail, guided onboarding call.
- Business — $319/mo, or $239/mo billed yearly ($2,868/year). The complete 40-module Business OS
  for multi-location teams. 40 users, 10 locations, 8,000 AI credits, 75,000 emails, 50,000
  automation runs. Everything in Professional, plus Branches, Business Intelligence, SEO Autopilot,
  Autonomous Commerce, Procurement, Assets & Maintenance, Advertising, Competitive Insights, all 8
  AI voice agents, sandbox environments, priority support.
- Enterprise — custom pricing, typically from $799/month billed yearly. For franchises, multi-brand
  groups and large teams: custom limits, custom AI agents, SSO, uptime and support SLA, a dedicated
  success manager, data migration, security review and DPA, yearly invoice billing. Contact sales.

Founding Member Offer: customers who choose yearly Professional or Business before January 1, 2027
get 14 months for the price of 12 on their first term (then renews at the standard yearly price;
cannot be combined with other offers).

Usage-based add-ons (not included in plan prices):
- AI Receptionist: $0.35 per AI minute, no monthly fee (Growth and above). Human agent seat
  $19/month per agent who takes or makes calls; human call minutes $0.03/min in the U.S.; phone
  numbers $3/month local, $5/month toll-free; Speech & Quality Intelligence $0.05 per analyzed
  minute (Professional and above).
- Extra user $10/month; extra location $39/month; extra website $15/month.
- AI credits $10 per 1,000; extra emails $1 per 1,000; AI Photo Digitizer pages $5 per 100; extra
  SEO keywords $10 per 100; extra eSign envelopes $1 each. SMS rates vary by country and are shown
  before sending. People & Payroll is $29 + $6 per employee (Professional and Business).

Billing facts:
- Cancel anytime. Upgrades apply immediately and are prorated; downgrades take effect at the next
  renewal.
- All prices are in USD; sales tax, VAT or GST may apply by location.
- WhatsApp: the business connects its own WhatsApp Business account; Meta bills its message fees
  directly and Noxtill adds no markup.
- Noxtill never takes a percentage of sales; card processing fees are charged by the business's own
  payment provider.
- Data can be exported anytime, and for 30 days after cancelling.
- Refunds: see the Refund & Cancellation Policy at /legal/refunds (it has an eligibility checker).
Exact, current pricing is always shown at /pricing — point users there for the final word if they
need to double-check a number. Legal documents live in the Legal & Trust Center at /trust.

## 6. INTEGRATIONS
Noxtill connects with the tools a business already uses rather than requiring a full switch:
e-commerce (Shopify, WooCommerce), payments (Stripe, Square, PayPal), accounting (QuickBooks, Zoho),
CRM/marketing (HubSpot, Mailchimp), messaging/channels (WhatsApp, Instagram, Messenger, SMS, email,
website chat, TikTok, LinkedIn), business listings (Google Business Profile, Apple Business Connect,
Bing Places), reputation platforms (Google, Facebook/Meta, Yelp, Trustpilot, BBB, G2, Capterra,
Clutch, GoodFirms), automation (Zapier), and more — the full, current list is at
/integrations-directory. Users can request a connector that isn't listed yet.

## 7. FREE TOOLS (no signup required, under /resources)
- No-Show Cost Calculator — estimates what missed appointments cost a business per year.
- Profit Margin Calculator — shows what an item really earns after its true cost.
- Review Response Generator — drafts a reply to any customer review.
- QR Code Generator — makes a QR code for a booking page or review link.
- Business Health Check — eight quick questions producing one score and next actions.

## 8. FREQUENTLY ASKED QUESTIONS (answer from these directly when a question matches)
Q: What is the Nightly Close?
A: A single daily business summary message. At a chosen time (commonly 10pm) Noxtill sends the
day's sales, profit, orders, tomorrow's bookings and outstanding customer credit to WhatsApp or
email — no dashboard needed to know how the day went.

Q: How do I track customer credit in Noxtill?
A: Put any sale on credit at the till in one tap. The credit ledger records the balance, its age and
every part payment, and can send polite WhatsApp reminders with the balance and a payment link on a
schedule you set.

Q: How does Noxtill reduce no-shows?
A: Two reminders — one the day before, one about two hours ahead — over WhatsApp or SMS, and
cancelled slots are automatically offered to the waitlist.

Q: Does Noxtill work without internet?
A: Yes — sales can be taken offline and sync automatically once the connection returns.

Q: Can Noxtill import my paper records?
A: Yes — photograph the paper register or ledger and the Photo Digitizer reads it into structured
records for review and confirmation.

Q: What happens to my data if I leave?
A: Data stays exportable for 30 days after cancelling, in standard formats. Noxtill never sells
customer data or holds it hostage.

Q: Can Noxtill replace my point of sale and booking software?
A: Yes — point of sale, appointment booking, invoices, inventory, customer records and reporting are
all included, so most businesses replace a separate till, a booking tool and a reviews tool with one
subscription.

Q: Does Noxtill work for multiple locations?
A: Yes — one account can run several branches, each with its own staff, stock and bookings, rolled
up into one combined view and one nightly summary.

Q: Is my business data used to train public AI models?
A: No — data is encrypted, private, and used only to answer that business's own questions.

Q: Can several branches share one account?
A: Yes — each location keeps its own sales, stock, staff and bookings, while reporting rolls up into
a combined, branch-comparable view.

Q: Do I have to replace the tools I already use?
A: No — connect the existing online store, card reader, accounting software and messaging channels
via /integrations-directory; Noxtill becomes the place they all agree.

## 9. GETTING STARTED / CONTACT
- Every plan includes a 14-day free trial, no credit card required.
- "Book a Demo" (/book-a-demo) is the main call to action across the site — a short form; the team
  typically follows up within one business day.
- Support: /resources/contact-support. General resources hub: /resources.
- Full, current pricing: /pricing. Full integrations list: /integrations-directory. Every product
  feature in depth: /product. Solutions by business type or need: /solutions.
`.trim();
