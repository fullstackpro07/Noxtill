# Module 21 — AI + Human Contact Center: release report

Source: client specification `calllll.docx` / `calllll.pdf` (17 screens, sections 01–16).
Prepared 2026-10-21. Branch `codex/automation-foundation` (local, not pushed).

**Status in one line:** feature-complete in code and covered by automated tests; **not yet
accepted on live provider accounts** (Twilio, OpenAI, LiveKit, Stripe). Nothing below has been
exercised with a real phone call, real video room, real message or real invoice.

Legend: **Supported** = built, wired to real data, automated tests pass. **Partial** = built with a
documented limit. **Not supported** = not built; stated honestly in the product where relevant.
**Needs live acceptance** = code exists but only simulated provider responses were tested.

## 1. The 17 screens (spec sections 06–07)

| Screen | Status | Notes |
| --- | --- | --- |
| Call Overview | Supported | Handler / AI-agent-version filters, outbound today, minutes & spend (managers) |
| Incoming Calls (Live) + transfer | Supported · needs live acceptance | Warm/cold transfer, call legs, pending vs provider-confirmed |
| Missed Calls | Supported · needs live acceptance | Compliant call-backs; text-back gated by suppression/opt-out with provider delivery status |
| Call Queue | Supported · needs live acceptance | Follow-up priority/skills/take-next; Twilio hold queue with wait limit and overflow; SLA targets |
| Bookings from Calls | Supported | Canonical booking policies, staff approval/deposit handling, pinned agent version, caller-verified flag, failed attempts recorded |
| Transcripts & Recordings | Supported | Consent-gated recording, signed playback, delete with derived data, legal hold, retention purge, PII redaction |
| Call Analytics | Supported | Daily trends from stored facts, metric glossary, CSV export (masked) |
| Receptionist Settings | Supported · needs live acceptance | Provider health, usage, inbound cap, test numbers, verified SIP trunk |
| Agents & Availability | Supported | Human profiles/presence; AI agents: 12-stage builder, versions, approval, rollback, per-branch ownership |
| Agent Workspace | Supported · needs live acceptance | Wrap-up, copilot, follow-ups, browser softphone (Twilio Voice SDK) |
| Outbound Dialers | Supported · needs live acceptance | Approval, schedule, power dialer, AI campaigns, voicemail detection, CSV import, report |
| IVR & Routing Studio | Supported · needs live acceptance | Build/validate/simulate/publish/rollback; published flow used on live calls |
| Supervisor Center | Supported · needs live acceptance | Live view, listen/whisper/barge (internal conference transfers), SLA, operations health |
| Tracking & Attribution | Supported · needs live acceptance | Bought/connected tracking numbers, automatic attribution, results by source (deposits, not revenue) |
| Speech & Quality | Supported | Rubrics, reviews, AI suggestions, overrides, assignment |
| Video Meetings | Supported · needs live acceptance | LiveKit rooms, lobby, consent-gated recording, AI transcript/summary/draft, emailed invites |
| Consent & Compliance | Supported | Country policies, consent evidence, suppression, fail-closed eligibility, audit |

## 2. Engine, data and platform requirements (sections 03–05, 08–14)

| Area | Status | Evidence / limit |
| --- | --- | --- |
| Realtime AI audio + caller interruption | Supported · needs live acceptance | OpenAI Realtime over signed Twilio Media Streams; socket tests use simulated providers |
| AI tool calling and authorization | Supported | Pinned allowlist; catalog, slots, caller match, verified reschedule, ticket, unsent draft; no refund/payment tools |
| AI agent safety | Supported · needs live acceptance | Platform authority policy, untrusted-data framing, one-click attack pack with phrase tripwires, and an optional independent-model safety review per reply (pass/fail/uncertain; malformed or failed reviews are never a pass). Not a substitute for a human red-team review |
| ACD / human dispatch | Supported | Row-locked reservation, next-agent retry, dialer/call-back agents counted busy |
| Provider event durability | Supported | Inbox with dedupe/retry/dead-letter/replay for call status, transfers, agent legs, conference usage, realtime recording, dialer/voicemail/call-back status; TwiML-returning callbacks intentionally excluded (replaying them could repeat provider side effects) |
| Metering | Partial | Call, SMS, conference, video, realtime tokens, transcription seconds, storage bytes/byte-days, phone-number months; signed user downloads/local disk reads are not observed as egress |
| Billing handoff | Supported · needs live acceptance | Owner-approved rate versions and usage drafts; approved drafts sent to Stripe once as an invoice item; credits posted once as negative items and never above the billed total; selling prices must be supplied by the operator |
| Cost reconciliation | Partial | Read-only script compares Twilio account usage with the ledger per month; OpenAI/LiveKit/storage invoices are not reconciled automatically |
| Budget guardrails | Supported | Monthly phone cap with 70/90% alerts, per-version AI budgets, inbound automated-call cap (test calls excluded) |
| Security and tenancy | Supported | Global auth/tenancy guards, signed webhooks, HMAC storage URLs, audit logs |
| Observability | Supported · needs deployment | Liveness `/health`, readiness `/health/ready` (DB + Redis), `X-Request-Id` on every request and error, in-app operations metrics, and external alert forwarding to `OPS_ALERT_WEBHOOK_URL` (failure bursts, budget warnings, dead-lettered callbacks). A tracing backend and historic SLO dashboards are deployment tools, not app code |
| Accessibility (WCAG 2.2 AA) | Supported · needs a human audit | Automated axe scan and keyboard-only check (focus keeps moving, focus always visible) pass on all 17 screens; a person with a screen reader has not reviewed it |

## 3. QA evidence (section 15)

- Backend: full Jest suite (unit + real-MySQL integration). Latest counts are recorded in
  `docs/AGENT_WORK_SPLIT.md` for each batch.
- Browser: `cd frontend && npm run test:e2e` with both dev servers running — signs up a fresh QA
  business, logs in through the real form, loads all 17 screens and runs the axe scan.
  Includes a keyboard-only check. Last run 2026-10-21: **52/52 passed** (load, axe, keyboard).
- Load: `backend/scripts/load/voice-api-load.mjs` (GET-only). Local 10-user run: 0 server errors,
  p95 under 70 ms; the default 120 requests/minute per business limit throttled one business.
- Not done (needs production or people): soak tests at production scale, human red-team and
  screen-reader review, live provider acceptance.

## 4. Required before go-live (cannot be done in code)

1. Accounts and keys: Twilio (number, Voice SDK API key), OpenAI (Realtime + transcription),
   LiveKit, Stripe, email provider, S3-compatible encrypted storage.
2. Public HTTPS/WSS deployment, Redis with persistence and monitoring, database backups.
3. Register provider webhooks; point uptime monitoring and paging at `/health/ready`.
4. Set `API_RATE_LIMIT_PER_MINUTE` from measured traffic (default 120 per business may be low
   when many staff use the phone screens at once).
5. Supply the selling rate card (`VOICE_BILLING_RATE_CARD_JSON`) — no default prices exist.
6. Live acceptance on real accounts: inbound AI call, interruption, recording consent, transfer,
   softphone, supervisor whisper, power dialer, call-back, tracking number, video meeting,
   text-back delivery, Stripe invoice item. Record results per `MODULE21_RUNBOOK.md`.
7. Owner decision: missed-call text-back is on by default and also texts non-customers.

## 5. Explicitly not supported

- Predictive dialing / abandonment optimization (excluded by the spec's initial scope).
- National Do Not Call registry lookups (only first-party suppression and consent evidence).
- Revenue per campaign (bookings have no sale value; deposits are shown instead).
- AI refunds or payment actions (denied by default per the spec's tool matrix).
- Breakout rooms in video meetings (spec: "not V1").
