# Authentication — methods, security model, deployment

Implements two owner specs:

- **Auth & Social Login v1.0** (`authentication.pdf`, 11 Nov 2026): Google, Microsoft, Facebook,
  passkeys (LinkedIn and ChatGPT out of scope by owner decision).
- **Authentication Security Specification v1.0** (`authentication security.pdf`, 14 Nov 2026), with
  four owner decisions: full HttpOnly-cookie sessions now; TOTP + passkey replace WhatsApp 2FA (owners
  must enrol); email code at password sign-in only on an unrecognised device; follow the spec's
  verified-email auto-link rule.

## Sign-in methods and the single gate

| Method | Code | Notes |
|---|---|---|
| Email + password | `auth/auth.service.ts` `login()` | Argon2id, breach-checked, new-device email code |
| Google / Microsoft | `auth/oauth/oidc.ts`, `social-auth.service.ts` | OIDC + PKCE S256 + nonce; ID token verified against JWKS |
| Facebook | `auth/oauth/facebook-login.ts` | `debug_token` app_id / is_valid / user_id / expires_at |
| Passkeys | `auth/passkeys/` | `@simplewebauthn/server@14.0.3`; Noxtill's own counter rule |

Every method ends in `AuthService.completeLogin()`: lockout → suspension/deactivation → new-device
email code (password only) → second factor (TOTP / passkey / recovery code) → session. An owner (or
anyone who had the retired WhatsApp 2FA) without a second factor gets a session that can only reach
the MFA-setup routes (`/setup-mfa` in the app). A passkey sign-in counts as the second factor.

## Security spec — what is implemented where

| Spec | Implementation |
|---|---|
| §2 identity model | `auth_identities` keyed `(provider, provider_subject)`; Microsoft `tid` stored; email NFKC + lower-cased |
| §3.1 linking | Auto-link only when the provider verified the email AND it matches a verified account (Google, personal Microsoft). Otherwise an emailed code (`link_email`) must be entered before linking. Facebook never auto-links. Signed-in "Connect" in Settings links with `email_verified_by_provider=false`. |
| §3.2 pre-emptive takeover | Unverified accounts reach only the verification routes (global guard). A provider-verified identity arriving for an unverified local account destroys the password (`has_password=false`, `must_reset=true`) and ends its sessions. |
| §3.4 / §5.4 unlinking | At least one non-passkey method must remain; removal is audited, emailed and signs out every session. |
| §4.1 Google | Signature/JWKS, `iss`, `aud`, `exp`, `iat`, `nonce`, `email_verified=true` required; state = 32 random bytes, hashed, single-use; PKCE S256; exact redirect URI. |
| §4.2 Microsoft | `iss` resolved from the token's `tid`; optional `MICROSOFT_ALLOWED_TENANTS`; `preferred_username` never used; personal-account email trusted, work/school email not. |
| §4.3 Facebook | app_id/is_valid/user_id/expires_at; email never trusted; deauthorize (`POST /auth/facebook/deauthorize`) marks the identity inactive; data deletion (`POST /auth/facebook/data-deletion`) deletes the login link and returns a code + status URL (`/privacy/facebook-deletion`). Login stores no Facebook tokens (separate from the Social inbox connector's tokens). |
| §5 passkeys | 64-byte random `user.id`; UV required for owners, preferred otherwise; residentKey preferred; ES256 + RS256; attestation none; challenge single-use, 5 min; counter rule incl. 0/0; regression disables the credential, revokes all sessions, emails and audits. |
| §6 OTP | `crypto.randomInt`; HMAC-SHA256 with a pepper (`AUTH_OTP_PEPPER`); bound to user + email + purpose; 10 min; siblings invalidated; 5 tries then the address is locked 15 min + owner emailed; `timingSafeEqual`. Email only — no SMS/WhatsApp channel. |
| §7 passwords | Argon2id m=19456 t=2 p=1 (`@node-rs/argon2`); 12–128 chars, NFKC, no composition rules; HIBP k-anonymity breach check at signup/reset/change and re-check at sign-in (`must_reset` + reset email); legacy bcrypt upgraded on sign-in. Reset: 32-byte token, 15 min, single use, all sessions revoked, email on request and completion, `Referrer-Policy: no-referrer`, token removed from the URL. |
| §8 sessions | Opaque 32-byte access (15 min) and refresh (≤30 days, rotating) tokens, stored only as SHA-256, in HttpOnly `__Host-` cookies (plain names on http dev), SameSite=Lax. Refresh families with reuse detection (10-second parallel-tab grace). New session id per login. Personal device: 7-day idle / 30-day absolute; "Remember me" off = shared device: 15-min idle / 12-hour absolute. Step-up (10 min) required for data exports, customer export, scheduled export runs, billing checkout/cancel, plan change/cancel, payment-method changes and payroll run actions. New-device email alert. |
| §9 logout/revocation | POST-only logout with CSRF, revokes the refresh family server-side; "sign out everywhere"; device list. Revocation on password change/reset, email change, method removal, refresh reuse, counter regression, account lock, suspension, and **any** loss of membership (the guard checks membership + business on every request, so staff removal, People offboarding, revoked finance access and branch deactivation end access immediately). |
| §10 abuse | DB-backed per-account and per-IP limits for every §10.1 row; 429 + `Retry-After`; lockout emails the owner and never reveals whether the address exists; spike alerts (`auth_spike_detected`); credential-stuffing detection by /24 (`credential_stuffing_suspected`); Turnstile verified server-side when configured. |
| §11 audit | Events recorded in `security_events` (`login_success`, `login_failed`, `otp_requested`, `otp_failed`, `otp_locked`, `password_changed`, `password_reset_requested`, `password_reset_completed`, `identity_linked`, `identity_unlinked`, `passkey_added`, `passkey_counter_regression`, `refresh_reuse_detected`, `session_revoked`, `logout`, `logout_all`, `mfa_enabled`, `mfa_disabled`, `account_locked`, …). A scrubbing logger redacts passwords, codes, tokens, auth codes, verifiers and session ids from every log line. |
| §13 acceptance tests | `backend/src/auth/auth-security.acceptance.spec.ts` (real MySQL + a software WebAuthn authenticator), `auth/security/auth-security.units.spec.ts`, `auth/oauth/oidc.spec.ts`. |

## Configuration (server-side only)

```
# Sessions / secrets
AUTH_COOKIE_SECURE=true            # default: true when BACKEND_URL is https → __Host- cookies
AUTH_CSRF_SECRET=                  # optional; defaults to a JWT_SECRET derivation
AUTH_OTP_PEPPER=                   # pepper for email codes, recovery codes, device ids (set in prod)
AUTH_MFA_SECRET_KEY=               # base64 32 bytes, AES-256-GCM key for TOTP secrets (set in prod)
LOGIN_MAX_ATTEMPTS=10
LOGIN_LOCK_MINUTES=15
AUTH_BREACH_CHECK=true             # false only for offline dev/tests

# Email (auth mail on its own transactional sender / subdomain, spec §6.4)
AUTH_EMAIL_FROM_ADDRESS=Noxtill <no-reply@mail.noxtill.com>

# Bot challenge (spec §10.2) — inactive until both are set
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=    # frontend

# Providers / passkeys
AUTH_GOOGLE_ENABLED=true  AUTH_MICROSOFT_ENABLED=false  AUTH_FACEBOOK_ENABLED=false  AUTH_PASSKEYS_ENABLED=false
GOOGLE_OAUTH_CLIENT_ID= GOOGLE_OAUTH_CLIENT_SECRET=
MICROSOFT_CLIENT_ID= MICROSOFT_CLIENT_SECRET= MICROSOFT_TENANT=common MICROSOFT_ALLOWED_TENANTS=
FACEBOOK_APP_ID= FACEBOOK_APP_SECRET= FACEBOOK_LOGIN_APP_ID= FACEBOOK_LOGIN_APP_SECRET= FACEBOOK_API_VERSION=v19.0
WEBAUTHN_RP_ID=noxtill.com WEBAUTHN_RP_NAME=Noxtill WEBAUTHN_ORIGIN=https://noxtill.com
```

### Cookies must be first-party

The session cookies are HttpOnly and SameSite=Lax, so the browser only sends them when the API is
on the **same site** as the app. Either serve the API from a subdomain of the app's site
(`api.noxtill.com` for `noxtill.com`) or use the existing Next.js proxy: set
`NEXT_PUBLIC_API_URL=/api/v1` and `INTERNAL_BACKEND_URL=https://<backend host>` so the browser only
ever talks to the app's own origin. `CORS_ALLOWLIST` must contain the app origin.

### Provider consoles

Redirect URIs (exact match): `${BACKEND_URL}/auth/{google,microsoft,facebook}/callback`.
Meta app: Deauthorize callback `${BACKEND_URL}/auth/facebook/deauthorize`, Data deletion request URL
`${BACKEND_URL}/auth/facebook/data-deletion`.

## Database

Migrations `20261114100000_auth_identities_passkeys` and `20261114200000_auth_security_spec`
(hand-written; apply with `prisma db execute` + `prisma migrate resolve --applied`). The second
migration ends every JWT-era session (everyone signs in again once), marks owners and former
WhatsApp-2FA users `mfa_required`, and resets `two_factor_enabled` (now "has a second factor").

**Rollback:** drop `refresh_tokens`, `known_devices`, `auth_rate_buckets`,
`facebook_deletion_requests` and the added columns, and redeploy the previous build; users sign in
again. No business data is touched.

## Not done / needs the owner or DevOps

- **SPF, DKIM, DMARC** on the transactional and broadcast subdomains (DNS) and a separate sending
  stream at the email provider — the code supports `AUTH_EMAIL_FROM_ADDRESS`; the DNS is outside the repo.
- **Turnstile keys** — without them the bot challenge is off (no widget is shown and the server skips the check).
- **Location** is the country from Cloudflare's `cf-ipcountry` header when present; there is no GeoIP database.
- **Meta app**: Facebook Login shares the Social inbox's Meta app by default. Tokens are separate, but
  a user removing the app in Facebook settings fires one deauthorize callback for both; set
  `FACEBOOK_LOGIN_APP_ID/SECRET` to a login-only app to fully separate consent (spec §4.3).
- **Enterprise SSO (SAML/OIDC)** is a separate build (spec §4.2 note).
- Real-account end-to-end tests for Microsoft and Facebook need their console setup.
