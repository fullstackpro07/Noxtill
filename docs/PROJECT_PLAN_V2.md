# Noxtill v2 — Update Roadmap & Ticket Breakdown

Companion to `docs/PROJECT_PLAN.md` (the v1 roadmap, now fully built — all 90 backend, 45 frontend, and 15 integration tickets shipped). This document sequences the update pass driven by `docs/Noxtill_Complete_Screen_Specification & Updates.docx`, the new 24-module/190-screen source of truth. Same role v1's plan played: single source of truth for build sequencing, one ticket at a time, picked up via "move to the next ticket."

**Build order: Backend → Frontend → Integration**, same as v1 — but unlike v1, backend tickets here land against an already-live product, so frontend work in Phase 2 is built directly against real endpoints from the start, not typed stubs.

---

## Context

`docs/Noxtill_Complete_Screen_Specification & Updates.docx` is a new, more detailed source of truth: 24 modules, 190 screens, every field/card/table/filter/button/API named per screen. It supersedes the two original developer specs for anything it covers. The document's own Appendix B/C give the honest starting point:

- **13 sidebar modules are "live"** per the doc, but direct codebase verification found the real number is closer to **17**: Dashboard, POS (Fast Sale), Orders, Products, Bookings, Credit, Customers, Reviews, Marketing, Profit, Staff, Branches, Settings, **plus** Inventory, AI Assistant, Reports, and the Integrations Hub (all built and live-wired in v1's INT-001→INT-015 work, which predates this document).
- **7 modules don't exist at all**: Social Media Management, unified Advertising, Business Listings, Competitive Insights (only competitor/keyword tracking exists — the rest of the module is new), AI Phone Receptionist, AI Photo Digitizer, Delivery & Riders.
- Every live module is missing multiple screens the new spec calls for — this is the bulk of "the updates."

Two Explore agents verified current state directly against the doc before this plan was written (not assumed):
- **Backend** (`backend/src/`, 29 module folders, 39 Prisma models): confirmed real code for Inventory, AI Assistant, Reports/Exports, Integrations Hub (OAuth connector framework + email), Billing, Competitive tracking (competitors/keywords). Confirmed **not found**: Social Media Management, AI Phone Receptionist, AI Photo Digitizer, Delivery & Riders, Loyalty/Memberships, Coupons & Vouchers, Automations engine, Held Sales, Draft Orders, real Tables mode, Booking Deposits/Waiting-List/Queue, 2FA, Developer API keys/webhooks, Business Health Score, Sentiment Analysis, Video Testimonials, Branch Stock Transfers. Staff is **partial** (CRUD/commissions/attendance exist; no shifts/timesheets/advances/payroll/permission-matrix). RBAC is a **flat 3-role enum** (owner/manager/staff via `common/guards/roles.guard.ts`), not the granular capability matrix the new spec calls for.
- **Frontend** (`frontend/src/app/`, ~18 top-level pages): confirms the same gaps 1:1 — no Social Media Management, Advertising, Business Listings, Competitive Insights, AI Phone Receptionist, or AI Photo Digitizer screens anywhere; each live module's page covers only its primary screen(s), not the new spec's full screen set.

## Strategy — continuing the established working pattern

Same pattern as the whole v1 build: **Backend phase → Frontend phase → Integration phase**, each phase's tickets grouped into module-level milestones, executed one ticket at a time via "move to the next ticket," each ticket getting its own detailed addendum plan immediately before implementation.

**Sequencing = the document's own Appendix C wave order:**

- **Wave 1 (primary screen of each live module) — already complete.** Verified: Dashboard Overview, Fast Sale, All Orders, All Products, Calendar, Ledger, Customer List, All Reviews, Campaigns, Profit Overview, Team, Current Stock, Business Chat, All Reports, Business Profile all exist and are live-wired. No tickets needed.
- **Wave 2 — bring all ~17 live modules up to full spec depth.** The doc's literal Wave 2 definition (empty states/import/settings sub-screens/filters) is already satisfied by the shared-state-kit pattern used throughout v1 — so Wave 2 here is expanded to cover every other missing screen within existing modules.
- **Wave 3 — Business Listings, Social Media Management, Competitive Insights** (minus SEO Heatmap, which the doc explicitly places in Wave 5).
- **Wave 4 — AI Phone Receptionist, AI Photo Digitizer, Delivery & Riders, unified Advertising, Integrations module 24 restructure** (Accounting/E-commerce/Automation-platform connectors — distinct from the existing Marketing Integrations Hub, which covers ads/email/GMB only).
- **Wave 5 — the doc's explicitly named depth screens**: Sentiment Analysis, Reorder Suggestions (formalized), Cash Flow forecasting, Activity Log, SEO Heatmap, Developer & API.

**Ticket ID scheme**: `UPD-BE-###`, `UPD-FE-###`, `UPD-INT-###` — a distinct namespace from v1's `BE-###`/`FE-###`/`INT-###` so history stays legible.

**Reuse over rebuild** — every new connector (social platforms, accounting, e-commerce, automation platforms, additional directories, additional ad platforms) reuses the `GenericOAuth2Connector` + `connector-registry.ts` framework from v1 INT-013. Every new AI feature reuses `AiInfraService`. Every new generated file reuses `PdfRendererService`/`S3Service`. Every new scheduled job mirrors the existing `*.scheduler.ts`/`*.processor.ts` BullMQ pattern. Every new external credential follows the standing "real code, disclosed placeholder" rule — new ones needed this phase: a telephony provider (Twilio Voice or equivalent) for AI Phone Receptionist, and a maps/geocoding provider for Delivery routing.

**Two risk flags, not blockers:**
1. **Granular Roles & Permissions matrix** (UPD-BE-035) replaces the flat 3-role enum with a real capability matrix + custom roles — touches every `@Roles()` guard call site across the whole backend. Gets its own dedicated ticket-level plan (with a migration strategy for existing guards) when its turn comes.
2. **Terminology Engine** (UPD-BE-038) — relabeling every noun app-wide — is cross-cutting by design: it has to resolve through every screen, WhatsApp template, and generated PDF simultaneously. Scoped as its own foundational ticket in Wave 2.

---

## Phase 1 — Backend

### Wave 2 — Deepen existing live modules

#### Milestone UPD-BE-M1 — Dashboard depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-001 | Business Health Score | — | `GET /health-score?range=` returns weighted 0–100 score (rating trend / repeat-customer-rate / margin / credit-recovery, each 0–25) + 12-week history; `PATCH /health-score/weights` persists custom weighting |
| UPD-BE-002 | Live Activity feed | — | New tenant-scoped `ActivityEvent` model written by existing mutation points (sale/booking/review/payment/complaint/stock); `GET /activity/stream` (SSE) pushes new events in real time |
| UPD-BE-003 | AI Insights | UPD-BE-002 | Daily BullMQ job generates observations from real data via `AiInfraService`, each tagged with its source figure; `GET /ai/insights`, `POST /ai/insights/:id/action` |
| UPD-BE-004 | Action Center | UPD-BE-002 | Aggregates open complaints / low-stock / overdue-credit / unreplied-reviews / failed-payments into one prioritised queue (mirrors the Staff Inbox synthesis pattern from v1 INT-009); `GET /actions`, `POST /actions/:id/complete\|snooze\|dismiss` |

#### Milestone UPD-BE-M2 — POS depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-005 | Held Sales | — | `HeldSale` model (cart snapshot); `GET /sales/held`, `POST /sales/held`, `POST /sales/held/:id/resume` converts atomically to a real sale |
| UPD-BE-006 | Cash Register | — | `Shift`/`CashMovement` models; `POST /cash/shift/open\|close`, `POST /cash/movements` (cash in/out with reason) |
| UPD-BE-007 | Shift Closing | UPD-BE-006 | Variance calc (counted vs. expected from `CashMovement` totals); `POST /cash-reconciliation`, requires a note above a configurable variance threshold |
| UPD-BE-008 | Voice-entry Sale | — | Audio upload → Claude parse (`AiInfraService`) → editable line items → confirm; `POST /voice/sales/parse`, `POST /voice/sales/:id/confirm`; never writes a sale without explicit confirm |

#### Milestone UPD-BE-M3 — Orders depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-009 | Draft Orders | — | `draft` status on `Order`; `GET /orders?status=draft`, `POST /orders/:id/convert` |
| UPD-BE-010 | Tables (real floor mode) | — | `Table` model (number, floor position, status); `GET/POST/PATCH /tables`, move/merge/split-bill tied to `Order` |
| UPD-BE-011 | Returns & Refunds | — | `Return`/`ReturnItem` models; `POST /returns`, `POST /returns/:id/approve` reverses stock via existing `StockMovement` and refunds via the existing `PaymentGatewayAdapter` |

#### Milestone UPD-BE-M4 — Products depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-012 | Variants (formal) | — | `VariantSet`/`VariantOption` models; `CRUD /variants`, `POST /variants/:id/apply` to products |
| UPD-BE-013 | Bundles | UPD-BE-012 | `Bundle`/`BundleItem` models; `POST /products/bundle`; `GET /profit/bundle-suggestions` via `AiInfraService` |
| UPD-BE-014 | Suppliers | — | `Supplier` model (formalises the loose text reference already used by Purchases); `CRUD /suppliers`, quick-PO creation |
| UPD-BE-015 | Pricing bulk tools | UPD-BE-014 | `PATCH /products/bulk-price` (by % or amount, dry-run preview); price-history log; AI suggested-price via `AiInfraService` |

#### Milestone UPD-BE-M5 — Bookings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-016 | Booking Requests | — | Approve/decline/suggest-alternative on `status: requested` appointments; `POST /appointments/:id/approve` |
| UPD-BE-017 | Waiting List | — | `WaitlistEntry` model; `POST /waitlist`, `POST /waitlist/:id/offer` auto-triggered on a matching cancellation |
| UPD-BE-018 | Queue / Tokens | — | `QueueToken` model (sequential per-business-day numbering); `POST /queue/join`, `PATCH /queue/:id/call\|serve\|skip` |
| UPD-BE-019 | Deposits | — | `Deposit` model; `POST /deposits`, `POST /deposits/:id/capture\|refund`; auto-forfeit on a linked no-show |
| UPD-BE-020 | No-Shows reporting | — | `GET /appointments?status=no_show` with rate/trend aggregation — thin ticket, no new model |

#### Milestone UPD-BE-M6 — Credit depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-021 | Instalment plans | — | `InstallmentPlan`/`Installment` models; `POST /credit/:customerId/installment-plan`, `GET /installments?due=today` |
| UPD-BE-022 | Transparent ledger links | — | Signed public link reusing the review-token generation pattern (`review-token.util.ts`); `POST /credit/:customerId/share-link`, revoke |
| UPD-BE-023 | Write-off flow | — | Typed-confirmation + reason; audit-logged via existing `AuditLog`; `POST /credit/:id/write-off`, owner-only |

#### Milestone UPD-BE-M7 — Customers depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-024 | Loyalty punch cards/tiers | — | `LoyaltyProgram`/`LoyaltyMember`/`Stamp` models; issue-on-sale hook, `POST /loyalty-programs`, redeem endpoint |
| UPD-BE-025 | Membership plans | UPD-BE-024 | `MembershipPlan`/`Membership` models; recurring billing via the existing `PaymentGatewayAdapter` interface — a separate subscription object from the business's own Stripe plan |
| UPD-BE-026 | Business Memory notes | — | `MemoryNote` model (polymorphic subject: customer/supplier/product/table); `CRUD /memory-notes` |

#### Milestone UPD-BE-M8 — Reviews depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-027 | Video Testimonials | — | `VideoTestimonial` model; request/upload/approve via `S3Service`; `GET /video-testimonials`, `PATCH /video-testimonials/:id/approve` |

#### Milestone UPD-BE-M9 — Marketing depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-028 | Automations engine | UPD-BE-002 | `Workflow`/`WorkflowRun` models; trigger registry over existing event points (sale / booking-completed / lapsed-customer / low-stock / review / credit-overdue / birthday, via the `ActivityEvent` stream from UPD-BE-002); condition/action executor; `POST /workflows/:id/test` runs against real recent data without side effects |
| UPD-BE-029 | Coupons | — | `Coupon` model; validation/redemption wired into `POST /sales` |
| UPD-BE-030 | Vouchers | — | `Voucher` model; `POST /vouchers` (issue), balance-tracked redemption at sale time |

#### Milestone UPD-BE-M10 — Staff depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-031 | Shifts & Schedule | — | `StaffShift`/`TimeOff` models; roster `CRUD /shifts`, `POST /shifts/:id/swap-request` |
| UPD-BE-032 | Timesheets | UPD-BE-031 | Derives from `Attendance` + `StaffShift`; approval flag + overtime calc against a configurable threshold |
| UPD-BE-033 | Advances | — | `StaffAdvance` model; `CRUD /staff/:id/advances`; auto-deducted from the next commission payout |
| UPD-BE-034 | Payroll Export | UPD-BE-032, UPD-BE-033 | `GET /payroll/export.xlsx?month=` (hours + commission + advances deducted) via the existing `ExcelJS` export pattern |
| UPD-BE-035 | Roles & Permissions matrix | — | **Cross-cutting RBAC refactor.** Capability-matrix model + custom roles replacing the flat 3-role enum; every existing `@Roles()` call site migrated without narrowing current access; own addendum plan written before implementation given the blast radius |

#### Milestone UPD-BE-M11 — Branches depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-036 | Stock Transfers | — | `StockTransfer`/`StockTransferItem` models; `CRUD /stock-transfers`; approve/ship/receive writes a `StockMovement` on both branches |

#### Milestone UPD-BE-M12 — Inventory depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-037 | Stock Count | — | `StockCount`/`StockCountLine` models; `POST /stock/counts`, `POST /stock/counts/:id/apply` writes adjusting `StockMovement` rows |

#### Milestone UPD-BE-M13 — Settings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-038 | Terminology Engine | — | **Cross-cutting.** `LabelOverride` model (business + area + key); resolution service consumed by every screen label, WhatsApp template, and generated PDF; `GET/PATCH /labels` |
| UPD-BE-039 | Custom Options manager | — | Generalises the existing `CRUD /options/:setKey` pattern into one cross-list manager endpoint (`GET /options`, rename/reorder/hide) |
| UPD-BE-040 | Security / 2FA | — | WhatsApp-OTP or TOTP-authenticator enrollment + verification step in the login flow; `POST /auth/2fa/enable`, session list + `DELETE /sessions/:id` |

### Wave 3 — Marketing & visibility (new modules)

#### Milestone UPD-BE-M14 — Business Listings

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-041 | Master Business Record + directory connector base | — | Reuses `GenericOAuth2Connector`/`connector-registry.ts` from v1 INT-013; `GET/PATCH /listings/master`, `POST /listings/sync` pushes to connected directories |
| UPD-BE-042 | Google Business Profile deep management | UPD-BE-041 | Extends the existing `GmbPost` model: posts/photos/Q&A CRUD, insights pull job |
| UPD-BE-043 | Additional directory connectors | UPD-BE-041 | Bing Places, Apple Business Connect, Yelp, etc. via the same connector pattern; disclosed-placeholder credentials per provider |
| UPD-BE-044 | Sync log, Listing Health, Citation Audit | UPD-BE-043 | Mismatch-detection scan across connected directories; `GET /listings/sync-log`, `GET /listings/health`, `GET /seo/citations` |

#### Milestone UPD-BE-M15 — Social Media Management

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-045 | Connected Accounts (15 platforms) | — | Extends the connector framework; most platforms share the OAuth2 shape via `GenericOAuth2Connector`; `GET /social/accounts`, `POST /social/:platform/connect` |
| UPD-BE-046 | Content Calendar + Create Post | UPD-BE-045 | `SocialPost` model with scheduling; multi-platform publish BullMQ job; `CRUD /content-calendar`, `POST /social/posts` |
| UPD-BE-047 | Media Library | — | `MediaAsset` model + `S3Service`; AI image generation via `AiInfraService`; `CRUD /media` |
| UPD-BE-048 | AI Content Studio | UPD-BE-047 | Caption/image/video-slideshow generation via `AiInfraService`; `POST /ai/content/generate`; nothing auto-publishes without explicit approval |
| UPD-BE-049 | Social Inbox | UPD-BE-045 | Per-platform webhook ingestion of comments/DMs into one queue (reuses the idempotent-webhook pattern from v1 `webhooks/`); `GET /social/inbox`, `POST /social/inbox/:id/reply` |
| UPD-BE-050 | Social Analytics | UPD-BE-046 | Insights-pull job per platform + aggregation; `GET /social/analytics` |
| UPD-BE-051 | Social Settings | UPD-BE-046 | Auto-post rules, hashtag sets, brand voice config; `PATCH /social/settings` |

#### Milestone UPD-BE-M16 — Competitive Insights depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-052 | Visibility Score | — | Weighted calc: listing completeness (UPD-BE-044) + review freshness + SEO health + social activity (UPD-BE-050); `GET /visibility-score` |
| UPD-BE-053 | Competitor Ads | — | Meta Ad Library API integration (public, no scraping); `GET /competitors/:id/ads` |
| UPD-BE-054 | Opportunities + AI Recommendations | UPD-BE-052 | Gap-analysis job (keyword/review/listing/service/hours) + Claude-generated recommendations via `AiInfraService`, each evidence-linked; `GET /competitive/opportunities`, `GET /competitive/recommendations` |
| UPD-BE-055 | Competitive Settings | — | Tracked competitors/keywords, scan frequency, alert thresholds; `PATCH /competitive/settings` |

### Wave 4 — AI & operations (new modules)

#### Milestone UPD-BE-M17 — AI Phone Receptionist

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-056 | Telephony provider integration | — | Number provisioning + inbound call webhook via a new telephony provider (Twilio Voice or equivalent), disclosed-placeholder credential; `POST /voice/provision-number` |
| UPD-BE-057 | Real-time call handling | UPD-BE-056 | Speech-to-text → Claude intent parse (`AiInfraService`) → text-to-speech response loop; the automated-and-recorded disclosure is spoken and cannot be configured out of the greeting |
| UPD-BE-058 | Call outcomes | UPD-BE-057 | Booking-via-call reuses `booking-lock.util.ts` from v1 INT-008; message-taking; transfer-to-human; `GET /appointments?source=phone` |
| UPD-BE-059 | Missed calls, queue, transcripts, analytics | UPD-BE-057 | Missed-call → WhatsApp message reuses `SendGateService`; transcript/recording storage via `S3Service` with retention tied to Data & Privacy rules; `GET /voice/calls`, `GET /missed-calls`, `GET /voice/analytics` |

#### Milestone UPD-BE-M18 — AI Photo Digitizer

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-060 | Generalized scan pipeline | — | Claude-vision extraction per scanner type (register/receipt/invoice/menu/product/business-card/general) — generalises the photo-import extraction pipeline already proven for customer-list photos in v1; `POST /digitizer/upload` |
| UPD-BE-061 | Review & Correct | UPD-BE-060 | Confidence-scored row editing; `GET /digitizer/scans/:id/rows`, `PATCH /digitizer/rows/:id` |
| UPD-BE-062 | Map & Import | UPD-BE-061 | Destination routing to Customers/Products/Expenses/Suppliers/Credit-opening-balances, reusing the existing import-commit pattern (`POST /imports/:id/commit`) |
| UPD-BE-063 | Scan History + learned aliases | UPD-BE-060 | `GET /digitizer/history`; per-business alias learning from owner corrections (Digitizer Settings) |

#### Milestone UPD-BE-M19 — Delivery & Riders

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-064 | Riders | — | `Rider` model; `CRUD /riders`, performance aggregation |
| UPD-BE-065 | Delivery assignment + live tracking | UPD-BE-064 | `Delivery` model (linked to `Order`); auto-assign logic; `GET /deliveries/live` (SSE) |
| UPD-BE-066 | Routes | UPD-BE-065 | Multi-stop route builder + basic nearest-neighbour optimisation; disclosed that full routing quality depends on a maps/geocoding provider credential; `CRUD /routes`, `POST /routes/:id/optimise` |
| UPD-BE-067 | Proof of Delivery | UPD-BE-065 | Signature/photo capture via `S3Service`, GPS coordinate logging; `GET /deliveries/:id/proof` |
| UPD-BE-068 | Delivery zones & settings | — | `DeliveryZone` model; charge rules (flat/by-distance/by-order-value); `CRUD /delivery-zones` |

#### Milestone UPD-BE-M20 — Advertising, unified

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-069 | Unified Ad Accounts + Create Campaign | — | Abstraction layer over the existing Google/Meta/TikTok connectors from v1 INT-013; extends to LinkedIn/Pinterest/Snapchat/Microsoft/Amazon/Reddit via `GenericOAuth2Connector`; `GET /ads/accounts`, `POST /ads/:provider/campaigns` |
| UPD-BE-070 | Ad Creatives + Audiences | UPD-BE-069 | Review-to-ad builds on the creative-render capability already proven for Meta Ads in v1 INT-013; CRM segment sync to audiences with a consent check excluding opted-out customers; `CRUD /ads/creatives`, `CRUD /ads/audiences` |
| UPD-BE-071 | Budget & Spend, Ad Performance, Lead Inbox | UPD-BE-069 | Cross-platform spend/attribution rollup; `GET /ads/budget`, `GET /ads/performance`, `GET /ads/leads` |

#### Milestone UPD-BE-M21 — Integrations, module 24 restructure

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-072 | Accounting Sync | — | QuickBooks/Xero connectors via `GenericOAuth2Connector`; account/tax-code mapping; `POST /integrations/accounting/sync` |
| UPD-BE-073 | E-commerce Sync | — | Shopify/WooCommerce connectors; two-way stock/order sync with a conflict resolver; `POST /integrations/ecommerce/sync` |
| UPD-BE-074 | Automation Platforms | — | Zapier/Make/n8n trigger+action registry; outbound-webhook delivery core (retry/backoff/logging) built once here and reused by UPD-BE-081; `GET /integrations/automation/triggers` |
| UPD-BE-075 | Integration Directory | UPD-BE-041, UPD-BE-045, UPD-BE-069, UPD-BE-072, UPD-BE-073, UPD-BE-074 | Unified `GET /integrations` across every category (Google/Meta/Microsoft/Social/E-commerce/Payments/Accounting/Marketing/Automation/Developer) |

### Wave 5 — Depth & analytics screens

#### Milestone UPD-BE-M22 — Depth & analytics screens

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-BE-076 | Sentiment Analysis | — | Claude-based theme clustering over review text via `AiInfraService`; `GET /reviews/sentiment` |
| UPD-BE-077 | Reorder Suggestions, formalized | — | Sales-velocity calc + supplier-grouped PO generation, extends the existing `low-stock-scan.processor.ts`; `GET /stock/reorder-suggestions` |
| UPD-BE-078 | Cash Flow forecasting | — | `RecurringObligation` model; projection calc; `GET /cash-forecast?days=`, `CRUD /recurring-obligations` |
| UPD-BE-079 | Activity Log endpoint | — | Query/filter endpoint over the existing `AuditLog` model — thin ticket, no new model; `GET /audit-log` |
| UPD-BE-080 | SEO Heatmap | — | Grid-point local-pack rank scanning, extends `SerpRankService` from v1 INT-010; `GET /seo/heatmap?keyword=`, `POST /seo/heatmap/scan` |
| UPD-BE-081 | Developer & API | UPD-BE-074 | API-key generation/scoping + outbound webhook `CRUD /outbound-webhooks` + delivery log, reusing UPD-BE-074's delivery core; `CRUD /api-keys` |

---

## Phase 2 — Frontend

Same module grouping and wave order as Phase 1; each ticket builds the screen(s) against its corresponding, already-real backend ticket(s), following the established `Raw*`/`Live*` API-layer + `useQuery`/`useMutation` + shared-state-kit pattern from v1.

#### Milestone UPD-FE-M1 — Dashboard depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-001 | Business Health Score screen | UPD-BE-001 | Score gauge + 12-week trend + component breakdown; weight-adjustment popup |
| UPD-FE-002 | Live Activity feed | UPD-BE-002 | Real-time SSE-consuming event list with type/staff/branch filters |
| UPD-FE-003 | AI Insights feed | UPD-BE-003 | Insight cards with source figure shown, action/dismiss buttons |
| UPD-FE-004 | Action Center | UPD-BE-004 | Priority-chip queue with snooze/dismiss/complete, deep-links into the source record |

#### Milestone UPD-FE-M2 — POS depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-005 | Held Sales + Cash Register + Shift Closing | UPD-BE-005, UPD-BE-006, UPD-BE-007 | Held-sales list with resume; cash-drawer open/close + movement log; shift-close reconciliation with variance display |
| UPD-FE-006 | Voice-entry Sale | UPD-BE-008 | Hold-to-speak capture, live transcript, editable parsed line items before confirm |

#### Milestone UPD-FE-M3 — Orders depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-007 | Draft Orders | UPD-BE-009 | Draft list with convert/delete |
| UPD-FE-008 | Tables (real floor mode) | UPD-BE-010 | Floor grid of table tiles, drag move/merge, split-bill dialog |
| UPD-FE-009 | Returns & Refunds | UPD-BE-011 | Return builder (pick order, select items, reason), approval screen |

#### Milestone UPD-FE-M4 — Products depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-010 | Variants + Bundles | UPD-BE-012, UPD-BE-013 | Variant-set builder; bundle builder with live margin preview + AI suggestion cards |
| UPD-FE-011 | Suppliers + Pricing bulk tools | UPD-BE-014, UPD-BE-015 | Supplier CRUD + quick-PO; bulk price-change tool with preview and AI-suggested-price column |

#### Milestone UPD-FE-M5 — Bookings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-012 | Booking Requests + Waiting List | UPD-BE-016, UPD-BE-017 | Approval queue; waitlist list with manual/auto offer |
| UPD-FE-013 | Queue / Tokens | UPD-BE-018 | Large now-serving display, call-next/skip/serve controls |
| UPD-FE-014 | Deposits + dedicated No-Shows | UPD-BE-019, UPD-BE-020 | Deposit list with capture/refund; no-show trend screen with repeat-offender flagging |

#### Milestone UPD-FE-M6 — Credit depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-015 | Instalment plans + transparent links | UPD-BE-021, UPD-BE-022 | Plan builder with editable schedule preview; generate/copy/revoke shareable link |
| UPD-FE-016 | Write-off flow | UPD-BE-023 | Typed-confirmation write-off dialog, owner-only |

#### Milestone UPD-FE-M7 — Customers depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-017 | Loyalty & Memberships | UPD-BE-024, UPD-BE-025 | Punch-card/tier/membership-plan tabs; enrol-customer flow |
| UPD-FE-018 | Business Memory notes | UPD-BE-026 | Note list with subject picker, pin, category filter |

#### Milestone UPD-FE-M8 — Reviews depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-019 | Video Testimonials | UPD-BE-027 | Request flow, gallery with approve/post/delete |

#### Milestone UPD-FE-M9 — Marketing depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-020 | Automations builder | UPD-BE-028 | Trigger → condition → action builder with "test against recent data" preview |
| UPD-FE-021 | Coupons & Vouchers | UPD-BE-029, UPD-BE-030 | Coupon builder; voucher builder with design/message, redemption at POS |

#### Milestone UPD-FE-M10 — Staff depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-022 | Shifts & Schedule + Timesheets | UPD-BE-031, UPD-BE-032 | Weekly roster grid with drag shift-editing; timesheet approval list with overtime flags |
| UPD-FE-023 | Advances + Payroll Export | UPD-BE-033, UPD-BE-034 | Advance record/settle list; payroll export screen with missing-wage-rate warning |
| UPD-FE-024 | Roles & Permissions matrix UI | UPD-BE-035 | Capability × role checkbox matrix, custom-role builder, change-impact confirm showing affected staff count |

#### Milestone UPD-FE-M11 — Branches depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-025 | Stock Transfers | UPD-BE-036 | Transfer builder (from/to branch, line items), approve/ship/receive flow |

#### Milestone UPD-FE-M12 — Inventory depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-026 | Stock Count | UPD-BE-037 | Count-entry screen (scan or search), variance display, apply-adjustments confirm |

#### Milestone UPD-FE-M13 — Settings depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-027 | Labels & Terminology screen | UPD-BE-038 | Live-preview pane (mock dashboard/WhatsApp message/invoice) updating as labels are edited |
| UPD-FE-028 | Custom Options manager | UPD-BE-039 | Grouped list manager — rename/reorder/hide per option set |
| UPD-FE-029 | Security / 2FA screen | UPD-BE-040 | 2FA enrollment (OTP or authenticator), active-sessions list with revoke |

#### Milestone UPD-FE-M14 — Business Listings

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-030 | Listings overview + Master Record | UPD-BE-041 | Directory tiles with status chips; master-record editor with "will update N directories" warning |
| UPD-FE-031 | Google Business Profile deep screen | UPD-BE-042 | Post composer, Q&A list with AI-drafted answers, photos grid, insights |
| UPD-FE-032 | Directory Sync + Listing Health + Citation Audit | UPD-BE-043, UPD-BE-044 | Sync log with retry; health-score breakdown; side-by-side citation mismatch table |

#### Milestone UPD-FE-M15 — Social Media Management

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-033 | Connected Accounts (Social) | UPD-BE-045 | 15-platform tile grid with connect/reconnect/disconnect |
| UPD-FE-034 | Content Calendar + Create Post | UPD-BE-046 | Drag-schedule month grid; multi-platform composer with per-platform preview panes |
| UPD-FE-035 | Media Library | UPD-BE-047 | Asset grid with AI-generate, tagging, usage tracking |
| UPD-FE-036 | AI Content Studio | UPD-BE-048 | Caption/image/video-slideshow generators, each requiring explicit approval before scheduling |
| UPD-FE-037 | Social Inbox | UPD-BE-049 | Unified comment/DM queue with AI-draft reply, assign, mark-done |
| UPD-FE-038 | Social Analytics + Settings | UPD-BE-050, UPD-BE-051 | Reach/engagement dashboard; auto-post-rule and brand-voice editors |

#### Milestone UPD-FE-M16 — Competitive Insights depth

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-039 | Visibility Score | UPD-BE-052 | Score gauge + component breakdown + prioritised action list |
| UPD-FE-040 | Competitor Ads | UPD-BE-053 | Ad gallery per competitor with first/last-seen and copy |
| UPD-FE-041 | Opportunities + AI Recommendations + Settings | UPD-BE-054, UPD-BE-055 | Opportunity/recommendation feed with evidence shown, action/dismiss; settings for tracked competitors/keywords |

#### Milestone UPD-FE-M17 — AI Phone Receptionist

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-042 | Call Overview + Live Calls | UPD-BE-057 | Call list with transcript/recording; live-calls panel with take-over/listen |
| UPD-FE-043 | Bookings from Calls + Missed Calls + Queue | UPD-BE-058, UPD-BE-059 | AI-booked-appointments list; missed-call recovery funnel; call-queue panel |
| UPD-FE-044 | Transcripts & Recordings + Call Analytics + Settings | UPD-BE-059 | Searchable transcript viewer with synced audio; analytics dashboard; greeting-script/intent settings |

#### Milestone UPD-FE-M18 — AI Photo Digitizer

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-045 | Scanner Home + Capture | UPD-BE-060 | Scanner-type picker with example images; camera capture with alignment guide |
| UPD-FE-046 | Review & Correct | UPD-BE-061 | Editable extracted-rows table with confidence highlighting, source-image side-by-side |
| UPD-FE-047 | Map & Import + Scan History + Settings | UPD-BE-062, UPD-BE-063 | Destination/column mapping with preview counts; scan history with reprocess; learned-alias management |

#### Milestone UPD-FE-M19 — Delivery & Riders

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-048 | Live Tracking + All Deliveries | UPD-BE-065 | Live map with rider markers/routes; delivery history table |
| UPD-FE-049 | Assignment + Routes | UPD-BE-065, UPD-BE-066 | Drag-to-assign unassigned-orders/riders panes; route builder with stop reordering |
| UPD-FE-050 | Proof of Delivery + Delivery Settings | UPD-BE-067, UPD-BE-068 | Signature/photo/GPS proof viewer; zone map editor with charge rules |

#### Milestone UPD-FE-M20 — Advertising, unified

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-051 | Ad Accounts + Create Campaign | UPD-BE-069 | Platform tile grid; 4-step goal→audience→creative→review campaign wizard |
| UPD-FE-052 | Ad Creatives + Audiences | UPD-BE-070 | Creative gallery incl. review-to-ad picker; audience builder with CRM-segment sync |
| UPD-FE-053 | Budget & Spend + Ad Performance + Lead Inbox + Settings | UPD-BE-071 | Spend pacing view; performance funnel with verdict chips; lead inbox with convert-to-customer |

#### Milestone UPD-FE-M21 — Integrations, module 24

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-054 | Accounting Sync + E-commerce Sync | UPD-BE-072, UPD-BE-073 | Account/tax-code mapping screen; e-commerce conflict resolver |
| UPD-FE-055 | Automation Platforms | UPD-BE-074 | Trigger/action template gallery, API-key display, test-trigger |
| UPD-FE-056 | Integration Directory (module 24) | UPD-BE-075 | Full categorised connector grid replacing the current Marketing-only Integrations page |

#### Milestone UPD-FE-M22 — Wave 5 depth screens

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-FE-057 | Sentiment Analysis | UPD-BE-076 | Theme cards with example quotes, trend arrows |
| UPD-FE-058 | Reorder Suggestions | UPD-BE-077 | Suggestion table with accept-all and grouped PO creation |
| UPD-FE-059 | Cash Flow | UPD-BE-078 | Forecast chart with zero-marker, obligation editor, shortfall-action suggestions |
| UPD-FE-060 | Activity Log screen | UPD-BE-079 | Append-only audit table with before/after diff drawer |
| UPD-FE-061 | SEO Heatmap | UPD-BE-080 | Geographic grid heatmap with per-point local-pack detail |
| UPD-FE-062 | Developer & API screen | UPD-BE-081 | API-key management, webhook editor, delivery log with payload viewer |

---

## Phase 3 — Integration

One ticket per module — real end-to-end verification against the running dev servers before moving to the next, same standard as v1's INT-001→INT-015.

| ID | Ticket | Depends | Acceptance criteria |
|---|---|---|---|
| UPD-INT-001 | Dashboard depth | UPD-FE-001–004 | Health score, live activity, AI insights, and action center all reflect real data live against the running backend |
| UPD-INT-002 | POS depth | UPD-FE-005–006 | Held sale resumes into a real completed sale; a real shift opens/closes with correct variance; a real voice-parsed sale posts only after confirm |
| UPD-INT-003 | Orders depth | UPD-FE-007–009 | Draft converts to a real order; a real table split-bill produces correct per-guest totals; a real return reverses stock and refund correctly |
| UPD-INT-004 | Products depth | UPD-FE-010–011 | A real variant set applies across products; a real bundle sells at its bundle price; a real bulk price change applies correctly with preview matching the result |
| UPD-INT-005 | Bookings depth | UPD-FE-012–014 | A real booking request approves into a confirmed appointment; a real waitlist offer converts on cancellation; a real queue token calls/serves correctly; a real deposit captures/forfeits correctly |
| UPD-INT-006 | Credit depth | UPD-FE-015–016 | A real instalment plan's due-today entry is payable; a real transparent link resolves publicly; a real write-off is audit-logged and irreversible via UI |
| UPD-INT-007 | Customers depth | UPD-FE-017–018 | A real punch-card stamp issues on sale and redeems; a real membership charges on schedule; a real memory note persists and displays on the customer profile |
| UPD-INT-008 | Reviews depth | UPD-FE-019 | A real video-testimonial request → upload → approve → post flow completes |
| UPD-INT-009 | Marketing depth | UPD-FE-020–021 | A real automation fires on its real trigger; a real coupon and voucher both redeem correctly at a real sale |
| UPD-INT-010 | Staff depth | UPD-FE-022–024 | A real shift roster publishes; a real timesheet approves with correct overtime; a real advance nets against a real commission payout; a real custom role's permissions are enforced live |
| UPD-INT-011 | Branches depth | UPD-FE-025 | A real stock transfer between two real branches moves inventory correctly on both ends |
| UPD-INT-012 | Inventory depth | UPD-FE-026 | A real stock count's applied adjustments correctly change on-hand quantities |
| UPD-INT-013 | Settings depth | UPD-FE-027–029 | Relabeling one word in the Terminology Engine changes it live across a screen, a WhatsApp template, and a generated PDF simultaneously; a real custom option persists; real 2FA enrollment blocks login without the second factor |
| UPD-INT-014 | Business Listings | UPD-FE-030–032 | A real master-record edit reaches a real connected directory (or fails cleanly on a disclosed placeholder credential); citation audit surfaces a real mismatch |
| UPD-INT-015 | Social Media Management | UPD-FE-033–038 | A real post schedules and publishes to at least one real connected platform; the social inbox receives a real webhook-delivered comment |
| UPD-INT-016 | Competitive Insights depth | UPD-FE-039–041 | Visibility score reflects real component data; a real opportunity is evidence-linked to real underlying data |
| UPD-INT-017 | AI Phone Receptionist | UPD-FE-042–044 | A real test call is answered, transcribed, and produces a real logged outcome (booking, message, or transfer), with the disclosure audible at the start |
| UPD-INT-018 | AI Photo Digitizer | UPD-FE-045–047 | A real photographed document extracts, corrects, and imports into the right destination module as real records |
| UPD-INT-019 | Delivery & Riders | UPD-FE-048–050 | A real delivery assigns to a real rider, tracks live, and completes with real proof-of-delivery captured |
| UPD-INT-020 | Advertising (unified) | UPD-FE-051–053 | A real campaign reaches its provider's real campaign-creation call (or fails cleanly on a disclosed placeholder credential) across at least 2 platforms through the same wizard |
| UPD-INT-021 | Integrations (module 24) | UPD-FE-054–056 | A real accounting/e-commerce sync reaches its real provider call; a real outbound webhook fires and logs delivery |
| UPD-INT-022 | Wave 5 depth screens | UPD-FE-057–062 | Each of the 6 depth screens renders real data against the running backend, not placeholders |
| UPD-INT-023 | Full regression + updated security audit + refreshed deploy checklist | All prior | Mirrors v1 INT-015 exactly: full journey re-walked including new modules; spec §6 checklist re-run against the now much larger surface area (new webhooks, new PII fields, new file uploads all covered); `docs/PRODUCTION_DEPLOY_CHECKLIST.md` updated with every new env var this phase introduced |

---

## Sequencing notes

- Waves are a soft ordering within each phase, not a hard gate — pick whichever module matters most to actual business priorities, same as v1.
- UPD-BE-035 (Roles & Permissions matrix) and UPD-BE-038 (Terminology Engine) are the two cross-cutting tickets — doing them earlier in Wave 2 rather than later reduces retrofitting for every screen built afterward, worth considering even if their module's "wave" position suggests otherwise.
- UPD-BE-074 and UPD-BE-081 share webhook-delivery plumbing (outbound webhooks for automation platforms vs. for developer-API subscribers) — build the shared delivery/retry/logging core once, at UPD-BE-074.
- New external credentials this phase (added to `.env` as disclosed placeholders, same standing pattern): a telephony provider (Twilio Voice or equivalent) for AI Phone Receptionist, a maps/geocoding provider for Delivery routing, plus one new OAuth app registration per additional social/ad/accounting/e-commerce platform connected (Bing Places, Yelp, LinkedIn, Pinterest, Snapchat, Microsoft Ads, Amazon Ads, Reddit, QuickBooks, Xero, Shopify, WooCommerce, Zapier/Make/n8n) — each reuses the existing connector framework, so these are account-registration steps, not new code patterns.

## Verification approach

Unchanged from v1: every BE ticket gets unit tests; every FE ticket gets a manual smoke pass against the shared-state-kit; every INT ticket gets a real end-to-end exercise against the running dev servers (curl + Puppeteer where UI-level, not just typecheck/build) before being marked done; UPD-INT-023 is the final gate re-running the same security checklist and full regression journey from v1's INT-015 against the expanded product.
