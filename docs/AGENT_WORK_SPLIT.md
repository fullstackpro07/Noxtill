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
  earlier history. That QA-only test assumption remains in the test business. Physical equipment and
  supplier lead times are disclosed as not tracked; staff/service capacity and product cost coverage
  are disclosed as partial for the documented source-data gaps.
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
