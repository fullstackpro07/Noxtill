# Automations & Workflows — provider requirements

This note separates the workflow engine's current requirements from integrations requested in
the product specifications but not yet callable as workflow actions. It reflects the code and
local `backend/.env` checked on 2026-09-30. Configured means only that a non-empty setting was
present; it does not mean the provider accepted it or that a live send was tested.

## Current native workflow behavior

Triggers, condition routing, customer tags, customer custom-field updates, approvals, run history,
retries, and graph execution are Noxtill code backed by MySQL. These functions do not need n8n,
Make.com, GoHighLevel, or an external API key.

| Capability used by the current workflow actions | Required configuration | Local status |
| --- | --- | --- |
| Send an email through the shared Resend sender | `EMAIL_PROVIDER_KEY` and a verified `EMAIL_FROM_ADDRESS` | Key is present but not verified; sender address is missing |
| Send an SMS through Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | All missing |
| Send a WhatsApp message through Meta Cloud API | `META_WA_PHONE_ID`, `META_WA_TOKEN`; `META_WA_API_VERSION` is optional and defaults to `v19.0` | Phone ID and token missing |
| Durable workflow schedules and wait-resume queue | `REDIS_URL` or `REDIS_HOST`; optional `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | Redis connection is not configured |
| Generate an AI text draft from explicitly referenced trigger fields | `ANTHROPIC_API_KEY` via the existing Claude client | Workflow action and guardrails are implemented; no live provider request has been verified |

The selected messaging channel is determined by each business's channel settings and available
customer contact details. WhatsApp messages outside Meta's 24-hour customer-service window also
need the relevant message template approved in Meta. Redis is infrastructure, not a third-party
workflow-provider API; the scheduler and queue behavior must be verified after it is configured.

The AI draft action is deliberately limited: it sends only trigger fields named in the prompt,
uses the existing per-business AI feature toggle, rate limit, cost cap, and usage logging, then
saves the generated text in run history. It does not send or publish that text. Provider failures
are not automatically retried, avoiding duplicate paid generations. The credential listed in the
shared spreadsheet has not been copied into local environment configuration or tested; do not
assume it is valid or authorized for this app until the client confirms and it is installed in the
server secret store.

The Data Mapper offers a protected `POST /workflows/data-mapper/preview` endpoint and authoring
page. It maps safe dot-separated JSON paths (including source array indexes), applies basic
copy/type/text transformations, and returns mapped output plus validation issues. The workflow
builder's `Map event data` action persists mappings in the versioned workflow definition, stores
outputs under `mappedData` in that run's context, and allows later message/draft templates to
reference those values. The standalone preview itself does not save anything. Currency
conversion, arbitrary expressions, regex, CSV/XML, sorting, and aggregation remain unsupported.
This is local application code and requires no provider API key.

The client API inventory was also reviewed on 2026-09-30. It lists Anthropic and OpenAI dashboard
references plus Twilio credential fields, but does not specify workflow action scopes, sandbox
accounts, endpoints beyond those already used in the code, or which product features should call
each provider. Existing code uses Anthropic for AI text and OpenAI for image/speech features; the
workflow AI draft currently uses Anthropic. No inventory values were copied or used for live API
requests. The sheet is exportable without authentication, so restrict it to named collaborators and
rotate any real credentials stored there before using them.

## Workflow authoring catalogs

The editor's action choices and the Actions & Nodes reference page come from `GET /workflows/actions`,
which lists the nine action types currently implemented by the runtime: customer messages, owner
notifications, customer tags, customer custom fields, waits, approvals, AI drafts, data mapping and
variable reads. The built-in template page comes from `GET /workflows/templates`; it currently contains eight fixture-checked starters
covering low stock, feedback, overdue credit, sales, failed deliveries, SEO issues, product
validation, and supplier claims. Installing one with `POST /workflows/templates/:templateId/install`
creates a paused workflow and its initial version. Fixture checks render sample message text only;
they do not call a provider or verify delivery. This is an initial starter set, not completion of
the specification's full template library target.

The Trigger & Event Catalog at `/marketing/automations/triggers` uses `GET /workflows/triggers`.
It groups trigger types by their owning Noxtill module and lists the context field names exposed
to workflow conditions and templates. Those names are schema metadata, not live event values.
Selecting a trigger opens a new workflow draft with that trigger selected.

## Requested capabilities not yet available as workflow actions

- General-purpose autonomous AI agents, tool-using agents, and AI-triggered business actions are
  not available. The implemented AI draft action is not an autonomous agent and cannot execute
  follow-up actions.
- Shopify, WooCommerce, Amazon Seller Central, eBay, Etsy, Walmart Marketplace, and TikTok Shop
  actions are not callable from a workflow today. The existing Shopify/WooCommerce and advertising
  connectors do not make those marketplace operations available to workflows; Amazon Ads is not
  Amazon Seller Central, and TikTok Ads is not TikTok Shop. Do not request a bundle of marketplace
  secrets yet. First select the exact action and permission scopes, then obtain the corresponding
  sandbox store/account and credentials for that connector.
- Arbitrary workflow HTTP/API-call actions and signed inbound workflow webhooks are not in the
  current action catalog. They need a design for allowed destinations, secret storage, signing,
  retries, and SSRF protection before credentials or URLs should be collected.

## Handling credentials

Put secrets in the server's environment or deployment secret manager, never in source control,
workflow JSON, screenshots, or chat. The Resend key was pasted into chat during setup; rotate it
before production use. The key currently in the local environment is not evidence that email
sending works: a verified sender address is still required, and no live send has been verified as
part of this note. Credentials in the shared spreadsheet have not been imported or validated.

Code references: `backend/src/marketing/automations/workflow-action.util.ts`,
`backend/src/marketing/automations/workflow-trigger.service.ts`,
`backend/src/messaging/channels/email.service.ts`,
`backend/src/messaging/channels/sms.service.ts`,
`backend/src/whatsapp/whatsapp.service.ts`, and
`backend/src/marketing/automations/jobs/workflow-schedule.scheduler.ts`.
