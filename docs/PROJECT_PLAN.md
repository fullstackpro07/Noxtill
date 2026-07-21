# Noxtill — Project Roadmap & Ticket Breakdown

Single source of truth for build sequencing. Companion to `Noxtill_Backend_Developer_Spec.docx` and `Noxtill_Frontend_Developer_Spec.docx` in this directory — those specify *what* to build; this file sequences *when* and in what order, broken into tickets sized for daily pickup (roughly half-day to one-day each).

**Build order: Backend → Frontend → API Integration.** Frontend is built against typed API stubs (no live calls) so it isn't blocked on backend completion; Phase 3 wires the two together module by module.

Current repo state at time of writing: `backend/` is a NestJS scaffold with empty service stubs and no Prisma models yet; `frontend/` is a Next.js 16/React 19 scaffold with empty feature folders. This is a greenfield build.

---

## Architecture rules (apply to every backend ticket)

- **Tenancy**: every tenant table carries `business_id`; a repository/query layer injects it from auth context — never passed manually. CI must prove cross-tenant isolation (reads, writes, search, exports, webhooks, AI tools).
- **Queue rule**: no external call (WhatsApp/SMS/email/Google/Stripe/Claude/PDF/feed sync/ads) runs inside an HTTP request — always a BullMQ job, 5-attempt exponential backoff, dead-letter queue, per-job idempotency key.
- **Webhook rule**: every handler inserts `(provider, event_id)` into `webhook_events` first; conflict → 200 and stop; then enqueue processing.
- **Audit rule**: every financial mutation writes to append-only `audit_log`.
- **RBAC**: owner/manager/staff via guards + data filters (staff = own records only; manager = all but billing/plan/role-changes/full-exports; owner = everything).
- **Files**: all generated files → S3 → signed URLs, 24h expiry.
- **Localization**: `businesses.currency/timezone/locale` drive all formatting server-side; nothing regional hard-coded.

---

## Phase 1 — Backend (NestJS + Prisma + PostgreSQL + BullMQ/Redis)

### Milestone BE-M0 — Foundation & Infra
*Nothing else can be trusted until this milestone is done correctly.*

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-001 | Prisma schema — identity & tenancy tables: `business_categories`, `business_types`, `plans`, `businesses`, `users`, `business_users` | — | Migration runs clean; `businesses` has currency/timezone/locale/channel_pref/quota fields; `business_users` has role+commission_rule JSONB |
| BE-002 | Prisma schema — commerce tables: `customers`, `products`, `orders`, `order_items`, `payments`, `credit_entries` | BE-001 | Unique `(business_id, phone)` on customers w/ trigram index; order_items store name/price/cost snapshots |
| BE-003 | Prisma schema — ops tables: `appointments`, `messages`, `webhook_events`, `review_requests`, `private_feedback`, `external_reviews` | BE-001 | `webhook_events` PK `(provider, event_id)`; `review_requests.token` unique |
| BE-004 | Prisma schema — inventory/finance tables: `stock_movements`, `expenses`, `attendance`, `campaigns`, `competitors`, `audit_log` | BE-001 | `audit_log` insert-only at DB role level (no UPDATE/DELETE grants) |
| BE-005 | Prisma schema — new tables + views: `import_batches`, `integrations`, `ad_campaigns`, `email_campaigns`, `email_events`, `product_feed_items`, `gmb_posts`, views `v_credit_balances` + `v_daily_close` | BE-002,003,004 | Views queryable via raw Prisma query; all NEW tables present |
| BE-006 | Tenancy injection layer: Prisma middleware/repository wrapper auto-injects `business_id` from request context | BE-001 | Unit test proves a query without explicit business_id still scopes correctly; attempt to cross-read another tenant throws |
| BE-007 | Auth: signup/login, JWT (15-min access + refresh rotation), bcrypt/argon2, brute-force lockout | BE-001 | `POST /auth/signup` creates business+owner+tokens; `POST /auth/login`; lockout after N failed attempts |
| BE-008 | RBAC guards + role decorators (owner/manager/staff) + per-route data filters | BE-007 | E2E test: staff account 403s on billing/role-change routes; sees only own sales |
| BE-009 | Audit-log interceptor wired into financial mutation endpoints | BE-004,006 | Any sale/payment/credit/refund/import/export writes a row with before/after |
| BE-010 | BullMQ base module: connection, queue registration pattern, retry/backoff/dead-letter helper, idempotency-key helper | — | Sample job demonstrates 5x backoff + DLQ landing on forced failure |
| BE-011 | Webhook idempotency base (shared `handleWebhook(provider, eventId, payload)` helper) | BE-003,010 | Duplicate event_id returns 200 without reprocessing, proven by test |
| BE-012 | S3 module + signed-URL helper (24h expiry) | — | Upload+signed-GET round-trip test passes |
| BE-013 | Global conventions: error format `{error:{code,message,fields?}}`, class-validator pipes, file-type sniffing/size limits, helmet, CORS allowlist, per-business rate limiting | BE-007 | Bad payload returns typed error shape; oversized/mismatched file upload rejected |
| BE-014 | Localization helpers: currency/timezone/locale formatting utilities read from business context | BE-001 | Unit tests format the same amount differently per business currency/locale |

### Milestone BE-M1 — Messaging Engine & Nightly Close
*Everything downstream sends messages through this.*

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-015 | Send gate function: opt-out check → quota check → template-exists check → channel resolution (pref → availability → WA→SMS→email fallback) | BE-001,014 | Unit tests cover all 4 failure branches with typed errors |
| BE-016 | Meta WhatsApp Cloud API adapter (direct) + 24h service-window tracking per customer | BE-011,015 | Test send succeeds against sandbox; window flag toggles on inbound reply |
| BE-017 | SMS adapter (Twilio/local) + Email adapter (SES/Postmark) | BE-015 | Both adapters implement same `ChannelSender` interface |
| BE-018 | Message worker: BullMQ consumer renders template (locale/currency vars) → sends → stores provider_ref → status transitions | BE-016,017 | Queued message reaches `sent` status in test; failure path retries then dead-letters |
| BE-019 | Webhook endpoints `/webhooks/meta`, `/webhooks/twilio`, `/webhooks/email` (idempotent, enqueue-only) | BE-011,016,017 | Status webhook flips message to delivered/read/failed |
| BE-020 | Template registry: Utility set (booking_confirm, booking_reminder, order_status, receipt, credit_reminder, owner_alert, nightly_close, birthday) + Marketing set (review_request, campaign), keyed by `(template_key, locale)` | BE-015 | Missing-template case hits send-gate typed error |
| BE-021 | `POST /messages/test` (owner), `GET /messages?customer_id` | BE-018 | Owner can trigger a real test send; history lists correctly |
| BE-022 | Nightly Close: hourly scheduler tick (per-business local time match) → job composes from `v_daily_close` + today's reviews/feedback + tomorrow's appointments + credit payments + low-stock scan → `GET /day/:date`, `PATCH /settings/nightly-close` | BE-005,018,020 | At configured local time a nightly_close message is queued and sent in test business |

### Milestone BE-M2 — Products, POS & Orders

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-023 | Products CRUD + variations JSONB, kind product/service | BE-002 | Create/update/list/deactivate all tenant-scoped |
| BE-024 | Product import: CSV/XLSX upload → column mapping → validation report → background job → error CSV | BE-010,023 | Import 3 test rows (1 invalid) → 2 created, 1 in error CSV |
| BE-025 | `POST /sales` — atomic transaction: order+items snapshot → cogs/profit, stock_movements, customer upsert/stats, payment OR credit_entry, audit, enqueue review-request | BE-002,009,022 | Forced mid-transaction failure leaves zero partial rows (full rollback proven by test) |
| BE-026 | `PATCH /orders/:id/status` with flow guard + auto order_status message | BE-020,025 | Illegal transition rejected; valid transition enqueues message |
| BE-027 | Invoice PDF: Puppeteer render (locale+currency+tax) → S3 → signed URL, optional send | BE-012,014,025 | Generated PDF opens and shows correct currency formatting |
| BE-028 | Quotations + `POST /quotations/:id/convert` → prefilled order | BE-025 | Convert produces an order with quotation's line items |
| BE-029 | Public ordering/dine-in endpoints (+ table QR) | BE-025 | Public POST creates a pending order without auth, tenant-scoped by biz slug |

### Milestone BE-M3 — Credit Ledger

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-030 | `GET /credit` (from `v_credit_balances`) + `POST /credit/payments` | BE-005,025 | Payment entry reduces displayed balance immediately |
| BE-031 | `POST /credit/remind` (single or `all:true`) using Utility template, opt-out safe | BE-020 | Opted-out customers excluded from bulk remind |
| BE-032 | `GET /credit/:customer/statement` khata-style PDF | BE-012,030 | PDF shows dated entries + running balance matching ledger |

### Milestone BE-M4 — Inventory, Expenses, P&L

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-033 | `POST /inventory/purchases` (+qty, refresh cost_price), `POST /inventory/wastage` (−qty + reason) | BE-023 | Purchase updates product.cost_price; wastage requires reason enum |
| BE-034 | `GET /inventory` (on-hand/threshold/value) + `/inventory/:product/movements` timeline | BE-033 | Movement history matches all purchase/sale/wastage events |
| BE-035 | Expenses CRUD + recurring flag + monthly clone job | BE-010 | Job clones recurring expense on month boundary in test |
| BE-036 | `GET /profit/products`, `GET /profit/time` (with insight strings) | BE-025 | Margin% and window param (30/90d) computed correctly |
| BE-037 | `GET /profit/pnl?month` | BE-035,036 | Net = revenue − COGS − expenses matches manual calc on seed data |
| BE-038 | `POST /ai/what-if` (Claude call, own history, mandatory disclaimer field) | BE-075 (AI infra) | Response always includes disclaimer string |
| BE-039 | `low_stock_scan` hourly job → dashboard alert + feeds Nightly Close | BE-022,034 | Product below threshold appears in next nightly close payload |

### Milestone BE-M5 — CRM & Customer Import

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-040 | Customers CRUD (search name/phone trigram, tags, consent) + GDPR erasure (typed confirm, audit) | BE-002,009 | Erasure wipes PII, keeps anonymized history, is audit-logged |
| BE-041 | `GET /segments/:key` + `tag_rules` nightly job (VIP/Lapsed) + `birthday_greetings` daily job (per timezone) | BE-014,020,040 | Segment counts match tag assignment after nightly job run |
| BE-042 | Import pipeline (1-2): parse csv/xlsx/txt/docx (Claude extraction, chunked, temp 0) → normalize phone to E.164 | BE-075 | txt file with 3 names/phones extracts correctly |
| BE-043 | Import pipeline (3-4): dedupe by `(business_id, phone)` + opening-balance → credit_entries | BE-042 | Re-importing same person updates, never duplicates; balance creates a credit entry |
| BE-044 | Import pipeline (5-6): preview/confirm + queued batch execute (500/batch), idempotent by content hash, audit-logged | BE-010,043 | Re-uploading identical file returns prior batch, doesn't reprocess |

### Milestone BE-M6 — Reviews & Reputation

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-045 | `POST /reviews/requests` (token, scheduled +2h) + `review_reminders` job (day3/day7, max 2) | BE-020,022 | Reminder doesn't fire if `responded_at` set |
| BE-046 | Public `GET/POST /r/:token`: branding load, 404 if used>30d, 4-5★ → redirect/public_review_url or private-mode thank-you, 1-3★ → private_feedback + owner_alert | BE-003,022 | Both branches (public URL set / NULL) behave per spec |
| BE-047 | `GET /reviews` unified list (external+private, filters) + `PATCH /feedback/:id` (status/assignee, resolve requires note) | BE-046 | Resolve without note ≥5 chars rejected |
| BE-048 | `POST /reviews/:id/reply` (queued platform reply) + `/ai-draft` (Claude, reviewer's language) | BE-075 | Draft language matches source review's detected language |
| BE-049 | `google_sync` job every 30 min: pull reviews upsert by `(platform, external_id)`, push queued replies | BE-047 | Duplicate external review not re-inserted on second sync |
| BE-050 | `GET /reviews/widget/:biz` cached embed JSON | BE-047 | Response cacheable 60s, public, no auth |

### Milestone BE-M7 — Bookings

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-051 | `GET /public/booking/:biz/services` (active services from products kind=service) | BE-023 | Only active, service-kind products returned |
| BE-052 | `GET /public/booking/:biz/slots?service&staff&date` computed from working hours + existing appointments | BE-003 | Occupied slots excluded from chips |
| BE-053 | `POST /public/booking/:biz` with row-level slot lock (`SELECT…FOR UPDATE`), race loss → 409 | BE-052 | Concurrent double-booking test: one wins, other gets 409 |
| BE-054 | `PATCH /appointments/:id` (status flow; completed→review-request enqueue; no_show→customer flag) + `GET /appointments?from&to&staff` | BE-045,053 | Completing an appointment enqueues a review request |
| BE-055 | `GET/POST /public/appt/:token/reschedule|cancel` + `booking_reminders` job (T-24h, T-2h, skip if cancelled) | BE-020,053 | Cancelled appointment's reminder job is skipped |

### Milestone BE-M8 — Staff & Multi-location

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-056 | Staff CRUD (owner-guarded) + `commission_rule` JSONB (percent/per-service) | BE-008 | Non-owner blocked from role changes |
| BE-057 | `POST /attendance/toggle` (check-in/out timestamps) | BE-004 | Toggle flips state and timestamps correctly |
| BE-058 | `GET /staff/commissions?month` (per-staff sales × rule) | BE-025,056 | Commission math matches rule type on seed data |
| BE-059 | Branch scoping (X-Branch header/`?branch=`) + `GET /rollup/dashboard`, `/rollup/compare` | BE-001,006 | Parent business sees combined roll-up across branches |
| BE-060 | `POST /ai/branch-advisor` (own-branch data only, refuses external questions) | BE-059,075 | Off-topic question returns refusal, not hallucinated advice |

### Milestone BE-M9 — In-product Marketing

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-061 | `POST /campaigns` (segment fan-out via send gate, quota precheck) + report funnel | BE-015,041 | Insufficient quota blocks send with typed error before any message queued |
| BE-062 | `POST /referrals/settings`, `GET /referrals/stats` | BE-004 | Reward config persists; stats reflect trackable codes |
| BE-063 | Competitors CRUD (Google place lookup, max 5) + weekly `competitor_snapshot` job | BE-004,010 | 6th add attempt rejected; snapshot job updates rating/count weekly |

### Milestone BE-M10 — Platform Billing

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-064 | Stripe products/prices for 4 plans + `POST /billing/checkout` | BE-001 | Checkout session created against correct price ID |
| BE-065 | Stripe webhooks (idempotent) → plan/quota updates; trial 14d no card; expiry downgrade job | BE-011,064 | Trial expiry downgrades to Basic-level read-only beyond limits |
| BE-066 | `PaymentProvider` adapter interface + one regional gateway implementation | BE-064 | Adding gateway requires only new adapter + config row (documented + demonstrated) |

### Milestone BE-M11 — Widgets, Dashboard, Search, Analytics

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-067 | Widget registry + `GET /widgets/registry`, `GET /widgets/:key` (25-30 widgets, 60s cache) | BE-001 | Each widget independently fetchable and cacheable |
| BE-068 | `GET/PUT /dashboard/config` + `GET /dashboard/today` aggregate | BE-067 | Config JSON round-trips; aggregate hydrates first paint in one call |
| BE-069 | `GET /business-types?q` + `POST /business-types/ai-map` (Claude) | BE-075 | AI-mapped type persists with `ai_generated=true` |
| BE-070 | `GET /search?q` (pg_trgm, tenant-scoped, grouped, 150ms budget) | BE-002,003 | Query across customers/orders/products/bookings/reviews/credit/expenses returns grouped results under budget |
| BE-071 | `GET /analytics/*` (kpis, revenue-series, cohorts, campaigns, staff, channels) | BE-025,061 | Cohort retention numbers match seed-data expectation |
| BE-072 | `POST /events` instrumentation + `GET /admin/*` platform endpoints | BE-001 | Admin-only guard enforced; events recorded for activation funnel |

### Milestone BE-M12 — AI Assistant

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-073 | RAG help pipeline: doc indexing (chunks+embeddings or keyword hybrid) → retrieve top-k → Claude answers only from passages, with deep links | — | Question outside indexed docs yields honest "not found" |
| BE-074 | Tool-calling registry (15 read-only tools, tenant-locked server-side) + `POST /assistant/chat` streamed | BE-006,073 | Every numeric answer traceable to a tool-call result, never fabricated |
| BE-075 | Shared AI infra service (reused by reviews/what-if/reports/type-mapper/import/branch-advisor) + per-business rate limit + monthly cost cap + tool-call logging | BE-074 | Exceeding cost cap blocks further AI calls for that business until reset |

### Milestone BE-M13 — Reports & Exports

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-076 | `POST /reports/{monthly\|pnl\|sales\|staff\|reviews}` → queued PDF → signed URL | BE-012,027,037 | Role gate: staff sees own-sales report only |
| BE-077 | `GET /exports/{sales\|customers\|credit\|stock\|expenses}.xlsx` (sync small / queued large) + `POST /exports/account-zip` (owner only) | BE-012 | Large export returns "preparing" + later notification with 24h link |

### Milestone BE-M14 — SEO Engine (backend)

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-080 | Programmatic page-data generator hook (new `business_types` row → SSG build hook) + `sitemap.xml` | BE-001 | Adding a business_type triggers the hook in test |
| BE-081 | Search Console API ingest → `GET /admin/seo` (rankings, indexed count, signup attribution by landing slug) | BE-072,080 | Admin endpoint returns ingested ranking data |

### Milestone BE-M15 — Marketing Integrations Hub (Module 18) + Security Hardening

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| BE-082 | Connector interface (`authUrl/handleCallback/refreshToken/sync/disconnect`) + `integrations` table wiring + token encryption (KMS/libsodium) | BE-005,011 | Tokens never stored plaintext; status transitions not_connected→connected→needs_attention on refresh failure |
| BE-083 | Email connector (SES/Postmark), `email_campaigns`/`email_events` fan-out via send-gate analog, suppression list, mandatory signed unsubscribe | BE-015,082 | Unsubscribed recipient excluded from next send |
| BE-084 | Google My Business connector (OAuth, posts job, photo upload, daily insights pull, Q&A list/reply) | BE-082 | Scheduled post fires at `scheduled_for` via job |
| BE-085 | Google Ads connector (smart-campaign creation, daily stats pull, pause/resume) | BE-082 | No billing touches our system — disclaimer field present in response |
| BE-086 | Google Merchant Center connector (feed built FROM products, nightly + debounced sync, issues ingest) | BE-023,082 | Product edit triggers debounced feed resync within expected window |
| BE-087 | Meta Ads connector (OAuth FB+IG, review-to-ad server-side creative render, daily stats, pause/resume) | BE-047,082 | Selecting a 5★ review produces a branded creative image artifact |
| BE-088 | TikTok Ads connector (OAuth, slideshow creative job from product photos, campaign create, daily stats, pause/resume) | BE-023,082 | Slideshow job produces a video/slide artifact from selected photos |
| BE-089 | `GET /marketing/overview` aggregator (cost-per-result across channels) + `POST /ai/marketing-note` | BE-061,083-088,075 | Overview aggregates all connected channels' spend/results consistently |
| BE-090 | Full security/compliance pass against spec §6 checklist (webhook signature verification all providers, PII/erasure, no card data stored, tokens ≥22 chars, helmet/CORS/HTTPS, no-PII logging, backup+restore drill in CI) | All prior BE tickets | Checklist fully green; restore drill runs green in CI |

---

## Phase 2 — Frontend (Next.js 16 / React 19, built against typed API stubs — no live calls yet)

### Milestone FE-M0 — Design System & Shell

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-001 | Tailwind design tokens: colors (#FAF7F0 bg, #0C4B3B primary, #E8A93C accent, #B94A3D destructive, #128C5E WhatsApp), radius 14px, pill buttons, Bricolage Grotesque + Instrument Sans fonts | — | Storybook/preview page shows tokens applied |
| FE-002 | App shell: sidebar 220px→hamburger <768px (13 items, role-hidden for Staff), top bar 64px (search w/ Ctrl/⌘K badge, language dropdown incl. RTL flip+persist, notification bell, branch dropdown) | FE-001 | RTL toggles layout direction live for Urdu/Arabic |
| FE-003 | Shared state kit: skeleton blocks, empty-state (illustration+1 action), inline/banner/toast errors, permission lock card, quota modal, offline banner, destructive-confirm pattern | FE-001 | Each state has one reusable component consumed via Storybook demo |
| FE-004 | Auth screen: Signup/Login tabs, smart email-or-phone field, password strength meter, country/currency/language dropdowns | FE-001,003 | Country change re-suggests currency/language without overwriting manual edits |
| FE-005 | Business Type Picker: search + 12 category cards + AI one-line description fallback banner | FE-004 | No-match state pulses AI banner |
| FE-006 | Setup wizard (5 steps, resumable, skippable except step 1) | FE-005 | Each step persists independently (stubbed) |

### Milestone FE-M1 — Dashboard

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-007 | Dashboard view mode: 4-across widget grid (2 on mobile), alert stack, latest-review card, range dropdown | FE-002,003 | New-business empty state shows 3 shortcut buttons |
| FE-008 | Dashboard customize mode: drag handle+✕ on widgets, dnd-kit grid, "+ Add widget" drawer gallery (grouped, searchable) | FE-007 | Save persists order via stub; cancel restores previous layout |

### Milestone FE-M2 — Settings

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-009 | Settings > Messages (channel dropdown, nightly-close time picker, per-language template preview) | FE-001 | Time picker defaults 22:00 local |
| FE-010 | Settings > Business profile, Language & region (RTL preview), Tax, Billing & plan (usage meters, plan table), Data & privacy (export zip, erasure log), Danger zone (typed confirm) | FE-002,003 | Danger-zone delete requires typed confirmation text |

### Milestone FE-M3 — Products, POS, Orders

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-011 | Products list (search/category/kind filters, table/grid toggle) + Add/Edit drawer (variations repeater, live margin hint, duration field for services) | FE-003 | Margin turns red under 10% |
| FE-012 | CSV import flow (upload → column-mapping table → validation report → import) | FE-011 | Error rows downloadable as CSV (stubbed) |
| FE-013 | Fast Sale POS: tile grid, cart bottom-sheet/right column, 4 payment buttons, credit customer lookup+balance, barcode input, offline queue banner | FE-003,011 | Credit path shows existing balance in red before confirm |
| FE-014 | Orders board (Kanban drag = status change) + Tables tab (floor grid) + Quotation card (send/convert) | FE-013 | Dragging card between columns triggers stub status-change call |
| FE-015 | Invoice/receipt templates: A4 (green header, items table, tax/discount/total, QR) + 80mm thermal-safe | FE-011 | Both render correctly at print width |

### Milestone FE-M4 — Credit Ledger

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-016 | Credit screen: total receivable header, remind-all confirm (recipient count), debtors table, record-payment modal (live new-balance preview), statement PDF share | FE-003,011 | Zero-debtors empty state shows positive message |

### Milestone FE-M5 — Inventory, Expenses, P&L

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-017 | Inventory screen (status/supplier filters, table, movement-history drawer, purchase/wastage drawers) | FE-003,011 | Wastage drawer requires reason selection |
| FE-018 | Expenses screen (month selector, category donut chart, recurring toggle, add drawer) | FE-003 | Recurring badge shown on recurring entries |
| FE-019 | Profit 4-tab screen: Products (margin flags), Time (hourly bar + insight line), P&L (statement card, export/send), What-if (slider + always-visible disclaimer) | FE-003 | Disclaimer never hidden regardless of slider position |

### Milestone FE-M6 — CRM

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-020 | Customers list (instant search, tag chips, segment bar → prefilled campaign builder link) | FE-003 | Selecting a tag reveals segment bar with count |
| FE-021 | Customer profile: stat cards (clickable), purchase history, reviews/complaints, editable notes, tags, export/erase menu | FE-020 | Erase requires typed confirmation |

### Milestone FE-M7 — Reviews & Reputation

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-022 | Unified inbox: filter bar (platform/rating/status/date), review card w/ AI-reply inline draft, summary panel (avg+sparkline+distribution+conversion) | FE-003 | AI-draft box shows Approve&Post / Edit |
| FE-023 | Private complaints table + row drawer (full text, mini customer profile, reply box, resolution note ≥5 chars) | FE-022 | Resolve button disabled under 5 chars |
| FE-024 | Public rating page (mobile-first, ≤50KB critical path, both branches: public-URL redirect vs private-mode thank-you) | FE-001 | Loads and completes flow on throttled 2G test |
| FE-025 | QR generator (A5/A4/Sticker, PNG/PDF download) + widget generator (light/dark toggle, layout dropdown, embed snippet) | FE-022 | Embed snippet copies to clipboard |

### Milestone FE-M8 — Bookings

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-026 | Calendar: day/week toggle, staff columns×hour rows, color-coded blocks, drag-reschedule, status drawer, walk-in modal | FE-003 | Slot-conflict drag shows shake+toast |
| FE-027 | Public booking page: 3-step mobile flow (services→staff/date/time→confirm), race-loss "just taken" handling | FE-001 | Unavailable time chips greyed correctly |

### Milestone FE-M9 — Staff & Multi-location

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-028 | Staff & commissions: team list, invite modal (commission builder), commission report, team inbox (my-tasks default for Staff) | FE-003 | Staff role sees only own assigned tasks by default |
| FE-029 | Branches screen: branch dropdown (all/each/+add), roll-up comparison table+chart, branch-advisor card | FE-003 | Advisor card always shows "based on your own data" disclaimer |

### Milestone FE-M10 — Marketing, Search, Analytics

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-030 | Campaign builder: 4-step (audience/message w/ variable chips/quota meter/send) + funnel report | FE-020 | Insufficient-quota state blocks step 4 with upgrade modal |
| FE-031 | Referrals & competitors screens (rewards config, rival cards, 12-week comparison chart, keyword editor) | FE-003 | Competitor add blocked at 6th entry |
| FE-032 | Deep Search overlay (Ctrl/⌘K, grouped results, keyboard nav, debounced 150ms) | FE-002 | ↑↓↵esc all functional |
| FE-033 | Analytics screen (KPI cards+deltas, revenue line chart, cohort grid, campaign table, staff leaderboard, channel stats) | FE-003 | All cards click through to filtered record views |

### Milestone FE-M11 — AI Assistant & Reports

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-034 | Assistant panel: streaming bubbles, quick chips, deep-link chips, honest-fallback style | FE-003 | Streaming indicator shows during stubbed delayed response |
| FE-035 | Reports screen: PDF grid (download+WhatsApp-send buttons), Excel chips, export-everything zip (owner-only), preparing-toast pattern | FE-003 | Large export shows "preparing" toast then notification pattern |

### Milestone FE-M12 — Marketing Site & Module 18 UI

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| FE-037 | Landing page + programmatic type-page template (300 pages, FAQ accordion schema) | FE-001 | Template renders correctly with varied sample data |
| FE-038 | Integrations hub screen: connector card grid, OAuth modal, status chips (not_connected/connected/needs_attention) | FE-003 | Expired-token state shows Reconnect |
| FE-039 | Email marketing builder (segment audience, template gallery, block editor, AI-suggest subject) + funnel/list-health report | FE-020,038 | Unsubscribe link always visible in preview |
| FE-040 | Google My Business manager (profile-health checklist, posts composer+preview, photos grid, insights card, Q&A) | FE-038 | No-listing path shows guided create-listing wizard |
| FE-041 | Google Ads creator (goal/budget/forecast/ad-preview/keyword chips/radius map) + dashboard | FE-038 | Billing disclaimer strip always visible |
| FE-042 | Google Merchant Center screen (feed-status card, issues table+fix flow, settings) | FE-011,038 | Fix button opens correct product drawer |
| FE-043 | Meta Ads creator (goal/audience/budget, review-to-ad picker, FB/IG live previews) + dashboard | FE-022,038 | Selecting a review renders branded creative preview |
| FE-044 | TikTok Ads creator (goal, 9:16 preview, slideshow creative helper, audience/budget) + dashboard | FE-038 | Style dropdown changes preview treatment |
| FE-045 | Marketing overview (cross-channel spend/results table, trend chart, AI recommendation card) | FE-039-044 | All rows click through to source channel dashboard |

---

## Phase 3 — API Integration (replace stubs with live backend calls)

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| INT-001 | Auth/session wiring: real signup/login, JWT storage+refresh, route guards, RBAC-aware nav hiding | BE-007,008 / FE-004 | Expired access token silently refreshes; logged-out user redirected |
| INT-002 | Dashboard + widgets live wiring | BE-067,068 / FE-007,008 | Each widget fetches its own live endpoint, 60s visibility-aware refresh |
| INT-003 | Products/POS/Orders live wiring | BE-023-029 / FE-011-015 | Real `POST /sales` reflected instantly in orders board |
| INT-004 | Credit ledger live wiring | BE-030-032 / FE-016 | Payment recorded live updates balance and statement |
| INT-005 | Inventory/Expenses/P&L live wiring | BE-033-039 / FE-017-019 | What-if calls real `/ai/what-if` with disclaimer intact |
| INT-006 | CRM + Import pipeline live wiring | BE-040-044 / FE-020,021,012 | Real import batch preview→confirm flow completes end-to-end |
| INT-007 | Reviews/Reputation live wiring (incl. public rating page) | BE-045-050 / FE-022-025 | Public token flow tested on real deployed URL |
| INT-008 | Bookings live wiring (incl. public booking page) | BE-051-055 / FE-026,027 | Real slot-lock race test against live backend |
| INT-009 | Staff/Branches live wiring | BE-056-060 / FE-028,029 | Roll-up numbers match sum of branch data |
| INT-010 | Marketing (in-product)/Search/Analytics live wiring | BE-061-063,067-072 / FE-030-033 | Campaign send respects live quota state |
| INT-011 | AI Assistant live wiring (streaming) | BE-073-075 / FE-034 | Streamed tokens render progressively in UI |
| INT-012 | Reports/Exports live wiring | BE-076,077 / FE-035 | Large export produces real signed link via notification |
| INT-013 | Module 18 Integrations Hub live wiring (all 6 connectors) | BE-082-089 / FE-038-045 | Each connector's OAuth round-trips against provider sandbox/test app |
| INT-014 | Billing/plan/quota live wiring end-to-end | BE-064-066 / FE-010,030 | Quota-exhausted state blocks sends live, shown via quota modal |
| INT-015 | Full regression + security review + production deploy checklist | All prior | Signup→onboarding→first sale→nightly close→review-request full journey passes manually and in e2e suite; spec §6 security checklist re-verified against live deploy |

---

## Deferred (out of scope for now — mobile app)

The mobile app is **not** being built in this pass. Parked here so it isn't lost, not scheduled into any milestone above:

- Backend: push device-token registry + event triggers; `POST /sync/sales` offline batch replay (Module 16 in the spec).
- Frontend: mobile app key screens (Home/Sale/Search/Assistant/More tabs, notifications list, offline banner+sync toast).
- Integration: mobile API + offline sync wiring.

Revisit and slot these into the phases above once mobile is prioritized.

---

## Sequencing notes

- **BE-M0 and BE-M1 are hard blockers** for everything else — tenancy isolation and the send gate are cross-cutting; nothing built on top of a broken version of either is trustworthy.
- Backend milestones BE-M2 → BE-M9 can proceed in spec order but are largely independent of each other once BE-M0/M1 exist — pick whichever module matters most to launch priorities.
- BE-M12 (AI infra) is a soft dependency of several tickets (BE-038, BE-048, BE-060, BE-069, BE-073-075) — build the shared AI service once, early, if those modules are prioritized.
- Frontend milestones can start once the design-system shell (FE-M0) exists; they're built against typed stubs and don't block on backend completion, but should follow the same module order for a coherent handoff into Phase 3.
- Phase 3 tickets should be tackled in the same module order backend/frontend were built, module by module, ending with INT-015 as the final production-readiness gate.

## Verification approach

- Every BE ticket: unit tests for services/guards; tenancy-isolation and RBAC covered by Nest e2e tests at the BE-M0 level and spot-checked per module.
- Every FE ticket: manual smoke pass against the shared-state-kit (loading/empty/error/permission/quota/offline/confirm) plus a11y/responsive check.
- Every INT ticket: real end-to-end exercise of the flow (not just typecheck/build) before marking done.
- Final gate (INT-015): full user journey walkthrough + re-verification of the security/compliance checklist (spec §6) against the live deployment.