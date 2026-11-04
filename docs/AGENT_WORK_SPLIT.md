# Agent Work Split — Codex + Claude Code

Two coding agents work in this same folder, on the same branch, at the same time.
Read this before every task. AGENTS.md still applies in full.

## Ownership

| Area | Owner | Folders the owner may edit freely |
|---|---|---|
| Automations & Workflows (spec 1) | **Codex** | `backend/src/marketing/automations/**`, `frontend/src/app/(app)/marketing/automations/**`, `frontend/src/components/marketing/automations*`, `frontend/src/lib/workflows-api.ts` |
| SEO Autopilot (spec 3) | **Codex** | `backend/src/marketing/seo-*`, `backend/src/marketing/keywords.*`, `backend/src/marketing/jobs/seo-*`, `backend/src/marketing/jobs/keyword-*`, `frontend/src/app/(app)/marketing/seo-autopilot/**`, `frontend/src/components/marketing/seo-*`, `frontend/src/lib/seo-autopilot-api.ts`, `frontend/src/lib/keywords-api.ts` |
| Autonomous Commerce (spec 2) | **Claude Code** | `backend/src/commerce/**`, `backend/src/dashboard/autonomous-commerce-dashboard.*`, `frontend/src/app/(app)/autonomous-commerce/**`, `frontend/src/components/commerce/**`, `frontend/src/components/dashboard/autonomous-commerce-card.tsx`, `frontend/src/lib/commerce-*.ts`, `frontend/src/lib/product-*-api.ts`, `frontend/src/lib/autonomous-commerce-api.ts` |
| Module selection (each business picks its own modules) | **Claude Code** | Settings/onboarding module-picker code |

Never edit files in the other agent's folders. If you need a change there, write it under
**Requests** below and let the owner do it.

## Shared files — edit carefully

These files are edited by both agents. Rules: re-read the file right before editing, make the
smallest possible edit, only add inside your own section, never reformat or reorder the rest.

| File | Rule |
|---|---|
| `backend/prisma/schema.prisma` | Add your models in your own block (`Workflow*`/`Seo*` = Codex, `Commerce*`/`Product*` = Claude). Enum values: add, never rename or remove. |
| `backend/prisma/migrations/` | Never touch the other agent's migrations. Name new ones with the real current time (`YYYYMMDDHHMMSS`) so they never collide. Hand-write SQL + `prisma db execute` + `migrate resolve --applied` (see AGENTS.md); never `migrate dev`. |
| `enum WorkflowTriggerKey` + `workflow-trigger-catalog.ts` | **Codex owns.** If Commerce needs a new trigger, add a request below. |
| `frontend/src/lib/nav-items.ts`, `frontend/src/lib/i18n.ts` | Only add lines inside your own module's section. |
| `backend/src/common/tenancy/tenant.constants.ts`, `backend/src/common/capabilities/capabilities.constants.ts`, `backend/src/app.module.ts` | One-line additions only. |

## Git

- Neither agent runs `git commit`, `stash`, `reset`, `checkout`, `rebase`, or `pull` on its own.
  The human commits at checkpoints, after both agents have stopped.
- Never revert or "clean up" a change you did not make, even if it looks unfinished — the other
  agent is probably mid-edit.

## Testing

- While working: run only your own focused tests (`npx jest <your spec files>`).
- Before saying a task is done: `npx tsc --noEmit` (backend + frontend) and the full `npx jest`.
  A failure in the other agent's files is theirs to fix — report it under **Requests**, do not
  fix it yourself.

## Current queue

Work top to bottom. Mark an item `✅` when its full done-check (AGENTS.md §2) passes.

**Codex**
1. Automations — real dead-letter queue: exhausted runs land in a DLQ record with evidence, owner and
   next action; operator can retry, resolve (with reason) or dismiss; every decision audited. Wire it
   into the existing Recovery Center page.
2. Automations — Versions & rollback: restore a workflow to an earlier published version (the
   running version stays pinned for in-flight runs).
3. SEO — Keyword Intelligence screen (`/marketing/seo-autopilot/keywords`) on top of the existing
   keywords service: portfolio, intent, target-page mapping, cannibalization flags.
4. SEO — Rank Tracking screen on top of the existing rank snapshots/processor.

**Claude Code**
1. ✅ Commerce — Channel Listings page.
2. ✅ Commerce — Fulfillment Network (nodes, product mappings, coverage).
3. ✅ Commerce — Fulfillment Router (per-order source selection using the network).
4. ✅ Commerce — Production & Assembly.
5. Module selection — each business chooses its own modules.

**Handover (2026-09-30): Claude Code has stopped. Codex now owns Autonomous Commerce and module
selection too, and continues Claude's remaining items (4 and 5) after its own queue.** Notes:
- Built by Claude, all with real-MySQL specs: Channel Listings page, Fulfillment Network
  (`commerce-fulfillment.*`), Fulfillment Router (`commerce-fulfillment-router.*`).
- Not yet verified in a browser (no test login was available): `/autonomous-commerce/channel-listings`,
  `/autonomous-commerce/fulfillment-network`, `/autonomous-commerce/fulfillment-router`.
- Commerce migrations added: `20260930211343_commerce_fulfillment_network`,
  `20260930213031_commerce_fulfillment_router` (both applied locally).
- Honest limits already disclosed in the UI (keep them true if you extend): external-node stock is
  not tracked, routes don't reserve stock or change order status, orders have no structured
  destination country, promise dates are not tracked.

## Requests (agent-to-agent)

Add one line per request: `[from → to] what is needed, and why`. Delete the line when done.


## Progress log (6-hour goal, Claude Code — Codex stopped 2026-10-01 ~02:13)

Goal items: (1) stabilise + checkpoint commit, (2) Production & Assembly, (3) Risk & Compliance,
(4) B2B & Wholesale, (5) Subscriptions & Pre-orders, (6) Store Optimizer, (7) Experiment Lab,
(8) module selection. Local commits only, never push.

- 02:15 — started item 1.
- ~02:40 — item 1 ✅: removed 2 empty migration folders left by Codex, applied 20261001003100_seo_serp_page_overlap, fixed DLQ spec type + made resolve/dismiss async; tsc clean, jest 305/1973 green. Checkpoint commit 55c760f (local, not pushed).
- item 2 ✅ Production & Assembly: BOM versions, work orders, atomic component consumption + finished-goods receipt as new stock movement kinds (production_consume/production_output, Inventory UI updated), quality hold/release, migration 20261001022339. jest 306/1980 green.
- item 3 (Risk & Compliance) implementation complete in local checkpoint. The MySQL migration
  `20261001023455_commerce_risk_compliance` is applied; the fixture now supplies unique customer phones.
  The page at `/autonomous-commerce/risk-compliance` has Risk Cases, Rules & Policies, Documents, and
  Market Eligibility tabs. It wires real data/actions, decision audit history, nav and i18n. The UI
  explicitly discloses that provider fraud/chargeback feeds, order holds, document uploads/authenticity
  checks, and legal verification are not configured.
  - Focused MySQL tests: 12/12 passed. Backend + frontend type checks and touched-file lint passed.
  - Full Jest: `npx jest --maxWorkers=2` passed 307 suites / 1987 tests. Default parallel mode had a
    resource-sensitive Marketing Assets timeout; serial mode timed out unrelated suites, so two workers
    was the stable full-suite run.
  - Prisma reports all 128 migrations applied and the schema up to date.
  - Visual check is pending: the local browser now opens, but the app redirects to `/login`; waiting for
    the user to sign in (without sharing credentials) before verifying the protected screen.
- Remaining queue after item 3: (4) B2B & Wholesale, (5) Subscriptions & Pre-orders, (6) Store Optimizer,
  (7) Experiment Lab, (8) module selection. Codex owns everything from here.

## Progress log — goal #2 (Claude Code, started 2026-10-01 ~10:15)

Items: (1) B2B & Wholesale, (2) Subscriptions & Pre-orders, (3) Store Optimizer, (4) Experiment Lab,
(5) module selection. Local commits only, never push.

- item 1 ✅ B2B & Wholesale: tiers, price lists (overlay, never changes product price), accounts on CRM
  customers, canonical credit via v_credit_balances, quote price-check (formal quotes stay in Orders),
  reorder estimate. Migration 20261001114247_commerce_b2b_wholesale (10 FKs verified). Also typed an
  empty-array fallback in notifications.service.ts that became `never` after the Prisma client grew.
  jest 308/1992 green.
- item 2 ✅ Subscriptions & Pre-orders: plans, subscriptions, idempotent renewal cycles that create canonical
  unpaid Orders via OrdersService (CommerceModule now imports OrdersModule — full app DI graph verified in
  Nest preview mode, with a negative control), skip/pause/cancel, pre-order campaigns with an atomic
  reservation cap, promise-date changes audited, promise risk from stock + Production work orders.
  Migration 20261001115855 (15 FKs verified). jest 309/1998 green (one earlier order-policies flake
  passed on rerun and alone).
- item 3 ✅ Store Optimizer: 6 explainable rules over real data (missing photo, no category, high return
  rate with top reasons, out of stock with demand, priced below cost, approved listing not sent). Findings
  are deduped; "verified fixed" is set only by a re-check that no longer finds the problem (never by a
  button); dismiss needs a reason and stays dismissed. Conversion/drop-off/search/mobile shown as "Not
  tracked" (no storefront traffic data exists — grep-verified). Never edits the live store; links to
  where each fix happens. Migration 20261001123000 (3 FKs verified). jest 310/2001 green.
- item 4 ✅ Experiment Lab: honest before/after experiments on one product (no storefront traffic → not
  a randomized A/B test; conversion "Not tracked"). Test window vs an equal-length baseline on real
  orders/returns (units, revenue, gross margin, return rate); a read only after 7 days + 10 units per
  window, never called significant; optional margin guardrail; one running experiment per product;
  product price snapshotted at start/stop (flags a price test whose price never changed); results frozen
  at stop; adopt/revert/inconclusive needs a note; full audit trail. Never edits prices/listings.
  Migration 20261001133000 (3 FKs verified). jest 311/2003 — marketing-assets + qr-poster (PDF render
  timeouts under load, untouched code) failed once in the full run and passed on isolated reruns.
- item 5 Module selection per business (implementation present; full DoD not yet met): Settings →
  Modules category has an owner-only toggle per top-level module, grouped Core / Growth & channels /
  AI, with history via the hub. Stored as
  `Business.disabled_modules` (OFF list, so new modules default on) on the ROOT business — every branch
  shares it. GET /business-modules (read-only, any signed-in user) feeds the sidebar (hidden items keep
  their divider/section label) and a page gate that shows "X is turned off" instead of the page
  (owner gets a link back to Settings → Modules); the floating AI assistant hides when AI Assistant is
  off. Dashboard + Settings are always on. Hiding never deletes data and never blocks cross-module
  data flow (it is a visibility choice, not an API permission). Migration 20261001140000 (JSON NOT
  NULL DEFAULT JSON_ARRAY(), 0 null rows). DI graph verified in Nest preview mode.
  jest --maxWorkers=3: 311/312 suites, 2004/2006 tests — the only failure is reviews/qr-poster (its own
  15 s timeout on a headless-Chromium PDF render; flips pass/fail between isolated runs on this loaded
  machine, also failed once before this item; untouched code). Default-worker runs showed more
  timeout-only failures in other untouched suites, all passing in isolation.
- Implementation pass complete; verification remained open because there was no test login at the time.

## Verification follow-up — 2026-10-01

- The current worktree contains an uncommitted module-selection implementation (Settings toggles,
  onboarding step/API, sidebar and dashboard filtering, and authenticated backend API gating). No
  application functionality was changed during this verification pass.
- Authenticated browser smoke checks now load Risk & Compliance (all four tabs), B2B & Wholesale
  (accounts and tiers), Subscriptions & Pre-orders (subscriptions, plans and pre-orders), Store
  Optimizer (To do and All), Experiment Lab, and Settings → Modules. These were read-only; no
  business data or module setting was changed. Settings displayed 12/12 Core, 9/9 Growth & channels,
  and 8/8 AI modules on, with changes saved. The browser's screenshot capture failed, so this is
  semantic UI verification only; pixel comparison and console/network inspection remain open.
- Current checks: backend and frontend `npx tsc --noEmit` pass; touched-file ESLint passes; the three
  module-selection Jest specs pass (28/28); `npx prisma migrate status` reports 133 migrations and
  the database schema up to date.
- Full backend Jest is not green. With `--maxWorkers=2`: 312/314 suites and 2027/2031 tests passed;
  four PDF/QR rendering tests timed out. With `--maxWorkers=1`: 312/314 suites and 2028/2031 tests
  passed; the QR poster PNG test timed out, and Marketing Assets had one render timeout plus a
  reproducible assertion failure (`Popular right now` appears when the test expects no products).
  The Marketing Assets and QR-poster files are outside the current worktree changes. The isolated
  Marketing Assets suite reproduces its timeout and assertion failure.
- Do not mark module selection ✅ or commit it until the full Jest gate is green and the browser
  visual/console checks are completed. No new migration was added in this verification pass.

## Progress log — goal #3 (Claude Code, started 2026-10-02; Codex stopped, Claude owns all areas)

Items: (1) finish module selection, (2) commerce dashboard coverage + kill switch, (3…) SEO Autopilot
screens, then Automations gaps. Local commits only, never push.

- item 1 ✅ Module selection finished. Kept Codex's onboarding module step, dashboard/widget filtering,
  PATCH /business-modules/selection (owner only) and the API guard, but narrowed the guard: it now uses
  `gatedModuleForApiPath`, which never blocks shared business data (`SHARED_DATA_API_PREFIXES`:
  products, customers, orders, returns, sales, cash, credit, stock, staff, branches, generic AI, media,
  integrations…). Before this, turning Products/Customers/Credit off broke Fast Sale. The most specific
  prefix still wins, so module-only features under a shared root (e.g. ai/what-if) stay gated.
  Settings → Modules copy now says exactly that. Guard spec covers Fast Sale's real API roots.
  jest --maxWorkers=3: 314/314 suites, 2050/2050 tests (incl. Codex's PDF-test timeout bumps).
- item 2 ✅ Commerce dashboard coverage + kill switch. Dashboard summary gains `operations`: live counts
  from every newer screen (open RFQs, listings to approve, work orders/quality holds, risk cases, B2B
  accounts, due renewals/pre-orders, store fixes, experiments) shown as a linked "Work queues" panel
  on the dashboard card. Kill switch = owner-tunable policy `commerce.actionsPaused` (Settings →
  Automations → Autonomous Commerce, requires commerce.manage, history via the hub) enforced by
  `assertCommerceNotPaused` (HTTP 423, COMMERCE_ACTIONS_PAUSED) in channel sync, AI listing generation
  and subscription renewals; reading and manual record keeping keep working. Commerce pages show a
  Pause/Resume banner that saves through the same Settings API. No migration (policies JSON column).
  jest --maxWorkers=3: 314/314 suites, 2051/2051 tests.
- item 3 ✅ SEO On-Page (screen 4, /marketing/seo-autopilot/on-page). Pages from the latest site audit
  with real open on-page issues, mapped keyword, last optimized and latest revision. Versioned
  `SeoContentRevision` proposals (title / meta description / H1; manual, AI draft or restore) →
  approval (reject needs a reason) → merchant applies on their own site → `verified` only when a
  later crawl sees every proposed value live (checked after each audit and on demand). Crawler now
  records the first H1's text so H1 changes are verifiable. Honest gaps: no website publishing
  (Noxtill doesn't host sites), organic performance not tracked (no Search Console), internal-link
  opportunities not tracked (link graph not stored). Added an SEO tab bar (layout) for all SEO screens.
  Migration 20261002100000 (2 FKs verified). jest --maxWorkers=2: 315/315 suites, 2054/2054 tests
  (a --maxWorkers=3 run on the loaded machine had 4 timeout/contention failures in untouched suites,
  all passing alone).
- item 4 ✅ SEO Technical (screen 5, /marketing/seo-autopilot/technical). KPIs from the latest crawl:
  critical technical issues, indexable pages, sitemap coverage (crawler now records `inSitemap` per
  page; null = no readable sitemap → shown "Unknown", never 0%), broken links, canonical conflicts,
  redirected pages. Tabs: grouped technical issues, redirects, canonicals, changes, not tracked.
  `SeoTechnicalAction` proposals (redirect / canonical / index-noindex / sitemap / robots / other) with
  spec risk bands (robots + noindex high), pre-approval validation re-run at every gate (self-loop,
  cross-proposal loop, chain, 4xx/noindex destination, other domain, homepage noindex), approval with
  rejection reasons, merchant applies, crawl verification (redirect/canonical/noindex/sitemap; robots &
  other recorded as not verifiable). Not tracked (grep-verified): structured data, Core Web Vitals,
  hreflang/rendering, re-index requests. Migration 20261002120000 (2 FKs verified; an empty migration
  record created by a failed script was deleted from _prisma_migrations before re-applying).
  jest --maxWorkers=2: 316/316 suites, 2057/2057 tests.
- item 5 ✅ SEO Content (screen 6, /marketing/seo-autopilot/content). Opportunities derived live from
  tracked keywords + latest rank snapshot + latest crawl + briefs (new page / mapped page missing or
  4xx / ranking worse than #10 or not found), each with its evidence; interest shown as Google Trends'
  relative index, never volume; no invented scores. `SeoContentBrief` (manual or AI brief — internal
  links limited to crawled URLs; duplicate keyword intent blocked without a strategy note) → draft
  (manual or AI from merchant source notes only) → approval (send-back needs a reason) → merchant
  publishes and records URL → crawl confirms live. Refresh queue: published content whose keyword fell
  5+ places since publishing (baseline vs current shown). Dismiss/reopen opportunities with reasons.
  Not tracked (grep-verified): page traffic. Migration 20261002140000 (4 FKs verified).
  jest --maxWorkers=2: 316/317 suites, 2059/2060 tests — the one failure was a 5 s timeout in the
  untouched digitizer spec under load; it passes 47/47 alone.
- item 6 ✅ SEO Local (screen 7, /marketing/seo-autopilot/local). Per-location view across the root
  business and active branches; listing completeness from MasterListing, field-mapped citation
  snapshots from successful Noxtill syncs, 90-day ExternalReview aggregates, local-intent keyword
  movement, latest local-pack heatmap scan, and city mentions in saved crawl title/description/H1.
  Listing fixes deep-link to Business Listings; review records remain in Reviews; no listing or review
  mutations from SEO. Local schema is disclosed as not tracked. Local-page briefs use the existing
  SeoContentService. No new schema models or migration. Real-MySQL spec: 2/2; backend/frontend
  `tsc --noEmit`, touched-file ESLint, full backend Jest (`--maxWorkers=2`: 318/318 suites,
  2062/2062 tests), and fabrication grep passed. Signed in to the local app and visually verified the
  rendered page; frontend route and API data loaded successfully.
- item 7 ✅ SEO Off-Page (screen 8, /marketing/seo-autopilot/off-page). Added tenant-scoped manual
  backlink observations, prospect records, and append-only decision audits; normalized URLs and
  deduplication, lost/dismiss decisions requiring reasons, tracking state, and routing prospects to
  Guest Posting or Link Building. Referring-domain/new/lost/risk-note figures are computed only from
  merchant-entered records. No backlink or authority provider exists: provider-wide backlink data and
  authority trend show “Not configured” / “Not tracked”; opportunity scoring shows “Not assessed”.
  Verified no fabricated metrics. Migration 20261002160000 kept exactly 6 table/FK statements, applied
  locally, with all 3 business FKs verified in information_schema; migration status is up to date.
  Real-MySQL spec: 2/2; backend/frontend `tsc --noEmit`, touched-file ESLint, `npm run build`, and
  full backend Jest (`--maxWorkers=2`: 319/319 suites, 2064/2064 tests) passed. Signed in to the local
  app and visually verified the page and live API data. Stale overview copy now points to the manual
  Off-Page evidence rather than implying provider data is available.
- item 8 ✅ SEO Guest Posting (screen 9, /marketing/seo-autopilot/guest-posting). Added tenant-scoped
  publication prospects, pitch/topic/article workflows, approval gates, manual outreach and reply
  recording, merchant-confirmed placement evidence, and append-only audit history. AI drafts only use
  merchant-provided source notes; Noxtill does not discover publications, send outreach, or crawl
  third-party placements. Provider/sending limitations are disclosed in the screen. Migration
  20261002170000 kept exactly 7 table/FK statements, applied locally, with all 4 foreign keys
  verified in information_schema; migration status is up to date. Real-MySQL spec: 2/2; backend and
  frontend `tsc --noEmit`, touched-file ESLint, backend build, and full backend Jest (`--maxWorkers=2`:
  320/320 suites, 2066/2066 tests) passed. Signed in to the local app; visually verified the live
  page and Add Publication form without saving sample data.
- item 9 ✅ SEO Link Building (screen 10, /marketing/seo-autopilot/link-building). Added a manual
  prospect-to-placement workflow with ownership, merchant-evidence-based qualification, outreach
  draft and approval, manual send/response recording, accepted placement confirmation, lost-link
  recovery, and decision audit history. Link records are created only after merchant-confirmed URLs
  and evidence; same-site targets use the latest saved crawl when available. Noxtill does not discover
  prospects, send outreach, crawl third-party pages, or provide backlink/authority metrics; these
  limits are shown in the UI. Migration 20261002153427 kept exactly 4 statements, applied locally,
  with the won-link FK verified in information_schema; Prisma schema validation passes. Real-MySQL
  spec: 4/4; backend/frontend `tsc --noEmit`, touched-file ESLint, and full backend Jest
  (`--maxWorkers=2`: 321/321 suites, 2070/2070 tests) passed. Authenticated local page and Add
  Opportunity form were visually checked without saving sample data.

## Split — goal #4: finish SEO Autopilot 100% (both agents, from 2026-10-02 afternoon)

| Owner | Work | Files the owner may edit |
|---|---|---|
| **Codex** | (1) Fix migration order: rename `20261002153427_seo_link_building_workflow` to a timestamp after `20261002160000` (it FKs `seo_off_page_links`, created by `…160000_seo_off_page`, so a fresh DB fails); update `_prisma_migrations.migration_name` to match; `prisma migrate status` clean. (2) Finish Competitor SEO (screen 11): UI, DB spec, done-check, commit. (3) Browser QA of every SEO screen + the newer Commerce pages (logged in): load, empty states, console/network errors, one real create→approve flow per screen with obviously-named test data deleted afterwards. Report bugs under Requests with screen + steps. | `backend/src/marketing/seo-competitor*`, `seo-off-page*`, `seo-guest-posting*`, `seo-link-building*`, `seo-local*`, their migrations, matching frontend views/api files |
| **Claude Code** | Screens 13 Content Calendar, 14 Agent Workspace, 15 SEO Reports, 16 SEO Settings — built without new database tables where possible (read models over existing SEO records + `Business.policies` for settings). Fix bugs Codex reports in On-Page / Technical / Content. | new `backend/src/seo-workspace/**` Nest module (registered in `app.module.ts`), `frontend/src/components/marketing/seo-{calendar,workspace,reports,settings}-view.tsx`, `frontend/src/lib/seo-{calendar,workspace,reports,settings}-api.ts`, their routes, `seo-on-page*`, `seo-technical*`, `seo-content*` |

Shared files (re-read right before editing, smallest possible edit, never reformat): `schema.prisma`,
`tenant.constants.ts`, `marketing.module.ts` (Claude does NOT touch it — uses its own module),
`seo-autopilot-tabs.tsx`, `app/(app)/marketing/layout.tsx`, `policies.constants.ts`, settings-hub files.
Commit with explicit paths (`git add <your files>`), never `git add -A`. If a shared file holds the
other agent's unfinished hunk, don't commit that file — ask under Requests. Never push.
- goal #4 / Claude item 1 ✅ SEO Content Calendar (screen 13, /marketing/seo-autopilot/content-calendar).
  New `backend/src/seo-workspace/` module (registered in app.module.ts; MarketingModule untouched).
  Schedule view over the canonical `SeoContentBrief` records — no new table, no second workflow:
  calendar (month grid by due date / publish date), list and pipeline views; KPIs due this week
  (incl. overdue), briefs ready, drafting, awaiting approval, scheduled (approved + dated), refresh due
  (same rank-drop rule as the Content refresh queue). Reschedule and assign (active team members only)
  for open items, both audited in `seo_content_brief_audits`. Status changes stay in Content SEO
  (deep link `?brief=<id>` now opens the brief there). Task linking disclosed as not available (no
  Projects & Tasks module exists). Real-MySQL spec 2/2; backend+frontend tsc, eslint, full backend jest
  (--maxWorkers=2: 322/322 suites, 2072/2072 tests).
- goal #4 / Claude item 2 ✅ SEO Agent Workspace (screen 14, /marketing/seo-autopilot/agent-workspace).
  Read-only queue over existing SEO action records (audit findings first seen in the last 7 days,
  On-Page revisions, Technical changes, Content briefs) grouped by stage: new → draft ready → waiting
  approval → ready to apply → verification required → not matched (latest crawl disagrees) → completed
  (last 30 days). Approve / reject / send back call each owning screen's API, so their rules and audit
  trails apply — the workspace adds no state. Decision history merges the four audit trails. Expected
  impact disclosed as not estimated; each item shows its origin (AI draft / team / site audit) instead
  of an invented confidence score. Links out to Local / Off-Page / Guest Posting / Link Building /
  Competitor queues. Real-MySQL spec 2/2; tsc, eslint, full jest (--maxWorkers=2: 324/324 suites,
  2078/2078 tests).
- goal #4 / Claude item 3 ✅ SEO Reports (screen 15, /marketing/seo-autopilot/reports). Compares the
  last 7/30/90 days with the period before, only from records Noxtill holds: tracked keywords in the
  top 10 / top 3 and rank distribution (latest check before each period end), site-audit issues (all
  and high), content published, new external reviews and their average, merchant-recorded backlinks,
  SEO changes confirmed live. Each metric carries source, freshness and caveat; changes are labelled
  correlation, not cause. Organic clicks/impressions, conversions/revenue and landing-page traffic are
  listed as not tracked; rank caveat states checks use SerpApi's default location/device (verified in
  serp-rank.service.ts). Client-side CSV export; scheduled delivery disclosed as not available.
  Real-MySQL spec 2/2; tsc, eslint, full jest (--maxWorkers=2: 324/325 suites, 2079/2080 — the one
  failure was qr-poster PDF timeouts while two runs overlapped; it passes 5/5 alone).
- goal #4 / Claude item 4 ✅ SEO Settings (screen 16, /marketing/seo-autopilot/settings). New Settings
  hub category "SEO Autopilot" (history, reset, permission = seo.manage) with three real policy keys and
  their consumers: `seo.aiDraftsEnabled` (L1 draft vs L0 observe — On-Page suggest and Content
  brief/draft generation refuse with SEO_AI_DRAFTS_OFF when off), `seo.improveBelowRank` (Content
  "improve page" opportunities, default 10), `seo.refreshDropPositions` (Content refresh queue and
  Calendar, default 5) — defaults preserve previous behaviour. Read-only rows: approval always required
  (L3/L4 auto-apply not available), rank provider configured or not (boolean only, never the key),
  Search Console not connected, outreach identity not available. The SEO Settings screen shows setup
  checks / configuration health, site, market and autopilot level, and edits the hub rows in place.
  Also fixed a duplicated Reports tab/subtitle in HEAD (my line-staging re-added a line Codex's
  competitor commit had already included). Real-MySQL spec 2/2; related suites 32/32; tsc, eslint,
  full jest (--maxWorkers=2: 326/326 suites, 2082/2082 tests).
- goal #4 (Claude part) complete: screens 13–16 committed.

## Progress log — goal #5 (Claude Code): Autonomous Commerce shared layer

- item 1 ✅ Commerce work in the Dashboard Action Center. New `ActionItemType.commerce` (entityId
  `<kind>:<id>`) synthesized live from commerce records: listing drafts awaiting review, stopped
  experiments awaiting a decision, open high-severity risk cases (urgent), work orders on quality hold
  (urgent), due subscription renewals; dismiss/snooze work through the existing ActionItemState; hidden
  when the business turned Autonomous Commerce off; staff still see only their complaints. Commerce
  dashboard: stale "commerce_approvals not in Action Center" disclosure removed and replaced with a real
  `approvals.commerceItemsWaiting` count shown on the card. Migration 20261002200000 (enum MODIFY,
  verified in information_schema). Real-MySQL spec 2/2; full jest (--maxWorkers=2: 327/327 suites,
  2084/2084 tests).
- item 2 ✅ Commerce dashboard net sales + contribution. New `profitability` block (trailing 30 days):
  gross = completed order totals; refunds = approved returns on those same orders (allocated to the
  order's period); net sales = gross − refunds; contribution = net sales − recorded order-line cost −
  recorded Delivery.deliveryCost. Always reported `incomplete` with named missing components (payment
  fees, marketplace fees, ad spend — not recorded per order; plus counts of order lines with zero cost
  and deliveries with no cost model). Ad spend excluded because provider stat windows differ (Meta
  stores last-30-day rollups). Stale `net_sales_after_refunds` / `contribution_profit_and_margin`
  disclosures removed. Real-MySQL spec covers refunds (pending excluded), zero-cost line, delivery cost.
  Full jest (--maxWorkers=2: 327/327 suites, 2085/2085 tests).
- item 3 ✅ Commerce Agents & Tools (/autonomous-commerce/agent-tools). Registry of 18 spec tools
  (§11.1) with risk class (§11.2), minimum autonomy level and approval rule. New policy
  `commerce.autonomyLevel` (0–5, default 1 = observe; Settings → Automations → Autonomous Commerce,
  editable from the page too). Gate: level below the class minimum → refused; commerce kill switch →
  only READ_ONLY allowed; write tools not yet wired for agents → refused with the screen to use.
  Five READ_ONLY tools execute through existing services (get_product, get_inventory, get_order,
  compare_quotes via CommerceRfqsService, calculate_fulfillment_route via the router — nothing
  assigned). Every attempt audited in `commerce_agent_tool_runs` (succeeded / refused / failed,
  correlation id, duration). UI states no commerce agent runs on its own yet (grep-verified: no
  commerce schedulers/processors). Migration 20261002210000 (1 FK verified). Real-MySQL spec 2/2;
  full jest (--maxWorkers=2: 327/328 suites, 2086/2087).
- [Claude → queue owner] `src/common/queue/queue.integration.spec.ts` fails now that local Redis is
  running (it used to skip): "Nest could not find BullQueue_demo-dlq" — the test module never
  registers the demo DLQ queue. Pre-existing; not caused by goal #5.
- item 4 ✅ Channel-listing reconciliation (spec §13.2), on the Channel Listings page. "Check stores
  now" reads each connected provider's products (Shopify / WooCommerce `fetchProducts`: SKU + stock
  only) and compares them by SKU with synced `CommerceChannelListing`s: missing_on_provider,
  stock_mismatch (both quantities stored), no_sku. Never overwrites canonical data; items are resolved
  or dismissed with a required note; runs are recorded as completed / failed (provider read error) /
  skipped (not connected, no product-read capability, no token). UI states price, title, description
  and images are not checked (grep-verified: no connector reads them back). Migration 20261002220000
  (3 FKs verified). Real-MySQL spec 2/2 (fake connector). Full jest (--maxWorkers=2): 326/329 suites —
  queue.integration (pre-existing, logged above) plus health-score and booking-link stalls (~380 s
  under load) that pass 8/8 alone.
- goal #5 complete: Action Center commerce items, net sales/contribution, agent tool registry,
  reconciliation.

## Progress log — goal #6 (Claude Code): Automations & Workflows

- items 1+2 ✅ (one commit; they share nav/i18n/layout lines). Command Center
  (/marketing/automations/command-center, GET /workflows/command-center): active/paused workflows,
  runs in 24 h by status and failure rate, waiting runs and waits past their resume time, approvals
  waiting (oldest 5), open Recovery items, next 5 scheduled runs, recent failures with errors, and live
  BullMQ counts of the shared workflow-schedule queue (platform-wide, labelled; unreachable Redis is
  flagged). Run cost and business value disclosed as not tracked. Approvals inbox
  (/marketing/automations/approvals) over the existing approval API: waiting / approved / rejected /
  cancelled tabs, steps that run on approval, decision notes; delegation, escalation and four-eyes
  disclosed as not available. Real-MySQL spec 2/2.
  Also fixed Codex's report: SEO AI drafts (On-Page suggest, Content brief + draft) now return
  SEO_AI_NOT_CONFIGURED (503, clear message) when no AI provider key is set, and SEO_AI_FAILED for other
  provider failures, instead of a generic 500 (unit spec 3/3). Full jest (--maxWorkers=2): 329/331 —
  queue.integration (pre-existing) and qr-poster timeout (known flake).
- items 3+4 ✅ Schedules & Queues (/marketing/automations/schedules, GET /workflows/schedules-overview):
  every scheduled workflow with rule, timezone, next run (overdue flagged), last schedule and last run;
  durable waits with resume time (past-due flagged); live shared-queue counts; fixed platform limits
  stated from the code constants (≥15-minute schedules, waits ≤ 7 days, one shared queue/worker, no
  per-workflow concurrency settings). Visual Builder (/marketing/automations/builder): SVG canvas of the
  stored graph (or the equivalent graph derived from the step list for older workflows) laid out by
  longest path, yes/no condition ports, keyboard-selectable nodes and an inspector (trigger/schedule,
  conditions, action JSON). Read-only by design: editing stays in the workflow editor (one condition
  branch); copy states the engine accepts any acyclic graph (verified in workflow-graph.util.ts) and
  that drag-and-drop, loops, parallel branches and sub-workflows aren't available. Real-MySQL spec 3/3;
  full jest (--maxWorkers=2): 330/331 — queue.integration (pre-existing).
- fix ✅ (Codex report) native `window.prompt` / `window.confirm` replaced by in-page dialogs: new
  `askText()` / `askConfirm()` (lib/ask-dialog.ts, zustand) rendered by one `AskDialogHost` in the app
  shell. Converted every prompt/confirm in Claude-owned screens: Subscriptions & Pre-orders (pause,
  cancel, promise date + reason, reservation cancel), Store Optimizer, Reconciliation, Commerce pause
  banner, Risk & Compliance, SEO On-Page / Technical / Content / Workspace. Reason minimums are enforced
  in the dialog. Frontend tsc + eslint clean (frontend-only change).
- item 5 ✅ Versions & Environments (/marketing/automations/versions), frontend over existing APIs:
  version list with restore (reason required, optimistic-concurrency precondition, restored as a new
  version), field-by-field diff of any two stored versions (name, trigger, schedule, conditions, each
  step, graph size), dry-run of the current version against the latest real matching event (existing
  test endpoint; nothing sent). Environments panel counts variables per environment and states the
  truth: every run uses production variables (verified: trigger/workflows services hard-code
  `environment: 'production'`), so staging runs and promotion are not available. "In-flight runs keep
  their version" verified (WorkflowRun.workflowVersion is reloaded on resume). Frontend tsc + eslint.
- item 6 ✅ Governance (/marketing/automations/governance). New policies `automations.maxActiveWorkflows`
  (null = no limit) and `automations.requireApprovalBeforeCustomerMessages`, editable in Settings →
  Automations (history/reset) and on the page; enforced by `assertAutomationGovernance` in
  WorkflowsService.update (switching on, or changing an active workflow), version restore, and the
  Settings on/off toggle. Approval rule walks every path of the graph (or the step list) and refuses any
  customer message reachable without a prior "Request approval" step. Audit trail endpoint
  (GET /workflows/governance-audit): version saves (author not recorded — stated), approval decisions
  with decider and note, Recovery decisions with actor. Permissions copy states only what is verified
  (owner + manager hold automations.manage; staff don't). Quotas, retention settings and security scans
  disclosed as not available. Specs: governance 4/4, command center 4/4; full jest (--maxWorkers=2):
  331/332 — queue.integration (pre-existing).
- goal #6 complete (6 items).
- goal #7 (Claude) — remaining Automations gaps:
- item 1 ✅ Inbound webhooks (97190bd). `inbound_webhook` trigger; per-workflow secret URL
  (POST /public/workflow-hooks/:token, only the sha256 is stored, URL shown once, rotate/disable);
  32 KB JSON-object bodies; dedupe by Idempotency-Key or body hash; every call logged
  (accepted / duplicate / workflow_inactive / payload_rejected / failed) with replay. Top-level scalars
  become `body_<key>` fields for conditions and templates. Screen /marketing/automations/webhooks.
  HMAC signing and custom responses disclosed as not available. Spec 3/3.
- item 2 ✅ Sub-workflows. `sub_workflow` trigger ("Run by another workflow") + `run_workflow` step.
  Saved only when the target is a non-archived sub-workflow of the same business and not itself
  (create, update, version restore); re-checked at run time (paused target → skipped, reported).
  Child run gets the caller's scalar values as `parent_<key>`, its customer, parentRunId/WorkflowId and
  callDepth; nesting stops at 3 levels; event id `subflow:<runId>:<step>` so a retried step reuses the
  child run. The step starts the child and does not wait for it. Dry-run preview and approval
  summaries added. Also fixed: approval summaries showed "Unsupported action (will not be executed)"
  for AI-draft and get-variable steps, which do run (no stored approvals held that text). Migration
  20261003000000 (3 enum MODIFYs). Specs: sub-workflows 5/5; full jest (--maxWorkers=2) 2110/2111 —
  the one failure was the action-catalog list, updated and passing.
- item 3 ✅ AI agent step + AI Agents screen (/marketing/automations/agents). New `ai_agent` step:
  goal (templated, ≤2000 chars), chosen read-only tools (customer profile, customer orders, run
  values — no arguments, scoped to the run's business and customer, so injected text can't widen
  access), 1–5 model calls of ≤800 output tokens through AiInfraService (rate limit, monthly cost cap,
  AI Settings toggle, call log). A tool the step didn't allow is refused and recorded as blocked.
  Answer saved as {{agentAnswer}} for later steps; never sends or writes. Dry-run, approval summary,
  catalog entry. Screen lists workflows with agent steps, their config and real 30-day stats from run
  results (runs, answered, failed, tool calls, blocked, tokens) plus the month's workflow AI calls/cost
  (shared with AI drafts — stated). Disclosed: no agent profiles, memory, handoffs, write tools,
  evaluations, playground or model choice. AI Settings / Settings hub toggle renamed "Workflow AI
  drafts & agents" (it gates both). Specs: agent 3/3; full jest 2114/2114.
- goal #7 complete (3 items). Note for whoever owns AI infra: `ai/claude.client.ts` DEFAULT_MODEL is
  `claude-3-5-haiku-20241022`; check it is still served before go-live.
- goal #7 QA (Codex, browser, QA Test Business): webhooks (accept, duplicate, invalid body, replay,
  rotation), sub-workflows (child run with callDepth 1 + parent fields; paused child skipped) and the
  AI Agents screen/toggle warning all pass. AI agent answer + toolCalls not verifiable live: no
  ANTHROPIC_API_KEY on the server (expected "not configured" error shown); that path is covered only by
  workflow-agent.db.spec.ts with a fake provider. QA data left in place (incl. a $9 test sale).
- Claude ✅ Email campaign tracking (2026-10-03). Campaign sends now include an HTML part (needed for
  provider open/click tracking) and store Resend's message id on the `sent` EmailEvent
  (`provider_ref`). The existing email webhook (`POST /webhooks/email?token=`) now also records
  campaign `delivered` / `open` / `click` / `bounce` events, once per sent email; List health "Bounced"
  is a real count (was hard-coded 0). Email screen shows Delivered and states where the numbers come
  from. Migration 20261003100000 (enum + column + index). Checklist corrected: the code uses Resend,
  not Postmark. Spec: email campaigns 8/8; full jest 2113/2116 — ad-stats-sync flaked under load, 7/7
  alone.
- Codex built, Claude reviewed and finished ✅ Run-history retention + monthly run limit (2026-10-03).
  Policies `automations.runRetentionDays` (30–3650, null = keep forever) and
  `automations.maxRunsPerMonth` (null = no limit), Settings rows, shown on Governance and Command
  Center. Nightly job (03:30 UTC, `workflow-retention` queue) deletes only finished runs older than the
  cutoff — never running/waiting runs, runs with a pending approval or an open Recovery item — and
  records each pass (`workflow_retention_cleanups`, migration 20261003110000, FK verified). Run limit is
  checked in a serializable transaction; a blocked trigger is saved as a skipped run with the reason.
  Claude's review fix: skipped runs (conditions not met / already blocked) no longer use the quota;
  "calendar month" stated as UTC; idempotency spec mock updated. Specs: retention, run limit (3),
  command center; full jest 2120/2121 before the mock fix, which then passed.
- QA (Codex, browser) ✅ run limit + retention: capped triggers saved as Skipped with the limit reason,
  Command Center count excludes skipped runs; retention 30 days saved, Governance "No cleanup has run
  yet"; both settings cleared afterwards. Redis now runs as a user LaunchAgent
  (~/Library/LaunchAgents/com.noxtill.redis.plist, 127.0.0.1 only, starts at login) — dev machine only;
  production still needs managed Redis.

## Progress log — Business Intelligence

- Screen 1 ✅ BI Overview (`/business-intelligence`). Reads five metrics from the existing Dashboard
  widget registry and new insights from the canonical AI Insights records; no KPI formula or second
  metric store added. Displays source evidence, recorded impact (or "Impact not quantified"), and
  source-module links; source-insight confidence is disclosed as unrecorded. The page discloses the
  Dashboard cache may be up to 60 seconds old. Real-MySQL spec covers empty sources, real order data,
  and tenant isolation. No migration. Backend/frontend `tsc`, touched-file eslint and full backend
  Jest pass (338 suites / 2,122 tests); browser page loaded in QA Test Business with real data.
- Screen 2 ✅ Business Brain (`/business-brain`). Answers are limited to canonical Dashboard widget
  outputs, numeric claims are checked against source values, and each saved answer includes source
  metrics, calculation, assumptions, and an explicit uncalibrated-confidence disclosure. Uses
  `AiInfraService.createMessage`; the live page gracefully displayed Anthropic's actual insufficient-
  credit error without crashing. A live successful AI answer could not be verified while the provider
  account has $0 credit. Real-MySQL tests cover persistence, source evidence, numeric guardrails,
  tenant isolation, and the FK. Hand-written `bi_brain_answers` migration was applied and its FK
  verified. Backend/frontend `tsc`, touched-file eslint, focused MySQL spec (2/2), and full backend
  Jest pass (338 suites / 2,123 tests); browser QA in the QA Test Business covered provider failure.
- Screen 3 ✅ Opportunity Radar (`/opportunity-radar`). Reads canonical open AI Insights and Product
  Radar candidates; ranks each source group only by its own recorded impact or confidence/freshness,
  with no cross-source score or projected uplift. Growth/retention themes use source categories;
  stock/credit remain unclassified because they do not establish savings. The explicit savings empty
  state says no source-backed savings opportunity is recorded. Source-module handoffs are read-only.
  Real-MySQL spec verifies ranking, source evidence and tenant isolation (2/2); no migration.
  Backend/frontend `tsc` and touched-file eslint passed. Full Jest (`--maxWorkers=2`) had 337/338
  suites pass; the unrelated Billing suite hit a 5-second `beforeAll` timeout and teardown FK error,
  then passed alone (11/11). Browser QA in the QA Test Business showed real insight rows, theme
  filtering and the honest no-savings state.
- Screen 4 ✅ Business Simulator (`/business-simulator`). Versioned, read-only what-if snapshots for
  price, stock, staff headcount and marketing-budget assumptions. Price and stock use arithmetic
  over the canonical Dashboard metric / Product row and state the unchanged-volume or no-live-write
  assumptions; staff is headcount only, and marketing ROI is explicitly unavailable because spend
  and attribution are not recorded. Real-MySQL spec verifies v1/v2, stock arithmetic, no source-row
  mutation, and tenant isolation (3/3). Hand-written `bi_scenario_versions` migration applied; its
  business FK was verified and Prisma reports schema up to date. Backend/frontend `tsc`, touched-file
  eslint, and full backend Jest (`--maxWorkers=2`, 338 suites / 2,124 tests) passed. Browser QA in a
  separate QA Test Business loaded the empty state and saved named price and stock v1 scenarios;
  the stock result matched the QA product's recorded quantity and threshold, and the UI confirmed
  live records were unchanged. Created a QA-only product for the stock flow. No production data
  touched.
- Screen 5 ✅ Diagnosis Center (`/diagnosis-center`). Reads canonical AI Insights and their recorded
  source figures; displays correlations as correlations, leaves cause unestablished, and discloses
  that insight confidence/severity are not tracked. Merchants can record an explicitly unverified
  hypothesis and resolve it with a reason; these BI notes are audited and never change the source
  insight. Real-MySQL spec covers source linkage, hypothesis create/resolve, audit entries and tenant
  isolation (4/4). Hand-written `bi_diagnosis_hypotheses` migration applied; both business and source
  insight FKs verified, Prisma schema up to date. Backend/frontend `tsc`, touched-file eslint and full
  backend Jest (`--maxWorkers=2`, 338 suites / 2,125 tests) passed. Browser QA in the separate QA Test
  Business confirmed route/header and the honest no-insights empty state; no source insight existed
  there to exercise the hypothesis form live, so that mutation flow is verified by the MySQL spec.
- Screen 6 ✅ Digital Twin (`/digital-twin`). Reads canonical root/active-branch, membership, scheduled
  shift, product/service/stock, supplier/purchase-order, branch-local expense, integration (without
  credentials), and workflow records. Currency totals remain separate by branch. The module persists
  only immutable, audited assumptions; creating v2 preserves v1 and never writes operational data.
  The MySQL spec verifies the live branch-group sources, USD/EUR cost separation, tenant isolation,
  audited v1/v2, invalid assumption rejection, secret-field exclusion, and unchanged product/expense
  rows (2/2). Hand-written `bi_twin_assumption_versions` migration applied; its business FK was
  verified and Prisma reports 151 migrations up to date. Backend/frontend `tsc`, touched-file eslint,
  and full backend Jest (`--maxWorkers=2`, 339 suites / 2,127 tests) passed. Browser QA in QA Test
  Business confirmed live data, empty assumptions, saved a labelled 5% v1 and 7% v2, and compared
  earlier history. That QA-only test assumption remains in the test business. Physical equipment
  and explicit supplier SLA fields are not tracked; historical purchase-order timing can be derived
  in Inventory Intelligence when completed records exist but is not calculated by this Digital Twin
  screen. Staff/service capacity and product cost coverage are disclosed as partial for the
  documented source-data gaps.
- Screen 7 ✅ Intelligence Settings (`/settings/business-intelligence`, Settings Hub). Business
  policies configure source-confidence bands, an on-screen recorded-impact marker and optional
  price/stock/staff/marketing what-if defaults. BI Overview and Opportunity Radar display threshold
  status without changing source ranking; the Simulator pre-fills only new hypothetical inputs.
  Settings checks BI metric references against the Dashboard widget registry and reads the actual
  Dashboard cache TTL. Per-business model allowlists, BI approval/retention controls and threshold
  notifications are not available; provider controls remain in AI & Governance. Real-MySQL specs
  cover policy persistence/reset, range enforcement, threshold behavior and simulator defaults; no
  migration. Backend/frontend `tsc` and full backend Jest (`--maxWorkers=2`, 339 suites / 2,128 tests)
  passed. Frontend touched-file eslint passed; all new backend sections are clean, while pre-existing
  formatting and unsafe-test lint findings remain elsewhere in the legacy Intelligence Settings and
  Hub test files, plus a pre-existing `require-await` finding in `hub.service.ts`. Browser QA saved a
  confidence threshold and a 5% scenario
  default, verified the Simulator prefill, then reset the test settings.

## Split — goal #8: finish the client modules (both agents, from 2026-10-06)

Status at split: Commerce, SEO, Automations, BI and Website Cart & Checkout (`3fa7e1f`) are committed.
Customer Portal (10 screens) and Procurement Overview + Purchase Requests are built but uncommitted.

| Owner | Work | Files the owner may edit |
|---|---|---|
| **Codex** | (1) **First, today:** commit Customer Portal (its 2 migrations + module + views), one commit per screen where the files allow, otherwise one module commit. (2) Add a customer **Forgot password** flow (emailed single-use, hashed, expiring reset token; reuse the invite-token pattern; no account enumeration). (3) Browser QA of all 10 portal screens. (4) Commit Procurement Overview + Purchase Requests, then build the remaining 6 Procurement screens: Sourcing & RFQs (shared engine with Commerce RFQs, same RFQ id), Supplier Contracts & Terms, 3-Way Match, Spend Control, Procurement Analytics, Procurement Settings. Finance AP / budgets don't exist: show "Not available", never invented bills or budgets. | `backend/src/customer-portal/**`, `backend/src/procurement/**`, their migrations, `commerce-rfqs*` (shared RFQ engine), `frontend/src/components/{customer-portal,procurement}/**`, `frontend/src/lib/{customer-portal,procurement}-api.ts`, `app/(app)/{customer-portal,procurement}/**`, `app/portal/**` |
| **Claude Code** | Website & Commerce, the 11 screens not built yet: Website Overview, AI Website Builder, Pages, Navigation & Menus, Landing Pages, Blog & Content, Forms & Lead Capture, Storefront Configuration, Themes & Branding, Domains & Publishing, Website Settings. Products, orders, SEO, CRO and campaigns stay in their owner modules (deep links only). | new `backend/src/website/**`, its `*_website_*` migrations, `frontend/src/components/website/**`, `frontend/src/lib/website-*-api.ts`, `app/(app)/website/**`, public site route `app/site/**`; may extend `app/store/**` + `public-ordering*` for storefront config (Codex is done with checkout) |

Shared files (re-read right before editing, smallest possible edit, never reformat): `schema.prisma`,
`app.module.ts`, `nav-items.ts`, `i18n.ts`, `tenant.constants.ts`, `policies.constants.ts`,
settings-hub files. These currently hold Codex's uncommitted portal/procurement hunks, so each agent
commits **only its own hunks** (stage a patch of your hunks, e.g. `git diff <file>` → edit →
`git apply --cached`); never commit the other agent's unfinished hunk. Commit with explicit paths,
never `git add -A`, never push. Report bugs for the other agent under Requests.

## Progress log — goal #8

- Customer Portal ✅ module/views and first two migrations (`79a4ab1`); Forgot password ✅
  (`7781350`). Reset links are one-use SHA-256-hashed tokens with a 60-minute expiry and generic
  responses; password changes revoke active sessions. The reset migration is applied and covered by
  a real-MySQL spec. Backend/frontend `tsc`, touched-file eslint and full backend Jest pass (343
  suites / 2,151 tests). Browser QA of the portal screens remains pending.
- Procurement Overview (`/procurement`) and Purchase Requests (`/procurement/requests`): real
  request/approval records, Action Center approval handoff, and shared Commerce RFQ handoff. The
  three Procurement migrations are applied; Prisma reports the database schema up to date. Backend
  and frontend `tsc`, touched-file eslint and full backend Jest pass (343 suites / 2,151 tests).
  Finance bills and budgets remain honestly shown as unavailable, not estimated.
- goal #8 / Claude ✅ Website & Commerce, 11 remaining screens (`3104c1c`): Overview, AI Website
  Builder, Pages, Navigation & Menus, Landing Pages, Blog & Content, Forms & Lead Capture,
  Storefront Configuration, Themes & Branding, Domains & Publishing, Website Settings (`/website/*`),
  plus the public hosted site `/site/<slug>`. New `backend/src/website/` module; one hand-written
  migration `20261006150000_website_foundation` (10 tables, 18 FKs verified via
  information_schema). Publishing = immutable deployment snapshots with rollback; forms write the
  canonical CRM customer (upsert by phone, consent only when ticked, honeypot, idempotent);
  storefront settings enforced by the existing `/store` checkout (hidden products refused,
  checkout switch). New capability `website.manage` (owner + manager). Honestly disclosed: site
  sessions/conversion not tracked, custom-domain traffic routing not configured, payment
  processing not available (no Payments module), helpdesk/booking-request form destinations not
  available, multi-language sites not available. Real-MySQL spec 8/8; backend + frontend `tsc`
  clean; eslint clean on touched files; full backend jest 342/343 suites, 2151/2151 tests (the one
  failing suite was `customer-portal.service.db.spec.ts` while Codex was editing it; 5/5 alone).
  Smoke: all 11 admin routes and `/site/<slug>` return 200, unknown site 404, admin API 401 without
  login. Interactive browser QA not done yet (user declined the browser tool this session).
  **Request → Codex:** browser QA of `/website/*` and `/site/<slug>` in the QA Test Business.
- goal #8 / Claude ✅ Procurement screens 4, 7, 8 (`031ee14`), own module `backend/src/procurement/contracts/`
  (ProcurementContractsModule; Codex's `procurement.service.ts` untouched):
  Supplier Contracts & Terms (`/procurement/contracts`), Procurement Analytics (`/procurement/analytics`),
  Procurement Settings (`/settings/procurement`, Settings hub category `procurement`). Migration
  `20261006220000_procurement_supplier_contracts` (2 tables, 4 FKs verified). Policy key
  `procurement.contractRenewalAlertDays` (default 30) consumed by the daily renewal-alert job
  (08:00 UTC, BullMQ). Honestly disclosed: billed spend, 3-way match exception rate, budgets,
  tolerances and request/PO numbering not available; no Documents & eSign module (contracts link
  to the file). Real-MySQL spec 3/3; backend + frontend `tsc` clean; eslint clean on touched files;
  full backend jest 344/344 suites, 2154/2154 tests. Smoke: all three routes 200, APIs 401 logged out.
  **Requests → Codex:** (1) your Sourcing & RFQs / 3-Way Match / Spend Control can read supplier
  contracts from `procurement_supplier_contracts` (e.g. Spend Control "off-contract spend" — the
  analytics service already computes it, reuse `ProcurementAnalyticsService` rather than a second
  formula). (2) If you add RFQ defaults or tolerances as `Business.policies` keys, add their rows to
  `settings-hub/categories/procurement.ts` and replace the "Not available" tolerance row once it is
  enforced. (3) Browser QA of `/procurement/contracts`, `/procurement/analytics`, `/settings/procurement`.
- goal #8 / Codex ✅ Sourcing & RFQs (`/procurement/sourcing`): approved requests create/link the
  canonical Commerce RFQ through the existing shared flow and keep the same RFQ id; supplier
  outreach remains manual. Procurement Overview now counts open procurement-linked RFQs from that
  same table. Real-MySQL sourcing/tenant test passes. No migration.
- goal #8 / Codex ✅ 3-Way Match (`/procurement/three-way-match`): displays real PO lines and
  recorded goods-receipt quantities from Inventory, with deep links back to receiving. Vendor bills
  are not recorded here, so invoice comparison and match results remain "Not available". No migration.
- goal #8 / Codex ✅ Spend Control (`/procurement/spend-control`): off-contract spend, committed
  spend and contract coverage are displayed directly from `ProcurementAnalyticsService`; this page
  does not duplicate its calculation. Procurement budgets, vendor bills and paid spend remain
  honestly unavailable. Real-MySQL analytics test passes. No migration.
- goal #8 / Codex done-check: backend and frontend `tsc --noEmit` clean; touched-file ESLint clean;
  full backend Jest 346/346 suites, 2,157/2,157 tests. Browser QA in isolated QA Test Business:
  all 7 Procurement screens + Procurement Settings and all 11 Website screens returned 200, rendered
  empty states where applicable, and had no console, page or API errors. Sourcing and Website
  Overview were visually inspected. No procurement or website business records were created during
  route-load QA.

## Module 21 progress — call routing (Codex, 2026-10-13)

- Human-agent retry: the call assignment now stores a per-call attempt number, and up to three
  distinct eligible agents are offered before the existing fallback. Stale/duplicate status
  callbacks are scoped to their attempt. Migration `20261013224000_voice_human_agent_retry` is
  applied locally; information-schema indexes/FKs were checked. Real-MySQL retry tests pass.
- Published IVR runtime: new inbound calls pin the currently published immutable IVR version and
  execute its supported nodes; input callbacks are bound to the current node. The studio only says
  the runtime is connected when a published flow exists. Migration
  `20261013224944_voice_ivr_runtime` is applied locally; focused runtime tests pass.
- AI agent controls: immutable versions now store the live-action allowlist, selected active
  business knowledge-source IDs and a per-response output-token cap. Call execution enforces the
  pinned version's action allowlist, scopes knowledge retrieval to that version, and passes its
  token ceiling to AI infra. Publishing now requires a successful latest sandbox test followed by
  explicit owner approval. Migration `20261013231000_voice_ai_agent_guardrails` is applied locally;
  real-MySQL config/approval/runtime tests pass.
- Supervisor coaching: internal human-agent transfers now use a shared Twilio conference; the
  assignment records the agent Call SID and conference SID. Listen joins muted, whisper uses
  `Coaching=true` / `CallSidToCoach`, and barge joins unmuted. The UI offers Whisper/Barge only for
  a connected internal agent. External-number transfers cannot be coached. Supervisor actions
  still ring the supervisor's saved phone; they are not silent taps. Migration
  `20261013233000_voice_conference_coaching` is applied locally.
- Verification: backend and frontend `tsc --noEmit` pass. Focused real-MySQL checks pass (4 suites /
  52 tests). Full backend Jest: 358 suites passed and 1 failed (2,220 passed / 1 failed / 2,221
  total); the sole failure is Claude's uncommitted `voice-outbound-dialer.service.db.spec.ts`,
  where its test Twilio provider rejects the call. That implementation remains untouched.
  Frontend ESLint passes; backend ESLint passes on Codex-owned files, while the shared controller
  retains one formatting-only error in Claude's outbound-dialer hunk. Fake-data checks found no
  invented call metrics or sample call records.
- Browser QA in the logged-in Contact Center QA business: `/phone/agents`, `/phone/routing`, and
  `/phone/supervisor` load with saved business data; Supervisor currently shows the real empty-call
  state and no sample calls. The published IVR flow appears in Routing Studio and AI guardrail
  controls appear in Agents. No live Twilio call was placed: the business has no configured
  number and there are no calls in progress. Provider callbacks, actual audio, and live
  listen/whisper/barge therefore remain unverified end to end.
- Local commits: `b180a37` contains human-agent retry and published IVR routing with their two
  migrations. `763c82b` contains the AI agent guardrail screen and its migration. `d391d9c`
  contains internal shared-conference coaching and its migration.
  Claude's uncommitted outbound-campaign files and their schema/module/constants/controller hunks
  must not be committed with Codex's changes.

## Module 21 progress — outbound, tracking, meetings (Claude Code, 2026-10-14)

- Meeting invites (`b1dd999`): guest links are emailed through the shared `EmailService`;
  `emailSentAt`/`emailProviderRef` are set only after the provider accepts the message. Provider
  failure or missing email config never fails the invite — the organizer still gets the link and the
  screen says it was not emailed. Live video/recording/screen share remain disclosed as not configured.
- Outbound power dialer (`60efaa4`, migration `20261013210000_voice_outbound_power_dialer`):
  campaigns start/pause/stop (managers). The assigned human agent works the list: Twilio rings the
  agent's own phone, and only after the agent answers does TwiML dial the customer from the
  business number. Each attempt row-locks the contact and agent, re-runs the fail-closed
  eligibility check (decision id kept), refuses when the agent is not Available or already on a
  call, and advances only on signed callbacks (`/voice/webhook/outbound/*`). Attempt cap, cooldown
  and stale-callback release are enforced; a `do_not_call` outcome writes a real suppression entry.
  AI outbound campaigns are refused at start with an honest notice; no predictive dialing,
  voicemail detection or external DNC registry.
- Tracking numbers (`b83932b`, migration `20261014100000_voice_tracking_numbers`): numbers are
  bought, or ownership-verified in the connected Twilio account, and routed to the normal inbound
  webhook. `handleIncoming` falls back to `resolveTrackingLine()` when the dialed number is not the
  main line, stamping source/channel/campaign while the number is active. Reassignment closes the
  old window, so earlier calls keep their attribution; deactivation stops attribution but does not
  release the number at Twilio. Overview now reports tracking-number calls and a real unknown-source
  rate. Click/UTM imports remain not configured.
- Verification: backend + frontend `tsc` clean; full backend Jest 360 suites / 2,223 tests pass;
  ESLint clean on touched files. Provider calls are covered with mocked Twilio requests only — no
  live call or number purchase was made, so real audio/callbacks remain unverified end to end.

## Module 21 progress — original screens (Codex, 2026-10-14)

- Incoming Live: added real cold/warm Twilio transfer requests, a persisted per-call transfer
  attempt with provider callbacks, `GET /voice/calls/:id/legs`, and visible Pending versus
  Provider-confirmed/Failed states. Warm transfers use Twilio's called-party screening callback
  to play the saved caller context privately before connection. Transfers remain pending until the
  final provider callback; live Twilio audio was not exercised.
  Migration `20261014120000_voice_call_transfers` is applied locally.
- Call Queue: pending missed/message/custom follow-ups now sort missed calls first and show
  evidence-derived priority and required skill. Available staff can claim the next matching item
  with `POST /voice/queues/:id/take-next`; the claim is row-locked, tenant-scoped and audited.
  Call language is not stored, so the screen says Not captured. This is a follow-up queue, not a
  caller-on-hold queue: calls enter the existing AI/IVR path, escalate to an available human when
  requested, and fall back to team follow-up if no person can take them.
- Inbound human-agent capacity counts power-dialer and call-back attempts in `agent_ringing` and
  `customer_ringing` as busy. The real-MySQL dispatch spec passes 10/10 tests.
- Backend and frontend `tsc --noEmit` and touched-file ESLint pass. Full backend Jest passes 364/364
  suites and 2,240/2,240 tests. `prisma migrate status` reports all 181 migrations applied.
  Browser empty-state QA passed on `/receptionist/live` (no active calls) and
  `/receptionist/queue` (no follow-ups; routing disclosure visible). No safe live call or queued
  record was available to exercise transfer or take-next in the browser, and console/network
  diagnostics were not collected; live Twilio behavior remains unverified.

## Module 21 progress — original screens (Claude Code, 2026-10-14)

- Missed Calls (`6d4dc09`, migration `20261014110000_voice_callbacks`): `/receptionist/missed-calls`
  is a real screen (was a redirect). Each call-back re-runs eligibility (purpose `callback`, live
  agent; decision row kept). Staff may attest that the caller asked for a call-back; that is stored
  as consent evidence referencing `phone_call:<id>` under their name — never assumed. With a
  provider and an agent profile Twilio rings the staff phone first and bridges on signed callbacks
  (`/voice/webhook/callback/*`); otherwise a passed check offers a manual dial (recorded as
  "eligible · dial manually"). Closing marks the call handled; `do_not_call` adds a suppression. The
  shared "Call back" action now routes here instead of opening `tel:` unchecked. (Correction,
  2026-10-16: an automatic missed-call text-back DID already exist in `MissedCallService`; see the
  text-back entry below.)
- Transcripts & Recordings (`e6ec93b`, migration `20261014121000_voice_call_legal_hold`): legal hold
  with a required reason (audited, shown in call history). While held, delete is refused and the
  retention purge skips the call. Existing delete already erases audio, transcript and QA reviews;
  playback is already audited.
- Call Analytics (`2f23fdd`): `GET /voice/analytics/export` CSV (managers, ≤92 days, ≤10k rows),
  masked callers, formula-injection safe, audited; attribution basis column distinguishes
  tracking number vs merchant-entered vs unknown.
- Settings (`6509a52`): live provider health (Twilio account status, business-number routing vs the
  incoming webhook, public webhook URL) plus config facts (storage, speech/AI, email) and this
  month's measured usage. At the time of this entry, no voice usage cap was enforced; see the
  later Codex update below for the inbound automated-call cap.
- At the time of this entry, SIP/trunk mapping, sandbox test numbers, and Call Overview
  direction/agent-version filters were still outstanding; later completion is recorded below.

## Module 21 progress — inbound automated-call cap (Codex, 2026-10-15)

- Added owner-configurable `voice.maxInboundCallsPerMonth` (null means unlimited) to AI & Governance
  settings. The UTC-month admission check is serialized per business; capped calls are still saved
  with the reason, skip AI/IVR and caller-audio recording, and try human handoff before leaving a
  follow-up record. Receptionist Settings shows the configured limit, admitted calls, and calls
  routed around the cap. Inbound minutes, outbound calls, and callback dials remain measured only.
- Added real-MySQL tests for capped calls, unlimited behavior, concurrent admission, and usage
  reporting. Migration `20261015161247_voice_inbound_call_cap` is applied locally; Prisma reports
  all 182 migrations applied. Focused MySQL tests pass (47 tests across two suites); full backend
  Jest passes (364 suites, 2,244 tests). Backend and frontend `tsc --noEmit` and touched-file
  ESLint pass. `intelligence.ts` retains 74 pre-existing formatting-only ESLint errors, unchanged
  from its baseline.
- Browser QA is blocked at the login/module-access gate: `/receptionist/settings` displays
  “Module access couldn't be checked” and asks to reconnect. No QA-business credentials were
  available in the active browser session, so no settings were changed and no live Twilio call was
  placed.

## Module 21 progress — remaining code, Claude items 1–3 (Claude Code, 2026-10-16)

- Transcript redaction (`eb13ed5`, migration `20261016100000_voice_transcript_redaction`): owner
  setting `voice.redactTranscripts` (default off). A 5-minute job masks Luhn-valid card numbers,
  SSN-style IDs, phone numbers and emails in finished calls' transcripts and AI summaries; managers
  can redact one call on demand. Live calls and legal-hold calls are never changed.
- Outbound campaigns (`957a370`, migration renamed to `20261016111000_voice_campaign_approval_amd`
  to avoid colliding with Codex's `20261016110000_*`): campaigns now go draft → pending approval →
  approved before they can start; a different manager approves (the owner may approve their own),
  and approved campaigns can be sent back. **AI campaigns can also be requested/approved**; the human
  dialer's `start` still refuses AI campaigns, so starting an approved AI campaign is Codex's path.
  Approved human campaigns auto-start when `scheduledAt` arrives (minute job). Optional voicemail
  detection adds Twilio `machineDetection` on the customer `<Number>` and logs machine answers as
  `voicemail` (new enum value on both attempt tables). Draft campaigns accept a CSV upload matched
  to the CRM by phone (new customers get `consentMarketing=false`). Per-campaign report from saved
  rows only. AMD attribute support on `<Number>` is not verified against live Twilio.
- Missed-call text-back: correction — `MissedCallService` already texted every missed caller with no
  consent or suppression check. It now respects owner setting `voice.missedCallTextBack` (default on,
  preserving behavior), never texts a suppressed number or an opted-out customer, uses an
  idempotency key per call, and stores the outcome (`textBackStatus`) plus the Message id so the
  Missed Calls screen shows the provider-reported delivery status. Unknown (non-customer) callers are
  still texted when the setting is on — disclosed in the setting's impact text.

## Module 21 progress — hold queue and SLA (Codex, 2026-10-16)

- Added Twilio `<Enqueue>` with signed wait/exit callbacks, owner-configurable max wait and overflow
  choices, persisted provider `QueueTime`, and per-queue SLA targets compared with measured waits.
  Supervisor metrics label the wait estimate as unavailable until enough measured waits exist.
- Real-MySQL tests cover configuration-off behavior, callback URLs, queue wait persistence and SLA
  risk. Backend and frontend type checks pass; full backend Jest passes 371 suites / 2,264 tests.
  Touched-file ESLint passes except the unchanged 74 formatting-only baseline errors in
  `settings-hub/categories/intelligence.ts`. No live Twilio call was placed; live queue audio and
  callback behavior remain unverified.

## Module 21 progress — per-version AI budget (Codex, 2026-10-16)

- AI agent versions can store a monthly USD budget; live voice AI usage is tagged to its pinned
  version and the next turn is refused once logged estimated spend reaches the configured limit.
  The AI Agents screen shows the version's recorded spend for the current UTC month. Real-MySQL tests
  verify usage logging and blocking with a controlled provider response; no live AI provider call
  was made, so live billing alignment remains unverified.
- Backend and frontend type checks pass; full backend Jest passes 371 suites / 2,264 tests, and
  focused voice/database suites pass 5/5 suites / 59 tests. Touched-file ESLint passes except the
  unchanged 74 formatting-only baseline errors in `settings-hub/categories/intelligence.ts`.

## Module 21 progress — browser softphone (Codex, 2026-10-16)

- Added a profile-scoped, one-hour Twilio Voice SDK token endpoint and Agent Workspace controls to
  connect, answer, mute, hold/resume and hang up. Hold and hang-up call Twilio and report success
  only after the provider accepts the request; token issuance and call controls are audited.
  Incoming agent dispatch can target the browser identity when the complete Twilio Voice setup is
  present; otherwise phone-number dispatch remains in place.
- The UI honestly shows Not configured until the account, API key/secret and TwiML app are set.
  Real-MySQL tests validate the signed token and missing-configuration refusal, but no live Twilio
  call was placed. Backend/frontend type checks and touched-file ESLint pass; full backend Jest is
  371 suites / 2,264 tests. The 74 existing formatting-only errors in `intelligence.ts` are
  unchanged.

## Module 21 progress — remaining code, Claude items 4–6 and handover (Claude Code, 2026-10-16)

- Analytics trends (`10fe571`): `GET /voice/analytics/trends?days=7|30|90` — daily rows in the business
  time zone from stored facts (calls, missed, transferred, AI-contained, human-connected, AI-only vs
  human-involved minutes, cost per provider-priced call, average submitted quality score, outbound
  compliance blocked rate) plus a glossary and data-lag note. Call Analytics shows single-series
  charts with hover values and a table view; Overview has a managers' Minutes & spend card.
  Human-involved minutes include the AI portion before handoff (no per-leg timing stored).
- Tracking/Bookings (`662c3ca`): per-source table (calls, via tracking number, bookings, completed,
  deposits captured). Revenue per source stays "not available" — bookings carry no sale value.
  Bookings from Calls no longer hardcodes an "AI" chip: shows the pinned AI agent version and a
  caller-verified flag (booked customer's phone equals caller number).
- Settings (`eac97b8`, migration `20261016130000_voice_test_numbers_sip_trunk`): up to 10 test caller
  numbers; `handleIncoming` sets `PhoneCall.isTestCall` via `isTestCaller()`. Test calls are excluded
  from trends and monthly usage, never texted back, and flagged in the CSV export. Twilio Elastic SIP
  trunk saved only after `trunking.twilio.com` confirms it; origination URLs and numbers read live,
  warning when the business number is on the trunk. **Codex: the inbound automated-call cap counts
  should also exclude `isTestCall` calls.**
- Handover to Codex — item 7 (live video meetings) is NOT started. Suggested approach: LiveKit
  (self-hostable). Backend: mint HS256 access tokens for host and invite-token guests (no long-lived
  credentials in URLs), room per meeting, recording only after consent, `LIVEKIT_URL/API_KEY/API_SECRET`
  missing → keep the existing "Live video not configured" disclosure. Frontend: add `livekit-client`
  (+ components) after the softphone package.json change is settled; guests cannot screen share or
  record by default.
- Open decision for the owner: `voice.missedCallTextBack` defaults to on (preserves old behaviour) and
  also texts callers who are not saved customers.
- Verification for items 4–6: each commit's staged snapshot compiled (backend + frontend) on its own
  and its focused real-MySQL tests passed (item 6 snapshot: 57 tests incl. voice-call.service). A full
  backend Jest run after Codex's latest commits has not been done by Claude.

## Module 21 progress — test-call cap exclusion (Codex, 2026-10-16)

- Inbound automated-call cap now counts only non-test calls. Added a real-MySQL regression covering
  a configured test caller followed by a normal caller at the limit boundary. Focused
  `voice-call.service.spec.ts` passes (44 tests). Full Jest/type/lint checks are pending.

## Module 21 progress — LiveKit meeting rooms (Codex, 2026-10-16)

- Added host and invited-guest short-lived LiveKit join tokens, scoped to one meeting room and
  issued only during its join window. Token grants restrict publishing to camera/microphone and
  disable data publishing and room recording. Guests remain unable to record or share screens.
- Added the browser room client with camera/microphone off until the participant enables them. The
  meetings and public invite pages preserve an honest “Live video not configured” state until all
  three LiveKit server settings are present. No recording feature is enabled, so no call or meeting
  audio/video is retained by this implementation.
- Real-MySQL token/host/invite tests pass (5/5); backend and frontend type checks and touched-file
  ESLint pass. Live provider connectivity and browser media permissions have not been tested because
  no LiveKit server credentials are configured in this environment.

## Module 21 progress — failed AI booking attempts (Codex, 2026-10-16)

- Added `PhoneCall.bookingAttempts` with a hand-written MySQL migration. Missing service/time details
  and booking-engine rejections are saved with the requested service/time and a safe reason code;
  successful appointments remain canonical Booking records. The Insights API exposes the attempts,
  and Bookings from Calls lists failures separately without counting them as appointments.
- Migration `20261016140000_voice_ai_booking_attempts` is applied locally and Prisma reports the
  database up to date. The real MySQL voice-call suite passes 45 tests; backend and frontend type
  checks and touched-file ESLint pass.

## Module 21 progress — approved AI outbound campaigns (Codex, 2026-10-16)

- Approved AI campaigns now run as a sequential Twilio dialer separate from the human power dialer.
  Every contact is checked again through the campaign compliance engine immediately before dialing;
  the published AI version is pinned across retries, and its tool allowlist is enforced during calls.
  Calls are not recorded. Voicemail detection and provider cost are disclosed as unavailable rather
  than inferred. Live Twilio calling was not attempted because this environment has no public HTTPS
  webhook URL/provider QA setup.
- Added real-MySQL integration coverage for missing provider configuration, compliance re-check,
  version pinning, callback idempotency and allowlist refusal. Focused spec passes 2 tests; full
  backend Jest passes 372 suites / 2,269 tests. Backend/frontend type checks and touched-file ESLint
  pass.

## Module 21 progress — Call Overview direction filter and settings schema correction (Codex, 2026-10-16)

- Call Overview now filters saved calls by inbound/outbound direction alongside its existing
  handler and pinned AI-agent-version filters. The direction comes from `PhoneCall.direction`;
  it is not inferred from call outcomes. Added a real-MySQL regression proving direction is exposed
  in the enriched insights response.
- Corrected the `VoiceSettings` Prisma model to own `testCallerNumbers` and `sipTrunkSid`, matching
  migration `20261016130000_voice_test_numbers_sip_trunk` and the settings service. `prisma migrate
  status` reports the database up to date; `information_schema` confirms both columns are on
  `voice_settings`. No new migration was needed.
- Verification: focused Insights MySQL spec 15/15; Prisma generate/validate and migration status
  clean; backend and frontend `tsc --noEmit` pass; ESLint passes on changed files and the earlier
  inbound-cap files; full backend Jest passes 372/372 suites and 2,269/2,269 tests with
  `--runInBand`. The parallel `--maxWorkers=2` run had one Customer Portal teardown FK error; that
  suite passed alone and the serialized full suite passed.
- Browser QA is blocked because the signed-in QA session shows “Module access couldn't be checked”
  on `/receptionist` after retry. Browser console reported no errors; the Overview filters could
  not be reached through the UI.

## Module 21 progress — live Twilio browser setup (Codex, 2026-10-16)

- Verified the supplied Voice SDK API key against Twilio and the existing number's voice capability.
  Created one `Noxtill Voice SDK` TwiML Application through Twilio's REST API, which accepts an
  omitted Voice URL. Stored its SID and the supplied key only in git-ignored `backend/.env`.
  Browser outbound dialing is not implemented; no outgoing application URL was invented.
- Started the existing Redis LaunchAgent and verified `PONG`. Corrected the local frontend backend
  address in git-ignored `frontend/.env.local` to port 5001; macOS Control Center occupies 5000.
  The QA account now reaches the app without the earlier module-access error.
- Fixed Twilio webhook verification behind an HTTPS proxy: the signed URL uses the configured
  backend origin and preserves the encoded request path/query. Added five regression cases,
  including a real HMAC over the public URL, an invalid signature and invalid configuration.
- Added `backend/scripts/voice-webhook-proxy.cjs`: a localhost-only development gateway that exposes
  POST voice-webhook routes and a gateway health response. Other API routes return 404 and unsigned
  webhook requests return 403. A temporary Cloudflare tunnel forwards only to this gateway.
  Public HTTP probes verified a signed webhook returns TwiML/200, an invalid signature returns 403,
  and a private API route returns 404. The probe used an unrecognized dialed number and created no
  business call record. This tunnel is temporary; production needs a permanent public HTTPS backend.
- Created the isolated `QA Test Business Voice 20261016` account and its staff-linked voice profile.
  Linked the existing, provider-verified number to this QA business and configured its incoming and
  status callbacks; Twilio read-back confirmed both URLs and POST. No new phone number was purchased.
  The live Settings page also reports Telephony account, Webhook address and Business number as OK;
  browser console inspection found no errors or warnings on Settings or Agent Workspace.
- Browser QA verified real Twilio registration (`Ready`) and a live Twilio call ringing only the QA
  browser identity. The test was not answered: Twilio reported `no-answer`, duration 0; the saved QA
  call is flagged `isTestCall` and its agent reservation was released using that provider result.
  No audio was recorded and no customer phone was dialed. Microphone/audio, real PSTN reception,
  conversation, transfers and hold music are not live-verified by this test.
- Fixed a browser state race that overwrote `Ready` with `Connecting` after registration. Removed
  stale hardcoded claims that the now-implemented browser phone is unavailable; actual readiness
  remains supplied by the softphone endpoint and the SDK registration event.
- Verification: backend/frontend `tsc --noEmit` and touched-file ESLint pass. Full backend Jest:
  373/373 suites, 2,274/2,274 tests (`--runInBand`); focused URL/AI-agent and URL/softphone MySQL
  runs pass 7 tests each. Frontend route types were regenerated after a transient `.next` generated
  file parse error during dev-server startup. No migration was added. Nothing was pushed.

## Module 21 progress — live AI provider QA and safe failure messages (Codex, 2026-10-16)

- In the isolated QA voice business, created `QA Receptionist Provider Check` (draft v1), a
  canonical QA booking service, and a US `inbound_recording` policy draft with a one-day recording
  retention proposal. No customer call was placed. No agent or recording policy was published.
- The real sandbox request failed because Anthropic returned HTTP 400 / `invalid_request_error`:
  "Your credit balance is too low to access the Anthropic API." No model substitution or provider
  switch was made. Live AI conversation, booking, transfer and recording tests remain blocked by
  provider credit and, for recording, an actual business review of the notice and policy.
- The agent sandbox now persists actionable, sanitized error codes for insufficient credit,
  rejected provider access and unavailable models, without leaking raw provider responses or keys.
  Added three real-MySQL regression cases (external AI mocked, database real). A failed latest test
  still blocks publication. The live API now saves `AI_PROVIDER_INSUFFICIENT_CREDIT`; publishing
  returns 409 / `VOICE_AI_AGENT_TEST_REQUIRED`. Browser QA shows the credit message and disabled
  approval/publish buttons; console inspection found no errors or warnings.
- Confirmed policy publication rejects a missing review reference / false review attestation
  (400 / `VALIDATION_ERROR`). The recording policy remains draft; no review was invented.
- Verification for this QA batch: backend/frontend `tsc --noEmit`, production backend build and
  touched-file ESLint pass; full backend Jest 373/373 suites, 2,278/2,278 tests (`--runInBand`).
  No migration or secret-bearing tracked file was added. Nothing was pushed.

## Module 21 progress — truthful Numbers and Compliance status (Codex, 2026-10-16)

- Numbers now derives routing status from the existing real provider-health response rather than
  claiming inbound routing from the presence of a saved number. Removed unconditional recording /
  transcription claims; the UI explains the published-policy, consent and transcription-provider
  requirements. Corrected the stale claim that additional campaign numbers are unsupported.
- Exposed the persisted `PhoneCall.isTestCall` flag in enriched calls and excluded test calls from
  Numbers' business counts, minutes, costs and latest-call display. Added a real-MySQL regression.
  The QA number page shows Routing verified and zero business calls even though its QA ringing
  call remains in call history. No data was fabricated or deleted.
- Compliance's footer no longer claims the outbound dialer is unimplemented. Verified the human
  and AI outbound services use `evaluateMember()` / compliance before calls; the standalone policy
  check still does not place a call. Browser QA confirmed the policy is draft and unpublished.
- Verification: backend/frontend type checks and touched-file ESLint pass; the full batch passed
  373 suites / 2,278 tests. Numbers, Agents and Compliance loaded without browser warnings/errors;
  screenshots saved locally as `/tmp/noxtill-number-routing-verified.png` and
  `/tmp/noxtill-ai-credit-blocker.png`. These prove status/error UI only, not live audio quality.
  No migration. No push. Real AI audio, booking, transfer and recording QA remains outstanding.

## Module 21 progress — provider-outage handling and offline verification (Codex, 2026-10-18)

- Continuing development without buying credit or silently switching providers. No live AI,
  speech transcription or new telephone call was requested in this batch. Previously observed
  insufficient Anthropic credit is still a live-conversation QA dependency, not evidence that
  the whole module is production-ready.
- Extracted sanitized AI failure classification shared by agent sandbox tests and live call
  handling. Insufficient credit, denied access, missing configuration, unavailable models and
  rate limits now produce operator-safe reasons rather than persisting raw provider errors.
  A failed inbound conversation saves a message/follow-up outcome and ends the call instead of
  asking for more recordings. Transcription failures retain the consented recording and a reason.
  Late callbacks for ended calls and sequential callbacks after a saved service failure do not
  request transcription/AI again. Model output cannot assert the server-only failure/budget flags.
- An AI outbound provider failure pauses its running campaign and audits the reason, preventing
  the next contact from being dialed by the sequential campaign. Pinned versions and existing
  tool/compliance checks remain intact. Inbound caps and inbound usage now explicitly exclude
  outbound calls (as well as the existing test-call exclusion).
- Provider health separates OpenAI transcription from Anthropic replies. Saved test/call evidence
  is distinguished from present availability; key presence alone is not a successful provider
  check, and no paid AI probe is made. Call workspace displays saved service failures. Settings
  and workspace copy no longer claim unconditional transcription or missed-call message delivery.
- Updated the default Haiku 4.5 token-cost estimate to USD 1 input / USD 5 output per million
  tokens, matching the already-selected default model. These remain estimates, not the provider
  invoice; historical usage rows were not rewritten. No model was changed in this batch.
- Verification: baseline 373 suites / 2,278 tests; full backend Jest `--maxWorkers=2` now passes
  373/373 suites and 2,288/2,288 tests. Focused five-suite run passes 77 tests, using real MySQL
  and mocked external providers for outage cases. Backend/frontend `tsc --noEmit`, backend build,
  touched-file ESLint and `git diff --check` pass. Fabrication/stale-claim grep completed.
- Browser QA used the existing signed-in `QA Test Business Voice 20261016`, not the main account.
  Settings, Agents and Call History/workspace load; captured Settings API/network responses are HTTP 200
  and browser console has no warning/error entries. Provider-dependent copy and saved-test
  availability disclosures are visible. Screenshot: `/tmp/noxtill-offline-phone-settings-20261018.jpg`.
  The new failure banner is database/API/type-tested, but no new live failed call was created to
  exercise it in the browser. The referenced `.dc.html` design folder is absent in this checkout;
  existing layout was retained, not claimed as a newly verified pixel match.
- Found one historical QA call still locally `in_progress` after its terminal callback was lost.
  Twilio's read-only Call resource confirmed it completed on 2026-10-16. Reconciled only that
  QA row and reservations from provider evidence, with a `voice.qa.provider_status_reconciled`
  audit entry. Browser QA confirms zero live calls afterwards; its unresolved follow-up was
  preserved. This is a one-off QA correction, not a
  newly implemented automatic status reconciler.
- No migration, credential-file change, commit or push in this batch. Existing uncommitted
  default-model and transfer caller-ID changes were preserved. Real conversation quality,
  end-to-end recording/booking/transfers and production deployment still require provider-backed
  QA; the suite passing does not substitute for those tests.
- Replaced the Supervisor Center's unsupported AI-errors placeholder with a tenant-scoped count of
  non-test calls started in the last 24 hours that contain a saved transcription/AI-reply failure.
  The MySQL query counts distinct calls; it does not infer failures from provider availability.
  A real-MySQL spec verifies saved failures count while test calls, another business, and calls
  older than 24 hours do not. The QA business currently shows 0 eligible calls.
- Verification: backend/frontend `tsc --noEmit`, ESLint on touched files, backend production
  build, and the focused Supervisor MySQL spec pass. Full backend Jest with `--runInBand` passes
  373/373 suites and 2,289/2,289 tests. The `--maxWorkers=2` run had a Customer Portal cleanup
  foreign-key failure; that suite passed 5/5 when rerun alone, and the sequential full rerun was
  clean. Browser QA at `/phone/supervisor` showed the real 0 count; its API returned 200 and no
  browser exceptions, console errors, or failed network requests were observed. No AI/provider
  request or telephone call was made. No migration, credential-file change, commit or push.

## Module 21 progress — automatic provider call-status reconciliation (Codex, 2026-10-18)

- Added a bounded, read-only Twilio status reconciliation job for stale `in_progress` calls.
  It checks at most 50 calls per run, every five minutes, with a two-minute age threshold,
  five-minute retry cooldown and concurrency limit of five. It never originates calls. Provider
  terminal status is applied through the existing inbound/outbound lifecycle handlers.
- Added an atomic claim timestamp and index to avoid two workers reconciling the same call at
  once. Duplicate terminal callbacks now cannot duplicate reservation release or missed-call
  side effects; outbound no-answer calls are no longer misclassified as inbound missed calls.
- Added real-MySQL coverage for terminal/active/cooldown/concurrent/missing-provider-key cases,
  duplicate callback handling, outbound no-answer, scheduler dispatch and processor dispatch.
- Added and locally applied migration `20261018231830_voice_call_status_reconciliation` (one
  nullable timestamp column and one composite index). `prisma generate` and `prisma migrate status`
  succeeded; status reports 189 migrations and a clean schema.
- Verification: backend and frontend `tsc --noEmit` pass; ESLint passes on touched backend and
  frontend files; focused tests pass (4 suites / 63 tests); full backend Jest `--maxWorkers=2`
  passes (375 suites / 2,297 tests); `git diff --check` is clean. No frontend UI changed in this
  batch, so no new visual check was needed. No paid AI request or telephone call was made.
- This is not the end-to-end production signoff: live AI speech/conversation, real PSTN audio,
  recording/transcription consent behavior and country-specific compliance still need funded
  provider QA and business/legal approval. Changes are uncommitted and not pushed.

## Module 21 progress — remaining runtime requirements (Codex, 2026-10-20)

This batch corrects the earlier over-broad completion claim. Screens alone do not fulfill the
later engine, metering, operations and acceptance sections. The detailed remaining-work ledger
is `docs/MODULE21_COMPLETION_CHECKLIST.md`; the overall goal is still active, not finished.

- Added an opt-in Twilio Media Streams / OpenAI Realtime GA PCMU bridge. Admission requires
  Twilio's signed upgrade plus a single-use, call-bound nonce; the server retains model keys.
  Audio forwarding has bounded buffers, start/provider/idle/duration timers and safe fallback.
  Caller speech clears pending Twilio playback and truncates unheard model audio. Playback
  acknowledgements distinguish completed playback from interruption. Local socket tests use a
  simulated provider, **not real OpenAI speech or a carrier call**.
- Agent versions now pin inbound/outbound availability, IANA time zone, weekly hours, holidays,
  deterministic pilot percentage, concurrency, maximum call duration and tool count, alongside
  existing tool permissions, knowledge IDs, response tokens and version budget. Existing agents
  remain recorded-turn by default. The builder has twelve navigation stages over the available
  controls; the checklist explicitly identifies the detailed wizard sub-contracts still pending.
- New drafts snapshot selected knowledge content, hashes and timestamps. Later document edits
  do not rewrite that tested corpus; new drafts capture edits. Runtime filters revoked sources,
  checks them again before new realtime responses/tools and saves source-provenance audit
  evidence. Recorded-turn snapshot retrieval is deterministic and tenant-scoped. Older versions
  without corpus snapshots retain legacy behavior until replaced. Retrieval counters are
  described as retrievals, not invented distinct call counts.
- Added allowlisted service/slot lookup, minimal caller matching, verified booking changes,
  support tickets and unsent message drafts. Write tools require caller keypad confirmation;
  sensitive changes require the existing private booking-management reference and matching
  caller. Tickets/drafts live in canonical Messaging-owned tables, not fabricated reviews.
  The call workspace shows their actual state; drafts never send a message automatically.
- Closed a separate legacy privacy gap: caller-ID matching alone no longer unlocks order or
  balance data. Recorded-turn replies require enabled sharing and the matching customer's
  private reference to a non-canceled upcoming/recent (90-day) booking, supplied with the
  question; otherwise account details/existence are withheld and staff help offered. Reference
  text is masked before model history and persisted transcript. Relevant Forms, Knowledge,
  Assistant and workspace copy was updated. Other identity-verification channels are not claimed.
- Recorded-turn booking writes now require a server-generated read-back and signed provider
  keypad callback. The call-bound request expires, supersedes older pending requests, is claimed
  atomically, refuses missing/declined/expired choices and caches the confirmed result for
  duplicate callbacks. Service identity is pinned and revalidated. Past/invalid times are refused.
  Uncertain post-write failures become review-needed rather than blindly retrying a booking.
- Added durable realtime recording import through the existing retention queue. It verifies
  provider recording ownership/completion, checks consent/deletion/expiry/legal hold, persists
  private storage before removing the extra provider copy, retries failed imports and meters
  actual uploaded bytes. MySQL tests cover duplicates, wrong call, no consent, deletion races
  and legal hold with simulated Twilio/storage. No new real recording was imported in this batch.
- Added an idempotent usage ledger: provider duration/price/currency, realtime token evidence,
  legacy voice text tokens, upload bytes, signed conference timestamps and signed LiveKit
  participant duration. Missing usage stays pending; unconfigured rates stay unpriced. Token
  list-price estimates are explicitly not invoices. Actual provider-billed QA calls still count.
- Added nullable `voice.monthlySpendCapUsd` (default no cap), a real policy Settings row,
  shared admission/turn checks and deduplicated owner in-app 70/90% warnings. Version budget
  enforcement also covers sandbox requests. No customer invoice/card charge was introduced;
  complete invoice reconciliation, selling-rate configuration and billing handoff remain open.
- Realtime sandbox uses the selected realtime provider in text-only/no-tools mode, with the
  common AI toggle/rate/cost guardrails and returned token counts. It cannot prove live audio,
  carrier quality or tool execution. No paid provider sandbox was run from the QA browser.
- Added actual first-audio p95 samples, interruption/error counts, control API latency samples
  and a bounded operational view in Supervisor. Owners receive an in-app failure-burst alert
  (3 non-test realtime failures/10 minutes, at most once/hour). External paging, historical
  availability probes and production SLO/load/accessibility acceptance remain open. Settings
  no longer claims there are no alerts, no verified rescheduling, or no billable test usage.
- Added direct `ws`/`@types/ws` dependencies. npm reported existing vulnerabilities; no broad
  unrelated audit-fix/upgrade was applied. Fixed a test fixture's four-digit clock-based phone
  number collision; the dialer MySQL suite passes alone with a high-entropy test number.
- New migrations, **applied locally**: `20261020120000_voice_realtime_usage` (2 tables) and
  `20261020140000_voice_customer_followups` (2 tables). Verified all six new foreign keys in
  `information_schema`, generated Prisma and confirmed 191 migrations with clean migration status.
- Verification checkpoint: both type checks pass; focused safety run passes 5 suites/81 tests;
  full backend `jest --maxWorkers=2` passes 384 suites/2,325 tests. A final frozen-code rerun is
  in progress and will be recorded below after it finishes. Backend production build succeeded
  before the latest safety additions; it needs refresh before those additions are browser-tested.
- Browser QA used a new isolated `QA Test Business Module21 20261020`, not the main account.
  Its non-live draft persists realtime mode, 5% pilot and 90-second limit. Twelve-step navigation
  loads and untested approval/publish buttons remain disabled; no agent was activated. Settings
  and Supervisor data/empty states load, with no captured browser warning/error entries. Screenshot:
  `/tmp/noxtill-module21-agent-publish-20261020.png`. This is targeted UI QA, not the complete
  browser end-to-end/load/red-team/accessibility or live provider signoff.
- Dev watch compiler exhausted its heap; it was replaced with a successful production build
  running on the existing local port 5001 (frontend's configured target). No credentials changed,
  no new telephone call/customer message/paid AI probe, no commit and no push in this batch.
- Frozen-code full rerun update: the process completed with 375 passed/9 failed suites,
  2,289 passed/36 failed tests. The failures are setup-hook timeouts across Credit, Reviews,
  Campaigns, Customers, AI Settings, Dashboard, Bookings Queue and the new realtime-booking
  fixture; this run took 2,757 seconds. It is **not green** and is not a replacement for the
  earlier 384-suite/2,325-test pass. The nine suites are being rerun serially to establish whether
  the failures are environmental or regressions; do not assert the cause before that evidence.
- Backend ESLint caught an unsafe matcher assignment in the new corpus-snapshot DB spec; it
  was changed to a scalar assertion and that file now passes lint. No production code changed
  for that lint correction. Remaining full done-check and latest production-build/browser refresh
  are still pending. The overall module is not ready to call complete or production-approved.
- The nine timeout suites pass when rerun serially: 9/9 suites, 36/36 tests, 4.682 seconds.
  A complete serial full-suite run is now checking the frozen code. This does not erase the
  failed parallel-run evidence or establish a production load/SLO result.
- The complete frozen-code serial rerun is green: **384/384 suites and 2,325/2,325 tests**,
  205.349 seconds. Backend `tsc --noEmit` passed before that run; frontend type/lint checks
  also passed. A fresh production build is now refreshing the running backend for browser QA.
- Added `MODULE21_RUNBOOK.md` describing actual rollout/rollback, reauthorization, signed webhook
  configuration, recording retry/deletion/legal-hold handling, uncertain booking outcomes,
  budget/provider incidents and acceptance evidence boundaries. It is not a production certificate.
- Accessibility spot check in the isolated QA Supervisor page found no visibly unnamed controls,
  but identified 26 low-contrast text samples using computed solid foreground/background colors.
  Examples: light gray `#94A3B8` on white is 2.56:1; `#7A8798` on the metric-card background is
  3.46:1. This is a real outstanding UI issue, not an AA pass. Use the existing app text tokens
  for remediation; retain the full keyboard/screen-reader/zoom audit as a separate requirement.
- Remediated the repeated low-contrast gray text/icon declarations in the Receptionist-owned
  components using the existing `--app-text-faintest` token with its existing `#667085` fallback,
  not a new palette or layout. The same computed solid-color Supervisor spot check now reports
  **0 contrast failures** (previously 26). Other screens/states and the full WCAG audit still need
  verification; do not extrapolate this spot check into whole-product conformance.
- Latest production build succeeds and the backend is being refreshed on local port 5001.
  Before restart, the only non-test `in_progress` row was the old orphan fixture
  `c9ee790f-8c64-4888-b506-aa5750e93c5b`: no owning Business and not a real Twilio SID shape.
  It was not deleted or represented as a real connected call. Runtime reconciliation had already
  recorded provider 404s for it. Preserve that diagnostic rather than guessing a real outcome.
- Agent-builder contrast check found the shared white-on-green primary button at 3.30:1.
  Receptionist primary-button backgrounds now use the existing `--app-primary-hover` token
  (`#0e8442` fallback), preserving the green theme while correcting that small-text contrast.
  This is scoped to Receptionist components, not a global rebrand. Final frontend checks and
  a rendered re-check follow; no data/API behavior was changed by this color-only correction.
- Current checkpoint verified: fresh backend build is running on port 5001; frontend typecheck
  and lint pass across the Receptionist files using the updated text/button tokens. Agent-builder
  step 12 now has zero failures in the same limited solid-color DOM contrast check; untested
  approve/publish actions remain disabled, console warnings/errors are empty, and the proof
  screenshot was refreshed at `/tmp/noxtill-module21-agent-publish-20261020.png`.
  The full frozen backend serial result remains 384 suites/2,325 tests green. No backend source
  changed during the later color-only UI pass. This closes this implementation checkpoint, **not**
  the full Module 21 goal; the requirement checklist and runbook retain the remaining code,
  broader accessibility, deployment and real-provider acceptance work. Nothing committed or pushed.

### Module 21 continuation — canonical phone booking rules (2026-10-20)

- Both recorded-turn and realtime phone creation still use `AppointmentsService`, not a second
  booking engine. Remote phone requests now enforce active services, configured business slots,
  hours, minimum notice, maximum advance, daily capacity, active same-business assigned staff
  and symmetric service buffers, including bookings without an assigned staff member.
- Added `voice.bookingsRequireStaffApproval` (default false) and its real `policyRow` under
  Settings → AI & Governance. Required deposits or missing service-specific staff assignment
  leave a real `requested` appointment; phone AI never creates an uncollected cash Deposit.
  The existing in-person walk-in cash behavior remains unchanged. Phone appointments receive
  real private management tokens, which are not spoken or exposed as tool output.
- Verified phone rescheduling reuses `PublicBookingService` with an explicit phone policy path:
  real hours/slot duration, existing notice/change-window and daily-cap rules, canonical buffers,
  active staff/service checks and a current locking read reject cancelled/completed or concurrently
  changed bookings. Required owner review leaves the change requested. Existing non-phone public
  behavior was not silently rewritten. Shared buffer logic was extracted, not duplicated.
- Canonical booking writers now acquire a tenant-wide SlotLock before exact-start locks. This
  closes races between different overlapping starts and between different services competing for
  the same daily allowance; lock acquisition stays transaction-scoped. No migration is needed.
- Recorded speech and realtime tool results distinguish requested from confirmed. The call
  workspace now asks for pending-booking review; outcome chips distinguish pending/cancelled/
  no-show/missing records, and pending/cancelled appointments are not counted as booked successes.
  Bookings from Calls explicitly labels number matching as **not verified identity**.
- Real MySQL coverage added for remote policies, deposit/approval pending states, existing walk-in
  behavior, closed/unconfigured hours, zero duration, notice/advance rules, foreign staff, buffers,
  concurrent daily-cap and overlapping requests, guarded rescheduling and cancelled bookings.
  Real realtime-tool tests cover private-reference verification and pending outcomes; recorded-turn
  response tests prove pending requests are not announced as confirmed.
- Final focused checkpoint: **5 suites / 109 tests passed**. Final frozen full backend
  `jest --maxWorkers=2`: **385/385 suites / 2,342/2,342 tests passed**, 127.218 seconds
  (`/tmp/noxtill-module21-booking-release-jest.log`). Both `tsc --noEmit` checks and touched-file
  ESLint pass. Existing unrelated Prettier formatting noise in `intelligence.ts` is excluded,
  as before; its actual lint rules pass. `git diff --check` is clean. A fresh backend build passes.
- One earlier full run was invalidated by my concurrent build regenerating Prisma: 3 suites
  could not load `.prisma/client/default.js`. Generation completed before the clean reruns; do
  not run generation/build scripts that mutate Prisma while Jest is loading it. The subsequent
  intermediate full run passed 385 suites/2,339 tests, then final reschedule additions passed
  the complete 2,342-test run above. A missing-name test fixture was also corrected; only its two
  empty QA businesses and two test HealthScoreSnapshot rows were cleaned up, not real user data.
- Executed 11 isolated CLI presentation assertions against the actual frontend derivation source
  for pending/confirmed/completed/cancelled/no-show/missing appointment states. This is not a
  new frontend E2E harness or a claim that every workspace branch was browser-exercised.
- Browser QA stayed in `QA Test Business Module21 20261020`. Staff approval was enabled there,
  saved and verified after reload; it is intentionally left on in this isolated QA business only.
  Bookings from Calls loads its honest empty state and updated disclosure. No warning/error
  console entries were captured. Evidence screenshot:
  `/tmp/noxtill-module21-booking-policy-20261020.png`. No live booking call was initiated.
- No new migration, credential edit, real phone call, paid AI probe, customer message, commit or
  push. The full Module 21 goal remains active. Remaining billing/selling-rate handoff, detailed
  wizard, immutable event recovery, video controls, broader QA/accessibility and funded live
  acceptance are still listed in `MODULE21_COMPLETION_CHECKLIST.md`; this checkpoint is not 100%.

### Module 21 continuation — agent configuration and verification (2026-10-21)

- Extended immutable AI-agent versions with explicit exclusions, structured greetings/disclosures/
  required questions/clarification/edge-case guidance, and a selectable OpenAI Realtime voice.
  The selected voice is included in the version checksum and live Realtime session setup; the
  builder now exposes these fields in the existing wizard.
- Added an owner-authorized scripted text test suite (2–8 scenarios), pinned to one immutable
  version, sequential and fail-fast on provider/budget errors. Each scenario makes an AI request
  only after the operator clicks Run; it does not place calls, run tools or write customer data.
  The UI explicitly says that a non-empty answer is not proof of correctness. Adversarial and
  structured pass/fail evaluation remain outstanding.
- Added database coverage for agent configuration/version behavior; focused real-MySQL tests
  passed (13/13). Browser inspection in the isolated QA business confirmed the wizard loads and
  reflects the selected voice; no agent was saved, published, or activated and no paid request
  or call was triggered.
- Corrected the Meetings integration-test expectation: an empty recording relation means
  `not_started`; provider unavailability is separately disclosed as `media: not_configured`.
  Made the workflow integration fixture's customer explicitly recently visited so the independent
  CRM lapsed-tag scheduler cannot mutate it during parallel full-suite runs.
- Final checks: backend and frontend `tsc --noEmit` pass; touched-file backend ESLint passes;
  full backend `npx jest --maxWorkers=2` passes **388/388 suites and 2,366/2,366 tests**; `git diff
  --check` passes. The two focused MySQL suites passed 34/34 after the fixture corrections.
- No new migration, real provider call, paid AI request, credential change, commit or push. Module
  21 remains incomplete and is not production-approved. See
  `docs/MODULE21_COMPLETION_CHECKLIST.md` for the remaining real-time provider, operations,
  billing, reliability, full end-to-end and funded live acceptance requirements.

### Module 21 follow-up — literal scenario checks (2026-10-21)

- Scripted AI-agent scenarios now accept optional per-scenario “must include” and “must not
  include” phrase assertions. Matching is case-insensitive and literal; failed assertions are
  saved on the real test-run row with an actionable reason, and a provider failure still stops
  the suite. Results separate received responses from evaluated/pass/fail counts.
- Both the single text sandbox and scenario suite disclose when correctness was not evaluated.
  The UI states that exact phrase checks are not semantic correctness, safety, or adversarial
  proof. Test evidence uses the configured AI budget only after an explicit Run action; this QA
  pass did not click either AI test button.
- Real-MySQL AI-agent tests pass 9/9, including an asserted pass and a deliberate assertion
  failure. Backend/frontend type checks and touched-file ESLint pass. Final full backend
  `npx jest --maxWorkers=2` passes **388/388 suites and 2,366/2,366 tests**. Browser QA confirmed
  the Test Lab exposes both assertion fields and their limitations; browser dev-console access
  was unavailable for this tab, and no test request was sent.
- No schema migration, real provider call, paid model request, commit, or push. Broader model
  evaluation, real speech/telephony acceptance, operations, billing, accessibility and deployment
  requirements remain open as listed in `MODULE21_COMPLETION_CHECKLIST.md`.

### Module 21 follow-up — branch-scoped AI agent handoff (2026-10-21)

- AI agents are branch-scoped using the existing child-`Business` model. The builder lists active
  owners from the selected business/branch, validates that a saved owner belongs to that exact
  scope, and snapshots the chosen owner into the immutable agent version. Calls resolve the branch
  from their dialed number and pin only that branch's published agent version.
- At AI-to-human handoff, the assigned owner is only a preference. The existing eligibility,
  active voice profile, fresh presence, capacity and retry rules still apply; if the owner is not
  available, normal dispatch may offer the call to another eligible agent.
- Real-MySQL tests cover main/child branch scope, rejection of foreign owner IDs, selected-owner
  preference under normal dispatch constraints, and child-branch version pinning. Focused tests
  passed **3 suites / 79 tests**. No migration was needed.
- Browser inspection stayed in the isolated Module21 QA business and confirmed branch label and
  selectable owner appear in the wizard; no agent was saved, published or activated and no call
  was placed.

### Module 21 follow-up — OpenAI Realtime voice sample (2026-10-21)

- Added an explicit AI-agent wizard action that generates a short audio sample using the chosen
  OpenAI Realtime voice. It is a provider request only after the operator clicks; no phone call or
  business write occurs. The UI says credits may be used, the sample is not stored, and the saved
  version's budget applies.
- The backend validates the selected voice and tenant-owned agent version, checks the AI toggle,
  rate/cost guardrail and version budget, rejects incomplete audio/token usage, then records the
  returned tokens and an estimated USD cost in voice usage and AI logs and writes an audit event.
  Audio is returned as transient PCM for browser playback and is not persisted.
- Real-MySQL tests with a local simulated Realtime provider pass **2 suites / 14 tests**, covering
  PCM receipt, measured token/cost records, audit evidence and tenant/version scoping. No live
  provider request was made.
- Browser QA in the isolated Module21 QA business confirmed the wizard and voice-preview control
  render; reload returned HTTP 200 and the page's API requests returned successfully, with no
  console exceptions or failed network requests observed. The paid preview button was not clicked.
- Updated stale Settings API documentation to distinguish the Twilio voice picker/Polly preview
  from the AI-agent OpenAI Realtime sample.
- Backend and frontend `tsc --noEmit`, ESLint on touched backend/frontend files, and the full
  backend `npx jest --maxWorkers=2` pass (**388 suites / 2,371 tests**). The generated audio itself
  still needs a funded-provider check. No migration, commit or push. Remaining evaluation,
  operations, billing, accessibility, deployment and live-provider acceptance are still open.

### Module 21 follow-up — transcription and retention usage units (2026-10-21)

- OpenAI Whisper transcription now requests `verbose_json` and returns provider-reported input
  duration when present, without changing the existing text-only `transcribe()` contract. Phone
  recordings and consented meeting transcription save idempotent `transcription_audio_seconds`
  usage evidence. Missing provider duration stays missing; no cost is inferred.
- On successful retention deletion, uploaded phone recordings now record `recording_storage_byte_days`
  from the existing successful-upload byte measurement through confirmed deletion. Meeting recording
  cleanup records the same unit from finalized byte size through confirmed deletion. Legacy rows
  without reliable upload/finalization evidence are not backfilled. Prices remain unconfigured.
- Added real-MySQL coverage for transcription unit persistence, duplicate-proof metering, meeting
  transcription usage, call retention deletion and meeting recording cleanup; added Speech-to-Text
  response parsing tests. Focused final run: **6 suites / 77 tests passed**. Full backend
  `npx jest --maxWorkers=2`: **389 suites / 2,375 tests passed**. Backend/frontend `tsc --noEmit`
  and touched-file ESLint passed. No migration needed.
- The usage screen now clarifies that byte-days appear only after retention cleanup. No live OpenAI,
  Twilio, or S3 request was made; this is provider-shaped test evidence, not invoice reconciliation.
  No commit or push. Billing for audio, egress, phone/SMS and provider invoice reconciliation remain
  incomplete, along with broader production acceptance listed in `MODULE21_COMPLETION_CHECKLIST.md`.

### Module 21 follow-up — provider SMS and measured S3 reads (2026-10-21)

- The scheduled Twilio provider-cost worker now reads actual Message resources for sent missed-call
  text-backs attached to non-test calls. It stores the provider-reported message charge/currency and
  segment count as separate idempotent usage rows, retries a delayed price, and leaves it pending or
  unpriced rather than estimating. Other SMS and phone-number recurring fees are not covered.
- Bounded Twilio call-cost polling now uses oldest-first ordering with a stable ID tie-breaker so a
  queue larger than one batch cannot indefinitely starve older calls.
- Consented meeting transcription records the exact successful private S3 read bytes as an unpriced
  storage-egress measurement. It does not label local-disk reads or signed end-user downloads as
  S3 egress. The settings usage copy and completion checklist disclose these boundaries.
- Real-MySQL tests cover actual-shaped SMS message price/segments, price retry, duplicate protection,
  deterministic Twilio batch ordering, S3 read-byte measurement, and exclusion of local storage from
  cloud egress. Focused tests: **3 suites / 14 tests passed**. Backend/frontend `tsc --noEmit` and
  touched-file ESLint passed. Full backend `npx jest --maxWorkers=2`: **389 suites / 2,379 tests
  passed**. `git diff --check` passed.
- Browser QA opened Receptionist Settings in the isolated Module21 QA business: the page loaded,
  provider/usage data resolved, Twilio account and public webhook checks reported OK, and the screen
  honestly showed no provisioned business number, local-disk recording storage, no monthly metered
  rows, and no configured phone spend cap. The browser console capability was unavailable, so no
  console-error claim is made. No data was changed and no live call or paid AI request was made.
- No migration, commit or push. Full SMS billing, signed-download egress, phone-number recurring
  fees, approved selling rates and Billing handoff, event projector/replay/dead-letter coverage,
  external deployment/monitoring, semantic/adversarial QA, WCAG and funded live-provider acceptance
  remain open. See `MODULE21_COMPLETION_CHECKLIST.md`; this does not complete the module.

### Module 21 follow-up — callback sequencing and durable status inbox (2026-10-21)

- Added monotonic Twilio SequenceNumber handling for call and transfer status callbacks so stale
  deliveries cannot roll back a newer call state or provider-confirmed transfer. Added two real-
  MySQL cases for reversed call and transfer callback order.
- Added a tenant-scoped durable inbox for signed `call.status` and `transfer.status` events: stable
  idempotency hashes, sanitized payload allowlist, processing leases, bounded retries, dead-letter
  after five consecutive failures, and audited operator replay from Supervisor Center. This is
  intentionally only these two event types; other callback endpoints are not yet part of the inbox.
- Applied migrations `20261021140000_voice_callback_sequences` and
  `20261021160000_voice_provider_webhook_events`; verified the columns/table/Business foreign key
  and `prisma migrate status` reports the local database up to date (196 migrations). `prisma
  generate` completed.
- Verification: backend and frontend `tsc --noEmit` passed; ESLint passed for touched backend and
  frontend files; full backend `npx jest --maxWorkers=2` passed **390/390 suites and 2,386/2,386
  tests**; `git diff --check` passed. Browser QA in the already isolated QA business loaded all 21
  Receptionist/Phone routes without a login redirect, visually inspected Supervisor Center, and
  confirmed the callback recovery empty state (“No failed provider callbacks”) with no active
  calls. Browser console/network inspection was unavailable, so no clean-console claim is made;
  no live call or paid AI request was made.
- No commit or push. Provider/live acceptance, broader callback projection/replay, and all other
  remaining items in `MODULE21_COMPLETION_CHECKLIST.md` are still outstanding.

### Module 21 follow-up — agent-leg callback ordering (2026-10-21)

- Twilio human-agent dial callbacks now use `SequenceNumber` as a compare-and-set guard on the
  assignment. An older `no-answer` delivered after a newer `in-progress` cannot release the
  connected agent or start another transfer attempt. Newer terminal status still releases capacity.
- Added real-MySQL coverage: `in-progress` sequence 8, stale `no-answer` sequence 7, then completed
  sequence 9. Focused `voice-call.service.spec.ts`: **1 suite / 60 tests passed**.
- Applied `20261021180000_voice_agent_status_sequence`; verified the new nullable column and clean
  migration status (197 local migrations). Regenerated Prisma Client.
- Backend and frontend `tsc --noEmit` passed, touched-file backend ESLint passed, `git diff --check`
  passed, and the post-change full backend `npx jest --maxWorkers=2` passed **390/390 suites and
  2,386/2,386 tests**. No live provider calls or paid AI requests were made.
- No commit or push. The dial-status event is sequence-protected but not yet part of the durable
  callback inbox. Funded provider acceptance, broad event projector coverage, reliability, billing,
  accessibility, deployment and final requirement audit remain open.

### Module 21 follow-up — explicit voice prompt trust boundary (2026-10-21)

- Recorded-turn calls now pass the immutable platform voice safety rules and subordinate agent
  guidance in the provider's actual `system` field through `AiInfraService.createMessage`; caller
  transcripts and matched business records are serialized separately as explicitly untrusted user
  input. The realtime and agent-sandbox paths use the same trust hierarchy. Server-side tool
  allowlists and confirmation checks remain authoritative.
- Updated the real-MySQL outbound AI spec to mock `createMessage` deterministically, so its approved-
  action and provider-outage cases exercise the current provider adapter without calling a paid
  model. Focused outbound suite: **1 suite / 3 tests passed**.
- Verification: backend/frontend `tsc --noEmit` passed; ESLint passed for touched backend files;
  full backend `npx jest --maxWorkers=2` passed **391/391 suites and 2,389/2,389 tests**;
  `git diff --check` passed. No migration, browser QA, live provider request, commit or push.
- Prompt construction is not proof of model resistance. Funded speech/provider acceptance, semantic
  and adversarial evaluations, deployment/reliability, billing reconciliation, accessibility, and
  the final requirement-by-requirement release audit remain open as listed in
  `MODULE21_COMPLETION_CHECKLIST.md`.

### Module 21 follow-up — replay-safe provider callbacks (2026-10-21)

- Extended the tenant-scoped callback inbox with signed Twilio conference-usage and completed
  realtime-recording events. Only allowlisted fields are persisted; duplicate events are deduped;
  conference metering is idempotent and recording import reuses its stable queue job/storage key.
  Failed projections use the existing bounded retry, dead-letter and audited replay flow. Command-
  bearing TwiML routes remain out of blind replay.
- Added real-MySQL coverage for duplicate conference callbacks, omission of an unneeded provider
  field, recording queue failure, operator replay and audit. Focused suite: **1 suite / 6 tests
  passed**. No schema or migration change.
- Verification: backend and frontend `tsc --noEmit` passed; ESLint passed for the touched backend
  files; full backend `npx jest --maxWorkers=2` passed **391/391 suites and 2,391/2,391 tests**;
  `git diff --check` passed. Read-only browser QA in the QA business loaded Supervisor Center and
  showed the updated four callback types with the honest empty state; no test events or business
  data were created. Browser console/network were not inspected. No live provider calls, commit or
  push.
- Other callback types still require per-event idempotency/replay analysis before joining this inbox;
  live provider delivery, funding, external deployment, operational billing and acceptance remain
  open in `MODULE21_COMPLETION_CHECKLIST.md`.

### Module 21 follow-up — hostile caller boundary test (2026-10-21)

- Extended the real-MySQL recorded-turn tool-permission case with an adversarial caller utterance
  asking the agent to ignore policy, disclose business knowledge and transfer to the owner. The
  test confirms caller text stays in the untrusted user payload, not the system policy; an
  unselected knowledge canary is not supplied; and a model-proposed transfer with no pinned tools
  produces no transfer row, appointment or `<Dial>` action. This is deterministic server/prompt
  boundary evidence, not a live-model resistance or red-team test.
- A trial to place human-agent dial-status callbacks in the durable retry inbox was rejected before
  keeping it: the existing projector can persist a Twilio sequence before finishing follow-on
  dispatch, so a retry after partial failure could no-op rather than resume. The route remains on
  its existing direct path until that transition can be made genuinely replay-safe.
- Fixed a parallel integration-test cleanup race in
  `customer-portal.service.db.spec.ts`: background processors can attach activity events to that
  spec's unique temporary business, so cleanup now removes those test-owned activity rows before
  deleting the business. The portal DB suite passed alone (1 suite / 5 tests).
- Verification on the final working tree: backend and frontend `tsc --noEmit` passed; ESLint passed
  for the changed backend specs; full backend `npx jest --maxWorkers=2` passed **391/391 suites and
  2,391/2,391 tests**. `git diff --check` passed. Read-only browser QA loaded Supervisor Center
  in the existing QA session and confirmed the callback-recovery disclosure and empty state; browser
  console/network were not inspected. No real call, paid AI request, migration, commit or push.
- Independent semantic and model-backed adversarial evaluation, funded live provider acceptance,
  external operations, full billing reconciliation, accessibility review and final release audit
  remain open; see `MODULE21_COMPLETION_CHECKLIST.md`.

### Module 21 follow-up — expected sandbox outcome assertions (2026-10-21)

- Added an optional expected-outcome assertion to the AI Agent Test Lab for `continue`, `book`,
  `message`, `transfer` or `end`. The text-only sandbox asks the model for `{reply, intent}`, saves
  both the owner's expectation and model-reported label with the test record, and records a typed
  assertion failure when they differ or the response is malformed. The UI explicitly labels this a
  model self-report; it does not execute tools or prove semantic correctness, safety or live-call
  behavior.
- Added nullable `expected_intent` / `actual_intent` fields to
  `VoiceAiAgentTestRun`. Applied
  `20261021200000_voice_ai_agent_test_outcomes` via `prisma db execute` (exit 0), marked it applied,
  regenerated Prisma Client, verified both columns through `information_schema`, and confirmed all
  198 migrations are applied.
- Real-MySQL coverage proves matching and mismatching outcomes are stored and the mismatch is
  reported. Focused test: **1 passed**. Backend and frontend `tsc --noEmit` passed; ESLint passed
  for touched files; full backend `npx jest --maxWorkers=2` passed **391/391 suites and 2,392/2,392
  tests**. `git diff --check` passed. Read-only browser QA opened `/phone/agents` → Test Lab and
  visually confirmed the expected-outcome field and self-report disclaimer; the paid suite was not
  run and browser console/network logs were not inspected. No live call or paid AI request was made;
  no commit or push.
- Module 21 remains not production-accepted: funded Twilio/OpenAI/LiveKit tests, model-backed red-team
  evaluation, external deployment/monitoring, complete provider billing reconciliation, accessibility
  review, and a final spec acceptance audit remain open in `MODULE21_COMPLETION_CHECKLIST.md`.

### Module 21 follow-up — recoverable human-agent callbacks (2026-10-21)

- Added signed human-agent `dial-status` events to the existing durable callback inbox. The
  assignment's pending action is persisted in the same state update as the observed sequence/status.
  A replay resumes an interrupted connection-outcome update, next-agent reservation or call-close
  step. It can recover a reservation committed before the original callback finished. The earlier
  rejected trial is superseded by these persistent checkpoints.
- Added a persisted provider-dispatch claim and timestamp before originating an internal agent leg.
  Known provider rejection can move to the next agent. Lost responses, timeouts, missing identifiers
  or duplicate-label uncertainty remain unresolved and cannot originate the same reservation again.
  A signed callback can supply the leg SID and resume the waiting projection. Unknown dispatches retain
  capacity past their offer timer, including in inbound routing, the human dialer and Agents counts.
  Call-close errors now remain retryable instead of being swallowed.
- Applied `20261021210000_voice_agent_callback_recovery` with `prisma db execute` (exit 0), resolved
  it as applied, regenerated Prisma Client and verified its three nullable columns in
  `information_schema`. All 199 local migrations are applied; no new foreign key or tenant model
  registration was required.
- Real-MySQL cases cover duplicate inbox events, a failure after consuming a callback sequence,
  recovery of the next reservation, a lost originate response, repeat replay without another provider
  call, reconciliation by a later signed callback, a failed close request, and uncertain-capacity
  protection. Focused checks: **4 suites / 86 tests passed**. Provider responses are simulated.
- Backend and frontend `tsc --noEmit` and touched-file ESLint passed. Full backend
  `npx jest --maxWorkers=2`: **391/391 suites and 2,394/2,394 tests passed**. `git diff --check` passed.
  Read-only browser QA in the isolated Module21 QA business verified the Supervisor recovery copy
  and empty state; captured console error logs were empty. A separate network trace was not captured.
  No real call, paid AI request, commit or push.
- Other asynchronous callbacks, complete billing/selling-rate handoff, deployment and funded
  acceptance remain open. The original `calllll.docx` is missing from Downloads and was not found
  in the available task attachments; final source-spec acceptance needs it restored. The goal
  remains active and implementation can continue from the tracked requirements.

## Module 21 — Claude Code takeover after Codex's limit (2026-10-21)

- Committed Codex's uncommitted batch (178 files, 12 migrations) as `8f41a14` (backend), `d4feea3`
  (frontend), `b6c8cdd` (docs) after a full Jest run (391/392; the one failing suite passed alone).
- Added: Stripe hand-off for approved usage drafts (`572c643`); readiness probe and request-id
  correlation (`ccfb591`, `971e67c`, request-id commit); Playwright + axe suite for all 17 screens
  with the WCAG AA fixes it found, 35/35 (`97f456d`); GET-only load script (`971e67c`); Test Lab
  safety attack pack (`a9bc57b`); webhook inbox for dialer/voicemail/call-back status (`a8ce86c`);
  phone-number fee metering and a read-only Twilio reconciliation script (`e4d84d9`).
- Load testing found and fixed two real issues: health probes were rate-limited, and concurrent
  readiness checks raced on Redis and falsely returned 503.
- Verification: full backend Jest 397/397 suites, 2,415 tests; backend and frontend tsc clean;
  browser suite 35/35. No live provider call, video room, message or invoice was made.
- Status and go-live list: `docs/MODULE21_RELEASE_REPORT.md`.
- Follow-up (same day): external alert forwarding to OPS_ALERT_WEBHOOK_URL (`55fddfe`), Stripe credits
  for posted usage (`cacd7a0`), independent AI safety review in the Test Lab (`600014e`, `94d3cb8`),
  keyboard-only browser check with a date-picker focus fix (`618fa5f`). Final verification: backend
  Jest 399/399 suites, 2,422 tests; backend and frontend tsc clean; migrations up to date; browser
  suite 52/52.

## Five Specialized AI Agents — Inventory procurement handoff (2026-10-22)

- Added the first bounded specialist action: a saved Inventory reorder recommendation prepares an
  existing ProcurementRequest draft, edited/submitted through Procurement, approved in the existing
  Dashboard Action Center, then converted once into a canonical draft PurchaseOrder. No duplicate
  approval engine, stock mutation, supplier sending or financial posting. The other four agents
  remain initial review slices; the full five-agent specification is not complete.
- The request pins the original evidence, source hash, exact versioned payload hash and 24-hour
  expiry. Submit/approve/convert recheck stock/sales/incoming POs, current role permissions, enabled
  modules and the agent switch. Concurrent prepare retries reuse one request. Stale proposals remain
  rejectable; RFQ sourcing is refused until that adapter can enforce the same contract. Supplier
  sending/provider idempotency, outcome verification and the wider orchestration remain open.
- Applied `20261022190000_inventory_agent_procurement_handoff` with `prisma db execute` (exit 0),
  marked applied, regenerated client; FK verified in `information_schema`. All 205 migrations are
  applied. Unrelated index/FK drift was excluded.
- Seven real-MySQL tests cover this handoff, tenant isolation, concurrent retries, stale/expired or
  tampered proposals, kill switch/role revocation, unchanged stock and canonical draft PO identity.
  Browser QA in a newly signed-up QA Specialist Agents business passed the complete create → edit →
  submit → Action Center approve → convert flow with no browser console/page errors or API 5xx in
  the passing run. Screenshots inspected. The missing `.dc.html` reference prevents a reference
  pixel comparison; existing styling is retained. The QA backend used port 5001 because macOS owns
  5000; separate QA Redis 6381. Both temporary QA servers were stopped afterwards.
- Browser QA found/fixed a long-reason conversion failure (PO note is VARCHAR(191)); the PO now
  references its request and the full evidence/rationale remains on that request. Added regression
  coverage. React Query button calls no longer create unhandled rejected mutation promises.
- Final checks: backend/frontend `tsc --noEmit` passed; touched-file ESLint passed; fabrication grep
  and `git diff --check` passed; full backend Jest **406/406 suites, 2,450/2,450 tests passed**;
  Playwright **1/1 end-to-end flow passed**. More detail in
  `docs/SPECIALIZED_AI_AGENTS_REPOSITORY_AUDIT.md`. Nothing committed or pushed.

## Five Specialized AI Agents — Customer profile review (2026-10-22)

- Added `GET /customers/:id/intelligence` and an on-demand panel in the existing Customer Profile.
  Real source projections cover adjacent 30-day completed-order counts, 90-day booking/message
  statuses, next booking, recorded loyalty/membership state and authorized note/support metadata.
  No duplicated customer master, retained personal summary, AI provider call or new migration.
- Explicit method: fewer completed orders than the customer's prior window is a human review cue
  only when the previous window has at least three orders. Sparse history is disclosed; confidence
  is uncalibrated. Unresolved support has precedence only with Voice access. This is a partial
  deterministic review, not the complete AI Customer 360/retention contract.
- Fresh `CUSTOMER_AGENT_RUN` permission and kill-switch checks; `PROFIT_VIEW` for money and no
  monetary context for Staff. Existing note-visibility setting is enforced; no note/message/ticket
  content, contacts, credit or plan prices are returned. Source modules disabled at the root are
  excluded, including when working in a branch. Erased customers and foreign IDs are refused.
- Marketing consent/opt-out/status produce exclusions or a channel-check-required disclosure,
  never send authorization. No messages, campaign or follow-up task is created. Queued/sent states
  are not counted as delivered/read. `Cache-Control: no-store`, no inactive query retention, open
  panel polling/focus refresh, and old review data hidden on query error.
- Nine real-MySQL tests pass; four related suites / 34 tests pass. Browser QA in a newly signed-up
  QA Specialist Agents business passed the previous Inventory approval flow and the new Customer
  profile review with an actual test sale, consent exclusion/update/refresh and evidence details.
  No browser console/page errors or API 5xx; screenshot inspected. Temporary QA servers stopped.
- Final checks: backend/frontend `tsc --noEmit`, touched-file ESLint, fabrication grep and
  `git diff --check` pass; full backend Jest **407/407 suites, 2,459/2,459 tests passed**;
  Playwright **1/1 combined browser scenario passed**. No commit or push.
- Still open: full authorized Customer 360 narrative, versioned segment/action handoffs, follow-up
  tasks/message drafts, wider source context, calibrated retention, scheduling and metering. See
  `docs/SPECIALIZED_AI_AGENTS_REPOSITORY_AUDIT.md`; the full five-agent module is not complete.

## Five Specialized AI Agents — Editable segment proposals (2026-10-22)

- Added prepare/list/get/revise/reject endpoints under `/customers` and a drafts panel inside the
  existing Segments page. Customer Insights prepares a completed current-business recommendation.
  Its existing recommendation JSON stores versioned rule proposals, not another Segment/customer
  master or approval inbox. No migration, canonical Segment creation, campaign or message sending.
- Explicit L1 boundary: the UI says canonical segment creation/approval handoff is not connected.
  Normal manual Segment creation still works separately. Extracted/reused its existing rule-builder
  UI; it retains existing field/operator behavior for ordinary manually created Segments.
- Each revision retains normalized rules/name, reason, actor/time, SHA-256 and aggregate match/
  exclusion counts at save time. Live counts reuse the existing Segments matcher and are refreshed
  on load/save. Exclusions are disjoint inactive/erased → opted out → missing consent; passing flags
  is not permission to send. No member IDs or contact details enter the proposal.
- Only recorded visits, signup/visit dates and consent/opt-out conditions are supported by this
  bounded adapter. Identity, tag/sensitive-trait and financial targeting are refused. Validates
  field/operator/value combinations and dates. Twelve conditions, fifty revisions, original-source
  24-hour expiry; row locking and expected-version checks protect concurrent prepare/edit requests.
  Fresh agent/manage permissions, agent switch and module selection guard writes. Authorized
  rejection with a reason remains possible after expiry or agent disablement.
- Seven real-MySQL tests pass; related focused checks **3 suites / 24 tests passed**. Browser QA
  passed prepare → version-2 edit → counts/history inspection → reasoned reject; confirmed that no
  canonical Segment existed, then separately exercised ordinary manual Segment creation. The
  expanded scenario also rechecked the previous Inventory approval and Customer profile flows.
  No console/page errors or API 5xx; screenshot inspected. Temporary QA servers stopped.
- Final backend/frontend type checks, touched-file ESLint, fabrication grep and `git diff --check`
  pass. Full backend Jest **408/408 suites, 2,466/2,466 tests passed**. Playwright **1/1 expanded
  scenario passed**. No commit or push. Canonical segment approval/application and wider agent
  actions, scheduling and metering remain open; see the specialist audit.

## Five Specialized AI Agents — Exact Segment approval/application (2026-10-23)

- Customer proposals now submit into the existing Action Center. Exact human approval pins the
  revision, rule payload and aggregate audience/exclusion hashes and saves a canonical Segment
  through `SegmentsService`. No campaign/message is sent. Reasoned reject/withdraw, original expiry,
  live permission/module/agent checks, row-lock retries and audit history are enforced.
- Segment provenance/version/hash make later canonical edits invalidate agent approval and block
  the shared audience resolver. A fresh review reads the real canonical definition; reapproval
  updates the same Segment. A racing canonical edit requires withdrawal/rebase. Deleted Segments
  are not silently recreated. Manual Segments continue to work. Definitions now require Customers
  management capability. Action Center complete/dismiss/snooze/mark-read cannot bypass approval.
- UI in existing Insights/Segments/Action Center shows exact previews, history, verified/changed/
  missing canonical state and disabled audience actions until reapproval. Deep links load older
  proposals outside the latest-20 list. Stale unsupported copy was replaced, including Settings.
- Applied `20261022210000_customer_segment_approval` (four reviewed SQL statements only) using
  db execute → resolve → generate; its FK is asserted against information_schema. All 206
  migrations applied. Excluded unrelated voice/RFQ/index drift. No new duplicated tenant master.
- Final backend/frontend type checks pass. Full backend Jest **408 suites / 2,474 tests passed**;
  segment DB coverage is 15 tests (8 added). Touched lint has no new errors; intelligence settings
  have the same 74 pre-existing Prettier-only errors as HEAD. Fabrication grep/diff check pass.
- Playwright **1/1 expanded scenario passed**: previous Inventory/profile flows, exact Segment
  approval, canonical invalidation/reapproval, rejection/manual creation, and old queue links.
  No console/page errors or API 5xx; screenshots inspected. `.dc.html` refs remain absent, so no
  reference pixel comparison. The final browser run used explicitly blocked provider env keys and
  no recurring global queue jobs (Redis verified 0 registrations). The prior launcher allowed
  Prisma's schema-relative env auto-load and three background stale-call status GETs returned 404;
  those status-check timestamps were updated, but no calls were placed. Hardened the test launcher
  only; no application policy bypass. No specialist AI usage logs were recorded across this turn's
  browser QA businesses. See the audit for detail. Temporary QA servers/Redis stopped afterwards.
- No commit/push. Full five-agent module remains unfinished; wider Customer actions and the other
  specialists' action/scheduling/metering contracts remain. See the specialist audit for detail.

## Five Specialized AI Agents — Customer follow-up tasks and message drafts (2026-10-23)

- Added a tenant-scoped, idempotent `CustomerFollowUpTask` with audit events and manager/assigned-
  staff completion rules. It appears in the existing Action Center and Staff Tasks; generic
  dismiss/snooze/complete cannot bypass the CRM completion endpoint.
- Reused canonical `MessageDraft` for staff-written customer copy. Active customer, marketing
  consent, no opt-out, Unified Inbox enabled, agent switch and permissions are checked. Saving
  creates no `Message`, queue job or delivery. AI-generated text is still missing; the UI states
  that clearly, and no customer PII was sent to an AI provider.
- Applied handwritten migration `20261023100000_customer_agent_followup`; Prisma generation and
  `information_schema` FK checks pass, and MySQL reports 207/207 migrations applied.
- Real-MySQL tests: 5 focused suites / 43 tests pass. Full backend Jest: **409/409 suites,
  2,479/2,479 tests passed**. Backend/frontend type checks and touched-file ESLint pass;
  fabrication grep and `git diff --check` pass. Playwright **1/1** combined isolated QA flow passed,
  including creating/completing the task and saving a draft; screenshot inspected, no console/page
  errors or API 5xx. Temporary QA services stopped; no paid provider call was made.
- No commit or push. Accumulated work remains uncommitted. The five-agent module is not complete;
  Customer AI copy and other agents' action/scheduling/metering work remain. Design references are
  absent, so pixel-perfect comparison is not claimed.

## Five Specialized AI Agents — AI customer message drafts and editing (2026-10-23)

- Added a purpose-limited AI draft endpoint for booking, order, support, feedback and general
  follow-up. It calls the existing `AiInfraService.createMessage`, so shared AI enablement,
  rate-limit and cost-cap checks still apply. The request contains only the approved purpose
  instruction; it does not send customer identity, contact details, orders, notes or history.
- AI output is saved to the existing `MessageDraft` record as a review-only draft. Staff can edit
  drafts before review. Customer activity/consent, opt-out, Unified Inbox, module, capability and
  agent checks remain enforced. No `Message`, send job or delivery is created. AI-origin remains
  visible after editing; all actions are audited. If the provider is unavailable, the API returns
  typed `CUSTOMER_AGENT_AI_UNAVAILABLE` (503) and saves nothing.
- Real-MySQL Customer Agent action spec: **7 tests passed**, including provider-disabled behavior,
  idempotent AI drafts, absence of PII in the AI request, draft editing and no send side effect.
  Full backend Jest: **409/409 suites, 2,481/2,481 tests passed**. Backend/frontend `tsc --noEmit`,
  backend build, touched-file ESLint, and `git diff --check` pass. Prisma reports **207/207
  migrations applied**; no migration was added for AI drafts/editing.
- Isolated Playwright QA: **1/1 scenario passed**, including follow-up task creation/completion,
  staff-written draft save/edit, and provider-unavailable UI. Provider credentials were blocked;
  the expected 503 was surfaced as an unavailable notice. No paid/live AI request or message send
  occurred. Screenshot inspected; temporary QA services stopped. Static-number/random fabrication
  grep found no matches in the touched Customer Agent files.
- No commit or push. The broader five-agent module is still unfinished; this completes only the
  bounded Customer Agent follow-up/draft slice. Design references are absent, so pixel-perfect
  comparison is not claimed.

## Five Specialized AI Agents — Inventory back-in-stock review cue (2026-10-23)

- Inventory Agent now reads the canonical `ProductWaitlistEntry` aggregate for active, tracked
  products with positive on-hand stock and unnotified waitlist entries. It persists a review-only
  recommendation with count, current stock and source evidence; it excludes customer IDs/contact
  details and does not inspect consent or treat the count as send authorization.
- “Review canonical waitlist” opens the existing Inventory waitlist modal. The agent does not
  generate a per-customer message, alter waitlist records, queue a delivery or send anything. The
  existing canonical notification flow remains responsible for channel eligibility when a user
  explicitly chooses to notify.
- Real-MySQL `inventory-intelligence.service.db.spec.ts`: **3 tests passed**, including a pending
  versus already-notified waitlist count and exclusion of fixture contact details from the finding.
  Full backend Jest: **409/409 suites, 2,481/2,481 tests passed**. Backend/frontend type checks,
  backend build, touched-file ESLint, fabrication grep and `git diff --check` pass. MySQL remains
  at **207/207 migrations applied**; no schema change was required.
- Isolated Playwright: **1/1 scenario passed**. It creates a test waitlist entry with marketing
  consent off, runs the Inventory Agent, opens the existing waitlist, and verifies the actual
  waiting row/count without pressing “Notify Waitlist”. Screenshot inspected; temporary QA
  services stopped and provider keys blocked.
- No commit or push. This is a review cue, not the full approved notification-preparation lifecycle;
  customer-level eligibility preview and notification approval remain outstanding. The five-agent
  module remains incomplete.

## Five Specialized AI Agents — Inventory branch rebalance review (2026-10-23)

- Inventory Agent compares active products across the caller's own branch group, matching only SKUs
  that are unique at both locations (the canonical transfer service's identity rule). Sender
  surplus is on-hand less pending/approved outbound transfers, compared with 120 days of cover at
  trailing 30-day recorded sales velocity. Receiver risk uses its canonical low-stock threshold
  after open outbound, approved inbound and shipped in-transit quantities.
- Findings include source evidence and link to canonical Stock Transfers. They never create a
  transfer or change stock. The inventory schema has no separate reservation ledger; that, and
  missing product-specific transfer lead time/UOM/seasonality, are disclosed in each finding.
- Real-MySQL Inventory tests pass 3/3, including approved-outbound and in-transit accounting and
  checks that stock/transfer rows remain unchanged. Full backend Jest passes **409 suites / 2,481
  tests**. Backend/frontend `tsc --noEmit`, backend build/Prisma generation and touched-file ESLint
  pass. Playwright passes **2/2** including setup and the end-to-end scenario; screenshot inspected,
  provider credentials blocked and temporary QA services stopped. No migration was needed.
- No commit or push; this is a review-only transfer recommendation, not a full approved transfer
  lifecycle. The five-agent specification remains unfinished.

## Five Specialized AI Agents — Inventory repeated applied-count review (2026-10-23)

- Inventory Agent now finds active products with adjustment movements in the trailing 90 days
  that reference at least two distinct, applied `StockCount` records. It verifies that each count
  is applied, has `appliedAt`, and includes the adjusted product before counting evidence.
- Findings report the count IDs, adjustment count, absolute and net units, and observed dates. The
  UI links to canonical Stock Count for a fresh recount; it does not change stock or infer a cause.
  Missing structured discrepancy causes and a configurable materiality threshold are disclosed.
- Inventory Agent also surfaces a value-at-cost snapshot and the value of rows with the existing
  overstock flag, reusing `stockValue`/`overstocked` from `InventoryService.listInventory()` rather
  than adding a second valuation formula. The UI links to canonical Inventory Valuation and
  discloses zero recorded cost rows; it labels the amount as carrying value, not cash or loss.
- Real-MySQL Inventory tests pass **3/3**, covering repeated applied corrections, valuation
  evidence and assertions that analysis leaves stock and movement rows unchanged. Backend and
  frontend `tsc --noEmit`, backend build/Prisma generation and touched ESLint pass. Full Jest had
  **407/409 suites and 2,468/2,481 tests pass**; the unrelated Competitive Opportunities and Cash
  Register suites hit timeouts during the parallel run, then passed isolated (**8/8** and **12/12**).
  Isolated Playwright passes **2/2** including setup; page/console/network assertions pass and the
  $45 QA cost snapshot was confirmed. Provider keys were blocked and temporary QA services stopped.
- No migration, commit or push. This is a discrepancy-review cue, not automatic recount task
  creation or write-off; unknown-vs-zero cost, structured causes and a materiality setting remain
  unsupported. The five-agent spec remains unfinished.

## Inventory Agent — audited recount request handoff (2026-10-23)

Added a tenant-scoped recount task for an eligible inventory count-discrepancy recommendation. A
request is idempotent per recommendation, checks business/agent/product ownership, and writes an
audit event. The task links to the canonical Stock Count flow; creating a physical count draft for
that product closes the open request and links the draft. It does not itself apply stock changes;
the existing stock-count apply flow remains the only path that changes inventory.

Verification: migration `20261023120000_inventory_agent_count_tasks` was applied and resolved;
Prisma reports **208/208 migrations applied**, with the tenant/product/recommendation/count foreign
keys verified by the real-MySQL spec. Inventory DB spec passes **5/5**; the last full backend Jest
run passes **409 suites / 2,483 tests**, backend and frontend type checks pass, and touched-file
ESLint plus `git diff --check` pass. Isolated Playwright passes **1/1**; it creates a variance
finding, requests a recount, records a later count, and verifies the task is completed on reload.
The combined flow also checks the Inventory-to-Procurement handoff and customer-agent screens. The
Inventory screenshot was inspected; the server's AI-unconfigured state was disclosed. The agent
made no provider request and no stock mutation. No commit or push.

The first browser attempt hit a login hydration race and timed out; adding a network-idle wait to the
isolated test fixed the harness, and the rerun passed. The QA business is separate from the main
account. This is one Inventory Agent capability, not completion of the five-agent spec.

## Inventory Agent — reasoned recount-request dismissal (2026-10-23)

Open recount requests can now be dismissed by an authorized owner/manager with a required 5–500
character reason. The tenant-scoped service conditionally changes only an open request, records the
actor, timestamp and reason, and writes an audit event. Repeated or cross-business dismissal is
refused. The Inventory page shows the decision and reason; dismissal does not create a stock count,
movement or balance change.

Verification: handwritten migration `20261023130000_inventory_agent_count_task_dismissal` is
applied; Prisma reports **209/209 migrations up to date**. Inventory real-MySQL spec passes **6/6**;
full backend Jest passes **409 suites / 2,484 tests**. Backend/frontend `tsc --noEmit`, backend
build, touched-file ESLint and `git diff --check` pass. Isolated Playwright passes **1/1**, including
reasoned dismissal and screenshot review; the first attempt used a stale `dist` build, then passed
after rebuilding. Provider keys were blocked and no external call was made. No commit or push. This
closes one more Inventory Agent action gap; the five-agent specification remains unfinished.

## Inventory Agent — back-in-stock notification preview (2026-10-23)

Added a no-send preview for active, restocked products with unnotified waitlist entries. The
preview reuses the same send-gate preparation path as the existing notification flow, so the
current contact/channel resolution, registered template, WhatsApp template approval, and message
quota checks are reflected per recipient. Multi-recipient previews account for quota already
allocated to earlier eligible rows. The preview is audited with aggregate outcomes; it does not
create Message rows, consume quota, mark waitlist entries notified, enqueue a provider job, or
confirm delivery. The canonical user-initiated send still rechecks current conditions.

The page shows the rendered registered copy and per-recipient eligibility/reason. It explicitly
discloses that a waitlist row records a request but the system stores no separate consent evidence,
and that provider delivery is not checked by a preview. No external provider was called and no
inventory/customer record was changed.

Verification: real-MySQL waitlist/send-gate spec **6/6**; full backend Jest **409/409 suites,
2,485/2,485 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint, backend build,
`git diff --check` and Prisma migration status (**209/209 up to date**) pass. Isolated browser QA
passes **1/1** in a temporary QA business; the page/screenshot was inspected and the test confirms
the preview does not send. The first full run had unrelated Health Score and QR Poster timeouts;
both passed alone, and the clean full rerun passed. No migration, commit or push. The five-agent
specification remains unfinished.

## Inventory Agent — recorded-wastage review task (2026-10-23)

Added an idempotent, tenant-scoped review task from a recorded-wastage recommendation. Authorized
owners/managers can create it, open the canonical Wastage log, then record a review note or dismiss
with a reason. Each request/decision is audited; a task never edits stock, wastage movements, or
their source records. The finding still reports recorded movements only and does not infer a cause
or write-off.

Handwritten migration `20261023140000_inventory_agent_wastage_review_tasks` is applied and Prisma
reports **210 migrations up to date**; all three task foreign keys were verified through
`information_schema`. Inventory real-MySQL spec passes **8/8**; full backend Jest passes **409
suites / 2,487 tests**. Backend/frontend type checks, backend build, touched-file ESLint and
`git diff --check` pass. Isolated browser QA passes **1/1**, including create → record-review and a
persisted API read; screenshot plus console/API-error assertions were checked. No provider was
called. No commit or push. The five-agent specification remains unfinished.

## Five Specialized AI Agents — Customer CRM data-quality review (2026-10-23)

Customer Intelligence now includes aggregate missing-contact and duplicate-candidate evidence in
its saved review. Duplicate totals come from `CustomerDuplicatesService` and the business's existing
`CustomerMergeSettings.matchOn`; pairs are de-duplicated by canonical customer IDs, prior dismissals
are respected, and the stored evidence/output/AI prompt contain counts only—not names, emails,
phones or customer IDs. The missing-contact count is limited to active, non-erased profiles whose
email or phone field is blank. The page links to the canonical Duplicates screen for human review;
it does not merge records or check contact deliverability. Selected-branch scopes disclose that
these business-scoped counts are unavailable.

Real-MySQL Customer Intelligence spec passes **3/3**; full backend Jest passes **409 suites / 2,488
tests**. Backend/frontend `tsc --noEmit`, backend build, clean lint for the Customer Intelligence,
frontend and E2E files, and `git diff --check` pass. `customer-duplicates.service.ts` has pre-existing
lint diagnostics confirmed at HEAD; none point at the new aggregate method. Isolated Playwright
passes **1/1**, confirming a real same-email pair produces aggregate-only output and the handoff
opens the canonical review page; screenshot inspected, no browser console or API 5xx errors. No
migration, provider call, commit or push. Five-agent work remains incomplete.

## Finance Agent — cash-flow, customer-credit aging and monthly variance (2026-10-23)

- The Finance review now reuses `CashForecastService.forecast` for relative projected net flow,
  `CreditService.financialAgingSummary` for privacy-minimized customer-credit balance aging, and
  `ProfitService.pnl.trend` for calendar-month variance. The UI links back to the canonical Cash
  Flow, Credit and Expenses pages. It does not imply a bank balance, accounting A/R, a duplicate
  finding, a cause for a variance, or any posted/reconciled transaction.
- Real-MySQL Finance spec passes **8/8**; supporting Credit + Finance focused tests pass **26/26**.
  Full backend Jest passes **409 suites / 2,493 tests**. Backend/frontend `tsc --noEmit`, Finance
  service/spec ESLint, frontend touched-file ESLint, and `git diff --check` pass. CreditService's
  whole-file ESLint still reports pre-existing Prettier-only findings in untouched methods; the
  same findings were confirmed at HEAD, and the new aggregate method/test add none.
- Isolated Finance Playwright passes **2/2** including setup; it verifies real QA-business expense
  and credit rows, calendar comparison, AI-unconfigured disclosure, and canonical page handoffs.
  The screenshot was inspected; no console/API 5xx errors or provider calls. No migration, commit
  or push. Bank-feed reconciliation, finance-owned A/R/AP, budgets and period close remain
  unavailable and disclosed. Five-agent work remains incomplete.

## Five Specialized AI Agents — Customer 360 profile summary (2026-10-23)

- The live customer profile now includes a deterministic Customer 360 narrative assembled from
  the same tenant-scoped and permission-filtered CRM source reads: profile/visit metadata, completed
  non-quotation order windows, booking and message statuses, permitted support metadata, loyalty
  and membership state, and customer-linked private-feedback aggregates. It includes source dates,
  window limits, and the existing human-review cue; it is not a churn prediction or causal claim.
- Private feedback is owner/manager-only and available only when Reviews is enabled. The service
  returns counts, status, average stars and last-recorded time only; message/review text is excluded.
  Public `ExternalReview` records are not linked to customers in the schema, so they are explicitly
  not attributed. Staff receive a restricted state. The result remains no-store and is not persisted;
  no customer-level information is sent to an AI model.
- Real-MySQL profile spec passes **9/9**. Backend/frontend `tsc --noEmit`, touched-file ESLint,
  fabrication grep and `git diff --check` pass. Full backend Jest passes **409 suites / 2,493 tests**.
  Isolated Playwright passes **2/2** including setup; the summary card screenshot was inspected and
  browser console/API 5xx checks passed. No migration, external provider call, commit or push.
- Still partial: private note/conversation content is not summarized; public reviews cannot be tied
  to a person; the follow-up confidence is uncalibrated. Customer sends remain with canonical
  consent/channel services. The five-agent specification is not complete.

## Five Specialized AI Agents — Customer win-back draft eligibility (2026-10-23)

- Added a review-only win-back draft purpose to the existing Customer Agent draft flow. It is
  available only for an active customer with marketing consent, no opt-out, Unified Inbox enabled,
  and at least the canonical CRM `LAPSED_DAYS` threshold (60 days) since last visit, or since
  creation when no visit is recorded. Recent activity returns a typed refusal before any AI call
  or draft write.
- The AI receives only the selected purpose instruction; customer identity/contact, order, note
  and conversation data are not sent. A saved result remains an editable `MessageDraft`; this does
  not create a Marketing campaign, queue a message, or deliver anything. UI copy labels the
  threshold and keeps sending with canonical Marketing/Unified Inbox flows.
- Real-MySQL Customer Agent action/profile specs pass **17/17**; full backend Jest passes **409
  suites / 2,494 tests**. Backend/frontend `tsc --noEmit`, touched backend/frontend ESLint and the
  isolated Customer Agent Playwright scenario pass (**2/2**, including setup). `git diff --check`
  passes. No migration, external AI/provider call, commit or push. The broader five-agent
  specification remains incomplete.

## Five Specialized AI Agents — Customer List follow-up queue view (2026-10-23)

- Surfaced actual open CRM follow-up tasks on the existing Customer List by reusing the canonical
  Action Center query and completion endpoint. The server continues to enforce staff assignment;
  managers see business tasks. Rows link to the canonical customer profile and completion goes
  through the existing audited CRM task action. No new task table or ranking model was added.
- The UI states that the order is the saved task priority, due date and age—not an AI score—and
  that an open task is not evidence a customer was contacted. The full queue remains available in
  Action Center; the Customer List only previews the first five returned tasks.
- Frontend `tsc --noEmit` and touched-file ESLint pass. Isolated Playwright passes **2/2** including
  setup, and verifies a real created task appears with its canonical profile link and completion
  control; it then completes through the existing Staff Tasks flow. The screenshot was inspected.
  Full backend Jest at this checkpoint passes **409 suites / 2,494 tests**; no backend source or
  migration changed for this view. `git diff --check` and fabrication grep pass. No provider call,
  commit or push. This is a queue view, not an AI-priority score or complete Customer Agent.

## Five Specialized AI Agents — aggregate win-back campaign brief (2026-10-24)

- Customer Intelligence now saves a review-only, aggregate brief for customers with a recorded
  visit at least 60 days ago, including active-profile, opt-out, marketing-consent and stored
  destination counts. It uses the canonical CRM lapse threshold and tenant-scoped Customer rows;
  selected-branch scope is explicitly unavailable because the existing segment preview is
  business-scoped.
- No customer IDs or contact values enter the saved recommendation/evidence. No Marketing
  Campaign or Message is created, queued or sent. The page links to canonical Marketing and warns
  that channel-specific consent, suppression, contact validity, frequency, quota and provider
  delivery must be checked there. This brief does not rank customers or predict churn.
- Real-MySQL Customer Intelligence spec passes **4/4**; backend/frontend `tsc --noEmit`, touched
  backend/frontend ESLint, and `git diff --check` pass. Isolated Playwright passes **2/2** including
  setup; screenshot inspected and console/API-error assertions pass with Customer Agent AI disabled
  during QA. Full backend Jest passes **409/409 suites and 2,495/2,495 tests**. The first parallel
  full run had transient DB timeouts; three reported suites passed isolated, then a full rerun was
  clean. No migration, paid AI/provider call, commit or push. The five-agent specification remains
  incomplete.

## Five Specialized AI Agents — Customer Profile RFM source values (2026-10-24)

- Added a transparent RFM source snapshot to the live Customer Profile review: recency is calendar
  days since the latest completed non-quotation order, frequency is the all-time count of those
  orders, and monetary is the permission-checked CRM `Customer.lifetimeSpend` in business currency.
  It shows source values only; there are no configured customer-specific score bands, so no RFM
  score is invented.
- Orders-disabled businesses see R/F as unavailable. Staff without Profit view permission see M
  as restricted. The UI and evidence disclose that order creation time is used and CRM lifetime
  spend is neither recomputed from orders nor netted for refunds.
- The real-MySQL Customer Profile spec passes **9/9**, including quotation/status filtering and
  staff spend restriction. Backend/frontend `tsc --noEmit`, touched backend/frontend/E2E ESLint and
  `git diff --check` pass. Isolated Playwright passes **2/2** including setup; the RFM card
  screenshot was inspected. Full backend Jest passes **409/409 suites and 2,495/2,495 tests**. No
  migration, provider call, commit or push. Five-agent work remains incomplete.

## Five Specialized AI Agents — Inventory count-review quantity threshold (2026-10-24)

- Added owner policy `inventory.agentCountVarianceMinimumUnits` in AI & Governance. `null` preserves
  existing behavior; a configured integer filters repeated applied-count findings by the inclusive
  sum of absolute adjustment units. The saved run input and evidence record the policy value.
- The review states that this is a quantity filter only. It does not claim financial materiality or
  infer discrepancy cause. The setting is editable and auditable through the shared `policyRow()`
  flow; no schema migration was needed.
- The real-MySQL Inventory Agent spec passes **9/9**, including no-minimum behavior, suppression
  above the threshold and inclusion at the exact threshold. Backend/frontend `tsc --noEmit` pass.
  Full backend Jest passes **409/409 suites and 2,496/2,496 tests**. The touched Inventory files,
  policy constants and E2E spec pass ESLint; the existing Intelligence category file has unrelated
  Prettier baseline errors, with none in the added lines. Browser QA passes **1/1** for the
  specialist flow, including saving `2 units`, clearing back to `No minimum`, and checking the
  inventory view; console/API error assertions pass and the Settings screenshot was inspected.
  No migration, provider call, commit or push. Five-agent work remains incomplete.

## Five Specialized AI Agents — saved Commerce listing-reconciliation review (2026-10-24)

- Commerce Agent now summarizes up to 20 latest saved reconciliation runs and groups all open
  discrepancy records. It does not start provider syncs, expose listing-level snapshots or send
  reconciliation details to the AI explanation. The UI links to canonical Reconciliation and
  says that no saved check does not prove store health. Existing provider checks only cover SKU
  presence and stock quantity.
- Real-MySQL Commerce Agent spec **5/5**; backend/frontend `tsc --noEmit`, touched ESLint,
  fabrication grep and `git diff --check` pass. Isolated Playwright **1/1** verifies the honest
  empty state, canonical link, console and API 5xx checks; screenshot inspected. Full backend Jest:
  **409 suites / 2,497 tests passed**. No migration, provider call, commit or push. Five-agent work
  remains incomplete.

## Five Specialized AI Agents — Commerce Experiment Lab outcome evidence (2026-10-24)

- Commerce Agent now summarizes up to 20 latest running or decision-stage experiments, reusing the
  canonical Experiment Lab result calculator for running tests and frozen results for stopped or
  decided tests. It surfaces primary metric values, observed change, the canonical sample minimum
  and any saved margin guardrail; it does not provide a winner, significance or causal conclusion.
  Hypotheses, product names and descriptions are omitted, and experiment details are not sent to AI.
- The read-only UI links to Experiment Lab and explicitly discloses that Noxtill does not split
  visitors or track conversion in this flow. It does not adopt/revert experiments or change products.
- Real-MySQL Commerce Agent spec **5/5**; backend/frontend `tsc --noEmit`, touched ESLint,
  fabrication grep and `git diff --check` pass. Isolated Playwright **1/1** verifies the honest
  empty state, route link, console and API 5xx checks, with screenshot inspection. Full backend
  Jest: **409 suites / 2,497 tests passed**. No migration, provider call, commit or push. Five-agent
  work remains incomplete.

## Five Specialized AI Agents — supplier-claim evidence review (2026-10-24)

- The Commerce Agent now reports all canonical supplier-claim counts by stored status and itemizes
  up to 20 most recently updated claims. Loss and settlement totals use exact decimal sums of
  operator-entered canonical records; evidence and communication counts are included. It omits
  supplier identifiers/names, references, reasons, descriptions, files and communication notes.
- Settlement amounts are explicitly described as recorded, not independently verified; credits
  and replacements do not prove cash receipt or delivery. The read-only view links to Supplier
  Claims and never submits, acknowledges, settles, closes or contacts a supplier. The AI summary
  provider still receives only existing aggregate Commerce queue counts, not claim details.
- Real-MySQL Commerce Agent spec **5/5**; backend/frontend `tsc --noEmit`, touched backend and
  frontend/E2E ESLint, fabrication grep and `git diff --check` pass. Isolated Playwright passes
  **2/2** including setup, claim creation, persisted summary, console/API checks and inspected
  screenshot. A full backend Jest attempt returned **406/409 suites and 2,490/2,497 tests**;
  three unrelated DB-heavy suites timed out under parallel load. Those same three suites pass
  isolated sequentially (**3/3 suites, 12/12 tests**). No migration, provider call, commit or push.
  The five-agent specification remains incomplete.

## Five Specialized AI Agents — Commerce delivery follow-up evidence (2026-10-24)

- Commerce Agent now reuses `DeliveryInsightsService`'s canonical exception rule: a failed
  `Delivery` is considered resolved only when its latest same-business `Return` is approved. It
  reports the real failed-delivery count and at most 20 recent resolution states/timestamps.
- Customer details, addresses, free-text failure reasons, order/return amounts, causes and external
  carrier results are omitted or explicitly not inferred. The read-only panel links to Delivery
  Exceptions; it does not create a return, issue a refund, dispatch a rider or contact a customer.
- Real-MySQL Commerce Agent spec **5/5**, including open vs. approved-return resolution,
  cross-tenant exclusion and private-field omission. Backend/frontend `tsc --noEmit`, touched-file
  ESLint, Playwright **2/2**, screenshot inspection, fabrication grep and `git diff --check` pass.
  Full backend Jest **409/409 suites and 2,497/2,497 tests passed**. No migration, provider call,
  commit or push. The five-agent specification remains incomplete.

## Five Specialized AI Agents — Commerce fulfillment queue review (2026-10-24)

- Commerce Agent now reuses the canonical Fulfillment Router queue for current open online/delivery
  orders with physical product lines. It counts open orders and shows the 20 newest with only order
  type/status, physical line count, and whether an operator route exists, a candidate is available,
  or no candidate was produced. The candidate calculation itself remains the Router's canonical
  deterministic policy.
- The destination is absent in this queue review, so market eligibility remains unknown. External
  inventory/capacity and carrier confirmation are not inferred. No route is assigned, stock is not
  reserved, and PII/order identifiers/prices are omitted; the panel links to Fulfillment Router.
- Real-MySQL Commerce Agent spec **5/5** includes an eligible real order plus a second-tenant order
  and proves the latter is excluded. Backend/frontend `tsc --noEmit`, frontend touched-file ESLint,
  Playwright **2/2**, screenshot inspection, fabrication grep and `git diff --check` pass. Backend
  touched-file ESLint and full backend Jest remain to be rerun after this addition. No migration,
  provider call, commit or push.
  The five-agent specification remains incomplete.

## Five Specialized AI Agents — run-linked AI usage attribution (2026-10-24)

- Optional AI summaries generated for a specialist-agent run now link their `AiCallLog` to that
  exact run. The five specialist services pass the run ID through `AiInfraService`; the shared
  usage panel reports real logged call count, tokens, and estimated logged cost for the latest run.
  This is usage-log attribution, not a provider invoice or a billing ledger.
- The run ID is validated against the active business before an AI request. Deleting a run keeps
  its cost/token log and clears the optional relation. A real-MySQL spec covers attribution,
  cross-business/missing-run rejection, provider-not-called on invalid IDs, and `SET NULL` delete.
- Hand-written migration `20261024200000_specialist_agent_ai_usage` was applied locally; Prisma
  generation and migration status confirmed 212 migrations with the database up to date.
  Backend/frontend `tsc --noEmit`, touched-file ESLint, six focused MySQL suites (46 tests), and
  `git diff --check` pass. Full backend Jest: 406/409 suites and 2,452/2,516 tests passed; the
  remaining three suites are Assistant/Help retrieval fixture failures and Voice's repeated fixed
  phone-number uniqueness collision. Browser QA loaded the SEO Agent Workspace empty state via
  accessibility inspection; no screenshot, console/network audit, or paid provider call was made.
  No commit or push. The five-agent specification remains incomplete.

## Five Specialized AI Agents — monthly cap usage visibility (2026-10-24)

- AI & Governance now shows the real count of specialist AI requests counted for each agent in the
  current UTC month beside its configured cap. It reads the same reservation records used by the
  enforcement path, including failed and still-reserved attempts, and scopes every count to the
  selected business and agent.
- Settings Hub real-MySQL spec passes **1 suite / 20 tests**, proving current-month inclusion,
  prior-month exclusion, agent separation and tenant isolation. Backend/frontend `tsc --noEmit` and
  `git diff --check` pass. The Intelligence category ESLint passes with the file's existing
  Prettier rule disabled; the older Settings Hub spec reports eight existing unsafe-any lint
  findings outside the new test. Full backend Jest: **406/409 suites and 2,454/2,518 tests passed**;
  the same Assistant/Help retrieval fixture failures and Voice fixed-phone-number uniqueness
  collision remain. After rebuilding and restarting the stale compiled API, a fresh QA Test Business
  browser page showed `0 counted this month` for all five agents; no console/network audit or AI
  provider request was made. No migration, commit or push. The five-agent specification remains
  incomplete.

## Five Specialized AI Agents — per-agent monthly AI request limits (2026-10-24)

- AI & Governance now has nullable monthly request caps for each of Inventory, Finance, Customer,
  SEO and Commerce agents. `null` preserves the existing uncapped behavior. These are request-count
  limits, not dollar budgets; the existing business-wide estimated-cost cap remains separate.
- Every specialist `createMessage` call must match a persisted run and its agent kind. Before the
  model is called, a transaction locks that business, checks the agent's UTC-month request count,
  and creates a reservation. This prevents concurrent requests from racing past the limit. Failed
  provider attempts and abandoned reservations conservatively count; deterministic reviews still
  work after the optional AI limit is reached.
- Hand-written migration `20261024205200_specialist_agent_monthly_requests` is applied locally;
  both business and run foreign keys were verified (`CASCADE` and `SET NULL` respectively), and
  Prisma reports 213 migrations up-to-date. Focused MySQL tests pass **2 suites / 18 tests**,
  including simultaneous requests, failed-provider counting, separate per-agent limits, and
  uncapped defaults. Backend/frontend `tsc --noEmit`, touched ESLint (the Intelligence category
  file was checked with its pre-existing Prettier rule disabled), and `git diff --check` pass.
- Browser QA in the isolated QA Test Business loaded AI & Governance, saved a temporary Inventory
  limit of 1, confirmed it, then cleared it back to **No limit**. No AI provider request was made.
  Full backend Jest: **406/409 suites and 2,453/2,517 tests passed**; remaining failures are the
  existing Assistant/Help retrieval fixture failures and Voice's fixed-number uniqueness collision.
  No commit or push. The five-agent specification remains incomplete.

## Five Specialized AI Agents — per-agent monthly AI spend budgets (2026-10-24)

- AI & Governance now has optional monthly USD budgets for Inventory, Finance, Customer, SEO and
  Commerce specialist explanations. Each nullable policy defaults to no cap, and each row shows
  real logged token-based estimated spend plus any pending/failed reservation for the current UTC
  month. The existing business-wide cost cap remains in force as a separate ceiling.
- Before a provider request, the service estimates a conservative maximum for serialized text,
  request framing and the full allowed output-token count. It reserves that amount in the existing
  request ledger under the business row lock, so concurrent requests cannot pass the same remaining
  balance. Successful calls are counted from exact returned token counts at the default Haiku
  list-price estimate; failed/abandoned calls retain their maximum reservation for that month.
  Non-default models and non-text specialist inputs are rejected rather than priced inaccurately.
  Deterministic specialist reviews still work when an optional AI budget is reached. These amounts
  are estimates, not provider invoices.
- Hand-written migration `20261024213000_specialist_agent_monthly_spend_budgets` adds a reservation
  amount column (default zero for old rows) to the existing specialist request table; the caps
  themselves are nullable policies defaulting to no limit. It is applied locally and Prisma reports
  the schema up-to-date at 214 migrations. No new table or tenant registration was needed.
- Focused real-MySQL AI/Settings tests pass **2 suites / 36 tests**, covering budget refusal before
  provider call, exact completed-token estimate, conservative failed-call reservation, displayed
  spend, current-month scope and tenant isolation. Backend/frontend `tsc --noEmit` pass. Functional
  ESLint passes with the category's legacy Prettier formatting disabled and the Settings Hub spec's
  eight pre-existing unsafe-any findings suppressed; the new lines introduce no lint findings.
  Browser inspection of `/settings/ai` in the QA Test Business showed all five budget rows and the
  honest estimate/reservation disclosure. No setting was changed and no paid AI call was made.
- Full backend Jest: **406/409 suites, 2,456/2,520 tests passed**. The same unrelated Assistant/Help
  retrieval fixture misses and Voice suite fixed-phone-number uniqueness collision account for the
  failures. No commit or push; the five-agent specification remains incomplete.

## Five Specialized AI Agents — idempotent manual reviews (2026-10-24)

- Manual runs for all five specialists now accept an optional `Idempotency-Key`. Only its SHA-256
  hash is stored; uniqueness is scoped by business and agent, and replay is bound to the same user
  and canonicalized request scope. Exact retries return the existing run; conflicting reuse and
  retries of failed runs return typed conflicts. Calls without a key retain legacy behavior.
- The frontend reuses a pending key across network/5xx retries for the same agent, user/business,
  branch and input, clearing it after a definitive response. It stores no raw key server-side.
- Applied hand-written migration `20261024224200_specialist_agent_run_idempotency`; Prisma
  generation and migration status succeeded (215 migrations up to date). Focused real-MySQL tests:
  **2 suites / 15 tests passed**. Backend/frontend TypeScript, touched-file ESLint and diff check
  pass. Full backend Jest: **407/410 suites, 2,461/2,525 tests passed**; three unrelated suites
  fail in Assistant/Help retrieval fixtures and VoiceCallService's repeated phone-number unique
  constraint setup. No browser/provider QA, commit or push. The five-agent scope remains
  incomplete; shared actions/approvals, scheduled/event orchestration and remaining agent-specific
  capabilities are outstanding.

## Five Specialized AI Agents — opt-in daily scheduled reviews (2026-10-25)

- Added five owner-controlled daily-review policies, all disabled by default, and surfaced them in
  Settings → AI & Governance. The hourly UTC scheduler invokes the existing Inventory, Finance,
  Customer, SEO and Commerce review services; it does not add parallel data stores or workflows.
- Each scheduled review runs in the business tenant context, is tagged `scheduled`, has no
  fabricated user actor, suppresses optional AI summaries/provider spend, and is deduplicated by
  agent/business/UTC day using the existing idempotency field. Commerce additionally requires
  Commerce autonomy to be enabled. No migration was needed.
- Real-MySQL scheduling spec: **1 suite / 1 test passed**. Backend and frontend `tsc --noEmit`,
  touched-file ESLint and focused checks passed. Full backend Jest: **408/411 suites and
  2,462/2,526 tests passed**; the three known failing suites are Assistant/Help retrieval fixtures
  and VoiceCallService's repeated fixed-phone-number setup. Browser QA was unavailable because
  port 5000 is occupied by macOS ControlCenter, so the backend could not be safely started there.
- No commit or push. The five-agent work is still incomplete: this adds opt-in daily reviews only;
  broader event-driven orchestration, additional agent capabilities and browser/provider QA remain.

## Five Specialized AI Agents — opt-in SEO audit event review (2026-10-25)

- Successful or partial SEO site audits can now enqueue a durable, owner-opt-in SEO specialist
  review. The policy defaults off. The worker rechecks the business policy, agent enablement,
  tenant ownership and audit status; failed audits and duplicate deliveries do not create extra
  reviews. It uses the existing specialist run/idempotency path, performs no provider AI call, and
  does not publish or mutate business data. No migration was needed.
- Focused real-MySQL and service coverage passed **3 suites / 18 tests**. Backend and frontend
  `tsc --noEmit` and touched-file ESLint passed. Full backend Jest: **409/412 suites and
  2,467/2,531 tests passed**. The 3 failing suites are the existing Assistant/Help retrieval
  fixtures and VoiceCallService fixed-number uniqueness setup; the added idempotency race test
  passes after asserting the database invariant rather than assuming Promise arrival order.
- Browser QA was not run because the backend's required port 5000 is occupied by macOS
  ControlCenter; it was not terminated. No migration, commit or push. General event orchestration,
  cross-agent handoffs, the remaining specialist capabilities, and browser/provider QA remain open.
  The module is not complete or production-ready.

## Five Specialized AI Agents — opt-in Inventory low-stock event review (2026-10-25)

- The existing canonical low-stock `ActivityEvent` can now queue one read-only Inventory review
  when the new owner policy is enabled (off by default). It uses a separate durable queue, then
  rechecks the business policy, Inventory-agent enablement, event type and tenant before running.
  Duplicate delivery is idempotent; the review has no user actor and does not request AI. No
  migration was needed.
- Focused MySQL event tests passed **2 suites / 4 tests** (Inventory and SEO processors). Backend
  `tsc --noEmit` and touched-file ESLint passed; frontend was unchanged and its type-check passed
  during the preceding event-trigger slice. Full backend Jest: **410/413 suites and 2,469/2,533
  tests passed**. The same three unrelated Assistant/Help retrieval and Voice fixed-number fixture
  suites failed. No browser QA, commit or push. General event orchestration and other specialist
  capabilities remain unfinished.

## Five Specialized AI Agents — opt-in Customer lapsed-event review (2026-10-25)

- The CRM's existing `customer_lapsed` event can now trigger an aggregate Customer Intelligence
  review when an owner enables the new policy (off by default). Multiple newly-lapsed events are
  coalesced to one review per business per UTC day. The worker rechecks tenant, event type, agent
  and policy, and confirms the referenced customer is still marked Lapsed. It uses canonical
  Analytics aggregates, stores the event reference, makes no AI call, and sends no message.
- Focused Customer event + CRM tests passed **2 suites / 5 tests**. Backend `tsc --noEmit` and
  touched-file ESLint passed; frontend code was unchanged and its type-check passed in this work
  sequence. Full backend Jest: **411/414 suites and 2,471/2,535 tests passed**. The same three
  unrelated Assistant/Help retrieval and Voice fixed-number fixture suites failed. No migration,
  browser QA, commit or push. The broader five-agent spec remains unfinished.

## Five Specialized AI Agents — opt-in Commerce validation event review (2026-10-25)

- Product Validation decisions and canonical catalog-draft creation now queue a Commerce review
  only when the owner enables the new policy. The producer looks up the exact persisted
  `commerce_validation` ActivityEvent; queue failures are logged and do not undo the saved
  validation action. The worker rechecks the event, entity ownership, Commerce agent toggle, event
  policy and nonzero Commerce autonomy, and deduplicates by event ID.
- Reviews use the existing Commerce specialist run, record the source event reference, have no
  user actor, suppress optional AI explanations, and do not publish listings or change catalog,
  inventory, orders or customer records. No new model or migration was needed.
- Focused real-MySQL/product-validation tests passed **4 suites / 20 tests**. Backend and frontend
  TypeScript passed; touched backend ESLint passed with the existing Prettier rule disabled for
  shared legacy formatting. Full backend Jest: **412/415 suites and 2,475/2,539 tests passed**;
  the three recurring failures remain Assistant/Help retrieval fixtures and Voice's fixed phone
  number fixture collision. No browser/provider QA, migration, commit or push. The five-agent
  specification remains incomplete.

## Five Specialized AI Agents — opt-in Finance expense event review (2026-10-25)

- Saving a new canonical Expense can now queue a Finance review when the owner enables its new
  policy (off by default). The worker rechecks business ownership, Finance-agent enablement and the
  policy, derives the month from the saved expense date, and deduplicates by expense ID. Queue
  failures do not undo a saved expense.
- The review uses the existing Financial Intelligence service and `ProfitService.pnl`, stores the
  expense event reference, has no user actor, and suppresses optional AI explanations. It does not
  modify the expense or post/reconcile any accounting entry. No new model or migration was needed.
- Focused expense/Finance/Commerce tests passed **7 suites / 36 tests**. Backend and frontend
  TypeScript and touched backend ESLint passed. Full backend Jest: **413/416 suites and
  2,478/2,542 tests passed**; the three recurring failures are Assistant/Help retrieval fixtures
  and Voice's fixed phone-number uniqueness setup. No browser/provider QA, migration, commit or
  push. The five-agent specification remains incomplete.

## Five Specialized AI Agents — opt-in failed-delivery Commerce review (2026-10-25)

- A failed canonical Delivery can now enqueue a read-only Commerce exception review when its
  owner-controlled policy is enabled, Commerce is enabled, and Commerce autonomy is above zero.
  The queue payload binds to the delivery's exact `updatedAt`; the worker rechecks tenant, status,
  timestamp, policy, and autonomy before running. Same-event redelivery is idempotent through the
  existing specialist-run key. No customer message, delivery update, AI request, or migration is
  created by this path.
- Added the toggle under Settings → AI & Governance and queue-producer/real-MySQL worker coverage.
  Focused Deliveries and Commerce event tests pass **2 suites / 32 tests**. Backend and frontend
  `tsc --noEmit` and touched-file ESLint pass. Full backend Jest: **413/416 suites and
  2,482/2,546 tests passed**; the same Assistant/Help retrieval fixture failures and Voice fixed
  phone-number uniqueness fixture failures remain. Browser/provider QA was not run. No commit or
  push; the five-agent specification remains incomplete.

## Five Specialized AI Agents — opt-in Customer failed-delivery follow-up review (2026-10-25)

- A newly failed canonical Delivery can now enqueue a privacy-minimized Customer Agent review when
  the owner enables its separate policy (off by default). The queue job binds to the exact delivery
  update timestamp; the worker rechecks business, customer-agent enablement, policy, delivery state,
  linked customer and timestamp before running. Run creation is idempotent for that delivery state.
- The saved review contains CRM status/consent flags and contact-presence booleans only; it excludes
  contact values, address and free-text failure reason. It explicitly says marketing consent is not
  channel-specific permission. The review is audited and read-only; no message is drafted or sent,
  and no delivery/customer record is changed. No schema migration was needed.
- Focused real-MySQL and delivery producer tests passed **3 suites / 35 tests**. Backend and frontend
  `tsc --noEmit` and touched-file ESLint pass; scoped `git diff --check` is clean. The full-worktree
  check reports an unrelated existing blank line at EOF in `backend/src/marketing/automations/workflows.constants.ts`.
  Full backend Jest:
  **413/416 suites, 2,485/2,549 tests passed**. The three failing suites are Voice's fixed-number
  uniqueness fixture and the existing Assistant/Help retrieval fixtures. Browser/provider QA was
  not run. No commit or push; the five-agent specification remains incomplete.

## Five Specialized AI Agents — Commerce Agent draft-tool retry safety (2026-10-25)

- Added idempotency for Commerce Agent's bounded canonical draft tools. A write requires a key;
  MySQL stores only key/request hashes and reserves the business-scoped key before the canonical
  draft write. Same-key/same-actor/tool/input retries return the original draft; conflicting reuse
  is refused; a concurrent retry reports pending. Failed or stale outcomes require operator
  inspection before a new key is used. Read-only tools remain keyless.
- Added a read-only B2B quote preview using the canonical B2B tier/price-list and credit checks. The
  returned quote states its business currency and that tax is excluded; a real-MySQL test confirms
  it creates no Order.
- API responses omit key hashes and canonical resource references. The UI retains a stable retry
  key across transient network/5xx failures and identifies when the previous draft is returned.
  Existing canonical guards, audit, autonomy checks and draft-only behavior remain; no listing is
  published and no RFQ/claim is sent.
- Hand-written migration `20261025103000_commerce_agent_tool_idempotency` is applied locally;
  Prisma reports all 216 migrations current. Focused real-MySQL tool/claim tests pass **2 suites /
  22 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass.
  Full backend Jest passed **413/416 suites, 2,490/2,554 tests**. The three failures are the
  recurring Assistant/Help retrieval fixtures and Voice fixed-number uniqueness fixture; no Commerce
  suite failed. Browser/provider QA was not run. No commit or push; the five-agent specification
  remains incomplete and is not production accepted.

## Five Specialized AI Agents — fail-closed Commerce approval gate (2026-10-25)

- Commerce Agent tool metadata already marked medium/high-risk, financial and irreversible tools as
  requiring approval, but the direct run gate did not enforce that metadata if a future tool was
  switched to executable. The gate now refuses those risk classes until an approval workflow is
  connected; existing non-executable tools keep their more specific refusal, and every attempted
  write is still recorded as a refused tool run.
- A real-MySQL test temporarily enables the high-risk listing publish tool and proves the registry
  reports the approval block and the run is refused/audited without invoking a provider. No migration
  was needed. Focused Commerce tool spec: **1 suite / 16 tests passed**; backend/frontend
  `tsc --noEmit`, touched backend ESLint and scoped `git diff --check` pass.
- Full backend Jest: **413/416 suites passed; 2,491/2,555 tests passed**. The three failing suites
  remain the unrelated Assistant and Help retrieval fixtures and VoiceCallService's fixed-number
  uniqueness fixture. No browser/provider QA, commit or push. The actual human approval/action
  lifecycle is still not connected, so these tools remain unavailable to agents.

## Five Specialized AI Agents — opt-in Commerce supplier-quote review (2026-10-25)

- Recording a canonical supplier quote now queues a Commerce Agent review only when the owner
  enables the new event-review setting, the Commerce agent is enabled, and Commerce autonomy is
  above zero. Queue failure does not undo the quote. The worker verifies the quote still belongs
  to the business, remains submitted/shortlisted, and belongs to an open RFQ; it deduplicates by
  quote ID and records a read-only run with a source reference. It does not award the RFQ, create a
  purchase order, contact the supplier, or call an AI provider.
- Added an owner-controlled AI & Governance toggle with a default-off policy. No schema migration
  was needed. Real-MySQL quote producer and event-worker specs pass **2 suites / 17 tests**.
  Backend/frontend `tsc --noEmit` pass. ESLint passes with the repository's existing Prettier rule
  disabled; the normal touched-file ESLint check still reports the large compact-format backlog in
  `settings-hub/categories/intelligence.ts`. Scoped `git diff --check` is clean.
- Full backend Jest: **413/416 suites passed; 2,494/2,558 tests passed**. The same three known
  failures remain: Assistant and Help retrieval fixtures, and VoiceCallService's fixed-number
  uniqueness setup. No browser/provider QA, commit, or push. This adds one opt-in source event; the
  five-agent system remains incomplete and is not production accepted.

## Five Specialized AI Agents — opt-in Customer appointment no-show review (2026-10-25)

- Marking an appointment no-show can now enqueue a Customer Agent review only when both the
  customer-agent switch and the separate owner-controlled no-show policy are enabled. The worker
  rechecks the business, opt-in, current no-show status and exact update timestamp before calling
  the CRM review service. Queue failures do not undo the canonical booking/deposit action.
- The review stores appointment provenance, CRM consent/opt-out flags and contact-presence booleans
  only. It does not store the customer's name/contact values or infer a no-show reason, make an AI
  provider call, draft/send a message, or modify customer data. It is idempotent for the exact
  appointment state and audited. No schema migration was needed.
- Focused real-MySQL producer/worker/CRM specs pass **3 suites / 38 tests**. Backend and frontend
  `tsc --noEmit` pass; touched-file ESLint passes with the existing Prettier rule disabled, and
  scoped `git diff --check` is clean. Full backend Jest: **412/416 suites passed; 2,496/2,561
  tests passed**. The three recurring Assistant/Help retrieval and Voice fixed-phone fixture suites
  failed. SEO Workspace also failed once in the parallel full run, then passed alone (**1 suite /
  2 tests**), consistent with shared-DB contention. No browser/provider QA, commit, or push. The
  five-agent specification remains incomplete and is not production accepted.

## Five Specialized AI Agents — supplier terms in Inventory reorder evidence (2026-10-25)

- Inventory reorder findings now include current, active, terms-confirmed supplier contract context
  for the real supplier already linked to the recommendation. The evidence exposes supplier-level
  minimum order quantity, currency, categories and effective dates, while warning that the contract
  is not mapped to a specific SKU/unit and does not change the reorder quantity formula. Unconfirmed
  or out-of-date contracts are excluded. No supplier/product terms are fabricated.
- Real-MySQL coverage proves an eligible contract is surfaced, an unconfirmed contract is omitted,
  and the existing reorder quantity remains unchanged. Focused Inventory specs pass **2 suites / 14
  tests**. The preceding no-show work passes **3 suites / 38 tests**. Backend and frontend
  `tsc --noEmit`, touched backend ESLint (existing Prettier rule disabled) and scoped `git diff
  --check` pass. No migration was needed.
- Full backend Jest: **412/416 suites passed; 2,497/2,562 tests passed**. Assistant and Help
  retrieval fixtures and VoiceCallService's fixed-number uniqueness fixture failed as in prior runs.
  ReviewRemindersProcessor also timed out under full-suite contention; its isolated rerun passed
  **1 suite / 3 tests**. Browser QA was not run because the frontend is not listening on port 3000
  and port 5000 is owned by macOS ControlCenter. No commit or push; the five-agent specification
  remains incomplete and is not production accepted.

## Five Specialized AI Agents — observed supplier/product lead-time context (2026-10-25)

- Inventory reorder findings now inspect the current business's fully received purchase orders for
  the suggested product and its last recorded supplier. In a rolling 365-day window, they calculate
  median, minimum and maximum elapsed days from PO `sentAt` to final `receivedAt`, with sample count
  and an explicit cap of the latest 1,000 matching orders. This observation is persisted in the
  existing recommendation evidence and shown in the Inventory Agent finding.
- Historical timing is context only: it does not replace the existing 30-day reorder formula or
  claim to be a supplier SLA/guaranteed delivery time. Without completed matching POs, the finding
  says not tracked. The contract's MOQ still is not applied because category/unit-to-SKU mapping is
  not verified. Digital Twin disclosures were updated to distinguish missing SLA fields from the
  historical PO observation available in Inventory Intelligence. No migration or provider call was
  needed.
- Focused real-MySQL coverage for the five changed event/Inventory suites passes **5 suites / 52
  tests**; after the final sample-cap wording adjustment, the Inventory DB and reorder specs pass
  **2 suites / 14 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and scoped
  `git diff --check` pass. Full backend Jest, rerun after the final change: **413/416 suites and
  2,498/2,562 tests passed**. The three recurring failures are Assistant retrieval, Help retrieval,
  and VoiceCallService's fixed-phone uniqueness fixture. A prior run had Credit cleanup and SEO
  Workspace failures under parallel load; both passed in isolation (**19/19** and **2/2**) and in
  the latest full run. Browser QA remains unavailable (no listener on port 3000; macOS ControlCenter
  owns 5000). No commit or push; the five-agent specification is incomplete and not production
  accepted.

## Five Specialized AI Agents — live-policy and cancellation admission safety (Codex, 2026-10-25)

- Durable cross-agent review jobs now re-read each specialist's enabled policy immediately before
  every review, including retries. If a toggle is disabled during a queued run, later child work is
  recorded as skipped rather than started; canonical agent services still recheck their own gates.
- Owner cancellation now competes atomically with child admission through a conditional parent-run
  update. If cancellation wins, the next review is not started; if admission wins first, that
  already-started read-only review may finish. Added a real-MySQL test for the admission guard.
- Focused controller, orchestration MySQL and AI Settings tests pass **3 suites / 15 tests**.
  Backend/frontend `tsc --noEmit` and touched-file ESLint pass. Full backend Jest: **416/419 suites
  and 2,520/2,584 tests passed**; the recurring failing suites are Assistant retrieval, Help
  retrieval and VoiceCallService's fixed phone-number uniqueness fixture. The authenticated browser
  check still showed no console errors, but the 5-agent run completed before the stop button could
  be exercised end-to-end. No provider calls, schema change, migration, commit or push. The broader
  five-agent specification remains incomplete and is not production accepted.

## Five Specialized AI Agents — business-module disable enforcement for background reviews (2026-10-25)

- Specialist manual runs now check the canonical business-module selection as well as each agent's
  own AI & Governance switch. Scheduled reviews, cross-agent orchestration, and Inventory, SEO,
  Customer, Commerce and Finance event workers also skip reviews when the corresponding module is
  disabled. Branches inherit the root business selection. If a business disappears between the
  scheduler's page query and policy lookup, that tick fails closed for the stale row rather than
  aborting the job.
- Added real-MySQL coverage for all five agent-to-module mappings, branch inheritance, scheduler
  skipping, orchestration skipping (including a module disabled mid-run), and the event worker
  paths. Focused coverage passes **8 suites / 39 tests**. Backend/frontend `tsc --noEmit` pass;
  touched backend ESLint passes with the repository Prettier rule disabled. The standard check
  reports formatting-only Prettier differences in these compact legacy/new files. Full backend
  Jest: **416/419 suites, 2,523/2,587 tests passed**; the three failing suites remain Assistant
  retrieval, Help retrieval and VoiceCallService's fixed-phone-number uniqueness fixture. The
  scheduler's transient full-suite DB deletion race was fixed and no longer fails. No browser or
  provider QA, schema change, migration, commit or push. The specialist-agent specification
  remains incomplete and is not production accepted.


## Five Specialized AI Agents — opt-in fully received purchase-order review (2026-10-25)

- A fully received Inventory purchase order can now enqueue a read-only Inventory Agent review when
  both the Inventory Agent and a new owner-controlled event policy are enabled. Partial receipts do
  not trigger it. The worker revalidates the business, module selection, agent/event switches, exact
  purchase order and its final received state, then deduplicates through the existing event-run
  helper. Queue failure does not undo the canonical receipt. It does not call an AI provider or
  change the purchase order. No migration was needed.
- Focused real-MySQL/service tests pass **2 suites / 16 tests**. Backend/frontend `tsc --noEmit`
  pass; touched backend ESLint passes with the existing Prettier rule disabled; scoped
  `git diff --check` is clean. The logged-in QA browser loaded AI & Governance and showed the new
  default-off toggle, and the Inventory reorder page loaded with real data/empty states. This was
  route/visual QA only; no receipt was created and no end-to-end event was exercised.
- Full backend Jest: **416/419 suites and 2,527/2,591 tests passed**. The three recurring failing
  suites are Assistant retrieval, Help retrieval and VoiceCallService's fixed-phone-number
  uniqueness fixture. No commit or push. This adds one more opt-in event path; the five-agent
  specification remains incomplete and is not production accepted.

## Backend QA follow-up — isolate shared MySQL search fixtures (2026-10-25)

- The VoiceCallService integration spec no longer uses a shared hard-coded phone number or Twilio
  call SIDs. Its fixture now generates a unique E.164-compatible inbound number and per-test
  34-character Twilio-shaped SIDs. Isolated result improved from setup-wide duplicate-key failures
  to **59/60 tests passing**; the one remaining Voice failure is its newly inserted FAQ not
  appearing in the MySQL full-text result.
- Reproduced the same search symptom for a temporary HelpArticle row: the row existed but MySQL
  `MATCH(title)` returned score 0 immediately after insert, while the existing seeded HelpArticle
  `staff-commissions` matched normally. The temporary row was deleted after the probe. Assistant,
  Help and Voice retrieval tests remain **1 + 3 + 1 failures**; this is an unresolved full-text
  indexing/search behavior, not a green test result and not yet diagnosed to a production root cause.
- After the fixture change, full backend Jest is **416/419 suites; 2,586/2,591 tests passed**.
  Backend/frontend `tsc --noEmit` and ESLint on the touched Voice spec pass. No schema or migration
  change, commit or push.

## Five Specialized AI Agents — erasure-aware Customer Agent records (2026-10-25)

- Customer erasure clears custom field values, marketing consent and Customer Agent follow-up tasks
  and message drafts in the same transaction as anonymization. Draft cleanup is limited to the
  `customer_agent:<customerId>:` namespace; unrelated voice drafts and canonical order/transaction
  history remain. The audit entry records cleared field names and deletion counts, never the
  customer's former PII.
- Customer Agent task/manual-draft/AI-draft saves lock and re-check the same customer row, preventing
  a concurrent agent write from recreating those records after erasure commits. AI generation uses
  purpose-only provider input and re-checks before persistence.
- Real-MySQL Customers and Customer Agent specs: **2 suites / 18 tests passed**. Backend/frontend
  `tsc --noEmit` pass. Touched backend ESLint passes with existing Prettier-only findings disabled;
  normal lint shows three formatting-only issues on pre-existing untouched lines. Full backend Jest:
  **416/419 suites, 2,588/2,593 tests passed**; known Assistant retrieval, Help retrieval and Voice
  FAQ retrieval failures remain. Browser QA was not performed for this backend-only change; local
  API port 5000 remains occupied by macOS Control Center. No migration, commit or push.

## Five Specialized AI Agents — erased profiles excluded from segments (2026-10-25)

- Canonical legacy audiences, saved-segment member lists and counts, and unsaved rule previews now
  exclude anonymized customer profiles. Customer Agent draft counts use the same exclusion and
  report inactive non-erased profiles separately, so the displayed exclusion categories stay
  disjoint without exposing erased profiles as segment matches.
- Added a real-MySQL regression proving an erased profile is absent from the `all` and `vip`
  audiences, a saved segment, its live count and an unsaved preview. The customer segment-draft DB
  spec also verifies corrected exclusion counts. The Customer Agent's win-back summary now excludes
  erased rows before counting lapsed candidates; a DB test proves six raw matches resolve to five
  non-erased candidates. Focused Customer/segment/erasure coverage passes **5 suites / 55 tests**;
  backend and frontend `tsc --noEmit` pass. Targeted backend ESLint passes with the existing
  Prettier-only findings disabled; frontend ESLint passes. Standard backend lint still reports
  three formatting-only differences on pre-existing untouched lines. Scoped `git diff --check` and
  fabrication grep are clean.
- Full backend Jest: **416/419 suites and 2,589/2,594 tests passed**. Five failures remain in three
  existing retrieval suites: Assistant help retrieval (1), Help retrieval (3), and Voice FAQ
  retrieval (1). Their inserted MySQL full-text fixtures still return no match. No schema migration,
  browser QA, commit or push. This closes segment resurfacing for erased profiles, not the full
  five-agent privacy/acceptance scope.

## Five Specialized AI Agents — keep erased profiles out of CRM surfaces (2026-10-25)

- Erased customer placeholders are excluded from the CRM directory, profile/export lookup,
  updates/merge existence checks, bulk exports and duplicate suggestions. The scheduled lapsed
  tagger skips them, so retained anonymized rows cannot be retagged or create a new lapsed-customer
  activity/agent event. The workflow AI agent's profile/orders/run-value tools and the Assistant's
  direct phone-lookup/top-customer/top-debtor tools also exclude erased profiles. Transaction and
  financial history remains retained.
- Added real-MySQL regressions across CRM, exports, duplicate suggestions, periodic tagger, workflow
  AI tools and Assistant tools. Focused coverage passes **5 suites / 24 tests**. Backend/frontend
  `tsc --noEmit` pass. Touched-file ESLint passes with the existing Prettier rule disabled; standard
  lint reports only formatting-only findings in pre-existing compact legacy code, while the new
  spec is formatted. Scoped `git diff --check` passes.
- Full backend Jest: **417/420 suites, 2,592/2,597 tests passed**. Five known MySQL full-text fixture
  failures remain: Assistant retrieval (1), Help retrieval (3), and Voice FAQ retrieval (1). No
  browser/provider QA, schema change, migration, commit or push. This hardens customer erasure
  visibility but does not complete the five-agent specification or production acceptance.

## Five Specialized AI Agents — fresh knowledge retrieval and Memory Note erasure (2026-10-25)

- Help Assistant and voice-agent knowledge retrieval now use a bounded, parameterized fallback
  when MySQL FULLTEXT returns no rows for newly inserted content. Results are ranked from matching
  real terms (title weighted above body/content), scoped to active voice sources and allowed IDs,
  and capped before returning; no knowledge content is invented.
- Customer erasure now deletes customer-linked Memory Notes in the same transaction and records
  only the deletion count in the audit. Existing legacy notes tied to erased placeholders are hidden
  from per-customer and Business Memory reads and cannot be edited or removed through the normal note
  API. Real-MySQL erasure/Memory Notes coverage passes **2 suites / 16 tests**; VoiceCallService
  passes **1 suite / 60 tests**.
- Backend/frontend `tsc --noEmit` and touched-file ESLint (with existing Prettier-only findings
  disabled) pass. Full backend Jest: **420/420 suites, 2,598/2,598 tests passed**. Scoped
  `git diff --check` is clean. No migration, browser/provider QA, commit or push. Browser QA and
  production provider acceptance remain outstanding; the five-agent specification is not complete.

## Five Specialized AI Agents — reject post-erasure customer writes (2026-10-25)

- POS order creation validates submitted customer IDs inside the order transaction and refuses
  missing/erased rows before writing an order. New loyalty enrollment and memberships likewise
  reject erased customer placeholders; historical financial/order records remain intact.
- Real-MySQL POS, loyalty, and membership coverage passes **3 suites / 35 tests**. The Voice
  Tracking numbers DB suite passes **1 suite / 2 tests** after call SID fixtures switched to UUIDs
  to avoid collisions from short timestamp suffixes.
- Backend/frontend `tsc --noEmit` and touched-file ESLint (existing Prettier-only findings disabled)
  pass. Full backend Jest passes **420/420 suites, 2,601/2,601 tests**. No migration, browser/live
  provider QA, commit, or push. This continues privacy hardening; the five-agent specification and
  production acceptance remain incomplete.

## Five Specialized AI Agents — consent-checked Customer Agent message drafts (2026-10-25)

- Customer Agent message drafts can now be previewed and explicitly queued by a staff member
  through the canonical messaging send gate. Queueing is idempotent per draft and reports the
  persisted message status; it does not claim that a provider delivered the message. Channel-
  specific consent is still not tracked, so the UI discloses that limitation.
- Marketing consent and opt-out are checked at preview, re-checked under a customer-row lock when
  queueing, then checked again immediately before provider delivery. A revoked/missing consent or
  opted-out customer is suppressed, marked failed, and audited without calling the provider.
- Real-MySQL Customer Agent and send-gate specs plus provider-worker tests pass **3 suites / 19
  tests**. Backend/frontend `tsc --noEmit`, ESLint on touched files and `git diff --check` pass.
  Full backend Jest passes **421/421 suites, 2,607/2,607 tests**. Browser and live-provider QA were
  not performed; no migration, commit, or push. This adds a safe human-reviewed message path, not
  autonomous Customer Agent delivery, and does not complete the five-agent specification.

## Five Specialized AI Agents — channel-specific CRM consent records (2026-10-25)

- Added append-only, versioned per-customer email/SMS/WhatsApp consent records with tenant
  isolation, an internal evidence-reference ID (never evidence text/contact details), actor audit,
  and revocation. Customer Agent marketing previews, queueing and the final provider worker check
  require the current explicit channel grant in addition to CRM marketing consent and opt-out.
- The customer profile now shows the real latest status and history and can record a grant or
  revocation with an evidence ID. Export includes the history; erasure removes it; a duplicate
  profile's latest revocation carries forward on merge, while grants are never copied. Existing
  legacy marketing senders retain their current CRM-flag behavior; strict channel consent is
  enforced on the Customer Agent path only.
- Hand-written migration `20261025120000_customer_channel_consent` was applied locally and its two
  foreign keys verified in `information_schema`; Prisma migration status is up to date. Focused
  real-MySQL/provider-worker coverage passes **5 suites / 34 tests**. Backend and frontend
  `tsc --noEmit`, touched-file ESLint, and the full backend Jest (**422/422 suites, 2,614/2,614
  tests**) pass. Browser/live-provider QA was not performed: no Noxtill browser session is logged
  in, and API port 5000 responds from macOS Control Center rather than the backend. No commit or
  push. This closes channel-consent enforcement for Customer Agent sends, not the entire CRM
  consent/communication scope or the five-agent specification.

## Five Specialized AI Agents — default-deny marketing consent and universal send enforcement (2026-10-25)

- New customer records now default to marketing consent off. The existing flag is no longer enough
  to authorize marketing delivery: every marketing send requires the latest explicit grant for its
  channel, both when it is queued and immediately before provider delivery. The worker also
  suppresses legacy queued marketing messages if they lack a grant. Missing customer identity,
  missing grant, revocation, and CRM opt-out all fail closed; suppression is audited and no provider
  call is made.
- Recording or revoking channel consent is append-only and audited. The broad CRM marketing flag is
  recomputed from the latest states across email, SMS and WhatsApp: it stays on only while at least
  one channel remains granted. A prior customer opt-out still blocks new grants. Existing customers'
  stored consent values were not bulk-rewritten; only the database default changed.
- The CRM list now filters explicit opt-outs from the separate general CRM consent flag, and the
  profile badge distinguishes opt-out, no recorded consent, and a general flag that still requires
  per-channel checks. The UI no longer equates missing consent with an opt-out.
- Hand-written migration `20261025130000_marketing_consent_opt_in_default` was applied locally,
  preserving existing rows and changing only the `customers.consent_marketing` default to false.
  Together with `20261025120000_customer_channel_consent`, Prisma reports all 218 migrations up to
  date; the live MySQL default was verified as `0` and Prisma Client was regenerated.
- Focused real-MySQL and provider-worker coverage passes **5 suites / 36 tests**. Backend and
  frontend `tsc --noEmit` passed; touched-file ESLint passed. The full backend Jest run passed
  **422/422 suites, 2,616/2,616 tests** with one worker. The logged-in QA browser showed the
  Customers page and Add Customer form disclosing that consent remains off until channel-specific
  permission is recorded; the form was closed without creating test data. No console errors were
  captured. The original logged-in tab closed before the later label correction; a fresh browser tab
  redirected to Login, so the corrected list/profile labels were type-checked and linted but not
  visually rechecked. The customer-profile grant/revoke flow and browser network panel were not
  exercised, and no live message/provider call was made. No commit or push. This hardens marketing
  consent across canonical messaging, but does not complete the five-agent specification or
  production acceptance.

## Five Specialized AI Agents — bounded Commerce tool inputs and quote output (2026-10-25)

- Commerce Agent tool calls now pass raw request values to the service boundary, which rejects
  undeclared fields, non-string values, oversized fields and oversized UTF-8 payloads before any
  tool-run record or canonical write is created. The tool registry now declares the optional
  destination country used by fulfillment-route calculation.
- RFQ quote comparison now uses a tenant-scoped, bounded projection: at most 20 quotes and 100
  lines per RFQ/quote, with total counts and truncation flags. Supplier phone/email, RFQ free text,
  payment terms and quote notes are omitted from the tool result. `get_order` likewise returns at
  most 100 deterministically ordered lines, with the total line count and a truncation disclosure.
  `get_inventory` now filters against each product's canonical low-stock threshold in MySQL, reports
  the exact qualifying count and bounds the returned product list to 500 with a truncation flag.
  `get_product` respects the canonical cost-visibility policy, and B2B quote previews omit credit
  balances, limits and the indirect credit-limit warning unless the actor has the owner-only Credit
  Recovery Report capability; the preview still uses the canonical B2B quote calculation.
- Real-MySQL Commerce Agent Tools spec passes **1 suite / 21 tests**; Commerce Agent Tools, Supplier
  Claims and B2B focused specs pass **3 suites / 33 tests**. Backend/frontend `tsc --noEmit`,
  touched-file ESLint and scoped `git diff --check` pass. Full backend Jest initially had one
  Health Score snapshot timeout with two workers; that suite passed alone (**3/3 tests**) and the
  full one-worker rerun passed **422/422 suites, 2,621/2,621 tests**. No migration, browser/provider
  QA, commit or push. This hardens manual Commerce tool requests; approval-connected orchestration
  and production acceptance remain incomplete.

## Five Specialized AI Agents — avoid scanning businesses without enabled daily reviews (2026-10-25)

- The specialist daily scheduler now selects only businesses whose JSON policy explicitly enables
  at least one daily review. Reviews remain default-off; module selection, agent switches,
  autonomy-level checks and per-agent idempotency remain enforced before a run starts.
- The real-MySQL scheduler spec asserts the candidate count for its opted-in fixtures. Isolated
  runtime decreased from **20.274 seconds to 1.935 seconds** on the current local database (946+
  accumulated test businesses); the query uses Prisma's MySQL JSON path filter and no schema change.
- Backend/frontend `tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. Full
  backend Jest passes **422/422 suites, 2,621/2,621 tests**. No migration, browser/provider QA,
  commit or push. This optimizes daily-review scheduling only; broader agent event coverage,
  approval-connected action execution and production acceptance remain incomplete.

## Five Specialized AI Agents — completed-sale Customer Agent review (2026-10-25)

- Added a default-off owner setting to queue an aggregate, read-only Customer Intelligence review
  after a customer-linked POS sale completes. Reviews are coalesced to one per business per UTC
  day and use the canonical Customer Analytics summary; they do not include customer contact data,
  call the AI provider, or send messages.
- `createSale` enqueues only after its transaction commits and only when the Customer Agent and new
  event policy are enabled. The worker rechecks the business/module/policies, exact order ID,
  business, completion status, non-quotation state, creation timestamp, linked non-erased customer
  and same-day idempotency before starting a run. Queue failures are logged and cannot roll back a
  completed sale.
- Customer Analytics now excludes anonymized erased profiles from customer summaries, cohorts,
  cohort drill-downs, KPI new-customer counts and new/returning aggregates. This prevents retained
  financial history from making an erased identity visible as an active customer. A real-MySQL
  regression checks the analytics surfaces before and after an erased placeholder/order is added.
- Focused real-MySQL POS, Customer event and Analytics tests pass **3 suites / 33 tests**.
  Backend/frontend `tsc --noEmit` pass. Touched backend ESLint passes with repository Prettier-only
  findings disabled; scoped `git diff --check` passes. Full backend Jest passes **422/422 suites,
  2,623/2,623 tests** with one worker. No migration, commit or push. Browser QA was not performed
  because the available Chrome tabs were on an unrelated app; no live provider call was made. The
  five-agent specification and production acceptance remain incomplete.

## Five Specialized AI Agents — reject queued Customer reviews after erasure (2026-10-25)

- Customer lapsed, failed-delivery and no-show jobs now recheck the linked profile at worker
  execution time and refuse erased placeholders. The underlying delivery/no-show review methods
  repeat the guard, so direct retries cannot recreate a review after erasure.
- Real-MySQL worker and service regressions cover queued-event replay after the profile is erased.
  Focused coverage passes **2 suites / 11 tests**; backend/frontend `tsc --noEmit`, touched backend
  ESLint and scoped `git diff --check` pass. Full backend Jest passes **422/422 suites,
  2,623/2,623 tests** with one worker. No migration, browser/provider QA, commit or push. This
  closes the post-erasure queued-event replay path; it does not complete the five-agent spec or
  establish production acceptance.

## Five Specialized AI Agents — business-scoped Customer aggregate event references (2026-10-25)

- Lapsed-customer and completed-sale reviews summarize the whole business for one UTC day. Their
  persisted source references now identify that business/day aggregate instead of retaining the
  first triggering ActivityEvent or Order ID, which could misleadingly associate the aggregate
  review with one customer's event.
- Real-MySQL tests verify same-day coalescing and that the triggering event/order identifiers are
  absent from the stored trigger reference. Focused Customer event and intelligence specs pass
  **2 suites / 11 tests**. Backend/frontend `tsc --noEmit` and ESLint on the two changed files pass.
  Full backend Jest passes **422/422 suites, 2,623/2,623 tests** with one worker. No migration,
  browser/provider QA, commit or push. This is a privacy-minimization correction, not completion or
  production acceptance of the five-agent specification.

## Five Specialized AI Agents — Commerce RFQ award approval (2026-10-25)

The Commerce Agent can submit a version-bound RFQ quote-award request for a second authorized user
to approve or reject with a reason. Approval rechecks current Commerce pause policy and calls the
canonical RFQ award service; it creates a draft purchase order only, with no supplier contact or
stock change. Requests are idempotent and decisions audited. Interrupted awards are reconciled from
canonical RFQ state rather than blindly retried. Real-MySQL Commerce Agent and RFQ tests pass **2
suites / 32 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and full backend Jest pass
(**422/422 suites, 2,625/2,625 tests**, one worker). The logged-in QA route loaded, but the
approve/reject browser interaction and console/network checks were not exercised. No migration,
commit or push; the five-agent spec remains incomplete and is not production accepted.

## Five Specialized AI Agents — Action Center Commerce approval handoff (2026-10-25)

Pending Commerce Agent RFQ quote awards now appear in the existing Dashboard Action Center, with a
deep link to the exact run. A different user can approve/reject there using the canonical Commerce
agent decision endpoint and a required reason; generic complete, dismiss and snooze are refused.
The Action Center exposes only a brief action summary, not quote or customer data. Real-MySQL
Action Center coverage passes **1 suite / 3 tests**. Backend/frontend `tsc --noEmit`, touched-file
ESLint, scoped `git diff --check`, and full backend Jest pass (**422/422 suites, 2,626/2,626
tests**, one worker). Browser QA confirms the Action Center loads in the QA business and has no
console warning/error logs; there was no pending Commerce approval in that business, so no approval
click was made and network requests were not independently inspected. No migration, commit or push.

## Five Specialized AI Agents — Commerce Agent read-only question flow (2026-10-25)

Agents & Tools now has a question flow that can select only six static, registered read-only
Commerce tools. Each call is rechecked against the registry and autonomy policy, executed through
the canonical tenant-scoped tool service, attributed as `commerce_agent`, bounded to three tool
calls and a capped result payload, and audited. Provider-requested write or unknown tools are
blocked. The question itself is not persisted in the specialist run; only its SHA-256 reference is
stored. Both provider turns use the existing specialist rate, monthly request and cost guardrails;
the cost estimator now accepts structured tool-use/result blocks and includes their serialized
size in its conservative input bound. No migration was needed.

Real-MySQL Commerce Agent plus AI-infrastructure focused specs pass **2 suites / 25 tests**. Backend
and frontend `tsc --noEmit` pass. Touched frontend ESLint passes; backend ESLint passes with the
repository's Prettier-only rule disabled (strict lint still reports the existing formatting
finding at `ai-infra.service.ts:533`, outside this change). Full backend Jest passes **422/422
suites, 2,629/2,629 tests** with one worker; the first run's Health Score timeout passed in
isolation and the clean full rerun passed. The logged-in QA business loaded
`/autonomous-commerce/agent-tools`; no live AI question was sent to avoid spending the client's
metered balance, and browser console/network logs were not inspected. No commit or push. The
five-agent spec and production acceptance remain incomplete.

## Five Specialized AI Agents — Inventory transfer approval in Action Center (2026-10-25)

Pending branch-transfer drafts created from Inventory Intelligence recommendations now appear in
the shared Action Center as a distinct approval item. Approve/reject endpoints are capability-gated
for stock-transfer management and delegate to the canonical `StockTransfersService`; generic
dismiss/complete/snooze is refused. Approval validates the destination SKU match and only marks the
transfer approved; it does not ship stock. Rejection requires and stores a reason. The Action Center
query is explicitly scoped to the source business, hides the item if Inventory or Branches is
disabled, and lists only recommendations from `inventory_intelligence`.

Added and locally applied migration `20261025140000_inventory_agent_transfer_action_center` for
the new action type. Real-MySQL coverage verifies visibility, tenant isolation, dismissal refusal,
canonical approval, no stock movement on approval, and reasoned rejection. Focused Action Center,
Procurement and Customer regression suites pass **7 suites / 58 tests**; backend/frontend
`tsc --noEmit` and touched-file ESLint pass. Full backend Jest passes **423/423 suites,
2,630/2,630 tests**. The live Action Center loaded in the QA business, the new type appears in its
filter, and browser console warning/error logs were empty. That business had no pending Inventory
Agent transfer, so the approval buttons and network trace were not browser-tested. No provider call,
commit or push. This adds one canonical agent handoff; it does not complete or production-accept
the five-agent specification.

## Five Specialized AI Agents — Commerce experiment decision review (2026-10-26)

Commerce can now optionally queue a read-only specialist review after a merchant records a final
Experiment Lab decision. The new owner policy is default-off. The worker rechecks the active
business, Commerce module, specialist switch, event toggle, autonomy level, final experiment state
and exact experiment version before it starts; duplicate delivery is idempotent. The review stores
the final decision as context but does not claim causality or edit products, listings or experiments.
Queue failure does not roll back the merchant's decision. Settings links to the canonical Experiment
Lab screen and describes the action as observational.

Real-MySQL producer and worker coverage passes **2 suites / 13 tests**. Backend/frontend
`tsc --noEmit`, touched backend ESLint (with existing Prettier-only findings disabled), and the full
backend Jest run pass (**424/424 suites, 2,637/2,637 tests**, one worker). No schema migration or
provider call was needed. Browser QA was not performed; no commit or push. This adds one opt-in
Commerce event path and does not complete the five-agent specification or establish production
acceptance.

## Five Specialized AI Agents — Commerce reconciliation event review (2026-10-26)

Completed provider reconciliation runs with actual discrepancies can now queue an optional,
read-only Commerce review. The owner-controlled setting is default-off. The producer queues only
after saving a completed check with discrepancies, and a queue outage does not undo the saved
check. The worker revalidates the current business/module/agent/event policy, autonomy level, exact
saved run timestamp and discrepancy state; it pins the run ID and saved provider/check counts in
the event reference and deduplicates redelivery. It does not call the provider a second time or
change listings.

Focused real-MySQL reconciliation producer/worker coverage passes **3 suites / 18 tests**. Backend
and frontend `tsc --noEmit` pass; touched backend ESLint passes with existing Prettier-only
findings disabled. Full backend Jest is **423/424 suites and 2,639/2,640 tests**: one unrelated
Voice number-fees test exceeded its 5-second timeout under the full-suite run and passes isolated
(**1 suite / 2 tests**). No migration or provider call was needed. Browser QA was not performed; no
commit or push. This adds one opt-in Commerce event path and does not complete the five-agent
specification or establish production acceptance.


## Five Specialized AI Agents — Commerce supplier-claim approval (2026-10-26)

The Commerce Agent can now request submission of an existing supplier claim through a
second-person approval. Approval rechecks the canonical claim version and evidence before calling
the supplier-claims service; it only records the submitted state for follow-up and sends no
supplier message. The decision is audited, duplicate/recovered runs reconcile against canonical
claim state, and the UI links to the claim rather than implying that a supplier was contacted.

Focused real-MySQL Commerce Agent coverage passes **1 suite / 25 tests**. Backend and frontend
`tsc --noEmit`, touched-file ESLint, and `git diff --check` pass. The full backend Jest run passes
**424/424 suites, 2,642/2,642 tests** with one worker. Browser QA could not get past login: the
available local accounts did not authenticate as a business, so the approval interaction and
browser console/network checks remain unverified. No migration or provider call; no commit or
push. This closes one Commerce Agent approval path only; the five-agent system is not complete or
production-accepted.


## Five Specialized AI Agents — supplier-claim approval in Action Center (2026-10-26)

Pending Commerce Agent supplier-claim submissions now appear in the existing Dashboard Action Center.
The requester cannot decide their own request; generic dismiss, snooze and complete are refused.
Approve/reject uses the existing canonical Commerce Agent decision endpoint with a required reason.
The claim’s current version and evidence are rechecked there, and successful approval only marks it
submitted for follow-up; it does not contact the supplier. The queue links to the exact agent run
and uses claim-specific review copy.

Real-MySQL Action Center coverage passes **1 suite / 4 tests**. Backend/frontend `tsc --noEmit`,
touched-file ESLint and `git diff --check` pass. Full backend Jest finished **422/424 suites and
2,641/2,643 tests passed**; the two failures were database-heavy timeouts in Health Score snapshot
and Voice number-fees. Each passes alone: **1 suite / 3 tests** and **1 suite / 2 tests**. No
migration or provider call. Browser QA remains blocked at login because the available local
accounts did not authenticate as a business. No commit or push. This completes the shared queue
handoff for this claim action only; it does not complete or production-accept the five-agent scope.

## Five Specialized AI Agents — Commerce Agent read-only research and claim tools (2026-10-26)

The Commerce Agent question flow now has three additional registered read-only tools: Product Radar
opportunity details, Product Validation evidence coverage/recent decisions, and supplier-claim status.
Radar reads selected canonical fields and labels stored research as unverified. Validation uses the
existing scorecard service and returns at most five decisions without reasons. Claim totals use
database aggregates and at most ten recent settlements; evidence contents, file links, free-text
reasons, item descriptions, supplier contact details and communication notes stay out of model
context. Claim totals remain operator-recorded and do not prove supplier acceptance, cash receipt or
replacement delivery. No tool writes, publishes or contacts suppliers.

Focused real-MySQL coverage passes **3 suites / 43 tests**. Backend/frontend `tsc --noEmit` pass;
full backend Jest passes **424/424 suites, 2,646/2,646 tests**. Touched backend lint passes; the
standard lint command reports only existing Prettier-format findings elsewhere in the already
modified `product-validation.service.ts`, while its non-format lint passes. Frontend lint and scoped
`git diff --check` pass. Browser QA was not performed because the available browser tab is a
different local app. No migration, provider call, commit or push. This is one additional Commerce
Agent read path, not completion or production acceptance of the five-agent scope.

## Five Specialized AI Agents — Commerce risk and listing detail reads (2026-10-26)

Added two tenant-scoped, read-only Commerce Agent question tools for existing Risk & Compliance
cases and channel-listing sync records. Risk output includes the recorded rule, severity, status,
signal count and exposure, but omits raw evidence, resolution, entity labels and entity IDs; its
copy states that a risk case is not a confirmed loss or order hold. Listing output uses the saved
local status/version/product fields and omits external provider IDs and provider error text. The
question UI now names these available sources and states the sensitive fields excluded from AI.

Focused real-MySQL Commerce coverage passes **2 suites / 37 tests**. Backend and frontend
`tsc --noEmit`, touched backend/frontend ESLint and scoped `git diff --check` pass. Full backend
Jest passes **424/424 suites, 2,647/2,647 tests**. No migration or provider call. Browser QA remains
unverified because the open browser is a different local app. No commit or push. This adds two
bounded reads only; it does not complete or production-accept the five-agent system.

## Five Specialized AI Agents — Commerce Agent Experiment Lab questions (2026-10-26)

Added a read-only `get_experiment_review` tool to the Commerce Agent. It delegates to the canonical
Experiment Lab review for up to 20 running or decided experiments; drafts are excluded. The tool
returns saved frozen results for decided experiments and the canonical live calculation for running
ones. UI and tool descriptions disclose that before/after comparisons are observational, not causal
or statistically significant. No experiment or product is modified.

Focused real-MySQL Commerce Agent tests pass **2 suites / 39 tests**. Backend and frontend
`tsc --noEmit`, touched-file ESLint, and scoped `git diff --check` pass. Full backend Jest passes
**424/424 suites, 2,649/2,649 tests** with one worker; the Health Score suite also passes isolated
**1 suite / 3 tests** after database contention caused its two tests to time out in the two-worker
full run. Browser QA remains unavailable because Chrome's localhost:3000 is another application.
No migration, provider call, commit or push. This adds one Commerce Agent read path and does not
complete or production-accept the five-agent system.

## Five Specialized AI Agents — structured Commerce risk evidence (2026-10-26)

Commerce risk-case evidence now includes safe numeric facts already captured by the canonical
detectors: detection window, threshold, return/order counts, affected product count and excess units
where applicable. The read-only agent projection exposes only those structured numeric facts and
continues to omit raw evidence text, resolution notes, labels and underlying record IDs. Older cases
without stored snapshot fields return null where a value cannot be derived safely.

Focused real-MySQL coverage passes **3 suites / 43 tests**. Backend/frontend `tsc --noEmit`, touched
backend/frontend ESLint and scoped `git diff --check` pass. The full backend Jest run passes
**424/424 suites, 2,649/2,649 tests** with one worker. The two-worker attempt hit database contention
in Health Score snapshot tests; those pass alone (**1 suite / 3 tests**) and in the one-worker full
run. Browser QA remains unavailable because Chrome's localhost:3000 is another application. No
migration, provider call, commit or push. This improves the evidence available to the Commerce Agent
but does not complete or production-accept the five-agent system.

## Five Specialized AI Agents — Store Optimizer aggregate review tool (2026-10-26)

Added a read-only Commerce Agent tool that reuses the canonical Store Optimizer rule scan and
returns only current finding counts by rule and impact. It omits product names, customer data,
return reasons and raw evidence. The result states that a rule finding is not proof of cause or
financial impact, and that storefront sessions, impressions, conversion and drop-off are not
tracked by this scan. The tool makes no status or live commerce changes.

Focused real-MySQL Commerce Agent coverage passes **1 suite / 31 tests**. Backend/frontend
`tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. Full backend Jest passes
**424/424 suites, 2,651/2,651 tests** with one worker. Browser QA in the QA business confirms that
the page loads, the read-only tool is registered at Observe level, the run returns real current
data and limitations, and its audit is successful. No JavaScript errors were captured. Notification
requests returned errors while the backend was stopped for the full test run; they recovered after
restart and auth refresh. No migration, provider call, commit or push. This adds one aggregate read
path; it does not complete or production-accept the five-agent system.

## Five Specialized AI Agents — Production & Assembly review tool (2026-10-26)

Added the read-only `get_production_review` Commerce Agent tool, reusing `CommerceProductionService`
and tenant-scoped database aggregates for BOM counts, work-order status counts/units, late open
orders and completed output. It omits product names, demand-source text and costs; it explicitly
does not diagnose lateness or infer capacity. The Agents & Tools disclosure and the AI tool schema
describe this scope. No records are changed.

The real-MySQL Commerce Agent spec passes **1 suite / 32 tests**. Backend and frontend
`tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. Full backend Jest passes
**424/424 suites, 2,652/2,652 tests** with two workers. Browser QA in the isolated QA business
confirmed the screen loads, the tool runs and is audited successfully, empty production data is
reported accurately, all app API requests returned 200 after reload, and no console errors were
captured. No migration, provider call, commit or push. This adds one production-data read path; it
does not complete or production-accept the five-agent system.

## Five Specialized AI Agents — Commerce Production review prioritization (2026-10-26)

Added the canonical Production & Assembly aggregate to the saved Autonomous Commerce review and
the existing Commerce Agents & Tools page. Review evidence reuses `CommerceProductionService`,
records real BOM/work-order counts and units, and omits product names, demand-source text and costs.
The deterministic queue now selects overdue planned/in-progress work orders after the existing
risk, listing, validation, RFQ and experiment checks. Its wording labels lateness as a follow-up
cue and does not claim a cause or capacity diagnosis. A real-MySQL test verifies that a late
production order is selected when earlier queues have no work, that the due-date/status evidence
is attached, and that test fixtures are removed.

Focused real-MySQL Commerce Agent coverage passes **1 suite / 11 tests**. Backend and frontend
`tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. Full backend Jest passes
**424/424 suites, 2,653/2,653 tests** with one worker; an earlier two-worker run had database-load
timeouts in Health Score and Voice number-fee tests (the fee suite passes alone). Browser QA in
the logged-in QA business confirmed the review runs and persists after reload, reports the actual
empty Production state, and produced no console errors. Local frontend and API health endpoints
returned HTTP 200; the browser's isolated page context did not expose Performance API entries, so
per-request network status was not directly inspected. No migration, provider call, commit or push.
This adds one bounded Commerce review path; it does not complete or production-accept the five
specialist agents.
