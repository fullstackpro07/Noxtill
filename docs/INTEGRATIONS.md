# Integrations

The Integrations module (`/integrations`, seven tabs) is backed by a catalog of real connectors.
`backend/src/integrations/hub/hub.catalog.ts` is the single source of truth for what the
Directory lists; every entry maps to a connector, a social account, an automation subscription, or
the developer API. Nothing in the directory is aspirational.

## Platform credentials (backend `.env`)

A provider whose OAuth/API credentials are missing shows **Setup required** on its card and its
Connect button is disabled — it never pretends to connect.

| Provider | Required env keys |
|---|---|
| Google Business Profile / Ads / Merchant Center / Analytics / Calendar | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Ads also `GOOGLE_ADS_DEVELOPER_TOKEN`) |
| Meta Ads | `META_ADS_APP_ID`, `META_ADS_APP_SECRET` |
| Outlook Calendar | `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET` |
| Stripe (Connect, read-only) | `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_SECRET_KEY` |
| Square | `SQUARE_CLIENT_ID`, `SQUARE_CLIENT_SECRET` |
| Mailchimp | `MAILCHIMP_CLIENT_ID`, `MAILCHIMP_CLIENT_SECRET` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| Zoom | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` |
| QuickBooks / Xero / Shopify / Yelp / Bing Places / other ad platforms | as before (`QUICKBOOKS_*`, `XERO_*`, `SHOPIFY_*`, …) |
| PayPal, Klaviyo, WooCommerce, WhatsApp (own number) | none — the merchant pastes their own credentials |

`PAYPAL_API_BASE` selects sandbox (`https://api-m.sandbox.paypal.com`); the default is live.

## How data moves

| Provider kind | Sync |
|---|---|
| Accounting, e-commerce, payments, analytics, Mailchimp/Klaviyo, Merchant Center | On demand (Sync now) |
| Business Listings directories | Listings auto-sync schedule, and Sync now |
| Ad platforms | Hourly stats refresh for campaigns created in Noxtill, and Sync now |
| Google Calendar / Outlook / Zoom | Every 5 minutes (booking mirror), and Sync now |
| Slack, WhatsApp, e-mail, webhooks, automation, social | Event-driven — there is no sync |

Every sync attempt writes an `IntegrationSyncLog` row (records, failures, duration, message), which
is what the Connections tab, the connection drawer and the Advisor read. A paused connection
(`Integration.pausedAt`) is skipped by every sync path.

## E-commerce stock conflicts

`Integration.meta.sourceOfTruth` decides who wins when Noxtill and the store hold different stock
for a SKU: `noxtill` (default, pushes Noxtill's number to the store), `store` (applies the store's
number), or `manual` (nothing is changed; a `pending` `EcommerceSyncConflict` waits for
`POST /integrations/ecommerce/conflicts/:id/resolve`). Only stock is synced — never prices, names
or customers.

## API keys

- Scopes are `CAPABILITIES` strings. A key's capabilities are exactly its scopes — the
  `CapabilitiesGuard` checks them as-is for `api-key:*` callers.
- Capabilities that erase data or change billing/roles (`API_KEY_FORBIDDEN_SCOPES`) cannot be granted.
- Each key is limited to `API_KEY_HOURLY_LIMIT` requests per clock hour; over the limit the API
  answers `429` with `Retry-After`. Usage is counted in `ApiKeyUsageHour`.
- Developer webhooks are validated (signed test POST, 2xx required, 10 s timeout) before they are
  saved.

## What each card claims

Direction, permissions and "what it does" text in `hub.catalog.ts` are guarded by `hub.catalog.spec.ts`:
a connector that only implements `fetch*` methods is Inbound, only `push*`/`create*`/`postMessage` is Outbound,
both is Two-way. Social platforms publish posts and read the comments/mentions on them; Snapchat is
ad-creative-only (Outbound); Telegram/Discord/WeChat/LINE are bot/account message channels. Event-driven
providers (Slack, WhatsApp, e-mail, social, webhooks) show "Event-driven" rather than a sync timestamp.

## Not available (disclosed in the UI)

OpenAPI document download, provider-side health and rate-limit headroom, inbound automation action
counts, price sync, and accounting posts other than completed-sale invoices.

## Hub API (all `INTEGRATIONS_MANAGE`)

`GET /integrations/hub/overview`, `…/connections/:key` (+ `POST …/pause|resume|sync`),
`…/accounting/overview|transactions`, `…/ecommerce/overview|items`, `…/automation/overview`,
`…/lineage`, `POST …/advisor/dismiss`, `POST …/requests`; `GET /developer/overview|scopes`.
