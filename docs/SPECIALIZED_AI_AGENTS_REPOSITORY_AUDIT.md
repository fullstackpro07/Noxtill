# Five Specialized AI Agents — Repository Audit

Date: 2026-10-22
Source: `Noxtill_Five_Specialized_AI_Agents_Developer_Master_Specification (1).docx`

This is an initial repository map, not an implementation or production acceptance claim. The
client document explicitly says its requirements are a behavior contract, not evidence that a
capability is already implemented. It defines no delivery timeline.

## Shared foundation

| Contract area | Existing repository evidence | Initial status |
| --- | --- | --- |
| Authentication, tenancy and capability checks | Global guards, `@CurrentUser`, `TenantPrismaService`, capability decorators | Reuse |
| AI provider guardrails | `AiInfraService` centralizes model requests, rate limits, cost cap, feature toggles and usage logging; specialist requests reserve per-agent caps and link completed usage to runs | Reuse; cost is an application estimate, not a provider invoice |
| Human action queue | Dashboard Action Center synthesizes canonical work and records complete/dismiss/snooze state; Procurement approvals already use canonical decisions | Reuse; do not build a second approval inbox |
| Workflow execution | Automations has workflow runs, retries, approvals, schedules and agent steps | Reuse for scheduled/event-driven work where appropriate |
| Shared specialist run/evidence/action records | Tenant-scoped `SpecialistAgentRun`, `SpecialistAgentRecommendation`, `SpecialistAgentEvidence`, `SpecialistAgentAction`, run-linked AI usage, per-agent request reservations, and idempotent run/action creation exist. Run-created/terminal snapshots are materialized when an owner opens run history; all saved action transitions and proposal revisions are normalized there in cursor-paged metadata events. Intermediate run-state changes are not captured. A shared typed tool gateway records redacted tenant-scoped calls for registered providers; Commerce, Inventory, SEO and Finance use it, and Customer uses it for canonical analytics, customer-review context, repeat-visitor preview and latest channel-consent status. A configurable per-run tool-call cap is enforced by the gateway. There is no generic metric-snapshot model. | Partial foundation; canonical module services still own approval and writes |
| Shared specialist directory / workspace | AI Assistant and Action Center exist; no cross-module Specialist Agent Center route was found in the initial route search | Reuse existing surfaces where possible; confirm UX before adding navigation |

## Agent-by-agent map

| Specialist | Existing canonical features to reuse | Current remaining boundary |
| --- | --- | --- |
| SEO Autopilot Agent (Module 28) | SEO audits, keywords, rank observations, Search Console snapshots and URL Inspection, read-only GA4 Organic Search aggregates and landing-page paths, versioned on-page/technical/content proposals, local/off-page workflows, calendar/reports/settings, and SEO Agent Workspace | Evidence-backed reviews and canonical approval handoffs exist. GA4 sessions, key events, property-reported revenue and page-path aggregates can be synced for a selected property and appear in Reports and SEO Agent evidence. They are attribution data, not Noxtill order reconciliation or proof of SEO causality. Search Console URL Inspection shows Google's stored index status; it does not verify a live change or request re-indexing. Backlink authority, full execution verification and outcome measurement remain partial/unavailable. |
| Autonomous Commerce Agent (Module 29) | Product Radar/validation, RFQs, listings, fulfillment/routing, risk, experiments, B2B, subscriptions, permissioned read/write tools, approved RFQ/claim actions, event reviews and a bounded order-to-route read orchestration | Broader multi-domain plan orchestration and worker delegation are partial. Not every connector action has provider-confirmed execution, independent verification, recovery and measured outcomes. |
| Inventory Intelligence Agent (Module 13) | Canonical stock/movements/counts, historical demand baselines and backtests, reorder evidence, supplier/product lead-time and pack context, open-purchase offsets, branch transfer checks, recount/wastage tasks and a consent-gated waitlist preview | No calibrated forecast is claimed; seasonality and stockout-censored demand are not established. Event reviews are opt-in and limited to implemented source events. Post-action follow-through includes PO receipt, current stock and a descriptive Noxtill-recorded sales comparison; causal attribution and external sales coverage are unavailable. |
| Financial Intelligence Agent (Module 30) | Profit Analytics, approved budgets, manual Noxtill journals and reversals, partial manual-journal trial balance, imported statement suggestions, Xero open items/status, budget actuals, anomaly cues and period-close readiness | Automatic finance postings, a complete accounting ledger, Finance-owned A/R and A/P, authoritative cash balances, full provider reconciliation and a certified accounting close remain unavailable. |
| Customer Intelligence & Retention Agent (Module 7) | Customer profile/activity reviews, source-backed summaries, rule-based retention cues, segment drafts and approval, privacy-minimized business reviews, follow-up tasks, consent-checked message drafts/actions, and a registered read-only latest-consent-status tool | Customer-channel consent and activity coverage depend on canonical module records. Broad all-channel delivery and post-contact outcome measurement are not claimed unless the canonical provider confirms them. |

## Implementation order

1. Freeze this repository map and verify table/service ownership before adding models.
2. Add a shared, tenant-scoped run/evidence/config foundation that uses existing AI guardrails, audit,
   capabilities, Action Center and workflow services rather than duplicating them.
3. Deliver one read-only Inventory Intelligence vertical slice using existing stock/reorder services
   and reproducible evidence; no stock mutation or purchase order is created by the agent.
4. Integrate the remaining agents through their canonical module services. Keep missing finance,
   SEO provider, commerce connector and CRM consent data explicitly partial/unavailable.
5. Add cross-module event handoffs only after individual tenant-scope and idempotency contracts are
   tested. Finish with per-agent acceptance matrices and the shared security/QA gates in the client
   specification.

## Decisions and limits

- The client specification is the requested product behavior; embedded example route names and
  sample JSON are logical contracts, not commands to reproduce literally.
- The five agents belong inside existing modules. They are not five new standalone products.
- All writes stay with canonical domain services. The shared agent layer records runs and evidence,
  then submits existing review/action requests.
- No provider credential, cross-tenant access, new external message or paid AI call is needed for
  the repository audit or initial read-only implementation.
- This audit did not run tests or make live provider calls.

## Progress — 2026-10-22

### Inventory Intelligence Agent: first read-only slice

- Added tenant-scoped shared run, recommendation and evidence tables, registered them for tenancy,
  and applied the hand-written MySQL migration `20261022090000_specialist_agent_foundation` locally.
- Added a manager/owner-gated `POST /inventory/agent-runs` and tenant-scoped
  `GET /inventory/agent-runs`, surfaced inside the existing Reorder Suggestions page.
- The run reuses `ReorderSuggestionsService`, `InventoryService` and `StockCountService`; it persists
  real reorder inputs, canonical low-stock/days-of-cover and overstock signals, draft stock-count
  variances, and recorded wastage aggregates as evidence. Open purchase quantities are exposed as
  evidence and separately offset from the specialist's proposed quantity; the canonical reorder
  formula itself remains unchanged. It does not change stock or create a PO.
- AI commentary is optional to the deterministic result and goes through `AiInfraService`; no live
  provider request was made during implementation or tests. Missing/blocked AI is shown as a
  disclosure rather than fabricated output.
- At the initial audit there was no surfaced supplier-specific historical lead-time observation or
  product-mapped MOQ/pack-size, and reserved/committed quantities and seasonality were absent; these
  limits were disclosed where they affected a signal. A later entry adds historical PO timing only.
  Count variances are explicitly old draft snapshots and
  wastage is reported as recorded events only, not assigned a cause. Confidence is
  explicitly uncalibrated/unavailable. This is not the complete Inventory Agent contract: calibrated
  forecast ranges, branch rebalance, back-in-stock notification preparation, action/approval
  lifecycle, agent configuration and the remaining four agents are still outstanding.
- Verification: Prisma schema validation/generation, backend and frontend `tsc --noEmit`, focused
  real-MySQL tests (2 suites / 6 tests), AI settings test (1 suite / 3 tests), backend/frontend lint
  on the changed code, fabrication grep and `git diff --check`, and full backend Jest (`400` suites /
  `2,425` tests passed) on the current implementation.
- Browser visual QA has not been completed: the local frontend server was not running, and port
  5000 is occupied by macOS Control Center/AirTunes rather than the Noxtill API. No claim of visual
  or live-provider verification is made.

### Inventory Intelligence Agent: historical demand baseline

- Added a review-only estimate from this business's recorded `sale` stock movements. The run groups
  history into eight fixed seven-day buckets, calculates a seven-day baseline as total recorded
  units divided by eight, and reports the observed min-to-max weekly recorded sales.
- The UI labels the result as a historical baseline, not a calibrated forecast. Weeks without a
  recorded sale are counted as zero recorded units, not asserted to have zero real-world demand;
  sparse history is called out per recommendation. Seasonality, calendar effects, stockout-censored
  demand, external sales feeds and calibrated uncertainty are not available here.
- The query is business-scoped, includes only active product records, persists source field refs and
  the formula in evidence, and does not change stock or create a purchase order. No schema migration
  was needed.
- Verification: Inventory real-MySQL spec (3/3 tests), backend and frontend `tsc --noEmit`, and
  targeted backend/frontend ESLint pass. The full backend suite passes (405/405 suites,
  2,443/2,443 tests). Browser visual QA remains pending.

### Financial Intelligence Agent: read-only Profit Analytics review slice

- Added owner/manager-gated `POST /profit/agent-runs` and tenant-filtered
  `GET /profit/agent-runs`, surfaced in the existing Profit Overview rather than creating a second
  finance dashboard. The run calls the canonical `ProfitService.pnl`; no duplicate P&L formula or
  finance source table was introduced.
- Runs persist the actual source snapshot, metric definitions/assumptions, evidence field references,
  an uncalibrated confidence state, and an audit record. They do not post journals, reconcile,
  change orders/expenses, or send money. Optional AI explanation goes through `AiInfraService` and
  the new `financeAgent` toggle; provider failure leaves the deterministic P&L result intact. No
  live provider call was made by tests.
- Verified no finance-owned general ledger, bank reconciliation, A/R or A/P aging, approved finance
  budget, or period-close source exists in this code path. The UI and persisted recommendation mark
  those as unavailable. No FX conversion source exists; requests spanning businesses with different
  currencies are refused instead of summing and labeling unlike currencies as one amount.
- Verification: Finance real-MySQL spec (1 suite / 4 tests), backend and frontend `tsc --noEmit`,
  targeted backend/frontend ESLint on changed agent files, fabrication grep, and full backend Jest
  (`401` suites / `2,429` tests passed). A whole-file lint of the pre-existing compact
  `settings-hub/categories/intelligence.ts` reports repository-wide Prettier formatting findings;
  that large file was not reformatted. Browser visual QA remains pending because no frontend server
  is listening and port 5000 is owned by macOS Control Center/AirTunes. No migration was added for
  Finance; it reuses the locally applied shared specialist-agent tables.

### Customer Intelligence & Retention Agent: aggregate review and segment draft

- Added a read-only, owner/manager-gated run at `POST /analytics/customers/agent-runs`, reusing
  `AnalyticsService.customerSummary` and `SegmentsService.previewCount`; the latest ten saved runs
  are returned from a tenant-scoped GET endpoint and shown inside the existing Customer Insights page.
- The run saves an evidence-backed draft for the deterministic rule `visitCount > 1`, including a
  live matching count only for the current business scope. The draft is not created or activated as
  a CRM segment. The page links to the canonical Segments screen for manual review. No message,
  campaign, merge or customer record is changed.
- The optional AI explanation goes through `AiInfraService` and the new `customerAgent` feature
  toggle. It receives only anonymized aggregate counts (customer total, current-month new count,
  returning count, visit-history denominator, existing retention percentage and the repeat-rule
  count); it excludes names, contacts, notes, customer IDs, messages, credit and individual spend.
  The deterministic result remains saved if AI is disabled or unavailable.
- Retention is explicitly the existing Analytics formula `returningCount / withVisitCount`; it is a
  historical aggregate, not churn prediction. Segment match count is omitted for an explicit
  non-current branch scope because the canonical Segment preview endpoint is scoped to the current
  business. This is an initial read-only slice, not the full CRM agent contract: Customer 360,
  booking/review/inbox context, risk thresholds, follow-up prioritization, consent-aware message
  drafts, CRM data-quality and merge suggestions, and erasure-aware agent-memory policy remain.
- Verification: real-MySQL Customer agent, AI Settings and Analytics specs pass (3 suites / 17 tests);
  current backend and frontend `tsc --noEmit` both pass, including the final segment-count
  response-shape correction. Targeted backend/frontend ESLint passes for the Customer slice. No
  migration was added. Browser visual QA remains pending.

### SEO Autopilot Agent: workspace queue review

- Added the run inside the existing `/marketing/seo-autopilot/workspace` experience and reuses
  `SeoAgentWorkspaceService.queue`; it does not create another approval queue or website-publishing
  lifecycle. Runs persist a deterministic next-review cue, source references, assumptions, missing
  data, evidence and audit state in the shared specialist tables.
- Optional AI commentary is guarded by `AiInfraService` and `seoAgent`. It receives aggregate queue
  counts and selected queue-stage metadata, not page URLs, site content or provider credentials.
  If AI is unavailable or disabled, the real deterministic queue result remains available.
- The fixed queue order is not a search-impact score. Google Search Console/analytics performance,
  traffic, impressions, search-volume and backlink-authority measurements are not used or estimated.
  This remains a first review-only slice: cross-module data, calibrated opportunity impact, action
  proposals/handoffs and outcome verification are not yet part of the specialist run.
- Verification: included in the focused seven-suite real-MySQL/AI/capability run (19 tests total);
  current backend and frontend type checks and targeted ESLint pass. Browser visual QA remains
  pending.

### Autonomous Commerce Agent: read-only queue review

- Added `GET/POST /commerce/agent-tools/specialist-runs` to the existing permissioned Agents & Tools
  surface. Starting a review requires `COMMERCE_AGENT_RUN`; it also checks the existing
  `commerce.autonomyLevel` policy and refuses before creating a run when autonomy is Disabled.
  History remains tenant-scoped.
- The run counts current statuses from canonical Product Radar opportunities, Commerce RFQs, Risk
  cases, Channel Listings and Experiments, then records a deterministic review cue, assumptions,
  missing-data notes, evidence references and an audit event in the shared specialist-run tables.
  It does not mutate these records or execute an agent tool.
- The optional explanation uses `AiInfraService` and the `commerceAgent` feature toggle. Only
  aggregate status counts reach the provider; RFQ requirement text, candidate titles, identifiers,
  customer information and provider credentials are excluded. AI failure or a disabled toggle
  leaves the deterministic review saved.
- The fixed review order is not a calibrated score. A risk case is not treated as an order hold;
  the UI states that explicitly. Provider sales, traffic, profit, demand, supplier quality and
  delivery outcomes are not inferred. At this initial checkpoint, the read-only slice was not the
  complete Commerce agent contract. Sourcing comparisons and validation evidence scorecards were
  added in later entries below; fulfillment exceptions, listing reconciliation, claims, experiment
  analysis, safe action drafts, approval/idempotency contracts, orchestration, event handoffs and
  wider cross-module permissions remain outstanding.
- Verification: real-MySQL specialist-agent spec, including tenant isolation, private-record
  redaction from the AI prompt, audit/evidence creation and no source-record writes; included in the
  focused seven-suite run (19 tests total); backend and frontend type checks and targeted ESLint.
  After adding the disabled-autonomy guard, the Commerce real-MySQL spec passes (1 suite / 5 tests),
  both type checks and targeted ESLint pass. Browser QA was pending at this checkpoint; the isolated
  Commerce review page was exercised in Playwright on 2026-10-24 (see the later feature entries).
  No additional migration was needed; this reuses the locally applied shared specialist-agent
  migration.

## Progress — specialist-agent enablement

- Added typed `Business.policies` switches for Inventory, Finance, Customer, SEO and Commerce
  specialist runs, all defaulting to enabled so existing businesses keep their current behavior.
- Added owner-controlled rows under Settings → AI & Governance → Specialist agent access. Each row
  links back to its canonical module. These switches control whether a manual specialist review may
  run; the separate AI feature switches still control provider explanations.
- All five run services check the policy before reading source records or creating run/evidence
  rows. The shared policy service resolves the active business from CLS rather than trusting a
  caller-supplied business ID, and returns typed `SPECIALIST_AGENT_DISABLED` / not-found errors.
- Added a real-MySQL policy spec covering enabled defaults for all five agents, disabling each
  agent, active-tenant enforcement and unknown-business handling (4 tests). The Commerce spec also
  verifies a disabled agent creates no run.
- Verification: backend and frontend `tsc --noEmit` pass; targeted lint passes for changed source
  files (the pre-existing compact `settings-hub/categories/intelligence.ts` still has whole-file
  Prettier noise); 9 focused suites / 44 tests pass. The latest full backend Jest run passes
  (405/405 suites, 2,443/2,443 tests). An earlier full run had a health-score scheduler timeout
  under contention; the isolated suite passed (3/3) and the latest full run passed it as well.
  Browser visual QA remains pending.
- No migration was needed because these switches use the existing policies JSON column. Nothing was
  committed or pushed.

## Current scope reminder

All five agents have initial review slices. Inventory also has a bounded, versioned handoff into the
canonical Procurement approval flow, ending at a draft purchase order (details below). Opt-in daily
scheduled reviews exist for all five agents. Twenty-two opt-in event-triggered source paths now exist:
SEO after a successful/partial site audit; Inventory after a canonical low-stock event, an applied
stock count, a fully received purchase order, a confirmed branch-transfer receipt, or recorded
wastage; Customer after
newly-lapsed events (coalesced to one aggregate review per business per UTC day), a newly failed
delivery, an appointment no-show or cancellation, or a completed POS sale; Commerce after Product
Validation, a newly failed delivery, a supplier quote, a final experiment decision, or a
discrepancy-bearing provider reconciliation; and Finance after a newly saved expense, a completed
order, an approved return, an approved budget revision, a posted manual journal, or an imported bank
statement.
Workers revalidate tenant/policy/source state and are idempotent; they do not call AI or apply
changes. An owner-only cross-agent review now runs through a durable queue with persisted child
progress, bounded retries, recovery after worker interruption, retry of failed children, and a safe
stop request that lets an in-flight read-only review finish while preventing later reviews from
starting. General event coverage, a durable/policy-bounded cross-agent action lifecycle, complete
agent-specific capabilities, complete operational metering, and wider browser/provider QA remain
unfinished. Cross-agent material-action orchestration is not available; the cross-agent review is
read-only. Commerce registry elapsed-time metrics now cover only completed/failed agent and internal
orchestration tool calls, not other agents' tools.
No claim of production readiness or complete delivery is made.

Opt-in daily scheduled reviews for all five specialists were added on 2026-10-25 (see the progress
entries at the end of this audit). This does not complete general event-driven triggers or durable,
policy-bounded cross-agent action orchestration.

## Customer Agent — completed-sale event review (2026-10-25)

A new owner-controlled, default-off setting can queue one aggregate Customer Intelligence review
per business per UTC day after a customer-linked POS sale completes. The producer enqueues after the
canonical sale transaction, while the worker rechecks module and agent policy, exact same-tenant
completed non-quotation order state/version, and that the linked customer is not erased. It uses the
existing Customer Analytics summary and records an event-triggered run with an order reference; it
does not send customer data to an AI provider or contact the customer. Queue errors do not roll
back the sale.

The real-MySQL POS and Customer event specs pass **2 suites / 20 tests**; backend/frontend type
checks pass; touched backend ESLint passes with existing Prettier-only findings disabled. Full
backend Jest passes **422/422 suites, 2,622/2,622 tests**. Scoped whitespace checks are clean. No
migration, commit or push. Browser QA/live-provider acceptance were not performed. This adds one
opt-in Customer event source, not general event coverage or a complete five-agent action lifecycle.

## Inventory Agent — supplier-contract evidence on reorder findings (2026-10-25)

Reorder suggestions now include supplier-level context from the canonical Procurement supplier
contract records already linked to the suggested supplier. Only active, terms-confirmed contracts
within their effective date range are included. Minimum order quantity, business currency, categories
and effective dates are surfaced as context and evidence, not applied to the recommendation: there
is no verified SKU/unit mapping, so the existing reorder quantity calculation is unchanged. The
real-MySQL test proves eligible terms appear and unconfirmed terms do not. No migration, provider
call, or data write was needed. Focused Inventory coverage passes **2 suites / 14 tests**; backend
and frontend type checks and touched backend ESLint pass. The latest full backend Jest is **412/416
suites and 2,497/2,562 tests passed**. Three recurring Assistant/Help/Voice fixtures fail; Review
Reminders timed out under load but passed alone (**1 suite / 3 tests**). Browser QA remains
unavailable (no frontend listener on 3000; macOS ControlCenter owns 5000); no commit or push. The
five-agent specification remains incomplete and is not production accepted.

## Inventory Agent — observed supplier/product PO lead-time context (2026-10-25)

For each reorder suggestion, Inventory Intelligence now checks completed purchase orders for the
same product and its last recorded supplier. It reports median, minimum and maximum elapsed days
from `PurchaseOrder.sentAt` to the final `receivedAt`, the sample count, a rolling 365-day window,
and whether the latest-1,000-order sample cap was reached. The source is persisted as structured
recommendation evidence and appears in the existing expandable evidence panel. This is a
retrospective measure only: no supplier SLA/guaranteed future date is inferred, and the existing
30-day base reorder formula is unchanged. A missing sample is explicitly disclosed as not tracked for
that product/supplier. Contract MOQ remains supplier-level context because SKU/unit mapping is not
verified. The Digital Twin copy now makes the same distinction rather than implying no historical
PO observation can exist.

No schema migration, provider call, or source-record write was needed. The five focused appointment,
Customer CRM/event and Inventory suites pass **5/52**; after the final sample-cap wording adjustment,
the Inventory DB and reorder specs pass **2/14**. Backend/frontend `tsc` and touched backend/frontend
ESLint pass. The latest full backend Jest is **413/416 suites, 2,498/2,562 tests passed**; the three
recurring failures are Assistant retrieval, Help retrieval and VoiceCallService's fixed-phone
uniqueness fixture. Credit teardown and SEO Workspace passed alone after earlier parallel-only
failures and also pass in the latest full run. Browser QA remains blocked by no frontend listener on
port 3000 and macOS ControlCenter occupying 5000. No commit or push; this does not complete the
five-agent specification.

## Progress — Inventory recommendation to canonical Procurement request (2026-10-22)

- Added a capability-gated action on a saved reorder recommendation. It reuses the existing
  ProcurementRequest, request versions/events, Action Center approval, and PurchaseOrder models;
  no parallel approval queue or purchase-order engine was created. Stock is not changed and no
  supplier message, purchase commitment, payable or provider request is sent by this action.
- The draft stores its recommendation link, original stock/sales/outstanding-purchase evidence,
  source hash and exact canonical request payload hash. The original recommendation expires after
  24 hours; editing a draft updates its canonical version and payload hash, not its source age.
  Submit, approve and convert recheck fresh permissions, module selections, the agent kill switch,
  expiry and source/payload freshness. A stale request can still be rejected with a reason.
- A unique recommendation link plus a transactional claim makes concurrent preparation idempotent.
  Existing conversion compare-and-set protection creates one canonical draft PO. Sourcing an agent
  request into RFQs is explicitly refused because that action adapter is not implemented yet.
- Quantity comes from the same existing reorder calculation, now extracted into a shared helper.
  Product cost is explicitly an estimate, not a supplier quote. Completed purchase-order timing is
  now shown as historical supplier/product context when available, but not as a future SLA or an
  input to the existing formula. Pack sizes and product-mapped minimum order quantity remain
  excluded as formula inputs. Existing incoming PO data is separately subtracted from the
  specialist's proposed quantity and included in freshness evidence; the canonical base reorder
  formula is unchanged.
- Applied the three-statement hand-written migration
  `20261022190000_inventory_agent_procurement_handoff` with `prisma db execute` (exit 0), resolved
  it applied, and regenerated Prisma Client. Reviewed only this migration's own columns, index and
  FK from the diff; unrelated FK/index/rename drift was not applied. The real-MySQL spec verifies
  the FK in `information_schema`; `prisma migrate status` reports all 205 migrations applied.
- Seven real-MySQL tests cover concurrent retries, edited preview approval through Action Center,
  one matching draft PO, stale inventory/outstanding purchases, expiry, exact-payload tampering,
  kill switch, live role revocation, cross-tenant guessed IDs and unchanged stock. Related focused
  checks passed 8 suites / 35 tests before browser QA; the final seven-test handoff rerun also passed.
- Added a reusable Playwright test creating an obviously named local QA business, real product,
  supplier and cash sale. Browser QA passed recommendation → draft → supplier edit/submit → Action
  Center approval → draft PO, with no browser console/page errors or API 5xx in the successful run.
  Screenshots were inspected. The design-reference `.dc.html` directory is absent in this checkout,
  so the existing theme was preserved; pixel-perfect comparison to the missing reference was not
  possible. The local MySQL user cannot create another schema, so QA used a dedicated business in
  the existing local database, with separate Redis on 6381 and a temporary backend on 5001.
- Browser QA found and fixed the canonical PO conversion copying a long request reason into a
  VARCHAR(191) note. The PO now stores a bounded request reference; the full rationale remains on
  the linked request. Added regression coverage with a long reviewed reason. Mutation buttons now
  use handled React Query mutations rather than creating unhandled rejected promises.
- Backend and frontend `tsc --noEmit` pass; touched backend/frontend ESLint and the QA launcher
  lint pass. Fabrication grep and `git diff --check` pass. Full backend
  `npx jest --maxWorkers=2`: **406/406 suites and 2,450/2,450 tests passed**. Playwright: **1/1
  complete browser handoff flow passed**. No commit or push. This slice does not automate sending
  the draft PO: final send-time
  revalidation/provider idempotency and delivery confirmation remain future work.

## Progress — Customer Intelligence profile review (2026-10-22)

- Added `GET /customers/:id/intelligence` inside the canonical Customers module and an on-demand
  review panel on the existing customer profile. It reads current CRM visit counters, completed
  non-quotation order counts, booking statuses/next booking, recorded message statuses, loyalty
  counters/membership statuses and permitted note/support metadata. It does not create a second
  customer master or retain a customer-level specialist summary. No new migration/model.
- The deterministic activity-change rule compares adjacent 30-day order-creation windows and
  requires at least three completed orders in the earlier window. The method, cutoffs, source
  fields and caveats are visible. A decrease is explicitly a human review cue, not churn probability,
  causation or an assertion that contact has occurred. Fewer baseline orders show insufficient
  history. Unresolved support takes precedence only when Voice access permits that metadata.
- Fresh capability checks require `CUSTOMER_AGENT_RUN`. Monetary context additionally requires
  `PROFIT_VIEW` and is always excluded for Staff, even if Staff is explicitly granted that capability.
  The existing notes-visibility flag controls note metadata; note contents are never returned.
  Call-support metadata requires `VOICE_MANAGE` and an enabled Receptionist module. Disabled Orders,
  Bookings and Unified Inbox sources are omitted rather than exposed indirectly through CRM.
- Marketing flags report excluded or channel-check-required, never authorized-to-send. Opt-out,
  missing marketing consent and inactive/blocked status remain exclusions. The canonical sending
  pipeline must still evaluate channel consent, suppression, quiet hours/frequency and provider
  configuration. This feature sends nothing, creates no follow-up task and makes no provider call.
  It never treats queued/sent messages as delivered/read.
- The endpoint is `Cache-Control: no-store`; no summary is written to agent memory or model prompts.
  The panel uses no retained inactive query cache, refreshes while open and on window focus, and
  hides old review data on request errors. Canonically erased customers are refused with a typed
  error; foreign/deleted/merged IDs cannot be read. Erasure concurrent with an in-flight response
  is not represented as an atomic cross-request guarantee.
- Nine real-MySQL tests pass: real source counts/PII exclusion/no retained run, sparse history,
  Staff field restrictions, live role revocation, kill switch/module exclusion, root/branch scope,
  erasure/foreign IDs, consent/opt-out and support prioritization. Four related Customer/Segments
  suites pass 34 tests. The browser scenario passes both the prior Inventory approval handoff and
  the new real Customer profile review, including a real sale, consent exclusion, refreshed consent
  flags and evidence details. No browser console/page errors or API 5xx in the passing scenario;
  screenshot inspected. Existing styling is retained because the reference design files are absent.
- This is not the entire CRM agent contract: full authorized Customer 360 narrative, note/review/
  conversation analysis, versioned editable segment handoff, follow-up-task/message drafts,
  calibrated retention, sending acceptance, scheduling and operational metering remain open.
  Backend/frontend `tsc --noEmit`, touched-file ESLint, fabrication grep and `git diff --check`
  pass. Full backend `npx jest --maxWorkers=2`: **407/407 suites, 2,459/2,459 tests passed**.
  Playwright: **1/1 combined Inventory/Customer browser scenario passed**. No commit or push.

## Progress — Editable Customer segment recommendation drafts (2026-10-22)

- Added prepare/list/get/revise/reject routes under `/customers` for a completed current-business
  Customer Intelligence recommendation. Reuses `SpecialistAgentRecommendation.details.segmentReview`
  rather than creating another customer/segment master or approval inbox. No migration is needed.
  Drafts do not enter the canonical `Segment` table and are not campaign audiences. Canonical
  creation/approval handoff is explicitly not connected; this is an L1 proposal-only slice.
- Each explicit edit appends a revision with normalized name/rules, a reason, actor/time, payload
  SHA-256 and aggregate counts observed at save time. Earlier revisions are preserved. A row lock
  makes concurrent preparation idempotent and rejects two editors saving the same expected version.
  Limits: 12 conditions, 50 revisions and expiry 24 hours after the original recommendation.
- Preview calculations reuse `SegmentsService.previewCount` and its canonical `rulesToWhere`
  translation. The separate exclusion counts are disjoint: inactive/erased, then opted out, then
  missing marketing consent. Passing profile flags is explicitly not sending eligibility; no contact
  IDs, recipient list, message, campaign or source customer is written. Fresh counts can differ
  from historical counts saved on a revision; the UI labels both instead of implying a frozen list.
- This bounded draft adapter allows visit count, last-visit/signup dates and consent/opt-out rules.
  It rejects identity/contact, tag/sensitive-trait and financial targeting, invalid field/operator
  combinations, ambiguous booleans, fractional/negative visit counts and invalid calendar dates.
  No provider call. Customer-agent and Customers-management permissions are rechecked live; new
  preparation/edits honor the agent switch and module selection. Expired/disabled-agent drafts can
  still be rejected with a reason by an authorized user. Selected-branch aggregate proposals are
  refused rather than relabeled as a current-business audience.
- Customer Insights now prepares the saved recommendation and opens the existing Segments page.
  Added an editable-drafts panel above canonical segments with exact rules, current counts,
  exclusions, expiry, rejection and history. Extracted the existing rule-builder UI for reuse;
  ordinary manual Segment creation preserves its existing behavior. No visual redesign/reference
  comparison: the `.dc.html` reference files remain absent from this checkout.
- Seven real-MySQL tests pass; related Segments/Customer checks pass 3 suites / 24 tests. Browser QA
  passed prepare → edit/save version 2 → inspect version history/counts → reject with reason, and
  confirmed no canonical Segment existed before an explicit, separate normal manual creation.
  The same passing browser scenario rechecked Inventory's approval handoff and the Customer profile
  review. No console/page errors or API 5xx; screenshot inspected. Temporary QA servers stopped.
- Backend/frontend `tsc --noEmit`, touched-file ESLint, fabrication grep and `git diff --check`
  pass. Full backend `npx jest --maxWorkers=2`: **408/408 suites, 2,466/2,466 tests passed**.
  Playwright: **1/1 expanded Inventory/Customer/draft scenario passed**. No commit or push. Still missing for this
  adapter at that checkpoint: canonical segment approval/application and version invalidation on
  later canonical edits. The next section implements those gaps. Audience delivery/previews/
  confirmation stay with the canonical sender and are not claimed.

## Progress — Exact Customer segment approval and canonical verification (2026-10-23)

- Extends the previous L1 proposals into a bounded human-approved action. `submit`, reasoned
  `withdraw`/`reject`, and fresh canonical `reopen` routes reuse the same recommendation revision
  history. Submission pins its exact revision, payload SHA-256 and live aggregate match/exclusion
  counts hash. Changed counts, rules, expiry, target version, revoked permissions, disabled module
  or agent switch refuse approval with typed errors. Sending authorization is never inferred.
- The existing Dashboard Action Center synthesizes `customer_segment` pending items from the
  source recommendation. It links to the detailed proposal instead of offering a blind approval.
  Complete/dismiss/snooze and bulk mark-read cannot bypass its decision. No parallel approval inbox
  or copy of the Segment/customer master was built. Approvals use
  `POST /actions/customer_segment:<recommendationId>/segment-approve`.
- An exact approval calls the canonical `SegmentsService` inside a recommendation row-lock
  transaction. A unique source link and idempotent retries produce one Segment. The decision,
  actor/time, approved payload/count hashes, canonical version and definition hash are audited;
  verification checks the stored canonical definition. The UI shows verified, changed or missing,
  not a fabricated success. A deleted applied Segment is never silently recreated.
- Canonical Segment writes now require Customers management permission. Its version increments on
  edit; an agent-created Segment's approval covers name, rules and version with deterministic
  sorted-key hashing (MySQL JSON can reorder object keys). Modified definitions are blocked in the
  common audience resolver, which existing Marketing, email, ad-audience and Profit offer services
  reuse. Manual Segments retain their normal behavior. An authorized fresh review reads the actual
  current Segment, appends an immutable proposal revision and must be submitted/approved again.
  Optimistic target-version checks prevent overwriting another canonical editor. Reapproval updates
  the SAME Segment. Withdraw/rebase supports an additional edit arriving during pending review.
- UI: editable proposals, exact submission preview, reasoned decisions, live consent exclusions,
  revision/approval history, canonical provenance and disabled audience buttons on changed
  definitions. Older pending Action Center links fetch their exact proposal even when it falls
  outside the latest-20 list. Source-review summaries are explicitly historical, not current
  canonical status. In-flight draft inputs are disabled to prevent edits being lost on submission.
  Existing theme retained; `.dc.html` references are still absent, so no reference pixel-match is
  claimed. Screenshots of Action Center and the approved canonical Segment were inspected.
- Migration `20261022210000_customer_segment_approval` contains only the four expected statements:
  Segment provenance/version columns, a unique source index, its FK, and the appended ActionItemType
  enum value. Applied with `prisma db execute` (exit 0), resolved applied, generated Prisma; real
  `information_schema` FK assertion passes and all **206 migrations are applied**. Unrelated
  voice/RFQ/index drift was excluded. No extra tenant model was needed; Segment and recommendation
  are already registered.
- Real-MySQL coverage expanded from 7 to **15 Customer segment tests**: queue synthesis, exact
  approval, concurrent retries, no message/campaign side effects, count/payload/expiry/permission
  failures, foreign IDs, submitted edits, withdrawal, changed canonical audiences, reapproval,
  target races/rebase, deletion and migration FK. Full backend `npx jest --maxWorkers=2` passes
  **408/408 suites, 2,474/2,474 tests**. Backend/frontend `tsc --noEmit`, fabrication grep and
  `git diff --check` pass. Touched-file ESLint has no new errors; shared intelligence settings
  retain the same 74 pre-existing Prettier-only errors as HEAD (functional rules pass).
- Playwright **1/1 expanded scenario passed** in a newly signed-up QA Specialist Agents business:
  previous Inventory approval/PO and profile checks; segment prepare/edit → Action Center review →
  approve → canonical edit/invalidation → fresh review/reapproval on the same record; pending
  rejection, manual creation, and an older queue entry outside the latest 20. Console/page errors
  and API 5xx were empty. Test harness was corrected to assert the real `{ error: { code } }`
  envelope and wait for the submitted form before entering its rejection reason.
- QA harness hardening: the earlier temporary-cwd/allowlist alone did not stop Prisma from
  loading schema-relative `.env` variables. Its background reconciler attempted three stale-call
  Twilio status GETs (all 404; no calls placed), updating their status-check timestamps. The launcher
  now explicitly blanks non-allowlisted environment keys, supplies isolated auth TTLs, asserts
  blocked settings after Prisma initialization and suppresses recurring BullMQ registrations in
  this QA process only. Redis scan verified **0 recurring registrations**. The full browser scenario
  was rerun successfully under that isolation. This is not coverage of background schedulers or
  live provider delivery. Successful specialist AI usage logs across this turn's QA businesses
  were **0**; the scenario did not place calls or send campaigns/messages. Both QA servers and
  their isolated Redis were stopped after verification; production application code was not patched
  to bypass provider or policy gates. The CJS launcher passes `node --check` and ESLint's recommended
  CommonJS rules (0 errors/warnings); the repository's type-aware ESLint project excludes scripts.
  This corrects the earlier assumption that a temp cwd alone
  kept provider credentials unavailable.
- Nothing committed or pushed.
  This completes this bounded segment adapter, NOT the five-agent spec: richer authorized Customer
  360, follow-up/message drafts, scheduling, metering and the other specialists' remaining action
  contracts are still open. Existing source/module data limits remain explicitly disclosed.
- Customer profile follow-up work now persists to a tenant-scoped `CustomerFollowUpTask` and is
  surfaced in the existing Action Center/Staff Tasks views. Staff can complete only tasks assigned
  to their active business membership; manager permissions, module/agent switches, idempotency and
  audit events are enforced. Generic dismiss/snooze/complete paths cannot bypass the CRM completion
  action.
- Customer message drafts reuse the canonical `MessageDraft` store. The owner must have Customer
  Agent and Customers management permission; active status, consent/opt-out and Unified Inbox
  availability are checked before saving. Draft text is staff-written, saved only for review, and
  is never queued or sent. AI-generated customer copy is not implemented in this slice and is not
  claimed; no customer PII is sent to an AI provider.
- Handwritten migration `20261023100000_customer_agent_followup` adds the follow-up task table and
  enum value. Applied with `prisma db execute`, resolved applied, and Prisma client generated;
  `information_schema` confirms both business/customer FKs and `prisma migrate status` reports all
  207 migrations applied.
- Real-MySQL coverage is in `customer-agent-actions.service.db.spec.ts`. Five focused suites / 43
  tests pass; full backend Jest passes **409/409 suites, 2,479/2,479 tests**. Backend and frontend
  `tsc --noEmit`, touched-file ESLint, fabrication grep and `git diff --check` pass. One Playwright
  scenario passed (1/1): isolated signup, Inventory approval, profile review, customer task and
  saved draft, task completion from Staff Tasks, and segment approval. Screenshot inspected; no
  page/console errors or API 5xx. Temporary QA servers and Redis were stopped. No paid AI/provider
  action was triggered.
- No commit or push. The repository still contains accumulated uncommitted specialist-agent work.
  Customer Agent still lacks an AI-generated message candidate and broader Customer 360 narrative;
  all five specialized agents remain incomplete overall. The design `.dc.html` references are not
  present in this checkout, so no pixel-reference comparison is claimed.

## Customer Agent — AI-generated editable message drafts (2026-10-23)

The earlier entry above is the state at that checkpoint. Since then, Customer Agent can request a
generic, purpose-limited AI draft for booking, order, support, feedback or general follow-up. It
uses `AiInfraService.createMessage` and its existing enablement, rate-limit and cost-cap rules. Only
the selected purpose is sent to the model; customer names, IDs, contact details, orders, notes and
conversation history are excluded. The candidate is stored in the canonical `MessageDraft` table
and is editable by staff. It is not a `Message`, is not queued and cannot be sent from this UI.
Existing active-customer, consent, opt-out, Unified Inbox, module, permission and agent checks run
before save/edit; draft actions are audited. A missing/unavailable AI provider returns the typed
`CUSTOMER_AGENT_AI_UNAVAILABLE` 503 and persists no AI draft.

Verification: 7 real-MySQL action tests pass; the full backend Jest run passes **409 suites / 2,481
tests**. Backend/frontend type checks, backend build and touched-file ESLint pass. MySQL reports all
207 migrations applied. Isolated Playwright passes **1/1** scenario, including task creation and
completion, manual draft save/edit, and the provider-disabled response; no paid AI request or
message delivery occurred. The screenshot was inspected and temporary QA services were stopped.
No commit or push. This does not complete the five-agent specification: real provider-backed AI
generation, broader Customer 360 and the other agents' remaining contracts still require separate
work/authorized provider setup. No `.dc.html` design reference was available for pixel comparison.

## Inventory Agent — back-in-stock waitlist review cue (2026-10-23)

The saved Inventory Agent run now groups current-business `ProductWaitlistEntry` records that have
not been notified and belong to active tracked products with positive on-hand stock. It stores a
count-only recommendation and source evidence; no customer IDs/contact fields are selected or
returned, and consent is not inferred from a waitlist entry. The UI links to the existing canonical
waitlist modal. It does not draft customer-specific copy, modify waitlist state, queue or send a
notification. If the operator later chooses the existing notify action, its canonical `SendGate`
remains responsible for channel eligibility.

Verification: 3 real-MySQL tests pass, including notified-entry exclusion and contact-field
redaction. Backend/frontend types and touched ESLint pass, backend build passes, and full backend
Jest passes **409 suites / 2,481 tests**. Isolated Playwright passes **1/1**, checking an actual
test waitlist entry and opening the canonical modal without sending. Screenshot inspected; provider
keys were blocked and temporary QA services were stopped. No migration was needed; all 207 local
migrations remain applied. No commit or push. This is a review cue, not the complete approved
notification-preparation lifecycle; the five-agent specification remains unfinished.

## Inventory Agent — branch rebalance review (2026-10-23)

The Inventory run compares active, SKU-matched products across the caller's branch group. Sender
surplus uses current on-hand less pending/approved outbound transfer quantities and the existing
120-day overstock cover threshold at trailing 30-day recorded-sales velocity. Receiver risk uses
its canonical low-stock threshold after open outbound, approved inbound and shipped in-transit
quantities. Evidence records both branch/product inputs, formula and observation time; ambiguous
or duplicate SKU matches are skipped.

This remains a read-only review cue linking to `/branches/transfers`; it never creates transfers or
changes stock. No separate reserved-stock ledger exists: order creation deducts on-hand stock and
pending/approved transfers are counted as open outbound commitments. Transfer lead time, UOM
conversion and seasonality are not modeled and are disclosed. Single-location businesses receive an
availability notice, not a fabricated zero comparison.

Verification: 3 real-MySQL Inventory tests pass, including transfer-state accounting and assertions
that neither stock nor transfer records changed. Full backend Jest: **409 suites / 2,481 tests**;
backend/frontend type checks, build and touched ESLint pass. Isolated Playwright passes **2/2**
including setup and the end-to-end scenario, which asserts the single-location notice. Screenshot
inspected; no provider key was available; temporary QA servers/Redis stopped. No migration was
required. No commit or push; other agent contracts and the complete five-agent spec remain
unfinished.

## Inventory Agent — repeated applied stock-count review (2026-10-23)

The Inventory run now correlates recorded adjustment movements with canonical applied stock counts
over the trailing 90 days. Each movement must reference an existing applied count with `appliedAt`
set, and that count must contain a line for the same product. A review is emitted only for at least
two distinct applied count IDs on an active product. Evidence gives the applied count IDs,
adjustment count, absolute and signed net units, dates and calculation. No cause or materiality is
inferred. The finding links to canonical Stock Count and never creates an adjustment or changes
inventory.

Verification: the real-MySQL Inventory spec passes **3/3**, including two real `StockCountService`
apply flows and post-analysis assertions that stock and movement rows did not change. Full backend
Jest was **407/409 suites and 2,468/2,481 tests**; Competitive Opportunities and Cash Register
timed out in that parallel run, then passed in isolated reruns (**8/8** and **12/12**). Backend and
frontend types, backend build/Prisma generation and touched ESLint pass. Isolated Playwright passes
**2/2** including setup; its page/console/network error assertions pass and the $45 QA valuation
snapshot was confirmed. The screenshot was inspected. Provider keys were blocked and temporary QA
servers/Redis were stopped. No migration, commit or push. This does not complete the Inventory Agent
or five-agent spec; structured discrepancy causes, a materiality setting and automatic recount-task
creation remain unsupported.

The same run also exposes canonical `InventoryService.listInventory()` value-at-cost and the
existing overstock-flagged value (as a subset); the UI links to Inventory Valuation. It discloses
that zero cost prices contribute zero and cannot be distinguished from genuinely free stock by a
separate missing-cost marker, and that carrying value is not cash or a realized loss.

## Inventory Agent — audited recount request handoff (2026-10-23)

Added a tenant-scoped, idempotent recount task for eligible count-discrepancy findings. Requests
validate ownership, audit the action and link to canonical Stock Count. Recording a count draft for
the requested product closes and links the task; stock changes only through the existing explicit
apply flow. A real-MySQL spec passes **5/5** and verifies tenant/FK behavior, idempotency, audit
evidence, invalid/cross-business rejection, and no inventory mutation from creating the task/count.

Migration `20261023120000_inventory_agent_count_tasks` is applied and Prisma reports **208/208**
migrations clean. Full backend Jest passes **409 suites / 2,483 tests**; backend/frontend type
checks, touched-file ESLint, backend build, and `git diff --check` pass. Isolated Playwright passes
**1/1** including the recount lifecycle and screenshot review. Initial browser login hit a hydration
race; waiting for network idle fixed the QA harness. No commit or push. This does not complete the
Inventory Agent or five-agent specification.

## Inventory Agent — reasoned recount-request dismissal (2026-10-23)

Authorized users can now dismiss an open recount request with a required reason. A conditional
tenant-scoped update stores the dismissing actor/time/reason and an audit record; completed or
already-dismissed requests cannot be dismissed again. The UI makes the final reason visible. This
closes the agent task only—no stock count, movement, adjustment or balance is created or changed.

Migration `20261023130000_inventory_agent_count_task_dismissal` is applied and database status is
**209/209 migrations up to date**. The Inventory real-MySQL spec passes **6/6**; full backend Jest
passes **409 suites / 2,484 tests**. Backend/frontend type checks, backend build and touched-file
ESLint pass. Isolated browser QA passes **1/1** and the dismissed reason is visible in the inspected
screenshot. The first browser rerun hit the old compiled backend; it passed after rebuilding. No
commit or push. The five-agent specification is not complete.

## Inventory Agent — back-in-stock notification preview (2026-10-23)

Added a review-only notification preview for currently restocked products and unnotified waitlist
entries. The implementation extracts and reuses SendGateService's preflight for both send and
preview, so channel/contact resolution, registered copy, WhatsApp template approval, and current
quota checks cannot drift into a separate preview-only formula. Quota offset is applied across the
ordered recipient list. The preview stores an audit record with counts/reason codes only; it does
not create queued messages, increment message usage, update waitlist rows or call a provider. The
existing user-initiated send runs the gate again and remains the only delivery path.

The UI exposes actual registered template copy, eligibility and blocked reasons. A waitlist row is
the existing record of the customer's request; there is no separate persisted consent-evidence
field for this request, so that limitation is disclosed. A preview also cannot guarantee provider
delivery. Real-MySQL spec: **6/6**. Full backend Jest: **409 suites / 2,485 tests passed**. Backend and
frontend type checks, touched-file ESLint and backend build pass. The isolated browser scenario
passes **1/1**, with screenshot/console/network review. Prisma remains at **209/209** migrations;
no migration was required. No commit or push. This is one Inventory Agent capability, not completion
of the five-agent specification.

## Inventory Agent — recorded-wastage review task (2026-10-23)

An Inventory wastage finding can now create an idempotent, tenant-scoped human review task. It links
to the canonical Wastage log and can be closed with a required review note or dismissal reason;
both decisions are audited. The source-of-truth stock and wastage movements are not changed. The
finding remains a factual grouping of recorded movements; it does not infer why wastage happened or
recommend a write-off.

The handwritten migration `20261023140000_inventory_agent_wastage_review_tasks` is applied. The
business, product and recommendation foreign keys were verified in MySQL. Real-MySQL Inventory
tests pass **8/8** and full backend Jest passes **409 suites / 2,487 tests**. Backend/frontend type
checks, backend build, touched-file ESLint and diff check pass. The isolated browser scenario passes
**1/1**, including persisted task-state verification, with the relevant screenshot inspected and no
page-console or API 5xx errors. No provider was called. No commit or push. This does not complete the
five-agent specification.

## Customer Agent — CRM data-quality review (2026-10-23)

The aggregate Customer Intelligence review now includes active, non-erased profiles with a blank
email or phone field and potential duplicate pairs from the canonical `CustomerDuplicatesService`
under the business's configured `CustomerMergeSettings.matchOn`. Duplicate pairs are counted once
by canonical pair, and persisted evidence contains only aggregate counts. Customer names, IDs,
emails and phones are not written to the specialist run or supplied to optional AI commentary.
Previously dismissed matches remain excluded because the canonical detector is reused. The UI
deep-links to `/customers/duplicates` for an authorized human to review; it does not merge, send
messages or validate contact deliverability. These data-quality counts are unavailable for a
selected branch because the existing duplicate detector is current-business scoped.

Real-MySQL Customer Intelligence spec: **3/3**; full backend Jest: **409 suites / 2,488 tests**.
Backend/frontend type checks, backend build, lint on new Customer Intelligence/frontend/E2E changes
and `git diff --check` pass. The duplicate service's existing lint diagnostics also appear when
linting its unmodified `HEAD` contents; the new aggregate method adds none. Isolated Playwright:
**1/1**, with actual duplicate fixtures, aggregate-only response verification, canonical review
handoff, screenshot inspection and no browser console/API 5xx errors. No migration or provider call;
no commit or push. The five-agent specification remains incomplete.

## Finance Agent — extended source-backed review (2026-10-23)

The existing read-only Profit Analytics review now adds three separately labeled source-backed
views: relative cash-flow projection through `CashForecastService`, privacy-minimized customer
credit aging through `CreditService.financialAgingSummary`, and calendar-month variance through
`ProfitService.pnl.trend`. Variance is the current selected calendar month minus the immediately
prior calendar month, only for the month period; rolling periods disclose that comparison as
unavailable. No variance is described as a cause. The UI hands off to canonical Cash Flow, Credit
and Expenses pages rather than copying their operational records.

Finance real-MySQL spec passes **8/8**; Finance + Credit focused suites pass **26/26**. Full backend
Jest passes **409 suites / 2,493 tests**. Backend/frontend type checks, Finance service/spec lint,
frontend touched-file lint, and `git diff --check` pass. Existing Prettier errors in untouched
CreditService methods were confirmed present at HEAD. Isolated Playwright passes **2/2**, including
setup; screenshot inspected, no browser console/API 5xx error, and no AI/provider call was made.
No migration, commit or push. Finance-owned bank reconciliation, A/R/AP, approved budgets, and
period close remain unavailable; the five-agent specification is not complete.

## Progress — deterministic Customer 360 profile narrative (2026-10-23)

The live Customer Profile now presents one deterministic, source-backed Customer 360 summary in
addition to its existing activity cards. It uses the same tenant-scoped profile projection: CRM
visit/profile timestamps, completed non-quotation order windows, booking and message status counts,
permission-filtered support metadata, loyalty/membership state, the transparent human follow-up
cue, and permitted customer-linked private-feedback aggregates. The output is ephemeral/no-store,
not written to specialist memory or another customer record, and it does not send customer-level
data to an AI provider.

Private-feedback content is excluded; only counts, status, average stars and last time are returned
to owners/managers while Reviews is enabled. Staff get a restricted state. `ExternalReview` has no
customer relation, so public reviews are not attributed to a person. Notes and conversation text
remain excluded, and follow-up confidence remains uncalibrated. Source windows, no-cause/no-churn
language and unsupported-source disclosures remain visible.

Real-MySQL profile spec **9/9**; full backend Jest **409 suites / 2,493 tests passed**. Backend and
frontend `tsc --noEmit`, touched backend/frontend/E2E ESLint, fabrication grep and
`git diff --check` pass. Isolated Playwright **2/2** including setup; summary-card screenshot,
console and API-error assertions checked. No migration, external provider call, commit or push. The
five specialized agents are still not complete.

## Customer Agent — lapsed-customer win-back draft eligibility (2026-10-23)

The existing editable Customer Agent draft flow now supports a win-back purpose only after a
customer meets the canonical CRM `LAPSED_DAYS` threshold (60 days), measured from last visit or
creation if no visit exists. Active status, marketing consent, no opt-out and Unified Inbox access
are checked before drafting; a customer below the lapsed threshold receives a typed refusal before
AI is called or any draft is saved. The model receives only the purpose instruction, never
customer identity/contact, order, note or conversation data. The result is an editable
`MessageDraft`, not a sent/queued message or Marketing campaign. The UI names the threshold and
hands off sending to the canonical messaging/marketing workflows.

Real-MySQL Customer Agent action/profile specs pass **17/17**; full backend Jest passes **409
suites / 2,494 tests**. Backend/frontend type checks and touched-file lint pass. The isolated
Customer Agent Playwright scenario passes **2/2** including setup; consent gating, threshold
disclosure, UI and API error assertions passed. No migration, external AI/provider request,
commit or push. This is a bounded win-back preparation capability, not an automated retention or
campaign-delivery claim; the five-agent specification remains incomplete.

## Customer Agent — Customer List follow-up queue view (2026-10-24)

The Customer List previews up to five actual open CRM follow-up tasks from the canonical Action
Center query. Existing staff-assignment checks remain server-side; completion uses the existing
audited task action and the queue links to each canonical customer profile. Display ordering is
the saved task priority, due date and age—not a newly trained or inferred AI score. An open task
does not prove a customer was contacted. No separate task table or ranking formula was added.

Isolated Playwright passes **2/2** including setup; it creates an actual task, checks its profile
link and completion control, then completes it through the canonical Staff Tasks flow. Screenshot
was inspected; frontend type check and touched ESLint pass. Full backend Jest at that checkpoint
passes **409 suites / 2,494 tests**; no backend source or migration changed for this view. No
provider call, commit or push. This is a task queue preview, not the full AI-prioritized follow-up
contract.

## Customer Agent — aggregate win-back campaign brief (2026-10-24)

Customer Intelligence now saves a review-only, aggregate brief for lapsed profiles with at least
one recorded visit, including active-profile, opt-out, marketing-consent and stored-destination
counts. Lapse uses the canonical 60-day CRM threshold. Selected-branch counts are unavailable
because existing segment preview is business-scoped. The brief stores no customer IDs or contact
values, creates no Campaign or Message, and queues or sends nothing. The UI links to canonical
Marketing and states that channel-specific consent, suppression, contact validity, frequency,
quota and provider delivery must be rechecked there. It is not a churn prediction or customer
ranking.

Real-MySQL Customer Intelligence spec passes **4/4**; backend/frontend `tsc --noEmit`, touched
backend/frontend ESLint and `git diff --check` pass. Isolated Playwright passes **2/2** including
setup with Customer Agent AI disabled during QA; screenshot, browser console and API-error
assertions were checked. Full backend Jest passes **409/409 suites and 2,495/2,495 tests** after a
clean rerun; the initial parallel run had transient DB timeouts and three reported suites passed
isolated. No migration, paid AI/provider call, commit or push. The five-agent specification
remains incomplete.

## Customer Agent — Customer Profile RFM source values (2026-10-24)

The live Customer Profile Intelligence response now includes an RFM source snapshot. Recency is
calendar days since the latest completed non-quotation order; frequency is the all-time count of
completed non-quotation orders; monetary is the stored CRM `Customer.lifetimeSpend` and business
currency. These are source values, not a predictive result. No per-customer score thresholds are
configured, so the response explicitly says no RFM score is available. Orders-disabled businesses
see R/F as unavailable; callers without Profit view permission see M as restricted. The monetary
definition is not recomputed from order totals or netted for refunds.

Real-MySQL Customer Profile spec passes **9/9**, including order-status/quotation filtering and
staff spend restriction. Backend/frontend `tsc --noEmit`, touched backend/frontend/E2E ESLint and
`git diff --check` pass. Isolated Playwright passes **2/2** including setup; the RFM card
screenshot, browser console and API-error assertions were checked. Full backend Jest passes
**409/409 suites and 2,495/2,495 tests**. No migration, provider call, commit or push. The
five-agent specification remains incomplete.

## Inventory Agent — repeated-count quantity filter (2026-10-24)

The owner can configure `inventory.agentCountVarianceMinimumUnits` in AI & Governance. The default
is unset and preserves recurrence-only behavior. When configured, a repeated applied-count review
is included only when the sum of absolute correction units meets the inclusive minimum. The policy
is captured in run inputs and evidence. This is a quantity filter, not a financial materiality
estimate or causal diagnosis; structured discrepancy causes remain unavailable.

Real-MySQL Inventory spec: **9/9**. Backend/frontend `tsc --noEmit` pass; full backend Jest:
**409/409 suites, 2,496/2,496 tests**. Browser QA: **1/1**, including setting save and clear, with
page/console/API checks passing; screenshot inspected. Touched Inventory/policy/E2E ESLint passes.
The shared Intelligence category file reports existing Prettier errors outside the added block.
No migration, provider call, commit or push. Five-agent work remains incomplete.

## Autonomous Commerce Agent — recorded RFQ quote comparison (2026-10-24)

The read-only Commerce review now compares manually recorded supplier quotes on the 50 most
recently updated open canonical RFQs (up to five current submitted/shortlisted quotes per RFQ).
Only unexpired, same-currency quotes covering every requested line at the requested quantity and
minimum quantity are comparable. The total uses stored line prices, freight and duties with
decimal arithmetic; taxes, fees, FX, delivery, quality, capacity and compliance are not tracked
by this comparison. A lowest total is shown only with at least two comparable quotes. The review
does not contact suppliers, award an RFQ or change a Commerce record; quote details are evidence
for an authorized human, and are not sent to the AI summary provider.

Real-MySQL Commerce Agent spec passes **5/5**; backend and frontend `tsc --noEmit`, touched-file
ESLint and fabrication grep pass. Isolated Playwright sourcing flow passes **1/1**: it creates a
separate QA business, records two supplier quotes, verifies the displayed comparison, and checks
that the RFQ remains open with no purchase order. Full backend Jest passes **409 suites / 2,496
tests**. No migration, external provider call, commit or push. The five-agent specification
remains incomplete.

## Autonomous Commerce Agent — validation evidence scorecards (2026-10-24)

The Commerce review now includes up to 20 current `validation_requested` Product Radar candidates,
using the canonical `ProductValidationService`. Product Validation groups the existing recorded
fields into demand/competition, economics, supply and store-fit evidence. It explicitly calculates
no score, probability, launch recommendation or pass/fail result. Compliance and product-level
return-risk evidence remain `Not tracked`; the existing launch approval guard is unchanged. The
review is read-only and sends only aggregate status counts—not candidate research—to the AI summary.

Commerce Agent and Product Validation real-MySQL specs pass **5/5 each**. Backend/frontend
`tsc --noEmit`, touched-file ESLint and fabrication grep pass. Isolated Playwright passes **1/1**,
creating an isolated QA business and checking the Commerce review plus the Product Validation
drawer; screenshots, console errors and API 5xx assertions were checked. Full backend Jest passes
**409 suites / 2,497 tests** (one Jest worker required force-exit after the passing run). No
migration, external provider request, commit or push. The five-agent specification remains
incomplete.

## Autonomous Commerce Agent — Experiment Lab outcome evidence (2026-10-24)

The Commerce Agent now includes up to 20 latest running or decision-stage canonical experiments.
Running results are computed through `CommerceExperimentsService.computeResults`; stopped and
decided results use the frozen Experiment Lab snapshot. The panel shows the recorded primary metric,
baseline/test values, observed change, minimum-sample state, and any recorded gross-margin
guardrail. It omits draft experiments, hypotheses, descriptions and product names, sends no
experiment details to AI, and never adopts/reverts or changes products. The page explicitly says
this is a before/after observation—not a randomized, causal, or statistically significant result.

The Commerce Agent real-MySQL spec passes **5/5**, including reuse of frozen results and no detail
leakage. Backend/frontend `tsc --noEmit`, touched-file ESLint and fabrication grep pass. Isolated
Playwright passes **1/1**, verifying the honest empty state and canonical Experiment Lab link;
browser console/API 5xx checks and a panel screenshot were checked. Full backend Jest passes **409
suites / 2,497 tests**. No migration, provider request, commit or push. The five-agent specification
remains incomplete.

## Autonomous Commerce Agent — saved listing-reconciliation review (2026-10-24)

The read-only Commerce review now summarizes the 20 latest saved `CommerceReconciliationRun`
records and all currently open `CommerceReconciliationItem` groups. It never starts a provider
sync, includes no listing identifiers or raw item snapshots, and its AI explanation still receives
only the existing aggregate Commerce status counts. The UI links to canonical Reconciliation and
states that no saved run is not evidence of store health. Existing connector checks cover SKU
presence and stock quantity only; price, titles, descriptions and images remain unchecked.

The real-MySQL Commerce Agent spec passes **5/5**, including open-versus-resolved grouping and
tenant isolation. Backend/frontend `tsc --noEmit`, touched-file ESLint, fabrication grep and
`git diff --check` pass. Isolated Playwright passes **1/1** against the running local app; the
honest no-saved-check empty state and canonical link were verified, the panel screenshot was
inspected, and browser console/API 5xx checks pass. Full backend Jest passes **409 suites / 2,497
tests**. No migration, provider request, commit or push. The five-agent specification remains
incomplete.

## Autonomous Commerce Agent — supplier-claim evidence (2026-10-24)

The Commerce review now uses canonical `CommerceSupplierClaim`, item, settlement, evidence and
communication records. It counts all claims by stored status and itemizes only the latest 20.
Loss and settlement fields are exact sums of recorded decimals; the UI calls them operator-entered
and unverified, and explains that recorded credits/replacements do not establish cash receipt or
delivery. Claim text, supplier details, references, uploaded evidence and communication notes are
omitted. The AI text provider still receives only the aggregate Commerce status snapshot.

The real-MySQL Commerce Agent spec passes **5/5** and proves tenant isolation and privacy. Backend
and frontend `tsc --noEmit`, touched-file ESLint, fabrication grep and `git diff --check` pass.
Isolated Playwright passes **2/2** including setup, verifies a QA-only claim summary and canonical
route, and has no console/API 5xx errors; the screenshot was inspected. Full backend Jest returned
**406/409 suites and 2,490/2,497 tests** with three unrelated DB-heavy timeouts; those same three
suites passed separately (**3/3 suites, 12/12 tests**). No migration, provider request, commit or
push. The five-agent specification remains incomplete.

## Autonomous Commerce Agent — delivery exception follow-up (2026-10-24)

The Commerce Agent now includes bounded delivery exception evidence through the canonical
`DeliveryInsightsService`: it counts tenant-owned deliveries with stored `failed` status and shows
up to 20 latest resolution states. It matches the canonical Deliveries Exceptions rule exactly:
only the latest same-business approved Return marks a failed delivery resolved. Pending, rejected,
or missing returns stay open. The UI links to `/deliveries/exceptions` and omits customer data,
addresses, failure notes and financial amounts. It does not infer a cause or carrier outcome and
does not make operational changes.

Real-MySQL Commerce Agent spec **5/5** proves open/resolved behavior, excludes a second tenant, and
keeps private delivery/return data out of the run and AI prompt. Backend/frontend type checks,
touched-file lint and Playwright **2/2** pass; the QA browser showed the honest empty state and had
no console/API 5xx errors. Full backend Jest passes **409/409 suites and 2,497/2,497 tests**. No
migration, provider call, commit or push; the five-agent specification remains incomplete.

## Autonomous Commerce Agent — canonical fulfillment queue review (2026-10-24)

The Commerce Agent now reuses `CommerceFulfillmentRouterService` for the open-order routing queue.
It counts eligible non-quotation online/delivery orders in pending, confirmed or in-progress status
that contain physical catalog products, then shows only the 20 newest records as privacy-safe
order type/status, physical line count and routing state. An active route is labeled as operator
recorded; an unassigned candidate remains a candidate that requires operator review.

The queue has no destination country, so the Router's market status is unknown and is disclosed.
External-node inventory/capacity, carrier confirmation and customer promises are not inferred. No
route is assigned, stock reserved or customer data exposed. The view links to the canonical
Fulfillment Router.

Real-MySQL Commerce Agent spec **5/5** covers a real eligible order and excludes a second-tenant
order. Backend/frontend type checks, frontend touched-file lint, Playwright **2/2**, empty-state
screenshot inspection and fabrication grep pass. Backend touched-file lint and full backend Jest
must be rerun after this addition. No migration, provider call, commit or push; the five-agent spec
remains incomplete.

## Autonomous Commerce Agent — canonical listing-draft tool (2026-10-24)

The `create_listing_draft` tool is now executable at the existing Recommend autonomy level. It
validates the channel, calls the canonical `CommerceListingBuilderService`, attributes its AI
request to the `commerceAgent` feature toggle/usage bucket, and saves only a source-backed
`review_required` draft. Commerce pause blocks it; approval and provider sync remain separate
operator actions. The UI labels the action “Create review draft” rather than a non-mutating test.

Real-MySQL Commerce Agent tool and Listing Builder specs pass **2 suites / 8 tests**; backend and
frontend `tsc --noEmit`, touched-file ESLint and `git diff --check` pass. Full backend Jest reports
**406/409 suites and 2,435/2,499 tests passing**. The three failing suites are outside this slice
and reproduce individually: Voice call setup collides on the globally unique fixed phone-number
fixture (60 failures), Assistant help search returns no fixture passage (1 failure), and Help
search returns no fixture passage (3 failures). Browser QA was not run because no browser tab is
attached in this session. No live AI/provider request, migration, commit or push was made. This
does not implement the remaining generic action/approval/orchestration lifecycle; the five-agent
specification remains incomplete.

## Autonomous Commerce Agent — unsent RFQ draft tool (2026-10-24)

The existing `create_rfq` tool now prepares a canonical RFQ in `draft` status at Recommend
autonomy. It accepts a same-business active product, a positive whole-number quantity and an
operator-supplied requirement; currency is read from the saved business setting. It creates no
supplier invitations, does not open the RFQ and sends no supplier communication. Opening the
request and inviting suppliers remain human actions in the canonical RFQ screen. Invalid
quantities/products/currency are rejected with a typed error, and every attempt remains in the
Commerce tool audit. The Commerce pause still blocks this write.

The Commerce Agent real-MySQL tool spec passes **6/6**; backend/frontend `tsc --noEmit`, touched
backend/frontend ESLint and `git diff --check` pass. Full backend Jest: **406/409 suites,
2,437/2,501 tests passed**. The three unrelated failing suites remain Voice (`phone_numbers` fixed
fixture unique-key collision), Assistant help retrieval (no matching fixture passage) and Help
retrieval (three missing fixture matches). No migration, external provider request, commit or push.
Browser QA was not performed in this turn.

## Autonomous Commerce Agent — unsent Experiment Lab draft tool (2026-10-24)

The `create_experiment` tool now saves a canonical Experiment Lab draft at Recommend autonomy.
The operator supplies the product, name, experiment type, hypothesis, merchant-made change
description and primary metric; inputs are validated against the existing Experiment Lab contract.
The tool never starts measurement, changes product data or claims a causal/A-B result. The
merchant must make the change and explicitly start the canonical experiment. Commerce pause still
blocks the draft write, and every attempt is audited.

The Commerce Agent real-MySQL tool spec passes **8/8**; backend/frontend `tsc --noEmit`, touched
backend/frontend ESLint and `git diff --check` pass. Full backend Jest: **406/409 suites,
2,439/2,503 tests passed**. The same unrelated Assistant and Help retrieval fixtures and Voice
fixed-number uniqueness collision failed. No migration, external provider request, commit or push.
Browser QA was not performed in this turn.

## Autonomous Commerce Agent — canonical supplier-claim draft tool (2026-10-24)

The permissioned tool registry now executes `create_supplier_claim_draft` at Recommend autonomy by
calling the canonical `CommerceSupplierClaimsService`. It validates one operator-entered claim line
and uses the saved business currency. The saved claim is `draft`: no evidence is attached, no
supplier is contacted, and the tool does not submit the claim. The canonical claim service retains
the normal tenant checks and audit/activity records. Pausing Commerce still refuses the write, and
the attempt is recorded in the tool audit.

The UI now exposes the draft-only action and explicitly says it will not submit or contact the
supplier. Isolated Playwright QA created a clearly named QA business, saved the draft from the
screen, re-read the canonical claim and verified the rendered result; the setup and scenario pass
**2/2**, with no browser console errors or API 5xx responses. The screenshot was inspected. Real-
MySQL Commerce tool and Supplier Claims specs pass **2 suites / 17 tests**. Backend/frontend
`tsc --noEmit`, touched-file ESLint and `git diff --check` pass. The frontend check required removing
one malformed ignored Next-generated `.next/dev/types/validator.ts`; route types were regenerated
and the check then passed. Latest full backend Jest remains **406/409 suites, 2,442/2,506 tests**;
the three failures are the unrelated Assistant and Help retrieval fixtures and Voice fixed-number
uniqueness fixture. No migration or provider request was made; this work remains uncommitted and
unpushed. The five-agent specification is still incomplete.

## Inventory Agent — canonical branch-transfer request handoff (2026-10-24)

An operator can now prepare one pending canonical Stock Transfer from a fresh, source-branch
rebalance finding. The handoff reruns the deterministic branch calculation and refuses stale
findings, calls the existing `StockTransfersService`, and links the saved transfer back to its
specialist recommendation with a unique FK for retry safety. Repeated requests return the same
transfer. It requires the existing Inventory Agent capability and records an audit event. The
request is not approval, shipment or receipt: a human must approve and ship it, and stock remains
unchanged until the canonical shipment transition. The evidence remains explicit that reservations,
supplier SLAs, pack/UOM conversions and calibrated demand forecasts are not available in these
sources. Later Inventory Agent evidence derives historical sent-to-fully-received timing only where
completed matching purchase orders exist; it does not estimate a guaranteed future lead time.

Migration `20261024190000_inventory_agent_transfer_handoff` was applied locally and is clean in
`prisma migrate status`; the real-MySQL foreign-key/index and handoff specs pass **2 suites / 17
tests**. Backend and frontend `tsc --noEmit`, touched backend/frontend ESLint and `git diff --check`
pass. Isolated Playwright passes **2/2** including setup; the QA-only flow created a second branch,
used recorded sale history to produce a rebalance finding, prepared a pending transfer, re-read the
canonical transfer and verified both stock balances stayed unchanged. The page screenshot was
inspected and no browser console/API 5xx errors were recorded. Full backend Jest completed with
**403/409 suites and 2,439/2,507 tests passing**; reported unrelated failures include help-search
fixtures, the Voice fixed-phone fixture collision, a QR poster assertion and a Reviews timeout
under full-suite load. No commit or push. The five-agent specification remains incomplete.

## SEO Autopilot Agent — canonical brief generation from an open opportunity (2026-10-24)

The Agent Workspace now offers AI brief generation only for an active, non-dismissed content
opportunity from the existing SEO Content service. It checks that the SEO specialist agent is
enabled and refuses stale, foreign, dismissed or already-briefed keyword opportunities before
calling AI. Generation reuses `SeoContentService.generateBrief`, preserving the SEO AI-drafts
setting/provider guard and saves a normal Content brief with `briefSource: specialist_agent` and
the existing content audit trail. The brief remains a draft for the merchant to review in Content;
this does not draft the article, approve, publish, or apply a website change.

Verification: SEO specialist-agent real-MySQL spec passes **1 suite / 3 tests**, including a
canonical brief, its audit entry, duplicate prevention before another AI call and an unknown
keyword refusal. Playwright passes **1/1** in a newly created QA business: a real tracked keyword
appears as an opportunity and the AI-drafts-off policy refuses generation with the typed error;
no brief is written. The screenshot was inspected. The expected 409 refusal is the only browser
console resource error; no page errors or API 5xx occurred. Backend/frontend `tsc --noEmit`,
touched-file ESLint, fabrication review and `git diff --check` pass. No schema change, migration,
live AI/provider call, commit or push. Full backend Jest: **405/409 suites and 2,442/2,508 tests
passed**. The four failing suites are unrelated: Voice's fixed `phone_numbers_phone_number_key`
fixture collision, two Help retrieval fixture misses, and Health Snapshot tests (one timeout and
one count mismatch under the full run). The five-agent specification remains incomplete.

## Inventory Agent — approved request to shared RFQ handoff (2026-10-24)

An approved Inventory Intelligence purchase request can now enter the existing shared Commerce
RFQ engine from Procurement Sourcing. The request retains its canonical ID and the RFQ links back
to it; repeated source requests reuse the active linked RFQ. No second RFQ record type was added,
and creating the RFQ does not send supplier messages or create a purchase order. Supplier outreach
and award remain human actions.

Before creating the RFQ, the service rechecks the exact reviewed request payload, proposal expiry,
current stock/sales/outstanding-purchase evidence, agent/module switches and required capabilities.
Before an RFQ award can create a draft purchase order, it rechecks the Inventory evidence again; a
stale proposal leaves the RFQ open and creates no purchase order. The Procurement request screen
now offers the shared RFQ action for supported Inventory requests and explains these limits.

Verification: the real-MySQL Inventory handoff spec passes **1 suite / 9 tests**, including
source-to-RFQ linkage, idempotent reuse, refusal when evidence changes before sourcing, and refusal
when evidence changes before award. The isolated Playwright flow passes **1/1** in a newly created
QA business: real sale history → Inventory recommendation → purchase request → approval → linked
draft RFQ. The screenshot was inspected; no browser page/console errors or API 5xx responses were
observed. Backend/frontend `tsc --noEmit`, touched-file ESLint and `git diff --check` pass. Full
backend Jest reports **406/409 suites and 2,446/2,510 tests passing**; the three failing suites are
the known Voice fixed-phone fixture collision and Assistant/Help retrieval fixture misses also
recorded in earlier progress entries. No migration, live provider call, commit or push. This is one
additional Inventory Agent action slice; the five-agent specification remains incomplete.

## SEO Autopilot Agent — current audit finding to On-Page revision (2026-10-24)

The SEO Agent Workspace can now prepare a versioned On-Page revision from an eligible crawler
finding, using the existing `SeoOnPageService` and its canonical draft, version, and audit trail.
The action only accepts an open On-Page finding from the latest completed/partial site audit whose
page is in that crawl. Technical SEO findings, foreign/closed findings, stale findings, and missing
pages are refused with typed errors. The draft is not submitted, approved, or published; the
merchant reviews it in On-Page and applies any approved change on their own site.

Verification: SEO Agent and Workspace real-MySQL specs pass **2 suites / 6 tests**, covering draft
creation/audit, unsupported finding refusal, stale finding refusal, and queue action eligibility.
Backend/frontend `tsc --noEmit`, touched-file ESLint, `git diff --check`, and the SEO Agent
Workspace Playwright check pass. That browser check verifies the workspace and existing AI-drafts
policy path; the new revision button itself was not exercised in a live browser flow. Full backend
Jest: **406/409 suites, 2,447/2,511 tests passed**. The remaining failures are the Voice fixed
phone-number fixture collision, one Assistant help-retrieval fixture miss, and three Help
retrieval fixture misses. No migration, provider call, commit, or push. The five-agent specification
remains incomplete.

## SEO Autopilot Agent — current Technical finding to review-only action (2026-10-24)

The SEO Agent Workspace can now hand a supported, open Technical SEO finding from the latest
completed/partial audit into the canonical Technical SEO action workflow. It creates a low-risk
`other` draft containing the crawler's recommendation and evidence, explicitly marked review-only;
it does not infer a redirect, indexing, canonical or server change. The technical service validates
the URL, records its normal creation audit event, and returns an existing in-progress action for
the same finding instead of duplicating it. Stale, closed, unsupported and cross-business findings
are refused. The workspace only shows the action button for findings tied to the latest crawl.

Real-MySQL Technical SEO, Agent Workspace and Specialist Agent specs pass **3 suites / 11 tests**.
Backend/frontend `tsc --noEmit`, touched-file ESLint and `git diff --check` pass. Full backend Jest
reports **406/409 suites and 2,449/2,513 tests passed**; the same three unrelated failing suites
remain (Voice fixed phone-number uniqueness fixture, Assistant help retrieval and Help retrieval).
Browser QA for the new button was not run because no app server/browser session was available.
No migration, provider call, commit or push. The five-agent specification remains incomplete.

## Finance Agent — candidate-only expense review handoff (2026-10-24)

The Finance Agent's exact-match candidate card now opens `/expenses?month=YYYY-MM&review=exact-match`.
Expenses fetches tenant-scoped candidate ID groups from the canonical `Expense` rows and filters its
normal expense list to those groups. The Finance Agent aggregate and Expenses endpoint share the
same backend matching helper (business, calendar date, normalized description/category, exact
amount and recurring flag). The view labels every row "Potential match · not confirmed" and
discloses that summary cards still cover the whole month. Editing/deleting/adding or importing
expenses invalidates the candidate query. For multi-business branch scopes, the UI does not imply
the current-business list represents every branch; it opens the current business's month only.
Invalid/future month parameters are ignored. The agent does not persist candidate record IDs or
private descriptions in its run/evidence or send them to AI.

Verification: Expenses and Finance real-MySQL specs pass **2 suites / 12 tests**, including tenant
isolation and amount/month mismatch exclusion. Backend and frontend `tsc --noEmit`, touched-file
ESLint and `git diff --check` pass. Finance Agent Playwright passes **1/1** against the local
frontend/API, proving the candidate filter excludes a non-matching entry; its screenshot was
inspected, and the test observed no browser console/page errors or API 5xx responses. No migration,
provider call, commit or push. Full backend Jest was not rerun for this slice. The five-agent
specification remains incomplete.

## Finance Agent — expense category movement review (2026-10-24)

Saved Profit Analytics reviews now compare recorded `Expense.amount` totals by business and stored
category for the selected calendar month versus the prior calendar month. Decimal sums, business
scope and currency checks are preserved; up to ten groups are shown by absolute recorded
difference, with the total group count and omitted count. The panel calls this descriptive movement,
not an anomaly, cause, accounting error or fraud finding. A missing month is rendered as zero
recorded rows, with an explicit warning that this does not prove there was no cost. Category details
are persisted as Finance evidence but are not included in the optional AI summary prompt. The view
links back to the month in canonical Expenses; multi-business scope is disclosed because that page
opens only the current business.

Real-MySQL Finance Agent spec passes **1 suite / 9 tests**, including current/prior Decimal totals,
tenant isolation and no category detail in the AI request. Backend/frontend `tsc --noEmit`, touched
ESLint, `git diff --check`, and the Finance Agent Playwright test pass. The browser assertions check
the calculated amounts, disclosure, and rendered category row; screenshot inspected, no page or
console errors and no API 5xx. Full backend Jest reports **406/409 suites and 2,451/2,515 tests
passed**; the three failing suites are Assistant/Help retrieval fixtures and Voice's repeated fixed
phone-number uniqueness setup failure. No migration, provider request, commit or push. This is a
bounded Finance review capability; the five-agent specification remains incomplete.

## Shared specialist-agent AI usage attribution (2026-10-24)

Optional AI explanations now persist a relation from each `AiCallLog` to the specific
`SpecialistAgentRun` that requested it. Inventory, Finance, Customer, SEO and Commerce run history
exposes those real log records; their views summarize logged calls, token totals and estimated
logged USD cost. The cost is explicitly an application estimate, not a provider invoice. Invalid
or cross-business run IDs are rejected before the provider is called, and deleting a run preserves
the usage log with a null relation.

Real-MySQL attribution spec and five affected specialist-agent specs pass (**6 suites / 46 tests**).
Backend/frontend `tsc --noEmit`, touched-file ESLint and `git diff --check` pass. Migration
`20261024200000_specialist_agent_ai_usage` is applied locally and Prisma reports 212 migrations
up-to-date. Full backend Jest reports **406/409 suites and 2,452/2,516 tests passed**; the three
failures are Assistant/Help retrieval fixtures and Voice's repeated fixed-number uniqueness
collision. Browser QA only loaded the SEO Agent Workspace empty state using accessibility
inspection; no screenshot or console/network audit, and no paid provider call. No commit or push.

## Per-agent monthly AI request limits (2026-10-24)

AI & Governance now lets the owner set an optional UTC-month request-count cap independently for
Inventory, Finance, Customer, SEO and Commerce. A missing value means no cap. This limit is not a
USD spend budget; the existing business-wide estimated-cost cap remains separate. Specialist model
requests must match a persisted run and the run's agent kind. Before calling the provider, the
backend serializes reservations per business, checks that agent's monthly count, and writes a
reservation. Concurrent calls therefore cannot both take the last slot. Failed and abandoned
requests count conservatively; after a cap is reached, deterministic reviews remain usable.

The AI & Governance row was browser-checked in the QA Test Business: a temporary Inventory limit of
1 saved and then was cleared back to `No limit`. No provider was called. Focused real-MySQL tests
pass (**2 suites / 18 tests**), including concurrent cap enforcement, a provider failure consuming
the slot, another agent remaining independent, and uncapped requests. Backend/frontend TypeScript,
touched-file ESLint and `git diff --check` pass. Migration
`20261024205200_specialist_agent_monthly_requests` is applied; both FKs were verified and Prisma
reports 213 migrations up-to-date. Full backend Jest: **406/409 suites, 2,453/2,517 tests passed**;
the failures are existing Assistant/Help retrieval fixture misses and Voice's repeated fixed-number
unique collision. No commit or push; the five-agent specification remains incomplete.

## Monthly cap usage visibility (2026-10-24)

AI & Governance now displays, beside each specialist cap, how many persisted requests have counted
against it in the current UTC month. The count uses the enforcement reservation rows, so failed and
abandoned attempts remain visible as counted; it is scoped by the selected business and agent.

The Settings Hub real-MySQL suite passes **20/20** and verifies current-month versus prior-month
records, agent separation, and tenant isolation. Backend/frontend TypeScript and diff checks pass.
The Intelligence category lint passes with its pre-existing Prettier noise disabled; the broader
Settings Hub spec still has eight pre-existing unsafe-any lint findings outside this addition. No
migration or provider call was made. Full backend Jest finished with **406/409 suites and
2,454/2,518 tests passed**; the same Assistant/Help retrieval fixture failures and Voice
fixed-phone-number uniqueness collision remain. After rebuilding/restarting the stale compiled API,
a fresh QA Test Business browser page displayed `0 counted this month` for all five agents; no
console/network audit or provider request was made. No commit or push. This improves cap
transparency but does not complete the five-agent specification.

## Per-agent monthly AI spend budgets (2026-10-24)

AI & Governance now exposes optional UTC-month USD caps for all five specialists. Calls reserve a
conservative maximum from serialized text size, model output-token limit and the configured default
Haiku estimate before contacting the provider, under the same business-scoped lock as request-count
limits. Successful usage is recomputed from the exact returned token counts; failed or abandoned
requests retain their maximum reservation for the month. A non-default model or non-text input is
refused rather than assigned an unverified price. Deterministic reviews remain usable if optional AI
is blocked. The UI shows logged estimate plus current reservations and explains that this is not an
invoice.

Migration `20261024213000_specialist_agent_monthly_spend_budgets` is applied locally; Prisma status
reports 214 migrations up to date. Two real-MySQL suites pass (36 tests), backend/frontend
`tsc --noEmit` pass, and the live QA Test Business Settings page displays all five budget rows. No
setting change or paid AI call was made. Full backend Jest: **406/409 suites and 2,456/2,520 tests
passed**; Assistant/Help retrieval fixture failures and Voice's fixed-number uniqueness collision
remain. This is a useful guardrail, not completion of the five-agent specification; browser
console/network audit and remaining specialist action, scheduling and orchestration contracts are
still outstanding. No commit or push.

## Five Specialized AI Agents — idempotent manual reviews (2026-10-24)

- Manual Inventory, Finance, Customer, SEO and Commerce specialist-run requests now accept an
  optional `Idempotency-Key`. The server stores only a SHA-256 key hash, scopes uniqueness by
  business and agent, and binds reuse to the initiating user and canonicalized request scope.
  Same-request retries return the original run (including its saved details); conflicting reuse is
  rejected, and a previously failed run requires a fresh key rather than being presented as a
  successful retry. Existing clients that omit the header retain their previous behavior.
- A browser-held key is reused across network/5xx retries for the same agent, user/business,
  branch and inputs, then cleared after a successful or definitive response. It does not store the
  raw key on the server and does not make model/provider work happen more than once for a replay.
- Hand-written migration `20261024224200_specialist_agent_run_idempotency` was applied locally;
  Prisma generation succeeded and migration status showed the schema up to date (215 migrations).
  Focused real-MySQL coverage passes **2 suites / 15 tests**, including simultaneous duplicate
  requests, changed-scope/user conflicts, per-agent separation, legacy no-key calls and failed-run
  handling. Backend/frontend `tsc --noEmit`, touched frontend/backend ESLint and `git diff --check`
  pass. The five agent-service formatting blocks were formatted without reformatting unrelated
  workspace edits.
- Full backend Jest: **407/410 suites passed; 2,461/2,525 tests passed**. The three failing suites
  are Assistant and Help retrieval fixtures plus VoiceCallService setup failing on its repeated
  fixed phone-number unique constraint. No browser QA or provider call was performed. No commit or
  push. The five-agent specification remains incomplete; shared approvals/actions, scheduled/event
  orchestration and the remaining agent-specific capabilities still need work.

## Progress — opt-in daily scheduled reviews (2026-10-25)

- Added five owner-controlled policies (disabled by default) for daily Inventory, Finance, Customer,
  SEO and Commerce reviews. An hourly UTC job reuses existing specialist services, runs with
  tenant context, tags runs as scheduled, uses a null actor, suppresses optional AI summaries, and
  deduplicates by business/agent/UTC date. Commerce reviews require autonomy to be enabled. No
  migration was needed.
- Real-MySQL coverage passed **1 suite / 1 test**. Backend/frontend `tsc --noEmit`, touched-file
  ESLint and focused checks passed. Full backend Jest: **408/411 suites and 2,462/2,526 tests
  passed**; failures remain in the three known Assistant/Help retrieval and VoiceCallService
  phone-number setup suites. Browser QA was unavailable because macOS ControlCenter owns port 5000;
  no commit or push was made.
- General event-driven orchestration, further specialist actions and browser/provider verification
  remain open; this is not a complete or production-ready module.

## Progress — opt-in SEO audit event review (2026-10-25)

- A successful or partial SEO site audit now enqueues a durable review event only when the new
  owner policy is enabled. The worker rechecks the policy, enabled SEO agent, tenant-owned audit
  status, and deduplicates via the existing specialist-run idempotency path. Event runs have no
  user actor, suppress optional AI summaries, and are read-only; failed audits do not trigger them.
  No migration was needed.
- Focused real-MySQL/service tests passed **3 suites / 18 tests**. Backend/frontend TypeScript and
  touched-file ESLint passed. Full backend Jest: **409/412 suites, 2,467/2,531 tests passed**;
  failures remain in the known Assistant/Help retrieval fixtures and VoiceCallService fixed-number
  uniqueness setup. Browser QA was unavailable because port 5000 is owned by macOS ControlCenter.
  No commit or push.
- This is one event-triggered review path, not general event orchestration. Other event triggers,
  cross-agent handoffs, remaining specialist capabilities, and browser/provider verification remain
  open; the module is not complete or production-ready.

## Progress — opt-in Inventory low-stock event review (2026-10-25)

- The existing Inventory low-stock scan now queues a read-only specialist review only when an
  owner-controlled policy is on. The dedicated queue worker rechecks policy and agent enablement,
  and verifies that the referenced ActivityEvent is a low-stock event owned by that business.
  ActivityEvent IDs form the idempotency scope; the run records the source reference, has no user
  actor, and suppresses optional AI explanations. No new table or migration was needed.
- Focused MySQL event tests passed **2 suites / 4 tests**. Backend `tsc --noEmit`, touched-file
  ESLint and frontend `tsc --noEmit` passed. Full backend Jest: **410/413 suites and 2,469/2,533
  tests passed**; the three known failing suites are Assistant/Help retrieval and VoiceCallService's
  fixed-number uniqueness fixture. Browser QA remains unavailable because the required local API
  port is occupied by macOS ControlCenter. No commit or push.
- This is an additional event integration, not a general event bus or complete five-agent delivery.
  Other event triggers, cross-agent handoffs, remaining specialist capabilities, and browser/provider
  QA remain open.

## Progress — opt-in Customer lapsed-event review (2026-10-25)

- The existing CRM tag-rules job now queues a Customer specialist review on newly-created
  `customer_lapsed` events only when an owner-controlled policy is enabled. Events for one business
  coalesce into one daily job; the worker validates that the event and still-Lapsed customer belong
  to the business, and rechecks agent enablement and policy. It passes canonical aggregate
  `AnalyticsService.customerSummary` data to the existing Customer Intelligence service, has no
  initiating user, stores the source event reference, and suppresses optional AI summaries. No
  customer PII is added to the queue payload; no message is sent and no migration was needed.
- Focused Customer event and CRM MySQL tests passed **2 suites / 5 tests**. Backend and frontend
  TypeScript, touched-file ESLint and fabrication/diff checks passed. Full backend Jest:
  **411/414 suites and 2,471/2,535 tests passed**; the same Assistant/Help retrieval fixture and
  Voice fixed-number uniqueness suites remain failing. Browser QA was not run because port 5000 is
  occupied by macOS ControlCenter. No commit or push.
- This adds one safe Customer event path, not general cross-agent orchestration. Additional event
  contracts, specialist-specific capabilities, and browser/provider QA remain open.

## Progress — opt-in Commerce validation event review (2026-10-25)

Product Validation decisions and canonical catalog-draft events can now trigger a deterministic,
read-only Commerce review when the owner opts in. The producer links only the persisted canonical
`commerce_validation` ActivityEvent and does not let queue failure undo the merchant's successful
decision. The worker validates business and referenced entity ownership, the Commerce specialist
toggle, event-review policy and enabled autonomy level, then deduplicates by source event ID.
Commerce run evidence records the source event. Optional AI is suppressed, no catalog or commerce
action is applied, and no migration or provider call was needed.

Focused real-MySQL/product validation coverage passes **4 suites / 20 tests**. Both TypeScript
checks and touched-file ESLint pass. Full backend Jest: **412/415 suites and 2,475/2,539 tests
passed**; the remaining three failing suites are Assistant/Help retrieval fixtures and
VoiceCallService's fixed phone-number uniqueness setup. Browser/provider QA and commits remain
outstanding. Commerce event review joins the SEO, Inventory and Customer opt-in event paths but is
not a general event orchestrator; the five-agent module is still incomplete and not production
accepted.

## Progress — opt-in Finance expense event review (2026-10-25)

Newly saved canonical Expense rows can queue an owner-opt-in Finance review. The producer sends
only business and expense IDs; the worker revalidates the tenant-owned row and both policy gates,
uses the recorded expense month, and deduplicates by expense ID. It reuses the existing Finance
Intelligence/Profit Analytics services, records the source reference, has no actor, and suppresses
AI explanations. This review is read-only and does not post or reconcile accounting data. No new
model, migration, or external provider was needed.

Focused Expense/Finance/Commerce MySQL and service coverage passes **7 suites / 36 tests**.
Backend/frontend TypeScript and touched backend ESLint pass. The latest full backend Jest run passes
**413/416 suites and 2,478/2,542 tests**; the same three failing suites remain Assistant/Help
retrieval fixtures and VoiceCallService's fixed-number uniqueness setup. Browser/provider QA remains
unavailable; no commit or push was made. Five specialized agent work remains incomplete and not
production accepted.

## Progress — opt-in failed-delivery Commerce review (2026-10-25)

- The canonical Deliveries status transition can queue one read-only Commerce review when a
  delivery becomes failed and the owner has enabled the event-review policy. Queue failure is
  logged and does not change the saved delivery result. The job is bound to the business, delivery
  and exact failure timestamp; the worker rechecks the current tenant, failed status, timestamp,
  agent toggle, event policy and nonzero Commerce autonomy before running. Idempotency uses the
  existing specialist-run hash. The review reuses Commerce's existing canonical delivery-exception
  summary; it does not send a customer message or mutate a Delivery or Order, and does not call AI.
- Added an owner setting in AI & Governance and tests for queueing, replay, stale status, cross-tenant
  IDs, policy-off and autonomy-off cases. Focused Deliveries and Commerce event specs pass **2
  suites / 32 tests**. Backend/frontend type checks and touched backend ESLint pass. Full backend
  Jest: **413/416 suites, 2,482/2,546 tests passed**; the same Assistant/Help retrieval fixtures and
  Voice fixed-number fixture collision fail. Browser/provider QA was not run. No migration, commit
  or push; the five-agent scope is not complete.

## Progress — Commerce Agent draft-tool retry safety (2026-10-25)

Commerce Agent draft writes now require an idempotency key reserved in MySQL before calling the
canonical draft service. The unique business-scoped key prevents concurrent duplicates; same-key,
same-actor/tool/input retries return the original canonical draft, while conflicting reuse is
refused. In-flight retries report pending. Failed or stale outcomes require the operator to inspect
the canonical screen before retrying with a new key. Read-only tools remain keyless. A new read-only
B2B quote-preview tool reuses canonical tier/price-list and credit calculations; it includes the
business currency and discloses that the line total excludes tax, and it creates no Order. API
responses exclude stored key hashes and resource references; the UI retains its stable key across
transient network/5xx failures. This protects the existing listing/RFQ/claim/experiment draft
tools, but does not add autonomous publishing, supplier contact, or a generic approval/execution
engine.

Migration `20261025103000_commerce_agent_tool_idempotency` is applied locally and Prisma reports all
216 migrations current. Focused real-MySQL tests pass **2 suites / 22 tests**; backend/frontend type
checks, touched-file ESLint and scoped diff check pass. Full backend Jest passed **413/416 suites,
2,490/2,554 tests**; the three failures are the recurring Assistant/Help retrieval fixtures and
Voice fixed-number uniqueness fixture, with no Commerce suite failure. No browser/provider QA,
commit or push. Orchestration, generic approval/action lifecycle, wider specialist coverage, and
live QA remain outstanding; the five-agent module is incomplete and not production accepted.

## Progress — fail-closed Commerce approval gate (2026-10-25)

Commerce's registry declared medium/high-risk, financial and irreversible tools as approval-required,
but the direct run gate did not enforce that declaration if a tool were later made executable. The
gate now refuses those risk classes until a human approval workflow is connected. Non-executable
tools continue to disclose their specific unavailable state; attempts remain audited as refused.
A real-MySQL test temporarily enables a high-risk publish tool and confirms it is blocked and cannot
reach provider execution. No migration was needed. Focused Commerce tool spec passes **1 suite / 16
tests**; backend/frontend TypeScript, touched-file ESLint and scoped diff check pass. Full backend
Jest: **413/416 suites and 2,491/2,555 tests passed**; the three unrelated failures are Assistant
and Help retrieval fixtures and VoiceCallService's fixed-number uniqueness fixture. No browser QA,
provider call, commit or push. This is a safety guard, not the missing approval/action lifecycle.

## Progress — opt-in Commerce supplier-quote event review (2026-10-25)

A saved canonical supplier quote can now enqueue a read-only Commerce review when the owner enables
the new default-off event policy, the Commerce specialist is enabled, and autonomy is above zero.
The producer does not fail the quote if review enqueueing fails. The worker revalidates the tenant,
quote status and open RFQ, rejects superseded/closed/foreign quotes, and uses quote-scoped
idempotency. It records the event source and does not award an RFQ, create a purchase order, contact
a supplier, or request AI. No migration was needed.

Focused real-MySQL producer and processor specs pass **2 suites / 17 tests**. Backend and frontend
type checks pass. Scoped ESLint passes with the repository's existing Prettier rule disabled; the
normal check still reports the compact-format backlog in the shared
`settings-hub/categories/intelligence.ts`. The full backend Jest run passes **413/416 suites and
2,494/2,558 tests**. Its three failing suites are the recurring Assistant/Help retrieval fixture
misses and VoiceCallService's fixed-number uniqueness setup; the new Commerce tests pass. No
browser/provider QA, commit, or push. This is one additional event path, not general cross-agent
orchestration or full five-agent completion.

## Progress — opt-in Customer appointment no-show review (2026-10-25)

An appointment transition to `no_show` can queue one Customer Agent review when both Customer
Agent and the distinct owner policy are enabled. The job is bound to the appointment's exact saved
timestamp. The worker rechecks tenant ownership, opt-in and current no-show state before invoking
the existing Customer Intelligence service. A queue failure does not undo the canonical booking or
deposit action. The saved review is idempotent and audited; it contains CRM flags and contact
presence only, never contact values, no-show cause, AI-generated text or a customer message. No
migration was required.

Focused real-MySQL producer, processor and CRM specs pass **3 suites / 38 tests**. Backend/frontend
TypeScript checks and touched-file ESLint (with the existing Prettier rule disabled) pass. Full
backend Jest passed **412/416 suites and 2,496/2,561 tests**; the recurring Assistant/Help retrieval
and Voice fixed-number fixture suites failed. SEO Workspace failed only in the parallel full run and
passed when rerun alone (**1 suite / 2 tests**). No browser/provider QA, commit or push. This is
another opt-in Customer event, not general event orchestration; the five-agent system remains
unfinished and is not production accepted.

## Progress — Inventory recorded-demand backtest (2026-10-25)

The Inventory Agent's eight-week recorded-sales baseline now includes a rolling historical check
when at least six of those weeks contain recorded sales. It tests the two newest seven-day buckets
using only older buckets to predict each one, then saves the evaluated-window count and mean
absolute error as evidence. Sparse histories are not scored. The page displays the observed error
and explicitly labels it descriptive, not calibrated; it does not change reorder quantities or
inventory. The real-MySQL fixture verifies both the two-window result and the sparse-history case.

The canonical stock-count apply flow now also has a separate, default-off owner setting to queue one
read-only Inventory review. The worker verifies the count still belongs to the business, remains
applied, and has the exact `appliedAt` timestamp from the job before writing an idempotent event
run. Queue or policy lookup failure cannot undo a stock count that has already applied. The event
does not invoke AI or edit inventory, and no schema migration was needed.

Focused Inventory MySQL specs pass **3 suites / 23 tests** (demand backtest, stock-count producer,
and event processor); backend/frontend TypeScript checks pass. Frontend lint passes, and backend
lint passes with the repository's Prettier rule disabled. Standard backend lint still reports
formatting findings across the already broadly edited Inventory and settings files. Full backend
Jest: **412/416 suites and 2,498/2,565 tests passed**; the failing suites are recurring Assistant/
Help retrieval and fixed Twilio test-number uniqueness fixtures. The Inventory suites pass in the
full run. No browser/provider QA, migration, commit or push. Historical validation remains
descriptive, not calibrated forecasting; cross-agent orchestration and the remaining agent-specific
gaps remain open.

## Progress — versioned specialist event trace references (2026-10-25)

All currently persisted event-triggered specialist reviews now use a shared trace-reference
contract: canonical event ID, source module, entity type/ID, source `occurredAt`, source version
token, schema version, and correlation ID. When no upstream trace exists, correlation ID is the
stable event ID; no current event producer supplies a separate parent trace. Entity versions use
the source's real version field where available (for example, supplier-quote version), otherwise a
source timestamp token; this is explicitly not a database row revision number. Review input refs
store only identifiers and trace metadata, not copied customer, expense, delivery, inventory or SEO
content. Customer delivery-failure and appointment no-show runs now persist the same envelope as
the other specialist event-processing paths. No schema migration was needed.

Added helper validation tests and expanded event-worker assertions. Focused event and service
real-MySQL checks pass **11 suites / 60 tests**. Backend and frontend `tsc --noEmit` pass. Touched
backend ESLint passes with the repository's existing Prettier rule disabled; standard ESLint reports
20 formatting-only Prettier findings on previously compact lines in already modified files, with no
remaining lint-rule errors. Full backend Jest: **413/417 suites, 2,503/2,568 tests passed**. The
four failing suites are Assistant/Help retrieval and Voice fixed-identifier fixtures; a serial rerun
confirmed Help/Assistant retrieval still fails and the Voice call fixture still conflicts, while
the Voice tracking-number suite passes alone (its full-run failure was identifier contention). The
new trace-related suites pass. No browser/provider QA, migration, commit or push. Event payloads are
still module-specific queue jobs rather than a general event bus, and cross-agent orchestration and
remaining specialist capabilities are not complete.

## Progress — Inventory Agent open-purchase offset (2026-10-25)

The Inventory Agent now offsets its proposed reorder quantity by the unreceived quantity on
canonical purchase orders in `sent`, `confirmed` or `partially_received` status. This is a separate
agent-proposal adjustment: the canonical reorder formula is unchanged, and draft Procurement
requests are not treated as supplier commitments. The saved finding includes base quantity,
incoming quantity and net proposed quantity. If incoming quantity fully covers the base suggestion,
the agent records a zero-quantity finding, discloses that no new request is suggested and offers a
link to review Purchases; it will not prepare a zero-quantity request.

The Procurement handoff recalculates the same offset under its source freshness check. A changed
stock/sales/open-order source refuses the stale handoff, while a fresh positive net quantity can
still create only the canonical request draft for human review. A fully covered quantity is
refused. No stock change, supplier contact, migration or provider call was made. Real-MySQL
Inventory/Procurement specs pass **2 suites / 21 tests**. Backend and frontend `tsc --noEmit` pass;
touched-file ESLint passes with the repository's existing Prettier rule disabled. Full backend
Jest: **414/417 suites and 2,508/2,572 tests passed**. The three failing suites remain the Assistant
and Help retrieval fixtures and VoiceCallService's fixed-number uniqueness fixture; the new
Inventory test passes in the full run. Browser QA remains unverified: no frontend server is
listening on port 3000 and macOS Control Center owns port 5000. No commit or push. This improves one
Inventory recommendation/handoff path; it does not complete the Inventory Agent or the five-agent
specification.

## Five Specialized AI Agents — cross-agent operations visibility (2026-10-25)

The owner-only AI Settings page now has a read-only `GET /ai/specialist-operations` view across the
five specialists. It aggregates this business's persisted 30-day run and trigger states, failed
run error codes (not error messages), finished-run p50/p95 latency from at most the latest 5,000
finished run rows, current running-run counts and the oldest persisted `startedAt` age,
recommendation records by their persisted status, and linked AI request/token/application-estimated-
cost totals. Filters narrow the displayed agent rows by module and failure code. A real-MySQL test
verifies tenant isolation across run, active-run, recommendation and linked AI-call data. There is
no schema change or provider request.

The UI labels recorded recommendation states as states—not acceptance or outcome rates—and labels
cost as the application's estimate, not an invoice. It explicitly discloses that shared telemetry
does not separately record tool/action counts, enqueue/queue-wait age, per-tool/provider latency,
approval or verification outcomes, or security-event rates. The active-run age is measured from
the saved run's `startedAt`, not from enqueue. In the read-only browser check under the local
Module 21 QA owner, AI Settings and the operations table rendered with real zero-row totals for that
business and no browser-console errors. No data was changed; this was not an end-to-end action test.

Focused real-MySQL AI Settings spec passes **1 suite / 4 tests**. Backend/frontend `tsc --noEmit`
and standard ESLint for the five touched code files pass; scoped `git diff --check` is clean. The
full backend Jest run passes **414/417 suites and 2,509/2,573 tests**. The three failing suites are
the recurring Assistant and Help retrieval fixtures and VoiceCallService's fixed-number uniqueness
fixture. No migration, commit or push. This is a useful shared operations summary, not the full
section 19 dashboard/alerting/trace contract and not completion or production acceptance of the
five-agent system.

## Five Specialized AI Agents — cross-agent review fan-out (2026-10-25)

AI Settings now provides an owner-only cross-agent review action backed by
`POST/GET /ai/specialist-orchestrations`. It requires an idempotency key, runs the five existing
canonical review services sequentially (Inventory, Finance, Customer, SEO and Commerce), and
records a parent run linked to its child runs and their outcomes. The child runs also retain the
parent reference. This reuses existing review logic; it does not send messages, mutate source
records, invoke an external AI provider, or execute recommendations. The real browser check in the
Module 21 QA business completed **5 reviews, 0 partially succeeded, 0 failed and 0 skipped**, with
no browser-console errors. No source business data was changed.

Focused orchestration and SEO Workspace real-MySQL specs pass; the SEO Workspace fixture now selects
the specific eligible finding rather than depending on row order. Backend and frontend
`tsc --noEmit` pass. ESLint passes on touched frontend files; touched backend lint passes with the
repository Prettier rule disabled. Fabrication grep and `git diff --check` are clean. Full backend
Jest: **415/419 suites and 2,512/2,578 tests passed**. The four failing suites are Assistant and Help
retrieval fixtures, VoiceCallService's fixed phone-number uniqueness fixture, and a Dashboard
health-score snapshot suite that timed out/then missed a concurrent snapshot under full-suite
load. No migration, commit or push.

This orchestration is synchronous and sequential, not a durable queued workflow; it has no generic
approval/action/verification lifecycle or per-tool telemetry. It is a cross-agent review entry
point, not autonomous coordination or completion/production acceptance of the five-agent system.

## Five Specialized AI Agents — retry failed cross-agent child reviews (2026-10-25)

The owner-only cross-agent history now offers `Retry failed` when a parent run has failed child
reviews. `POST /ai/specialist-orchestrations/:id/retry-failed` requires an `Idempotency-Key`, stores
only its hash on the parent run, claims retries with a conditional status transition, and rechecks
the current specialist enablement policies. It runs only children that previously failed; completed
and skipped children remain unchanged, and agents disabled since the original run are recorded as
skipped. Each retry uses a distinct child idempotency key while keeping the original parent link.
The route is owner-only and audited. No external AI/provider or source-record write is involved.

The real-MySQL spec simulates one failed Inventory child followed by a successful retry, verifies
that completed/skipped results remain intact, and confirms replaying the same retry key does not
start another child. Focused controller and real-MySQL tests pass **2 suites / 6 tests**; backend and
frontend `tsc --noEmit` pass; touched-file ESLint passes. Full backend Jest: **416/419 suites and
2,515/2,579 tests passed**. The three failing suites are the recurring Assistant and Help retrieval
fixtures and VoiceCallService's fixed phone-number uniqueness fixture. The prior Dashboard snapshot
timeout did not recur. Browser verification of the new button was not possible because the local
browser had no authenticated QA session; local servers were listening. No migration, commit or push.

At the time of this entry retries still ran synchronously inside the request. The next progress
entry replaces that execution path with a durable queue; a broader policy-bounded action lifecycle
remains open.

## Five Specialized AI Agents — durable cross-agent review worker (2026-10-25)

Cross-agent reviews now persist the parent and enqueue background work instead of running all five
specialists inside the HTTP request. The BullMQ job is idempotency-keyed to the parent/retry, uses
bounded exponential retries, and records child progress as it goes. The worker rechecks current
business specialist switches before invoking each canonical read-only review. Completed children
are retained across queue retries; interrupted child runs are reconciled from their persisted run
state and retried under a distinct hashed idempotency key. A one-minute recovery tick scans
explicitly for still-running orchestration parents and re-enqueues them, covering a process stop
between the MySQL parent write and Redis enqueue. The owner-only retry-failed action now queues the
retry as well. AI Settings polls while a run is active and displays its last persisted progress time.

No schema change or migration was needed. The real-MySQL orchestration spec verifies that a queued
parent and child complete and that an orphaned running parent is re-enqueued and completed. Focused
controller and MySQL tests pass **2 suites / 7 tests**. Backend and frontend `tsc --noEmit` pass;
touched-file ESLint passes. Full backend Jest and browser QA have not yet been rerun for this entry.
No provider call, source-record mutation, commit or push. This adds durable execution/recovery for
the cross-agent read-only review only; it does not add autonomous plans, approvals, outbound actions,
or finish the five-agent specification.

## Five Specialized AI Agents — safe cancellation for cross-agent reviews (2026-10-25)

The owner can now request cancellation of an active cross-agent review from AI Settings. The
tenant-scoped, audited endpoint changes the persisted parent status from `running` to
`cancel_requested`. The worker checks that state between specialists; a read-only review already
in progress may finish, but later specialist reviews are not started. The parent then records a
terminal `cancelled` status and the completed/partial/failed/skipped child counts. Queue recovery
also sees `cancel_requested` parents and finalizes them if the worker stopped after the request.
Operational active-run counts and the UI include the requested-stop state. The UI explains that
the current review may finish before stopping; this does not abort a domain service mid-query.

No schema change or migration was needed. Focused controller, real-MySQL orchestration and AI
Settings tests pass **3 suites / 13 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint,
and scoped `git diff --check` pass. Full backend Jest: **415/419 suites and 2,516/2,582 tests
passed**. The four failing suites are the recurring Assistant and Help retrieval fixtures,
VoiceCallService's fixed phone-number uniqueness fixture, and Reviews reminder tests that timed out
under full-suite load. The Reviews suite passes isolated (**1 suite / 3 tests**). The AI Settings
page loaded in the authenticated local browser with no console errors, but I did not verify the new
stop action end-to-end against the local server. No provider call, source-record mutation, commit or
push. This adds safe cancellation for read-only cross-agent review, not the broader policy-bounded
action/approval/verification lifecycle or completion of the five-agent specification.

## Five Specialized AI Agents — live-policy and cancellation admission safety (2026-10-25)

The durable review worker now reads the business's current specialist enablement policy immediately
before each child review, on both first execution and retry. Disabling an agent after the parent job
was queued prevents its later child review from starting; the child is persisted as skipped. The
canonical specialist services retain their own server-side gate as a second check.

Cancellation and child admission now compete on the same conditional parent-row update. If the
owner's `cancel_requested` transition wins first, the worker's admission write fails and it does not
start the child. If admission wins first, that child is the current in-progress read-only review and
may finish, as the UI promises. A real-MySQL test covers refusal of admission after a stop request.

Focused controller, orchestration MySQL and AI Settings tests pass **3 suites / 15 tests**. Backend
and frontend `tsc --noEmit` pass; touched backend/frontend ESLint passes (the repository's existing
Prettier rule is disabled for backend lint). Full backend Jest: **416/419 suites and 2,520/2,584
tests passed**. The three failing suites are Assistant retrieval, Help retrieval and
VoiceCallService's fixed-number uniqueness fixture. The authenticated AI Settings browser check had
no console errors and one read-only review run completed all five specialists before the stop
button could be exercised; end-to-end cancellation remains unverified. No provider call, source
record mutation, schema change, migration, commit or push. This hardens only the read-only
cross-agent review worker and does not complete the specification's general action, approval,
execution and verification lifecycle.

## Five Specialized AI Agents — business-module disable enforcement for background reviews (2026-10-25)

Specialist manual runs now check the canonical business-module selection as well as each agent's
own AI & Governance switch. Scheduled reviews, cross-agent orchestration, and Inventory, SEO,
Customer, Commerce and Finance event workers also skip reviews when the corresponding module is
disabled. Branches inherit the root business selection. If a business disappears between the
scheduler's page query and policy lookup, that tick fails closed for the stale row rather than
aborting the job.

Real-MySQL coverage now checks all five agent-to-module mappings, branch inheritance, scheduler
skipping, orchestration skipping (including a module disabled mid-run), and event worker paths.
Focused coverage passes **8 suites / 39 tests**. Backend/frontend `tsc --noEmit` pass; touched
backend ESLint passes with the repository Prettier rule disabled. The standard check reports only
formatting-only Prettier differences in these compact files. Full backend Jest: **416/419 suites,
2,523/2,587 tests passed**; the three failing suites remain Assistant retrieval, Help retrieval and
VoiceCallService's fixed-phone-number uniqueness fixture. A scheduler race observed during the
first full run was fixed and did not recur. No browser/provider QA, schema change, migration, commit
or push. The five-agent specification remains incomplete and is not production accepted.

## Five Specialized AI Agents — opt-in fully received purchase-order review (2026-10-25)

Inventory now offers a default-off, owner-controlled review trigger after a purchase order is fully
received. The producer queues only after the canonical receipt update and only for the final
receipt; partial receipts do not trigger. The worker revalidates the current business, selected
Inventory module, specialist and event policies, purchase-order tenant and final received state,
then uses the existing event idempotency path. Queue failure does not undo receipt. This review is
read-only and does not call an AI provider or alter the PO. No migration was required.

Focused real-MySQL/service coverage passes **2 suites / 16 tests**. Backend/frontend `tsc --noEmit`
pass; touched backend lint passes with the repository's existing Prettier rule disabled; scoped
`git diff --check` is clean. In the authenticated QA browser, AI & Governance displayed the new
default-off setting and the Inventory reorder page loaded with its actual data/empty state. This
was visual/route QA only; the event flow was not triggered end-to-end. Full backend Jest: **416/419
suites and 2,527/2,591 tests passed**. The recurring failures are Assistant retrieval, Help retrieval
and VoiceCallService's fixed-phone-number uniqueness fixture. No commit or push. The five-agent
specification remains incomplete and is not production accepted.

## Backend QA follow-up — isolate shared MySQL search fixtures (2026-10-25)

The VoiceCallService integration spec's hard-coded global inbound number and static Twilio call SIDs
collided with data from previous local runs. The spec now creates a unique E.164-compatible number
and per-test 34-character Twilio-shaped SIDs. Isolated VoiceCallService coverage improved to
**59/60**; the remaining failure is its newly inserted FAQ not appearing in MySQL full-text search.

The Assistant, Help and Voice retrieval suites still fail **1 + 3 + 1 tests**. A temporary HelpArticle
row was inserted, queried, and deleted during diagnosis: it existed but `MATCH(title)` gave a score
of zero, while the existing seeded `staff-commissions` article matched. This points to an unresolved
MySQL full-text/indexing behavior for newly inserted fixtures; it has not been established as
test-only or production-only, so it remains an open correctness issue. Full backend Jest after the
fixture correction: **416/419 suites and 2,586/2,591 tests passed**. Backend/frontend type checks and
the touched Voice spec lint pass. No schema or migration changes, commit or push.

## Five Specialized AI Agents — erasure-aware Customer Agent records (2026-10-25)

Customer erasure now clears custom field values, marketing consent and agent-authored customer
follow-up tasks/message drafts in the same MySQL transaction that anonymizes the customer. Draft
deletion is scoped to the `customer_agent:<customerId>:` source-key namespace; unrelated voice
drafts and canonical order/transaction history are retained. The erasure audit records only the
operation, cleared field names and deleted row counts, not the customer's prior PII. Customer Agent
task/manual-draft/AI-draft persistence locks and rechecks the customer row so an in-flight write
cannot recreate agent records after erasure commits. AI draft generation still supplies purpose-only
instructions to the provider and revalidates before persistence.

Real-MySQL Customers and Customer Agent specs pass **2 suites / 18 tests**. Backend/frontend
`tsc --noEmit` pass; touched-file ESLint passes with the repository's existing Prettier-only findings
excluded. Standard ESLint reports three formatting-only findings on pre-existing, untouched lines
of `customers.service.ts`. Full backend Jest: **416/419 suites and 2,588/2,593 tests passed**; the
five failures are the recurring Assistant retrieval (1), Help retrieval (3) and Voice knowledge
retrieval (1) failures. No migration or commit was made. Browser end-to-end QA was not performed for
this backend-only change; the available browser was on another app and local API port 5000 is still
owned by macOS Control Center. This closes the Customer Agent erasure gap for its own saved records,
not every data-subject erasure requirement or the full five-agent specification.

## Five Specialized AI Agents — erased profiles excluded from segments (2026-10-25)

Canonical legacy audiences, saved-segment member lists and counts, and unsaved rule previews now
exclude anonymized customer profiles. Customer Agent proposal counts use the same exclusion and
report inactive non-erased profiles separately, keeping exclusion categories disjoint without
exposing erased profiles as segment matches. The win-back candidate summary also excludes erased
profiles before counting lapsed candidates. Real-MySQL regressions verify the `all` and `vip`
audiences, saved-segment retrieval/count, unsaved preview, disjoint proposal counts and a raw-six to
non-erased-five win-back candidate reduction. Focused coverage passes **5 suites / 55 tests**;
backend/frontend type checks pass. Backend ESLint passes with existing Prettier-only findings
disabled; frontend ESLint passes. Standard backend lint still reports three formatting-only
differences on untouched lines. Scoped `git diff --check` and fabrication grep pass. Full backend
Jest is **416/419 suites and 2,589/2,594 tests passed**. Five existing failures remain: Assistant help
retrieval (1), Help retrieval (3) and Voice FAQ retrieval (1), all failing to retrieve newly inserted
MySQL full-text fixtures. No migration, browser QA, commit or push. The broader five-agent
specification is still incomplete and not production accepted.

## Five Specialized AI Agents — keep erased profiles out of CRM surfaces (2026-10-25)

Erased customer placeholders are excluded from the CRM directory, profile/export lookup,
updates/merge existence checks, bulk exports and duplicate suggestions. The scheduled lapsed tagger
skips them, preventing retained anonymized rows from being retagged or creating a new
lapsed-customer activity/agent event. The workflow AI agent's profile/orders/run-value tools and the
Assistant's direct phone-lookup/top-customer/top-debtor tools also exclude erased profiles.
Transaction and financial history remains retained.

Real-MySQL regressions across CRM, exports, duplicate suggestions, periodic tagging, workflow AI
tools and Assistant tools pass **5 suites / 24 tests**. Backend/frontend type checks pass.
Touched-file ESLint passes with the existing Prettier rule disabled; standard lint reports only
formatting-only findings in pre-existing compact legacy code, while the new spec is formatted.
Scoped `git diff --check` passes. Full backend Jest: **417/420 suites and 2,592/2,597 tests passed**.
The same five MySQL full-text fixture retrieval failures remain (Assistant 1, Help 3, Voice FAQ 1).
No browser/provider QA, schema change, migration, commit or push. Customer erasure visibility is
improved, but the five-agent specification and production acceptance remain incomplete.

## Five Specialized AI Agents — fresh knowledge retrieval and Memory Note erasure (2026-10-25)

Help Assistant and voice-agent knowledge retrieval now use a bounded, parameterized fallback when
MySQL FULLTEXT returns no rows for newly inserted content. Results are ranked from matching real
terms, titles are weighted above body/content, and voice knowledge remains scoped to active sources
and any allowlist. The fallback fixes the real-MySQL retrieval failures without inventing knowledge.

Customer erasure deletes customer-linked Memory Notes within the anonymization transaction and
audits only the deletion count. Per-customer and Business Memory reads hide legacy notes tied to an
already-erased placeholder; note updates/deletes are refused for those records. Real-MySQL
erasure/Memory Notes coverage passes **2 suites / 16 tests**, VoiceCallService passes **1 suite /
60 tests**, and full backend Jest passes **420/420 suites, 2,598/2,598 tests**. Backend/frontend
typechecks and touched-file lint pass; scoped `git diff --check` is clean. No migration,
browser/provider QA, commit or push. The five-agent spec and production acceptance remain incomplete.

## Five Specialized AI Agents — reject post-erasure customer writes (2026-10-25)

POS order creation validates submitted customer IDs inside the transaction and rejects erased or
missing customers before writing an order. Loyalty enrollment and new memberships also refuse
erased customer placeholders, while historical financial/order records remain intact. Real-MySQL
POS, loyalty and membership coverage passes **3 suites / 35 tests**. The Voice Tracking numbers DB
suite passes **1 suite / 2 tests** after call SID fixtures switched to UUIDs to avoid collisions from
short timestamp suffixes.

Backend/frontend typechecks and touched-file lint pass; the full backend Jest run passes **420/420
suites, 2,601/2,601 tests**. No migration, browser/provider QA, commit or push. The five-agent spec
and production acceptance remain incomplete.

## Five Specialized AI Agents — completed-sale Customer Agent review and erased-profile analytics (2026-10-25)

The optional Customer Agent completed-sale review described above is a canonical, aggregate-only
event path: it rechecks the committed sale, tenant, customer erasure state, module and policies,
and coalesces reviews by business UTC day. It does not invoke an LLM or send customer messages.

The shared Analytics customer-summary, cohort, cohort-customer, KPI new-customer and
new-versus-returning paths now exclude anonymized `erased-` profiles. Historical order and
financial records remain retained; they no longer cause anonymized identities to appear as
active Customer Analytics records. A real-MySQL regression proves the surfaces are unchanged by
adding an erased profile plus completed order.

Focused MySQL coverage passes **3 suites / 33 tests**. Backend/frontend `tsc --noEmit` pass;
touched-file ESLint passes with existing Prettier-only noise disabled. Full backend Jest passes
**422/422 suites, 2,623/2,623 tests**. No migration, browser/provider QA, commit or push. This is
one additional Customer Agent/erasure-hardening slice; the five-agent specification remains
incomplete and is not production accepted.

## Five Specialized AI Agents — reject queued Customer reviews after erasure (2026-10-25)

Customer lapsed-event jobs now query through the shared erased-profile exclusion. Delivery-failure
and no-show workers inspect their currently linked customer before handing the event to the CRM
review service; those review methods independently recheck the erased marker before persisting a
run. This closes the queue-delay case where the event was valid when enqueued but the customer was
erased before the worker ran, and it prevents direct method retries from recreating those reviews.

Real-MySQL coverage verifies lapsed, failed-delivery and no-show jobs do not invoke review creation
after erasure, plus direct service retries return no new run. Focused coverage passes **2 suites /
11 tests**; backend/frontend `tsc --noEmit` and touched-file ESLint pass. Full backend Jest passes
**422/422 suites, 2,623/2,623 tests**. No migration, browser/provider QA, commit or push. This
addresses one Customer Agent erasure/replay gap only; the full five-agent scope remains incomplete
and is not production accepted.

## Five Specialized AI Agents — business-scoped Customer aggregate event references (2026-10-25)

Lapsed-customer and completed-sale event reviews use a business-wide Customer Analytics summary
coalesced by UTC day. Their saved source references now point to that business/day aggregate rather
than the first ActivityEvent or Order that happened to enqueue the review. The original source
record is still checked for eligibility before the aggregate review starts, but its customer-linked
identifier is not persisted as if it represented the whole aggregate.

Real-MySQL Customer event and Customer Intelligence specs pass **2 suites / 11 tests**. Backend and
frontend `tsc --noEmit`, touched-file ESLint and the full backend Jest run pass (**422/422 suites,
2,623/2,623 tests**, one worker). No migration, browser/provider QA, commit or push. This reduces
unnecessary linkage in aggregate review traces only; broader specialist actions/approvals,
agent-specific acceptance gaps and production QA remain open.

## Five Specialized AI Agents — Commerce RFQ award approval (2026-10-25)

The Commerce Agent now supports an approval-gated RFQ quote award. A normalized, version-bound
request must be approved or rejected with a reason by a different authorized user. Approval
rechecks the current pause policy and calls the canonical RFQ award service, which creates only a
draft purchase order: it does not contact the supplier or change stock. Idempotency and audit
records prevent duplicate requests and record decisions. If execution is interrupted, canonical
RFQ state is reconciled instead of blindly repeating an uncertain award.

Real-MySQL Commerce Agent and RFQ suites pass **2 suites / 32 tests**. Backend/frontend
`tsc --noEmit`, touched-file ESLint and full backend Jest pass (**422/422 suites, 2,625/2,625
tests**, one worker). The logged-in QA route loaded, but the approve/reject interaction and browser
console/network inspection remain unverified. No migration, commit or push. This closes one
Commerce action path only; a shared generic specialist action lifecycle and remaining specialist
contracts/production acceptance remain open.

## Five Specialized AI Agents — Action Center Commerce approval handoff (2026-10-25)

Pending Commerce Agent RFQ quote awards are now synthesized into the existing Dashboard Action
Center with a deep link to the exact tool run. A different user may decide with a reason through
the canonical Commerce Agent endpoint; the Action Center does not implement a second approval
engine. Generic completion, dismissal or snoozing is rejected for this approval item. The queue
shows only a short summary and does not expose quote or customer details.

Real-MySQL Action Center spec passes **1 suite / 3 tests**. Backend/frontend `tsc --noEmit`, lint on
the touched backend/frontend code, scoped `git diff --check`, and full backend Jest pass (**422/422
suites, 2,626/2,626 tests**, one worker). Browser QA confirms the Action Center loads for the QA
business with no console warning/error logs, but that business had no pending Commerce approval;
the approval interaction and network trace remain unverified. No migration, commit or push. This is
the first central Action Center handoff for a specialist material action, not the complete shared
action lifecycle or production acceptance of the five-agent system.

## Five Specialized AI Agents — Commerce Agent read-only question flow (2026-10-25)

Agents & Tools now supports a bounded question flow backed by six static read-only Commerce tool
schemas. Tool selection is rechecked against the registry and autonomy policy, execution uses the
canonical tenant-scoped tool service, every attempt is attributed and audited, and no draft or
write tools are available. Calls are limited to three per question and result payloads are capped;
the specialist run stores only a SHA-256 of the question. Structured tool-use/result messages
remain subject to the existing specialist request and cost reservations using their serialized
size as the conservative input bound.

Focused real-MySQL coverage passes **2 suites / 25 tests**. Both type checks pass. Frontend ESLint
passes; backend ESLint passes with the existing Prettier-only baseline disabled (one unrelated
format finding remains at `ai-infra.service.ts:533`). The full backend Jest rerun passes **422/422
suites, 2,629/2,629 tests**. The QA business's Agents & Tools page loaded, but no live provider call
was made because the Anthropic balance is metered; browser console and network logs were not
inspected. No migration, commit or push. This does not complete or establish production acceptance
of the five-agent specification.

## Five Specialized AI Agents — Inventory transfer approval in Action Center (2026-10-25)

Pending Inventory Intelligence branch-transfer drafts are now synthesized into the existing Action
Center with a distinct action type. The read path uses an explicit source-business filter and only
the Inventory Intelligence recommendation relation. Dedicated approval routes require
`STOCK_TRANSFERS_APPROVE`; they delegate to the canonical `StockTransfersService`. Generic
complete/dismiss/snooze is refused. Approval validates that the destination has a matching SKU and
only marks the transfer approved (no stock movement); rejection requires a reason stored with the
transfer record. The item is hidden if Inventory or Branches is disabled. The enum extension is
tracked in the hand-written, locally applied migration
`20261025140000_inventory_agent_transfer_action_center`.

Real-MySQL test coverage passes for source-tenant visibility, cross-tenant refusal, generic action
refusal, approved-without-shipping behavior and reasoned rejection. Full backend Jest passes
**423/423 suites and 2,630/2,630 tests**, and both backend/frontend typechecks plus touched-file lint
pass. The logged-in QA Action Center page loaded and showed the new type in its filter; the browser
console had no warnings or errors. No pending Inventory transfer existed in that QA business, so
the UI approval interaction and browser network trace remain unverified. No live provider request,
commit or push. This is one handoff slice, not completion or production acceptance of the full
specialist-agent contract.

## Five Specialized AI Agents — Commerce event-triggered decision reviews (2026-10-26)

Two optional Commerce events now queue the existing deterministic read-only Commerce review: a
merchant's final Experiment Lab decision, and a completed provider reconciliation that found one or
more listing discrepancies. Both are default-off owner policies. Workers recheck the active
business, module selection, specialist/event switches, autonomy and current canonical record state;
the reconciliation path also pins the saved run timestamp. Both use event-scoped idempotency and
never make a provider call or mutate the source record. The reconciliation producer queues only
after the saved check is complete and does not let Redis failure undo that check.

The focused producer/worker/MySQL coverage passes **3 suites / 18 tests**; backend/frontend
typechecks and touched backend ESLint pass. Full Jest passes **423/424 suites and 2,639/2,640
tests**, with the unrelated Voice number-fees test passing in isolation (**1 suite / 2 tests**) after
its 5-second full-suite timeout. No migration, browser QA, provider call, commit or push. These add
two event paths; the broader action lifecycle, remaining agent-specific capabilities and production
acceptance are still open.


## Commerce Agent supplier-claim approval (2026-10-26)

Added a version-bound supplier-claim submission request requiring a different authorized reviewer.
The canonical claims service rechecks evidence/version; approval records submission for follow-up
without contacting a supplier. Decisions are audited and interrupted approval runs reconcile from
canonical claim state. Focused real-MySQL coverage passes **1 suite / 25 tests**; backend/frontend
typechecks and touched-file lint pass; full backend Jest passes **424/424 suites, 2,642/2,642
tests** with one worker. Browser approval QA remains blocked at login because the available local
accounts did not authenticate as a business. No migration, provider call, commit or push. This is a
single Commerce Agent handoff, not completion or production acceptance of the five-agent system.


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

## Finance Agent — approved-return evidence and event review (2026-10-27)

Profit Analytics now reports the current month’s canonical approved Return counts and refund amounts
by recorded method in a separate card. It uses `Return.updatedAt` because the model has no dedicated
approval timestamp. The amounts are not deducted from the existing P&L and do not prove provider
settlement or cash payout. Evidence retains the aggregate source and calculation, without copying
return reasons or IDs.

After a canonical return approval, an owner-controlled default-off setting can queue one read-only
Finance review per business per UTC day. Queue failure does not undo the return. The worker checks
the same-business approved record and exact approval-time `updatedAt`, module and agent settings, and
idempotency before running; event reviews skip AI. The manual review card shows real test-business
data after creating and approving a cash return.

Real-MySQL Finance and Returns specs pass; the full backend Jest run passes **425/425 suites and
2,658/2,658 tests**. Backend/frontend `tsc --noEmit`, frontend ESLint, backend ESLint with the
Prettier rule disabled, and the backend production build pass. Standard backend ESLint still reports
Prettier-only findings in shared/previously compact files; no unrelated file-wide formatting was
applied. Isolated Playwright passes **1/1**: it creates an isolated QA business, product sale and
return, approves the return, runs the review, verifies the amount/method and caveat, and checks for
browser errors and API 5xx responses. Provider credentials were blocked, so no paid AI/payment call
was made. No migration, commit or push. Finance-owned ledger, bank reconciliation, A/R/AP, budgets
and close controls remain unavailable; this does not complete or production-accept the five-agent
specification.

## Five Specialized AI Agents — prompt injection boundary and browser QA (2026-10-27)

Added a shared prompt policy for all five specialists: user questions, canonical business records,
tenant configuration, retrieved/provider data and tool results are explicitly treated as untrusted
content and cannot change the allowed tools, permissions or approval requirements. Values are
serialized as labeled JSON data, with safe handling for BigInt and unserializable objects. Added
regression coverage across SEO, Inventory, Finance, Customer and Commerce agent flows.

Focused real-MySQL and utility coverage passes **6 suites / 47 tests**. Backend and frontend
`tsc --noEmit`, production backend build and touched-file backend ESLint pass (Prettier-only checks
disabled on already compact files). Full backend Jest passes **2,658/2,660 tests across 425
completed suites**; the only failure was a database-load timeout in the unrelated Health Score
snapshot suite, which passes alone (**1 suite / 3 tests**). Isolated Playwright browser QA passes
**5/5** for the Commerce, Finance, Inventory, SEO and Customer/handoff flows; screenshots were
visually inspected. The QA launcher blocked paid-provider credentials and was stopped afterward.
No migration, provider call, commit or push. This closes one cross-agent prompt-boundary gap; the
five-agent specification is not complete or production-accepted.

## Five Specialized AI Agents — Inventory lead-time sensitivity (2026-10-27)

Inventory reorder analysis now adds a separate historical lead-time sensitivity scenario when the
same product/supplier has at least three completed purchase orders in the prior year and recorded
sales velocity is positive. It uses the median observed elapsed time and leaves the existing
14-day purchase suggestion unchanged. With insufficient history, the UI explicitly says the
scenario is not calculated and reports the real matching-order count; this is not a supplier
promise or forecast. The output includes the formula version for auditability.

The real-MySQL Inventory spec passes **1 suite / 11 tests**; the Procurement handoff regression
spec passes **1 suite / 10 tests**. Backend and frontend `tsc --noEmit`, focused touched-file ESLint,
and the backend production build pass. Full backend Jest passes **426/426 suites and 2,660/2,660
tests**. Isolated Playwright passes **1/1** for Inventory analysis and Procurement handoff in a
new QA business; assertions verify the no-history disclosure and the run checks for browser errors
and API 5xx responses. The temporary API/Redis test services were stopped; no external provider or
migration was used. No commit or push. This is one Inventory-agent improvement, not completion or
production acceptance of the five-agent specification.

## Five Specialized AI Agents — Commerce order fulfillment readiness (2026-10-27)

The Commerce Agent can now orchestrate a tenant-scoped, read-only order check followed by the
canonical fulfillment-route evaluation. Both child runs share a correlation ID and their IDs are
recorded in the parent result. Missing and cross-business orders stop before route evaluation;
replays do not create duplicate child runs. The bounded output includes real eligible route nodes,
line checks and the existing recommendation, while excluding item names and SKUs. This does not
assign a route, reserve stock, mutate the order, contact a carrier or promise delivery.

Real-MySQL Commerce coverage passes **1 suite / 13 tests**. Backend/frontend `tsc --noEmit`,
touched-file ESLint and the backend production build pass. Isolated Playwright passes **1/1** against
a separate QA business; it creates a real test order and fulfillment node/mapping, confirms the
recommendation and unchanged order status, and reports no page errors or API 5xx responses. Full
backend Jest passes **426/426 suites and 2,662/2,662 tests**. No migration, provider call, commit or
push. This adds one read-only orchestration path; the five-agent specification remains incomplete
and is not production accepted.

## Five Specialized AI Agents — Search Console evidence for SEO Agent (2026-10-28)

Added a read-only Google Search Console connection for accessible-property listing and property-level
28-day performance snapshots. The selected property is revalidated before each sync, stored snapshots
are tenant-scoped, and the SEO report and specialist review consume the saved clicks/impressions
without inferring causes. Search Console query strings and page URLs are not requested or persisted.
When no account/property/snapshot is connected, the UI says so and continues to mark the data as not
tracked; analytics attribution and backlink data remain unsupported.

The hand-written MySQL migration is applied locally; `prisma migrate status` reports all 220
migrations applied. The connector, real-MySQL service and report coverage pass **3 suites / 10 tests**.
Backend/frontend `tsc --noEmit` and touched-file ESLint pass. Browser QA confirms SEO Settings and
Reports load in the isolated QA business, show the truthful not-connected/not-tracked state, and have
no browser console errors. No connected Google account was available, so OAuth consent and live
property sync remain unverified.

The full backend Jest run finished **426/428 suites and 2,667/2,670 tests**. The failures were the
existing Health Score snapshot and Voice number-fees DB suites; isolated reruns also timed out in the
shared local DB, which currently contains over 1,000 businesses and produces Prisma engine
disconnects in those tests. No provider call, commit or push. This closes one SEO evidence gap only;
the five-agent specification is not complete or production accepted.

## Five Specialized AI Agents — full backend regression checkpoint (2026-10-28)

The latest full backend Jest run passes **428/428 suites and 2,670/2,670 tests** with two workers.
To keep integration specs focused on their own fixtures as the shared local database grows, the
Health Score snapshot and Review Reminders processors now accept an optional business-ID scope for
direct test invocation; their scheduled production entry points still omit it and process all
businesses as before. The Voice number-fees real-MySQL suite has a longer timeout for its actual
database work. Backend `tsc --noEmit` passes. No provider call, commit or push. This verifies the
current backend regression suite; it does not close the agent-specific capability, external account,
live-provider or production acceptance gaps recorded elsewhere in this audit.

## Finance Agent — branch-aware cash projection (2026-10-28)

The cash projection now accepts an explicitly selected branch and aggregates only that branch group's
real orders, expenses and recurring obligations. It validates branch membership before querying and
rejects mixed-currency scopes instead of summing unlike amounts. Finance Agent requests pass their
selected branch through to this existing forecast service. This remains an operating cash-flow
projection from recorded business transactions, not a bank balance or reconciled ledger.

Focused real-MySQL Finance coverage passes **2 suites / 16 tests**. Backend and frontend
`tsc --noEmit` and ESLint on the six touched Finance files pass. The full backend Jest run passes
**428/428 suites and 2,672/2,672 tests** with two workers. No migration, live provider call, commit or
push. Finance-owned ledger, bank reconciliation, A/R/AP, budgets and period-close controls remain
unavailable; external accounting provider authorization and reconciliation have not been verified.
This closes a branch-scope gap only and does not complete or production-accept the five-agent
specification.

## Finance Agent — external Xero open-item summary (2026-10-28)

Added an optional read-only Xero invoice summary to the existing Finance Intelligence review. It
reads authorized customer invoices and supplier bills, groups amounts by currency and due-date
aging bucket, limits pagination and discloses partial results if that limit is reached. It strips
contact details and provider identifiers, does not reconcile invoices or combine Xero organizations
across branches, and never changes the existing Profit Analytics formulas. Xero OAuth now requests
the granular invoice and contact scopes; businesses with an older authorization must reconnect to
grant the new scopes. See the [Xero Accounting Invoices API](https://developer.xero.com/documentation/api/accounting/invoices)
and [granular scopes guidance](https://developer.xero.com/faq/granular-scopes).

Focused connector/service/Finance coverage passes **3 suites / 16 tests**. Backend and frontend
`tsc --noEmit`, touched-file ESLint, and the full backend Jest run pass (**430/430 suites and
2,677/2,677 tests**). Local browser QA opened Profit & Analytics under the QA login; the page
rendered and no console errors or warnings were captured. No saved Finance review was run in the
browser because that action can send the selected business snapshot to the configured AI provider.
Consequently, the Xero card’s browser rendering and a connected organization’s live response remain
unverified; no Xero provider call was made. No migration, commit or push. Native finance ledger,
bank reconciliation, budgets, Finance-owned A/R/AP subledgers and period-close controls remain
unavailable. This adds an external read-only data source, not production acceptance or completion
of the five-agent specification.

## Finance Agent — on-demand Xero check without paid AI (2026-10-28)

Added `GET /profit/xero-open-items` and a user-triggered panel on Profit Overview. The check reads
only the current business's authorized Xero invoices and supplier bills, and reports the real
not-connected/provider-unavailable state. It does not call AI or create a saved Finance Agent run.
The panel links to Integrations for connection setup. Browser QA in the isolated QA business showed
the truthful Xero-not-connected message and no browser console errors or warnings; no live Xero
request was possible because that business has no Xero authorization.

Focused real-MySQL/connector coverage passes **3 suites / 17 tests**. Backend type-check and watch
compile pass; frontend `tsc --noEmit` passes after moving aside stale generated Next route types;
touched-file ESLint passes; full backend Jest passes **430/430 suites and 2,678/2,678 tests**.
No migration, provider call, commit or push. Finance-owned ledger, bank reconciliation, budgets,
Finance-owned A/R/AP subledgers and period-close controls remain unavailable. This removes the need
to spend AI credits just to inspect Xero connection/data status; it does not complete or
production-accept the five-agent specification.

## Specialist operations — current-month AI budget visibility (2026-10-28)

AI & Governance now shows each specialist's current UTC-month AI request count and estimated spend
beside the configured request and spend limits. The view uses the same shared agent-to-policy/AI-kind
mapping as enforcement. Request counts include reserved, provider-failed and abandoned attempts.
Spend mirrors the guard: successful calls are estimated from returned Haiku 4.5 token counts, while
pending or failed calls retain their conservative maximum reservation. This remains an application
estimate, not a provider invoice. Older API responses without this field display “Budget usage
unavailable” rather than crashing the settings page.

The real-MySQL AI Settings spec passes **1 suite / 4 tests**, including current-business isolation,
policy limits, successful token cost and pending/failed reservations. Backend and frontend
`tsc --noEmit`, the backend production build, touched-file ESLint and `git diff --check` pass. The
full backend Jest suite passes **431/431 suites and 2,681/2,681 tests**. Browser QA in a freshly
created isolated E2E QA business shows the column for all five agents; the API returns 200 and the
page has no browser errors. No provider call, migration, commit or push. This improves budget
visibility but does not complete or production-accept the five-agent specification.

## Specialist operations — successful provider latency (2026-10-28)

`AiCallLog` now records the successful provider round-trip duration for AI text/message and image
requests. The Specialist Agent Operations table reports per-agent p50/p95 provider latency from
linked successful AI calls, separately from full saved-run latency. Its disclosure clarifies that
failed calls, local processing, queue wait, and per-tool/action timing are not included. Historical
rows remain nullable and are not backfilled or estimated.

The hand-written nullable-column migration `20261028130000_specialist_provider_latency` is applied
to the local MySQL database; `information_schema.columns` confirms `provider_latency_ms` exists and
is nullable, and Prisma reports the database up to date with 221 migrations. Focused real-MySQL AI
logging and operations coverage passes **2 suites / 21 tests**. Backend and frontend
`tsc --noEmit`, touched-file ESLint, and the full backend Jest run pass (**430/430 suites and
2,678/2,678 tests**). Browser QA at `/assistant/settings` shows the new column for all five agents;
the isolated business has no successful provider calls, so the UI says “No successful provider call
measured.” No browser console warnings/errors or live AI provider call. No commit or push.

## AI provider outcomes and model-cost guard (2026-10-28)

The prior nullable `AiCallLog.providerCallSucceeded` migration
`20261028150000_specialist_provider_outcomes` is applied locally; `prisma migrate status` reports
222 migrations and an up-to-date schema. Specialist Operations now has a durable failed-provider
attempt count alongside successful provider latency. Failure logs store no prompt/error content and
do not claim token usage or cost when the provider returns no usage data.

Image attachments now use the configured Claude Haiku 4.5 vision-capable model, shared with the
existing AI cost estimator. The old `claude-3-haiku-20240307` override is retired. AI Infra rejects
other unpriced model overrides before making a provider request, so cost caps cannot silently apply
the Haiku 4.5 rate to an unknown model. These are still app estimates from returned token counts,
not Anthropic invoices; provider-side discounts, cache usage and any charges not represented in the
response remain outside this estimate. Anthropic lists Haiku 4.5 at $1/$5 per million input/output
tokens and supports image input; its model retirement date is “not sooner than October 15, 2026”
([pricing](https://platform.claude.com/docs/en/about-claude/pricing),
[Haiku 4.5 overview](https://platform.claude.com/docs/en/models/haiku-4-5/overview),
[model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)).

Focused real-MySQL AI/assistant coverage passes **3 suites / 23 tests**. Backend and frontend
`tsc --noEmit` pass; ESLint passes on the changed AI, attachment, digitizer and test files. The full
backend Jest run passes **431/431 suites and 2,681/2,681 tests** with one worker. Browser QA shows
the Specialist Agent Operations screen loading with no console warnings/errors; the QA business has
no live provider attempts, so no paid provider request was made. A prior full-suite run exposed a
collision in the Voice callback spec's short timestamp-based phone fixture; that fixture now uses a
high-entropy test number and passes alone and in the full run. No new migration for this change, no
commit or push. This improves provider observability/model-cost safety but does not complete or
production-accept the five-agent specification.

## Finance Agent — approved monthly budgets against recorded expenses (2026-10-28)

Added FinanceBudget revisions with draft, pending-approval, approved and rejected states, a required
review reason, reviewer identity and audited controller actions. Profit Overview now lets authorized
users save a monthly category budget, submit it for review and record a decision. The comparison
uses canonical `Expense` rows for the selected month and stored category, with decimal arithmetic
and business currency. It discloses that expenses have no branch attribution and that this is not a
general ledger or reconciled accounting statement. Existing Profit Analytics formulas were not
changed; the saved Financial Intelligence review reuses those formulas and includes the approved
budget/actual comparison as evidence. A real-MySQL spec verifies month and tenant isolation,
revision transitions, reviewer reason and actual/variance calculations.

Hand-written migration `20261028180000_finance_budget_approval_actuals` is applied locally; Prisma
reports all 223 migrations up to date. Backend and frontend `tsc --noEmit` pass; touched-file ESLint
passes. The full backend Jest run passes **432/432 suites and 2,683/2,683 tests**. Browser QA in a
fresh isolated E2E business passed save → submit → approve against a real expense row, displaying
the recorded amount and resulting variance with no browser console errors or HTTP 5xx responses.
The first browser attempt exposed an older compiled backend on port 5001. It was replaced with the
current source dev server on that same port; the final browser test passed through the normal app
proxy without a test-only API override. No paid AI/provider request, commit or push was made. This
adds a limited monthly expense budget workflow; it does not add a finance ledger, bank
reconciliation, receivables/payables,
or period close, and it does not complete the five-agent specification. Procurement disclosures now
distinguish these Expense budgets from procurement purchase-order commitments and canonical vendor
invoice matching, which remain unconnected/unavailable. After this wording clarification, backend
type-check and touched-file ESLint pass, and focused Procurement, Finance Budget, Financial
Intelligence and Settings Hub tests pass **4 suites / 35 tests**.

## Finance Agent — source-record Period Close Readiness (2026-10-28)

Added a read-only `/profit/period-close` checklist backed by canonical monthly Order, Expense,
pending Return and Integration rows. Branches remain separate with their current configured
currency; the view does not add unlike currencies. Sales values are labeled as order totals rather
than cash settlement. Expenses without a linked receipt are described as evidence to review, not
invalid expenses. Xero sync counts appear only when that business has a connected Xero integration;
otherwise no sync backlog is inferred. The page explicitly stays partial and marks the finance-owned
ledger/journal checks, bank reconciliation and authoritative period-close transition unavailable.
It cannot post or close a period and does not claim that a month is reconciled.

The real-MySQL spec verifies period filtering, quotation exclusion, branch/tenant isolation,
completed/open orders, expense evidence, pending returns, and connected-Xero sync counting. The
isolated browser run creates a QA business with a real sale, expense and pending return, checks the
rendered values and unsupported states, then checks a prior empty month; there are no console errors
or API 5xx responses. Backend/frontend `tsc --noEmit`, touched-file ESLint and the full backend
Jest run pass (**433/433 suites, 2,685/2,685 tests**). No migration, provider request, commit or push.
At this checkpoint the screen supplied source-record close preparation only; the subsequent Finance
Agent journal-ledger progress entry below adds manual journal checks and a Noxtill-only posting lock.
Bank reconciliation, accounting subledgers and an authoritative close remain unavailable, so the
five-agent specification is not 100% complete or production-accepted.

## Finance Agent — manual journal ledger and close readiness (2026-10-28)

Added a business-entered chart of accounts and a single-currency manual journal ledger. Drafts require
2–100 lines with exactly one positive debit or credit per line and balanced decimal totals. Journals
move through draft, second-person approval/rejection with a required reason, and posting by the
reviewer; every journal transition and period lock is audited. A month can be locked only after no
draft, pending or approved journals remain. Tenant-scoped service queries and composite database
foreign keys prevent a journal line from using another business's account. No sample accounts or
opening balances are inserted.

The `/profit/journals` screen prepares, submits and posts manual journals. Period Close Readiness now
checks recorded posted journal lines against stored totals and reports actual balanced/unbalanced,
unresolved and posting-lock state per business. These are Noxtill manual rows only; they do not
represent a complete trial balance, automatic order/expense postings, bank reconciliation, Xero
journals, A/R or A/P subledgers, tax books, or a certified statutory close. Those limits remain
explicit in both screens.

The hand-written migration `20261028190000_finance_manual_journal_ledger` was applied locally;
Prisma migration status is up to date and information-schema foreign keys were verified. Real-MySQL
journal and period-close specs pass **2 suites / 8 tests**. A second hand-written migration,
`20261028220000_finance_journal_reversals`, adds a business-scoped self-reference for reversals; it
is applied locally, the relation is verified in `information_schema`, and Prisma reports all 225
migrations up to date. A correction now creates an audited reversing draft with debit/credit lines
swapped; the original remains posted and unchanged, and the reversal must pass the existing
second-person approval and reviewer-posting steps. A locked current period refuses the reversal
draft. The journal page also shows a real, month-filtered account activity summary split by stored
currency, excluding drafts and showing net debit/credit activity without presenting it as an ending
balance or full trial balance. Backend/frontend `tsc --noEmit` and touched-file ESLint pass. The
browser flow passed account creation → journal draft → separate approval → posting → reversing
draft → separate approval → posting, and confirmed the activity totals update from the posted rows,
with no captured console errors or API 5xx responses. Real-MySQL journal and period-close specs pass
**2 suites / 9 tests**. Full backend Jest passes **434/434 suites and 2,692/2,692 tests**.
`git diff --check` passes on this Finance slice; the whole worktree still reports an unrelated
existing extra blank line at
`backend/src/marketing/automations/workflows.constants.ts:56`. No provider calls, commit or push.
This is a Finance foundation slice, not completion or production acceptance of the five-agent
specification.

## Finance Agent — historical expense anomaly review cues (2026-10-28)

Saved Financial Intelligence reviews now include a bounded, category-level review cue from
recorded `Expense` rows. A category is considered only when at least four prior comparable months
contain recorded entries; missing months are not assumed to be zero. For the selected complete
month (or month-to-date for the current month), the service compares the recorded total with the
historical median plus three times the median absolute deviation and stores the baseline, threshold,
current amount and excess as evidence. The cue is explicitly heuristic: it is not a calibrated
probability, fraud finding, accounting conclusion or statement of cause. The Finance Overview
displays the evidence and links a current-business/category row to canonical Expenses filtered to
the selected month and stored category. Cross-business rows direct the operator to switch scope
before reviewing; this does not change expense records.

The real-MySQL Finance Agent spec passes **1 suite / 13 tests**, including baseline math, sparse
history exclusion and tenant isolation. Backend and frontend `tsc --noEmit`, touched-file ESLint and
`git diff --check` pass. Full backend Jest passes **434/434 suites and 2,693/2,693 tests**. The
Finance Agent Playwright flow passes **1/1** against a new isolated QA business, with the Finance AI
toggle disabled before running the real database review; it verifies the calculated category cue,
the review disclosure, and the filtered Expenses list with no browser errors or API 5xx responses
and made no provider call. No migration, commit or push. Bank-statement reconciliation, accounting
subledgers and a certified accounting close remain unavailable; this does not complete or
production-accept the five-agent specification.

## Inventory Agent — empirical demand backtest and range (2026-10-29)

Reorder Suggestions now keeps its existing recent 8-week mean as the point estimate and separately
reviews up to 52 weeks of recorded stock-movement sales. It computes rolling one-week-ahead errors
from prior 8-week baselines, derives a nominal 80% empirical interval from older errors, and checks
that interval against the newest 8 forecast windows as a holdout. The displayed evidence includes
the historical range, calibration-window count, holdout coverage and mean absolute error. It is
available only with all 52 weeks present and at least 26 weeks containing recorded sales; sparse
history is explicitly reported as unavailable. The interface calls the range historical and
empirical, not a guarantee or calibrated confidence interval. Stockouts, promotions, seasonality
and market changes are not modeled, so the result is not a demand guarantee.

The real-MySQL Inventory spec passes **1 suite / 11 tests**. Backend and frontend `tsc --noEmit`,
touched-file ESLint and full backend Jest pass (**434 suites / 2,693 tests**). The Inventory browser
flow passes **1/1** against the isolated E2E business, with its Inventory AI toggle disabled before
the review; the page/API checks pass without calling a paid provider. No migration, commit or push.
This adds historical backtest evidence and a data-gated range; it does not complete or
production-accept the Inventory Agent or the five-agent specification.

## SEO Agent — Search Console tracked-keyword evidence (2026-10-29)

Keyword Intelligence now shows Google Search Console observations for exact matches against the
business's tracked keywords. Raw unmatched query strings and page URLs are not retained. The view
distinguishes a provider-reported value from a term that Google did not return; it never turns an
omitted query into zero. If Search Console is not connected or has no selected property/snapshot,
the page states that directly and links to SEO Settings.

The hand-written MySQL migration `20261029110000_seo_gsc_keyword_snapshots` is applied locally;
both the business foreign key and composite tracked-keyword/business foreign key were verified in
`information_schema`, and Prisma reports the schema up to date. Connector and real-MySQL specs
verify exact matching, omission handling, tenant isolation and that unmatched query text is not
stored or returned. Backend/frontend `tsc --noEmit`, touched-file ESLint and the full backend Jest
run pass (**434 suites / 2,696 tests**). Isolated Playwright QA signs into a new QA business, creates
a real tracked keyword and verifies the disconnected Search Console disclosure on
`/marketing/seo-autopilot/keywords`; no browser console errors or API 5xx responses occurred. No
provider call, commit or push. A second isolated browser run seeded synthetic QA-only snapshots in
a separate QA business and verified that reported clicks/impressions render while an omitted term
says “Not reported” (not zero); it also had no browser errors or API 5xx responses. OAuth consent
and live property sync remain unverified because no connected Search Console account was available.
This closes one SEO evidence gap only; the five-agent specification remains incomplete and is not
production accepted.

## Finance Agent — Period Close readiness evidence in saved reviews (2026-10-29)

Each new Financial Intelligence review now embeds the canonical `FinancePeriodCloseService.readiness`
result for the selected month and branch scope. It records per-business source counts and lock state
for sales, expenses, pending returns, manual Noxtill journals and Xero sync activity, plus the
service's real partial-coverage and unavailable-source disclosures. The saved recommendation cites
the source fields and calculation; the Finance Overview renders the saved breakdown and links to the
canonical Period Close page. This does not create a second accounting formula, post a journal,
reconcile a bank/provider balance or certify a close. Older saved reviews without this snapshot are
identified as needing a new review.

The real-MySQL Finance Agent spec passes **1 suite / 13 tests**, including tenant scope and saved
readiness evidence. Backend/frontend `tsc --noEmit`, touched-file ESLint and `git diff --check` pass;
full backend Jest passes **435 suites / 2,697 tests**. Browser QA confirms `/profit` loads in the
isolated QA business and its empty saved-review state is rendered; the saved readiness panel itself
was not exercised in-browser because doing so requires a Finance Agent run and may incur an AI
provider charge. No migration, provider call, commit or push. Bank reconciliation, accounting
subledgers, automatic postings and a certified close remain unavailable; the five-agent
specification is still incomplete and not production accepted.

## Customer Insights — correct lifecycle and value disclosures (2026-10-29)

Customer Insights no longer calls a simple all-profile last-visit-within-90-days ratio “retention,”
or describes fixed CRM lifecycle bands as each customer's personal visit cadence. The screen now
shows the actual numerator/denominator and states that the 90-day activity ratio is not cohort
retention. Lifecycle follow-up is labeled as a fixed 45/90/180-day review cue, not churn risk. Visit
interval is described as a proxy from profile creation, `lastVisitAt` and `visitCount`; spend-band
totals are labeled as recorded customer lifetime spend, not revenue attribution. Empty business
data now shows unavailable metrics and an explicit no-customer empty state instead of zero averages.

Frontend `tsc --noEmit`, touched-file ESLint and `git diff --check` pass. Browser QA confirms the
empty QA business renders “Not available” for averages, the explicit no-customer state, and the
corrected metric labels with no console errors. No backend behavior, migration, provider call,
commit or push. This clarifies CRM metrics; it does not add a calibrated retention model or complete
the five-agent specification.

## Inventory Agent — audited reorder-finding dismissal (2026-10-29)

Saved reorder findings from a completed Inventory Agent run can now be dismissed by an authorized
owner/manager with a required 5–500 character reason. The server checks the active tenant, agent
policy, finding type, completed run and still-proposed state, then performs a conditional update and
writes the actor, reason and finding reference to the audit log in one transaction. Repeated or
cross-business dismissal is refused. Dismissing a finding does not alter stock, movements or a
purchase request. The Reorder Suggestions Agent panel uses the in-page reason dialog and displays
the saved dismissed state.

The real-MySQL Inventory Agent suite passes **1 suite / 12 tests**, including reason validation,
wrong finding type, repeated decision, tenant isolation, audit evidence and unchanged inventory.
Full backend Jest passes **435/435 suites and 2,698/2,698 tests**; backend and frontend
`tsc --noEmit` pass. Frontend ESLint passes. Backend ESLint reports only Prettier formatting
findings elsewhere in the large Inventory service/spec files; the new method and test lines have no
lint findings, and the controller passes. Browser QA confirms the Reorder Suggestions page loads in
the isolated QA business with no captured console errors. A read-only cross-agent review completed
all five specialist checks without an AI provider call; after a full page refresh, the Inventory
panel showed its saved child run and canonical zero-findings result. The earlier empty view was stale
page data, not a tenant mismatch. Because that run had no recommendations, the new dismissal
interaction could not be exercised in-browser without creating a provider-backed finding. No
migration, provider call, commit or push. This closes one Inventory decision-history gap only; it
does not complete or production-accept the five-agent specification.

## Inventory Agent — purchase-unit conversion disclosure (2026-10-29)

Reorder findings now persist an explicit `purchaseUnitConversion: not_tracked` evidence value and
state that the proposed quantity is in whole stock units. The saved finding also tells the operator
to convert manually and check pack size and supplier minimums before submitting a request. This
matches the actual canonical Product schema, which has no purchase-unit/pack-size conversion fields;
the existing reorder formula and quantity are unchanged, and no supplier-ready conversion is
claimed.

The real-MySQL Inventory Agent suite passes **1 suite / 12 tests**, including persisted conversion
status and disclosure. Backend and frontend `tsc --noEmit` and full backend Jest pass (**435 suites /
2,698 tests**). Touched-file ESLint reports Prettier-only findings in the existing large Inventory
service/spec files; these files already contain formatting drift, and the run reported no other
rule violations. Browser QA of the page is clean, but this disclosure only appears on a reorder
finding, and the saved cross-agent run had no findings, so the new message was not visually
exercised without adding a new QA product. No migration, provider call, commit or push. This is a
safe-input disclosure, not completion of Inventory Agent or the five-agent specification.

## Inventory Agent — product purchase packs and configurable reorder baseline (2026-10-29)

Product records now optionally store stock-unit and purchase-unit labels plus an integer stock-unit
pack size. Product create/update validates the fields as an all-or-none set; service products cannot
carry stock purchasing units. The canonical Reorder Suggestions formula subtracts eligible open
purchase-order supply, then rounds the remaining suggestion up to a whole configured pack while
keeping saved Inventory and Procurement request quantities in canonical stock units. Historical
lead-time sensitivity uses the same conversion. The Inventory Agent stores the conversion status,
source fields, unrounded and rounded quantities as evidence, and now says a particular product has
no mapping only when that product is actually unconfigured; the older repository-audit note above
describes the pre-conversion schema and is superseded by this entry.

Reorder lead time is now a tenant policy at `inventory.agentReorderLeadTimeDays`, defaulting to 14
days to preserve existing behavior and bounded to 1–365 days. The canonical Reorder Suggestions
service and Inventory Agent both use it; the agent records it in the formula evidence and describes
it as a planning baseline, separately from observed historical supplier/product timing. The owner
can edit it in Settings → AI & Governance. No supplier SLA is inferred.

The hand-written Product-column migration `20261029150000_product_purchase_pack_units` is applied
locally. Prisma validates the schema and reports all 228 migrations up to date. Backend and
frontend `tsc --noEmit` pass. The focused Product, reorder, Inventory Agent, Procurement handoff and
policy specs pass **5 suites / 50 tests**; after the final corrected disclosure, the Inventory Agent
and reorder specs pass **2 suites / 19 tests**. Backend ESLint passes on the touched code with the
repository's existing Prettier-only formatting noise disabled; touched frontend ESLint passes, and
scoped `git diff --check` is clean. Full backend Jest passes **435/435 suites and 2,705/2,705
tests**. Browser inspection confirmed the Reorder Suggestions page loads with its honest empty state
in the QA business and that the AI & Governance page shows the owner-controlled 14-day row. The
product edit/create flow, settings save, browser console/network, and a data-bearing recommendation
were not exercised in this browser pass. No provider call, commit or push.

Supplier contract MOQ is still only supplier-level context and is not applied to a product
recommendation because the contract's quantity unit and product/SKU mapping are not established.
Branch reservations/in-transit supply, seasonal causes and calibrated forecasts also remain
incomplete or data-limited; this closes the product pack conversion and configurable-baseline gaps,
not the full Inventory Agent contract or Five Specialized AI Agents specification.

## Inventory Agent — product-wide minimum reorder quantity (2026-10-29)

Products can now store an optional minimum reorder quantity in canonical stock units. The reorder
suggestion first subtracts eligible open purchase-order supply, applies the product floor only to a
positive uncovered shortage, then rounds to the configured purchase pack. A fully covered need
still produces no reorder. Inventory Agent recommendations use the same calculation and preserve
the floor, incoming supply and result as evidence. Procurement handoff staleness checks now include
the configured floor, and lead-time revalidation uses the tenant's configured baseline. Supplier
contract MOQ remains separate because no reliable supplier-to-product/unit mapping is established.

The hand-written migration `20261029170000_product_minimum_reorder_qty` is applied locally and
verified in MySQL; Prisma reports all 229 migrations up to date. Backend and frontend type checks
pass. Full backend Jest passes **435/435 suites and 2,709/2,709 tests**. Focused real-MySQL specs
pass **4 suites / 41 tests**. Frontend ESLint passes; backend ESLint passes with the repository's
existing Prettier-only formatting findings disabled. Browser inspection confirmed the QA business'
Products form exposes the field and Reorder Suggestions loads its real empty state; no product was
saved. The create/edit save path, a data-bearing recommendation, and browser console/network were
not verified. No provider call, commit or push. This closes a reorder-input gap only; the five-agent
specification remains incomplete and is not production accepted.

## Inventory Agent — committed branch-transfer availability (2026-10-29)

Canonical Reorder Suggestions now account for branch-transfer state alongside open purchase orders.
Pending and approved outbound transfers are treated as source commitments; shipped outbound stock is
already deducted by the canonical transfer service. Approved or shipped inbound quantities reduce a
reorder only when the destination has exactly one active product with the matching SKU. Pending
inbound transfers and missing, inactive, non-product or ambiguous SKU matches are excluded. The
screen and export expose the relevant quantities and disclose the mapping rule.

The Inventory Agent now reuses that same transfer-aware calculation in its saved findings and
historical lead-time sensitivity. The no-reorder result and the Procurement handoff source hash also
include branch-transfer state, so a prepared draft is refused if transfer commitments change before
submission. No schema change or migration was needed.

Real-MySQL specs pass **3 suites / 34 tests**, covering transfer status treatment, unique-SKU
destination matching, and stale Procurement handoffs. Full backend Jest passes **435/435 suites and
2,711/2,711 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and scoped
`git diff --check` pass; the fabrication grep found no demo/random metrics in the touched views or
services. Prisma reports all 229 migrations up to date. Browser QA in the QA business confirms the
Reorder Suggestions page and empty state load; that business currently has no products, so populated
transfer rows were not visually tested. The available browser interface did not expose screenshots
or console/network inspection. No external provider call, commit or push. Transfer-aware reorder
coverage is improved, but the broader Inventory Agent and five-agent specification remain incomplete
and are not production accepted.

## Finance Agent — Xero bank transaction status (2026-10-29)

Added an on-demand, read-only Xero bank-transaction status check to Profit Overview and to newly
saved Finance Agent evidence. It requests Xero's `IsReconciled` flag for the last 30 UTC dates,
groups returned transaction totals by currency, and caps the read at 2,000 rows. The API response
does not expose transaction descriptions, contact details, account names, or provider IDs to the
Noxtill UI. The connector now requests the granular `accounting.banktransactions.read` scope;
existing Xero connections may need to reconnect before this scope is granted.

This is Xero's own transaction reconciliation flag only. No bank-statement feed lines are imported,
and Noxtill does not match Xero transactions to its own ledger, so it is not bank reconciliation.
The QA business has no Xero connection; browser inspection confirmed the Profit page, saved Finance
Agent evidence and the new panel load with explicit unavailable/not-connected copy. No live Xero
request was made. The browser surface did not provide console or network inspection in this pass.

Focused real-MySQL and connector specs pass **3 suites / 20 tests**. Full backend Jest passes
**436/436 suites and 2,716/2,716 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and
scoped `git diff --check` pass; fabrication grep found no hardcoded/demo numbers in the touched
views or services. No schema migration, provider call, commit or push. This closes one read-only
evidence gap only; Finance data reconciliation and the Five Specialized AI Agents specification
remain incomplete and are not production accepted.

## Finance Agent — upcoming Xero invoice due-date evidence (2026-10-29)

Extended the existing read-only Xero open-invoice summary with due-date windows for authorized
receivables and payables: due today, 1–7 days, 8–30 days, and after 30 days. Totals remain separated
by invoice currency and side. The Profit Overview labels these as invoice due dates, not confirmed
cash. The saved Finance Agent evidence records that these items are separate from its relative
CashForecastService projection and are not Noxtill ledger receivables/payables.

Focused real-MySQL/connector specs pass **3 suites / 19 tests**, including due-today, future-window,
overdue, missing-date, currency separation and paid-invoice exclusion. Full backend Jest passes
**436/436 suites and 2,716/2,716 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and
scoped `git diff --check` pass. Browser inspection confirmed the Profit page loads and discloses the
separate forecast/Xero coverage; the QA business has no Xero connection, so a live due-date result
could not be rendered or verified there. No Xero provider call, schema migration, commit or push.
This adds external due-date context only; it does not confirm collection/payment or complete the
Finance Agent's reconciliation and full-ledger requirements.

## Finance Agent — statement-line reconciliation review (2026-10-29)

Added a tenant-scoped Finance reconciliation flow. An owner or manager with journal-management
capability can import a CSV by selecting a real active Finance account and currency. The importer
accepts a strict date column and a signed amount column, ignores all other columns, and stores only
the dates, amounts, account/currency, line order, import period, count and a content hash; it never
stores the uploaded file or bank descriptions. Re-importing the same statement facts for the same
account/currency is refused.

For each line, Noxtill suggests only posted manual journal lines on the same account and currency
with the exact signed debit-minus-credit amount and a date within three calendar days. A suggestion
is not a match until a person accepts it with an audited reason. Users can also reject all
suggestions or reopen a matched or no-match line with an audited reason. Finance viewers can export
all rows from one statement review as a CSV with stored safe fields and matched journal references;
the original bank descriptions and decision notes are omitted. The workflow never edits a posted
journal or claims bank settlement. The Profit Overview and saved Finance Agent evidence now report
recent (90-day statement-period) imported counts and signed totals by currency, separating
human-accepted suggestions from unresolved lines. No imports means the evidence is explicitly
`not_imported`.

Migration `20261029200000_finance_bank_statement_reconciliation` was hand-filtered to its eight
Finance-owned statements, applied locally, and marked applied. The five new foreign keys were
verified in `information_schema`; Prisma reports all 230 migrations up to date. The real-MySQL
reconciliation and Finance Agent specs pass **2 suites / 18 tests**, including CSV export contents,
omission of imported descriptions and tenant isolation; the export also records the actor and row
count in the audit log. Full backend Jest passes
**437/437 suites and 2,721/2,721 tests**. Backend/frontend `tsc --noEmit` and touched-file ESLint
pass. Browser inspection in the `SEO Agent Approval QA` business confirmed `/profit/reconciliation`
loads and shows the real empty state: this business has no active Finance accounts or statement
imports, so an account must be added before an import can be exercised in the browser. The earlier
page/API error was caused by a stale Next dev server proxy target; after restarting Next it was
resolved. The browser surface did not provide console/network inspection. No commit or push.

This is a manual-statement-to-manual-journal suggestion workflow, not an automatic bank feed,
complete ledger reconciliation, or accounting certification. Automatic order/expense journal
postings, provider settlement evidence, and live Xero reconciliation remain outside this feature.

## Finance Agent — partial trial balance from posted manual journals (2026-10-29)

Added an as-of-date cumulative balance view sourced only from posted Noxtill manual journal lines.
Balances and debit/credit totals stay separated by currency; future-dated and unposted entries are
excluded. The result is explicitly labeled a **partial trial balance**. It discloses that opening
balances, automatic sales/expense postings, Xero journals and bank reconciliation are excluded,
and it does not claim a complete ledger or certified close. No new model or migration was needed.

The real-MySQL spec covers date filtering, draft exclusion, currency separation, totals, and invalid
dates. It passes **1 suite / 8 tests**. Full backend Jest passes **437/437 suites and 2,722/2,722
tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass.
Browser QA in the authenticated QA business confirms `/profit/journals` loads and the new panel
shows its honest empty state because that business has no posted manual journal balances. No live
financial entries were added. This closes only the posted-manual-journal balance slice; it does not
complete the Finance Agent or the Five Specialized AI Agents specification. No commit or push.

### Finance Agent — include partial balance evidence in saved reviews (2026-10-29)

Finance Intelligence reviews now read `FinanceJournalsService.trialBalanceForScope` for the
selected branch group and current UTC as-of date. The tenant scope is resolved by
`BranchScopeService`, then explicitly applied to the raw MySQL query. The run stores the returned
balance in its output and recommendation details, and records the source fields, calculation,
coverage and exclusions as evidence. The Profit Overview shows it per business and currency;
older saved reviews disclose that they predate this field. No migration was needed.

The MySQL Finance Agent spec posts a balanced fixture journal through the canonical service and
checks its balance appears in the saved review and evidence. Cleanup removes dependent journals and
accounts before deleting the fixture business. Three focused Finance suites pass (**3 suites / 27
tests**). Backend and frontend `tsc --noEmit` pass. Frontend ESLint passes; backend ESLint passes
with the existing Prettier-only findings excluded, while the repository's compact Finance specs
still report formatting-only findings. Full backend Jest passes (**437 suites / 2,723 tests**).
Browser QA confirms Profit Overview and Journals load in the authenticated QA business and show the
real empty state. The saved review in that business predates this change, so no potentially billable
AI review was triggered. This is still a partial manual-journal balance, not a complete ledger,
reconciliation or certified close. No commit or push.

## Customer Agent — staff-recorded follow-up outcomes (2026-10-29)

Customer follow-up tasks now accept a structured outcome when completed: contact attempt made,
no answer, customer response recorded, follow-up scheduled, or no contact needed. The task and
outcome are written through the existing CRM task service, and the completion/outcome is audited.
An already completed task can receive a missing outcome once; a recorded outcome cannot be silently
overwritten. The Customers page and Staff Tasks require a selection before completing through those
surfaces. Existing API clients that complete without an outcome remain supported and are counted as
"without an outcome" rather than inferred.

The Customer follow-up queue shows actual completed/recorded/unrecorded counts and per-outcome
counts over the trailing 90 days. The UI states that these are staff-entered reports, not verified
customer contact or provider-confirmed message delivery. No free-text outcome note or additional
customer PII is stored.

Migration `20261029220000_customer_follow_up_outcomes` adds the nullable outcome and a supporting
completion index. It was applied locally with `prisma db execute`, marked applied, and the column,
index and migration status were verified. The real-MySQL Customer Agent action spec passes **1 suite
/ 12 tests**, including assigned-staff authorization, audit evidence, immutable recorded outcomes,
and explicit accounting of completed tasks without a reported outcome. No external provider call,
commit or push. This improves CRM follow-up outcome measurement; it does not independently verify
contact or delivery and does not close the other four agents' integration/provider gaps.

Browser acceptance: the specialist Playwright flow passes against the rebuilt local backend and
frontend, including the Customer follow-up queue, required outcome selection in Staff Tasks, and
the saved outcome summary. It also exercises the Inventory Agent review-to-Procurement approval
handoff and asserts there are no page errors or API 5xx responses. The first run was against a stale
backend process and failed because the new summary endpoint was not loaded; rebuilding/restarting
the local API resolved it. No paid provider call was made.

## Commerce Agent — safe provider failure details and specialist browser QA (2026-10-29)

Commerce Agent questions now use the shared provider-error mapper. A low-credit response is saved
as `AI_PROVIDER_INSUFFICIENT_CREDIT` with a safe operator-facing message; raw provider response
bodies are not persisted. The browser test now turns the Commerce AI feature off and verifies the
request is refused before any provider call, instead of assuming the server has no API key.

The real-MySQL Commerce Agent spec passes **1 suite / 14 tests**, including the mapped low-credit
error and its audit record. Backend/frontend `tsc --noEmit` and touched-file ESLint pass. Browser
QA passes for the current specialist flows: Inventory/Customer, Finance, SEO, Commerce, Inventory
RFQ handoff, Inventory branch-transfer handoff, Commerce claim drafting and Commerce sourcing.
The Commerce browser flow asserts no page errors or API 5xx responses. Full backend Jest passes
**437/437 suites and 2,724/2,724 tests**. No provider request, migration, commit or push was made by
the passing browser tests.

## Specialist AI provider failure disclosures (2026-10-29)

Inventory, Finance, SEO and Customer AI summaries now use the shared provider-error mapper. An
insufficient-credit response gives the operator a clear remediation message while preserving each
agent's deterministic result; missing keys, access denial, unavailable models and rate limits are
distinguished from a generic provider failure. Typed Noxtill guardrails keep their original blocked
message. Provider response bodies and credentials are not returned or persisted. Customer AI message
draft generation also records and returns the safe provider error code/message, and explicitly
confirms that no draft was saved or sent on failure.

The mapper's unit spec passes **1 suite / 4 tests**. Six focused MySQL suites pass **56 tests**,
including Customer message-draft failure, each affected specialist summary and existing agent
guardrails. Backend/frontend `tsc --noEmit` pass. The new mapper files pass normal ESLint; touched
agent service files pass ESLint with the repository's pre-existing Prettier-only findings disabled.
Full backend Jest passes **438/438 suites and 2,728/2,728 tests** when run serially. A prior parallel
run hit one unrelated deadlock in `credit.service.spec.ts` cleanup; that suite passed alone (**19/19**)
and the serial full run was clean. No live provider call, migration, commit or push was made. The
specific credit-error UI state was verified through the real-MySQL API result; it was not exercised
in a live browser because that would require deliberately invoking an AI provider.

## Customer Agent — follow-up task message delivery link (2026-10-30)

Customer message drafts can now be explicitly linked to an open follow-up task for the same
customer and business. The relationship is stored on the canonical `MessageDraft`; drafts cannot be
linked across customers/tenants or to a completed task. The task view reads its linked drafts and
the canonical Messaging `Message` status. It labels `delivered`/`read` as provider-confirmed,
`failed` as provider-reported failure, and leaves queued/sent/draft states unconfirmed. This does not
infer contact or delivery from task completion, and staff must still review and explicitly queue a
message through the existing consent-gated send path.

Migration `20261029230000_customer_follow_up_message_link` contains the three `message_drafts`
column/index/foreign-key statements retained from `prisma migrate diff`; it was applied with
`prisma db execute`, marked applied, and verified in `information_schema`. Prisma reports all 232
migrations applied. The real-MySQL Customer Agent spec passes **1 suite / 14 tests**, including
same-customer/open-task validation and the transition from draft to queued to provider-confirmed
delivery. Backend/frontend `tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass.
Full backend Jest passes **438 suites / 2,730 tests** serially. The isolated specialist browser test
passes **1/1**, checks this linked-draft UI, and asserts no unexpected page errors or API 5xx; the
expected missing-provider response is shown clearly, and no provider call was made. The relevant
screenshot was visually inspected. No commit or push.

This closes one Customer follow-up visibility gap only. Provider delivery is still unavailable when
the messaging provider is not configured, and the Five Specialized AI Agents module remains
incomplete overall; see the agent-by-agent boundary table above.

## Commerce Agent — parent/child question trace (2026-10-30)

Read-only Commerce Agent questions now assign one correlation ID to the parent specialist run and
every registered child tool run. The ID is retained in the parent's policy snapshot, completed or
failed output and audit event, and shown beside the answer so an operator can follow the tool trace.
Child tools still recheck the current Commerce policy and execute through the existing canonical
tool gateway; the change grants no additional tool access and does not change data access or writes.

The real-MySQL Commerce Agent spec passes **1 suite / 14 tests**, including a three-tool question
whose child records all inherit the same parent trace. Backend and frontend `tsc --noEmit` pass;
touched-file ESLint passes; full backend Jest passes **438 suites / 2,730 tests** with two workers.
The isolated Commerce browser flow passes **1/1** in a separate QA business, confirms the page and
read-only review load, checks the disabled-AI disclosure, and reports no page errors or API 5xx; the
screenshots were visually inspected. No migration or external AI call was needed. The successful
answer/trace display was not exercised in the browser because that would make a paid provider
request; the disabled path was exercised instead. No commit or push.

## Commerce Agent — Product sourcing readiness orchestration (2026-10-30)

Added a bounded Product Radar → validation evidence → linked-RFQ quote comparison review to the
existing Agents & Tools page. It uses the registered `get_product_opportunity`,
`get_validation_case` and `compare_quotes` tools, enforces the existing Commerce Agent toggle and
autonomy policy, requires the RFQ to reference the exact Product Radar opportunity in the same
business, and propagates one parent correlation ID to the child tool runs. If there is no linked
RFQ, it stops with `needs_sourcing` without attempting a quote comparison. It does not create or
award an RFQ, contact a supplier, create a catalog item, change inventory or commit a purchase.

The route, form and result are in the existing Commerce agent controller, specialist service,
typed API client and `commerce-agent-tools-view.tsx`; the real-MySQL specialist spec covers the
three-worker path, shared trace, idempotent replay, and safe stop without a linked RFQ. No schema
change or migration was needed. The focused real-MySQL spec passes **1 suite / 16 tests**; backend
and frontend type checks and touched-file ESLint pass. Full backend Jest passes **438 suites / 2,732
tests**. The isolated Playwright Commerce flow passes **1/1**, verifies the page, the three completed
workers, disabled-AI disclosure, and no page errors/API 5xx. Its first run hit a stale backend build
and returned `NOT_FOUND`; rebuilding/restarting the local API resolved it, and the rerun passed.
The browser test creates clearly named QA records in its separate test business. No live AI/provider
request, commit or push was made.

This closes only a bounded sourcing-readiness orchestration slice. It does not make the Commerce
Agent or the Five Specialized AI Agents specification 100% complete; broader worker plans,
provider-confirmed execution, independent verification and outcome measurement remain partial as
listed in the agent-by-agent map above.

## Shared specialist orchestration — parent/child trace (2026-10-30)

Cross-agent review now exposes the parent run ID as its correlation ID. Each specialist child stores
that same ID in its parent-run reference, the persisted parent result exposes it, and the AI
Settings run history displays the trace next to the run. This links the bounded parent fan-out to
its child runs without adding a second trace store or granting any child broader permissions.

The real-MySQL orchestration spec passes **1 suite / 11 tests**, including same-trace persistence
for the child. Backend/frontend type checks and touched-file ESLint pass. Full backend Jest passes
**438 suites / 2,732 tests**. The isolated owner-settings Playwright flow passes **1/1**, verifies a
real Inventory child plus four policy-disabled children, confirms the trace in the UI, and reports
no page errors/API 5xx. The screenshot was visually inspected. AI features were disabled and the
cross-agent run reported zero provider calls. No migration, external provider call, commit or push.

## Shared specialist orchestration — audit confirmed cross-tenant run probes (2026-10-30)

Cancel and retry requests for a run owned by another business continue to return the same
tenant-scoped `NOT_FOUND` response as an unknown run ID. When the ID is confirmed to belong to a
different business, the requesting business now receives an append-only security audit event with
the actor, attempted operation and denied result. The event does not include the foreign business
ID or expose whether the ID exists to the caller. No schema change or migration was needed.

The real-MySQL orchestration spec passes **1 suite / 12 tests**, including both cancel and retry
probes, the tenant-local audit rows and verification that the foreign run remains unchanged.
Backend and frontend `tsc --noEmit` and ESLint on the touched files pass. The frontend check also
needed a strict-null correction in the existing cross-agent Playwright spec's parsed run-list type.
Full backend Jest passes **438/438 suites and 2,733/2,733 tests**. The focused specialist Playwright
suite passes **6/6** against the local app, covering Inventory → Procurement approval, Customer
profile/follow-up, SEO draft-switch refusal, Finance read-only review, Commerce read-only review and
cross-agent trace. The screenshots were visually inspected; the flows assert no unexpected browser
console errors or API 5xx responses. One initial live Customer AI-draft attempt returned the safe
`AI_PROVIDER_INSUFFICIENT_CREDIT` response and saved no draft; the browser regression now intercepts
that same response locally so reruns do not call the provider. The Action Center navigation check
also now waits for the SPA route to settle before asserting approval controls. The trace flow makes
zero AI calls. No migration, commit or push.

## Inventory Intelligence — recommendation follow-through (2026-10-30)

Added a read-only outcome projection for saved Inventory Agent reorder recommendations. It joins
each recommendation to its canonical Procurement request, linked purchase order, quantities actually
received and current product stock. The Inventory page labels the stock value as a later snapshot
that is not attributed to the recommendation, and states that stockout prevention and sales impact
are not tracked. No source record is copied, and no stock, purchase or customer data is changed.

Real-MySQL coverage passes **1 suite / 14 tests**, including creation and partial receipt of a
canonical purchase order and verification of the linked recommendation evidence. Backend/frontend
`tsc --noEmit` pass; touched-file ESLint passes (backend's existing Prettier-only formatting rule was
disabled for the large already-modified service); the earlier full backend Jest run passes **438
suites / 2,734 tests**. Browser QA passes **10/10** specialist journeys: Inventory → shared RFQ,
Inventory action approval and branch transfer, Customer profile/follow-up, Commerce read review,
Commerce supplier-claim draft and sourcing comparison, Finance, SEO, one-agent parent trace, and all
five enabled agent reviews in an isolated QA business. The all-agent run used disabled AI feature
toggles and recorded zero provider calls. Browser console and API 5xx checks passed. No migration,
provider call, commit or push. This closes one Inventory follow-through gap and extends agent
journey coverage; it does not complete the broader five-agent specification or production acceptance.

## Inventory Intelligence — recorded sales outcome comparison (2026-10-30)

Extended the read-only recommendation follow-through projection with a descriptive comparison of
recorded sale stock movements across two fixed 56-day windows: the period before a purchase order's
full receipt and the period after it. Partial receipts and immature follow-up windows are not shown
as completed measurements. Each available comparison shows total recorded units, average recorded
units per week and the number of weeks with at least one recorded sale movement.

The comparison is explicitly limited to sale movements recorded in Noxtill. A week without a
movement is not proof of zero demand, and the result does not attribute a change to the agent or
claim stockout prevention. Other sales channels and causal impact are not available from these
records. No source data is copied or changed, and no migration/provider call was needed.

The Inventory handoff real-MySQL spec passes **1 suite / 14 tests**, including an immature/partial
receipt and a mature comparison with known source movements. Backend/frontend `tsc --noEmit`,
touched-file ESLint, and scoped `git diff --check` pass. Full backend Jest passes **438 suites /
2,734 tests**. The isolated Inventory→Procurement Sourcing Playwright flow passes **1/1** with no
page errors or API 5xx; its screenshot was visually inspected. No commit or push. This adds a
bounded descriptive outcome signal and does not complete calibrated forecasting or causal outcome
measurement for the Five Specialized AI Agents module.

## Customer Agent — segment action audit and browser approval flow (2026-10-30)

Segment proposals now expose a versioned, shared `SpecialistAgentAction` history alongside their
saved draft revisions. Revising a proposal supersedes the earlier action; submission, withdrawal,
rejection, approval, canonical Segment save and verification are recorded as action transitions.
Approval writes the canonical CRM Segment transactionally and marks the action verified only after
reading back a matching name, rules and version. Existing drafts without action rows are reconciled
from their saved revision/submission/approval records before a later change or approval. Historical
approval is marked `needs_review` unless the current canonical Segment still matches; the code does
not infer that an old approval was verified. The UI discloses when a legacy draft has incomplete
action history.

Real-MySQL coverage passes **1 suite / 16 tests**, including deleted legacy action rows followed by
reconciliation, submit, approval and canonical verification. Backend and frontend `tsc --noEmit`,
and ESLint on the touched frontend files pass. Full backend Jest passes **438 suites / 2,737 tests**.
The focused Customer segment Playwright flow passes **2/2 tests including setup**, covering revision,
Action Center handoff, approval and visible verified audit history; its screenshot was inspected.
The broader specialist-agent browser journey also passes **2/2 including setup**, including saving
and clearing the Inventory threshold, with its own console/API error assertions. No paid provider
call or migration was needed. Global `git diff --check` still reports a trailing blank line in the
unrelated, already-modified `backend/src/marketing/automations/workflows.constants.ts`; the scoped
Customer files have no whitespace errors. No commit or push. This closes the Customer segment
proposal audit gap only; provider-confirmed actions, broader outcome measurement and the other
agent-specific limitations in the map above remain open.

## Five Specialized AI Agents — current all-agent browser smoke (2026-10-30)

Re-ran the isolated QA journey after the Customer audit changes. All five enabled agent reviews
complete through the shared orchestration surface with AI provider calls disabled; the test confirms
the result counts and that the run reports zero provider calls. Playwright passes **2/2 tests
including setup**. The fresh full backend regression run also passes **438 suites / 2,737 tests**;
backend and frontend `tsc --noEmit` and the focused Customer frontend ESLint pass. This validates the
current local review/orchestration path, not paid AI output, provider writes, live connector behavior
or production acceptance. No code or migration change was needed for this smoke, and no commit or
push was made.

## Five Specialized AI Agents — operator runbook (2026-10-30)

Added `SPECIALIZED_AI_AGENTS_RUNBOOK.md` for provider/model outages, source-connector degradation,
worker/queue backlog, bad agent configuration, uncertain duplicate writes and suspected
cross-tenant exposure. The procedures use the existing owner controls, AI Settings operations view,
canonical modules, explicit idempotency/retry paths where implemented, `/health/ready` and persisted
orchestration recovery.
The guide explicitly says the readiness probe is not worker-health proof, the persisted-run view
does not measure queue wait/per-tool latency, and a local runbook is not production alerting or
provider acceptance. It introduces no fictional dashboard/API, defaults or provider status.
This closes the documentation/runbook deliverable only; the live provider, outcome-measurement and
other code gaps in the agent map remain open. No code, migration, test, commit or push was needed.

## Five Specialized AI Agents — shared identity and trigger contract (2026-10-30)

Added one backend registry for the five persisted agents, their module IDs/keys, owner policy
switches, daily-review switches, labels and allowed triggers. The schedule processor, agent policy
service and cross-agent orchestrator now derive their repeated identity mappings from that registry.
Run creation rejects unregistered agent keys and disallowed trigger types with typed `AppException`
responses before writing, and checks every run's module ID against the registered agent/module
pair. All five domain agents allow the manual, event and scheduled paths that their existing callers
use; the internal cross-agent runner is restricted to manual execution and the shared module ID.

The real-MySQL idempotency spec passes **1 suite / 8 tests**, including accepted event/scheduled
runs and rejected unknown identities, module mismatches and triggers with no rows written. Backend
and frontend `tsc --noEmit` pass, and ESLint passes on the six touched backend files. Full backend
Jest passes **438 suites / 2,740 tests**. The isolated cross-agent browser journey passes **2/2 including setup**;
all five reviews complete with provider features disabled, the page reports zero console/API 5xx
errors, and the screenshot was visually inspected. No migration or paid provider call was made.
No commit or push.
This makes the run identity/trigger contract explicit; agent-specific capability gaps, provider
confirmation, outcome measurement and production acceptance remain open.

## Inventory Intelligence — fixed-window prior-period evidence (2026-10-30)

Added a descriptive comparison of recorded `sale` stock movements across the latest eight fixed
seven-day buckets and the eight buckets exactly 52 weeks (364 days) earlier. It reports the observed
unit totals, difference and percent change when the earlier total is nonzero. The comparison is
separate from the existing point baseline, backtest and reorder calculations; it does not modify the
forecast or claim a seasonal/calendar-year adjustment. Weeks without a recorded movement are not
evidence of zero real-world demand, and off-platform or missing sales cannot be inferred.

The Inventory real-MySQL spec passes **1 suite / 14 tests**, including the 60-week source window,
known current and prior bucket totals, zero-denominator handling and unchanged canonical writes. The
full backend Jest run passes **438 suites / 2,740 tests**; backend and frontend `tsc --noEmit` and
touched-file ESLint pass. The Inventory Agent Playwright flow passes **2/2 tests including QA
signup**, with no browser console or API 5xx errors. Its screenshot was visually inspected and shows
the comparison with the expected unavailable-percent disclosure when the earlier total is zero.
No migration or provider call was needed. No commit or push. This improves historical evidence only;
it does not establish calibrated seasonality, stockout-censored demand or causal outcomes.

## Specialist Agent Operations — persisted action lifecycle metrics (2026-10-30)

Extended the existing owner-facing AI Settings operations view with business-scoped counts from
`SpecialistAgentAction`, its append-only transition events, and the tool/context labels already
saved on linked `AiCallLog` rows. The view reports current material-action states, saved execution
attempts, approval/rejection transitions, verified/verification-failed transitions, and the logged
tool/context names for the same 30-day window. The UI calls these logged labels; they do not claim
independent external-tool execution or per-tool latency. The action metrics do not represent
acceptance rates or measured business impact. Existing run, recommendation, provider-attempt, token
and application-estimated-cost metrics remain intact.

The real-MySQL AI Settings spec covers approved, rejected, verified and verification-failed records,
summed execution attempts, logged tool/context names, and exclusion of a second business's action
and AI-call rows. No schema change or migration was needed. The focused spec passes **1 suite / 4
tests**; backend and frontend `tsc --noEmit`, and touched-file ESLint pass. Full backend Jest passes
**438 suites / 2,740 tests**. The isolated specialist-agent Playwright flow passes **2/2 including
QA signup**; a focused `/assistant/settings` visit visually confirmed all five agent rows, the new
columns and honest empty states, with zero console or API 5xx errors. No provider call, commit or
push was made. Independently measured tool execution/latency, queue wait, comprehensive
security-event rates (a limited denied cross-tenant run-probe counter is added below), provider
invoices and measured business outcomes remain unavailable.

## Specialist Agent Operations — action-type and audited security drill-downs (2026-10-30)

Added per-agent material-action summaries grouped by the persisted `actionType`, with counts by
current state and summed execution attempts. The owner-facing AI Settings operations view now has an
action-type filter and a separate drill-down table. Its copy makes clear that selecting an action
type filters this drill-down only; the run and provider metrics above remain the full business-wide
agent/module summaries. The real-MySQL AI Settings spec verifies action-type grouping, state counts,
attempt totals and exclusion of another business's action rows.

Also added one narrowly scoped security counter from the existing append-only audit log: denied
cross-tenant specialist-run cancel/retry probes during the same 30-day window. The current view
labels it business-wide and explicitly says it is not comprehensive security-event monitoring;
other permission, stale-data, prompt-injection and policy blocks are not counted. The real-MySQL spec
verifies the counter excludes another tenant's audit row. No schema change or migration was needed.

The focused AI Settings MySQL spec passes **1 suite / 4 tests**; backend/frontend `tsc --noEmit` and
ESLint on the touched backend/frontend files pass. The isolated Customer segment approval browser
flow now also visits AI Settings, filters to the verified segment-draft action, checks the recorded
state and execution count, and confirms the security metric renders. Playwright passes **2/2 tests
including setup**, with no browser console errors or API 5xx responses; the screenshot was visually
inspected. Full backend Jest passes **438 suites / 2,740 tests**. No provider call, migration,
commit or push was made.

## Customer Agent — configurable retention cue threshold (2026-10-30)

Added `agents.customerRetentionMinimumOrderDecline` as an editable AI & Governance policy, defaulting
to one fewer completed non-quotation order so existing behavior is preserved. The Customer Profile
review continues to require at least three completed orders in its previous 30-day baseline window;
after that, it raises an activity-decline cue only when the current-vs-previous completed-order drop
meets the configured integer threshold. A smaller recorded decline is returned as
`below_decline_threshold` with the observed counts and rule limit. The profile displays the active
threshold. It remains a deterministic prioritization cue, not a churn prediction or causal claim.

The real-MySQL Customer Profile spec verifies a two-order drop is suppressed by a configured
three-order threshold. The Settings Hub spec verifies the default value, owner save and validation.
Those focused suites pass **2 suites / 31 tests**. Backend and frontend `tsc --noEmit` pass; touched
source lint passes with existing repository Prettier noise excluded, and the legacy Settings Hub
spec's existing unsafe-Jest matcher lint findings excluded. The isolated specialist browser journey
passes **2/2 including QA setup**, saves a threshold of three, resets it to one and checks the
customer-profile rule text; no page errors or API 5xx were reported. Full backend Jest passes
serially: **438 suites / 2,742 tests**. A parallel full run had one unrelated Voice Alert Forwarder
DB-test count mismatch (4 delivered vs 2 expected); that suite passed alone **2/2**, and the full
serial rerun passed. No migration, provider call, commit or push was made.

## Specialist Agent Operations — proposal revision counts (2026-10-30)

The owner-facing AI Settings operations view now includes per-agent counts of `proposal_updated`
events recorded on specialist material actions within its existing 30-day window. These are
append-only proposal revision events, not all edits to recommendations or canonical records, and
they do not measure approval likelihood or business impact. The real-MySQL AI Settings spec verifies
two saved revisions are attributed to the owning agent and included alongside that action's type.
The all-agent Playwright smoke checks that the metric renders for each fresh agent row as zero when
there are no saved revisions; the page reported no console errors or API 5xx responses.

The focused AI Settings spec passes **1 suite / 4 tests**; backend and frontend `tsc --noEmit`,
touched-file ESLint and the scoped `git diff --check` pass. Full backend Jest passes serially:
**438 suites / 2,742 tests**. No schema change, migration, provider call, commit or push was made.

## Shared Specialist AI — per-run provider request ceiling (2026-10-30)

Added `agents.specialistMaxProviderRequestsPerRun`, an owner-editable AI & Governance setting with
a default of 10 requests and a validated range of 1–100. `AiInfraService` checks and reserves each
provider request inside its existing business-serialized transaction, before the external model
call. Failed and interrupted reservations count, and the monthly request and estimated-spend limits
remain independent. This limits provider requests for a persisted run; it is not a cap on domain
tool invocations, tokens, or model steps inside one provider request.

The real-MySQL AI infrastructure spec proves that the next request is refused after a run reaches its
configured limit while a separate run for the same business can still call the provider. The
Settings Hub spec verifies the default, saved value, and invalid-value rejection. Focused coverage
passes **2 suites / 42 tests**. Backend and frontend `tsc --noEmit` pass; touched-file ESLint passes
with the repository's existing Prettier noise and legacy unsafe-Jest matcher findings excluded.
The all-agent Playwright test passes **1/1**, checks the operations metric and saves the setting to
1 before restoring 10; the page reports no console errors or API 5xx responses. The screenshot was
visually inspected. Full backend Jest passes serially: **438 suites / 2,744 tests**. No schema
change, migration, provider call, commit or push was made.

## Shared Specialist AI — per-request output-token ceiling (2026-10-30)

Added the owner-editable `agents.specialistMaxOutputTokensPerRequest` policy in AI & Governance,
default 1,024 with a validated range of 128–8,192. The shared AI infrastructure refuses a
specialist request before it reserves usage or contacts the model when the requested output-token
allowance exceeds the business limit. Existing default behavior remains 1,024 output tokens. This
setting caps output allowance only; input-context size and actual model tokenization are not
measured or capped by this policy.

The real-MySQL AI infrastructure spec proves a request above the configured ceiling is refused
without a provider call or request reservation, while a request exactly at the ceiling is allowed.
The Settings Hub spec verifies the default, save and range validation. Focused coverage passes
**2 suites / 43 tests**. Backend/frontend `tsc --noEmit` pass. ESLint passes on touched source and
the specialist browser test; the pre-existing Settings Hub test matcher unsafe-type findings and
repository Prettier noise were excluded from scoped lint checks. The all-agent Playwright test
passes **1/1**, saves a lower ceiling then restores the default, with no browser console errors or
API 5xx responses; the saved settings screenshot was visually inspected. Full backend Jest passes
serially: **438 suites / 2,745 tests**. No schema change, migration, provider call, commit or push
was made.

## Shared Specialist AI — serialized input-size ceiling (2026-10-30)

Added the owner-editable `agents.specialistMaxInputBytesPerRequest` policy in AI & Governance,
defaulting to 1,048,576 UTF-8 bytes per serialized specialist request and validated from 4,096 to
16,777,216 bytes. The shared AI infrastructure measures the system prompt, conversation messages
and tool schemas together, then checks the limit in the same business-locked transaction as the
request/output-token reservations. Oversized or unmeasurable specialist payloads are refused before
usage reservation and before contacting the AI provider. The setting is explicitly a serialized
byte bound, not a model-token count or a guarantee about context-window usage.

Real-MySQL AI infrastructure coverage proves an input exactly at the limit is accepted and one byte
over is refused with no provider call or usage reservation. Settings Hub coverage verifies the
default, owner save and lower-bound validation. Focused tests pass **2 suites / 44 tests**. Backend
and frontend `tsc --noEmit` pass. Touched-file ESLint passes with known repository-wide Prettier
noise and legacy unsafe Jest matcher rules excluded. The all-agent Playwright journey passes **2/2
including setup**, saves the limit to 8,192 bytes and restores the default; it reports no browser
console errors or API 5xx responses, and the AI Settings screenshot was visually inspected. Full
backend Jest passes serially: **438 suites / 2,746 tests**. No migration, provider call, commit or
push was made.

## Specialist Agent Operations — material action execution duration (2026-10-30)

The owner-facing AI Settings operations view now calculates p50 and p95 elapsed time for material
action attempts from persisted `SpecialistAgentActionEvent` transitions: an `executing` event paired
with its subsequent terminal transition. It reports the number of complete samples and the 10,000
event processing bound. Incomplete attempts and negative intervals are omitted. This measures the
recorded action lifecycle only; it is not model-provider latency, per-tool runtime, approval queue
wait, or verified business impact. Rows from another business are excluded, including action/event
relations whose owning business does not match the active tenant.

The real-MySQL AI Settings spec verifies elapsed-time calculation and cross-business exclusion. The
focused spec passes **1 suite / 4 tests**; backend/frontend `tsc --noEmit` and touched-file ESLint
pass (existing formatting noise was excluded). The all-agent Playwright smoke passes **1/1** and
checks the honest no-sample state for the five new QA agent rows; no browser console errors or API
5xx responses were reported and the screenshot was visually inspected. Full backend Jest passes
serially: **438 suites / 2,745 tests**. No migration, provider call, commit or push was made.

## Specialist Agent Operations — distinct user-initiated operators (2026-10-30)

AI Settings now reports the count of distinct user-initiated operators for each registered agent in
the same rolling 30-day window as its run totals. The business-scoped query groups by agent, module
and non-null initiating user; scheduled/system runs do not count as operators, and no user IDs are
returned to the UI. This is a count of operators recorded on specialist runs, not proof of active
staff seats or external users.

The real-MySQL spec verifies the count across repeated runs, multiple users, a system run and another
business. It passes **1 suite / 4 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint and
the all-agent Playwright check pass; the UI check requires a numeric operator count and verifies
there are no browser console errors or API 5xx responses. Full backend Jest passes **438 suites /
2,746 tests**. No migration, provider call, commit or push was made.

## Specialist Agent Operations — open action age (2026-10-30)

The business-wide operations view now counts material actions in states that still need attention:
approval required, execution queued or active, verification pending or failed, needs review, and
failed or partially succeeded. It also reports the oldest matching action's elapsed time since its
last persisted update. The count includes older unresolved actions rather than only actions created
inside the 30-day metric window. This is an age indicator, not an SLA or proof that an action is
overdue; the UI labels its business-wide scope and avoids inventing a response target.

The real-MySQL AI Settings spec verifies the active verification-failed action is counted, its age
comes from the saved update timestamp, other-business rows are excluded, and no-action agents return
an empty state (**1 suite / 4 tests**). Backend/frontend `tsc --noEmit` pass. Frontend ESLint and
backend ESLint with the repository's pre-existing Prettier-only findings excluded pass. The
all-agent Playwright journey passes **2/2 including setup**, with zero browser console errors or API
5xx responses; the queue-age line was visually checked on the operations page. Full backend Jest
passes **438 suites / 2,746 tests**. No migration, provider call, commit or push was made.

## Specialist Agent Operations — audited Commerce security counters (2026-10-30)

AI Settings now reports business-wide counts over the latest 30 days for two existing audit event
types: `commerce.agent_tool_call_blocked` recorded on `SpecialistAgentRun`, and
`commerce.agent_tool_approval_refused` recorded on `CommerceAgentToolRun`. The queries explicitly
scope events to the active business and the UI labels them as audited Commerce events. The existing
cross-tenant run-probe denial counter remains separate. These counters cover only those persisted
events; they are partial operational signals, not comprehensive security monitoring or an alerting
system.

The real-MySQL AI Settings spec verifies same-business events are counted and another business's
events are excluded (**1 suite / 4 tests**). Backend/frontend `tsc --noEmit`, frontend ESLint, and
backend ESLint with pre-existing Prettier-only findings excluded pass. The all-agent Playwright
journey passes **2/2 including setup**, verifies the new counter labels, and reported no browser
console errors or API 5xx responses; its screenshot was visually inspected. Full backend Jest passes
serially (**438 suites / 2,746 tests**). No migration, provider call, commit or push was made.


## Inventory Intelligence — persisted follow-up result surfaced (2026-10-30)

The reorder view now reads and displays the persisted follow-up measurement for material reorder actions. It labels the evidence as measured or inconclusive, shows the saved reason and observation time, and states that a comparison of Noxtill-recorded sales does not establish causation. The API safely parses the existing action result instead of creating another sales source or storing a duplicate projection.

The focused real-MySQL handoff spec passes **1 suite / 17 tests**, including a fresh outcomes read of the saved measurement. Backend and frontend `tsc --noEmit`, touched-file ESLint and the full backend Jest run pass (**438 suites / 2,747 tests**). The isolated specialist Playwright journey passes **1/1** in a newly created QA business; it checks the live Inventory handoff and Customer profile journeys with no browser or API errors. That journey does not wait the production 56-day measurement window, so the measured follow-up state was verified through the database/API spec, not browser timing. No migration, provider call, commit or push was made. The five-agent specification remains incomplete.


## Specialist Agent Operations — Customer Agent message-queue refusals (2026-10-31)

The owner-facing AI Settings operations summary now counts the Customer Agent's audited `customer_agent.message_draft_queue_refused` events over its existing 30-day, current-business window. The UI labels the metric as business-wide. The real-MySQL spec verifies one same-business refusal is counted while an equivalent audit row owned by another business is excluded. This is one recorded send-gate refusal type, not all communication blocks or general security monitoring.

The focused AI Settings database spec passes **1 suite / 4 tests**. Backend and frontend `tsc --noEmit` pass; touched frontend ESLint and browser-spec ESLint pass. Backend ESLint passes with the pre-existing Prettier-only findings in `ai-settings.service.ts` excluded. The isolated all-agent Playwright journey passes **1/1** with provider calls disabled; it verifies the new metric label and no browser console or API 5xx errors. Full backend Jest passes **438 suites / 2,747 tests**. No migration, provider call, commit or push was made. The Five Specialized AI Agents implementation remains incomplete and is not production accepted.

### Consent-refusal journey verification follow-up (2026-10-31)

The isolated Customer Agent browser journey now revokes marketing consent after a message draft is
saved, calls the queue-send route, and verifies the request is refused with HTTP **403** and
`CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED`. The status is intentionally 403 (forbidden), not 409.
The refusal is recorded in the business-scoped operations metric, and the test verifies the count
and restores consent before completing the rest of the journey. No message is queued and no provider
delivery is claimed. Playwright passes **2/2 including setup**. Backend/frontend `tsc --noEmit`,
touched backend/frontend ESLint, and scoped `git diff --check` pass. Full backend Jest passes **438
suites / 2,747 tests**. This verifies the specific consent-refusal path; it does not make the partial
operations metric a comprehensive security monitor or make the five-agent system production
accepted. No migration, provider call, commit or push was made.

## Specialist Agent Operations — material action audit trail and CSV export (2026-10-31)

AI Settings now has a permission-checked, current-business audit endpoint for up to 100 material
actions from the latest 30 days, with up to 50 ordered lifecycle events per action. The page shows
canonical target IDs, action state/risk, approval and execution identities, correlation ID, saved
reasons, and the recorded event timeline. The CSV export uses the same tenant-scoped response.
Proposed/actual/verification payloads, evidence values, and arbitrary event metadata are excluded;
the UI discloses the row bounds and that canonical provider receipts appear only where the owning
module recorded them.

The real-MySQL AI Settings spec verifies action/event ordering, recorded approval-to-verification
transitions, omission of sensitive payload fields, and exclusion of a second business's action.
Focused coverage passes **1 suite / 4 tests**. Backend/frontend `tsc --noEmit`, touched-file
ESLint, and `git diff --check` pass. The isolated browser journey passes **2/2 including setup**;
it loads the real action timeline, downloads CSV, checks the filename and saved action ID, and
verifies raw payload fields are not exported. Full backend Jest passes **438 suites / 2,747 tests**.
No migration, provider call, commit or push was made. This adds an audit view/export; it does not
close the remaining provider, outcome, operational-monitoring or acceptance gaps in the five-agent
system.

## Specialist Agent Operations — saved evidence freshness summary (2026-10-31)

The owner-facing AI Settings operations table now summarizes saved specialist evidence per agent:
recorded freshness labels, source types, and the latest fetch/source-observed timestamps. It reads
only evidence from the active business and its runs, over the latest 30 days, capped at the 5,000
most recently fetched rows. The UI and API disclosure say these are persisted labels, not a fresh
re-evaluation, complete source-coverage report, or connector-health check.

The real-MySQL AI Settings spec verifies the same-business freshness/source summary, timestamps,
the no-evidence state for another agent, and exclusion of an equivalent foreign-business evidence
row (**1 suite / 4 tests**). Backend and frontend `tsc --noEmit` pass. Frontend ESLint passes;
backend ESLint passes with only existing Prettier formatting findings in the large service file
disabled for this check. The isolated specialist Playwright journey passes **2/2 including setup**,
checks the rendered heading and recorded freshness value, and reports no browser console or API 5xx
errors; the evidence row and its disclosure were visually inspected in the captured screenshot.
Full backend Jest passes **438 suites / 2,747 tests**. No migration or provider call was needed.
No commit or push was made. The Five Specialized AI Agents implementation remains incomplete and
is not production accepted.

## Customer Intelligence — selected branch identity retained (2026-10-31)

Customer Agent run evidence now records the exact validated child-business ID when the review is
scoped to a selected branch, alongside the existing source and formula version. Current-business
runs store a null branch ID. The summary still comes from `BranchScopeService`-validated Analytics
scope, and the saved run contains only aggregate counts and canonical scope identity, not customer
names or contact values. No schema migration was needed because the run already stores these source
references as JSON.

The real-MySQL spec creates a child business, verifies the summary contains only its customer, checks
that the run records that exact branch, and confirms the run output excludes the customer's name
and email (**1 suite / 7 tests**). Backend/frontend `tsc --noEmit` and touched-file backend ESLint
pass. Full backend Jest passes **438 suites / 2,748 tests**. No browser change, migration, provider
call, commit or push was needed. The Five Specialized AI Agents implementation remains incomplete
and is not production accepted.

## Finance Intelligence — validated branch scope retained (2026-10-31)

Finance Intelligence P&L run evidence now stores the exact branch-business IDs returned by
`BranchScopeService`, plus the explicitly selected branch ID where applicable. An all-branches run
records its validated ID list and a null selected-branch field. This makes the scope reproducible
from the run record instead of retaining only a business count; it adds no duplicate financial
data and needs no schema migration.

The real-MySQL spec verifies a selected branch run records exactly that branch ID and excludes the
root from its single-branch scope, and an all-branches run records exactly the authorized root and
child IDs while excluding an unrelated business (**1 suite / 14 tests**). Backend/frontend
`tsc --noEmit`, touched backend ESLint with the existing Prettier-only formatting findings excluded,
and scoped `git diff --check` pass. Full backend Jest passes (**438 suites / 2,749 tests**). No
browser change, migration, provider call, commit or push was needed. The Five Specialized AI Agents
implementation remains incomplete and is not production accepted.

## Inventory Agent — branch scope retained for rebalancing (2026-10-31)

Inventory Agent run evidence now stores the exact active branch-business IDs used by its
cross-location stock, movement and transfer comparison. The same validated snapshot is passed into
the branch-rebalance calculation, so the recorded scope and calculation share the same business-ID
list. Current stock/reorder calculations continue to use the active business as before. No duplicate
inventory data or schema migration was added.

The real-MySQL Inventory Agent spec verifies the saved scope contains exactly the active root and
its two active child locations (**1 suite / 14 tests**). Backend/frontend `tsc --noEmit`, touched
backend ESLint with the repository's existing Prettier-only formatting findings excluded, and
scoped `git diff --check` pass. Full backend Jest passes (**438 suites / 2,749 tests**). No browser
change, migration, provider call, commit or push was needed. This closes a branch-scope traceability
gap only; the Five Specialized AI Agents implementation remains incomplete and is not production
accepted.

## Finance Agent — period-close statement evidence (2026-10-31)

Period Close Readiness now reports the number of statement imports overlapping the selected month
and the actual imported statement-line counts by saved human-review status. Line counts use the
statement date, are separated by business, and exclude other tenants. The screen links to the
existing statement-review workflow. The unavailable item now specifically names native bank feeds
and complete bank reconciliation, because the existing manual CSV review is only partial evidence;
the UI does not call it a bank feed, proof of settlement, or a certified close.

The real-MySQL Period Close spec verifies month-boundary line inclusion, matched/unmatched/no-match
counts, empty branch scope, and exclusion of another tenant's statement. Focused coverage passes
**1 suite / 2 tests**. Backend/frontend `tsc --noEmit`, touched-file ESLint, and the period-close
Playwright flow pass; the browser check reports no console errors or API 5xx responses and the
rendered page was visually inspected. Full backend Jest passes **438 suites / 2,749 tests**. No
migration or external provider call was needed. This makes one Finance checklist more truthful and
useful; native feeds, full reconciliation, a complete accounting ledger and a certified close
remain unavailable. The Five Specialized AI Agents implementation is still incomplete and not
production accepted.

## Inventory Agent — low-stock products without recent sales history (2026-10-31)

The Inventory Agent now saves a review finding for each active product that is out of stock or at
its low-stock threshold when its latest eight recorded-sales weeks contain no units. The finding
shows the actual stock, threshold, history window and last recorded sale, and explicitly abstains
from a demand forecast. It also explains that a separate canonical reorder suggestion, if present,
comes from the configured threshold/lead-time formula and is not calibrated to missing recent sales
history. No demand, stock, purchase order or customer action is fabricated or changed. The run's
dynamic count appears in the existing Reorder Suggestions Agent summary.

The real-MySQL Inventory Agent spec passes **1 suite / 14 tests**, including the low-stock/no-sales
fixture, finding evidence and disclosures. Backend/frontend `tsc --noEmit`, touched backend and
frontend ESLint, and scoped `git diff --check` pass. The specialist Playwright journey passes **1/1**
with the new count visible, and asserts no browser console errors or API 5xx responses; its rendered
screen was visually inspected. Full backend Jest passes **438 suites / 2,749 tests**. No migration
or provider call was needed. This closes one inventory evidence gap only; calibrated demand,
seasonality, stockout-censored demand and other limits above remain, and the Five Specialized AI
Agents implementation is not production accepted.

## SEO Agent — Google Search Console URL Inspection and page performance (2026-11-01)

Added a manager-gated `POST /seo-autopilot/search-console/url-inspection` endpoint using Google's
URL Inspection API with the existing `webmasters.readonly` OAuth scope and the business's selected
Search Console property. It rejects malformed URLs and URLs outside that property (including
domain-property subdomain boundaries), re-checks property access, and returns only bounded provider
fields. The Technical SEO screen now has a URL Inspection tab that displays Google's stored index
verdict, crawl, fetch, robots, canonical, sitemap and referring-URL fields when returned. It also
queries the selected page's finalized web-search clicks, impressions, CTR and average position over
the prior 28 complete Pacific-Time dates. A canonical page URL returned by Google is shown as such;
an empty response is distinct from zero metrics, and a performance-query failure does not erase a
successful index inspection. The UI says these are search-exposure metrics, not visits, conversions,
orders or revenue attribution. It clearly states that index inspection is not a live-page test and
does not request indexing; absent provider fields are shown as not reported. Settings copy was
updated so it no longer claims URL Inspection is missing. No inspection URL or response is persisted,
and no schema migration was needed.

Connector and real-MySQL service specs pass (**2 suites / 18 tests**). Backend and frontend
`tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. Browser checks verify both
the disconnected state and the result-card contract in disposable QA businesses; the latter uses a
test-only Google response fixture and is not live provider verification. Both report no browser
console errors or API 5xx responses, and the rendered result card was visually inspected. The full
specialist browser suite passes **12/12**, including all five agent journeys and orchestration.
Full backend Jest passes **438 suites / 2,758 tests** with `--runInBand`. A parallel
`--maxWorkers=2` run had one inventory DB-fixture mismatch; that suite passes alone and the serial
full rerun passes. No live Search Console call was possible because the QA business has no connected
Search Console account. No migration, commit or push was made. Backlink authority, conversion
analytics attribution and provider-confirmed execution/outcomes remain partial; the Five Specialized
AI Agents implementation is still incomplete and not production accepted.

## Customer Agent — monotonic provider delivery status (2026-11-01)

Messaging status callbacks now match the canonical message channel, so a provider reference in one
channel cannot update a same-valued reference in another. Telnyx status callbacks carry their
message type through the webhook queue; unknown types are ignored rather than ambiguously applied.
Out-of-order status events can advance the saved state but cannot downgrade a provider-confirmed
delivery/read to `sent` or `failed`. A later provider-confirmed delivery/read may correct an earlier
failure. This keeps the Customer Agent's linked follow-up delivery signal aligned with the latest
confirmed provider state; it does not establish that the customer replied or acted. Inbound WhatsApp
replies with Meta `context.id` now resolve through exactly one matching outbound WhatsApp message,
then require an active linked customer and a normalized sender/customer phone match before
refreshing that business's service window. Duplicate, missing, inactive or mismatched context
records fail closed and do not fall back to another tenant. Unthreaded inbound replies still have no
phone-number-to-business mapping, so their window refreshes only when one active customer across the
database uniquely matches the sender; ambiguous phone matches remain ignored.

The real-MySQL webhook processor spec passes **1 suite / 9 tests**, covering callback ordering,
channel scoping, unknown Telnyx message types, failure correction, unique inbound phone matching,
ambiguous cross-tenant phone rejection, contextual reply routing across duplicate customer phones,
and fail-closed handling of a sender/context mismatch. Backend and frontend `tsc --noEmit`,
touched-file backend ESLint and scoped `git diff --check` pass. Full backend Jest passes
**439 suites / 2,769 tests**.
The full run had exposed a brittle Inventory MySQL test selector that chose the first reorder item
rather than the target product; the assertion now selects the target product and that spec passes
**1 suite / 14 tests** in isolation. No UI change, live provider call, migration, commit or push was
made.

## Finance Agent — grounded AI summary across saved finance evidence (2026-11-01)

The optional Finance Agent explanation now receives the same bounded aggregate evidence that the
saved run already contains: relative cash-flow projection, Xero open receivables/payables grouped by
currency, privacy-minimized Noxtill customer-credit aging, approved returns, and calendar-month
variance, in addition to P&L, approved budget actuals, and imported statement review. The model
instructions explicitly keep currencies separate, distinguish customer-credit aging from invoice
due-date aging, treat Xero invoices/bills as external open items rather than a reconciled ledger,
and prohibit treating due dates as certain cash. No customer names, phone numbers, invoice contacts,
or line-level Xero records are sent. Provider tool metadata records source availability and bounded
scope, not financial line details.

The Finance real-MySQL spec passes **1 suite / 15 tests**. It verifies real Credit-ledger aggregates
reach the AI prompt without customer PII and verifies Xero receivable/payable totals remain separated
by currency in the prompt; the Xero return fixture is a service-level test fixture, not a live Xero
call. Backend/frontend `tsc --noEmit`, touched-file ESLint excluding the pre-existing Prettier-only
findings in the untracked Finance files, and `git diff --check` pass. Full backend Jest passes
**439 suites / 2,766 tests**. No migration, live provider call, commit or push was made. This closes
an AI-context coverage gap only; Xero account authorization and the existing Finance accounting
coverage limitations remain.

## SEO Agent — merchant-entered off-page and guest-post evidence (2026-11-01)

The saved SEO Agent review now includes business-scoped counts from existing tracked Off-Page SEO
and Guest Posting records: link status, open opportunity pipeline/stage, publication status and
pitch stage. These aggregates appear in the saved evidence and workspace card. The optional AI
explanation receives only the counts, not source URLs, notes, contacts or publication names. The
copy continues to identify these as merchant-entered records; no provider-wide backlink count,
authority score or organic outcome is inferred. No migration or new source table was added.

The real-MySQL SEO Agent spec passes **1 suite / 8 tests**, including tenant exclusion, tracked vs.
untracked records, saved evidence and checks that URLs/evidence notes do not enter the AI prompt.
Backend/frontend `tsc --noEmit`, touched-file backend/frontend ESLint and scoped `git diff --check`
pass. Full backend Jest passes **439 suites / 2,767 tests** with `--runInBand`. A preceding
`--maxWorkers=2` full run had one foreign-key cleanup failure in the unrelated orchestration suite;
that suite passes alone (**1 suite / 12 tests**) and the serial full run passes. A focused Playwright
follow-up creates an isolated QA business and QA-only merchant-entered link, opportunity,
publication and pitch records, runs the saved review with the SEO AI toggle disabled, and verifies
the persisted counts and honest authority disclosure on the Workspace page. It passes **1/1** with
no browser console errors or API 5xx responses. This verifies the local UI and deterministic
backend path, not a live Search Console or backlink provider. External backlink authority and
analytics attribution remain unavailable; the Five Specialized AI Agents implementation is still
incomplete and is not production accepted.

## Shared operations — cross-agent queue pickup visibility (2026-11-01)

Cross-agent parent runs now persist the first worker-pickup timestamp. The run's `startedAt` is set
at that pickup (only once, including across queue retries), so saved run duration no longer includes
time spent waiting before the worker began. AI & Governance shows current-business p50/p95 from
saved parent-run creation to first worker pickup, sample count, current parent rows awaiting first
pickup and the age of the oldest waiting row. Sampling uses up to the 5,000 most recent eligible
parent rows in the 30-day operations window. A nullable `worker_started_at` column was added with
hand-written migration `20261101120000_specialist_agent_worker_pickup`, applied locally and
verified in MySQL; Prisma client generation and migration status succeeded. The runbook now
describes the metric. It is not live queue-depth, worker-health, per-tool-latency or uptime
monitoring, and no external provider was called.

The real-MySQL AI Settings and orchestration specs pass **2 suites / 16 tests**. Backend and
frontend `tsc --noEmit` pass; touched-file ESLint passes (backend's pre-existing Prettier findings
were excluded from the focused lint rule), and scoped `git diff --check` passes. Full backend Jest
passes **439 suites / 2,769 tests**. The isolated specialist browser suite passes **13/13** with
provider calls disabled, including all five-agent orchestration and the Settings metrics; rendered
AI Settings and Finance Agent pages were visually inspected. A Finance period-close fixture was
corrected to place its pending return inside the October period, and the Finance Agent browser
fixtures now put baseline expenses inside the comparable month-to-date window; these were test-data
fixes, not product behavior changes. No commit or push was made. Provider-backed outcomes, data
coverage and production queue/worker monitoring remain partial as documented above.

## Inventory Agent — confirmed stock-transfer event reviews (2026-11-01)

Receiving a canonical branch stock transfer can now queue one Inventory event review after the
receipt transaction succeeds. The new owner setting is default-off and can be enabled independently
for each branch. The worker re-reads the transfer and requires its current status, both business
IDs and receipt version to match the queued event; each opted-in branch receives a separate
tenant-scoped read-only review with the transfer as its source reference. The event uses a stable
queue ID and the saved run's idempotency key, so duplicate queue delivery does not duplicate a
branch review. Queue failure is logged and does not undo the already-committed stock receipt.

The real-MySQL Stock Transfers and Inventory event-processor specs pass **2 suites / 20 tests**,
including default-off producer behavior, confirmation-only enqueue, stale/unreceived rejection,
independent branch opt-in and duplicate delivery. Backend/frontend `tsc --noEmit` and touched-file
ESLint pass. Full backend Jest passes **439 suites / 2,771 tests**. The isolated browser journey
passes **1/1** with external provider keys blocked; it verifies the new Settings switch saves and
resets, all five agent reviews complete, and there are no browser console errors or API 5xx
responses. No migration or provider call was needed. No commit or push was made. This closes one
Inventory event path only; calibrated demand, data/provider coverage and production acceptance
remain incomplete.

## Inventory Agent — recorded-wastage event review (2026-11-01)

Recording a canonical wastage movement can now queue an Inventory review when the owner enables a
new default-off setting. The worker re-reads the movement under its business ID, requires the
movement to be a wastage row with the exact recorded timestamp, checks current Inventory module and
agent policy, and uses a stable event ID for duplicate protection. It records a read-only review;
the existing stock decrement is committed independently and the event worker does not make another
stock change or contact a customer. Queue failure is logged without rolling back the recorded
wastage. No migration or provider call was needed.

The real-MySQL Inventory service and event-processor specs pass **2 suites / 19 tests**. Backend and
frontend `tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. Full backend Jest
passes **439 suites / 2,773 tests**. The isolated specialist Playwright journey passes **1/1** with
provider calls disabled; the Settings toggle saves on and off, and the page has no browser console
errors or API 5xx responses. Its screenshot was visually checked. No migration, provider call,
commit or push was made. This adds one Inventory event path; the five-agent specification remains
incomplete and is not production accepted.

## Inventory Agent — retry failed event reviews (2026-11-01)

The Inventory event worker now uses BullMQ's bounded `attemptsMade` value to give each retry its own
hashed run idempotency key. A previously failed attempt no longer causes the processor to silently
skip the retry. A completed attempt still deduplicates later deliveries, and a still-running attempt
blocks a concurrent duplicate. This applies to all five Inventory event review types; queue
producers currently configure three total attempts. A real-MySQL processor spec persists a failed
first run, retries under the next key, verifies the retry completes, then verifies the completed
retry is not run again.

The focused MySQL spec passes **1 suite / 9 tests**. Full backend Jest passes **439 suites / 2,774
tests**. Backend and frontend `tsc --noEmit` and standard ESLint on the two Inventory event files
pass. No migration, provider call or browser change was needed. No commit or push was made. This
fixes queue retry behavior for one Inventory event subsystem; calibrated demand, data/provider
coverage and production acceptance for the five agents remain incomplete.

## Shared specialist events — failed-attempt retry recovery (2026-11-01)

The Inventory retry fix is now generalized through a shared attempt resolver and used by Inventory,
Commerce, Customer, SEO, and Finance expense/order/return event processors. Each bounded BullMQ
attempt gets a distinct idempotency key whose hash is stored by the normal specialist-run service.
A failed earlier attempt no longer suppresses a later retry; an already completed or running
attempt still blocks duplicate work. Customer delivery-failure and appointment-no-show reviews also
pass the attempt-scoped key through their canonical service methods. The queue still bounds retries
according to each producer's configured attempts; this does not add a new action lifecycle or call
an AI provider.

The shared helper's real-MySQL spec plus the affected processor/service specs pass **9 suites / 45
tests**. Backend and frontend `tsc --noEmit`, touched-file backend ESLint, and the full backend Jest
pass (**440 suites / 2,775 tests**). No migration, browser change, live provider call, commit or
push was needed. This closes retry recovery for the listed event workers only; broader event
coverage, durable action orchestration, provider/data coverage and production acceptance remain
incomplete.

## Customer Agent — cancelled-appointment review event (2026-11-01)

Appointments can now queue a Customer Agent review when a staff member cancels an appointment and
the owner has enabled the new default-off Settings policy. The worker rechecks the current business,
Customer module/agent switches, exact cancellation timestamp, same-business appointment status and
that the linked customer has not been erased. It stores a read-only review with channel-consent
flags and contact-presence booleans only; it does not store customer contact values, infer a
cancellation reason, draft a message or contact the customer. Queue failures are logged and do not
undo the canonical cancellation or waitlist handling.

Focused real-MySQL and service specs pass **3 suites / 43 tests**, including opt-in, opt-out, stale
timestamp, cross-business, erased-customer, idempotency, privacy and no-message checks. Backend and
frontend `tsc --noEmit`, standard ESLint for changed service/processor/spec files, and ESLint with
the existing Prettier-only noise disabled for the shared Settings/policy files pass. Full backend
Jest passes **440 suites / 2,778 tests**. The backend was rebuilt and restarted on port 5001 because
the running process initially served an older compiled Settings response. The isolated all-agent
Playwright journey then passed **1/1** in a newly created QA business, including saving and restoring
the appointment-cancellation review toggle, with no browser console errors or API 5xx responses. No
migration or provider call was needed. This adds one Customer event source only; broader channel
coverage, post-contact outcome measurement and production acceptance remain incomplete.

## Customer Agent — linked review-response aggregate (2026-11-01)

The existing Customer Agent review now includes a trailing-90-day aggregate from real rated
`ReviewRequest` rows linked to non-erased customer profiles. It shows response count, average stars,
rating distribution and public/private routing counts. The saved review and optional AI explanation
receive only aggregate values; review text, names and contact details are excluded. External review
platform data is not linked to CRM customers and remains disclosed as unavailable. A real-MySQL
spec verifies recent linked ratings are counted while old, unlinked and erased-profile records are
excluded. The Insights page browser flow verifies the real empty state and disclosure.

Focused MySQL specs pass **3 suites / 28 tests**; full backend Jest passes **440 suites / 2,779
tests**. Backend and frontend `tsc --noEmit` pass. Frontend ESLint passes; backend ESLint has seven
existing Prettier-only findings on untouched lines in the analytics service/spec, while the
non-formatting lint rules pass. The isolated all-agent Playwright journey passes **1/1**, including
the Customer Insights state, with no browser console errors or API 5xx responses. No migration,
provider call, commit or push was needed. Broader provider-backed outcomes, data coverage and
production acceptance remain incomplete; this does not complete the Five Specialized AI Agents
specification.

## Customer Agent — staff-recorded follow-up outcome evidence (2026-11-01)

Saved Customer Agent reviews now reuse
`CustomerAgentActionsService.followUpOutcomeSummary` for the existing trailing-90-day,
business-wide task outcome summary. They show completed tasks, whether staff recorded an outcome,
and the outcome counts. The evidence and UI say these are staff-entered values, not provider-
confirmed delivery or independently verified contact. Branch-scoped reviews explicitly disclose
that the existing summary is not broken down by branch. The real-MySQL Customer Agent spec verifies
the persisted task row is summarized and that only aggregate counts enter the AI explanation.

Focused Customer Agent/action specs pass **2 suites / 22 tests**; backend/frontend `tsc --noEmit`,
touched-file ESLint and the all-agent Playwright journey pass. Browser QA verifies the zero-outcome
state, the staff-recorded outcomes card and the delivery limitation, without browser console errors
or API 5xx responses. Full backend Jest passes **440 suites / 2,779 tests**. No migration, provider
call, commit or push was needed. External delivery evidence and selected-branch outcome breakdowns
remain unavailable; the Five Specialized AI Agents specification remains incomplete.

## Customer Agent — canonical follow-up message delivery evidence (2026-11-01)

Saved Customer Agent reviews now aggregate the current canonical `Message.status` for same-business
CRM-linked follow-up drafts created in the trailing 90 days, matched through the existing
draft-send idempotency key. The snapshot separately reports delivered/read states, provider-reported
failures, queued/sent without confirmation, drafts without a message record, and any other status.
No message body, customer identity or destination is included in evidence or the optional AI
summary. Delivered/read are labelled provider-confirmed; staff-entered task outcomes remain a
separate measure. Because follow-up tasks have no branch association, selected-branch runs disclose
this metric as unavailable rather than inferring a branch.

The real-MySQL Customer Agent spec passes **1 suite / 8 tests**, including delivered, sent, failed
and draft-only linked messages and an assertion that private message text stays out of the AI input.
Backend and frontend `tsc --noEmit`, touched-file ESLint and the all-agent Playwright journey pass
**2/2**, with no browser errors or API 5xx responses. Full backend Jest passes **440 suites / 2,779
tests**. The API was rebuilt and restarted on port 5001 before the browser check. No migration, paid
provider request, commit or push was needed. This adds canonical delivery-state visibility; it does
not establish customer response, business impact, or complete the five-agent specification.

## Customer Agent — channel-specific consent coverage (2026-11-01)

The Customer Agent win-back brief now summarizes the latest recorded email, SMS and WhatsApp
consent revision for the same active, non-erased lapsed customers who have marketing consent and
are not CRM-opted-out. It reports granted, revoked and unknown counts per channel. These counts
are context only and do not authorize a send. Existing consent records are not branch-associated,
so a selected-branch brief explicitly reports this evidence as unavailable rather than attributing
it to a location. No consent or customer data is copied into a new table.

Real-MySQL Customer Agent/action specs pass **2 suites / 22 tests**. Backend and frontend
`tsc --noEmit`, touched-file ESLint and the isolated all-agent Playwright journey pass; browser QA
is **2/2** with no browser console errors or API 5xx responses. The full backend Jest run passes
**440 suites / 2,779 tests**. No migration or provider call was needed. No commit or push was made.
This improves win-back eligibility context only; it does not add channel delivery or prove a
customer outcome, and the Five Specialized AI Agents specification remains incomplete.

## Five Specialized AI Agents — isolated route-load browser QA (2026-11-01)

Expanded the isolated all-agent Playwright journey to open the Customer Insights, Inventory Reorder
Suggestions, Profit Overview, SEO Agent Workspace and Commerce Agents & Tools pages in a newly
created QA business. Each page's agent heading is asserted after navigation; the journey also
checks browser console errors and API 5xx responses. The cross-agent review and Customer Agent
consent/outcome disclosures remain part of the same journey.

Playwright passes **1/1** with no browser console errors or API 5xx responses. Frontend
`tsc --noEmit`, ESLint on the touched E2E file, and `git diff --check` pass. The full backend Jest
run from this same progress slice passes **440 suites / 2,779 tests**. This verifies route loading
and read-only review states for all five specialist surfaces; it does not verify every individual
write/approval flow or any live paid provider integration. No migration, provider call, commit or
push was made, and the five-agent specification remains incomplete.

## Customer Agent — consented contacts with a stored destination (2026-11-01)

The win-back audience now separates each channel's latest granted-consent count from the subset
that also has a nonblank stored destination: email requires an email value, while SMS and WhatsApp
require a phone value. The UI explicitly says a stored destination is not validated and that this
still is not send eligibility; the canonical send gate rechecks channel consent, suppression,
frequency, quota and provider state. The MySQL fixture proves an email-consented profile without an
email address is not counted as having a destination, while an SMS-consented profile with a phone
is.

The focused real-MySQL assertion passes. Backend and frontend `tsc --noEmit` and touched-file
ESLint pass. Full backend Jest passes **440 suites / 2,779 tests**. After rebuilding and restarting
the local API on port 5001, the isolated all-agent Playwright journey passes **1/1**, covering all
five agent routes, the updated consent display and no browser console errors or API 5xx responses.
No migration, provider call, commit or push was made. This improves audience evidence but does not
prove a destination is valid or a message will be delivered; the five-agent specification remains
incomplete.

## Specialist operations — approval and verification event shares (2026-11-01)

AI Settings now reports the rejected share of recorded approval-decision events and the failed
share of recorded verification events for each specialist. Percentages are shown only when the
corresponding event denominator is nonzero; labels disclose the event counts. Repeated events for
one action count separately, so these are not action success rates or business outcomes.

The AI Settings real-MySQL spec passes **1 suite / 4 tests**, including a 33.3% rejection share and
50% verification failure share. Backend and frontend `tsc --noEmit`, backend lint with the existing
Prettier-only findings excluded, and touched frontend ESLint pass. Full backend Jest passes **440
suites / 2,779 tests**. The new share labels were not visually rechecked in a browser during this
slice. No migration, provider call, commit or push was made. The specialist-agent specification
remains incomplete.

## Specialist operations — execution time by action type (2026-11-02)

AI Settings now also reports p50/p95 execution duration per material action type, derived from the
persisted `executing` to terminal action-event pairs. The count is limited to observed event pairs
in the 30-day window; rows without both transitions have no duration sample. The UI distinguishes
this from provider-tool latency and business impact. This is action-type execution telemetry only;
it does not add independent tool timing or external provider confirmation.

The real-MySQL AI Settings spec passes **1 suite / 4 tests**, including the recorded 600 ms
`segment_approval` execution. Backend and frontend `tsc --noEmit`, touched-file ESLint, backend
build, scoped diff check and the isolated all-agent Playwright journey pass. The browser check
asserts the new action-time column, opens all five specialist surfaces, and reports no console or
API 5xx errors. One full backend Jest run passed **439/440 suites and 2,778/2,779 tests**; the sole
failure was an unrelated MySQL write deadlock in `marketing/campaigns.service.spec.ts`, which passes
alone (**1 suite / 4 tests**). A lower-concurrency full rerun passes **440/440 suites and
2,779/2,779 tests**. No migration, provider call, commit or push was made. Per-tool latency,
provider-confirmed business outcomes and the full specialist specification remain open.

## Five specialist agents — browser acceptance flows (2026-11-02)

The isolated Playwright specialist config passes **13/13 tests**. Coverage includes Commerce
read-only/sourcing/claim-draft journeys, Finance expense and approved-return review, Inventory
Procurement RFQ and branch-transfer handoffs, SEO content brief/Search Console disclosure/off-page
evidence, Customer privacy-aware review and segment workflow, and cross-agent orchestration/trace.
AI toggles are disabled in these flows where applicable, so no paid AI provider request is made.
The first run found a stale Customer UI-copy assertion; the UI's newer send-authorization wording
was already correct, and the assertion was updated before the clean rerun. No migration, commit or
push. These isolated flows do not establish live provider behavior or full production acceptance.

## Specialist operations — Commerce registry tool execution timing (2026-11-02)

The owner-facing AI Settings operations view now groups persisted `CommerceAgentToolRun.durationMs`
by tool key for completed and failed calls made by the Commerce agent and its internal orchestrations.
It reports p50/p95 and sample count over the existing 30-day business-scoped window, capped at the
5,000 most recent calls. Manual user tool runs, blocked/refused calls, other agents, provider round
trip, queue wait and business impact are excluded. This is the elapsed time saved by the Commerce
tool registry, not a provider-side latency measurement.

The real-MySQL AI Settings spec passes **1 suite / 4 tests**, verifying p50/p95 plus exclusion of
manual calls, a call outside the 30-day window and another business's call. Backend and frontend
`tsc --noEmit` pass; backend ESLint passes with the file's existing formatting-only findings
excluded, and frontend ESLint passes. Prisma generation and the backend build pass. Full backend
Jest passes **440/440 suites / 2,779/2,779 tests**. The focused cross-agent Playwright flow passes
**1/1** with provider toggles disabled, checking the honest no-sample state and no browser/API 5xx
errors. No migration, paid provider call, commit or push. Other agents' per-tool timing and live
provider/production acceptance remain open.

## SEO Agent — read-only GA4 attribution in Settings, Reports and agent evidence (2026-11-02)

Added a Google Analytics 4 read-only connector using the Analytics Admin and Data APIs. A business
can connect a Google account, list only properties accessible to that account, choose one, and
sync two consecutive 28-day Organic Search channel windows for sessions, key events and
property-reported total revenue. Values are stored as property-scoped aggregate metadata alongside
the existing integration record; refresh and selection preserve unrelated metadata, and OAuth
reconnection clears the previous account's selected-property and cached-report metadata. Backend
routes require `SEO_MANAGE` for property refresh, selection and sync, and each write is audited.

The selected GA4 aggregates now appear in the SEO Agent's saved evidence and the SEO Reports
summary. SEO Settings and Reports disclose when the provider, property or saved snapshot is absent.
SEO-attributed Noxtill orders, causal impact and external backlink authority remain untracked.
Page-level GA4 sessions are reported by landing-page path, but they are not reconciled to Noxtill
orders. GA4 total revenue follows the property's attribution/reporting settings
and may include purchase, subscription and advertising revenue less refunds; it is not the Noxtill
sales ledger. No live Google account or provider request was used during verification.

The hand-written MySQL migration `20261102140000_google_analytics_readonly` adds the enum value to
the 15 existing provider columns, was applied locally, and `prisma migrate status` reports the
database up to date. Information-schema verification found the new enum member on all 15 columns.
The connector and SEO analytics real-MySQL specs pass **3 suites / 19 tests**; the Reports and
analytics real-MySQL specs pass **2 suites / 9 tests**. Both backend and frontend `tsc --noEmit`
pass; focused ESLint passes with the repository's pre-existing Prettier-only formatting rule
disabled for compact legacy files. Full backend Jest passes **442/442 suites / 2,791/2,791 tests**.
The isolated specialist Playwright suite passes **14/14**, including the GA4 disconnected state in
Settings and Reports. The browser checks report no console errors or API 5xx responses. No commit
or push was made. This closes aggregate SEO analytics-source wiring but does not complete the Five
Specialized AI Agents specification or production acceptance.

## SEO Agent — Organic Search landing-page evidence (2026-11-02)

The read-only GA4 sync now also requests the Data API's `landingPage` dimension for the same two
28-day windows, filtered to Organic Search and ordered by sessions. It stores up to the provider's
250 returned paths per window, reports whether the response was truncated, and surfaces the current
period's page paths, sessions, key events and property-reported revenue in SEO Settings, Reports
and saved SEO Agent evidence. The path-only dimension omits query strings; common email, phone and
opaque-ID path segments are redacted before persistence. If this additional report fails, the
aggregate GA4 sync still saves and page-level data is disclosed as unavailable. Google defines
`landingPage` as the page path associated with the first pageview in a session. These values still
do not show that SEO work caused traffic or sales, and revenue is not reconciled to Noxtill orders.

The connector, analytics, reports and SEO agent real-MySQL tests pass; the full backend suite passes
**442 suites / 2,793 tests**. Backend and frontend `tsc --noEmit`, touched-file ESLint and the
isolated five-specialist Playwright suite pass (**14/14**). Browser QA covers the disconnected GA4
state; no live GA4 property/account was available for provider testing. No schema or migration
change, provider call, commit or push was made.

## SEO Content — GA4 landing-page evidence in the refresh queue (2026-11-02)

The Content SEO refresh queue now matches published page paths against the latest saved GA4
Organic Search landing-page report and shows that page's sessions, key events, property-reported
revenue, currency and report window. When the property, report or path row is unavailable, the UI
states that explicitly; if the returned landing-page list was truncated, a missing page is not
presented as zero traffic. The view links to SEO Settings when GA4 is not connected and discloses
that attribution does not establish SEO causality. No GA4 provider request or new migration was
needed.

The cross-module copy check found traffic disclaimers that could be read as product-wide claims.
Website Overview now says that its own page list does not use page-view data, and Commerce
Experiment Lab and Store Optimizer describe the missing storefront analytics within those views;
they do not contradict GA4's SEO-only Organic Search reports.

The isolated browser journey creates an explicitly named QA business, keyword, content brief and
published test URL, then verifies the disconnected state and absence of the stale "Not tracked"
claim, with no browser console errors or API 5xx responses (**1/1**). Backend and frontend
`tsc --noEmit`, touched frontend ESLint and scoped `git diff --check` pass. Backend ESLint reports
one existing Prettier-only finding at line 491 of `commerce-experiments.service.ts`, outside the
comment changed in this slice. The full backend Jest run passes **442/442 suites / 2,793/2,793
tests**. No commit or push was made. Live GA4 property behavior and production acceptance remain
unverified.

The full isolated specialist browser configuration was rerun against the current worktree and
passes **15/15**, including Commerce approvals/drafts, Finance, Inventory handoffs, SEO pages and
provider disclosures, Customer review and cross-agent orchestration. These flows use test businesses
and disable paid AI calls where applicable; they do not close the documented cross-agent material
action gap or establish live provider and production acceptance.

## Customer Agent — booking and support context in saved reviews (2026-11-02)

Saved Customer Intelligence business reviews now include tenant-scoped canonical Appointment and
CustomerSupportTicket aggregates. Appointment statuses use the trailing 90 days by `startsAt`, and
the next 30 days count booked/confirmed appointments separately. Support status counts use the
trailing 90 days by `createdAt`; the open backlog is the current unresolved count, including older
tickets. Records associated with erased customer profiles are excluded. Ticket content, customer
identifiers and contact details are not saved or sent to AI. Because these source models have no
branch association, a selected-branch review marks this context unavailable instead of attributing
business-wide values to a branch. Unified Inbox conversations also remain unlinked to CRM profiles
in the current schema.

The real-MySQL Customer Agent spec passes **1 suite / 9 tests**, including time-window boundaries,
upcoming appointments, unresolved older tickets, erased-profile exclusion, tenant isolation and
privacy checks. Backend and frontend `tsc --noEmit`, touched-file ESLint and `git diff --check` pass.
The isolated all-agent Playwright journey passes **1/1** in a newly created QA business, with no
browser console errors or API 5xx responses; the in-app browser itself was logged out, so no manual
signed-in visual review was performed. Full backend Jest passes **442/442 suites / 2,794/2,794
tests**. No migration, provider call, commit or push was made. This closes one Customer 360 evidence
gap only; all-channel customer activity/outcomes, provider acceptance and the broader five-agent
specification remain incomplete.

## Customer Agent — contact-format data-quality counts (2026-11-02)

The saved CRM data-quality review now checks all active, non-erased customer profiles in stable
500-row batches. It reports email values that fail the existing `class-validator` email rule,
phone values that cannot be parsed by the canonical `normalizePhoneE164` utility with the
business's country, and valid phone values that need E.164 normalization. These counts are
separate from blank email/phone fields and the exact-match duplicate-pair summary. Values and
customer identities are not included in saved evidence or the optional AI summary. Historical
reviews that predate these counters disclose them as not assessed rather than rendering
`undefined`. This is format validation only; it does not check mailbox/number ownership,
deliverability or provider eligibility.

The Customer Agent real-MySQL spec passes **1 suite / 9 tests**, including deltas for each new
format count, canonical US phone normalization, tenant/profile privacy, and assertions that sample
email/phone values do not appear in the persisted run or AI payload. Backend/frontend
`tsc --noEmit` and ESLint on all four touched source/spec files pass. Scoped `git diff --check` on
the tracked Customer UI file passes; the repository-wide check reports a pre-existing blank line at
EOF in `backend/src/marketing/automations/workflows.constants.ts`, outside this slice. The isolated
five-agent Playwright browser journey passes **1/1**, with no browser console errors or API 5xx
responses. The first full backend run had a MySQL unique-phone collision in
`voice-supervisor.service.db.spec.ts`; that suite passed alone (**1 suite / 2 tests**) and the full
rerun passed **442/442 suites / 2,794/2,794 tests**. No migration, provider call, commit or push was
made. This improves the CRM data-quality review only; the remaining specialist scope and external
acceptance gaps remain open.

## Customer Agent — duplicate-match evidence and comparison (2026-11-02)

The canonical Customer Duplicates page now returns one candidate pair even when both records match
on more than one configured exact field. Each pair includes the normalized matching signal and a
comparison of name, phone, email and address; the page shows those record values side by side and
highlights fields that differ before the existing owner-controlled merge action. No automatic merge
was added. Erased customer profiles remain excluded. If the UI receives an older response without
the new comparison fields, it now reports that the details are unavailable rather than crashing.

The real-MySQL duplicate/erasure and Customer Intelligence specs pass **2 suites / 10 tests**.
Backend/frontend `tsc --noEmit` and ESLint on the touched backend and frontend files pass. The new
isolated Playwright journey creates two QA profiles with a shared email, checks the comparison and
merge dialog, checks there are no browser console errors or API 5xx responses, then erases the two
profiles; it passes **1/1**. It used the fresh source-backed backend on port 5002 for the duplicate
API because the existing port-5001 process serves an older compiled build; that old response was
what exposed the previous UI crash and the new fallback was also exercised. The full backend Jest
run passes **442/442 suites / 2,794/2,794 tests**. No migration, provider call, commit or push was
made. This closes a Customer duplicate-review evidence gap only; it does not complete the overall
five-agent specification or production/live-provider acceptance.

## Finance Agent — approved-budget event review (2026-11-02)

Finance budgets can now opt into a read-only Finance Agent review after a budget revision is
approved. The event is queued only after the approval transaction commits, defaults off, and cannot
undo the approval if queueing fails. The worker rechecks tenant, Finance module, agent and event
policies, plus the exact approved budget version and review timestamp before it runs. It stores an
event trigger reference to the canonical FinanceBudget id and version, and disables AI explanation
generation for this event path. No journal, budget, expense or external accounting record is changed.

Real-MySQL producer and worker specs pass **2 suites / 7 tests**, covering opt-in/default-off,
post-commit queueing, approval surviving queue errors, exact-version validation, tenant/module/policy
checks, event idempotency and source references. The isolated browser flow creates a QA business,
approves a budget, verifies the Settings toggle, and observes the matching event run; it passes
**1/1** with no page-console errors or API 5xx responses. Backend and frontend `tsc --noEmit`,
touched backend ESLint, frontend E2E ESLint, Nest build and scoped diff check pass. Full backend Jest
passes **443/443 suites / 2,799/2,799 tests**. No migration or provider call was needed. No commit or
push was made. This adds one Finance event trigger; the cross-agent action lifecycle, other documented
provider/outcome/operations gaps and live-provider acceptance remain open.

## Finance Agent — posted-journal review and event routing (2026-11-03)

Finance can optionally queue a deterministic, read-only review after a manual journal is committed
as posted. The default-off event rechecks the business/module/agent policies and the canonical
journal status and timestamp before creating an idempotent run with an exact journal reference; it
does not post or change any accounting record. Browser QA also exposed a BullMQ routing defect:
five separate workers were consuming one Finance queue, so a worker for another event type could
acknowledge a job without running its matching handler. One dispatcher now routes all five Finance
event types to their matching handler and fails unknown job names instead of silently acknowledging
them.

The real-MySQL Finance event and producer checks pass **5 suites / 26 tests**; backend/frontend
`tsc --noEmit`, Nest build, the targeted Finance ESLint set and scoped `git diff --check` pass. Full
backend Jest passes **445/445 suites / 2,809/2,809 tests**. The isolated approved-budget browser flow
passes **1/1** with no page-console errors or API 5xx responses. No external AI/provider call or
migration was needed. No commit or push was made. This closes and verifies one Finance event path;
it does not complete the five-agent specification or production/live-provider acceptance.

## Customer Agent — event review to internal follow-up task (2026-11-03)

A manager can turn a current failed-delivery, appointment no-show or appointment-cancellation review
into an internal CRM follow-up task from Customer Insights. The API rechecks tenant ownership, the
exact source event version, current source status and active/non-erased customer before delegating
task creation to the canonical CRM service. Deterministic idempotency keys prevent duplicate tasks,
and the task audit records the source recommendation. These actions never draft or send a customer
message; the UI says so. If the source changed since review, task creation is refused.

Real-MySQL coverage passes **1 suite / 16 tests**, including duplicate replay and stale-source
refusal for the event task paths. The focused browser journey passes **1/1** against the
source-backed API and existing local frontend, including the failed-delivery recommendation, task
creation, duplicate replay, absence of a message draft, and no browser console/API 5xx errors.
Backend/frontend `tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. Full backend
Jest passes **445/445 suites / 2,811 tests**. No migration, provider call, commit or push was made.
This closes task handoff for the three implemented Customer event-review types; it does not complete
the five-agent specification or its documented provider, outcome, operations and acceptance gaps.

## Commerce Agent — preserve partial review enrichment (2026-11-03)

The Commerce Agent still requires its canonical status snapshot, but now reads the eight supporting
sources independently. A failure in one source no longer discards completed results: the run is
saved as `partially_succeeded`, records each source's completed/failed state, duration and safe
error code, marks unavailable evidence explicitly, and adds that source to the missing-data notes.
The UI lists each source status. A partial review no longer presents a missing queue as empty or
claims that no review cue exists when a supporting source could not be read. No Commerce record is
mutated.

The Commerce Agent real-MySQL spec passes **1 suite / 17 tests**, including an injected source
failure, preserved successful results, partial run/audit state, and confirmation that private error
text is not persisted. Backend/frontend `tsc --noEmit` and ESLint on the touched backend, frontend
and browser-spec files pass. Full backend Jest passes **445/445 suites / 2,812 tests**. The isolated
Commerce Agent Playwright flow passes **1/1** against the source-backed API, with no browser console
or API 5xx errors. A temporary source backend was stopped after QA; its existing voice reconciliation
worker did attempt status checks for stale saved call records and received HTTP 404 responses. No
migration or commit was made, and nothing was pushed. This improves partial-failure handling only;
the provider, outcome-measurement, operations and production-acceptance gaps in the agent map remain.

## Shared specialist API directory and action list (2026-11-03)

Added capability-protected `GET /api/v1/agents`. It reads the five identities from the shared
registry and returns only safe fields: module identity, supported triggers, the agent and module
switches, effective enablement, and the opt-in daily-review switch. It does not return raw policy
JSON, provider configuration or secrets. Module disablement and the agent switch are reported
separately so a stored-on agent under a disabled module is not shown as runnable.

Also added owner-only `GET /api/v1/agent-actions` as a read-only, tenant-scoped lifecycle listing.
It supports validated agent, state, module and action-type filters, stable cursor pagination, and
rejects cursors outside the active business/filter scope. The response is limited to lifecycle
metadata; proposed payloads, reasons, actual results and raw error messages are not returned.
Approval and execution remain owned by canonical module services; this does not add a duplicate
Action Center or a generic write path.

Real-MySQL specs cover agent/module policy resolution across businesses, tenant separation, filtered
cursor pagination, invalid cursors and private-field exclusion; a controller spec covers the
action-list owner gate. The focused tests pass (**3 suites / 6 tests**). Backend and frontend
`tsc --noEmit`, targeted backend ESLint and the full backend Jest suite pass (**448 suites / 2,818
tests**). No schema change or migration was needed. These API-only additions have no new browser
surface. Generic approval/execution, broader action orchestration, provider confirmation and
outcome-measurement gaps remain open.

## Master specification reconciliation (2026-11-03)

This maps the client's master spec sections to the repository evidence above. “Partial” means the
repository has working code in that area but does not meet every behavior or acceptance clause in
the spec; it must not be counted as a release pass.

| Spec section | Current repository status | Remaining proof/gap |
| --- | --- | --- |
| 4–8 Shared architecture, lifecycle, evidence, policies and records | Partial | Shared run/evidence/recommendation/action records, immutable tenant configuration history, AI guardrails, audit, idempotency and tenant scope exist. The typed gateway records redacted calls for Commerce, Inventory, SEO, Finance's canonical P&L and descriptive month-over-month variance, approved-budget/expense comparison, relative cash-flow projection, Xero open-items, Xero bank-transaction status, imported-statement match candidates, period-close readiness, partial manual-journal trial balance, bounded posted manual-journal entries, a partial A/R-A/P source summary and exact-match expense duplicate candidates, and Customer's canonical analytics summary, review context and repeat-visitor preview. Owner-configurable provider/input/output limits, shared and per-agent tool-call ceilings, and a shared material-action cap apply per run; Commerce also has a read-tool ceiling and a per-business write-tool allow-list rechecked before approval execution. Full evidence authorization and approval coverage across every action class remain incomplete. |
| 9 SEO Autopilot | Partial | Module screens, GSC/GA4/rank evidence, versioned drafts and approval handoffs exist. Backlink authority is unavailable without a provider; full publish confirmation, independent verification and action-linked outcome measurement remain incomplete. |
| 10 Autonomous Commerce | Partial | Canonical Commerce sources, permissioned tools, drafts and some approved actions exist. A bounded order-to-route review is not the spec's multi-domain orchestrator; worker delegation, end-to-end provider confirmation, recovery and measured outcomes are not complete across connectors. |
| 11 Inventory Intelligence | Partial | Deterministic reorder, history/backtest evidence, Procurement handoff, transfer checks, count/wastage reviews, waitlist preview, and bounded read-only stock-balance, movement-history, recorded-sales-velocity, open-purchase-order and live stock-count-variance tools exist. Forecasts are not accepted as calibrated; seasonal adjustment, stockout-censored demand and complete reservation/in-transit coverage are not established. |
| 12 Financial Intelligence | Partial | Profit summaries, budgets, manual journals, statement suggestions, Xero status, anomaly cues and close readiness exist. The Finance specialist can read the canonical Profit Analytics statement and descriptive month-over-month comparison, approved-budget versus recorded-expense comparison, relative Cash Flow projection, privacy-minimized Xero open-items and bank-transaction status summaries, imported-statement match candidates, period-close readiness, partial posted-manual-journal trial balance, bounded posted manual-journal entries, a partial receivable/payable aging source summary and exact-match expense duplicate candidates through the shared tool gateway. That aging summary keeps Credit balance age and connected Xero open items separate; customer-credit age is not invoice due-date aging or a finance-owned A/R control account, and the absence of a native Noxtill finance ledger is explicit. Duplicate groups are human-review candidates, not confirmed duplicates, fraud or savings. Xero bank transaction flags are not Noxtill reconciliation; imported match candidates remain suggestions until a human accepts them; the projection is not a bank balance and Xero data remains an external connected-organization summary, not a native Noxtill subledger. A complete finance-owned ledger, authoritative cash balance, A/R and A/P subledgers, full reconciliation and certified close are unavailable in the current source model. |
| 13 Customer Intelligence & Retention | Partial | Customer reviews, privacy-minimized context, deterministic segment drafts, duplicate review, follow-up tasks and consent-gated message drafts/actions exist. All-channel activity, provider-confirmed delivery and broad post-contact outcome coverage remain incomplete. |
| 14 Cross-agent boundaries and normalized events | Partial | Tenant-scoped, versioned event references, dedupe/retry and opt-in scheduled/event reviews exist. Twenty-two source paths are currently wired (verified from the 22 policy switches and producer processors); the remaining illustrative event families and material cross-agent action handoffs are not implemented. |
| 15 Shared and module API contracts | Partial | Shared `GET /agents`, owner-only `GET/PATCH /agents/:agentKey/config` with an allowlisted policy-key set, validation, optimistic config versions and audit history, owner-only `GET /agents/:agentKey/configuration-history`, `GET /agent-actions`, `GET /agent-runs/:id`, redacted `GET /agent-runs/:id/evidence`, and metadata-only cursor-paged `GET /agent-runs/:id/events` expose safe directory/lifecycle metadata; module APIs and canonical actions exist. Action decision endpoints have canonical adapters for Inventory reorder requests (including shared Commerce RFQ sourcing, purchase-order execution and cancellation before conversion), Customer segment actions and Customer event follow-up tasks; broader action-class coverage remains incomplete. The specialist config API is not a replacement UI for the existing Settings screens. |
| 16 Jobs, idempotency and recovery | Partial | Durable cross-agent review jobs, per-event idempotency/retries and several worker recovery paths exist. Cross-agent material-action orchestration, provider-timeout reconciliation and all action-class cancellation/compensation paths remain incomplete. |
| 17 UX and accessibility | Partial | Existing module screens expose evidence, missing-data, approval, failure and partial states; browser journeys cover key QA flows. Keyboard/screen-reader/mobile acceptance has not been completed across all relevant screens. |
| 18 Security, privacy and compliance | Partial | Tenant isolation, capability gates, consent checks, redaction and audit coverage have real tests. AI Settings now exposes a limited redacted feed of selected saved denial events. Full field-level scope on every cross-module tool, prompt-injection evaluation, comprehensive security-event monitoring and independent security review remain outstanding. |
| 19 Observability, analytics and cost controls | Partial | Persisted usage, caps, run/action summaries, selected latency/denial metrics, redacted monthly budget-limit events, and tenant-scoped queued-run age with an optional owner threshold alert exist. Provider invoices, complete tool/provider latency, live Redis/BullMQ depth, worker health, outcome rates and production alert delivery are not verified. |
| 20 QA and acceptance | Incomplete | Full backend tests, both type checks, touched-file lint and isolated Playwright journeys pass at current checkpoints. Load/resilience, red-team, broad accessibility, live provider acceptance and complete cross-agent end-to-end journeys remain. |
| 21–22 Roadmap and definition of done | Not satisfied yet | These sections require the applicable gaps and acceptance gates above to be closed and evidenced; prior passing tests or a complete spec document alone do not satisfy them. |

## Inventory Agent — owner-reviewed shared RFQ action lifecycle (2026-11-04)

The central Specialist Action audit can now source an approved Inventory reorder request into the
existing shared Commerce RFQ engine. The owner action requires the exact reviewed Procurement
request version and reuses the canonical Commerce RFQ service, which rechecks Inventory evidence,
agent/module policy and Procurement scope. The action records execution, success and verification
transitions and re-reads the RFQ to confirm the same-business source link. Retries reuse the active
linked RFQ; stale evidence records a typed failed action and creates no RFQ. The AI Settings action
audit exposes this choice beside purchase-order conversion and discloses that it creates a draft,
does not contact suppliers and does not create a purchase order.

Real-MySQL coverage passes **2 suites / 31 tests**, including approval → shared RFQ → verification,
idempotent retry, supplier-not-contacted and purchase-order-not-created assertions, and stale-evidence
failure auditing. Backend/frontend `tsc --noEmit` and touched-file ESLint pass. Full backend Jest
passes (**454 suites / 2,857 tests**). The isolated Inventory → shared RFQ Playwright journey passes
(**2/2 including QA setup**); it signs into a fresh QA business, creates a draft RFQ through the owner
action audit, and verifies the linked Procurement status with no browser or API-5xx errors. The test
proxy keeps the long-lived activity stream on the existing frontend proxy. No migration, provider
call, commit or push was made. This closes the owner action-adapter gap for Inventory RFQ sourcing;
universal tool/action coverage and the other gaps in the master reconciliation remain open.

This reconciliation makes the current completion estimate an engineering estimate only; no section is
being marked fully accepted based solely on the existence of its initial vertical slice.

## Commerce specialist — business write-tool allow-list (2026-11-04)

Added an owner-managed `commerce.agentAllowedWriteTools` policy, displayed in AI Settings and
Agents & Tools. The Commerce registry reports each tool's allow-list status. Write execution checks
the registered key in addition to autonomy, pause, risk, approval and executable gates. Unknown,
duplicate, empty-entry or malformed configuration fails closed for all Commerce writes while
read-only tools remain available. Pending RFQ-award and supplier-claim approvals recheck the current
allow-list at decision time; revoked tools are refused and audited before reaching the canonical
service. No migration was required; existing businesses resolve the policy default and preserve the
prior autonomy/approval behavior.

Focused real-MySQL coverage passes (**1 suite / 34 tests**). Backend and frontend `tsc --noEmit`
pass; the Commerce Agent Playwright journey passes (**2/2 including QA setup**) and verifies saving
the allow-list through AI Settings, the excluded-tool status, and no browser/API errors. Full backend
Jest passes (**453 suites / 2,851 tests**). Frontend touched-file ESLint passes. Backend ESLint
reported only existing Prettier-formatting findings elsewhere in the pre-existing policy files;
the newly added enforcement, spec assertions and Intelligence Settings row have no lint findings.
The change is local and uncommitted; no push or provider call was made. This is a Commerce-specific
tool-key allow-list, not yet a shared allow-list gateway for every specialist agent, so the broader
specification remains incomplete and is not production accepted.

## Specialist Operations — redacted security-denial feed (2026-11-04)

AI Settings now includes a tenant-scoped recent-denial feed beside the existing limited denial
counters. It combines only selected audit actions for denied cross-tenant run probes, Commerce tool
blocks and approval refusals, and Customer message-queue refusals with blocked/refused registered
tool-call records. The response is capped and includes safe event identifiers, event/tool labels,
timestamps, target references and error codes; it never selects audit before/after payloads or tool
input/output contents. The UI explicitly says this is not a complete security-event feed. The
Commerce summary prompt now labels the canonical snapshot as untrusted data and applies the shared
prompt-injection policy.

Real-MySQL specs cover event selection, tenant isolation, repeated-denial alert thresholds, payload
exclusion and the Commerce summary prompt boundary. The Credit Reminders same-day dedup test now uses
the identical instant for its repeat call; the prior +60-minute fixture crossed UTC midnight on a
Pakistan-local early morning and therefore was testing a second UTC day. Production scheduler
behavior was left unchanged. Full backend Jest passes **453 suites / 2,845 tests**; backend and
frontend `tsc --noEmit` pass; touched-file backend/frontend ESLint passes; scoped `git diff --check`
passes. The AI Settings Playwright journey passes **1/1** against the source-backed local API, with
no browser/page errors or API 5xx responses; the redacted denial empty state screenshot was inspected.
Twilio credentials were blank for local startup, no Twilio call was made, and both servers were
stopped after QA. No migration, commit or push was made. This is a limited surfaced audit feed, not
comprehensive security monitoring or production acceptance; the broader gaps in the reconciliation
above remain.

## Shared specialist run detail API (2026-11-03)

Added owner-only `GET /api/v1/agent-runs/:id`. Lookup is restricted to the authenticated tenant and
returns run identity/status/timestamps/error code plus counts of recommendations, evidence and
actions. It intentionally omits free-text output, input references and provider error text; detailed
review remains in the canonical module. This adds the shared run-detail contract without creating a
second source of truth or exposing raw model output.

The real-MySQL service spec and controller authorization spec pass **2 suites / 3 tests**, including
cross-tenant refusal and output/input/error redaction. Backend and frontend `tsc --noEmit`, targeted
ESLint and full backend Jest pass (**450 suites / 2,821 tests**). No migration, browser surface,
provider call, commit or push was involved. The evidence detail endpoint is added in the follow-up
entry below; other API/action lifecycle gaps remain open.

## Shared specialist run evidence references (2026-11-03)

Extended the shared run API with owner-only `GET /api/v1/agent-runs/:id/evidence`. It is scoped to
both the authenticated business and requested run, uses stable cursor pagination, and returns source
and resource references, field references, freshness and observation timestamps. `observedValues` and
free-text run output are not returned; the canonical module screen remains the place to inspect
business details. The endpoint rejects a cursor belonging to another run or tenant.

The real-MySQL/controller specs pass **2 suites / 5 tests**. Backend and frontend `tsc --noEmit`,
targeted ESLint and the complete backend Jest run pass (**450 suites / 2,823 tests**). No schema
change, migration, provider call, browser surface, commit or push was involved. This provides a
redacted evidence-reference path; per-source user permissions and generic action approval/execution
remain incomplete.

## Finance Agent — imported-statement event review (2026-11-03)

Statement imports can now opt into one deterministic, read-only Finance review. The producer queues
only after the statement transaction commits and sends the import identity and saved timestamp, not
the source CSV or bank descriptions. The worker rechecks the business, Finance module, agent/event
switches and exact import timestamp before using the canonical period and row count as a versioned
event reference. A duplicate delivery is idempotent; queue failure does not undo the saved import.
No statement match is accepted automatically.

The real-MySQL producer/worker and dispatcher specs pass **3 suites / 16 tests**. Both type checks,
touched-file lint (with existing repository-wide Prettier noise suppressed only for the old compact
reconciliation files), and the full backend Jest run pass (**451 suites / 2,828 tests**). The isolated
browser journey passes **1/1**, verifying the saved setting and a matching statement-import event run
with no browser console errors or API 5xx responses. Redis and MySQL were local; no external provider
call, schema migration, commit or push was made. This adds one opt-in Finance event source and does
not close the broader agent, provider, operational or production-acceptance gaps above.

## Shared specialist action detail API (2026-11-03)

Added owner-only `GET /api/v1/agent-actions/:id`. The endpoint is tenant-scoped and returns safe
action metadata plus ordered lifecycle events while excluding proposed payloads, expected
postconditions, decision reasons, metadata, actual results, verification results and raw error
messages. The existing action list and canonical module services remain authoritative; this is a
read-only detail view and adds no generic action execution path.

The real-MySQL service and controller specs pass (**2 suites / 6 tests**). Backend and frontend
`tsc --noEmit`, targeted backend ESLint, and the full backend Jest run pass (**451 suites / 2,830
tests**). The specialist Playwright suite passes (**18/18**) with its browser/API error checks. No
migration, provider call, commit or push was made. Generic action approval/execution/cancellation,
full cross-agent orchestration, provider confirmation and production acceptance remain open.

## Shared specialist run history list and AI Settings view (2026-11-03)

Added owner-only `GET /api/v1/agent-runs` with validated agent/status filters, stable cursor
pagination and tenant/filter-scoped cursor validation. The response contains lifecycle metadata and
related counts only; model output remains redacted. AI Settings now shows a recent-run table with
agent/status filters, refresh, and honest empty/error states. A real-MySQL/controller spec covers
filtering, paging, redaction and owner authorization. Isolated Playwright QA creates a separate QA
business, checks the empty state, creates a real run through the API, confirms the redacted response
and filtered row, and checks browser/API errors; it passes **1/1**. Focused backend tests pass **2
suites / 7 tests**. Backend and frontend `tsc --noEmit`, touched-file ESLint and scoped
`git diff --check` pass. The latest full backend Jest run had **450 suites pass and 1 unrelated
orchestration-suite cleanup failure (2,832 tests passed)**; that failed suite passed alone (**12/12**),
consistent with concurrent MySQL cleanup contention. No migration or provider call was needed; no
commit or push was made. This adds run visibility, not the still-missing versioned tenant agent
configuration history, universal typed tool gateway, broad action lifecycle, or production
acceptance.

## Shared specialist run history — evidence drill-down and paging (2026-11-03)

Extended the owner-only AI Settings run table with independent agent/status filters, older/newer
cursor navigation, and an expandable list of saved source references. The panel shows source and
resource identifiers, referenced fields, freshness, and observation/fetch times; the API response
continues to redact observed values and model output. Empty runs say that no source evidence was
saved rather than implying that the business has no underlying records.

Backend and frontend `tsc --noEmit`, touched-file ESLint and scoped `git diff --check` pass. The
full backend Jest rerun is clean (**451 suites / 2,832 tests**). The full specialist-agent Playwright
suite passed **19/19** before the final pagination/filter refinement; the run-history browser test
passed again **1/1** after those changes, including the selected-agent filter and evidence panel.
Focused MySQL/controller coverage remains **2 suites / 7 tests**. No migration or provider call was
needed. No commit or push was made. This improves run inspection and navigation only; the shared
configuration history, universal typed tool gateway, cross-agent action lifecycle and production
acceptance gaps in the reconciliation above remain open.

## Commerce Agent configurable read-tool ceiling (2026-11-03)

Added the owner-configurable `agents.commerceMaxReadToolCallsPerRun` policy in AI Settings. It
defaults to 3 and accepts integer values from 1 to 20. Commerce Agent snapshots the resolved limit
for each question, blocks and audits registered read-only tool requests over the limit, and reports
the configured ceiling in its result. The real-MySQL test confirms a limit of 1 allows the first
registered tool and refuses the next two; the Settings test verifies the default, saved value and
invalid-value rejection. The isolated Commerce browser journey verifies the saved setting in the UI
and that the existing agent experience still reports disabled AI honestly.

Both `tsc --noEmit` checks pass. Full backend Jest passes (**451 suites / 2,833 tests**), and the
focused Commerce browser test passes (**1/1**). Touched implementation lint passes; the older
`settings-hub/hub.service.spec.ts` still has pre-existing lint findings outside this change, so that
file is not represented as lint-clean. Scoped `git diff --check` passes. No migration, external
provider call, commit or push was made. This closes the configurable per-run read-tool ceiling for
Commerce only; it does not close the universal typed tool gateway, versioned agent configuration,
generic action lifecycle or production acceptance gaps in the reconciliation above.

## Shared specialist material-action run ceiling (2026-11-03)

Added the owner-configurable `agents.maxMaterialActionsPerRun` policy in AI Settings (default 10,
range 1–100). The shared action-creation helper locks the persisted run row inside the caller's
MySQL transaction before checking the count, making the cap safe when different workers propose
actions concurrently. Every created action records the effective cap and its ordinal in the
append-only action event metadata. Duplicate idempotent retries return the existing action and do
not consume another slot. Canonical module services remain responsible for approvals and writes.

Real-MySQL tests cover the default/saved/invalid setting, duplicate retry behavior, limit refusal,
and two concurrent action proposals where exactly one succeeds at a limit of 1. The isolated
Commerce browser journey passes (**1/1**) and confirms both Commerce read-tool and shared action
limits display their saved values. Backend and frontend `tsc --noEmit` pass; targeted implementation
ESLint and browser-spec ESLint pass. Full backend Jest passes (**451 suites / 2,835 tests**).
`settings-hub/hub.service.spec.ts` also passes ESLint with only its pre-existing Prettier formatting
rule disabled; unsafe mock/error assertions now have explicit types. No migration, external provider
call, commit or push was made. This is a shared action-proposal ceiling only; it does not add a
universal typed tool gateway, generic action execution, or close the other open lifecycle and
acceptance gaps.

## Specialist action decisions through canonical modules (2026-11-03)

Added owner-only shared endpoints for approve, reject, execute and cancel. Inventory reorder actions
delegate to the existing Procurement service, which retains request-state, supplier, policy,
conversion and verification checks; cancellation records the supplied reason in the canonical
Procurement event and action history. Customer segment approval/rejection delegates to the existing
Customer Segment Draft service and requires the exact draft version, with payload and audience-count
hashes for approval. Unregistered action types are refused with a typed conflict instead of being
written through a generic path. The existing AI Settings action-audit panel now exposes approve,
reject, cancel and purchase-order execution controls for Inventory reorder actions.

The MySQL-backed action-routing/controller tests pass (**2 suites / 13 tests**), backend and
frontend `tsc --noEmit` pass, and ESLint passes on the touched implementation and E2E files. The
specialist-agent browser journey passes (**1/1**, plus its QA-business setup); it creates a request,
approves it from the owner audit panel, creates the purchase order, and confirms the canonical
Procurement status. The full backend Jest suite has not yet been rerun after this change. The latest
full run before it had 448/451 suites pass; the 3 timed/cleanup failures passed when rerun alone.
No migration, external provider call, commit or push was made. Other action types still use their
canonical module review screens; shared cancel/execute adapters are intentionally not claimed for
them.

## Shared specialist tenant configuration history (2026-11-03)

Added immutable per-business configuration snapshots for all five registered agents. Snapshots include
the agent's resolved policy values, its AI feature toggle, and the shared AI cost/rate/quota limits;
credentials are excluded. Policy and AI Settings changes record before/after versions under a lock on
the business row, and runs pin the version present at run creation. Owner-only
`GET /agents/:agentKey/configuration-history` returns the snapshots with tenant scoping. AI Settings
shows selectable agent history and a run's pinned configuration version.

Applied hand-written migration `20261103130000_specialist_agent_config_history` locally and verified
its business foreign key; Prisma reports all **237 migrations up to date**. The real-MySQL test covers
policy and AI-toggle changes, immutable hashes, run pinning/idempotent replay and tenant isolation.
Backend and frontend `tsc --noEmit`, touched-file lint, and the final full backend Jest pass (**453
suites / 2,844 tests**). Isolated browser QA passes (**1/1**) and verifies the saved disabled AI toggle
inside the selected agent's history; no browser console error or API 5xx was observed. No live AI or
external provider call was made. No commit or push was made. The universal typed tool gateway, broader
agent/action coverage and production acceptance gaps in the reconciliation remain open.

## Shared specialist tool-call ledger and operations metrics (2026-11-04)

Added tenant-scoped `SpecialistAgentToolCall` records for registered calls made by the Commerce
specialist loop. Records retain the tool/version, status, duration, retryability, safe error code,
resource reference, correlation ID, input-field names, and a canonical input hash; raw input values
and output bodies are not stored. Owner-only run diagnostics expose the redacted call list from
`GET /agent-runs/:id/tool-calls`, and the AI Settings run-history panel shows it. The Operations
summary now counts persisted calls by agent and status over its 30-day window and includes blocked /
refused call totals. Real-MySQL coverage verifies tenant and time-window isolation.

Applied hand-written migration `20261104100000_specialist_agent_tool_calls`; Prisma reports all
**238 migrations up to date**, and both foreign keys were verified in `information_schema`. Focused
MySQL/controller tests pass (**3 suites / 26 tests**), the AI Settings operations MySQL suite passes
(**1 suite / 4 tests**), backend and frontend `tsc --noEmit` pass, and the latest full backend Jest
run passes (**453 suites / 2,845 tests**). The isolated browser journey passes (**2/2**, including
QA setup) with no captured console errors or API 5xx responses. Frontend ESLint passes. Backend
ESLint passes with the existing Prettier-only violations disabled; the normal command reports three
formatting findings in untouched lines of the large AI Settings service. No provider call, commit,
or push was made. This records the real tool loop currently in use; it does not provide a universal
typed tool gateway or close the broader cross-agent action, security, operational, live-provider,
load, red-team, accessibility, and production-acceptance gaps in the reconciliation above.

## Registered specialist tool execution timing in Operations (2026-11-04)

Extended the Operations response and AI Settings table with per-agent, per-tool p50/p95 durations
from persisted `SpecialistAgentToolCall` rows. The query is tenant-scoped, limited to the 30-day
window, restricted to succeeded/failed calls that have a recorded duration, and capped to the 5,000
most recent timed records per business. Blocked/refused calls remain visible in the separate status
counts and are not counted as execution time. The empty state explicitly says that no timed
registered calls were measured.

The real-MySQL Operations test covers success/failure timings and excludes blocked calls, calls older
than 30 days and another business's calls. Focused Operations tests pass (**1 suite / 4 tests**),
backend/frontend `tsc --noEmit` and touched-file ESLint pass (backend with existing Prettier-only
findings disabled), the isolated browser journey passes (**2/2**, including setup), and the latest
full backend Jest run passes (**453 suites / 2,845 tests**). No migration, external provider call,
commit or push was made. This improves measured execution-time visibility; it is not a provider
latency, reliability, uptime, or business-outcome monitor, and the broader gaps above remain open.

## Specialist Operations — failed provider latency (2026-11-04)

Operations now reports separately measured p50/p95 provider round-trip time for failed AI calls,
using persisted `AiCallLog.providerLatencyMs` rows. This is separate from successful-call latency
and saved-run duration; calls that fail before a timed provider request or have no persisted duration
remain outside the sample. The UI labels both sample groups and uses an explicit empty state.

The real-MySQL AI Settings test covers a failed provider call and the zero-sample case. Focused
coverage passes (**1 suite / 4 tests**), backend/frontend `tsc --noEmit` pass, touched-file ESLint
passes (backend with existing Prettier-only findings disabled), and full backend Jest passes
(**453 suites / 2,845 tests**). The isolated Specialist Agent Run History browser journey passes
(**1/1**), including the empty failed-call state, with no captured browser console/page errors or API
5xx responses. Its screenshot was inspected. The Mac's interactive browser was unavailable while
the machine was locked; the local app was exercised in Playwright with the current source backend.
No migration, live provider call, commit or push was made. Provider invoice reconciliation, alerts,
uptime monitoring and the wider tool/action/outcome/security acceptance gaps remain open.

## Specialist Operations — redacted provider failure categories (2026-11-04)

Added `AiCallLog.providerFailureCode` and persist only the safe category produced by
`describeAiProviderFailure` (such as provider credit, access, model, rate-limit, configuration, or
generic request failure). Raw provider response text is not stored. Operations groups these codes
per specialist from tenant-filtered failed-call logs, and shows the code counts beside the failure
count; older failures without a code remain labelled as unclassified.

Applied the one-statement MySQL migration `20261104120000_ai_provider_failure_codes`, regenerated
Prisma Client, and confirmed Prisma reports **239 migrations up to date**. Focused real-MySQL and
error-disclosure tests pass (**3 suites / 30 tests**); backend and frontend `tsc --noEmit` pass, and
touched-file ESLint and scoped `git diff --check` pass. The Specialist Agent Run History Playwright
journey passes (**1/1**) with no captured browser/page errors or API 5xx responses. A first full run
had one unrelated Automations fixture-cleanup deadlock; that suite passed alone (**1 suite / 29
tests**), and the retry of the full backend Jest run passed (**453 suites / 2,845 tests**). No live
provider call, commit or push was made. This gives safe failure categories, not provider invoice
reconciliation, automated alerts, uptime monitoring, or production acceptance; the broader
cross-agent tool/action/outcome/security gaps remain open.

## Specialist-agent full browser QA on rebuilt source backend (2026-11-04)

The first browser pass used a stale `backend/dist` build: the updated AI Settings UI expected the
new failed-provider latency fields, while that compiled API did not return them. This made the AI
Settings route crash and caused dependent Inventory and orchestration checks to fail before reaching
their controls. After regenerating Prisma Client and rebuilding Nest from the current source, the
four affected journeys passed alone, then the complete configured specialist-agent Playwright suite
passed **19/19** with its QA business and temporary isolated Redis. The suite covered Commerce
claim/sourcing/review, Customer duplicate and failed-delivery flows, Finance reviews, Inventory
handoffs, SEO source/disclosure states, run history, agent config, and cross-agent orchestration and
trace. The initial stale-build failures are not counted as a code regression; the clean 19/19 rerun
is the current browser result. No live provider calls were enabled. Production provider, load,
red-team and accessibility acceptance remain outstanding.

## Specialist Operations — derived alerts (2026-11-04)

AI Settings now derives tenant-scoped warning rows from saved specialist data: failed runs,
provider failures, failed action verification, stale/missing sampled evidence, open material actions,
and configured monthly request/spend caps. Monthly caps raise warnings at 70% and critical alerts
at 90%. Open-action alerts include the current count and oldest last-updated age; they do not imply
an arbitrary SLA breach. Estimated spend remains an application estimate, not an invoice. The UI
states that cost-spike detection, provider health checks and live alert delivery are unavailable.

The real-MySQL test covers alert contents, tenant isolation, warning/critical budget thresholds and
open-action age. Backend/frontend `tsc --noEmit` pass; touched-file ESLint and `git diff --check`
pass. Full backend Jest passes **453 suites / 2,845 tests**. The complete configured
specialist-agent Playwright suite passes **19/19** on an isolated QA business and temporary Redis
with provider keys blocked. The run exposed a stale React Query duplicate-candidate list after the
Customer Agent found matching email records; the duplicate-review screen now refetches on mount, and
the previously failing Customer/Inventory journey passed in the full rerun. The Operations browser
journey asserts no page/console/API-5xx errors, and its alert panel screenshot was inspected. No
migration, provider call, commit or push was made. These are on-demand derived alerts, not
persisted/acknowledged incidents or live notifications; anomaly detection, provider-health checks,
delivery, load, red-team, accessibility and production acceptance remain open.

## Specialist Operations — denied-access alerts (2026-11-04)

Operations now raises a critical alert when the current business has a recorded denied cross-tenant
run probe, and a warning when at least three persisted registered specialist tool-call records are
refused or blocked in the 30-day window. It uses the persisted tool ledger for the repeated-denial
threshold so Commerce denials that may also have an audit row are not counted twice. Security alerts
remain visible when the operator filters the view to a single agent because the cross-tenant counter
is business-wide. The signal uses only existing audit and redacted tool-call records; it does not
claim to cover all security events or detect malicious intent. The Commerce agent's routine aggregate
summary now uses the common untrusted-data policy and JSON wrapper, matching the safeguards already
used by other specialist summaries and Commerce's interactive tool results.

Real-MySQL specs cover the cross-tenant critical alert, repeated-denial threshold, isolation from
another business, and Commerce summary prompt boundaries (**2 suites / 22 tests**). Backend/frontend
`tsc --noEmit`, touched-file ESLint and `git diff --check` pass; full backend Jest passes (**453
suites / 2,845 tests**). The Operations Playwright journey passes (**1/1**) against the source backend
with no page/console/API-5xx errors; Next Turbopack could not spawn its bundled worker in this shell,
so browser QA was rerun successfully with Webpack. Starting the local backend also activated its
existing scheduled voice reconciliation, which attempted provider status lookups for old call rows
and received HTTP 404s. No calls or campaigns were placed. No migration, commit or push was made.
These remain derived alerts, not a comprehensive security-monitoring system.

## Inventory specialist action decisions bind to the reviewed version (2026-11-04)

Shared Inventory reorder actions now require the exact Procurement request version shown in the
owner's action review. Approval, rejection, cancellation/withdrawal and purchase-order conversion
reject missing or stale versions with a typed conflict; the canonical Procurement transition also
checks the expected version before mutation. The action panel displays the proposal version and
sends it with each decision. The real-MySQL specs cover missing, stale and matching versions.

Focused MySQL/controller coverage passes (**4 suites / 26 tests**); the full backend Jest run after
the implementation passed (**453 suites / 2,849 tests**). Backend and frontend `tsc --noEmit`,
touched-file ESLint, and `git diff --check` pass. The isolated run-history browser journey passes
(**2/2 including QA setup**); the Inventory approval and purchase-order browser journey also passes
(**2/2 including setup**) and asserts the reviewed version is sent for both operations. The QA app
ran on the source backend with external provider credentials disabled; no live provider call was
made. No migration, commit or push was made. This closes one version-binding gap for Inventory
actions only; the broader cross-agent action, provider, operations, security and production
acceptance gaps in the reconciliation remain open.

## Specialist Operations — durable budget-limit events (2026-11-04)

Monthly per-agent request and spend denials, plus the configured per-run provider-request cap, now
write a durable `agent.budget.limit_reached` audit event after the reservation transaction rolls
back. The event has an ID, UTC occurrence time, source module, run/version reference, schema version,
correlation ID, agent key and typed limit code. It excludes prompt text and provider responses, and is
deduplicated to one event per business, agent, limit code and UTC month. AI Settings exposes the
tenant-scoped, redacted last-30-days events separately from security denials.

Real-MySQL tests cover monthly request and spend refusals, per-run limits, deduplication, payload
redaction and tenant isolation (**2 suites / 26 tests**). Backend/frontend `tsc --noEmit` pass;
touched backend ESLint passes with the repository's pre-existing Prettier-only finding in the AI
infra spec suppressed; frontend touched-file ESLint passes. Full backend Jest passes (**453 suites /
2,851 tests**). The Specialist Agent Run History Playwright journey passes (**2/2 including QA
setup**), asserting the new empty state and no browser/API failures; the screenshot was inspected.
No schema migration or provider call was needed. No commit or push was made. This is a bounded audit
event history, not a general-purpose event bus or live alert-delivery system.

## Specialist-agent run evidence retention (2026-11-04)

Added the optional `agents.specialistRunRetentionDays` business policy (default `null` keeps data
indefinitely) and an owner-controlled Settings row. A daily UTC worker expires transient details
from finished runs after the configured age only when the run has no recommendation or material
action. It removes unlinked source evidence, request context, generated output, policy context,
error text and provider tool-result traces. It keeps the run/status row, token/cost usage, redacted
registered tool-call ledger and an immutable audit event; orchestrator history and proposal/action
runs are protected. Run History identifies expired details without returning the retention marker.

The real-MySQL coverage verifies expiry, idempotence, tenant boundaries, active/recent run
protection, proposal preservation, audit records, and retained provider token/cost rows (**2 suites
/ 5 tests**). Cleanup now also requires a terminal status as well as an old `finishedAt`; a real
MySQL case verifies that an anomalously stale timestamp cannot expire a still-running run. Backend
and frontend `tsc --noEmit` and touched-file ESLint pass. Full backend Jest passes (**454 suites /
2,852 tests**). The isolated Run History Playwright journey passes (**2/2 including QA setup**),
saves 30-day retention in the fresh QA business, verifies it after reload, and reports no
browser/API errors; the settings row screenshot was inspected. A separate cross-agent Playwright
journey passes (**1/1**) for all five specialists, the review trace, operations panel and specialist
module pages, without provider calls or browser/API errors. The run-detail API reports expired
transient details without exposing the marker. No migration, provider call, commit or push was made.
This intentionally does not expire records with proposals/actions or orchestrator runs, and is not
a complete customer-erasure workflow.

## Specialist-agent run lifecycle snapshots (2026-11-04)

Added tenant-scoped `SpecialistAgentRunEvent` storage and an owner-only
`GET /agent-runs/:id/events` endpoint. Run History can open a metadata-only timeline with
deduplicated created and terminal-state snapshots derived from persisted run timestamps. The
timeline also normalizes every saved action state transition and proposal revision into safe
metadata events, rather than showing only selected approval/failure/verification milestones. The
endpoint returns the newest 25 events in chronological order and uses a cursor to load older pages;
the AI Settings panel exposes that paging. Payloads exclude action reasons, metadata, proposed values,
source evidence values and model output. The browser copy discloses that run creation/terminal
snapshots are materialized when an owner opens the timeline, intermediate run-state changes and
non-action activity are not captured, and the view is not emitted by a transactional event bus.

The hand-written MySQL migration is applied locally; `prisma migrate status` is clean, and
`information_schema` confirms the event columns, indexes and cascading run foreign key. The real
MySQL service/controller specs pass (**2 suites / 10 tests**). Backend/frontend `tsc --noEmit`,
touched-file ESLint and the full backend Jest suite pass (**454 suites / 2,854 tests**). The
all-five-specialist Playwright journey passes (**2/2 including QA setup**) and exercises the
Run History event panel without provider calls or browser/API errors. No commit or push was made.
This closes a bounded run-history visibility gap only; the universal tool gateway, broader
agent/action coverage, provider confirmation, operational controls and external production
acceptance listed in the reconciliation remain incomplete.

## Specialist-agent run history terminal outcomes (2026-11-04)

Run-history timelines now label terminal outcomes distinctly: completed, partial, failed, cancelled
and skipped. Both `partial` and `partially_succeeded` map to the same partial outcome label while
the exact persisted status remains in the redacted event payload. The timeline payload layout also
allows long metadata values to wrap; the run-history table remains horizontally scrollable when its
columns exceed the available viewport.

Real-MySQL coverage verifies all five terminal outcome labels and their persisted statuses. The
focused service/controller specs pass (**2 suites / 11 tests**); backend and frontend `tsc --noEmit`,
touched-file ESLint and `git diff --check` pass. Full backend Jest passes (**454 suites / 2,855
tests**). The rebuilt-source five-agent Playwright journey passes (**1/1**) with zero captured page,
console or API-5xx errors and no provider calls; the Run History screenshot was inspected. No new
migration, commit or push was made. This is one run-history correctness improvement, not a closure
of the broader specialist-agent gaps described in the master reconciliation.

## Cross-agent orchestration lifecycle events (2026-11-04)

The durable specialist-orchestration runner now records its first worker pickup, an owner stop
request, and each accepted retry as tenant-scoped lifecycle events. Each event is committed in the
same MySQL transaction as the corresponding worker timestamp or status transition, with a hashed
dedupe key; retries of the queue job do not duplicate the first-pickup event. Payloads contain only
the agent key, run mode/status and retry-child count. The Run History note identifies these captured
orchestration events and still discloses that other intermediate run-state changes and non-action
activity are not captured.

Real-MySQL coverage verifies worker-pickup deduplication, the owner cancellation event and the retry
event (**3 focused suites / 23 tests**). Backend/frontend `tsc --noEmit`, touched-file ESLint, the
full backend Jest suite (**454 suites / 2,855 tests**) and the rebuilt-source five-agent Playwright
journey (**1/1**) pass; the browser journey reports no page, console or API-5xx errors and the
Run-History screenshot was inspected. No migration, commit or push was made. Lifecycle capture is
still partial for non-orchestrator run transitions, and the larger module gaps in the master
reconciliation remain open.

## Source-persisted specialist run creation events (2026-11-04)

All five agents' shared run-creation paths now insert `agent.run.created` in the same MySQL
transaction as `SpecialistAgentRun`. The event contains the registered agent key/version, pinned
configuration version, trigger, source module, actor, and run correlation ID. It never copies run
input references, prompts, output, evidence values or provider payloads. A deterministic dedupe key
keeps timeline-read backfill idempotent for new and legacy runs. The run-history note now distinguishes
source-persisted creation events from older timestamp backfill and terminal snapshots that remain
materialized when the timeline opens.

Real-MySQL coverage verifies atomic persistence, safe payload contents, pinned version metadata and
duplicate suppression (**1 suite / 7 tests**). Backend/frontend `tsc --noEmit` pass, full backend
Jest passes (**454 suites / 2,856 tests**), and the rebuilt-source Run History browser journey passes
(**2/2 including QA setup**) with no captured browser or API errors. Touched-file ESLint passes; the
Finance service has unrelated pre-existing Prettier findings, so its lint was rerun with only that
rule disabled. No schema migration, provider call, commit or push was needed. The remaining terminal
snapshots and intermediate transitions for non-orchestration runs are not yet source-emitted;
provider, cross-agent action, operations and production-acceptance gaps in the reconciliation also
remain.

## Source-persisted specialist terminal outcomes (2026-11-04)

Specialist run completion, partial completion and failure events are now written in the same
transaction as the terminal status update for the five module agents. The shared cross-agent
orchestrator also writes terminal events when a review completes, fails, is cancelled, or is closed
after queue recovery; interrupted child runs are recorded as failed in the same way. Compare-and-set
status guards ensure a losing worker does not emit a terminal event. Timeline copy now distinguishes
these source-persisted outcomes from older timestamp materialization, and the Run History browser
journey checks a completed event is visible.

Focused real-MySQL coverage passes (**2 suites / 19 tests**). Backend and frontend `tsc --noEmit`,
touched-file ESLint, and the full backend Jest suite (**454 suites / 2,856 tests**) pass. The
rebuilt-source Run History Playwright journey passes (**2/2 including setup**) without captured
browser or API errors. No migration, provider call, commit or push was made. This improves lifecycle
event reliability; the broader master-spec gaps in the reconciliation remain open.

## Customer Agent — owner-approved event follow-up task (2026-11-04)

Customer event recommendations now create a privacy-minimized `customer_follow_up_task` action
proposal in `approval_required` state. The proposal stores no customer identifier and cannot send a
message. The owner reviews and approves/rejects/cancels it from the shared Specialist Action audit
view; execution rechecks source freshness, customer eligibility and idempotency through the
canonical Customer CRM service, creates the internal task, and verifies that task before marking
the action verified. The Customer Insights button now says it proposes a task for owner approval.

Real-MySQL coverage verifies the proposal is idempotent, does not create a task before approval,
and excludes customer identifiers/private delivery details; shared-action coverage verifies
approval, canonical task creation, verification and saved transition history (**2 suites / 30
focused tests**). Backend/frontend `tsc --noEmit`, touched-file ESLint and the full backend Jest
suite (**454 suites / 2,857 tests**) pass. The browser acceptance test exercises proposal → owner
approval → task creation and verification (**1/1**); it verifies there is no message draft before
or after task creation, reports no page, console or API-5xx errors, and the screenshot shows the
action in `verified` state. The first attempt used the stale compiled
API on port 5001 and returned 404; the successful run used a rebuilt source API on port 5002 with
an isolated Redis database, then stopped that temporary server. No external provider action or
customer message was part of the journey. No migration, commit or push was made. This closes the
approval gap for this Customer event-task action only; broader action coverage, provider delivery
and the other master-spec acceptance gaps remain.

## Registered tool input contracts for Commerce read tools (2026-11-04)

Commerce read-only AI function schemas are now generated from the same registered tool catalog used
by execution, including required versus optional fields. The shared contract helper rejects malformed
registrations, unknown/non-string/oversized inputs and missing required values before a canonical
handler runs. Rejected tool inputs create a failed run record containing only a validation marker
and error summary, not the raw untrusted payload. The Commerce Agent keeps its established typed
error code for missing required values.

Focused contract and real-MySQL agent specs pass (**4 suites / 63 tests**); backend and frontend
`tsc --noEmit`, touched-file ESLint and the full backend Jest suite (**456 suites / 2,868 tests**)
pass. No migration, provider call, browser change, commit or push was needed. This removes schema
drift for the Commerce read-only question flow; the universal cross-module tool registry/dispatcher
and broader agent/action coverage remain incomplete.

## Customer segment cancellation through canonical draft withdrawal (2026-11-04)

The shared Specialist Action cancel endpoint now delegates pending Customer segment approval
withdrawal to `CustomerSegmentDraftsService.withdraw`, requiring the exact proposal version and a
reason. The canonical service returns the proposal to editable draft state and records its own
withdrawal audit/action history; it does not delete the segment or recommendation. Adapter routing
also verifies the `customer_intelligence` agent key, so another agent cannot enter this handler by
reusing the action type and resource type.

The real-MySQL action-service spec verifies exact-version withdrawal, refusal of stale versions,
and refusal to route a non-Customer agent through the Customer adapter (**1 suite / 16 tests**).
Backend `tsc --noEmit`, touched-file ESLint and the full backend Jest suite (**456 suites / 2,870
tests**) pass. The previous full run had one parallel cleanup FK failure; the orchestration suite
passed alone, and two subsequent full runs passed. No migration, provider call, browser change,
commit or push was made. This closes only this Customer segment cancellation adapter gap; the
universal tool gateway, wider action coverage and external/production acceptance gaps above remain.

## Persist registered tool-contract versions on call records (2026-11-04)

The shared specialist tool contract now accepts an optional positive integer `toolVersion` (default
1) and rejects invalid versions. The shared redacted tool-call upsert persists that version on both
create and retry/update. Commerce's registered read-only tool flow passes the resolved contract
version into the shared record, so a call record identifies the exact contract used rather than
depending silently on the database default.

The real-MySQL Commerce question-flow spec temporarily pins `get_product` to version 2 and verifies
that the shared record stores version 2; contract unit coverage verifies defaulting and invalid
version rejection (**2 suites / 28 focused tests**). Backend `tsc --noEmit`, touched-file ESLint and
the full backend Jest suite (**456 suites / 2,871 tests**) pass. No migration, provider call,
frontend change, commit or push was made. Only the Commerce read-only loop currently produces these
shared tool-call records, so tool versions and a universal dispatcher remain incomplete across the
other agents.

## Commerce specialist bounded tool outputs (2026-11-04)

Commerce tool results now pass through a shared JSON-safety and 64 KB size check before they are
returned from the tool service, including normal execution, approved writes and idempotent replays.
An invalid read result becomes a typed tool-output error and its real-MySQL run record is marked
failed. If a canonical write has already completed but its response cannot be serialized, the run
stays succeeded, retains its canonical resource reference, and returns a disclosure that the
response body was omitted. The shared contract tests cover undefined values, BigInt, functions,
symbols, cycles, non-finite numbers, Date normalization and oversized values.

Focused contract and real-MySQL Commerce tests pass (**2 suites / 48 tests**); backend/frontend
`tsc --noEmit`, touched-file ESLint and the full backend Jest suite (**456 suites / 2,875 tests**)
pass. No migration, provider call, browser change, commit or push was made. This hardens the existing
Commerce tool boundary only; the universal typed tool gateway and tool-call producers for the other
specialists remain incomplete.

## Shared specialist-agent tool gateway — registered Commerce provider (2026-11-04)

Added a shared gateway for typed agent-tool registration, provider schema generation, per-call
authorization, bounded JSON input/output, and redacted tenant-scoped call records. Read-only calls
can run only when the registered tool is executable and explicitly exposed as `READ_ONLY`.
Approved-action calls require a persisted approved action matching the same business, run, agent,
module and action type before the canonical handler is called. Commerce, Inventory and SEO use the
shared registration and execution path for their existing read-only flows. Customer has one
registered segment-preview tool; its other aggregate review reads are not yet routed through the
gateway. The generic gateway does not itself perform domain writes, and Finance is not registered
yet.

Gateway unit tests and the Commerce real-MySQL agent spec pass (**2 suites / 26 focused tests**).
Backend and frontend `tsc --noEmit`, touched-file ESLint and the full backend Jest suite pass
(**457 suites / 2,883 tests**). No migration, external provider call, browser surface, commit or push
was involved. This establishes the shared boundary and wires three providers plus one Customer
read-only tool; it does not complete
cross-agent tools, broader action coverage or the remaining master-spec acceptance gates.

## Inventory reorder suggestions through the shared specialist tool gateway (2026-11-04)

The Inventory specialist now invokes its existing tenant-scoped reorder calculation through the
shared gateway as the second registered provider. The tool accepts only a validated lead-time
integer, includes covered items for the agent's existing recommendation flow, and stores the
gateway's redacted run/tool record. The canonical reorder service remains the source of the
calculation; no parallel formula or fabricated inventory values were added. A real-MySQL spec
checks the persisted tool record and confirms the raw lead-time input is not stored.

Focused gateway, Commerce, Inventory and Procurement handoff specs pass (**4 suites / 57 tests**).
Backend and frontend `tsc --noEmit` pass. Full backend Jest passes (**457 suites / 2,883 tests**).
Touched-file ESLint passes with the repository's existing Prettier formatting rule disabled for the
Inventory service, which contains an unrelated pre-existing formatting block. No migration,
external provider call, browser change, commit or push was involved. Inventory and Commerce now use
the shared gateway; the subsequent SEO provider entry below records the third provider. Finance and
Customer provider wiring, broader action coverage and production/live acceptance gates remain.

## Customer repeat-visitor preview through the shared tool gateway (2026-11-04)

The Customer Agent's repeat-visitor count now uses a registered read-only gateway tool that calls
the existing `SegmentsService.previewCount` rule. The count is not written back as a saved or
activated segment. Selected-branch reviews continue to show the match count as unavailable. The
gateway authorizes against the current Customer Agent policy and stores a redacted record with no
input values or customer identifiers.

The real-MySQL Customer Agent spec verifies the persisted tool key, module, run sequence, status,
correlation and empty input-field record (**1 suite / 9 tests**). Backend and frontend
`tsc --noEmit`, touched-file ESLint and full backend Jest pass (**457 suites / 2,883 tests**). No
migration, provider call, browser change, commit or push was made. This routes only the repeat-visitor
preview through the gateway; the rest of the Customer review and Finance provider remain.

## SEO specialist registered evidence tools through the shared gateway (2026-11-04)

The SEO specialist now reads its existing workspace queue, saved Search Console observations, saved
GA4 Organic Search attribution and merchant-entered off-page counts through four registered,
read-only gateway tools. The underlying canonical SEO services remain the data sources. Each call
rechecks the SEO agent policy and writes a redacted tenant-scoped call record; tool outputs are
bounded JSON, and the workspace tool returns only queue counts and the next item needed for review.
The agent still does not publish website changes, send outreach or invent missing SEO metrics.

The real-MySQL SEO agent spec verifies all four successful tool records, their unique sequence,
tenant/run identity and absence of input fields in the audit record (**1 suite / 8 tests**). Backend
and frontend `tsc --noEmit`, touched-file ESLint and full backend Jest pass (**457 suites / 2,883
tests**). No migration, provider call, browser change, commit or push was made. This registers SEO's
existing read path only; Finance and broader Customer reads remained at that checkpoint and were
subsequently advanced as noted below. Broader action coverage and production/live acceptance gaps
remain.

## Finance Profit Analytics through the shared tool gateway (2026-11-04)

The Finance specialist now reads its monthly Profit Analytics statement through a registered,
read-only gateway tool. The handler validates the month, period and optional branch scope, rechecks
the Finance Agent policy for every call, and delegates to the existing `ProfitService.pnl`; it adds
no P&L formula or source data. The gateway stores only its bounded, redacted tool-call record and
the Finance run continues to use the canonical statement for its existing evidence and review.

The real-MySQL Finance Agent spec verifies the tool key, module, status, sequence, run correlation
and persisted input field names (**1 suite / 15 tests**). Backend and frontend `tsc --noEmit` pass.
Full backend Jest passes (**457 suites / 2,883 tests**). Touched-file ESLint passes with only the
existing Prettier rule disabled; standard lint reports Prettier-only findings in existing portions
of these Finance files. No migration, provider call, browser change, commit or push was made. The
Finance P&L read path is now registered; additional Customer reads, broader agent action coverage,
and the remaining production/live acceptance gates are still incomplete.

## Customer Analytics summary through the shared tool gateway (2026-11-04)

Moved the existing customer summary calculation into `CustomerAnalyticsSummaryService`, which is
now the single implementation used by both the Analytics endpoint and Customer Agent. Customer
Agent runs retrieve it through the registered read-only gateway tool, validate the returned scope
and metric shape, and save a redacted tool-call record. The tool records only input field names,
not customer values or identifiers. The repeat-visitor preview remains a second canonical gateway
tool; scheduled, event-triggered, orchestrated and manual runs all use the same path.

Focused real-MySQL Analytics, Customer Agent, event processor, schedule processor and orchestration
specs pass (**5 suites / 42 tests**). Backend and frontend `tsc --noEmit` and touched-file ESLint
pass; standard ESLint reports only existing Prettier-only findings in older portions of the
Analytics service and its spec. Full backend Jest passes (**457 suites / 2,883 tests**). No
migration, provider call, browser change, commit or push was made. The Customer summary and
repeat-visitor reads are now gateway-backed; the other specialist read paths and the wider
production/live acceptance gaps remain.

## Customer review context through the shared tool gateway (2026-11-04)

Customer Agent now retrieves its remaining review context through a third registered read-only
gateway tool. It wraps the existing canonical helpers for win-back brief, CRM data-quality counts,
staff-recorded follow-up outcomes, linked message delivery statuses, and appointment/support-ticket
aggregates. It keeps the run's original observation time and scope, rechecks the Customer Agent
policy, and persists only bounded redacted metadata; customer names, contact details, IDs, message
bodies and ticket text are not included in gateway audit records.

The real-MySQL Customer Agent spec verifies the ordered analytics, review-context and repeat-visitor
tool calls (**1 suite / 9 tests**). Focused Customer Agent, Analytics, event, schedule and orchestration
specs pass (**5 suites / 42 tests**). Backend and frontend `tsc --noEmit`, touched Customer-file
ESLint and full backend Jest pass (**457 suites / 2,883 tests**). No migration, provider call,
browser change, commit or push was made. This closes the remaining Customer aggregate-read gateway
path; provider-confirmed outcomes, broader action coverage and production acceptance remain open.

## Shared and per-agent specialist tool-call budgets (2026-11-04)

The registered tool gateway enforces the business policy `agents.maxToolCallsPerRun` across all five
specialist agents. Each agent can optionally override the shared limit with a null-by-default
per-agent policy; existing businesses therefore inherit the shared default of 20 until an owner
changes it. The gateway atomically reserves each call slot in a transaction that locks the specialist
run, so parallel calls cannot consume the same remaining slot. It excludes the current
round/sequence so a retry can reuse its slot, and records an over-limit attempt as `blocked` with a
typed refusal before authorization or handler execution. Owners can configure the 1–100 shared limit
and optional Inventory, Finance, Customer, SEO and Commerce overrides in Settings → Intelligence.
The real-MySQL assertion starts two Customer calls concurrently with one slot left and verifies one
succeeds while the other is recorded blocked; the gateway unit spec checks the refusal record.

After the atomic reservation and per-agent overrides, backend and frontend `tsc --noEmit`,
touched-file ESLint, and the focused gateway/Customer MySQL specs pass (**2 suites / 18 tests**).
The latest full backend Jest run, before atomic reservation, reported **450/457 suites passed
(2,856/2,884 tests)**. Four suites that failed on 5-second database setup timeouts passed when
rerun alone (**4 suites / 20 tests**); three other failure names were not present in the truncated
terminal output, so the full run is not claimed green. No migration, provider call, browser change,
commit or push was made. The broader lifecycle, action, evidence and live-acceptance gaps in the
reconciliation remain.

## SEO revision verification — partial crawl omissions (2026-11-04)

A partial site crawl that omitted a target page was previously recorded as `pageFound: false`, which
could incorrectly move a merchant-applied revision to “not matched.” It now records the attempt as
`not_checked` and leaves the revision pending; a complete crawl that omits the page still records a
real mismatch. The SEO workspace explains that a partial crawl did not include the page and keeps it
in verification-required. The real-MySQL On-Page spec covers this before the existing mismatch and
successful verification cases; the workspace DB spec checks the pending state and message.

Verification: backend and frontend `tsc --noEmit`, touched backend ESLint, both affected real-MySQL
specs (**2 suites / 5 tests**), and full backend Jest (**457 suites / 2,884 tests**) pass. No schema
migration, provider call, browser QA, commit or push was needed. This closes only the partial-crawl
false-mismatch case; SEO outcome measurement and the other specialist gaps remain open.

## Shared specialist tool lifecycle events (2026-11-04)

Registered tool calls now emit `agent.tool.started` plus a final `succeeded`, `refused`, `blocked`,
or `failed` event into the existing specialist run timeline. The tool-call row and corresponding
event are written in one transaction. Timeline entries retain tenant, actor, correlation, tool
version, round/sequence, safe status, duration and allowlisted error code; they never include raw
inputs, outputs or resource IDs. The AI Settings timeline labels tool events and distinguishes tool
version from agent version. Its copy discloses that old tool calls are not backfilled and other
intermediate non-tool activity remains outside the timeline.

The Commerce real-MySQL spec verifies start/success entries, actor attribution and input/question
redaction. Gateway unit tests verify the metadata-only events, and the run-history browser spec now
checks real registered-call counts and event labels rather than assuming an empty tool ledger. The
focused tests pass (**3 suites / 34 tests**); backend and frontend `tsc --noEmit`, touched-file
ESLint and full backend Jest pass (**457 suites / 2,884 tests**). Browser QA passes (**1/1**) on an
isolated QA business with zero captured page/console errors or API 5xx responses. Turbopack failed
to spawn a Node worker in this local environment, so the visual check used Next's Webpack dev mode.
No migration, provider call, commit or push was made. This captures lifecycle for current registered
tool calls; it does not close the other cross-agent action, evidence, live-provider or production
acceptance gaps in the master reconciliation.

## Inventory Agent — branch rebalance read tool (2026-11-05)

Registered `get_branch_rebalance_recommendations` as a bounded, read-only Inventory tool for the
existing AI assistant/tool gateway. It reuses the canonical branch rebalance calculation over the
business's active branch group and returns current stock, recorded-sales pace, open-transfer
adjustments, assumptions, missing-data notes and observation time. The result is capped at 50
findings and labels the result as a review, not a guaranteed transfer or an order. It never creates,
approves or ships a transfer. The Inventory Agent version is now 1.9.0.

The real-MySQL Inventory Agent spec verifies a branch finding is returned through the gateway and
that calling this read tool does not create a stock transfer (**1 suite / 14 tests**). Backend and
frontend `tsc --noEmit` pass. Touched-file ESLint reports only existing Prettier formatting errors
in an untouched section of the Inventory service; no non-format lint errors remain in the new code.
Full backend Jest passes (**457 suites / 2,884 tests**). No migration, live-provider call, browser
change, commit or push was made. This adds a branch-analysis tool only; transfer approval and the
other action, cross-agent, provider and production-acceptance gaps remain open.

## Inventory Agent — branch transfer follow-through (2026-11-05)

Added a read-only follow-through endpoint and table for saved branch-rebalance findings. It joins
the finding to its canonical Stock Transfer, shows its real status and requested/received units,
and reads current stock for the source and destination branch products. The table links operators
to Stock Transfers for approval and receipt; it does not alter stock and explicitly labels branch
balances as current snapshots, not effects caused by the recommendation.

The Inventory real-MySQL spec verifies a prepared transfer appears with its true pending status,
requested quantity and unchanged branch stock (**1 suite / 14 tests**). Backend/frontend
`tsc --noEmit` and frontend ESLint pass. Backend ESLint with Prettier disabled passes; standard
backend ESLint reports only existing Prettier drift in an older, untouched service section. Full
backend Jest passes (**457 suites / 2,884 tests**). Live route compilation succeeds in Next Webpack
dev mode, but the page redirects to sign-in in the available browser session, so authenticated
visual/API QA remains unverified. No migration, commit or push was made.

## Cross-agent specialist orchestration timeline (2026-11-05)

Cross-agent orchestration now persists metadata-only lifecycle events when a specialist child
starts, completes, partially succeeds, fails or is skipped. Event writes are atomic with the saved
orchestration progress or terminal outcome. The event metadata contains the agent/module, transition,
safe status and allowlisted reason code; it excludes child run IDs and child output. AI Settings
labels these events and describes which intermediate activity is still not captured.

The real-MySQL orchestration spec verifies transitions for an enabled child and a disabled specialist,
including exclusion of sensitive child-run details (**1 suite / 12 tests**). Backend/frontend
`tsc --noEmit`, touched-file ESLint and `git diff --check` pass. Full backend Jest passes (**457
suites / 2,884 tests**). Browser visual QA was not completed because the available browser session
is signed out. No schema migration, commit or push was made. This closes the cross-agent child-run
timeline gap only; broad action coverage, provider confirmation, outcome measurement and production
acceptance remain open.

## Commerce Agent — internal inventory availability review (2026-11-05)

Added a read-only Commerce Agent review of real active Noxtill products that have at least one
synced channel listing. It reports the saved Noxtill stock quantity and low-stock threshold, and
names which providers have synced listings. The review is capped at 50 products and shows whether
the result was capped. The UI links to Inventory and Channel Listings; it never changes stock or
channel listings. Product names are omitted from the agent result. The evidence labels this as an
internal Noxtill snapshot and does not claim provider-side inventory, branch availability,
reservations, or a customer delivery promise.

The real-MySQL Commerce Agent spec verifies a synced Shopify listing and a zero-stock product below
its configured threshold, including the evidence references (**1 suite / 18 tests**). Backend and
frontend `tsc --noEmit`, touched-file ESLint, full backend Jest (**457 suites / 2,884 tests**) and
`git diff --check` pass. No migration, provider call, commit or push was made. Authenticated browser
visual QA remains unverified; provider-side stock and fulfilment availability are still unsupported
by this read-only snapshot.

## Specialist Operations — per-tool outcome breakdown (2026-11-05)

AI Settings now groups registered tool-call records by agent, tool and saved status. The operations
view shows per-tool totals and succeeded, failed, blocked or refused counts next to the existing
measured elapsed-time percentiles. These are tenant-scoped 30-day records; status counts do not
claim provider confirmation, and blocked/refused calls do not enter the elapsed-time sample. No
tool inputs, outputs, resource identifiers or secrets are returned.

The real-MySQL AI Settings spec verifies per-tool status counts, time-window filtering and business
isolation (**1 suite / 4 tests**). Backend/frontend `tsc --noEmit` and touched-file ESLint pass. The
full backend run reported **456/457 suites and 2,883/2,884 tests**; only the unrelated Booking QR
poster PDF test timed out under full-suite load, then its suite passed alone (**1 suite / 5 tests**).
`git diff --check` passes. Browser visual QA remains unverified: the default frontend proxy targeted
port 5001 while the backend runs on 5000; after overriding it to 5000, the local sign-in attempt
returned Forbidden, so the protected view could not be opened. No migration, provider call, commit or
push was made. Queue depth, enqueue wait and worker health remain outside this per-tool summary.

## Specialist Operations — per-agent queued-run age (2026-11-05)

AI Settings now shows each specialist's persisted `queued` run count and age of its oldest queued
run, plus an aggregate queued-run card. Counts come from `SpecialistAgentRun` rows scoped to the
current business, with a real-MySQL test covering two tenants. Owners can set an optional 1–1,440
minute warning threshold in Settings → AI & Governance; null disables the alert and preserves the
existing behavior. The alert checks the saved timestamp, and the UI and runbook state explicitly
that saved run state is not live Redis/BullMQ depth or worker health. The 19 Observability row in
the reconciliation now reflects this without marking the full section accepted.

Verification: AI Settings real-MySQL spec (**1 suite / 4 tests**), backend/frontend `tsc --noEmit`,
touched-file ESLint, full backend Jest (**457 suites / 2,884 tests**) and `git diff --check` pass.
No migration, commit or push was made. Isolated signup-based Playwright QA passes (**1/1**) on a
new QA business: the owner page loads, persisted run history and empty alerts render, retention and
the queued-age threshold save and survive reload, and no browser/console errors or API 5xx responses
were observed. Live queue depth, queue worker liveness and per-agent enqueue-to-worker timing remain
operational gaps.

## Shared specialist allowlisted configuration API (2026-11-05)

Added `GET /api/v1/agents/:agentKey/config` and owner-only `PATCH` for each registered specialist.
Reads return only that agent's resolved, allowlisted policy keys and the current immutable config
version; global AI controls and provider secrets are excluded. Writes validate values using the
existing policy definitions, require an expected version, reject stale writes, save the updated
policy JSON and immutable snapshot atomically, and record the actor plus before/after values in the
business audit log. This fills an API contract gap; existing Settings pages remain the configuration
UI and have not been replaced.

The real-MySQL spec covers safe fields, per-agent snapshot creation, valid and invalid values,
version increments, stale-write conflicts and audit attribution; the controller spec covers the
owner-only write gate (**3 suites / 11 tests**). Backend/frontend `tsc --noEmit`, touched-file
ESLint, full backend Jest (**457 suites / 2,889 tests**) and `git diff --check` pass. An
isolated signup-based Playwright API journey passes (**1/1**), including reading config, rejecting a
global setting, updating an agent setting, refusing a stale version and restoring the original
value. No schema migration, live provider call, commit or push. Broader cross-agent action coverage,
provider confirmation, outcome measurement and production acceptance remain open.

## Financial Intelligence — budget and cash-flow reads through the shared tool gateway (2026-11-05)

Registered two more read-only Finance tools with the shared specialist gateway. Approved-budget
actuals reuse the existing `FinanceBudget + Expense` comparison for the requested month and
validated branch scope; mixed-currency group reads are refused. The cash-flow tool reuses
`CashForecastService.forecast`, accepts only a bounded 7–90 day horizon, returns the business
currency and exact projection, and labels cumulative net flow as a relative projection rather than
a bank balance. Both tools require the Finance Agent policy check and their shared tool-call limits;
the telemetry stores input field names and a hash, not the returned financial values.

The real-MySQL Finance Agent spec verifies the saved budget variance, read-only cash projection,
currency/disclosure fields and refusal of a branch outside the business group (**1 suite / 17
tests**). Backend/frontend `tsc --noEmit`, backend ESLint with the repository's existing
Prettier-only findings in untouched portions excluded, and full backend Jest (**457 suites / 2,891
tests**) pass; `git diff --check` passes. No new browser surface, schema migration, provider call,
commit or push. This adds Finance read paths; it does not supply complete accounting ledgers,
provider-confirmed balances, or the remaining cross-agent and production-acceptance requirements.

## Finance Agent — Xero bank-transaction status through the shared tool gateway (2026-11-05)

Registered a read-only Finance Agent tool that reuses the existing Xero bank-transaction status
service. It reports the connected organization's authorized transaction totals by currency and
provider-reported reconciled/unreconciled flag for that service's latest 30-day window. It does not
mark Noxtill reconciliation items reconciled. Disconnected Xero returns the real `not_connected`
state with no inferred totals. Tool inputs remain field-name-only in telemetry.

The real-MySQL Finance Agent spec verifies the disconnected state, empty totals and safe tool-call
record (**1 suite / 19 tests**). Backend and frontend `tsc --noEmit`, touched-file backend ESLint
with existing Prettier-only noise excluded, full backend Jest (**457 suites / 2,893 tests**) and
`git diff --check` pass. No migration, live provider call, browser change, commit or push. Full
Finance reconciliation, accounting ledgers and production acceptance remain incomplete.

## Customer Agent — consent status through the shared tool gateway (2026-11-05)

Registered `get_customer_consent` as a read-only Customer Intelligence tool. It reuses
`CustomerChannelConsentService.list` and exposes only the latest email, SMS and WhatsApp states with
their update times. Customer identifiers, names, phone/email destinations, consent evidence
references and history are excluded from the result. The result states that consent records alone
do not authorize a send; the canonical send gate must still check destination, customer status,
global and channel consent, suppression, quiet hours, frequency limits and provider configuration.
The lookup is tenant-scoped and refuses an existing customer from another business. No schema
change or migration was needed.

The real-MySQL Customer Intelligence spec verifies latest revision selection, missing-channel
`unknown` state, contact/evidence minimization, tool-call audit metadata and cross-business refusal
(**1 suite / 10 tests**). Backend/frontend `tsc --noEmit`, targeted backend ESLint with the touched
legacy file's existing Prettier-only noise excluded, full backend Jest (**457 suites / 2,907 tests**),
and `git diff --check` pass. No browser page changed, provider call,
migration, commit or push was made. Customer-specific order, loyalty and richer activity reads, broad
all-channel delivery, provider-confirmed outcomes and production acceptance remain incomplete.

## Finance Agent — imported statement candidates through the shared tool gateway (2026-11-05)

Added `get_reconciliation_items`, a bounded read-only tool that reuses
`FinanceReconciliationService.getImport` for one tenant-owned imported statement and page. It
returns the stored date/amount rows and the canonical service's candidate journal matches, without
bank memo text. The tool does not accept a match or claim that a provider transaction is settled;
the existing human decision endpoint remains responsible for acceptance.

The real-MySQL Finance Agent spec verifies an exact candidate from a posted manual journal, the
human-acceptance disclosure, omission of bank free text, field-name-only telemetry and invalid-page
refusal (**1 suite / 20 tests**). Backend/frontend `tsc --noEmit`, touched-file backend ESLint with
existing Prettier-only findings outside this addition excluded, full backend Jest (**457 suites /
2,894 tests**) and `git diff --check` pass. No migration, provider call, browser change, commit or
push. Automatic finance postings, full reconciliation and production acceptance remain incomplete.

## Finance Agent — ledger reads, period-close and partial trial-balance tools (2026-11-05)

Registered `get_period_close_checklist`, `get_manual_journal_trial_balance` and
`get_manual_general_ledger_entries` in the shared specialist tool gateway. All call existing Finance
services and are read-only. The close checklist is labeled partial and cannot close or certify a
period. Trial-balance results are explicitly limited to posted manual Noxtill journals and cap
returned account rows. The general-ledger read filters posted entries before limiting output to 100
entries and 20 lines per entry, so drafts do not hide posted activity. Descriptions and line memos
are omitted. Malformed dates/months are refused. These tools do not add a second ledger or change
finance records.

The real-MySQL Finance Agent spec verifies period readiness, missing bank-reconciliation coverage,
posted manual-journal totals and entries, free-text omission, safe tool-call metadata and invalid
input refusal (**1 suite / 23 tests**). Backend/frontend `tsc --noEmit` and touched-file ESLint
pass. The full backend run passes (**457 suites / 2,897 tests**) after the general-ledger query
refinement. A signup-based Period Close browser test is still blocked: Next.js was served on port
3001 while the local API CORS allowlist only permits port 3000. The first attempt also exposed that
starting the API against the shared local database resumes old message and voice jobs for existing
businesses; that API process was stopped. Authenticated visual QA is therefore not claimed, and the
API should only be restarted for this check against an isolated QA database or with a safe worker
configuration. No schema migration, code commit or push. Automatic finance postings, complete
reconciliation, accounting subledgers, certified close, and broader cross-agent/provider/production
acceptance remain incomplete.

## Finance Agent — descriptive month-over-month variance tool (2026-11-05)

Added `calculate_variance` to the shared specialist tool gateway. It reuses canonical Profit
Analytics monthly P&L and comparison logic, validates branch scope and currency consistency, and
returns the source period values with an explicit statement that the differences are descriptive
and do not establish a cause. It is read-only; tool telemetry records input field names without
storing the financial output.

The real-MySQL Finance Agent spec compares the tool response to the saved canonical Profit
Analytics run, checks scope/currency/disclosure and telemetry, and verifies malformed months are
refused (**1 suite / 24 tests**). Backend/frontend `tsc --noEmit`, touched-file ESLint,
`git diff --check`, and full backend Jest (**457 suites / 2,898 tests**) pass. No migration,
commit, push, live provider call or authenticated browser QA was performed. Authenticated visual
QA remains blocked by the local API CORS allowlist mismatch described above. Complete accounting
subledgers, provider-confirmed finance state, broad cross-agent acceptance and production
acceptance remain incomplete.

## Inventory Agent — cancel approved Procurement handoff before conversion (2026-11-05)

The shared specialist action cancellation path now supports an approved Inventory procurement
request while it is still in the canonical `approved` state and has not been converted to a
purchase order. It requires the exact request version and a non-empty reason, performs an
optimistic status/version update through `ProcurementService`, appends a canonical cancelled
request event, and transitions the linked specialist action in the same database transaction.
Submitted requests continue to use the existing withdrawal path; requests that entered sourcing
or conversion cannot use this cancellation path.

The owner action audit shows a Cancel request control for an approved Inventory action only while
it has no canonical operation ID, and records the required cancellation reason through the shared
action decision API.

Real-MySQL coverage verifies approval → reasoned cancellation, stale-version refusal, the saved
event/reason and that conversion is refused afterward. The specialist-action database spec verifies
that the central endpoint delegates an approved Inventory cancellation only with the exact version
and reason. Focused tests pass (**2 suites / 24 tests**); backend/frontend `tsc --noEmit`, touched-
file ESLint, `git diff --check` and full backend Jest (**457 suites / 2,900 tests**) pass. No
migration, provider call, browser QA, commit or push. Cancellation for other specialist action classes and full
cross-agent action coverage remain incomplete.

## Customer Agent — race-safe CRM follow-up execution and retry (2026-11-05)

Customer follow-up actions now claim `execution_queued`/`executing` before invoking the canonical
CRM task service. Cancellation can atomically win only while an approved action is still unstarted,
so the service cannot create a task after the action has been cancelled. A canonical-service or
verification failure is audited as `failed` with a typed error code and can be retried through the
owner action review; the CRM idempotency key makes retries safe if the first task was created but
its response was lost. The UI exposes cancel for unstarted approvals and retry for failed actions.

The real-MySQL specialist-action spec verifies execution is claimed before the CRM call, a failed
attempt is recorded and retry reaches a verified task, stale-version cancellation is refused, and
both cancellation/execution orderings are safe (**1 suite / 19 tests**). Backend/frontend `tsc --noEmit`, touched-
file ESLint and `git diff --check` pass. The full backend run completed with **454/457 suites and
2,897/2,901 tests**; QR Poster and Reports passed in serial reruns, and the changed specialist
action suite passes (**19 tests**). One unrelated Settings Hub per-run-policy test still times out
when run alone; the selected retention-threshold test passes alone. No migration, provider call,
commit or push. Browser QA remains unverified because the open Chrome tab could not be attached and
a fresh local-app navigation timed out. Live authenticated browser QA and broader specialist action
coverage remain open.

## Inventory Agent — bounded stock-balance and movement tools (2026-11-05)

Added four read-only tools to the shared Inventory specialist gateway. `get_stock_balance` reads
one product through the canonical Inventory listing calculation and returns its current Noxtill
business-level stock, low-stock threshold, recorded-sales velocity and days of cover; cost values
are excluded. `get_stock_movements` validates a 1–365 day window, caps results at 100 rows and
returns only the selected product's movement IDs, kinds, quantities and timestamps.
`get_sales_velocity` calculates recorded units per calendar day for a bounded 1–365 day window and
returns no estimate when the window has no saved sale movements. `get_open_purchase_orders` returns
up to 100 internal purchase-order records and remaining quantities for one product, without costs
or unrelated lines. `get_stock_count_variances` reads bounded draft counts and recomputes the
variance against current book stock, distinguishing that result from the stored creation-time
snapshot; it does not apply counts or write adjustments. The tools disclose that internal records
do not prove branch allocation, provider availability, supplier shipment or unrecorded demand.
They refuse products outside the active business and never write inventory.

The real-MySQL Inventory Agent spec verifies canonical values, cost-field exclusion, bounded
movement and purchase-order output, recorded-sales velocity, current-vs-saved count variances,
cross-location refusal, invalid-window refusal and audited tool-call statuses (1 suite / 16 tests).
Backend/frontend `tsc --noEmit`, backend ESLint with the repository's
pre-existing Prettier-only findings in older portions of the touched Inventory files excluded, and
full backend Jest (**457 suites / 2,904 tests**) pass. The first full run hit an unrelated Commerce
MySQL deadlock under parallel workers; the Commerce suite passed alone (18/18), and the complete
suite then passed on rerun. `git diff --check` passes. No migration, provider call, browser QA,
commit or push. Forecast calibration, seasonal adjustment, stockout-censored demand and broader
agent action coverage remain incomplete.

## Finance Agent — partial A/R and A/P source summary tool (2026-11-05)

Added two registered read-only Finance tools. `get_ar_ap_aging`, named in the Finance spec, returns
`CreditService.financialAgingSummary` and `XeroOpenItemsService` as separate sources, explicitly
labels the result partial, and states that a native Noxtill finance-owned A/R or A/P ledger is not
available. The Credit source contains aggregate debtor counts, balances, aging buckets, source and
observation time only; it excludes customer identifiers, names, phone numbers and credit-entry
details. `detect_duplicate_candidates` reuses the existing exact-match Expense helper and scoped
review, restricts combined business scopes to one currency and returns aggregate counts/amounts
without descriptions or record IDs. It labels matches as candidates for human review, not confirmed
duplicates, fraud or savings. Neither tool writes finance data or combines currencies. No schema
change or migration was added.

The real-MySQL Finance Agent spec verifies current-business aggregation, excludes another business's
balance and customer details, checks disconnected Xero is not represented as zero, verifies duplicate
candidate scope/privacy and rejects invalid-month and mixed-currency requests (**1 suite / 26 tests**).
Backend and frontend `tsc --noEmit`,
backend ESLint with existing Prettier-only findings excluded, `git diff --check`, and full backend
Jest (**457 suites / 2,906 tests**) pass. No browser surface changed, so browser QA was not needed.
No provider call, migration, commit or push was made. Native Finance A/R and A/P ledgers, provider
acceptance and production QA remain incomplete.
