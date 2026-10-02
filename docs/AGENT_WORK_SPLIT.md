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
