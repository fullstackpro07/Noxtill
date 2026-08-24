import type { LegalBlock } from "@/components/site/legal-page-layout";

/**
 * Transcribed from d:\Noxtil\docs\Noxtill_Refund_Policy.docx (extracted via
 * frontend/scripts/extract-legal-docs.mjs). Bracketed placeholders such as
 * {SUPPORT_EMAIL} and {DATA_RETENTION_DAYS} are unfilled fields in the source
 * document itself, not omissions introduced here — preserved verbatim.
 */
export const REFUND_POLICY_BLOCKS: LegalBlock[] = [
  {
    kind: "callout",
    text: "Noxtill Ltd · Incorporated in England and Wales · Company No. {COMPANY_NUMBER}. Version 1.0 · Effective {DATE}.",
  },
  { kind: "p", text: "Trials, billing, refunds, plan changes and your data." },

  { kind: "h2", text: "1. Summary" },
  {
    kind: "ul",
    items: [
      "**Free trial** — 14 days, no card required, nothing to cancel.",
      "**Cancel any time** — from Settings, in a few clicks. Your plan runs to the end of the period you have paid for.",
      "**Annual plans** — full refund if you cancel within 30 days of first purchase.",
      "**Your data** — exportable at any time, and for {DATA_RETENTION_DAYS} days after you leave.",
      "**We will never hold your data hostage.**",
    ],
  },
  {
    kind: "p",
    text: "The detail follows. Where a mandatory statutory right in your jurisdiction gives you more than this policy, that right applies.",
  },

  { kind: "h2", text: "2. Free trial" },
  {
    kind: "p",
    text: "Every new account begins with a **14-day free trial**. No payment method is required, and **we do not charge you automatically when it ends**.",
  },
  {
    kind: "p",
    text: "At the end of the trial the account becomes read-only. You can still export everything. Subscribe at any time to reactivate — nothing is lost, and no data is deleted.",
  },
  { kind: "p", text: "Trials may carry reduced message allowances and limited access to some features. One trial per business." },

  { kind: "h2", text: "3. Billing periods and renewal" },
  { kind: "p", text: "**Monthly plans** are charged in advance each month on your subscription date." },
  {
    kind: "p",
    text: "**Annual plans** are charged in a single advance payment and include two months free compared with paying monthly.",
  },
  {
    kind: "p",
    text: "Both renew automatically until cancelled. **For annual plans we email a renewal reminder at least 30 days before renewal.** We email a receipt for every payment.",
  },

  { kind: "h2", text: "4. How to cancel" },
  {
    kind: "p",
    text: "**Settings → Billing → Cancel subscription.** A few clicks. No phone call, no email required, no retention conversation, no cancellation fee.",
  },
  {
    kind: "p",
    text: "**Cancellation takes effect at the end of your current paid period.** You keep full access until then and the subscription is not renewed.",
  },
  {
    kind: "p",
    text: "You may also cancel by emailing {SUPPORT_EMAIL} from the address on the account. We action cancellations within one working day and confirm by email.",
  },

  { kind: "h2", text: "5. Refunds" },
  { kind: "h3", text: "5.1 Monthly plans" },
  {
    kind: "p",
    text: "Monthly Fees are **not refunded** for a partial month. You retain access until the end of the paid period.",
  },
  { kind: "h3", text: "5.2 Annual plans — 30-day refund" },
  {
    kind: "callout",
    text: "If you cancel an annual plan within 30 days of your first annual payment, we refund it in full. No conditions, no questions asked. Email {SUPPORT_EMAIL} within 30 days.",
  },
  { kind: "p", text: "After 30 days, annual Fees are not refunded for the unused portion except under 5.3, 5.4 or 5.5." },
  { kind: "h3", text: "5.3 Where we are at fault" },
  {
    kind: "p",
    text: "**We refund in full where we have failed to provide the Service**, including: sustained unavailability materially preventing your use; removal of a material feature you subscribed for without a suitable replacement; or an error on our part in charging you.",
  },
  {
    kind: "p",
    text: "Where your plan includes a service level commitment, service credits under Schedule 2 of the Terms apply in addition.",
  },
  { kind: "h3", text: "5.4 Material changes" },
  {
    kind: "p",
    text: "If we make a material change to the Terms, to your plan's features, or to Fees, and you cancel before the change takes effect, **we refund the unused portion of prepaid Fees on a pro-rata basis.**",
  },
  { kind: "h3", text: "5.5 Chronic service failure" },
  {
    kind: "p",
    text: "If we fail to meet the availability target in three consecutive months, you may terminate and receive a pro-rata refund of prepaid Fees for the unused period.",
  },
  { kind: "h3", text: "5.6 Duplicate and accidental charges" },
  { kind: "p", text: "Refunded in full, promptly, on request. No explanation required." },
  { kind: "h3", text: "5.7 How refunds are paid" },
  {
    kind: "p",
    text: "Refunds are made to the original payment method within **10 working days** of approval. Where the original method is unavailable we agree an alternative with you. Refunds are made in the currency charged; we are not responsible for exchange rate movement or fees applied by your provider.",
  },

  { kind: "h2", text: "6. What is not refundable" },
  {
    kind: "ul",
    items: [
      "**Message allowances already consumed** — Messages are transmitted to third-party networks and cost us money at the point of sending",
      "**Add-on charges for a period already begun**, such as a provisioned telephone number with a minimum term",
      "**Fees where we have terminated for breach** of the Terms or Acceptable Use Policy",
      "**Third-party charges** — advertising spend, payment processing fees and telephony charges billed to your own accounts. These are not paid to us and we cannot refund them",
      "**Amounts already refunded** or subject to a chargeback",
    ],
  },

  { kind: "h2", text: "7. Changing plans" },
  { kind: "h3", text: "7.1 Upgrading" },
  { kind: "p", text: "Effective immediately. We charge the pro-rata difference for the remainder of your current period." },
  { kind: "h3", text: "7.2 Downgrading" },
  {
    kind: "p",
    text: "**Effective at your next renewal**, so you retain what you paid for. We do not refund the difference for the current period.",
  },
  {
    kind: "p",
    text: "**Before a downgrade takes effect we tell you exactly what you will lose** — Users above the new limit, locations above the new limit, features not included, and reduced message allowances. **Your data is never deleted on downgrade**; features become unavailable until you upgrade again.",
  },
  { kind: "h3", text: "7.3 Add-ons" },
  {
    kind: "p",
    text: "Add-ons may be removed at any time, effective at the next renewal. Add-ons with a minimum term run to the end of that term.",
  },

  { kind: "h2", text: "8. Failed payments and suspension" },
  {
    kind: "p",
    text: "We retry a failed payment over 7 days and email you each time. After 7 days the account may be suspended — **data intact, access paused, export still available.** After 30 days we may terminate under the Terms.",
  },
  {
    kind: "p",
    text: "Restore a suspended account at any time by updating your payment method. **Nothing is lost during suspension.**",
  },

  { kind: "h2", text: "9. Your data when you leave" },
  {
    kind: "p",
    text: "**Export everything before you go** — Settings → Reports → Export everything. Sales, customers, orders, credit ledger, inventory, bookings, staff records and messages, in structured, commonly used formats.",
  },
  {
    kind: "p",
    text: "**Business Data remains available for export for {DATA_RETENTION_DAYS} days after cancellation.** After that it is deleted from active systems, and from backups within the backup rotation cycle.",
  },
  {
    kind: "p",
    text: "Financial records we are required to keep for tax and accounting purposes are retained for the statutory period, as set out in our Privacy Policy.",
  },
  {
    kind: "callout",
    text: "Export works during a suspension for non-payment, and after cancellation throughout the retention window. We will never withhold your data as leverage in a billing dispute.",
  },

  { kind: "h2", text: "10. Statutory rights by jurisdiction" },
  {
    kind: "p",
    text: "The Service is provided business-to-business. Where a mandatory statutory right applies notwithstanding that, it prevails over this policy.",
  },
  {
    kind: "table",
    headers: ["Jurisdiction", "Right that may apply"],
    rows: [
      ["United Kingdom", "Consumer Contracts Regulations may confer a 14-day withdrawal right where a sole trader is treated as a consumer"],
      ["European Economic Area", "Distance selling withdrawal rights of 14 days may apply to sole traders treated as consumers under national law"],
      ["Australia", "Australian Consumer Law guarantees may apply and cannot be excluded"],
      ["New Zealand", "Consumer Guarantees Act may apply"],
      ["Canada", "Provincial consumer protection law may apply to automatic renewal and cancellation"],
      ["United States", "State law may require specific automatic renewal disclosures and easy cancellation"],
      ["Brazil, Latin America", "Consumer codes are generally protective and may restrict automatic renewal terms"],
      ["India, Southeast Asia, Middle East, Africa", "Local consumer protection law may confer additional rights"],
    ],
  },
  { kind: "p", text: "**Nothing in this policy limits any statutory right that cannot lawfully be excluded.**" },

  { kind: "h2", text: "11. Disputes and chargebacks" },
  {
    kind: "p",
    text: "If you disagree with a charge, **email {SUPPORT_EMAIL} before raising a chargeback**. We resolve billing disputes quickly and give you the benefit of genuine doubt.",
  },
  {
    kind: "p",
    text: "A chargeback raised without contacting us first may result in suspension while it is investigated, and we may recover any fee charged to us by the payment provider where the chargeback is not upheld.",
  },
  { kind: "p", text: "If we cannot resolve a dispute, the escalation and dispute provisions of the Terms of Service apply." },

  { kind: "h2", text: "12. Contact" },
  {
    kind: "p",
    text: "Billing and refunds: **{SUPPORT_EMAIL}**. Noxtill Ltd · {REGISTERED_ADDRESS} · Company number {COMPANY_NUMBER}",
  },
];
