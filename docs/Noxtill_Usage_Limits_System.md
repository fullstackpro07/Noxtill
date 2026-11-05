# NOXTILL — USAGE, LIMITS & SUBSCRIPTION SYSTEM
## Complete Build Specification — Backend · Frontend · Billing · Operations

**Version 1.0 · Build-ready**
**Module:** Settings → Usage & Limits (14 screens)
**Audience:** Backend, Frontend, DevOps, QA, Finance

---

## 0. How to read this document

This is an implementation contract, not a proposal. Build it in the order given in Section 20. Do not start at the screens — the screens are the last 20% of the work and the easiest part to change.

Three rules govern everything below. If a decision elsewhere in this document ever appears to conflict with one of them, the rule wins:

1. **The server decides.** Every limit is enforced on the server, at the point the action is taken. A disabled button is a courtesy, never a control.
2. **Measure before you enforce.** Counters are built from events, never incremented inline by feature code. One event stream, one source of truth.
3. **Nothing charges without consent.** Reaching a limit pauses the thing. It never silently bills.

---

## 1. Scope and non-negotiables

### 1.1 What this system owns

- The definition of every plan and what it includes
- The resolution of a business's effective entitlements at any moment
- The recording of every billable or limited action
- The enforcement of every limit, before the action completes
- The reservation and settlement of AI credits
- Alerting at thresholds
- The purchase of extra capacity (credits, seats, locations, numbers)
- Reconciliation of internal counts against provider invoices
- The 14 screens under Settings → Usage & Limits

### 1.2 What this system does not own

| Not owned | Owner |
|---|---|
| Money movement, invoices, cards | Payments & Billing (Stripe as merchant of record) |
| User identity and roles | Staff |
| Branch records | Branches |
| The AI calls themselves | Each feature's own module |
| Provider accounts (Twilio, Postmark) | Integrations |

This system **authorises** and **records**. It does not perform the work and it does not take the money.

### 1.3 Non-negotiables

- **No allowance is ever displayed as "unlimited."** Every metric has a number or the state `not_configured`.
- **Balance can never go below zero.** Enforced by atomic reservation, not by checking afterwards.
- **A retried request is never charged twice.** Idempotency key on every reserve.
- **A failed operation is never charged.** Reservation is released.
- **Incoming messages are never charged.** Only outbound.
- **Everyday business work never consumes credits.** Sales, bookings, CRM records, reports — free.
- **Every metered action produces an immutable event.** If a customer disputes a bill, the event log is the answer.
- **Enforcement is server-side, on every API path.** Including the public API and webhooks.

---

## 2. Vocabulary — the four kinds of entitlement

Mixing these up is the most common way billing systems rot. They behave differently and must be modelled separately.

| Kind | Behaviour at the limit | Resets? | Examples |
|---|---|---|---|
| **Capacity** | New ones are refused. Existing ones keep working. | No | users, locations, phone numbers, websites |
| **Allowance** | Consumption pauses. | Yes, each billing period | AI credits, automation runs, digitizer pages, SEO keywords, eSign transactions |
| **Spend cap** | Further spend is refused. | Yes, each billing period | voice spend, SMS spend, WhatsApp spend |
| **Feature flag** | The feature is not visible or returns 403. | No | modules included in a plan |

A fifth category exists and must be named so nobody treats it as an allowance:

| **Pass-through** | Billed at Noxtill's published price per unit, with a spend cap on top | per period | SMS segments, emails, phone minutes, number rentals |

**Rule:** a metric is exactly one kind. Never two. If you find yourself wanting a metric to be both an allowance and a spend cap, you have two metrics.

---

## 3. Plan catalog

### 3.1 Plans

| Plan | Monthly | Yearly (−25%) | Users | Locations | AI credits |
|---|---:|---:|---:|---:|---:|
| **Trial** | Free · 14 days | — | 2 | 1 | **200 total, not monthly** |
| **Starter** | $39 | $351 | 2 | 1 | 500 / month |
| **Growth** | $79 | $711 | 5 | 1 | 1,500 / month |
| **Professional** | $159 | $1,431 | 15 | 3 | 4,000 / month |
| **Business** | $319 | $2,871 | 40 | 10 | 8,000 / month |
| **Enterprise** | Custom | Custom | Custom | Custom | Custom |

### 3.2 Extra capacity

| Item | Price | Kind |
|---|---:|---|
| Extra seat | $10 / month | Capacity |
| Extra location | $39 / month | Capacity |
| 1,000 AI credits | $10, one-off | Allowance top-up, **does not expire** |

### 3.3 Pass-through prices

These must be derived from provider cost, not fixed in code. Section 5 gives the rule.

| Item | Price | Floor margin |
|---|---:|---:|
| SMS segment (US) | $0.05 | 74% |
| SMS segment (other) | `cost × 4`, by destination country | 75% |
| Email | $6 per 1,000 | 75% |
| AI Receptionist minute | **to be set after cost instrumentation — Section 5.4** | ≥ 60% |
| Local phone number | `max($4, cost × 3.5)` rounded up to $0.50 | ≥ 71% |
| Toll-free number | `max($8, cost × 3.5)` rounded up to $0.50 | ≥ 73% |
| WhatsApp | **$0 to Noxtill** — the business pays Meta directly through its own WABA | n/a |

> **Correction to the current design.** The design under review prices SMS at $0.015 against a cost of $0.0123 (18% margin), email at $1/1,000 against a cost of ~$1.50/1,000 (**a loss**), and numbers at a flat $3/$5 against costs that vary by country. Those three must change before launch. The A2P 10DLC campaign fee ($1.50–$10 per business per month) is absent from the design entirely and must be recovered in the Messaging add-on base fee.

### 3.4 Plan storage

Plans are **data, not code**. A new plan, or a change to an allowance, must be possible without a deployment.

```
plans
  id, code, name, status (draft|active|retired)
  billing_interval (month|year)
  price_cents, currency
  trial_days
  display_order
  created_at, retired_at

plan_entitlements
  plan_id
  metric_code            -- 'users', 'ai_credits', 'locations', ...
  kind                   -- capacity | allowance | spend_cap | feature | passthrough
  included_quantity      -- NULL means not_configured
  reset_rule             -- none | period | one_off
```

**Retired plans keep working for businesses already on them.** Never mutate a plan row that a live subscription points at; create a new version and migrate deliberately.

---

## 4. The AI credit system

### 4.1 What a credit is

A credit is a unit of model work. It is not a unit of money and must never be described as one in the interface.

Credits exist so that the customer sees one number instead of token counts across five providers, and so that Noxtill can change model or provider without repricing.

### 4.2 What consumes credits

**45 operations across 22 modules.** This table is the registry. A feature that calls a model and is not in this table is a bug.

| Module | Operation | Band |
|---|---|---|
| Dashboard | AI Insights | Medium |
| Dashboard | Nightly Close summary | Medium |
| AI Assistant | Business Chat turn | Small |
| AI Assistant | Help Assistant turn | Micro |
| AI Assistant | Voice Assistant turn | Small |
| Fast Sale (POS) | Voice-entry sale | Micro |
| Products & Services | Description generation | Small |
| Products & Services | Category suggestion | Micro |
| Bookings | No-show prediction | Micro |
| Bookings | Smart scheduling suggestion | Micro |
| Customers (CRM) | Segment suggestion | Small |
| Customers (CRM) | Business Memory summarisation | Medium |
| Reviews | Sentiment analysis | Micro |
| Reviews | AI review response draft | Small |
| Marketing | Campaign copy generation | Large |
| Marketing | AI Marketing Agent run | Medium |
| Marketing | Audience suggestion | Small |
| Profit & Analytics | Insight explanation | Medium |
| Inventory | Reorder suggestion | Micro |
| Inventory | Demand forecast | Medium |
| Social Media | AI Content Studio post | Small |
| Social Media | Caption and hashtags | Micro |
| Advertising | Ad copy variants | Small |
| Business Listings | Listing description | Small |
| Competitive Insights | AI recommendations | Medium |
| AI Phone Receptionist | Call summary | Medium |
| SEO Autopilot | AI SEO Agent run | Medium |
| SEO Autopilot | Content optimiser | Large |
| Unified Inbox | Message classification | Micro |
| Unified Inbox | Suggested reply | Small |
| Unified Inbox | Translation | Micro |
| Helpdesk | Ticket classification | Micro |
| Helpdesk | Suggested response | Small |
| Helpdesk | Knowledge base answer | Small |
| Projects & Tasks | Task breakdown | Small |
| Documents & eSign | Document draft | Large |
| Documents & eSign | Contract summary | Medium |
| Finance & Accounting | Transaction categorisation | Micro |
| Finance & Accounting | Anomaly detection | Medium |
| Business Intelligence | Business Brain | **Heavy** |
| Business Intelligence | Opportunity Radar | Medium |
| Business Intelligence | Business Simulator | **Heavy** |
| Business Intelligence | Diagnosis Center | Medium |
| Business Intelligence | Digital Twin | **Heavy** |
| Automations | AI node execution | Small |
| Autonomous Commerce | Store Optimizer | Medium |
| Autonomous Commerce | Experiment Lab | Medium |

### 4.3 What never consumes credits

| | Why |
|---|---|
| Sales, orders, bookings, CRM records | No model call |
| Reports, exports, dashboards | Deterministic SQL |
| Phone minutes | Own meter |
| Transcription | Own meter |
| Digitizer pages | Own meter |
| SEO keyword tracking | Own meter |
| eSign transactions | Own meter |
| SMS, email, WhatsApp | Own meter |
| Storage | Own meter |

Put this list in the interface. A customer who thinks taking a booking costs credits will use the product less.

### 4.4 Weighting bands

| Band | Credits | Approx. tokens | Rationale |
|---|---:|---|---|
| Micro | **1** | under 1,000 | A classification or a tag |
| Small | **3** | 1,000–4,000 | A short draft |
| Medium | **8** | 4,000–15,000 | A summary over real records |
| Large | **25** | 15,000–50,000 | A long generated artefact |
| Heavy | **75** | 50,000+ | A simulation over the whole business |

**These numbers are provisional and must be replaced with measured values.** Section 20, Phase 1, says how.

Sanity check against the existing demo data, which these bands reproduce:

| Feature | Operations | Credits | Implied average |
|---|---:|---:|---:|
| AI Assistant | 160 | 610 | 3.8 |
| AI Marketing Agent | 41 | 245 | 6.0 |
| AI SEO Agent | 25 | 150 | 6.0 |
| Workflow AI | 40 | 120 | 3.0 |

### 4.5 Credit economics

| | |
|---|---|
| Sold at | 1,000 credits for $10 → **$0.01 per credit** |
| Typical 4-credit operation | $0.04 of revenue |
| Typical model cost at that size | $0.002–0.01 |
| **Margin** | **75–85%** |

The risk is at the Heavy band. A Business Simulator run over 50,000 tokens may cost $0.15–0.50; at 75 credits it earns $0.75. That holds, but only if the band is correct. **A flat credit cost across all operations would lose money on Heavy and overcharge on Micro.** This is the whole reason for weighting.

### 4.6 Two buckets

| Bucket | Source | Resets | Consumed |
|---|---|---|---|
| **Included** | The plan | Every billing period, unused credits are discarded | **First** |
| **Purchased** | $10 top-ups | Never — carries forward indefinitely | Second |

Consumption order is **included before purchased**, always. This is the customer-favourable order: the customer never loses money they paid because a plan credit expired unused.

Display both separately. A customer who bought 1,000 credits must be able to see them survive the reset.

### 4.7 Reserve → commit → release

This is the core of the system. Get it wrong and you will either double-charge customers or let them run free.

```
RESERVE
  input:  business_id, metric, quantity, idempotency_key, operation_code
  steps:
    1. look up existing reservation by idempotency_key
       → found? return it. Do not reserve again.
    2. resolve effective entitlement (Section 6)
    3. atomic:
         available = (included_remaining + purchased_remaining) - reserved
         IF available < quantity  → return BLOCKED(reason, shortfall)
         reserved += quantity
    4. write credit_ledger row: state=reserved
    5. return reservation_id

COMMIT
  input:  reservation_id, actual_quantity (may differ from reserved)
  steps:
    1. if already committed → return (idempotent)
    2. atomic:
         consume from included first, then purchased
         reserved -= reserved_quantity
         used     += actual_quantity
    3. ledger row: state=committed, actual recorded
    4. emit usage.recorded event

RELEASE
  input:  reservation_id, reason
  steps:
    1. if already settled → return (idempotent)
    2. atomic: reserved -= reserved_quantity
    3. ledger row: state=released, reason recorded
    4. nothing is charged
```

**Expiry.** A reservation that is neither committed nor released within **15 minutes** is auto-released by a sweeper job. Without this, a crashed worker permanently locks credits.

**Atomicity.** The `available` check and the `reserved +=` must be a single atomic operation — a conditional UPDATE with a WHERE clause on the current values, or a Lua script in Redis with the ledger written after. Two concurrent requests must never both pass a check that only one should pass.

**Test for this explicitly.** Fire 20 simultaneous reserve calls against a balance of 10 credits with 1 credit each and assert exactly 10 succeed. This test must be in CI.

### 4.8 Estimating before reserving

Model cost is known only after the call. Reserve the **band's nominal value** up front, commit the **actual** afterwards.

If actual exceeds reserved by more than 50%, commit the actual anyway but emit `usage.estimate_exceeded` so the band can be re-tuned. Do not fail the operation the customer already received.

---

## 5. Metered services

Everything with a real external per-unit cost gets its own meter, separate from credits.

### 5.1 The meters

| Metric code | Unit | Kind | Provider | Reset |
|---|---|---|---|---|
| `sms_segments` | segment | pass-through + spend cap | Twilio | period |
| `emails` | email | pass-through + spend cap | Postmark | period |
| `whatsapp_messages` | message | counted only, **not billed by Noxtill** | Meta (customer's WABA) | period |
| `voice_minutes` | minute | pass-through + spend cap | Twilio | period |
| `ai_voice_minutes` | minute | pass-through + spend cap | Twilio + model | period |
| `phone_numbers` | number | capacity + monthly rental | Twilio | none |
| `storage_bytes` | byte | allowance | own infra | none (high-water) |
| `digitizer_pages` | page | allowance | model | period |
| `seo_keywords` | keyword | allowance | SEO provider | none (high-water) |
| `esign_transactions` | transaction | allowance | eSign provider | period |
| `automation_runs` | run | allowance | own infra | period |
| `websites` | site | capacity | own infra | none |
| `video_minutes` | participant-minute | counted only | self-hosted LiveKit — **no per-minute cost** | period |

**WhatsApp is counted but not billed.** Because the business connects its own WhatsApp Business Account through Embedded Signup, Meta bills the business directly. Noxtill shows the count for the customer's own visibility and charges nothing. Say so on the screen, in those words — it is a genuine advantage and customers will not infer it.

**Video is counted but not billed** for the same structural reason: self-hosted LiveKit has no per-minute vendor fee. Counting it still matters for capacity planning.

### 5.2 Pass-through pricing rule

Never hardcode a pass-through price. Derive it:

```
price_per_unit = max(FLOOR, roundUp(provider_cost × MULTIPLIER, GRANULARITY))
```

| Metric | Multiplier | Floor | Granularity |
|---|---:|---:|---:|
| SMS segment | 4.0 | $0.03 | $0.001 |
| Email | 4.0 | $0.004 | $0.0001 |
| Voice minute | 4.0 | $0.03 | $0.001 |
| Phone number (monthly) | 3.5 | $4.00 | $0.50 |
| Toll-free number (monthly) | 3.5 | $8.00 | $0.50 |

**Provider cost is fetched, not assumed.** Twilio exposes a Pricing API at `https://pricing.twilio.com/v1/PhoneNumbers/Countries/{ISO}` returning `base_price` and `current_price` per `number_type` (local, mobile, national, toll free), and equivalent endpoints for voice and messaging. Use `current_price` — it reflects your account's negotiated rate, so your margin improves automatically as volume grows.

**Refresh monthly. Alert if any provider cost moves more than 10%.** A silent provider price rise erodes margin invisibly until the invoice arrives.

**Existing customers are repriced only at their next renewal, with 30 days' notice** — Terms of Service §5.9.

### 5.3 A2P 10DLC — the fixed cost nobody budgets for

US SMS requires brand and campaign registration with The Campaign Registry.

| Fee | Amount | When |
|---|---:|---|
| Brand registration | $4.50 | Once per business |
| Campaign registration | $15.00 | Once per use case; again if rejected and resubmitted |
| Monthly campaign fee — low-volume mixed | $1.50 | Every month |
| Monthly campaign fee — standard single use case | $10.00 | Every month |
| Standard campaign commitment | 3 months upfront ($30) | At launch |

**This is a fixed per-business monthly cost that applies whether or not a single message is sent.** It must be recovered in the Messaging add-on base fee, not in the per-message price.

**Open decision — resolve before building the Messaging add-on:** confirm with Twilio whether, as a platform onboarding many businesses, each business needs its own campaign registration and at which tier. The difference between $1.50 and $10.00 per business per month moves the Messaging add-on margin from 68% to 39%.

Model it as a metric so it is visible:

```
metric_code: 'messaging_registration'
kind:        passthrough
unit:        month
cost:        1.50 or 10.00
display:     inside the Messaging add-on, not as a separate line to the customer
```

### 5.4 AI voice minutes — instrument before pricing

A minute of AI receptionist time costs:

| Component | Per minute |
|---|---:|
| Twilio inbound | $0.0085 |
| Recording | $0.0025 |
| Transcription | ~$0.005 |
| **Realtime speech model (in + out)** | **unknown — measure it** |

The model component dominates and decides whether $0.35/minute is a 60% margin or a 43% one. **Do not set this price from an estimate.** Run 100 real calls in staging, measure actual provider cost per minute, then set the price at `cost ÷ 0.25`.

**Pre-flight reserve.** Before answering an AI call, require that the remaining voice spend cap can cover a **10-minute call at the current rate**. This is already in the design ("Each new AI call needs $3.50 available to be answered") and is correct — it prevents a call being cut off mid-sentence, which is worse for the customer than not answering at all.

Apply the same pattern to every long-running metered operation: video meetings, bulk campaigns, large document generation.

### 5.5 Spend caps

Every pass-through metric has a monthly spend cap. The customer sets it; the system enforces it.

| Rule | |
|---|---|
| Default on a new subscription | Conservative — $10 voice, $10 messaging |
| Raising the cap | Customer action, logged |
| At the cap | **New operations are refused.** Operations already in flight complete. |
| Never | Exceed the cap to complete a new operation |
| Exception | Nothing. There is no override flag for a tenant administrator. |

---

## 6. Entitlement resolution

At any moment, a business has exactly one **effective entitlement set**. It is computed, cached, and versioned — never read piecemeal from four tables at the point of use.

### 6.1 Resolution order

```
1. Plan entitlements          (from plan_entitlements)
2. + Purchased capacity        (seats, locations, numbers, credit top-ups)
3. + Contractual overrides     (Enterprise; explicit rows, always audited)
4. − Suspensions               (non-payment, policy action)
= EFFECTIVE ENTITLEMENT SET
```

### 6.2 Shape

```json
{
  "business_id": "...",
  "resolved_at": "2026-10-31T00:00:00Z",
  "version": 47,
  "plan_code": "growth",
  "period": { "start": "2026-10-28", "end": "2026-11-28", "timezone": "UTC" },
  "status": "active",
  "metrics": {
    "users":      { "kind":"capacity",  "included":5,    "purchased":0, "used":4,     "remaining":1 },
    "locations":  { "kind":"capacity",  "included":1,    "purchased":0, "used":1,     "remaining":0 },
    "ai_credits": { "kind":"allowance", "included":1500, "purchased":0, "used":1125,
                    "reserved":0, "remaining":375, "resets_at":"2026-11-28" },
    "sms_segments": { "kind":"passthrough", "spend_cap_cents":1000, "spent_cents":0,
                      "state":"not_configured" }
  },
  "features": { "ai_phone_receptionist": true, "business_intelligence": false }
}
```

### 6.3 Caching

| | |
|---|---|
| Cache | Redis, keyed `entitlement:{business_id}` |
| TTL | 60 seconds |
| Invalidated by | plan change, purchase, usage commit, period roll, suspension |
| Version | Monotonic integer, bumped on every change |
| On cache miss | Recompute from Postgres. Never serve a stale set after an invalidating event. |

**Reads may use the cache. Reservations must not.** A reservation reads the authoritative counters inside its atomic operation.

### 6.4 `not_configured`

A metric with no confirmed allowance is `not_configured`, and that state means:

- The usage is **paused** — the feature does not run
- Nothing is charged
- The screen says so plainly: *"Allowance not confirmed yet. Usage is paused and nothing is charged."*

This is correct and already in the design. It is far better than inventing a number. Keep it.

---

## 7. Data model

### 7.1 Tables

```sql
-- PLANS ---------------------------------------------------------------
plans (
  id uuid pk, code text unique, name text,
  status text,                      -- draft | active | retired
  billing_interval text,            -- month | year
  price_cents int, currency char(3),
  trial_days int,
  display_order int,
  created_at timestamptz, retired_at timestamptz
)

plan_entitlements (
  id uuid pk, plan_id uuid fk,
  metric_code text, kind text,
  included_quantity numeric null,   -- NULL = not_configured
  reset_rule text,                  -- none | period | one_off
  unique (plan_id, metric_code)
)

meter_definitions (
  metric_code text pk, display_name text, unit text, kind text,
  provider text null, reset_rule text,
  alert_thresholds int[] default '{50,75,90,100}',
  is_billable boolean, sort_order int
)

-- SUBSCRIPTION --------------------------------------------------------
subscriptions (
  id uuid pk, business_id uuid unique, plan_id uuid fk,
  status text,                      -- trialing | active | past_due | paused | cancelled
  billing_interval text,
  period_start timestamptz, period_end timestamptz,
  trial_ends_at timestamptz null,
  stripe_subscription_id text null,
  cancel_at_period_end boolean default false,
  created_at, updated_at
)

-- ALLOWANCES (one row per business × metric × period) -----------------
allowances (
  id uuid pk, business_id uuid, metric_code text,
  period_start timestamptz, period_end timestamptz,
  included_quantity numeric null,
  purchased_quantity numeric default 0,   -- carries across periods
  used_quantity numeric default 0,
  reserved_quantity numeric default 0,
  spend_cap_cents int null,
  spent_cents int default 0,
  state text,                        -- ok | approaching | at_limit | not_configured
  unique (business_id, metric_code, period_start)
)

-- EVENTS (append-only; never UPDATE, never DELETE) --------------------
usage_events (
  id uuid pk,
  business_id uuid, branch_id uuid null, actor_user_id uuid null,
  metric_code text, operation_code text null,
  quantity numeric, unit text,
  cost_cents int null,               -- our provider cost, for margin tracking
  price_cents int null,              -- what the customer is charged
  provider text null, provider_ref text null,
  idempotency_key text,
  occurred_at timestamptz, recorded_at timestamptz,
  metadata jsonb,
  unique (business_id, idempotency_key)
)

-- CREDIT LEDGER -------------------------------------------------------
credit_ledger (
  id uuid pk, business_id uuid,
  reservation_id uuid, idempotency_key text,
  operation_code text, band text,
  reserved_quantity numeric, actual_quantity numeric null,
  bucket text null,                  -- included | purchased | split
  state text,                        -- reserved | committed | released | expired
  reason text null,
  reserved_at timestamptz, settled_at timestamptz null,
  expires_at timestamptz,
  unique (business_id, idempotency_key)
)

-- PURCHASES -----------------------------------------------------------
capacity_purchases (
  id uuid pk, business_id uuid, metric_code text,
  quantity numeric, unit_price_cents int,
  recurring boolean,                 -- seats/locations/numbers yes; credits no
  stripe_item_id text null,
  active_from timestamptz, active_to timestamptz null,
  created_by uuid, created_at timestamptz
)

-- PROVIDER COST (reconciliation) --------------------------------------
provider_costs (
  id uuid pk, provider text, metric_code text,
  country_code text null, number_type text null,
  unit_cost_cents numeric, currency char(3),
  fetched_at timestamptz, source text    -- api | manual
)

provider_invoices (
  id uuid pk, provider text, period_start date, period_end date,
  line_item text, provider_quantity numeric, provider_cost_cents int,
  our_quantity numeric, our_cost_cents int,
  variance_pct numeric, status text,      -- matched | investigating | resolved
  created_at timestamptz
)

-- ALERTS --------------------------------------------------------------
usage_alerts (
  id uuid pk, business_id uuid, metric_code text,
  threshold int, period_start timestamptz,
  sent_at timestamptz, channels text[],
  unique (business_id, metric_code, threshold, period_start)
)

-- AUDIT ---------------------------------------------------------------
entitlement_audit (
  id uuid pk, business_id uuid, actor_user_id uuid null, actor_type text,
  change_type text,                  -- plan_change | purchase | override | suspension
  before jsonb, after jsonb, reason text, created_at timestamptz
)
```

### 7.2 Indexes that matter

```sql
create index on usage_events (business_id, metric_code, occurred_at desc);
create index on usage_events (business_id, occurred_at desc);
create index on credit_ledger (business_id, state) where state = 'reserved';
create index on credit_ledger (expires_at) where state = 'reserved';
create unique index on allowances (business_id, metric_code, period_start);
```

The partial index on `state = 'reserved'` keeps the expiry sweeper cheap as the ledger grows.

### 7.3 Counters: two layers

| Layer | Holds | Used for |
|---|---|---|
| **Redis** | live counters per business × metric | Screen reads, badge counts, the 60-second entitlement cache |
| **Postgres** | `usage_events`, `credit_ledger`, `allowances` | Billing, disputes, reconciliation, recovery |

**Display from Redis. Bill from Postgres. Reconcile nightly.** If the two disagree, Postgres wins and Redis is rebuilt from it.

Redis must be treated as disposable. The system must survive a complete Redis flush with no billing impact — only a brief latency increase while counters rebuild.

---

## 8. Enforcement

### 8.1 Where checks happen

A single middleware, applied at the API layer, before the handler runs.

```
Request
  ↓
Auth + tenant scoping
  ↓
Entitlement middleware
  ├─ Does this route declare a metric?        no  → continue
  ├─ Feature flag check                       fail → 403 feature_not_in_plan
  ├─ Capacity check (users/locations/numbers) fail → 403 capacity_reached
  ├─ Allowance reserve (credits)              fail → 402 allowance_exhausted
  └─ Spend cap check (pass-through)           fail → 402 spend_cap_reached
  ↓
Handler runs
  ↓
Commit or release
```

Routes declare their metric in one place:

```ts
@Metered({ metric: 'ai_credits', operation: 'inbox.suggested_reply', band: 'small' })
@Post('/inbox/threads/:id/suggest')
```

**Every metered route must be declared.** A CI check enumerates routes that call a model provider and fails the build if any lacks a `@Metered` declaration. Without this, metering decays the moment someone ships a feature in a hurry.

### 8.2 Error contract

```json
{
  "error": {
    "code": "ALLOWANCE_EXHAUSTED",
    "metric": "ai_credits",
    "message": "You have used all 1,500 AI credits for this period.",
    "remaining": 0,
    "resets_at": "2026-11-28T00:00:00Z",
    "remedies": [
      { "type": "purchase", "label": "Buy 1,000 credits", "price_cents": 1000 },
      { "type": "upgrade",  "label": "Professional",      "grants": 4000 }
    ],
    "request_id": "req_..."
  }
}
```

**Every limit error carries remedies.** A dead end with no next step is a support ticket.

**Only offer plans that actually include the thing.** If a feature is in Business but not Professional, do not offer Professional. This is already stated in the design — honour it in the remedies builder, not just in the copy.

### 8.3 Status codes

| Situation | Code |
|---|---|
| Feature not in plan | **403** `FEATURE_NOT_IN_PLAN` |
| Capacity reached (users, locations) | **403** `CAPACITY_REACHED` |
| Allowance exhausted (credits, runs) | **402** `ALLOWANCE_EXHAUSTED` |
| Spend cap reached | **402** `SPEND_CAP_REACHED` |
| Metric not configured | **503** `METRIC_NOT_CONFIGURED` |
| Subscription past due | **402** `SUBSCRIPTION_PAST_DUE` |

402 is used where paying resolves it. 403 is used where it does not.

---

## 9. API contracts

### 9.1 Read

```
GET /api/v1/usage/overview
  → every metric, current state, period, alert banner

GET /api/v1/usage/entitlements
  → the resolved entitlement set (Section 6.2)

GET /api/v1/usage/metrics/{metric_code}
  → detail: included, purchased, used, reserved, remaining, history

GET /api/v1/usage/credits/by-feature?period=current
  → operations and credits grouped by operation_code

GET /api/v1/usage/history?metric=&from=&to=&cursor=
  → paginated usage_events, newest first

GET /api/v1/usage/communication?channel=&period=
  → sent, delivered, failed, billable, charges, by channel

GET /api/v1/usage/country-prices?metric=sms_segments
  → per-country published price list

GET /api/v1/plans
  → catalog with the current plan marked

GET /api/v1/plans/compare?target={code}
  → side-by-side, what changes, price difference
```

### 9.2 Write

```
POST /api/v1/usage/reserve
  { metric, quantity, operation_code, idempotency_key }
  → 200 { reservation_id, expires_at }
  → 402 { error with remedies }

POST /api/v1/usage/reservations/{id}/commit
  { actual_quantity }

POST /api/v1/usage/reservations/{id}/release
  { reason }

POST /api/v1/usage/record            -- for non-reserved pass-through
  { metric, quantity, provider_ref, cost_cents, idempotency_key }

POST /api/v1/usage/purchase
  { metric_code, quantity }          -- credits, seats, locations

PUT  /api/v1/usage/spend-caps/{metric_code}
  { cap_cents }

POST /api/v1/subscription/change-plan
  { plan_code, effective }           -- immediate | period_end

POST /api/v1/subscription/cancel
  { at_period_end: true }
```

**Internal only, never exposed to tenants:**

```
POST /internal/usage/period-roll        -- scheduled
POST /internal/usage/reconcile          -- scheduled
POST /internal/usage/sweep-reservations -- scheduled, every minute
```

### 9.3 Idempotency

Every write accepts `Idempotency-Key`. Replaying a key returns the original result without re-executing. Keys are retained 7 days.

---

## 10. Events

```
usage.reserved            { business_id, metric, quantity, reservation_id }
usage.committed           { business_id, metric, actual, operation_code }
usage.released            { business_id, metric, reason }
usage.recorded            { business_id, metric, quantity, cost_cents, price_cents }
usage.threshold_crossed   { business_id, metric, threshold }
usage.limit_reached       { business_id, metric }
usage.estimate_exceeded   { business_id, operation_code, reserved, actual }
entitlement.changed       { business_id, version, change_type }
subscription.plan_changed { business_id, from, to, effective }
subscription.period_rolled{ business_id, period_start, period_end }
capacity.purchased        { business_id, metric, quantity }
spend_cap.updated         { business_id, metric, from_cents, to_cents }
provider.cost_changed     { provider, metric, country, from, to, pct }
reconciliation.variance   { provider, metric, our_qty, provider_qty, pct }
```

Events are published through a transactional outbox — written in the same transaction as the state change, published asynchronously. Never publish from inside the handler before the transaction commits.

---

## 11. Frontend — 14 screens

Route base: `/settings/usage`

Shared chrome on every screen: breadcrumb (Settings / Usage & Limits), plan badge, billing period, next reset date, status, and the 14-item tab strip.

| # | Route | Screen | Content |
|---|---|---|---|
| 1 | `/overview` | Usage Overview | Alert banner for the most urgent metric; a card per metric with used/remaining/percent/resets; `not_configured` cards shown plainly |
| 2 | `/plan` | Plan Allowances | Subscription facts; full allowance table (included, purchased, used, remaining, status); modules-by-plan when confirmed |
| 3 | `/team` | Users & Locations | Seats: included, purchased, active, pending, remaining. Locations list. "How seats are counted". Invite and Add-location actions with inline price |
| 4 | `/ai` | AI Credits & AI Usage | Balance with the two buckets separated; credits by feature table; "How AI credits work"; buy-credits action |
| 5 | `/comm` | Communication | Email, SMS, WhatsApp blocks: sent, delivered, failed, billable, price, charges. Country price lookup. Message breakdown table |
| 6 | `/voice` | Voice & Calling | AI receptionist minutes and spend against cap; local and toll-free numbers with rental; per-call list |
| 7 | `/auto` | Automation | Runs used, by workflow; how a run is counted; history |
| 8 | `/storage` | Storage & Documents | Bytes used by category; how it is counted; history |
| 9 | `/digitizer` | Photo Digitizer | Pages processed; how counted; history |
| 10 | `/seo` | SEO | Keywords tracked; how counted; history |
| 11 | `/esign` | eSign | Transactions; how counted; history |
| 12 | `/web` | Websites & Integrations | Sites and connected integrations against capacity |
| 13 | `/history` | Usage History | Filterable, paginated event log across all metrics; CSV export |
| 14 | `/limits` | Limits & Upgrade | What happens at each limit; plan comparison; upgrade and top-up actions |

### 11.1 Metric card — the one component that matters

Every metric renders through one component. Do not let each screen invent its own.

```
┌──────────────────────────────────────────────┐
│ AI credits                  Approaching limit │
│                                               │
│ 1,125  of 1,500 credits                       │
│ ████████████████████░░░░░░░  75%              │
│                                               │
│ Remaining   375                               │
│ Used        75%                               │
│ Resets      Nov 28, 2026                      │
└──────────────────────────────────────────────┘
```

### 11.2 States

| State | Threshold | Treatment |
|---|---|---|
| `ok` | under 50% | Neutral |
| `approaching` | 50–89% | Warning tone |
| `at_limit` | 90–99% | Stronger warning, remedy visible |
| `exceeded` | 100% | Blocked tone, remedy primary |
| `not_configured` | — | Muted; *"Allowance not confirmed yet. Usage is paused and nothing is charged."* |
| `unavailable` | — | Muted; *"This service isn't live yet. Nothing is sent or charged, and you don't need to do anything."* |

**Never show a progress bar for `not_configured`.** A bar at 0% implies a limit exists.

### 11.3 Copy rules

| Do | Don't |
|---|---|
| "You have 375 credits left" | "You have used 75% of your quota" |
| "Resets Nov 28, 2026" | "Resets in 28 days" |
| "Add a seat · $10/month" | "Upgrade for more seats" |
| "Nothing is charged" | silence |
| State the exact number | "almost at your limit" |

Every limit message answers three things: **what stopped, what it costs to resolve, when it resets on its own.**

### 11.4 Accessibility

Status is never carried by colour alone — every state has a text label. Progress bars carry `role="progressbar"` with `aria-valuenow`/`aria-valuemax`. Threshold crossings announce through a polite live region, throttled to one announcement per metric per page view.

---

## 12. Alerts

| Threshold | Channels |
|---|---|
| 50% | In-app |
| 75% | In-app + email |
| 90% | In-app + email + upgrade prompt |
| 100% | In-app + email, action blocked |

| Rule | |
|---|---|
| Fired once per metric per threshold per period | `usage_alerts` unique constraint |
| Recipient | Owner, plus any user with the billing permission |
| An alert never permits an overage | It is information, not authorisation |
| Period roll clears alert history | New period, new alerts |
| Suppressed | While subscription is `cancelled` |

---

## 13. Billing integration

### 13.1 Division of responsibility

| Stripe | This system |
|---|---|
| Takes the money | Decides what the customer is entitled to |
| Merchant of record | Measures what they used |
| Calculates tax | Enforces limits |
| Issues receipts and invoices | Produces the usage lines |
| Handles dunning | Reacts to dunning state |

Stripe is the merchant of record (Terms §5.6), so Stripe calculates, collects and remits indirect tax on the subscription. This system never computes tax.

### 13.2 Mapping

| Noxtill | Stripe |
|---|---|
| Plan | Product + recurring Price |
| Extra seat | Recurring Price, quantity = seats purchased |
| Extra location | Recurring Price, quantity |
| Phone number | Recurring Price, quantity, per number type |
| 1,000 credits | One-off Price |
| Messaging add-on | Recurring Price (covers the 10DLC campaign fee) |
| Pass-through usage | Invoice item added before period close |

### 13.3 Webhooks to handle

```
customer.subscription.created   → create subscription, seed allowances
customer.subscription.updated   → plan or quantity change → re-resolve
customer.subscription.deleted   → cancel, start the data retention clock
invoice.payment_succeeded       → clear past_due, roll period
invoice.payment_failed          → mark past_due, begin grace
checkout.session.completed      → credit top-up: add to purchased bucket
```

Every webhook handler is idempotent and keyed on the Stripe event id. Stripe retries; duplicates must be harmless.

### 13.4 Dunning

| Day | State | Effect |
|---|---|---|
| 0 | Payment fails | `past_due`. Everything keeps working. Notify. |
| 1–7 | Retrying | Full access. Banner in app. |
| 8 | Still failing | **Metered services paused** — no SMS, no voice, no AI credits. Core software still works. |
| 15 | Still failing | Account suspended, read and export only. |
| 60 | — | Data deletion begins per the retention schedule. |

**Never delete data because of non-payment before the retention window in the Data Retention Schedule.** The customer must be able to export throughout.

---

## 14. Plan changes

### 14.1 Upgrade — immediate

| | |
|---|---|
| Takes effect | Immediately |
| Allowances | Reset to the new plan's included quantities immediately |
| Purchased credits | Untouched — they carry |
| Used-this-period | Carried forward, not reset to zero |
| Period | A new period starts at the upgrade moment |
| Money | Stripe prorates |

**Decision, stated so nobody re-opens it:** on upgrade, `used` carries and `included` rises. A business on Growth that used 1,400 of 1,500 credits and upgrades to Professional has used 1,400 of 4,000 — not 0 of 4,000. Resetting usage to zero on upgrade is an exploitable loop: upgrade, consume, downgrade, repeat.

### 14.2 Downgrade — at period end

| | |
|---|---|
| Takes effect | End of the current period |
| Until then | Current plan continues in full |
| Blocked if | Current usage of a **capacity** metric exceeds the target plan |

A business with 12 users cannot downgrade to a 5-user plan. The screen must say which metrics block it and by how much:

> *"Professional includes 15 users and you have 12. Growth includes 5. Remove 7 users before downgrading, or keep Professional."*

Allowances do not block a downgrade — they simply drop at the next period.

### 14.3 Cancellation

Access continues to period end. Then the retention clock in the Data Retention Schedule starts: 60 days available for export, then deletion from active systems, then backup expiry.

---

## 15. Trial

| | |
|---|---|
| Length | 14 days |
| Credits | **200 total — not monthly, not renewed** |
| Users | 2 |
| Locations | 1 |
| Payment method | Not required to start |
| Metered services | **All disabled.** No SMS, no voice, no phone numbers, no email sends to external recipients. |
| Modules | All visible. Credit-consuming features run until the 200 are gone. |

### 15.1 Why metered services are off during trial

A trial with no card and live SMS or voice is a fraud route: sign up, pump traffic to premium destinations, abandon the account. Noxtill carries the provider bill.

The trial proves the software. It does not need to prove the carrier.

### 15.2 Trial end

| Event | Behaviour |
|---|---|
| Day 11 | Reminder: 3 days left, what happens next |
| Day 13 | Reminder: tomorrow |
| Day 14, card on file | Converts to the selected plan. Allowances seeded. |
| Day 14, no card | Account moves to `paused`: read and export only. No deletion. |
| Credits exhausted before day 14 | AI features pause. Everything else continues. Offer the plan. |

**Never auto-charge a trial without a card the customer added and an explicit plan selection.** Terms §5.1 and §5.3 commit to this, and state automatic-renewal statutes require it.

---

## 16. Failure modes

A senior engineer is judged on this section. Decide each case now, in writing.

| Failure | Behaviour | Why |
|---|---|---|
| **Redis down** | Read counters from Postgres. Slower, correct. | Redis is a cache, never the truth |
| **Postgres down** | Refuse all metered operations | Cannot reserve safely |
| **Metering service down** | Fail **closed** for credits and pass-through; fail **open** for feature flags | Never give away provider-cost work; never lock a customer out of software they paid for |
| **Provider webhook late** | Record on arrival with the provider's timestamp; reconcile | Provider time is authoritative |
| **Provider webhook never arrives** | Nightly reconciliation catches it | Never lose revenue to a dropped webhook |
| **Worker crashes mid-operation** | Reservation expires after 15 minutes and is released | Crashed work must not hold credits |
| **Clock skew across nodes** | All period arithmetic in UTC from the database clock | Never trust an application server's clock for billing |
| **Duplicate webhook** | Idempotency key on provider event id | Providers retry |
| **Negative balance detected** | Alert at SEV2, do not auto-correct | A negative balance means the atomic guarantee broke; investigate before masking |
| **Provider price rises silently** | Monthly refresh + 10% alert | Margin erodes invisibly otherwise |

### 16.1 The fail-open budget

Where the system fails open, it does so **with a ceiling**. If the metering service is unavailable, allow feature-flag access but cap accumulated unmetered pass-through spend at **$5 per business** before failing closed. Log everything for later settlement.

An unbounded fail-open is how a one-hour outage becomes a five-figure provider invoice.

---

## 17. Reconciliation

Nightly, per provider.

```
1. Pull the provider's usage for the period
2. Aggregate our usage_events for the same period and metric
3. Compute variance
4. variance ≤ 2%   → matched
   variance > 2%   → flag, create provider_invoices row, alert finance
5. Never auto-adjust a customer's bill from a variance.
   Investigate, then correct deliberately with an audit record.
```

### 17.1 Margin monitoring

Because `usage_events` carries both `cost_cents` and `price_cents`, margin is queryable:

```sql
select metric_code,
       sum(price_cents) as revenue,
       sum(cost_cents)  as cost,
       round(100.0 * (sum(price_cents) - sum(cost_cents))
             / nullif(sum(price_cents),0), 1) as margin_pct
from usage_events
where occurred_at >= date_trunc('month', now())
group by 1
order by margin_pct asc;
```

**Alert when any metric's margin falls below 60%.** This single query is the early warning for every pricing mistake in Section 3.3.

---

## 18. Security and audit

| Control | |
|---|---|
| Tenant scoping | Every query carries `business_id`; enforced at the data-access layer, not in handlers |
| Permissions | Owner and billing-permission holders see usage and purchase; other roles see their own consumption only |
| `usage_events` | Append-only. No UPDATE, no DELETE. Enforced by database grants, not convention. |
| `credit_ledger` | State transitions only forward: reserved → committed \| released \| expired |
| Entitlement changes | Every one written to `entitlement_audit` with actor and before/after |
| Overrides | Enterprise overrides require two-person approval and a reason |
| Internal endpoints | Not reachable from tenant-authenticated sessions |
| Retention | `usage_events` 7 years — they support invoices (Data Retention Schedule §5) |

---

## 19. QA acceptance matrix

Each row is a test that must exist and pass before release.

### Credits

| ID | Test | Expected |
|---|---|---|
| CR-01 | Reserve with sufficient balance | Reservation created, `reserved` increases |
| CR-02 | Reserve with insufficient balance | 402 with remedies, nothing reserved |
| CR-03 | **20 concurrent reserves of 1 against balance 10** | **Exactly 10 succeed** |
| CR-04 | Commit after reserve | `used` rises, `reserved` falls, balance consistent |
| CR-05 | Release after reserve | `reserved` falls, `used` unchanged, no charge |
| CR-06 | Same idempotency key twice | One reservation, one charge |
| CR-07 | Reservation abandoned 16 minutes | Auto-released by sweeper |
| CR-08 | Actual exceeds reserved | Actual committed, `estimate_exceeded` emitted |
| CR-09 | Included exhausted, purchased available | Consumes purchased, operation succeeds |
| CR-10 | Period rolls | Included resets, **purchased survives** |
| CR-11 | Balance can never go negative | Property test over random concurrent sequences |

### Capacity

| ID | Test | Expected |
|---|---|---|
| CP-01 | Invite at the seat limit | 403, remedies offered |
| CP-02 | Pending invitation counts | Seat consumed from send, not acceptance |
| CP-03 | Deactivated user | Seat released |
| CP-04 | Owner | Counts as a seat |
| CP-05 | Purchase a seat | Immediately usable |
| CP-06 | Location at limit | 403 with the add-location price |

### Spend caps

| ID | Test | Expected |
|---|---|---|
| SC-01 | Operation that would exceed the cap | Refused before the provider is called |
| SC-02 | Operation in flight when the cap is hit | Completes; the next one is refused |
| SC-03 | AI call with under 10 minutes of headroom | Not answered; reason logged |
| SC-04 | No administrator override exists | Confirmed by code search in CI |

### Plans

| ID | Test | Expected |
|---|---|---|
| PL-01 | Upgrade mid-period | New allowances immediate; `used` carries |
| PL-02 | Downgrade with capacity over target | Blocked, blocking metrics named |
| PL-03 | Downgrade within limits | Scheduled for period end |
| PL-04 | Upgrade-consume-downgrade loop | No free credits obtained |
| PL-05 | Retired plan on a live subscription | Continues to resolve correctly |

### Trial

| ID | Test | Expected |
|---|---|---|
| TR-01 | Trial starts | 200 credits, not 200/month |
| TR-02 | SMS attempted on trial | Refused, clear reason |
| TR-03 | Phone number purchase on trial | Refused |
| TR-04 | Credits exhausted at day 6 | AI pauses; rest of product works |
| TR-05 | Day 14 with no card | Paused, read and export only, no deletion |
| TR-06 | Day 14 with card and plan selected | Converts, allowances seeded |

### Resilience

| ID | Test | Expected |
|---|---|---|
| RS-01 | Redis flushed | Counters rebuild from Postgres, no billing impact |
| RS-02 | Metering service down, AI requested | Fails closed |
| RS-03 | Metering service down, dashboard opened | Fails open, software usable |
| RS-04 | Fail-open spend reaches $5 | Fails closed thereafter |
| RS-05 | Duplicate provider webhook | Recorded once |
| RS-06 | Provider cost rises 15% | Alert raised |
| RS-07 | Reconciliation variance 5% | Flagged, no silent adjustment |

### Isolation

| ID | Test | Expected |
|---|---|---|
| IS-01 | Business A reads B's usage | 404, not 403 — do not confirm existence |
| IS-02 | Business A reserves against B | Rejected |
| IS-03 | Public API respects limits | Same enforcement as the UI |
| IS-04 | Webhook-triggered automation respects limits | Same enforcement |

---

## 20. Build phases

**Do not build the screens first.** They are the easiest part to change and the hardest to change your mind about once a customer has seen them.

| Phase | Work | Exit condition |
|---|---|---|
| **1 — Observe** | `meter_definitions`, `usage_events`, the `@Metered` decorator, the CI route check. **Record only. Enforce nothing.** Log token counts and provider cost on every AI call. | Every metered route emits events in production |
| **2 — Measure** | Run one month. Analyse actual tokens and cost per `operation_code`. | Real cost per operation known for all 45 points |
| **3 — Price** | Set credit bands from measured data. Set pass-through prices from the Section 5.2 rule. Resolve the 10DLC tier with Twilio. Instrument AI voice minute cost. | Every price has a measured cost behind it and a margin ≥ target |
| **4 — Entitle** | `plans`, `plan_entitlements`, `subscriptions`, `allowances`, resolution, caching | Entitlement set resolves correctly for every plan |
| **5 — Reserve** | `credit_ledger`, reserve/commit/release, atomicity, idempotency, expiry sweeper | CR-01 to CR-11 pass, including the concurrency test |
| **6 — Enforce** | Middleware, error contract with remedies, spend caps, pre-flight reserve | CP, SC and IS suites pass |
| **7 — Alert** | Thresholds, channels, once-per-period guarantee | Alerts fire exactly once per threshold per period |
| **8 — Bill** | Stripe products, webhooks, purchases, dunning, plan changes | PL and TR suites pass |
| **9 — Show** | The 14 screens, shared metric card, all six states | Every state renders; accessibility checks pass |
| **10 — Reconcile** | Nightly provider reconciliation, margin query, alerting | Variance detected and flagged within 24 hours |

### 20.1 Why Phases 1–3 come first

Setting credit costs before measuring produces one of two outcomes, both bad: limits so tight that customers hit them doing ordinary work and churn, or so loose that Heavy operations are sold below cost.

One month of observation costs one month. Getting the prices wrong costs every customer acquired before the correction, because repricing an existing customer requires 30 days' notice and generates churn.

---

## 21. Open decisions

These block specific phases. Assign each an owner and a date.

| # | Decision | Blocks | Impact |
|---|---|---|---|
| 1 | **A2P 10DLC campaign tier** — $1.50 or $10 per business per month | Phase 3 | Messaging add-on margin: 68% or 39% |
| 2 | **AI realtime voice model cost per minute** | Phase 3 | Whether $0.35/min is 60% or 43% margin |
| 3 | **Metered billing route** — Stripe Managed Payments, or prepaid credits | Phase 8 | Hard to change after customers exist |
| 4 | **Modules by plan** — which plan includes which module | Phase 4 | The Plan Allowances screen cannot be completed without it |
| 5 | **Storage, automation runs, digitizer, SEO, eSign allowances** per plan | Phase 4 | Currently `not_configured` |
| 6 | **Credit rollover** — do unused included credits expire? | Phase 5 | Current answer: yes, expire. Confirm. |

Until decided, each stays `not_configured` and the screen says so. **That is the correct behaviour — an honest blank beats an invented number.**

---

## 22. Definition of done

- [ ] Every metered route carries a `@Metered` declaration; CI fails without one
- [ ] No allowance anywhere renders as "unlimited"
- [ ] The concurrency test (CR-03) passes in CI
- [ ] Balance cannot go negative, proven by property test
- [ ] Every limit error carries remedies, and only plans that include the thing
- [ ] Reaching 100% pauses; it never charges
- [ ] `usage_events` is append-only, enforced by database grants
- [ ] Every price has a measured provider cost behind it
- [ ] The margin query runs nightly and alerts below 60%
- [ ] Reconciliation runs nightly and flags variance above 2%
- [ ] Trial grants 200 credits total and disables every metered service
- [ ] No administrator override exists for a spend cap
- [ ] Redis can be flushed with no billing impact
- [ ] Every entitlement change is in `entitlement_audit`
- [ ] All six metric states render, and status never depends on colour alone

---

*End of specification.*
