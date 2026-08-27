# Noxtill v2 — Update Roadmap & Ticket Breakdown

Companion to `docs/PROJECT_PLAN.md` (the v1 roadmap, now fully built). This document sequences the update pass driven by `docs/Noxtill_Complete_Screen_Specification & Updates.docx`, the 24-module/190-screen source of truth. Same role v1's plan played: single source of truth for build sequencing, one ticket at a time, picked up via "move to the next ticket."

**Build order: Backend → Frontend → Integration**, same as v1.

**Revision history**: this is the second full pass over this document. The first pass (tickets `UPD-BE-001`–`081`, `UPD-FE-001`–`062`, several already shipped) was built from the spec doc alone. A follow-up audit — three research passes reading every one of the 190 screens against this document, then five more passes checking the *real codebase* (not just this document) against every gap the first three found — surfaced two problems worth naming so they don't recur: (1) tickets that bundled 2–3 spec screens into one line systematically lost the smaller screens' real design (their own filters, popups, permission splits); (2) roughly half of the screens the document-only audit called "missing" already had real, working code that this document simply never credited — some under a different module folder than expected (e.g. Competitor/Keyword tracking lives in `src/marketing/`, not `src/competitive/`), some as a fully separate feature this doc never named (Marketing Overview, Referrals, Email Marketing, Product Profitability, Customer Cohort Analytics, Quotations, the Kanban Order Board, Roll-up Dashboard, Branch Comparison — all real, all previously uncredited). **Every ticket below marked `(existing, undocumented)` was verified against real files/routes before being credited — not assumed.** New tickets continue the existing ID sequence (`UPD-BE-082+`, `UPD-FE-063+`); no existing ID was renumbered, since shipped code already references some of them in comments.

---

## Context

`docs/Noxtill_Complete_Screen_Specification & Updates.docx`: 24 modules, 190 screens, every field/card/table/filter/button/API named per screen. Per its own Appendix B/C:

- **Live today (per the doc's own claim): 13 sidebar modules.** Direct codebase verification (this pass) finds the real number is **21 of 24 modules have at least a working backend**, and the frontend gap is narrower than previously documented too. Confirmed via real file/route checks, not inference: Dashboard, POS, Orders (incl. a working Kanban board and Quotations, both previously uncredited), Products, Bookings (incl. Walk-ins), Credit, Customers, Reviews (incl. a full private-feedback ticketing system with AI sentiment clustering), Marketing (incl. Overview, Referrals, and Email Marketing — three previously-uncredited modules), Profit & Analytics (incl. Product Profitability and Customer Cohort Analytics, previously uncredited), Staff, Branches (incl. Roll-up Dashboard and Branch Comparison, previously uncredited), Inventory, AI Assistant (incl. a real Help Assistant RAG endpoint, previously uncredited), Reports, Settings (the `settings/` module itself was never credited as live before this pass), Business Listings, Competitive Insights (real, just filed under `src/marketing/`), AI Phone Receptionist, AI Photo Digitizer, Delivery & Riders (backend only — see below), Integrations.
- **Genuinely absent, confirmed by direct search, not just doc silence**: Social Media Management's Drafts/Scheduled/Published-Posts sub-views, Advertising Settings, a generic Integrations "Connection Detail" screen, a Voice Call Queue, cross-directory Listings Photos & Settings, a real multi-rate Tax model, a Notification-preference matrix, Marketing Assets (poster/flyer generation), a general-purpose Voice Assistant, AI Chat History, and a handful of others enumerated per-module below.
- **The starkest single gap found**: `Rider` CRUD is fully built on the backend (`src/delivery/riders.controller.ts`) with **zero frontend consumer** — no route, no page, no API client file exists for it anywhere in `frontend/src/`.
- Every "live" module is still missing real depth screens the spec calls for — this remains the bulk of "the updates," it's just a smaller bulk than the first pass of this document estimated, because much of what looked missing was actually already shipped and uncredited.

## Strategy — continuing the established working pattern

Same pattern as v1: **Backend phase → Frontend phase → Integration phase**, tickets grouped into module-level milestones, executed one ticket at a time via "move to the next ticket," each ticket getting its own detailed addendum plan immediately before implementation.

**Sequencing = the spec's own Appendix C wave order**, unchanged from the first pass:

- **Wave 1** (primary screen of each live module) — complete, unchanged: Dashboard Overview, Fast Sale, All Orders, All Products, Calendar, Ledger, Customer List, All Reviews, Campaigns, Profit Overview, Team, Current Stock, Business Chat, All Reports, Business Profile.
- **Wave 2** — bring every live module up to full spec depth. Now includes its own **Profit & Analytics milestone** (`M10`), which the first pass never gave one — its 3 real screens (Overview, Cash Flow, Health Score) were scattered across other modules' milestones with nothing tying the module together.
- **Wave 3** — Business Listings, Social Media Management, Competitive Insights.
- **Wave 4** — AI Phone Receptionist, AI Photo Digitizer, Delivery & Riders, unified Advertising, Integrations module-24 restructure.
- **Wave 5** — the spec's named depth screens: Sentiment Analysis, Reorder Suggestions, Cash Flow, Activity Log, SEO Heatmap, Developer & API. **These stay in Wave 5, not their "home" module's milestone** — that's faithful to the spec's own Appendix C, which places them here explicitly. Every module milestone below that has a Wave-5 screen gets a one-line cross-reference instead, so the module doesn't read as unplanned.

**Ticket ID scheme**: `UPD-BE-###`, `UPD-FE-###`, `UPD-INT-###`, unchanged. IDs are permanent once assigned — a ticket found to already be shipped keeps its ID and gets tagged `(existing, undocumented)` rather than being renumbered or deleted.

**Extension tickets**: several screens already have a shipped ticket that covers only part of the spec's design (e.g. `UPD-FE-002` Live Activity is live but has no cards, no Pause/Jump-to-now, no event-detail popup). These get a new ticket numbered `UPD-FE-###e` (an "e" suffix, not a new sequence number) that extends the original rather than duplicating it — the base ticket stays the historical record of what was actually built first.

**Verification discipline going forward** (the main lesson from this pass): before ticketing anything as "new," check `backend/src/` and `schema.prisma` directly. A ticket that says "build X" for something that already exists risks a duplicate model or wasted work — this happened to roughly half of this document's original "missing" list.

---

## Phase 1 — Backend

### Wave 2 — Deepen existing live modules

#### Milestone UPD-BE-M1 — Dashboard depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-001 | Business Health Score | — | *(shipped)* `GET /health-score?range=` weighted 0–100 score + 12-week history; `PATCH /health-score/weights`. |
| UPD-BE-001e | Health Score extension | UPD-BE-001 | Add a score-change-log (date, old→new, what changed), a `range` param supporting 3/6/12-month windows (not just weeks), and an `<14 days of data` guard that returns a "building your score" status instead of a real-but-misleading low number. |
| UPD-BE-002 | Live Activity feed | — | *(shipped)* `ActivityEvent` model + `GET /activity/stream` (SSE). |
| UPD-BE-003 | AI Insights | UPD-BE-002 | *(shipped)* Daily job + `GET /ai/insights`, `POST /ai/insights/:id/action`. |
| UPD-BE-004 | Action Center | UPD-BE-002 | *(shipped)* `GET /actions`, `POST /actions/:id/complete\|snooze\|dismiss`. |
| UPD-BE-082 | Today's Business detail | — | New `GET /dashboard/today/detail`: every transaction today (time, items, staff, method, amount, status) plus sales-count/revenue/avg-ticket/customers-served/staff-on-duty/open-orders aggregates; staff see only their own rows. |
| UPD-BE-083 | Nightly Close history + preview | — | Extends the existing `NightlyCloseController` (`GET /day/:date`, `PATCH /settings/nightly-close`) with `GET /nightly-close/history` (date, sales, profit, reviews, bookings, credit recovered, delivery status) and `POST /nightly-close/preview` (renders tonight's close without sending) — the delivery-tracking half of the feature the settings screen configures. |

#### Milestone UPD-BE-M2 — POS depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-005 | Held Sales | — | *(shipped)* `HeldSale` model; `GET/POST /sales/held`, `POST /sales/held/:id/resume`. |
| UPD-BE-006 | Cash Register | — | *(shipped)* `Shift`/`CashMovement`; `POST /cash/shift/open\|close`, `POST /cash/movements`. |
| UPD-BE-007 | Shift Closing | UPD-BE-006 | *(shipped)* Variance calc; `POST /cash-reconciliation`. |
| UPD-BE-008 | Voice-entry Sale | — | *(shipped)* `POST /voice/sales/parse`, `POST /voice/sales/:id/confirm`. |
| UPD-BE-084 | Sales History query support | — | `GET /orders` gains the filter set Sales History needs beyond what Orders already exposes (payment method, amount range) plus a `GET /orders/summary?range=` for the screen's daily-revenue chart — reuses the existing `Order` table, no new model. |

#### Milestone UPD-BE-M3 — Orders depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-009 | Draft Orders | — | *(shipped)* `GET /orders?status=draft`, `POST /orders/:id/convert`. |
| UPD-BE-010 | Tables (real floor mode) | — | *(shipped)* `Table` model; move/merge/split-bill. |
| UPD-BE-011 | Returns & Refunds | — | *(shipped)* `POST /returns`, `POST /returns/:id/approve`. |
| — | Order Board (Kanban) | — | *(existing, undocumented)* Frontend-only grouping over `GET /orders` + `PATCH /orders/:id/status`, already live at `orders-view.tsx`'s Board tab. No new ticket — credited here so it isn't rebuilt. |
| — | Quotations | — | *(existing, undocumented)* `src/quotations/quotations.controller.ts` — `GET/POST /quotations`, `POST /quotations/:id/convert`, built on `Order.isQuotation`. Credited, not rebuilt. |
| UPD-BE-085 | Invoices, formalized | — | `Order` gains a derived paid/unpaid/overdue status (from existing `Payment` rows) and `GET /orders/invoices` lists them with that status — the per-order PDF generation (`POST /orders/:id/invoice`) already exists and is reused, this ticket only adds the list/status layer the spec's dedicated Invoices screen needs. |
| UPD-BE-086 | Receipts, dedicated resend | — | `GET /receipts`, `POST /receipts/:id/resend` — reprint/resend any past sale's receipt by order # or customer phone; tracks digital-vs-printed delivery. |

#### Milestone UPD-BE-M4 — Products depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-012 | Variants (formal) | — | *(shipped)* `VariantSet`/`VariantOption`; `POST /variants/:id/apply`. |
| UPD-BE-013 | Bundles | UPD-BE-012 | *(shipped)* `Bundle`/`BundleItem`; `GET /profit/bundle-suggestions`. |
| UPD-BE-014 | Suppliers | — | *(shipped)* `Supplier` model; quick-PO. |
| UPD-BE-015 | Pricing bulk tools | UPD-BE-014 | *(shipped)* `PATCH /products/bulk-price`; price-history. |
| — | Photo → Product import | — | *(existing, undocumented)* `digitizer.service.ts`'s `case 'product':` branch already routes scanned rows into real `Product` rows. Credited under both this module and AI Photo Digitizer (M21). |
| UPD-BE-087 | Services, formal fields | — | `Product` (kind=`service`) gains `eligibleStaffIds`, `bufferBeforeMin`/`bufferAfterMin`, `depositRequired`/`depositAmount` — the spec's staff-assignment/buffer/deposit fields don't exist on the product row today (staff assignment currently happens per-appointment, not configured on the service). |
| UPD-BE-088 | Categories | — | New `Category` model (name, sort order, parent for merge-target) replacing `Product.category`'s free-text field; `CRUD /categories`, `POST /categories/:id/merge`. |
| UPD-BE-089 | Products export | — | `GET /exports/products.xlsx\|csv\|pdf` — reuses the existing `ExcelJS`/PDF export pattern already used for stock/sales/customers exports; cost-price column gated to Owner. |

#### Milestone UPD-BE-M5 — Bookings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-016 | Booking Requests | — | *(shipped)* `POST /appointments/:id/approve`. |
| UPD-BE-017 | Waiting List | — | *(shipped)* `WaitlistEntry`; `POST /waitlist/:id/offer`. |
| UPD-BE-018 | Queue / Tokens | — | *(shipped)* `QueueToken`; call/serve/skip. |
| UPD-BE-019 | Deposits | — | *(shipped)* `Deposit` model; capture/refund. |
| UPD-BE-020 | No-Shows reporting | — | *(shipped)* `GET /appointments?status=no_show`. |
| — | Walk-ins | — | *(existing, undocumented)* `AppointmentsService.createWalkIn` + `CreateWalkInAppointmentDto`, phone-lookup-inline-create. Credited, not rebuilt. |
| — | Staff Schedule & Availability | — | *(existing, undocumented)* Confirmed identical to Staff module's Shifts & Schedule (`StaffShift`/`TimeOff`, `UPD-BE-031`) — one feature, two spec names. Cross-referenced here, ticketed once under M11. |
| UPD-BE-090 | Booking Link & QR analytics | — | `GET /public/:biz/booking-stats` (visits/bookings/conversion) layered on the already-real public booking flow; the QR generation itself reuses the existing `qr-poster.service.ts` pattern from Reviews. |
| UPD-BE-091 | Deposit settings | UPD-BE-019 | `PATCH /deposits/settings` — the trigger rule ("required after N no-shows," flat vs. %, which services) the spec's Deposits screen needs but the shipped capture/refund flow doesn't configure yet. |
| UPD-BE-092 | Booking reminder rules | — | New `ReminderRule` model (timing, channel, message template) replacing the hardcoded `BOOKING_REMINDER_HOUR_OFFSETS` constant in the already-real `booking-reminders.scheduler.ts`/`.processor.ts` — the job itself doesn't need to be rebuilt, just made configurable. `CRUD /reminder-rules`. |

#### Milestone UPD-BE-M6 — Credit depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-021 | Instalment plans | — | *(shipped)* `InstallmentPlan`/`Installment`; `GET /installments?due=today` already powers Due Today. |
| UPD-BE-022 | Transparent ledger links | — | *(shipped)* `POST /credit/:customerId/share-link`. |
| UPD-BE-023 | Write-off flow | — | *(shipped)* `POST /credit/:id/write-off`. |
| — | Statements (PDF) | — | *(existing, undocumented)* `GET /credit/:customer/statement` → `credit-statement.service.ts`, real Credit-styled PDF via the shared `PdfRendererService`. Credited, not rebuilt. |
| UPD-BE-093 | Outstanding view | — | `GET /credit?sort=overdue` — a thin sort/filter param on the already-real `listDebtors()`, no new model. |
| UPD-BE-094 | Overdue ageing report | — | `GET /credit/overdue` — real 30+/60+/90+-day bucket aggregation over the existing `v_credit_balances` view (the raw `daysOutstanding` per debtor already exists; this adds the bucketed rollup). |
| UPD-BE-095 | Credit reminder rules | — | New staged-rule model (days-overdue trigger, tone, channel) replacing the existing single manual `POST /credit/remind` action with real per-business configuration; `CRUD /credit/reminder-rules`. |
| UPD-BE-096 | Recovery Reports | — | `GET /credit/recovery-report` — extended/recovered/recovery-rate/written-off/net-exposure aggregate, new `reports.types.ts` `ReportKind` entry reusing the existing report-generation pipeline. |

#### Milestone UPD-BE-M7 — Customers depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-024 | Loyalty punch cards/tiers | — | *(shipped)* `LoyaltyProgram`/`LoyaltyMember`. |
| UPD-BE-025 | Membership plans | UPD-BE-024 | *(shipped)* `MembershipPlan`/`Membership`. |
| UPD-BE-026 | Business Memory notes | — | *(shipped)* `MemoryNote`; `CRUD /memory-notes`. |
| — | Customer erasure (GDPR) | — | *(existing, undocumented)* `DELETE /customers/:id` behind `CAPABILITIES.CUSTOMERS_ERASE`, typed-confirm via phone match. Credited, not rebuilt. |
| UPD-BE-097 | Customer export + merge | — | `GET /customers/:id/export` (real personal-data export) and `POST /customers/:id/merge` (duplicate resolution, keeps one canonical record's history) — neither exists today alongside the real erase capability. |
| UPD-BE-098 | Segments, real rule builder | — | New `Segment` model (stored condition list, AND/OR chaining, live matching count) replacing the current compute-on-the-fly `SegmentsService` (hardcoded vip/new/lapsed + tag fallback) with persisted, arbitrary-field rules; `CRUD /segments`. |
| UPD-BE-099 | Import Customers, photo path | UPD-BE-060 | Extends the existing CSV/XLSX/DOCX/TXT `customer-import.parser.ts` with a photo/OCR path reusing the AI Photo Digitizer pipeline, plus a real marketing-consent flag on imported rows (`Customer.consentMarketing` defaults false for imports, never true). |

#### Milestone UPD-BE-M8 — Reviews depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-027 | Video Testimonials | — | *(shipped)* `VideoTestimonial`; approve/post/delete. |
| — | Private Reviews ticketing | — | *(existing, undocumented)* `PrivateFeedback` model (status Open/Assigned/Resolved, `assignedTo`, `resolutionNote`) + `GET /reviews?status=` + `PATCH /feedback/:id`, plus real AI theme clustering via `ReviewSentimentTheme`/`GET /reviews/sentiment`. Credited, not rebuilt — only the frontend ticketing screen is new (see FE). |
| UPD-BE-100 | Review Requests status tracking | — | Adds an explicit `Sent/Opened/Rated/No response` status enum + `openedAt` timestamp to the existing `ReviewRequest` model (today the state is derived, not stored) and a conversion-by-channel aggregate. |
| UPD-BE-101 | Rating Page & QR analytics | — | `GET /reviews/qr-stats` (visits/ratings-submitted/conversion) — the QR poster generation itself is already real (`qr-poster.service.ts`); this adds the missing analytics layer. |
| UPD-BE-102 | Review Widget | — | `GET /w/:business_key` — real embeddable JS/HTML widget endpoint (layout/theme/min-rating params) for a business's own website; distinct from the internal `GET /widgets/:key` dashboard-widget registry. |
| UPD-BE-103 | Reputation Score | — | `GET /reviews/reputation-score` — a rating/volume/recency/response-rate composite distinct from Dashboard's Business Health Score; reuses the health-score service's weighting pattern. |
| UPD-BE-104 | Review Settings | — | `PATCH /reviews/settings` — public-review-URL platform picker, reminder timing, reply-template config. |

#### Milestone UPD-BE-M9 — Marketing depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-028 | Automations engine | UPD-BE-002 | *(shipped)* `Workflow`/`WorkflowRun`; `POST /workflows/:id/test`. |
| UPD-BE-029 | Coupons | — | *(shipped)* `Coupon`; validated in `POST /sales`. |
| UPD-BE-030 | Vouchers | — | *(shipped)* `Voucher`; balance-tracked redemption. |
| — | Marketing Overview | — | *(existing, undocumented)* `GET /marketing/overview` → `overview.service.ts`, real cross-channel rollup. Credited, not rebuilt. |
| — | Referrals | — | *(existing, undocumented)* `src/marketing/referrals.controller.ts` — settings/stats/redeem, reward config in `Business.referralSettings`. Credited, not rebuilt. |
| — | Email Marketing | — | *(existing, undocumented)* `src/integrations/email/email-campaigns.controller.ts` — real `EmailCampaign` model, funnel, list-health, unsubscribe. Credited, not rebuilt (currently reachable under Settings › Integrations › Email; Phase 2 gives it a proper Marketing-module screen too). |
| UPD-BE-105 | Marketing Assets | — | `GET /marketing/kit/:type.pdf` — poster/flyer/social-story generation from the business's own catalog data, reusing `PdfRendererService`; format presets (A5/A4 poster, IG story, table tent, window sticker, vehicle decal). |

#### Milestone UPD-BE-M10 — Profit & Analytics depth *(new milestone)*

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| — | Profit Overview | — | *(live, Wave 1)* `GET /profit/pnl?month=`. |
| — | Product Profitability | — | *(existing, undocumented)* `GET /profit/products` → `ProfitService.byProduct()`, real per-product margin/top-performer calc. Credited, not rebuilt. |
| — | Customer Analytics (cohorts) | — | *(existing, undocumented)* `GET /analytics/cohorts`, real monthly-signup cohort retention. Credited, not rebuilt. |
| — | Cash Flow forecasting | — | *(shipped, Wave 5)* See `UPD-BE-078`. |
| — | Business Health Score (shared) | — | *(shipped, Dashboard)* See `UPD-BE-001`/`001e`. |
| UPD-BE-106 | Time Analysis, dead-hours offer | — | Extends the existing `GET /profit/time` (real hour/day-of-week buckets + text insight) with a "dead-hours offer" generator — detects the slowest real window and drafts a targeted offer via `AiInfraService`, requiring explicit Approve before it can be sent. |
| UPD-BE-107 | Expenses, receipt + OCR | — | Extends the existing full `Expense` CRUD (`src/expenses/`) with `POST /expenses/photo` — receipt image upload reusing the AI Photo Digitizer vision pipeline, amber-flagging low-confidence extracted fields for owner confirmation before the expense is saved. |
| UPD-BE-108 | Staff Analytics, extended | — | Extends the existing `GET /analytics/staff` (currently name/sales/orders only) with avg-ticket-size, no-show count, and review-mention count per staff member — distinct from Commissions (payouts). |

#### Milestone UPD-BE-M11 — Staff depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-031 | Shifts & Schedule | — | *(shipped)* `StaffShift`/`TimeOff`; `POST /shifts/:id/swap-request`. Also serves Bookings' "Staff Schedule & Availability" screen — same feature, two spec names. |
| UPD-BE-032 | Timesheets | UPD-BE-031 | *(shipped)* Overtime calc vs. configurable threshold. |
| UPD-BE-033 | Advances | — | *(shipped)* `StaffAdvance`; auto-deducted from commission. |
| UPD-BE-034 | Payroll Export | UPD-BE-032, UPD-BE-033 | *(shipped)* `GET /payroll/export.xlsx?month=`. |
| UPD-BE-035 | Roles & Permissions matrix | — | *(shipped)* Capability-matrix + custom roles. |
| — | Attendance | — | *(existing, undocumented)* Confirmed real backend; credited. |
| — | Commissions | — | *(existing, undocumented)* Confirmed real backend; credited. |

#### Milestone UPD-BE-M12 — Branches depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-036 | Stock Transfers | — | *(shipped)* `StockTransfer`/`StockTransferItem`; approve/ship/receive. |
| — | Roll-up Dashboard | — | *(existing, undocumented)* `GET /rollup/dashboard` → `rollup.service.ts`. Credited, not rebuilt. |
| — | Branch Comparison | — | *(existing, undocumented)* `GET /rollup/compare`, `POST /ai/branch-advisor` → `branch-advisor.service.ts`. Credited, not rebuilt. |
| UPD-BE-109 | All Branches management + Branch Settings | — | `PATCH /branches/:id` (currently only create+list exist, no update/deactivate) plus per-branch override fields (working hours, tax rate, catalog overrides, payment methods) and a "copy settings from another branch" action. |

#### Milestone UPD-BE-M13 — Inventory depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-037 | Stock Count | — | *(shipped)* `StockCount`/`StockCountLine`; apply-adjustments. |
| — | Wastage | — | *(existing, undocumented)* `POST /inventory/wastage`, real `StockMovement` write. Credited; extended below to add the missing "Theft" reason. |
| UPD-BE-110 | Stock Movements, dedicated view | — | `GET /stock/movements` — cross-product movement history (type, qty, unit cost, resulting balance, source reference) with a computed running-balance column the existing per-product `GET /inventory/:product/movements` doesn't provide. |
| UPD-BE-111 | Low Stock urgency view | — | `GET /stock?status=low` dedicated endpoint (today's `listInventory()` tags status inline but has no filtered view) plus a real back-in-stock customer-notification list, distinct from the existing hourly owner-alert job. Also adds the "Theft" reason to the Wastage enum. |
| UPD-BE-112 | Purchase Orders, formal | UPD-BE-014 | New `PurchaseOrder`/`PurchaseOrderItem` model with a real pending→sent→confirmed→received(partial or full) status lifecycle, replacing the current always-immediate `POST /inventory/purchases`/quick-PO writes; WhatsApp preview of exactly what the supplier receives, reusing `SendGateService`. |

#### Milestone UPD-BE-M14 — AI Assistant depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| — | Business Chat | — | *(live, Wave 1)* `POST /assistant/chat` (SSE). |
| — | Help Assistant | — | *(existing, undocumented)* `POST /help/ask` → real RAG over `help_articles` (MySQL fulltext), answers strictly from retrieved passages. Credited, not rebuilt — frontend is new (see FE). |
| UPD-BE-113 | Voice Assistant, general-purpose | — | `POST /voice/command` — hands-free operation covering any write action (not just POS sales, which stays on its own narrower `voice/sales/*` endpoints), always requiring explicit confirmation before committing a write. |
| UPD-BE-114 | Chat History | — | New conversation-persistence model + `GET /assistant/conversations`, `DELETE /assistant/conversations/:id` — today `assistant.controller.ts` has no history capability at all. |
| UPD-BE-115 | AI Settings | — | `PATCH /ai/settings` — per-feature on/off toggle (Voice entry, Photo digitizer, Review replies, Campaign copy, Insights, What-if, Assistant), each showing its real usage figure from the existing `AiCallLog`; surfaces the AI-usage-disclosure text (EU AI Act transparency requirement) the spec flags as regulatory, not optional. |

#### Milestone UPD-BE-M15 — Reports depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| — | All Reports | — | *(live, Wave 1)* |
| — | Data Export | — | *(existing, undocumented)* `POST /exports/full` real background job + signed link. Credited; frontend gets its own screen (see FE). |
| UPD-BE-116 | Scheduled Reports | — | New `CRUD /reports/schedules` — recurring delivery (frequency, recipients, channel, format) via a new BullMQ cron job, reusing the existing report-generation pipeline. |
| UPD-BE-117 | Tax Reports | — | `GET /reports/tax?period=` — taxable sales / tax collected / tax on purchases / net tax due, new `tax` entry in `ReportKind`. Depends on `UPD-BE-121` (real tax-rate model) for full accuracy; can ship against the current flat `Business.taxRate` first and upgrade automatically once that lands. |

#### Milestone UPD-BE-M16 — Settings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-038 | Terminology Engine | — | *(shipped)* `LabelOverride`; `GET/PATCH /labels`. |
| UPD-BE-039 | Custom Options manager | — | *(shipped)* `GET /options`, rename/reorder/hide. |
| UPD-BE-040 | Security / 2FA | — | *(shipped)* `POST /auth/2fa/enable`; session list. |
| — | Business Profile | — | *(live, Wave 1)* |
| — | Billing status | — | *(existing, undocumented)* `GET /billing/status`, `POST /billing/checkout`, real Stripe sync (`stripe-sync.service.ts`, webhook handling, quota/trial jobs). Credited; extended below. |
| UPD-BE-118 | Messages & Channels, configurable | — | Replaces the hardcoded `FALLBACK_ORDER` in `channel-resolution.util.ts` with a real per-business channel-priority config, plus template approval-status tracking and per-channel quota surfacing (today only a flat total `msgQuota`/`msgUsed` exists). |
| UPD-BE-119 | Nightly Close Settings, full | UPD-BE-083 | Extends `UpdateNightlyCloseDto` (currently just `time`+`channel`) with section reorder, voice-note toggle + voice selection, and custom line items. |
| UPD-BE-120 | Taxes & Currency, multi-rate | — | New `TaxRule` model (category, rate, label, tax-inclusive toggle) replacing the current flat `Business.taxRate` field; `CRUD /tax-rules`. |
| UPD-BE-121 | Billing & Plan, extended | — | Adds invoice-history, add-ons, plan-comparison/change, and a real cancellation-with-data-export-offer flow on top of the existing Stripe integration — none of these four exist in `billing.controller.ts` today. |
| UPD-BE-122 | Notifications, preference matrix | — | New `NotificationPreference` model (event × channel grid) + `PATCH /notification-preferences` — today `notifications.controller.ts` only supports listing and marking read, no preference control at all. |
| UPD-BE-123 | Data & Privacy, DSR queue | — | New data-subject-request queue (`CRUD /gdpr/requests`) with the spec's 25-of-30-day legal-limit urgency flag, layered on top of the already-real per-customer erasure (`DELETE /customers/:id`) and the real 90-day voice-recording retention job — both of those stay as-is, this adds the request-tracking layer neither currently has. |

### Wave 3 — Marketing & visibility

#### Milestone UPD-BE-M17 — Business Listings

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-041 | Master Business Record + directory connector base | — | *(shipped)* `GET/PATCH /listings/master`, `POST /listings/sync`. |
| UPD-BE-042 | Google Business Profile deep management | UPD-BE-041 | *(shipped)* Posts/photos/Q&A CRUD, insights job. |
| UPD-BE-043 | Additional directory connectors | UPD-BE-041 | *(shipped)* Bing Places, Apple Business Connect, Yelp. |
| UPD-BE-044 | Sync log, Listing Health, Citation Audit | UPD-BE-043 | *(shipped)* `GET /listings/sync-log\|health`, `GET /seo/citations`. |
| UPD-BE-124 | Photos & Media, cross-directory | — | New `CRUD /listings/photos` with category tagging (Exterior/Interior/Team/Products/Logo) and multi-directory push — today photo handling only exists inside the Google-Business-Profile-specific `GmbManagementService`. |
| UPD-BE-125 | Listings Settings | — | `PATCH /listings/settings` — auto-sync toggle/frequency, per-field-per-directory mapping, master-wins-vs-directory-wins conflict resolution. |

#### Milestone UPD-BE-M18 — Social Media Management

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-045 | Connected Accounts (15 platforms) | — | *(shipped)* `GET /social/accounts`. |
| UPD-BE-046 | Content Calendar + Create Post | UPD-BE-045 | *(shipped)* `SocialPost` model; `CRUD /content-calendar`. Also already supports `?status=draft` filtering — Drafts screen reuses this directly. |
| UPD-BE-047 | Media Library | — | *(shipped)* `MediaAsset`; AI image generation. |
| UPD-BE-048 | AI Content Studio | UPD-BE-047 | *(shipped)* `POST /ai/content/generate`. |
| UPD-BE-049 | Social Inbox | UPD-BE-045 | *(shipped)* `GET /social/inbox`, reply. |
| UPD-BE-050 | Social Analytics | UPD-BE-046 | *(shipped)* `GET /social/analytics`, per-platform-per-day. |
| UPD-BE-051 | Social Settings | UPD-BE-046 | *(shipped)* `PATCH /social/settings`. |
| UPD-BE-126 | Scheduled Posts queue | UPD-BE-046 | Adds a dedicated queue-listing endpoint with retry (today publish-now and cancel exist but there's no retry action and no per-job backoff config on the BullMQ publish job). |
| UPD-BE-127 | Published Posts, per-post analytics | UPD-BE-050 | Extends `SocialAnalyticsSnapshot` (currently per-platform-per-day only) with per-post performance, plus a "Boost as ad" handoff into the Advertising module's campaign-creation flow. |

#### Milestone UPD-BE-M19 — Competitive Insights depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-052 | Visibility Score | — | *(shipped)* `GET /visibility-score`. |
| UPD-BE-053 | Competitor Ads | — | *(shipped)* `GET /competitors/:id/ads`. |
| UPD-BE-054 | Opportunities + AI Recommendations | UPD-BE-052 | *(shipped)* `GET /competitive/opportunities\|recommendations`. |
| UPD-BE-055 | Competitive Settings | — | *(shipped)* `PATCH /competitive/settings`. |
| — | Competitor Tracking | — | *(existing, undocumented — different module than expected)* Full `Competitor`/`CompetitorSnapshot` CRUD lives in `src/marketing/competitors.controller.ts`, not `src/competitive/`, with a real Google Places lookup. Credited, not rebuilt; the add-competitor flow is currently free-text, not search-and-select (extended below). |
| — | Keyword Rankings | — | *(existing, undocumented — same location)* `src/marketing/keywords.controller.ts`, real `TrackedKeyword`/`KeywordRankSnapshot` with rank history. Credited, not rebuilt; extended below. |
| UPD-BE-128 | Competitor add-flow + keyword AI suggestions | — | Upgrades the existing free-text competitor add to a real Google-place-search-and-select step; adds AI keyword suggestions and bulk import to the existing single-keyword-at-a-time `keywords.controller.ts`. |

### Wave 4 — AI & operations

#### Milestone UPD-BE-M20 — AI Phone Receptionist

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-056 | Telephony provider integration | — | *(shipped)* `POST /voice/provision-number`. |
| UPD-BE-057 | Real-time call handling | UPD-BE-056 | *(shipped)* STT → Claude intent → TTS loop. |
| UPD-BE-058 | Call outcomes | UPD-BE-057 | *(shipped)* Booking-via-call, message-taking, transfer. |
| UPD-BE-059 | Missed calls, transcripts, analytics | UPD-BE-057 | *(shipped)* `GET /voice/calls\|missed-calls\|analytics`. |
| UPD-BE-129 | Call Queue | — | New `GET /voice/queue` + queue-management (offer callback, clear queue, configurable queue-hold message) — today `voice.controller.ts` has live-call handling but no queue concept at all. |

#### Milestone UPD-BE-M21 — AI Photo Digitizer

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-060 | Generalized scan pipeline | — | *(shipped)* `POST /digitizer/upload`, incl. real Products destination. |
| UPD-BE-061 | Review & Correct | UPD-BE-060 | *(shipped)* `PATCH /digitizer/rows/:id`. |
| UPD-BE-062 | Map & Import | UPD-BE-061 | *(shipped)* `POST /imports/:id/commit`. |
| UPD-BE-063 | Scan History + learned aliases | UPD-BE-060 | *(shipped)* `GET /digitizer/history`. |

*(Fully covered — no new tickets. Best-covered module in this pass alongside Staff.)*

#### Milestone UPD-BE-M22 — Delivery & Riders

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-064 | Riders | — | *(shipped, backend only)* Full `Rider` CRUD in `riders.controller.ts` — **confirmed zero frontend consumer exists anywhere**; see `UPD-FE-###` below, this is the priority gap of the whole audit. |
| UPD-BE-065 | Delivery assignment + live tracking | UPD-BE-064 | *(shipped)* `GET /deliveries/live` (SSE) — confirmed distinct from the also-real plain `GET /deliveries` history list. |
| UPD-BE-066 | Routes | UPD-BE-065 | *(shipped)* `POST /routes/:id/optimise`. |
| UPD-BE-067 | Proof of Delivery | UPD-BE-065 | *(shipped)* `GET /deliveries/:id/proof`. |
| UPD-BE-068 | Delivery zones & settings | — | *(shipped)* `CRUD /delivery-zones`. |

#### Milestone UPD-BE-M23 — Advertising, unified

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-069 | Unified Ad Accounts + Create Campaign | — | *(shipped)* `GET /ads/accounts`, `POST /ads/:provider/campaigns`. |
| UPD-BE-070 | Ad Creatives + Audiences | UPD-BE-069 | *(shipped)* `CRUD /ads/creatives\|audiences`. |
| UPD-BE-071 | Budget & Spend, Performance, Lead Inbox | UPD-BE-069 | *(shipped)* `GET /ads/budget\|performance\|leads`. |
| UPD-BE-130 | Campaign management actions | UPD-BE-069 | `PATCH /ads/campaigns/:id` — pause/resume/budget-adjust on the already-real `GET /ads/campaigns` list, which today only supports read + create. |
| UPD-BE-131 | Advertising Settings | — | `PATCH /ads/settings` — default budget caps, cost-per-result auto-pause rules, approval requirement. |

#### Milestone UPD-BE-M24 — Integrations, module 24 restructure

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-072 | Accounting Sync | — | *(shipped)* `POST /integrations/accounting/sync`. |
| UPD-BE-073 | E-commerce Sync | — | *(shipped)* `POST /integrations/ecommerce/sync`. |
| UPD-BE-074 | Automation Platforms | — | *(shipped)* `GET /integrations/automation/triggers`. |
| UPD-BE-075 | Integration Directory | UPD-BE-041, 045, 069, 072–074 | *(shipped)* Unified `GET /integrations`. |
| UPD-BE-132 | Connection Detail, generic | — | New `GET /integrations/:provider` + `POST /integrations/:provider/sync` — connected-since/last-sync/token-expiry/sync-log/field-mapping, generic across every connector (today each connector category has its own sync endpoint but no shared per-connection detail view). |
| — | API & Webhooks | — | *(shipped, Wave 5)* Same underlying feature as Settings' "Developer & API," see `UPD-BE-081` in Wave 5. |

### Wave 5 — Depth & analytics screens

#### Milestone UPD-BE-M25 — Depth & analytics screens

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-076 | Sentiment Analysis | — | *(shipped)* `GET /reviews/sentiment`. Home module: Reviews (M8). |
| UPD-BE-077 | Reorder Suggestions | — | *(shipped)* `GET /stock/reorder-suggestions`. Home module: Inventory (M13). |
| UPD-BE-078 | Cash Flow forecasting | — | *(shipped)* `RecurringObligation`; `GET /cash-forecast?days=`. Home module: Profit & Analytics (M10). |
| UPD-BE-079 | Activity Log endpoint | — | *(shipped)* `GET /audit-log`. Home module: Staff (M11). |
| UPD-BE-080 | SEO Heatmap | — | *(shipped)* `GET /seo/heatmap?keyword=`. Home module: Competitive Insights (M19). |
| UPD-BE-081 | Developer & API | UPD-BE-074 | *(shipped)* `CRUD /api-keys\|outbound-webhooks`. Home module: Settings (M16). |

---

## Phase 2 — Frontend

Same module grouping and milestone numbers as Phase 1. Every named spec screen gets its own row — no bundled multi-screen tickets. `(existing)` marks a screen with real, previously-shipped UI; `(extends X)` marks a ticket adding to an existing screen rather than building a new one.

#### Milestone UPD-FE-M1 — Dashboard depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-001 | Business Health Score screen | UPD-BE-001 | *(shipped)* Gauge + 12-week trend + component breakdown; weight-adjustment popup. |
| UPD-FE-001e | Health Score, full spec parity | UPD-BE-001e | *(extends 001)* Score-change-log table; period filter (3/6/12 months, not just weeks); `<14 days` "building your score" empty state; Export button; tighten to Owner-only (currently any non-staff role sees the weight-adjust control). |
| UPD-FE-002 | Live Activity feed | UPD-BE-002 | *(shipped)* SSE event list with type/staff filters. |
| UPD-FE-002e | Live Activity, full spec parity | UPD-BE-002 | *(extends 002)* Cards (events-in-last-hour / active staff / open tables); Pause-stream and Jump-to-now controls; event-detail popup; gate to Owner/Manager. |
| UPD-FE-003 | AI Insights feed | UPD-BE-003 | *(shipped)* Insight cards, action/dismiss. |
| UPD-FE-003e | AI Insights, full spec parity | UPD-BE-003 | *(extends 003)* Cards (insights-this-week / actions-taken / estimated-impact); insight-detail popup showing the full calculation. |
| UPD-FE-004 | Action Center | UPD-BE-004 | *(shipped)* Priority-chip queue, snooze/dismiss/complete. |
| UPD-FE-004e | Action Center, full spec parity | UPD-BE-004 | *(extends 004)* Card-style urgent/today/this-week/completed counts; Mark-all-read; bulk-action-confirm popup. |
| UPD-FE-063 | Today's Business screen | UPD-BE-082 | Live clock + auto-refresh; 6 operational cards; hourly-revenue running total + payment-method donut; full transaction table filterable by staff/payment method/order type/branch; staff see own rows only. |
| UPD-FE-064 | Nightly Close screen | UPD-BE-083, 119 | "Sends at 10 PM" status chip; last-sent/delivery-status/open-rate/channel cards; 30-day trend chart; history table; section-reorder + channel + voice-note popups; Preview-tonight's-close, Send-test-now. |
| — | Customize Dashboard | — | *(live, v1)* Widget-gallery drag/drop layout editor, unchanged by this pass. |

#### Milestone UPD-FE-M2 — POS depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-005 | Held Sales | UPD-BE-005 | *(shipped)* List with resume. |
| UPD-FE-005e | Held Sales, full spec parity | UPD-BE-005 | *(extends 005)* Staff/Date filters; "discard" and "discard all older than today" with confirm popup. |
| UPD-FE-006v (was part of 005) | Cash Register | UPD-BE-006 | *(shipped)* Open/close + movement log. |
| UPD-FE-006e | Cash Register, full spec parity | UPD-BE-006 | *(extends prior)* Cash-movement timeline chart; Date/Staff/type filters; staff can record but never see variance (Owner/Manager only). |
| UPD-FE-007v (was part of 005) | Shift Closing | UPD-BE-007 | *(shipped)* Reconciliation with variance. |
| UPD-FE-007e | Shift Closing, full spec parity | UPD-BE-007 | *(extends prior)* Denomination-counter table; Print-shift-report; Owner-only variance visibility (staff submit counts blind). |
| UPD-FE-008 (was 006) | Voice-entry Sale | UPD-BE-008 | *(shipped)* Hold-to-speak, editable lines before confirm. |
| UPD-FE-065 | Sales History screen | UPD-BE-084 | Full searchable completed-sales log (sale #, items, staff, method, discount, total, profit, status); Date/Staff/Payment/Order-type/Branch/Amount filters; daily-revenue chart; sale-detail drawer with cost snapshot + audit trail; refund/reprint/resend; staff see own sales only. |

#### Milestone UPD-FE-M3 — Orders depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-009 (was 007) | Draft Orders | UPD-BE-009 | *(shipped)* List with convert/delete. |
| UPD-FE-010 (was 008) | Tables (real floor mode) | UPD-BE-010 | *(shipped)* Floor grid, move/merge, split-bill. |
| UPD-FE-011 (was 009) | Returns & Refunds | UPD-BE-011 | *(shipped)* Builder + approval. |
| — | Order Board (Kanban) | — | *(existing, undocumented)* `order-kanban-board.tsx` (dnd-kit), live in `orders-view.tsx`. Credited, not rebuilt. |
| — | Quotations screen | — | *(existing, undocumented)* Live tab in `orders-view.tsx`. Credited; verify against spec's validity-date/terms/send-popup/conversion-chart fields as a light follow-up when this module comes up for QA, not a new build ticket. |
| UPD-FE-066 | Invoices screen | UPD-BE-085 | Paid/unpaid/overdue cards; paid-vs-unpaid trend; invoice table with record-payment popup; bulk-send-reminders; PDF download/WhatsApp send (reuses the existing per-order invoice generator). |
| UPD-FE-067 | Receipts screen | UPD-BE-086 | Reprint/resend by order # or phone; sent-digitally-vs-printed % card; bulk resend. |

#### Milestone UPD-FE-M4 — Products depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-012 (was 010) | Variants + Bundles | UPD-BE-012, 013 | *(shipped)* Variant-set builder; bundle builder with margin preview + AI suggestions. |
| UPD-FE-013 (was 011) | Suppliers + Pricing bulk tools | UPD-BE-014, 015 | *(shipped)* Supplier CRUD + quick-PO; bulk price tool. |
| UPD-FE-013e | Pricing, full spec parity | UPD-BE-015 | *(extends 013)* Margin-distribution histogram; price-history popup per product; separate what-if-estimate popup with mandatory disclaimer; "Generate price poster"; tighten to Owner-only (Suppliers half stays Owner+Manager). |
| UPD-FE-068 | Services screen | UPD-BE-087 | Duration, eligible-staff multi-select, buffer-before/after, deposit-required toggle+amount; bookings-per-service chart. |
| UPD-FE-069 | Categories screen | UPD-BE-088 | Revenue-by-category donut; drag-reorder; merge-categories with affected-product-count warning. |
| UPD-FE-070 | Products Import screen | UPD-BE-060 (photo path), existing CSV import | Column-mapping table (file column → field, custom mapping); per-row confidence preview reusing the Photo Digitizer's Review & Correct pattern; error-file download. |
| UPD-FE-071 | Products Export screen | UPD-BE-089 | Format cards (Excel/CSV/PDF price list); column selector; cost-price gated to Owner; "Schedule recurring export." |

#### Milestone UPD-FE-M5 — Bookings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-014 (was 012) | Booking Requests | UPD-BE-016 | *(shipped)* Approval queue. |
| UPD-FE-015e (was part of 012) | Waiting List, full spec parity | UPD-BE-017 | *(extends prior)* Hold-duration dropdown (10min/30min/1hr+custom); "Clear expired" bulk action. |
| UPD-FE-016 (was 013) | Queue / Tokens | UPD-BE-018 | *(shipped)* Now-serving display, call/skip/serve. |
| UPD-FE-017 (was 014, Deposits half) | Deposits | UPD-BE-019 | *(shipped)* Capture/refund. |
| UPD-FE-017e | Deposits, settings | UPD-BE-091 | *(extends 017)* Deposit-settings popup — trigger rule, flat vs. %, per-service. |
| UPD-FE-018 (was 014, No-Shows half) | No-Shows | UPD-BE-020 | *(shipped)* Trend + repeat-offender flagging. |
| — | Walk-ins screen | — | *(existing, undocumented)* `walk-in-dialog.tsx`. Credited, not rebuilt. |
| — | Staff Schedule & Availability (Bookings-context view) | UPD-BE-031 | Cross-references the Staff module's real Shifts & Schedule screen (`UPD-FE-###` under M11) — no separate ticket, just a nav link from Bookings into it. |
| UPD-FE-072 | Appointments List screen | — (BE already supports `GET /appointments` filters) | Table view of appointments distinct from the Calendar grid — source column (Link/QR/Walk-in), no-show-rate card, bookings-per-day + no-show-trend charts, bulk remind/cancel. |
| UPD-FE-073 | Booking Link & QR screen | UPD-BE-090 | Visits/bookings/conversion cards + trend; customise popup (welcome text, visible services, brand colours, deposit requirement); QR size picker. |
| UPD-FE-074 | Reminders (booking) screen | UPD-BE-092 | Rule editor (timing dropdown+custom, channel, message with variable chips); before/after no-show-rate chart; test send. |

#### Milestone UPD-FE-M6 — Credit depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-019 (was 015) | Customer Ledger Detail (instalments + links) | UPD-BE-021, 022 | *(shipped)* Plan builder; transparent-link popup. |
| UPD-FE-019e | Customer Ledger Detail, full spec parity | — | *(extends 019)* Risk-signal chip; balance-over-time chart; "Send statement" button wired to the real statement generator. |
| UPD-FE-020 (was 016) | Write-off flow | UPD-BE-023 | *(shipped)* Typed-confirmation, owner-only. |
| UPD-FE-075 | Outstanding screen | UPD-BE-093 | Urgency-sorted debtor view; Priority chip; bulk-remind-selected, bulk-statement. |
| UPD-FE-076 | Due Today screen | UPD-BE-021 (already real) | Due-today/due-this-week/overdue/collected-today cards; remind-all-due; reschedule-instalment popup with reason. |
| UPD-FE-077 | Overdue screen | UPD-BE-094 | 30+/60+/90+/at-risk cards; ageing-waterfall chart; escalation-tone picker; "Call" action; write-off entry point (reuses `UPD-FE-020`). |
| UPD-FE-078 | Statements screen | — (BE already real) | Per-customer PDF ledger view; bulk generate; send on WhatsApp; ruled-ledger preview popup. |
| UPD-FE-079 | Reminders & Recovery screen | UPD-BE-095 | Staged-rule editor (days-overdue trigger, tone, channel); recovery-rate-by-stage chart; exact-wording preview popup. |
| UPD-FE-080 | Recovery Reports screen | UPD-BE-096 | Extended/recovered/recovery-rate/written-off/net-exposure cards; two trend charts; "Send to accountant"; Owner-only. |

#### Milestone UPD-FE-M7 — Customers depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-021 (was 017) | Loyalty & Memberships | UPD-BE-024, 025 | *(shipped)* Tabs + enrol flow. |
| UPD-FE-022 (was 018) | Business Memory notes | UPD-BE-026 | *(shipped)* Subject picker, pin, category filter. |
| UPD-FE-081 | Customer Profile, new capabilities | UPD-BE-097 | *(extends existing profile page)* "Erase customer" (typed confirm — reuses the real erase endpoint), "Export their data," merge-duplicate popup. |
| UPD-FE-082 | Segments screen | UPD-BE-098 | Rule builder (field/condition/value, AND/OR chaining, live matching count); AI-persona-suggestion popup with rename; "Message segment," duplicate, export members. |
| UPD-FE-083 | Import Customers screen | UPD-BE-099 | Column-mapping + preview + invalid-number fix list; explicit not-marketing-consented disclaimer; opening-balance confirmation for Credit imports. |

#### Milestone UPD-FE-M8 — Reviews depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-023 (was 019) | Video Testimonials | UPD-BE-027 | *(shipped)* Request flow, approve/post/delete gallery. |
| UPD-FE-084 | Private Reviews screen | — (BE already real) | Three-pane ticketing view over the real `PrivateFeedback` data — status chip (Open/Assigned/Resolved), AI-clustered complaint-themes chart (reuses `ReviewSentimentTheme`), ticket drawer with private WhatsApp reply + required resolution note. |
| UPD-FE-085 | Review Requests screen | UPD-BE-100 | Source/status table; conversion-by-channel chart; bulk send with quota-check preview; timing settings. |
| UPD-FE-086 | Rating Page & QR screen | UPD-BE-101 | Visits/ratings/conversion/scans cards; branding editor; public-URL setting with no-listing explainer; QR size picker. |
| UPD-FE-087 | Review Widget screen | UPD-BE-102 | Layout/theme/min-rating controls; live preview; per-platform embed-code instructions (WordPress/Wix/Shopify/HTML). |
| UPD-FE-088 | Reputation Score screen | UPD-BE-103 | Overall + 4 component cards; score-trend + contribution charts; improvement-actions table with deep links; methodology popup. |
| UPD-FE-089 | Competitor Ratings (Reviews-module surface) | — (reuses real `Competitor` data) | Your-rating/category-avg/rank/gap cards; 12-week comparison charts; surfaces the same real competitor data the Competitive Insights module uses, in Reviews' own context. |
| UPD-FE-090 | Review Settings screen | UPD-BE-104 | Public-review-URL picker with no-online-identity explainer; delay/reminder settings; per-language template editor. |

#### Milestone UPD-FE-M9 — Marketing depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-024 (was 020) | Automations builder | UPD-BE-028 | *(shipped)* Trigger→condition→action builder, test-preview. |
| UPD-FE-025 (was 021) | Coupons & Vouchers | UPD-BE-029, 030 | *(shipped)* Both builders + POS redemption. |
| UPD-FE-091 | Marketing Overview screen | — (BE already real) | Cross-channel cards (campaigns sent/delivered/redemptions/revenue/ad spend/blended CPR); channel ROI table; AI-reallocation popup. |
| UPD-FE-092 | Referrals screen | — (BE already real) | On/off toggle; codes/shares/redemptions/revenue/conversion cards; referrer table; reward-config popup; share-message preview. |
| UPD-FE-093 | Email Marketing screen (Marketing-module nav) | — (BE already real) | Block editor (heading/text/product/button/image); AI subject-line suggest; desktop/mobile preview; test send; list-health card; automatic, non-removable unsubscribe link. Currently only reachable under Settings › Integrations › Email — this adds the Marketing-module entry point the spec expects, same backend. |
| UPD-FE-094 | Marketing Assets screen | UPD-BE-105 | Format dropdown (posters/story/table tent/sticker/decal+custom); template picker + own-background upload; content checklist; WhatsApp share. |

#### Milestone UPD-FE-M10 — Profit & Analytics depth *(new milestone)*

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-095 | Product Profitability screen | — (BE already real) | Most/least-profitable + avg-margin + loss-making cards; margin-distribution + profit-contribution treemap; product table with margin chip (red under 10%, star top 3); price-adjustment-with-what-if popup; Owner-only. |
| UPD-FE-096 | Time Analysis screen | UPD-BE-106 | Peak-hour/day/slowest-window cards; sales-by-hour + weekday-heat-strip + month-over-month charts; dead-hours-offer suggestion popup (Approve/Edit/Dismiss). |
| UPD-FE-097 | Expenses, full spec parity | UPD-BE-107 | *(extends the existing `expenses/page.tsx`)* Receipt-attached flag on the table; add-expense popup gets receipt upload + repeat-monthly toggle; OCR result view with amber low-confidence fields for confirmation; vs-last-month card. |
| UPD-FE-098 | Customer Analytics screen | — (BE already real) | New/returning/retention/LTV/churn cards; cohort retention grid + new-vs-returning + LTV-distribution charts; cohort table with drill-down to actual customers; "message at-risk customers." |
| UPD-FE-099 | Staff Analytics screen | UPD-BE-108 | Top-performer/total/average/commission-owed cards; sales-per-staff + trend + service-mix charts; staff table (sales, avg ticket, appointments, no-shows, review mentions, commission); staff-detail popup. |

#### Milestone UPD-FE-M11 — Staff depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-026 (was 022) | Shifts & Schedule + Timesheets | UPD-BE-031, 032 | *(shipped)* Roster grid; overtime flags. |
| UPD-FE-026e | Shifts & Schedule, full spec parity | UPD-BE-031 | *(extends 026)* Swap-request-approval popup; publish-confirmation popup naming who gets notified. |
| UPD-FE-027e | Timesheets, full spec parity | UPD-BE-032 | *(extends 026)* Break-rules config popup. |
| UPD-FE-028 (was 023) | Advances + Payroll Export | UPD-BE-033, 034 | *(shipped)* Advance list; payroll export with missing-wage-rate warning. |
| UPD-FE-029 (was 024) | Roles & Permissions matrix UI | UPD-BE-035 | *(shipped)* Capability × role matrix, custom-role builder. |

#### Milestone UPD-FE-M12 — Branches depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-030 (was 025) | Stock Transfers | UPD-BE-036 | *(shipped)* Transfer builder, approve/ship/receive. |
| — | Roll-up Dashboard | — | *(existing, undocumented)* `rollup-comparison.tsx`. Credited, not rebuilt. |
| — | Branch Comparison | — | *(existing, undocumented)* `branch-advisor-card.tsx` + `rollup-comparison.tsx`. Credited, not rebuilt. |
| UPD-FE-100 | All Branches management screen | UPD-BE-109 | Total-branches/revenue/best-performer/needs-attention cards; revenue-by-branch + comparison charts; branch table; branch-setup popup (catalog inheritance, own-pricing); deactivate confirm — today the frontend only renders the dropdown selector + rollup/advisor views, no management form exists. |
| UPD-FE-101 | Branch Settings screen | UPD-BE-109 | Per-branch override rows (hours/timezone/tax/catalog/staff/payment methods/branding); catalog-override picker; working-hours editor; "copy from another branch." |

#### Milestone UPD-FE-M13 — Inventory depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-031 (was 026) | Stock Count | UPD-BE-037 | *(shipped)* Count-entry, variance, apply-adjustments. |
| UPD-FE-102 | Stock Movements screen | UPD-BE-110 | Movement/purchase/sale/wastage/adjustment/net-change cards; type + daily-volume charts; table with resulting-balance column; movement-detail popup linking source order/PO. |
| UPD-FE-103 | Low Stock screen | UPD-BE-111 | Below-threshold/out-of-stock/lost-sales/reorder-value cards; PO-builder popup prefilled with suggested quantities; threshold bulk-edit; back-in-stock notify confirm with waiting-customer count. |
| UPD-FE-104 | Purchases screen | UPD-BE-112 | Purchases-this-month/spend/lead-time/pending cards; spend-by-supplier + trend charts; PO table with real status lifecycle; purchase-builder popup; WhatsApp PO preview; receive-confirmation (full/partial). |
| UPD-FE-105 | Wastage screen | UPD-BE-111 (Theft reason) | Wastage-this-month/value-lost/%/top-wasted cards; by-reason + trend + by-product charts; wastage-form popup with optional photo. |

#### Milestone UPD-FE-M14 — AI Assistant depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-106 | Help Assistant screen | — (BE already real) | Suggested-articles table; topic filter; article-viewer popup with deep links to the relevant screen; popular-questions empty state — wires the existing `POST /help/ask` RAG endpoint to a real UI (currently backend-only). |
| UPD-FE-107 | Voice Assistant screen | UPD-BE-113 | Full-screen hands-free UI; live waveform + transcript + parsed-intent cards; hold-to-speak/confirm/cancel/switch-to-typing; confirmation popup before any write commits; one-question-only clarification popup. |
| UPD-FE-108 | Chat History screen | UPD-BE-114 | Conversations/questions/most-asked-topic cards; table with Open/Delete; delete-confirm popup. |
| UPD-FE-109 | AI Settings screen | UPD-BE-115 | Per-feature on/off toggles with usage figures; queries-this-month/cost/rate-limit cards; AI-usage-disclosure popup (EU AI Act); rate-limit-config popup; Owner-only. |

#### Milestone UPD-FE-M15 — Reports depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-110 | Scheduled Reports screen | UPD-BE-116 | Active-schedules/sent-this-month/next-delivery cards; schedule table; schedule-builder popup (frequency+custom, day/time, recipients, format). |
| UPD-FE-111 | Tax Reports screen | UPD-BE-117 | Taxable-sales/tax-collected/tax-on-purchases/net-due/next-filing cards; trend chart; period table; filing-deadline popup; rate-breakdown popup. |
| UPD-FE-112 | Data Export screen | — (BE already real) | Last-export/size/records cards; per-category inclusion table; export-confirm popup with size estimate; background-job notice; 24-hour signed-link messaging — wires the existing `POST /exports/full` to its own dedicated UI, distinct from the shared All Reports screen. |

#### Milestone UPD-FE-M16 — Settings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-032 (was 027) | Labels & Terminology screen | UPD-BE-038 | *(shipped)* Live-preview pane. |
| UPD-FE-033 (was 028) | Custom Options manager | UPD-BE-039 | *(shipped)* Grouped list manager. |
| UPD-FE-034 (was 029) | Security / 2FA screen | UPD-BE-040 | *(shipped)* 2FA enrollment, session list. |
| UPD-FE-113 | Messages & Channels screen | UPD-BE-118 | Replaces the current disconnected mock preview (`messages-section.tsx`) with a real screen: drag-reorderable channel priority, template list with approval status, per-channel quota, WhatsApp Embedded Signup popup, rejection-reason-with-resubmit popup. |
| UPD-FE-114 | Nightly Close Settings screen | UPD-BE-119 | Send-time/channel/voice/last-delivered cards; drag-reorderable section list; time picker; voice-selector with sample playback; custom-line editor; preview + send-test. |
| UPD-FE-115 | Taxes & Currency screen | UPD-BE-120 | Replaces the current disconnected mock (`tax-section.tsx`) with real data: currency/tax-label/rate/inclusive-toggle cards; tax-rules table; rule-editor popup; currency-change-warning popup. |
| UPD-FE-116 | Billing & Plan screen | UPD-BE-121 | Current-plan/cost/next-billing/usage cards; usage-vs-limits chart; invoice-history table; add-ons list; plan-comparison popup; cancellation flow with data-export offer. |
| UPD-FE-117 | Notifications screen | UPD-BE-122 | Event × channel matrix with checkboxes; quiet-hours popup; per-staff override popup; test-notification button. |
| UPD-FE-118 | Data & Privacy screen | UPD-BE-123 | Replaces the current mock erasure log with real data: compliance checklist with Fix links; retention-rules table; DSR queue (Export/Erasure, status, 25/30-day urgency flag); erasure-confirm popup explaining anonymisation vs. retained financial aggregate; privacy-policy editor. |

#### Milestone UPD-FE-M17 — Business Listings

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-035 (was 030) | Listings overview + Master Record | UPD-BE-041 | *(shipped)* Directory tiles; master-record editor with N-directories warning. |
| UPD-FE-036 (was 031) | Google Business Profile deep screen | UPD-BE-042 | *(shipped)* Post composer, AI Q&A, photos, insights. |
| UPD-FE-037 (was 032) | Directory Sync + Listing Health + Citation Audit | UPD-BE-043, 044 | *(shipped)* Sync log; health breakdown; citation table. |
| UPD-FE-119 | Photos & Media screen | UPD-BE-124 | Cross-directory photo grid by category; per-directory publish status + views; push-to-selected popup; per-directory guideline popup; generate-from-products. |
| UPD-FE-120 | Listings Settings screen | UPD-BE-125 | Auto-sync toggle/frequency; per-field-per-directory mapping table; conflict-resolution picker; failure notifications; custom-directory form. |

#### Milestone UPD-FE-M18 — Social Media Management

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-038 (was 033) | Connected Accounts (Social) | UPD-BE-045 | *(shipped)* 15-platform tile grid. |
| UPD-FE-039 (was 034, Content Calendar half) | Content Calendar | UPD-BE-046 | *(shipped)* Drag-schedule month grid. |
| UPD-FE-039e | Content Calendar, full spec parity | UPD-BE-046 | *(extends 039)* AI-suggest-a-month; gap-detection popup; bulk schedule/duplicate week/export. |
| UPD-FE-040 (was 034, Create Post half) | Create Post | UPD-BE-046 | *(shipped)* Multi-platform composer with previews. |
| UPD-FE-040e | Create Post, full spec parity | UPD-BE-046 | *(extends 040)* AI write/caption/image buttons; hashtag suggester; per-platform text override; IG first-comment editor. |
| UPD-FE-041 (was 035) | Media Library | UPD-BE-047 | *(shipped)* Asset grid, AI-generate, tagging. |
| UPD-FE-042 (was 036) | AI Content Studio | UPD-BE-048 | *(shipped)* Generators requiring approval. |
| UPD-FE-042e | AI Content Studio, full spec parity | UPD-BE-048 | *(extends 042)* Generation-history table (prompt, type, status, Reuse/Delete); plan-tier gate. |
| UPD-FE-043 (was 037) | Social Inbox | UPD-BE-049 | *(shipped)* Unified queue, AI-draft reply. |
| UPD-FE-044 (was 038, Analytics half) | Social Analytics | UPD-BE-050 | *(shipped)* Reach/engagement dashboard. |
| UPD-FE-044e | Social Analytics, full spec parity | UPD-BE-050 | *(extends 044)* Best-posting-times heatmap; content-type-performance chart; per-platform drill-down popup. |
| UPD-FE-045 (was 038, Settings half) | Social Settings | UPD-BE-051 | *(shipped)* Auto-post rules, brand voice. |
| UPD-FE-045e | Social Settings, full spec parity | UPD-BE-051 | *(extends 045)* Default posting times per platform; hashtag-set manager; approval-workflow config; link-shortening toggle — each as its own editor popup. |
| UPD-FE-121 | Drafts screen | — (BE already real) | Thumbnail/snippet/platforms/author/last-edited list; author/platform/date filters; Edit/Schedule/Delete/bulk-delete. |
| UPD-FE-122 | Scheduled Posts screen | UPD-BE-126 | Queue table with countdown card + density timeline; platform/date/campaign/status filters; Reschedule/Cancel/Publish-now/bulk-reschedule; failure-reason popup with Retry. |
| UPD-FE-123 | Published Posts screen | UPD-BE-127 | Per-post performance table (reach/likes/comments/shares/saves/clicks/engagement rate); Boost/Repost/View-on-platform; comments viewer with reply. |

#### Milestone UPD-FE-M19 — Competitive Insights depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-046 (was 039) | Visibility Score | UPD-BE-052 | *(shipped)* Gauge + breakdown + action list. |
| UPD-FE-047 (was 040) | Competitor Ads | UPD-BE-053 | *(shipped)* Ad gallery per competitor. |
| UPD-FE-048 (was 041) | Opportunities + AI Recommendations + Settings | UPD-BE-054, 055 | *(shipped)* Evidence-linked feed; settings. |
| UPD-FE-048e | Competitive Settings, full spec parity | UPD-BE-055 | *(extends 048)* Alert-threshold editor; weekly-report-recipient config. |
| UPD-FE-124 | Competitor Tracking screen | — (BE already real, in `src/marketing/`) | Track-up-to-5 cards; 12-week rating comparison chart; add-via-Google-place-search popup (replaces today's free-text add); competitor detail (recent reviews/posts/hours/photos); weekly-comparison message preview. |
| UPD-FE-125 | Keyword Rankings screen | UPD-BE-128 | Tracked-keyword table (position/change/volume/difficulty/top-competitor); distribution chart; bulk import; AI keyword suggestions; position-history popup. |

#### Milestone UPD-FE-M20 — AI Phone Receptionist

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-049 (was 042) | Call Overview + Live Calls | UPD-BE-057 | *(shipped)* Call list; live-calls take-over/listen. |
| UPD-FE-050 (was 043) | Bookings from Calls + Missed Calls | UPD-BE-058, 059 | *(shipped)* Booked-appointments list; recovery funnel. |
| UPD-FE-051 (was 044) | Transcripts & Recordings + Call Analytics + Settings | UPD-BE-059 | *(shipped)* Transcript viewer; analytics dashboard. |
| UPD-FE-051e | Receptionist Settings, full spec parity | UPD-BE-056, 057 | *(extends 051)* Intent-list editor (custom intents + priority); voice-selector with sample playback; ring-timeout dropdown. |
| UPD-FE-126 | Call Queue screen | UPD-BE-129 | Live queue rows (position, waiting-since, estimated wait, callback-requested); depth-over-day chart; Take-next/Offer-callback/Clear-queue; queue-message editor. |

#### Milestone UPD-FE-M21 — AI Photo Digitizer

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-052 (was 045) | Scanner Home + Capture | UPD-BE-060 | *(shipped)* Scanner-type picker; camera capture. |
| UPD-FE-053 (was 046) | Review & Correct | UPD-BE-061 | *(shipped)* Editable rows, confidence highlighting. |
| UPD-FE-054 (was 047) | Map & Import + Scan History + Settings | UPD-BE-062, 063 | *(shipped)* Mapping, history, learned aliases. |

*(Fully covered — no new tickets.)*

#### Milestone UPD-FE-M22 — Delivery & Riders

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-055 (was 048) | Live Tracking | UPD-BE-065 | *(shipped)* Live map with rider markers/routes. |
| UPD-FE-055e | All Deliveries, full spec parity | UPD-BE-065 (real `GET /deliveries`) | *(extends 055)* Dedicated history table (the plain list endpoint is real and distinct from the live SSE feed, this just needed its own table view); on-time-rate trend; failure-reason dropdown + Add custom. |
| UPD-FE-056 (was 049) | Assignment + Routes | UPD-BE-065, 066 | *(shipped)* Drag-to-assign; route builder. |
| UPD-FE-057 (was 050) | Proof of Delivery + Delivery Settings | UPD-BE-067, 068 | *(shipped)* Proof viewer; zone editor. |
| UPD-FE-057e | Delivery Settings, full spec parity | UPD-BE-068 | *(extends 057)* Rider-commission-structure editor; proof-requirement toggle. |
| UPD-FE-127 | **Riders screen** | UPD-BE-064 (fully real, unconsumed) | **Priority ticket** — the backend `Rider` CRUD is complete and has had zero frontend for the whole build. Roster table (vehicle, status, deliveries today, on-time %, rating, location); Add-rider form (vehicle type, zones, commission rate); performance-detail popup; deactivate. |

#### Milestone UPD-FE-M23 — Advertising, unified

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-058 (was 051) | Ad Accounts + Create Campaign | UPD-BE-069 | *(shipped)* Platform grid; 4-step wizard. |
| UPD-FE-059 (was 052) | Ad Creatives + Audiences | UPD-BE-070 | *(shipped)* Creative gallery; audience builder. |
| UPD-FE-059e | Ad Creatives, full spec parity | UPD-BE-070 | *(extends 059)* A/B-test setup; fatigue-warning indicator + explanation popup. |
| UPD-FE-060 (was 053) | Budget & Spend + Performance + Lead Inbox | UPD-BE-071 | *(shipped)* Spend pacing; performance funnel; lead inbox. |
| UPD-FE-060e | Budget & Spend, full spec parity | UPD-BE-071 | *(extends 060)* AI-reallocation-suggestion popup; over-budget auto-pause option. |
| UPD-FE-128 | All Campaigns screen | UPD-BE-130 | Cross-platform campaign table (budget/spent/impressions/CTR/ROAS, pause toggle); spend-vs-results + cost-per-result charts; filters; budget-adjust-with-forecast popup; duplicate, open-in-platform. |
| UPD-FE-129 | Advertising Settings screen | UPD-BE-131 | Default budget caps; auto-pause rules (cost-per-result threshold); approval requirement; attribution window; excluded audiences. |

#### Milestone UPD-FE-M24 — Integrations, module 24

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-061 (was 054) | Accounting Sync + E-commerce Sync | UPD-BE-072, 073 | *(shipped)* Mapping screen; conflict resolver. |
| UPD-FE-062 (was 055) | Automation Platforms | UPD-BE-074 | *(shipped)* Template gallery, test-trigger. |
| UPD-FE-063v (was 056) | Integration Directory (module 24) | UPD-BE-075 | *(shipped)* Full categorised connector grid. |
| UPD-FE-130 | Connection Detail screen | UPD-BE-132 | Connected-since/last-sync/records/token-expiry cards; sync-activity chart; sync log; field-mapping table; Sync now/Reconnect/Edit mapping/Pause/Disconnect; disconnect popup listing what stops working; reauthorization flow — generic across every connector. |
| — | API & Webhooks | — | *(shipped, Wave 5)* Module 24's own copy of this screen — same underlying feature as Settings' "Developer & API," see `UPD-BE-081`/`UPD-FE-136v` in Wave 5. |

#### Milestone UPD-FE-M25 — Wave 5 depth screens

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-131v (was 057) | Sentiment Analysis | UPD-BE-076 | *(shipped)* Theme cards with quotes, trend arrows. Home module: Reviews. |
| UPD-FE-132v (was 058) | Reorder Suggestions | UPD-BE-077 | *(shipped)* Suggestion table, grouped PO creation. Home module: Inventory. |
| UPD-FE-133v (was 059) | Cash Flow | UPD-BE-078 | *(shipped)* Forecast chart, obligation editor. Home module: Profit & Analytics. |
| UPD-FE-134v (was 060) | Activity Log screen | UPD-BE-079 | *(shipped)* Append-only audit table, diff drawer. Home module: Staff. |
| UPD-FE-135v (was 061) | SEO Heatmap | UPD-BE-080 | *(shipped)* Geographic grid heatmap. Home module: Competitive Insights. |
| UPD-FE-136v (was 062) | Developer & API screen | UPD-BE-081 | *(shipped)* API-key mgmt, webhook editor, delivery log. Home module: Settings. |

---

## Phase 3 — Integration

One ticket per module — real end-to-end verification against the running dev servers before moving to the next, same standard as v1's INT-001→INT-015. `Depends` ranges widened to match Phase 2's real ticket set, including `e`-suffixed extensions and newly-credited existing screens.

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-INT-001 | Dashboard depth | UPD-FE-001–004(e), 063, 064 | Health score, live activity, AI insights, action center, Today's Business, and Nightly Close all reflect real data live, including the newly-added cards/popups. |
| UPD-INT-002 | POS depth | UPD-FE-005–008(e), 065 | Held sale resumes into a completed sale; shift opens/closes with correct variance and denomination count; voice-parsed sale posts only after confirm; Sales History reflects real completed sales with correct filters. |
| UPD-INT-003 | Orders depth | UPD-FE-009–011, 066, 067 | Draft converts to a real order; table split-bill produces correct per-guest totals; return reverses stock and refund correctly; a real invoice's paid/unpaid status tracks real payments; a receipt resends correctly. |
| UPD-INT-004 | Products depth | UPD-FE-012–013(e), 068–071 | Variant set applies across products; bundle sells at bundle price; bulk price change matches its preview; a real service's staff/buffer/deposit fields enforce correctly at booking time; category merge preserves product counts; export produces a real file. |
| UPD-INT-005 | Bookings depth | UPD-FE-014–018, 072–074 | Booking request approves into a confirmed appointment; waitlist offer converts on cancellation; queue token calls/serves correctly; deposit captures/forfeits correctly; a real reminder rule fires on schedule; the Appointments List reflects real filtered data. |
| UPD-INT-006 | Credit depth | UPD-FE-019(e)–020, 075–080 | Instalment due-today entry is payable; transparent link resolves publicly; write-off is audit-logged and irreversible via UI; Overdue/Outstanding/Recovery Reports reflect real ageing data; a real statement PDF generates correctly. |
| UPD-INT-007 | Customers depth | UPD-FE-021–022, 081–083 | Punch-card stamp issues and redeems; membership charges on schedule; memory note persists; a real customer erase/export/merge completes correctly; a real segment's live count matches its rule. |
| UPD-INT-008 | Reviews depth | UPD-FE-023, 084–090 | Video-testimonial flow completes; a real private-feedback ticket moves through Open→Assigned→Resolved with a correct AI theme cluster; review request tracking shows real Sent/Opened/Rated states; the public rating page and embeddable widget both render live. |
| UPD-INT-009 | Marketing depth | UPD-FE-024–025, 091–094 | Automation fires on its real trigger; coupon and voucher redeem at a real sale; Marketing Overview/Referrals/Email Marketing all reflect real cross-module data; a real marketing asset PDF generates. |
| UPD-INT-010 | Profit & Analytics depth | UPD-FE-095–099 | Product Profitability and Customer Analytics reflect real order/cohort data; a real dead-hours offer drafts and requires approval; a real expense with receipt photo extracts and confirms via OCR; Staff Analytics shows correct per-staff figures. |
| UPD-INT-011 | Staff depth | UPD-FE-026(e)–029 | Shift roster publishes with real notification; a real swap request approves; timesheet approves with correct overtime; advance nets against commission payout; a real custom role's permissions enforce live. |
| UPD-INT-012 | Branches depth | UPD-FE-030, 100–101 | A real stock transfer moves inventory correctly on both branches; All Branches management creates/deactivates a real branch; a real per-branch setting override applies correctly. |
| UPD-INT-013 | Inventory depth | UPD-FE-031, 102–105 | Stock count's applied adjustments change on-hand quantities correctly; a real PO moves through its full pending→received lifecycle with correct partial-receive math; a real wastage entry (including Theft) logs correctly. |
| UPD-INT-014 | AI Assistant depth | UPD-FE-106–109 | Help Assistant answers strictly from real docs; Voice Assistant completes a real write action only after explicit confirm; chat history persists and deletes correctly; an AI-feature toggle in AI Settings actually disables that feature end-to-end. |
| UPD-INT-015 | Reports depth | UPD-FE-110–112 | A real scheduled report delivers on its configured cadence; a real tax report reflects real tax-rule data; a real full data export produces a correctly-scoped signed download link. |
| UPD-INT-016 | Settings depth | UPD-FE-032–034, 113–118 | Relabeling one word changes it live across a screen, WhatsApp template, and PDF simultaneously; a real custom option persists; real 2FA blocks login without the second factor; a real channel-priority change routes a message correctly; a real tax rule applies to a real sale; a real DSR request is trackable end-to-end with the 25/30-day flag working. |
| UPD-INT-017 | Business Listings | UPD-FE-035–037, 119–120 | A real master-record edit reaches a real connected directory (or fails cleanly on a placeholder credential); citation audit surfaces a real mismatch; a real photo pushes to selected directories; a real settings change alters sync behavior. |
| UPD-INT-018 | Social Media Management | UPD-FE-038–045(e), 121–123 | A real post schedules and publishes to at least one connected platform; the inbox receives a real webhook comment; Drafts/Scheduled/Published all reflect real post-lifecycle state correctly. |
| UPD-INT-019 | Competitive Insights depth | UPD-FE-046–048(e), 124–125 | Visibility score reflects real component data; a real opportunity is evidence-linked; a real competitor added via place-search tracks correctly; a real keyword's AI suggestion and rank history are accurate. |
| UPD-INT-020 | AI Phone Receptionist | UPD-FE-049–051(e), 126 | A real test call is answered, transcribed, and produces a real logged outcome with the disclosure audible; a real call queues correctly and a real callback offer/clear-queue action works. |
| UPD-INT-021 | AI Photo Digitizer | UPD-FE-052–054 | A real photographed document extracts, corrects, and imports into the right destination module, including the Products and Expenses OCR paths. |
| UPD-INT-022 | Delivery & Riders | UPD-FE-055(e)–057(e), 127 | A real delivery assigns to a real rider, tracks live, and completes with real proof-of-delivery; **the Riders screen manages a real rider end-to-end** (this is the ticket that finally exercises `UPD-BE-064` from the frontend). |
| UPD-INT-023 | Advertising (unified) | UPD-FE-058–060(e), 128–129 | A real campaign reaches its provider's real campaign-creation call across at least 2 platforms; a real pause/resume/budget-adjust action reaches the provider; Advertising Settings' auto-pause rule actually fires. |
| UPD-INT-024 | Integrations (module 24) | UPD-FE-061–063v, 130 | A real accounting/e-commerce sync reaches its real provider call; a real outbound webhook fires and logs delivery; the generic Connection Detail screen correctly manages at least 3 different connector types through one UI. |
| UPD-INT-025 | Wave 5 depth screens | UPD-FE-131v–136v | Each of the 6 depth screens renders real data against the running backend. |
| UPD-INT-026 | Full regression + updated security audit + refreshed deploy checklist | All prior | Mirrors v1 INT-015: full journey re-walked including every module touched in this pass; spec §6 checklist re-run against the now much larger surface area; `docs/PRODUCTION_DEPLOY_CHECKLIST.md` updated with every new env var. |

---

## Sequencing notes

- Waves are a soft ordering within each phase, not a hard gate — pick whichever module matters most to actual business priorities.
- **Verify before ticketing.** This pass exists because the first one didn't do this: roughly half of the original "missing" list was already shipped, just under a different module folder or never credited in this document. Before adding a new `UPD-BE-###`/`UPD-FE-###` for anything that looks absent, check `backend/src/`, `schema.prisma`, and `frontend/src/app/(app)/` directly — a five-minute grep is cheaper than a duplicate model.
- UPD-BE-035 (Roles & Permissions matrix) and UPD-BE-038 (Terminology Engine) remain the two cross-cutting tickets, both already shipped.
- UPD-BE-074 and UPD-BE-081 share webhook-delivery plumbing, both already shipped.
- New external credentials needed by the genuinely-new tickets in this pass: none beyond what v1/the first pass already introduced — every new ticket above extends an existing connector, model, or service rather than introducing a new third-party dependency.
- **The single highest-priority gap found in this pass**: `UPD-FE-127` (Riders screen) — full backend CRUD has had zero frontend for the whole build. Every other gap is a missing screen or an under-specified extension; this one is a fully-built, fully-invisible feature.

## Verification approach

Unchanged from v1: every BE ticket gets unit tests; every FE ticket gets a manual smoke pass against the shared-state-kit; every INT ticket gets a real end-to-end exercise against the running dev servers before being marked done; UPD-INT-026 is the final gate. Tickets marked `(shipped)` or `(existing, undocumented)` above don't need re-building, but their first INT pass through this document should still spot-check them against the spec's exact field list, since "real code exists" and "matches the spec's exact design" were caught diverging in the Health Score / Live Activity / Action Center cases already found and extension-ticketed this pass.
