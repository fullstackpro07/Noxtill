import type { LegalBlock } from "@/components/site/legal-page-layout";

/**
 * Transcribed from d:\Noxtil\docs\Noxtill_Cookie_Policy.docx (extracted via
 * frontend/scripts/extract-legal-docs.mjs). Bracketed placeholders such as
 * {DPO_EMAIL} and {REGISTERED_ADDRESS} are unfilled fields in the source
 * document itself, not omissions introduced here — preserved verbatim.
 */
export const COOKIE_POLICY_BLOCKS: LegalBlock[] = [
  {
    kind: "callout",
    text: "Noxtill Ltd · Incorporated in England and Wales · Company No. {COMPANY_NUMBER}. Version 1.0 · Effective {DATE}.",
  },
  { kind: "p", text: "Cookies and similar technologies — worldwide. Read together with our **Privacy Policy**." },

  { kind: "h2", text: "1. Scope" },
  {
    kind: "p",
    text: "This policy explains how Noxtill Ltd uses cookies and similar technologies on: our marketing website; our web application; our mobile applications; and the public pages we host on behalf of businesses using the Service.",
  },

  { kind: "h2", text: "2. What these technologies are" },
  {
    kind: "p",
    text: "A **cookie** is a small text file placed on your device by a website, allowing it to recognise your device and remember preferences.",
  },
  {
    kind: "table",
    headers: ["Term", "Meaning"],
    rows: [
      ["First-party", "Set by us"],
      ["Third-party", "Set by another organisation whose service appears on our site"],
      ["Session", "Deleted when you close your browser"],
      ["Persistent", "Remains until it expires or you delete it"],
      ["Local storage", "Browser storage used by the application, including for offline data"],
      ["Pixel", "A small image or script used to measure whether a page was viewed"],
      ["SDK", "Code in a mobile app that provides a third-party function"],
    ],
  },

  { kind: "h2", text: "3. Your choices and how consent works" },
  {
    kind: "callout",
    text: "We set only strictly necessary cookies before you make a choice. Functional, analytics and marketing cookies are set only after you consent.",
  },
  {
    kind: "p",
    text: "On first visit a banner offers three **equally prominent** options: **Accept all**, **Reject all**, and **Manage preferences**. Rejecting is exactly as easy as accepting, requiring the same number of clicks. Nothing is pre-ticked. There is no cookie wall — refusing does not deny you access.",
  },
  {
    kind: "p",
    text: "Change your choice at any time using the **Cookie preferences** link in the footer of every page. **Withdrawal takes effect immediately and is as easy as giving consent.** We re-request consent every **12 months**, or sooner where our cookies change materially.",
  },
  {
    kind: "p",
    text: "We record your choice with a timestamp and the version of this policy in force, so we can demonstrate valid consent if asked.",
  },
  { kind: "h3", text: "3.1 Jurisdiction-specific requirements" },
  {
    kind: "table",
    headers: ["Jurisdiction", "Requirement we apply"],
    rows: [
      ["United Kingdom", "PECR — consent required for non-essential cookies; reject as easy as accept"],
      ["European Economic Area", "ePrivacy Directive as implemented nationally; prior opt-in"],
      ["France", "CNIL — refusal as simple as acceptance; consent duration limited to 6 months"],
      ["Spain", "AEPD — equally prominent reject; no pre-ticked boxes; no cookie walls"],
      ["Italy", "Garante — no scroll-to-consent; refusal available at first layer"],
      ["Germany", "TTDSG — explicit consent for non-essential access to terminal equipment"],
      ["Switzerland", "revFADP — transparency; opt-out available"],
      ["United States", "State laws — opt-out of sale, sharing and targeted advertising honoured; Global Privacy Control signals respected"],
      ["Canada", "PIPEDA and Law 25 — meaningful consent; Quebec requires consent for tracking technologies"],
      ["Brazil", "LGPD — consent or another lawful basis; transparency"],
      ["Australia", "Privacy Act — notice of collection"],
      ["Elsewhere", "Where no specific requirement applies we apply the standard above as our baseline worldwide"],
    ],
  },

  { kind: "h2", text: "4. Strictly necessary — always active" },
  {
    kind: "p",
    text: "Required for the Service to function. These cannot be switched off and do not require consent.",
  },
  {
    kind: "table",
    headers: ["Name", "Purpose", "Duration", "Party"],
    rows: [
      ["nx_session", "Maintains your session while logged in", "Session", "First"],
      ["nx_csrf", "Prevents cross-site request forgery", "Session", "First"],
      ["nx_auth", "Authentication token", "30 days", "First"],
      ["nx_refresh", "Refreshes authentication without re-login", "30 days", "First"],
      ["nx_consent", "Records your cookie choice and its version", "12 months", "First"],
      ["nx_lb", "Routes your request to the correct server", "Session", "First"],
      ["nx_device", "Recognises a known device for security", "12 months", "First"],
      ["__cf_bm", "Bot management and DDoS protection", "30 minutes", "Cloudflare"],
      ["cf_clearance", "Confirms a security challenge was passed", "30 minutes", "Cloudflare"],
      ["__stripe_mid", "Fraud prevention on payment pages", "12 months", "Stripe"],
      ["__stripe_sid", "Fraud prevention during checkout", "30 minutes", "Stripe"],
    ],
  },

  { kind: "h2", text: "5. Functional — consent required" },
  {
    kind: "table",
    headers: ["Name", "Purpose", "Duration", "Party"],
    rows: [
      ["nx_locale", "Language and right-to-left layout preference", "12 months", "First"],
      ["nx_prefs", "Dashboard layout, saved filters, column choices", "12 months", "First"],
      ["nx_branch", "Last branch viewed in multi-location accounts", "30 days", "First"],
      ["nx_dismissed", "Prompts and tips you have dismissed", "6 months", "First"],
      ["nx_theme", "Display density and contrast preferences", "12 months", "First"],
    ],
  },

  { kind: "h2", text: "6. Analytics — consent required" },
  {
    kind: "p",
    text: "These help us understand how the Service is used. Data is aggregated and is not used to identify individuals.",
  },
  {
    kind: "table",
    headers: ["Name", "Purpose", "Duration", "Party"],
    rows: [
      ["nx_analytics", "Distinguishes users for aggregate usage statistics", "24 months", "First"],
      ["nx_session_id", "Groups actions within a single visit", "30 minutes", "First"],
      ["nx_feature", "Records which features were used, for product decisions", "12 months", "First"],
      ["_sentry_*", "Groups error reports so faults can be diagnosed", "Session", "Sentry"],
    ],
  },

  { kind: "h2", text: "7. Marketing — consent required" },
  {
    kind: "callout",
    text: "Marketing cookies are set only on our public marketing website. They are never set inside the application, and never on the public pages we host for businesses.",
  },
  {
    kind: "table",
    headers: ["Name", "Purpose", "Duration", "Party"],
    rows: [
      ["_fbp", "Advertising measurement", "90 days", "Meta"],
      ["_gcl_au", "Conversion measurement", "90 days", "Google"],
      ["li_sugr", "Advertising measurement", "90 days", "LinkedIn"],
      ["_ttp", "Conversion measurement", "13 months", "TikTok"],
    ],
  },

  { kind: "h2", text: "8. Public pages hosted for businesses" },
  {
    kind: "p",
    text: "Where a business shares a booking page, rating page, customer portal, receipt link, tracking link or signing page, we host that page.",
  },
  {
    kind: "callout",
    text: "On those pages we set only strictly necessary cookies. No analytics, no marketing, no third-party tracking — because the visitor there is that business's customer, not ours.",
  },

  { kind: "h2", text: "9. Similar technologies" },
  {
    kind: "ul",
    items: [
      "**Local storage** — used by the web and mobile applications to hold offline data so sales can be recorded without connectivity, and to cache reference data. Cleared on logout.",
      "**Session storage** — temporary form state; cleared when the tab closes.",
      "**Mobile SDKs** — crash reporting and push notification delivery; governed by your in-app permissions.",
      "**Pixels** — marketing website only, subject to marketing consent.",
      "**Server logs** — IP address and request metadata, retained per our Privacy Policy. These are not cookies and are necessary to operate and secure the Service.",
    ],
  },

  { kind: "h2", text: "10. Third-party cookies and their policies" },
  {
    kind: "p",
    text: "Where a third party sets a cookie through our site, that party's own policy governs its use. We link to each in our cookie preferences panel. We do not control third-party cookies beyond choosing whether to include the service and honouring your consent.",
  },

  { kind: "h2", text: "11. Managing cookies in your browser" },
  {
    kind: "p",
    text: "You can also control cookies through browser settings. Each major browser publishes guidance under Privacy or Cookies.",
  },
  {
    kind: "callout",
    text: "Blocking strictly necessary cookies will prevent the Service from working. You will not be able to log in or stay logged in.",
  },
  {
    kind: "p",
    text: "Some browsers offer a Global Privacy Control or Do Not Track signal. **We honour Global Privacy Control signals** as an opt-out of sale and sharing where applicable law recognises them.",
  },

  { kind: "h2", text: "12. Changes and contact" },
  {
    kind: "p",
    text: "We update this policy when our cookies change. The tables above always reflect current use. **A material change triggers a fresh consent request.**",
  },
  {
    kind: "p",
    text: "Questions: {DPO_EMAIL} · Noxtill Ltd, {REGISTERED_ADDRESS}, company number {COMPANY_NUMBER}",
  },
];
