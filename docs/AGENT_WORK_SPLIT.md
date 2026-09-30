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
- started item 3 (Risk & Compliance).
