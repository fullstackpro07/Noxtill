# Module 21 — operator runbook

Updated 2026-10-21. This describes current implementation, not a signed production launch.
Use `MODULE21_COMPLETION_CHECKLIST.md` for unfinished requirements and
`AGENT_WORK_SPLIT.md` for verification evidence. Never replace a missing provider receipt with
an estimated success, a fake recording or an inferred price.

## Ownership and authoritative state

- Noxtill owns tenant permissions, business policy, published agent/IVR versions, call routing
  decisions, booking/tool requests, consent evidence and audit records.
- Twilio owns PSTN legs, conferencing and confirmed telephony outcomes. A submitted command is
  not evidence that a person answered, a transfer connected, or a recording started.
- OpenAI Realtime handles live audio only for explicitly published realtime agent versions.
  Recorded-turn behavior remains available; its transcription and Anthropic replies are separate
  provider dependencies. There is no silent provider/model replacement on failure.
- Bookings, Customers, Staff and Messaging remain the canonical business records. Never repair
  a suspected duplicate booking by creating another one before checking Bookings and the call's
  tool/confirmation evidence.
- This repository uses MySQL/Prisma, not the proposed PostgreSQL example from the client document.

## Configuration and deployment checklist

Keep credentials in server-side secret storage; local development uses git-ignored `backend/.env`.
Do not copy secrets to browser bundles, screenshots, tickets, logs or this document. Rotate via
the provider and the deployment secret store when needed; changing a frontend variable is not
reauthorization.

| Capability | Server configuration | What does not prove readiness |
| --- | --- | --- |
| Twilio call control | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, connected business number | A key or a ringing phone alone does not prove AI, recording or transfer |
| Browser softphone | Above plus `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID` | Token issuance does not prove microphone permission or two-way carrier audio |
| Live AI audio | `OPENAI_API_KEY`, public HTTPS `BACKEND_URL`, compatible `OPENAI_REALTIME_MODEL` (implemented model: `gpt-realtime`) | A text sandbox and key presence do not verify live audio, funded access or interruptions |
| Recorded-turn AI | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and the existing reply model | Speech and reply providers can fail independently |
| Meeting video | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | A join token does not prove a connected participant or successful recording |
| Meeting email | `EMAIL_PROVIDER_KEY`, `EMAIL_FROM_ADDRESS`, `FRONTEND_URL` | Configured sender is not an actual accepted/delivered invitation |
| Recording storage | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, region/endpoint as appropriate | Development local-disk fallback is not production object-storage readiness |

Before exposing a deployment:

1. Set `BACKEND_URL` to the externally reachable HTTPS API base including `/api/v1`. Configure
   TLS, proxy timeouts, WSS upgrades and access controls. Localhost is not reachable by Twilio.
2. Allow the exact signed WebSocket media path `/api/v1/voice/webhook/media-stream`. Do not
   expose a general HTTP proxy. The included development proxy restricts routes; it is not an
   authorization bypass or a production load balancer.
3. Twilio inbound and terminal callbacks use `/api/v1/voice/webhook/incoming` and
   `/api/v1/voice/webhook/status`. Generated Gather/recording/transfer/conference URLs must point
   to this same public deployment. Preserve request bytes/parameters and signature headers.
4. Realtime recording completion uses `/api/v1/voice/webhook/realtime-recording`; live audio
   failure returns through `/api/v1/voice/webhook/realtime-ended`. Booking read-back uses the
   signed `/api/v1/voice/webhook/booking-confirm?requestId=...` callback.
5. If LiveKit is configured, register `/api/v1/voice/webhook/livekit` using signed webhooks.
   Keep the `Authorization` header and exact `application/webhook+json` body. Unsigned or
   modified events must fail, not be accepted by disabling signature verification.
6. Verify Redis and the workers separately from the HTTP server. Recording imports, retention,
   reconciliation, scheduled campaigns and operational monitoring need workers to remain alive.
7. Verify database migrations on the actual deployment, backups and restoration, private media
   access, object-storage encryption/lifecycle/retention and secret rotation. Do not treat a clean
   developer database as evidence about another server.
8. Establish approved launch countries, allowed use cases, reviewed consent/disclosure/retention
   policies and a real funded QA plan. Code cannot supply legal or carrier approval.

## Safe agent rollout and rollback

1. Create or edit the agent in Agents. Review its mode, allowed tools, selected source corpus,
   locale/hours/holidays, concurrency, maximum duration and budgets.
2. Save a new immutable draft. Selected knowledge is copied into that draft with provenance;
   a later FAQ edit does not silently modify a tested version. Disable a source to revoke it.
   Realtime checks revocation before new responses/tools; already-played audio cannot be undone.
3. Run the text sandbox or scripted suite only with approval to use provider credit. The suite
   makes one request per scenario, pins all scenarios to the same immutable version, and stops
   after the first provider/budget failure. Optional per-scenario “must include” and “must not
   include” checks are case-insensitive literal phrase matches. An optional expected outcome compares
   the selected label with the model's structured self-report; it is not an independent semantic
   evaluation. None of these checks is safety or adversarial proof. A response with no checks is
   explicitly shown as not evaluated. The suite executes no tools and neither mode substitutes for
   a real test call. Preserve provider errors.
4. Obtain explicit owner approval and publish the tested version. Start with a 1–5% pilot when
   practical. Deterministic allocation is not a guarantee that exactly that percentage appears
   in a small number of calls.
5. Verify a real consented conversation, interruption, tool confirmation, recording and human
   handoff before increasing traffic. Existing in-progress calls retain their pinned version.
6. On regression, pause the agent/campaign or use the existing rollback action with a reason.
   Do not overwrite the old version or claim that a running call switched versions mid-flight.
   Review active calls separately; never repeatedly originate calls as a recovery technique.

## Incident triage

### “AI unavailable”, low credit or model access error

- Read the saved call/sandbox error, then Settings provider health. Key presence is not a credit
  balance check. Use the provider's authorized billing/access console for confirmation.
- Check speech transcription, Anthropic replies and OpenAI Realtime separately. Do not tell a
  caller their booking succeeded merely because a model generated that sentence.
- A failed recorded-turn conversation saves a follow-up and ends safely. AI outbound campaigns
  pause after a provider failure; review the cause before resuming. Avoid repeated paid probes.

### Call stuck live, missing terminal callback or uncertain transfer

- Inspect the canonical call, participant legs, assignments, transfer evidence and audit. Pending
  is not connected; external-number transfers are not an internally coachable conference.
- Signed Twilio call, transfer and human-agent leg status, conference-usage and completed
  realtime-recording events are durably retried by the voice worker;
  after five consecutive projection failures they appear in Supervisor Center → Provider callback
  recovery. Inspect the saved error and call before replaying. Replay is audited and only applies to
  these event types. Staff-leg `dial-status` also saves its pending follow-on action with the
  sequence update, so replay can finish an interrupted next-agent or call-close step. Other
  callback types remain outside this inbox until their side effects support replay.
- A staff-leg originate marked requested or uncertain retains its reservation even after the offer
  timer. Replaying the callback cannot originate that reservation again. A later signed leg callback
  can bind its provider SID and let the pending callback continue. If no provider evidence arrives,
  inspect the Twilio call/conference and retain the uncertainty; do not clear the dispatch state to
  force another call. A failed call-close command remains pending until it succeeds or the parent
  call's terminal status is observed.
- Automatic reconciliation reads Twilio for stale calls older than two minutes, at most 50 per
  tick with concurrency five and a five-minute cooldown. It does not originate or redirect calls.
- If provider lookup fails, retain the uncertainty and operator follow-up. Do not force a terminal
  state from a browser timer, and do not release/assign another agent based on a guessed outcome.

### Booking or customer-data dispute

- Check Bookings before any retry. Recorded-turn requests require a signed provider keypad
  confirmation; realtime writes require the server tool confirmation. Expired, missing and declined
  confirmations cannot create a booking. A review-needed result is not proof the write failed.
- A phone booking with status `requested` is **not confirmed**. The owner can require staff
  approval under Settings → AI & Governance. Required deposits or missing service-specific staff
  assignment also leave requests pending; AI does not collect or record fictitious cash. Use the
  existing Bookings review/deposit workflow rather than bypassing it from the phone workspace.
- Both phone creation and verified phone rescheduling check configured hours, actual slot length,
  booking windows, daily cap and symmetric service buffers. Unconfigured hours are unavailable,
  not guessed. A `BOOKING_CHANGED` result means another operation changed the appointment:
  re-check the real record and confirm the new details with the caller before retrying.
- Private recorded-turn order/balance replies require enabled sharing, a matching caller and the
  private reference for their upcoming/recent non-canceled booking. The reference is masked from
  text history/model conversation. Caller ID by itself does not authorize private account data.
- Do not send a draft from the AI follow-up panel without the normal messaging review/consent
  workflow. A support ticket is not a review rating, an outbound message or a resolved complaint.

### Recording missing, import failed or media deletion requested

- Check the published policy version, caller's recorded choice and provider recording receipt.
  Without consent, no audio should be fabricated or fetched just to make the player look ready.
- Realtime imports are durable `import-realtime-recording` jobs on `voice-recording-retention`,
  with five exponential-backoff attempts. Failed jobs are retained for review. Confirm provider
  ownership, storage availability and policy expiry before an authorized retry.
- The imported media pointer is recorded only after private upload succeeds. Provider-copy
  removal does not substitute for a durable local/object-storage copy. Legal hold must be honored.
- Use the existing call workspace's authorized deletion flow and its audit, never an arbitrary
  bucket purge. Deletion includes the transcript; late provider events must not restore erased data.
- Retention runs daily; do not interpret a still-playing signed URL as proof a purge or provider
  deletion succeeded. Production storage lifecycle and encryption must be independently verified.

### Meeting transcript, summary or follow-up draft

- A meeting uses its pinned, published recording policy. AI processing is a separate opt-in in
  that version; the complete AI-processing notice is frozen into the recording consent snapshot.
  Every recorded participant must still show granted consent when the host requests processing.
- Only the assigned host can request transcription/summary. The app reads a bounded recording from
  private storage, checks the business AI feature toggle and shared AI guardrails, sends media to configured
  OpenAI transcription, redacts phone/email/card-like values, then sends the redacted transcript
  through the configured AI summary service. Missing provider, exhausted budget or declined consent
  is an explicit failure, not an empty successful transcript.
- Transcript and summary remain in the expiring recording record. AI output is not calibrated for
  confidence; a human must review it. A follow-up is only an unsent canonical inbox draft linked to
  a customer. It is never delivered automatically. Retention removes the private file, transcript,
  summary and unsent draft together; usage for transcription bytes is recorded as unpriced because
  no provider invoice amount is available from this endpoint. The AI cost cap therefore does not
  guarantee a maximum Whisper charge.

### Cost warning or possible runaway use

- Settings separates provider facts, estimated token costs, pending usage and unpriced units.
  Provider-billed test calls still cost money even when excluded from business-call analytics.
- Owners receive in-app warnings at 70% and 90% of a configured monthly phone USD cap. New
  admissions/AI turns check caps; pending/unpriced/non-USD costs may add exposure. A cap is not
  the provider's live credit balance, nor an assertion that concurrent in-flight work costs zero.
- Pause new work, inspect actual run/call evidence and provider receipts, then adjust limits only
  with owner authorization. Do not invoice an estimate as a confirmed provider charge.
- The 75% margin equation is a planning calculation, not a guaranteed result or configured selling
  tariff. Complete billing integration and cost reconciliation remain explicitly unfinished.

## Voice usage selling rates and Billing review

This is Noxtill platform usage, separate from the merchant's customer orders. The current
handoff is a reviewed local Billing record; it does not create, send or pay a provider invoice.

- The platform operator supplies `VOICE_BILLING_RATE_CARD_JSON` in server configuration. There is
  no default commercial tariff. Required fields: `sourceVersion` (stable revision, 1–80 safe
  characters), `sourceReference` (8–500 characters identifying the rate sheet), `currency`
  (three uppercase letters), `currencyMinorUnits` (integer 0–3), `effectiveFrom` (UTC ISO timestamp),
  and `rates` (provider/unit pairs with decimal-string `price` and positive decimal-string
  `perQuantity`). Rate keys must be in `VOICE_BILLABLE_UNITS`; duplicate keys, bookkeeping events,
  raw upload-byte samples and sandbox/preview units are rejected. This configuration is pricing,
  not a place to put provider credentials.
- Billing & Subscription → Voice usage billing review captures this server revision as an
  immutable per-business version. Reusing the same source revision with changed values is refused.
  Only an active owner can approve it, with a review reason. Approval and effective timestamps
  bound its usage window; a later approved rate version closes the older window. No prior usage
  is retroactively priced before approval.
- Choose an approved version and UTC month to prepare up to 1,000 unclaimed measured rows.
  Test calls, pending records, diagnostic/sample units and units without a tariff are excluded.
  The draft shows quantity × price ÷ pricing quantity for every source row. Decimal calculations
  retain precision until the final currency rounding. Provider costs keep their original currency
  and evidence state; there is no inferred exchange rate or achieved-margin figure.
- Review the evidence before approving. A business row lock plus a unique per-usage claim ensures
  concurrent drafts cannot approve the same usage twice. If a source quantity, provider cost,
  measurement time or evidence changes first, cancel and prepare a new draft. Approved snapshots
  remain fixed; they need an explicit future billing adjustment rather than silent edits. Approval
  never calls a payment gateway.
- Further unclaimed records can be prepared in another batch. The page shows the latest 50 drafts
  for a selected month and the latest 30 captured rate versions. Every decision has an audit record.
  Legacy `voice_text_tokens` is not billable yet because its current source records combine live
  replies and sandbox requests without a call-bound distinction. Provider invoice preparation,
  billing adjustments and complete invoice-cost reconciliation remain unfinished.

## Monitoring and acceptance evidence

- Supervisor reports actual saved audio latency samples, interruptions, failure counts and API
  latency. “Not tracked” is correct when there is no audio sample. Instance uptime is not historic
  availability and does not establish carrier uptime.
- Three failed non-test realtime sessions in ten minutes trigger an owner in-app alert, deduped
  to once per hour. External paging/on-call escalation and deployment probes must be configured
  separately; do not assume an email or phone alert was sent.
- Separate successful backend tests, local simulated sockets, targeted browser QA, real provider
  QA, load/security/accessibility tests and signed release acceptance. None substitutes for another.
- Retain version IDs, call IDs, policy decision, test environment, provider receipt IDs, measured
  outcomes and operator approvals in the acceptance record. Never include raw API keys or
  private customer references in that record.

## Currently unsupported acceptance items

The completion checklist remains authoritative. In particular, full per-unit invoice/billing
integration, all detailed wizard controls, durable event-projector/replay coverage across legacy
webhooks, advanced video recording/waiting-room/screen-sharing controls, external operational
acceptance and the complete automated end-to-end/load/red-team/WCAG audit are not certified by
this runbook. Keep the goal open until implementation and appropriate evidence exist.
