# Authentication — providers, passkeys, deployment

Implements `authentication.pdf` (Auth & Social Login spec v1.0) except LinkedIn and ChatGPT, which
are out of scope by owner decision.

## How it fits together

| Method | Code | Notes |
|---|---|---|
| Email + password | `backend/src/auth/auth.service.ts` `login()` | Unchanged; now finishes through `completeLogin()` |
| Google | `backend/src/auth/oauth/` (`oidc.ts`, `social-auth.service.ts`) | OIDC + PKCE + nonce; ID token verified against Google JWKS |
| Microsoft | same | `common` authority (personal + work/school); issuer checked against the token's `tid` |
| Facebook | `backend/src/auth/oauth/facebook-login.ts` | `public_profile,email` only; token checked with `debug_token`; email never treated as verified |
| Passkeys | `backend/src/auth/passkeys/` | `@simplewebauthn/server@14.0.3`; discoverable credentials, user verification required |

Every method ends in `AuthService.completeLogin()`, the same gate password login uses: lockout,
Super Admin suspension, business/staff deactivation, security events, and **WhatsApp 2FA** (a
passkey does not replace the 2FA code — owner decision).

- **Identities** live in `auth_identities`, keyed by `(provider, provider_subject)`. A matching email
  never links anything: a provider sign-in whose email already belongs to an account is refused with
  a generic message, and the user links the provider from **Settings → Security** after signing in.
- **No tokens in URLs.** The provider callback redirects to `/auth/callback?code=<one-time handoff>`
  (2-minute, single use); the frontend exchanges it at `POST /auth/oauth/exchange`.
- **Missing email** (Facebook/Microsoft accounts without one): the user is asked for an email on
  `/auth/callback`, the account is created unverified, and Noxtill's 6-digit email code confirms it.
- **Fresh authentication** for linking, unlinking and passkey changes: the session must be under
  15 minutes old, or the current password is supplied.
- **Last method guard:** a provider or passkey can't be removed if it is the only way back in
  (a verified email always counts, because password reset works).

## Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/auth/providers` | public — `{google, microsoft, facebook, passkeys}` |
| GET | `/auth/:provider/start` (and legacy `/auth/google`) | public — `{url}` |
| GET | `/auth/:provider/callback` | public — registered redirect URI |
| POST | `/auth/oauth/exchange` `{code}` | public |
| POST | `/auth/oauth/complete` `{ticket, email}` | public |
| GET | `/auth/identities` | user |
| POST | `/auth/identities/:provider/link` `{password?}` | user |
| DELETE | `/auth/identities/:provider` `{password?}` | user |
| POST | `/auth/passkeys/register/options` `{password?}` / `register/verify` | user |
| POST | `/auth/passkeys/authenticate/options` / `authenticate/verify` | public |
| GET / PATCH / DELETE | `/auth/passkeys`, `/auth/passkeys/:id` | user |

All start, callback, exchange and passkey routes are rate-limited (`@Throttle`).

## Environment (server-side only — never `NEXT_PUBLIC_`)

```
# Feature flags — a method is shown only when its flag is on AND its credentials are set.
AUTH_GOOGLE_ENABLED=true          # default true (keeps existing Google sign-in working)
AUTH_MICROSOFT_ENABLED=false      # default false
AUTH_FACEBOOK_ENABLED=false       # default false
AUTH_PASSKEYS_ENABLED=false       # default false

# Google (existing names; GOOGLE_CLIENT_ID/SECRET are also accepted)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Microsoft (Entra app registration: "Accounts in any organizational directory and personal Microsoft accounts")
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT=common

# Facebook — same Meta app as the Social inbox connector by default
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_LOGIN_APP_ID=            # optional: a separate login-only app
FACEBOOK_LOGIN_APP_SECRET=
FACEBOOK_API_VERSION=v19.0

# Passkeys — default to FRONTEND_URL's hostname/origin when unset
WEBAUTHN_RP_ID=noxtill.com
WEBAUTHN_RP_NAME=Noxtill
WEBAUTHN_ORIGIN=https://noxtill.com   # comma-separate if several origins share the RP ID

BACKEND_URL=https://<api host>/api/v1
FRONTEND_URL=https://noxtill.com
```

## Provider console setup

Redirect URIs (exact match) — `${BACKEND_URL}/auth/{provider}/callback`:

- **Google Cloud console** → OAuth client → Authorized redirect URI `…/auth/google/callback`
  (unchanged from before).
- **Microsoft Entra** → App registrations → New → supported account types *any organizational
  directory + personal Microsoft accounts* → Web redirect URI `…/auth/microsoft/callback` →
  Certificates & secrets → new client secret. API permissions: `openid`, `profile`, `email`.
- **Meta for Developers** → the app → add *Facebook Login* → Valid OAuth Redirect URIs
  `…/auth/facebook/callback`; permissions `public_profile` and `email` (app review for `email` if the
  app is in Live mode for the public).
- **Passkeys**: `WEBAUTHN_RP_ID` must be the registrable domain the frontend is served from (or a
  parent of it). Changing it later invalidates every registered passkey.

## Database

Migration `backend/prisma/migrations/20261114100000_auth_identities_passkeys` creates
`auth_identities`, `oauth_transactions`, `passkey_credentials`, `webauthn_challenges` and backfills
existing Google links from `users.google_id`. Apply on this MySQL setup with:

```
npx prisma db execute --file prisma/migrations/20261114100000_auth_identities_passkeys/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20261114100000_auth_identities_passkeys
```

**Rollback:** drop those four tables and redeploy the previous build. `users.google_id` is kept and
never modified, so the previous Google sign-in keeps working.

## Rollout

Turn on one method at a time after a real-account test on the deployed host:
Microsoft (personal **and** work/school account) → passkeys (Windows Hello, iPhone/Mac, Android) →
Facebook (account with and without a shared email). A method must stay off until that test passes.

## Not built / known limits

- LinkedIn and ChatGPT sign-in (out of scope).
- No workspace picker: a user in several businesses is signed into their oldest active membership,
  the same as password login.
- Apple App Store guideline 4.8 has not been assessed — there is no iOS app in this repo yet.
