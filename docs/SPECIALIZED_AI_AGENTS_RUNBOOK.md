# Five Specialized AI Agents — operator runbook

This runbook covers the SEO, Commerce, Inventory, Finance and Customer specialist agents. It is
based on the current repository behavior and is not a production launch approval. The repository
audit at `SPECIALIZED_AI_AGENTS_REPOSITORY_AUDIT.md` remains the source for implementation evidence
and unsupported data/provider boundaries.

## Safety rules

- Every specialist review is scoped to the signed-in business and uses the owning module's
  canonical records. Do not repair a suspected mismatch by writing directly to an agent table.
- A recommendation, queue admission or provider `accepted` response is not proof that the
  canonical/provider operation finished. Verify the domain record or signed provider state before
  retrying a write.
- Keep customer details, access tokens, API keys and full payment data out of screenshots, logs,
  prompts, support tickets and this runbook. Capture run/action IDs, safe error codes, module and
  timestamps instead.
- Do not use a production business for test runs. Use an isolated QA business and clearly labeled
  test records. AI/provider calls can incur charges; use a single bounded probe only when its owner
  has approved the cost.
- When data is absent, stale or partial, preserve the product's `Not tracked`, `Not available`,
  `Not configured` or partial-coverage disclosure. Never turn an unavailable source into a zero.

## Normal operator checks

1. Open **Settings → AI & Governance** (`/assistant/settings`) as the business owner. Check the
   relevant specialist switch, monthly request/spend caps, provider configuration and the
   30-day specialist operations summary. The owner can optionally configure a queued-run age
   warning; leave it unset to disable that alert. It evaluates persisted run timestamps, not live
   Redis/BullMQ state. That summary uses application-estimated AI cost, not a
   provider invoice; active-run age is measured from saved `startedAt`, not enqueue time. Material
   action execution p50/p95 is based on saved `executing` to terminal transitions, both by agent and
   action type; it is not provider-tool latency or business impact. Commerce registry tool p50/p95
   uses stored durations for completed/failed agent and internal-orchestration calls only; it excludes
   manual/refused calls and is not available for the other specialists. The cross-agent section also
   reports saved-parent creation to first worker-pickup p50/p95 and the currently waiting saved
   reviews; it is a narrow persisted metric, not live queue telemetry. The Inventory branch-transfer
   review switch is off by default; when enabled, a confirmed receipt can queue a read-only review
   independently for each opted-in branch.
   For SEO data sources, **SEO Settings** shows whether Search Console and GA4 are connected. GA4
   reports Organic Search sessions, key events, property-reported revenue and page-path metrics
   after a property is selected and synced. It does not reconcile totals to Noxtill orders or
   establish SEO causality.
2. Open the owning module and inspect the saved run, source evidence, freshness, assumptions,
   missing data and recommendations. A completed review is analysis, not approval or execution.
3. For a proposed write, open its canonical module/Action Center item. Confirm the exact resource,
   version, scope and approval before using the canonical action. Re-read the resource after the
   action and record whether it is pending, confirmed, verified, failed or still unknown.
4. For cross-agent reviews, the owner-only section in AI Settings shows parent/child run IDs and
   one correlation trace. It runs enabled specialists sequentially in read-only mode and makes no
   AI-provider calls. It is not an autonomous multi-step business plan.

## Provider or model outage

1. Capture the run ID, specialist, UTC time and normalized error code from AI Settings or the
   owning module. Do not copy the raw provider response if it could contain customer content.
2. Check provider health and the configured provider/model in the authorized provider console.
   Confirm account credit/access and model availability there; a configured key alone proves
   neither. Do not probe repeatedly because each request may be billable.
3. Turn off the affected specialist's owner-controlled access switch in AI & Governance while
   investigating. This blocks new reviews; inspect active and queued work separately because a
   switch does not undo an already-started provider request or canonical action.
4. After the provider issue is resolved, restore the switch only with owner approval. First run a
   bounded test in the isolated QA business. Verify the saved result and actual provider usage,
   then resume scheduled/event-driven work. Do not silently change model providers to hide an
   outage.

## Connector or source-data degradation

1. In **Integrations**, inspect the affected connection and its latest sync/error state. Also open
   the source module (SEO, Commerce, Inventory, Finance or Customers) and confirm the source record
   and observation time.
2. Treat an unavailable, stale or partially synced connector as missing coverage. Do not approve a
   recommendation that depends on the missing fields, and do not interpret absence as zero demand,
   traffic, balance, risk or cost.
3. Pause the specific specialist if its source is required for safe decisions. Keep unrelated
   specialists enabled when their inputs remain healthy.
4. After recovery, refresh through the canonical connector/module, confirm the source timestamp,
   then create a new review. Do not reuse an old recommendation as if it used the refreshed data.

## Queue backlog or worker outage

1. Check `GET /api/v1/health/ready` from the deployed API. A non-200 response identifies database
   or Redis readiness failure; it does not prove specialist worker health.
2. Check the deployment's Redis/BullMQ worker and process logs for the
   `specialist-agent-orchestration` queue and the enabled domain event/schedule queues. Preserve
   queue/job IDs and run IDs. Do not delete jobs or edit queue keys directly in Redis.
3. In AI Settings, inspect cross-agent runs and the persisted specialist operations summary. The
   cross-agent section shows measured time from saved parent-run creation to first persisted worker
   pickup, plus saved reviews currently awaiting pickup and their oldest age. A running row's age
   starts at `startedAt`. Each specialist also shows its persisted `queued` run count and oldest
   saved age for the current business. These values are read from database run states; they do not
   prove live Redis/BullMQ depth or worker liveness. Use the deployment's queue monitoring for those.
4. Restore Redis/worker health first. The orchestration recovery job resumes eligible persisted
   runs, but inspect each run's children before retrying. Retry only failed children through the
   owner UI after confirming they have no completed canonical side effect. Do not replay an entire
   run to recover a single child.

## Bad agent version or configuration

The shared API also exposes `GET /api/v1/agents/:agentKey/config` for the selected agent's
allowlisted, resolved settings and current `configVersion`. An owner can update allowed settings
with `PATCH /api/v1/agents/:agentKey/config`, sending that `expectedVersion` and a `settings`
object. The server validates each setting against the policy definition, rejects stale versions,
records immutable configuration history and writes an audit record. This is an API contract; it is
not a replacement for the Settings UI, and it does not make provider/model keys editable there.

1. Identify the agent key/version from the saved run, then inspect the business's current owner
   settings and the run's policy result. Check whether the agent was disabled, a monthly cap was
   reached, the source changed, or the provider returned a normalized error.
2. Disable that agent in AI & Governance to stop new work. Do not edit persisted run or action rows
   to make the failed run appear successful.
3. Use the owning module's versioned draft/rollback flow when one exists. Require a reason and keep
   the prior version for audit. For agents without a versioned configuration editor, retain the
   failure and escalate it as a code/configuration issue; do not claim rollback is available.
4. Re-test the corrected configuration in QA with AI disabled first where possible. If a paid AI
   test is needed, get cost approval, pin the intended version and make one bounded request. Verify
   source grounding, abstention on missing data and permissions before re-enabling event triggers.

## Possible duplicate or uncertain external write

1. Stop further retries. Record the action ID, run ID, idempotency/correlation ID and provider
   reference, if one was returned.
2. Check the canonical Noxtill resource and the provider's authoritative state. `queued`, `pending`
   or an HTTP acceptance is not confirmation. Do not create a second order, listing, message,
   journal, transfer or campaign to test whether the first one worked.
3. If the external state is confirmed, reconcile the existing action to that operation through its
   owning module. If the provider cannot confirm, keep it visibly pending/unknown and escalate to
   the provider/operator. Retry only through the canonical idempotent action path after the current
   state and permission have been revalidated.
4. Preserve both provider evidence and the before/after canonical values. Do not delete or rewrite
   audit history, and do not claim a rollback unless the domain/provider confirms it.

## Suspected cross-tenant access or data exposure

1. Stop the affected review/action and disable the relevant specialist while preserving run,
   request, action and audit IDs. Do not copy the other business's records into the incident.
2. Notify the platform security owner using the approved incident channel. Restrict evidence to
   the requesting tenant, operation, timestamp, safe error code and correlation ID.
3. Verify the denial with a non-sensitive QA pair of businesses only after the security owner
   approves the investigation. Do not use a guessed live customer or resource ID as a probe.
4. Keep the feature disabled until the authorization fix and cross-tenant regression test pass.
   Restore access only with the security owner's approval and document the verification result.

## Operational gaps requiring deployment work

- `/health/ready` checks the database and configured Redis readiness, not queue depth or worker
  liveness. Deployment monitoring must separately alert on worker health and queue age.
- The specialist operations view reports persisted run outcomes, error codes, latency percentiles,
  queued-run counts and oldest saved age, active-run age, recommendation and material-action states,
  proposal revision events, and linked AI usage. It also reports registered-tool status counts by
  tool and measured execution-time percentiles from saved completed/failed calls. It exposes one
  narrow business-wide count of audited cross-tenant run probes denied by the orchestration service;
  it is not general security-event monitoring. Generic per-agent enqueue-to-worker latency, live
  Redis/BullMQ depth, worker liveness and comprehensive action/approval/verification rates remain
  unavailable there.
- External paging, durable production Redis, backups/restore drills, production secrets storage and
  provider invoice reconciliation require deployment configuration and operational evidence. A
  local passing test suite does not establish these controls.
- The five-agent implementation still has provider/data-dependent gaps documented in the audit.
  This runbook does not mark any unsupported live capability as implemented.
