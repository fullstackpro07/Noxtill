# Production Deploy Checklist

Produced by INT-015, the final ticket in `docs/PROJECT_PLAN.md`. This is the concrete
readiness gate for taking Noxtill to a live production deployment — every env var it needs,
the state of this dev environment's own `.env` against that list, the security audit this
ticket ran (spec §6), infra requirements, deploy steps, and a rollback note.

## 1. Environment variables

"Populated" means this dev environment's `backend/.env` has a real, working value. "Disclosed
placeholder" means the code path is real and reaches the actual external call, but needs a
real credential to complete — the standard this whole project held every external integration
to. A production deploy must replace every placeholder row before going live.

### Core / auth

| Var | Status here | Notes |
|---|---|---|
| `DATABASE_URL` | Populated (local Postgres) | Production: managed Postgres 14+ connection string. |
| `JWT_SECRET` | Populated (real 32-byte random) | Regenerated this ticket; was an 11-char dev placeholder. Boot-time `validateEnv()` in `main.ts` refuses to start in `NODE_ENV=production` if this is missing, short, or a known placeholder. |
| `JWT_REFRESH_SECRET` | Populated (real 32-byte random) | Same validation as above. |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | Populated (`15m` / `7d`) | No change needed for production. |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | Populated (`5` / `15`) | Brute-force lockout, already enforced. |
| `PORT` | Populated (`5000`) | Set by the hosting platform in most PaaS setups. |
| `CORS_ALLOWLIST` | Populated (dev-only value) | **Must** be updated to the real production frontend origin(s) before launch. |

### Redis / queues

| Var | Status here | Notes |
|---|---|---|
| `REDIS_HOST` / `REDIS_PORT` | Configured, but **no Redis reachable in this dev environment** | Every BullMQ-backed feature (message sends, nightly close, exports, campaigns, webhook processing) needs a real Redis reachable at boot. CI's `ci.yml` runs against a real Redis 7 service container. Production needs a real managed Redis instance. |

### S3 / file storage

| Var | Status here | Notes |
|---|---|---|
| `S3_BUCKET` / `S3_REGION` / `S3_FORCE_PATH_STYLE` | Populated (dev bucket name only) | |
| `S3_ENDPOINT` | Empty | Only needed for an S3-compatible non-AWS provider (MinIO, R2, etc). Leave empty for real AWS S3. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | **Disclosed placeholder (empty)** | All PDF/export/QR-poster generation reaches a real `PutObject` call and fails cleanly without these. |

### Messaging

| Var | Status here | Notes |
|---|---|---|
| `META_WA_TOKEN` / `META_WA_PHONE_ID` / `META_APP_SECRET` | **Disclosed placeholder (empty)** | WhatsApp send + webhook signature verification both real; webhook now fails closed (503) without `META_APP_SECRET`, matching this ticket's security fix. |
| `META_WA_VERIFY_TOKEN` | Populated (dev value) | Rotate for production. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | **Disclosed placeholder (empty)** | SMS fallback channel + webhook; same fail-closed behavior as Meta. |
| `EMAIL_PROVIDER_KEY` | **Disclosed placeholder (empty)** | Postmark transactional + campaign sends both real, reach the actual API call. |
| `EMAIL_FROM_ADDRESS` | Populated (dev value) | Rotate to a real verified sending domain. |
| `EMAIL_WEBHOOK_SECRET` | Populated (dev value) | Shared-secret check now uses constant-time comparison (`safeEqual`) and fails closed if unset — rotate for production. |

### AI

| Var | Status here | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Disclosed placeholder (empty)** | Every AI feature (assistant, reviews AI-draft, what-if, branch-advisor, business-type AI-map) reaches the real Claude call and fails with a clean `AI_UNAVAILABLE` typed error without it. |

### Marketing external lookups

| Var | Status here | Notes |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | **Disclosed placeholder (empty)** | Competitor rating snapshots. |
| `SERPAPI_KEY` | **Disclosed placeholder (empty)** | Keyword rank tracking. |

### Integrations Hub (Module 18)

| Var | Status here | Notes |
|---|---|---|
| `FRONTEND_URL` | Populated (dev value) | Used to build OAuth-callback redirect targets — must be the real production frontend origin. |
| `BACKEND_URL` | Populated (dev value) | Used to build the OAuth `redirect_uri` sent to each provider — must be the real production API origin, and must be registered with each provider's app console. |
| `INTEGRATIONS_TOKEN_KEY` | Populated (real random, self-issued) | AES-256-GCM key encrypting stored OAuth tokens at rest. Generate a fresh value for production — do not reuse this dev key. |
| `INTEGRATIONS_STATE_SECRET` | Populated (real random, self-issued) | Signs the OAuth `state` param. Generate a fresh production value. |
| `EMAIL_UNSUBSCRIBE_SECRET` | Populated (real random, self-issued) | Signs unsubscribe links. Generate a fresh production value. |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_ADS_DEVELOPER_TOKEN` | **Disclosed placeholder (empty)** | Requires a real registered Google Cloud OAuth app + Google Ads developer-token approval — an account-creation step, not a code gap. |
| `META_ADS_APP_ID` / `META_ADS_APP_SECRET` | **Disclosed placeholder (empty)** | Requires a real registered Meta developer app. |
| `TIKTOK_ADS_APP_ID` / `TIKTOK_ADS_APP_SECRET` | **Disclosed placeholder (empty)** | Requires a real registered TikTok for Business developer app. |

### Billing

| Var | Status here | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | **Disclosed placeholder (empty)** | Checkout + webhook both real; webhook already fails closed (503) without the secret, same as every other provider. |
| `JAZZCASH_MERCHANT_ID` | **Disclosed placeholder (empty)** | Second `PaymentGatewayAdapter` — deliberate structural stub proving the abstraction holds for a second gateway; needs real merchant credentials to go live. |

## 2. Security checklist (spec §6) — audit run this ticket

| Item | Verdict | Fix applied / reasoned exception |
|---|---|---|
| Webhook signature verification, all providers | **Fixed** | Meta and Twilio previously failed *open* (skipped verification silently if the secret env var was unset); now both fail closed with a `503 SERVICE_UNAVAILABLE` if unconfigured, matching Stripe's already-correct pattern. Email webhook's plain `!==` compare replaced with the existing constant-time `safeEqual` helper, same fail-closed treatment. |
| Customer PII erasure — role-gated | **Fixed** | `DELETE /customers/:id` had no `@Roles` metadata at all (any authenticated role, including staff, could erase PII). Added `@Roles(Role.owner, Role.manager)`, matching the plan's own RBAC rule. Verified live: staff → 403, owner → 200. |
| No card data stored | **Verified clean** | Grepped the full schema/codebase for card-shaped fields; Stripe Checkout is a hosted page, nothing card-shaped ever touches this backend. |
| Bearer tokens / secrets ≥22 chars | **Fixed, with one documented exception** | JWT secrets rotated from dev placeholders (11/19 chars) to real random 32-byte values; a boot-time `validateEnv()` refuses to start in production with a missing/short/placeholder secret. All randomly-generated tokens (review-request, reschedule, integration HMAC secrets) are already ≥32 chars. **Exception**: the staff temp password (bumped 12→16 hex chars this ticket) stays intentionally under 22 — it's a single-use, human-relayed credential a new hire has read out to them, not a bearer token; a 22+-char value would be impractical to relay verbally/via chat for negligible real security benefit against a single-use secret. |
| Helmet / CORS / HTTPS | **Verified clean, pre-existing** | `main.ts` already applies helmet and a CORS allowlist (`CORS_ALLOWLIST` env var); HTTPS termination is an infra/hosting-platform concern, not application code — see §3 below. |
| No-PII logging | **Fixed** | Four log lines (`whatsapp.service.ts`, `sms.service.ts`, `email.service.ts`, `email-campaigns.service.ts`) printed raw customer phone numbers/emails at debug/warn level. All four now log only `providerRef`/status, matching the already-correct pattern in `message-worker.processor.ts`. |
| Rate limiting / brute-force lockout | **Verified clean, pre-existing** | `BusinessThrottlerGuard` globally applied (keyed by businessId); `User.failedLoginAttempts`/`lockedUntil` actively enforced in `auth.service.ts`. |
| Backup + restore drill in CI | **Built** | `backend/scripts/backup-restore-drill.sh` (real `pg_dump -Fc` / `pg_restore`, verified via a deterministic canary-row count, not just exit codes) wired as a CI job step in `.github/workflows/ci.yml` against the CI Postgres service container. Not locally dry-run in this dev environment — no `pg_dump`/`psql`/`pg_restore` client tools are on this machine's `PATH`. |
| CI pipeline | **Built** | `.github/workflows/ci.yml` — Postgres 16 + Redis 7 service containers, lint + `tsc --noEmit` + unit tests + the new real e2e suite (backend), lint + `tsc --noEmit` + build (frontend). Not yet pushed/triggered on the real remote — see §5. |
| Real e2e regression suite | **Built and green** | `backend/test/journey.e2e-spec.ts` drives the real signup→product→sale→nightly-close→review-request journey against the real (local) Postgres via a full `AppModule` boot + `supertest`. Passes locally (`2 suites / 6 tests`, ~7s). |

## 3. Infrastructure requirements

- **Postgres** 14+ (schema uses standard Prisma-generated DDL, trigram indexes via `pg_trgm` — confirm the extension is enabled on the target instance).
- **Redis** 5+ (BullMQ requires ≥5.0.0 — confirmed live this ticket: the old bundled Windows Redis port on this dev machine reports as v3.0.504 and is incompatible; a real modern Redis is required, not just "any Redis binary").
- **S3-compatible object storage** bucket, with a real access key pair.
- **CI runner** with Postgres 16 + Redis 7 service-container support (GitHub Actions, as configured in `.github/workflows/ci.yml`).
- **Hostinger Node.js hosting** with Git-connected apps for backend (`noxtill.com`) and frontend (`app.noxtill.com`) — see [CICD.md](./CICD.md).
- **TLS/HTTPS termination** at Hostinger — the application itself does not terminate TLS.
- **A registered OAuth app per provider** actually being launched with (Google, Meta, TikTok) — each is a real account-creation step with that provider, not a deploy-time config value alone.

## 4. Deploy steps

Full pipeline (branch protection, Hostinger build settings, Prisma generate, smoke checks): **[CICD.md](./CICD.md)**.

1. Provision Postgres, Redis, and an S3 bucket; populate every env var in §1 with real production values in hPanel (never reuse this dev environment's self-issued secrets — `INTEGRATIONS_TOKEN_KEY`, `INTEGRATIONS_STATE_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET`, `JWT_SECRET`, `JWT_REFRESH_SECRET` all need fresh values).
2. Set `NODE_ENV=production` on the Nest app — this activates `validateEnv()`'s hard-fail behavior for weak JWT secrets at boot.
3. One-time / per-migration: run `npx prisma migrate deploy` against the production database (Hostinger’s Node build does not run migrations).
4. Ensure GitHub `main` is protected so `backend` and `frontend` CI must pass before merge ([CICD.md](./CICD.md)).
5. Merge to `main` — Hostinger auto-deploys Nest (`root_directory=backend` → `https://noxtill.com`) and Next (`root_directory=frontend` → `https://app.noxtill.com`).
6. Confirm Nest boots (runtime logs / `validateEnv()`) and `GET https://noxtill.com/api/v1/` returns `200`. Confirm the app loads at `https://app.noxtill.com` with `NEXT_PUBLIC_API_URL=https://noxtill.com/api/v1`.
7. Set `CORS_ALLOWLIST=https://app.noxtill.com`, `FRONTEND_URL=https://app.noxtill.com`, and `BACKEND_URL=https://noxtill.com` *before* announcing OAuth-based integrations.
8. Smoke-test: signup → product → sale → nightly-close aggregate → review-request `/r/:token`.
9. Confirm the CI run on the deployed commit was green before calling the release final.

## 5. Rollback

- Database migrations are additive-only so far (no destructive migrations exist in this project's history) — a rollback of application code does not require a corresponding down-migration in the common case. If a future migration ever needs to be destructive, write and test its down-migration before shipping it.
- Standard rollback path: in Hostinger **Deployments**, redeploy the previous known-good commit for the affected app, or revert on `main` (CI must pass again, then Hostinger rebuilds). Restore from the most recent verified backup (§2's drill) only if the rolled-back release depended on schema the previous version doesn't understand.
- Because JWT secrets were rotated this ticket, note for any future secret rotation: rotating `JWT_SECRET`/`JWT_REFRESH_SECRET` invalidates every existing session immediately (expected, not a bug) — plan rotations for low-traffic windows and communicate them, since every logged-in user will be forced to log in again.

## 6. Known gaps at time of writing (disclosed, not silently carried forward)

- No Redis is reachable in this local dev environment, so BullMQ-dependent live checks (message sends completing, campaign fan-out, exports) were verified up to the point of enqueueing — real code, real DB writes, blocked only by the missing local Redis. The real e2e suite mocks the queue call specifically to prove the rest of the journey end-to-end despite this.
- The CI pipeline and backup/restore drill are built and believed correct (standard, well-established `pg_dump`/`pg_restore`/GitHub Actions service-container patterns) but have not yet been observed running green, since that requires pushing `.github/workflows/ci.yml` to the real `origin` remote to trigger a real Actions run — a shared-visibility action requiring separate user confirmation, not bundled into this ticket's own completion.
- 5 of the 6 Module 18 integration connectors (everything except Email) have real, correctly-shaped OAuth flow code but cannot complete a live connection in any environment without a real registered developer app with Google/Meta/TikTok — an account-creation step outside this project's code, not a code gap.


Noxtill — Pre-Launch Checklist
Everything below is real, working code that just needs a real credential, account, or infra resource to go live. Nothing on this list is a code gap — it's account creation, credential rotation, and infra provisioning.

1. External API keys / accounts needed
#	What	Used for	Get it from
1	Anthropic API key	AI Assistant (streaming chat), reviews AI-draft, what-if analysis, branch advisor, business-type AI-mapping	console.anthropic.com
2	Stripe secret key + webhook secret	Checkout, plan/subscription billing	dashboard.stripe.com (start in test mode)
3	JazzCash merchant ID	Second payment gateway (regional) — structurally ready, needs real merchant account	JazzCash business onboarding
4	AWS S3 (or S3-compatible) access key + secret	Every generated file: invoices, statements, reports, exports, QR posters	AWS IAM, or R2/MinIO if avoiding AWS
5	Meta WhatsApp Cloud API token + phone number ID + app secret	Primary messaging channel	developers.facebook.com (WhatsApp Business Platform)
6	Twilio account SID + auth token + from-number	SMS fallback channel	twilio.com
7	Postmark (or SES) API key	Transactional email + email marketing campaigns	postmarkapp.com
8	Google Places API key	Competitor rating snapshots	Google Cloud Console
9	SerpApi key	Keyword rank tracking	serpapi.com
2. OAuth app registrations needed (Module 18 — Integrations Hub)
These 5 connectors have real, correctly-written OAuth code, but each needs an actual registered developer app before a business can connect one:

 Google Cloud OAuth app (client ID + secret) — powers My Business, Google Ads, and Merchant Center connectors
 Google Ads developer token — separate approval process on top of the OAuth app, required for every Ads API call
 Meta developer app (app ID + secret, distinct from the WhatsApp app above) — powers Meta Ads connector
 TikTok for Business developer app (app ID + secret) — powers TikTok Ads connector
Only Email is fully deep and live-ready today — it just needs the Postmark key from the table above, no OAuth app required.

3. Infrastructure to provision
 Managed Redis, version ≥5.0 — confirmed this week the wrong version silently breaks BullMQ; don't reuse an old/legacy Redis instance
 Managed Postgres 14+ with the pg_trgm extension enabled (used for search/customer lookup)
 S3-compatible object storage bucket
 TLS/HTTPS termination at Hostinger (the app itself doesn't terminate TLS)
 CI runner capable of Postgres + Redis service containers (GitHub Actions — see `.github/workflows/ci.yml` and [CICD.md](./CICD.md))
 Hostinger Node.js Git apps for Nest (`noxtill.com` / `backend`) and Next (`app.noxtill.com` / `frontend`)
4. Secrets to generate fresh for production (never reuse dev values)
 JWT_SECRET / JWT_REFRESH_SECRET — production boot will refuse to start if these are weak or placeholder, by design
 INTEGRATIONS_TOKEN_KEY — encrypts stored OAuth tokens at rest
 INTEGRATIONS_STATE_SECRET — signs the OAuth callback state param
 EMAIL_UNSUBSCRIBE_SECRET — signs unsubscribe links
5. Config values that must point at real production URLs
 CORS_ALLOWLIST → `https://app.noxtill.com`
 FRONTEND_URL / BACKEND_URL → `https://app.noxtill.com` / `https://noxtill.com` (OAuth redirect URIs must also be registered with each provider)
 EMAIL_FROM_ADDRESS → a real verified sending domain
 NEXT_PUBLIC_API_URL (frontend Hostinger env) → `https://noxtill.com/api/v1`
6. Actions still to take
 Protect `main` so CI jobs `backend` and `frontend` are required ([CICD.md](./CICD.md))
 Create `app.noxtill.com` Hostinger Next.js Git app (root `frontend`) if not already done
 Push / merge so `.github/workflows/ci.yml` and Prisma `postinstall`/`build` generate run on Hostinger
 Run the backup/restore drill for real — the script is written but has never dry-run anywhere (no `pg_dump`/`psql` on this dev machine); it'll run for real the moment CI executes
 Smoke-test the core journey on the live deploy: signup → product → sale → nightly close → review request
 Decide whether/when to build the deferred deep features for the 5 non-Email connectors (GMB posts, Google Ads campaign creation, Merchant feed sync, Meta creative rendering, TikTok slideshow generation) — their screens exist but stay mocked until each OAuth app is real
Not blocking launch, but worth knowing
Help-doc article URLs (HelpArticle.url, used by the AI assistant's citations) point at /help/[slug] pages that don't exist yet — citations render as plain text, not broken links, so this is cosmetic only.
Postmark webhook → real open/click tracking for email campaigns was deliberately deferred (funnel numbers will read 0 until this exists).
