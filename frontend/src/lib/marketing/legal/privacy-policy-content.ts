import type { LegalBlock } from "@/components/site/legal-page-layout";

/**
 * Transcribed from d:\Noxtil\docs\Noxtill_Privacy_Policy.docx (extracted via
 * frontend/scripts/extract-legal-docs.mjs). Bracketed placeholders such as
 * {DPO_EMAIL}, {COMPANY_NUMBER} and {REGISTERED_ADDRESS} are unfilled fields
 * in the source document itself, not omissions introduced here — preserved
 * verbatim. The jurisdiction-by-jurisdiction Annex (J1–J19) is transcribed in
 * full below the numbered policy body, matching the source's structure.
 */
export const PRIVACY_POLICY_BLOCKS: LegalBlock[] = [
  {
    kind: "callout",
    text: "Noxtill Ltd · Incorporated in England and Wales · Company No. {COMPANY_NUMBER}. Version 1.0 · Effective {DATE}. Prepared for legal review — not legal advice.",
  },
  {
    kind: "p",
    text: "**Short version.** We do not sell your data or your customers' data. We do not share it with advertisers. We do not train AI models on it. Your data is hosted in the European Union. You can export everything at any time and require us to delete it. The detail follows, in the form data protection law requires.",
  },

  { kind: "h2", text: "1. Our promise, in plain English" },
  {
    kind: "p",
    text: "**We do not sell your data. We do not sell your customers' data. We never have and we never will.**",
  },
  {
    kind: "p",
    text: "We do not share it with advertisers or data brokers. We do not use one business's data to benefit another. We do not use your customers' data to market to them ourselves. We do not train artificial intelligence models on your content, and we contractually prohibit our providers from doing so.",
  },
  {
    kind: "p",
    text: "You can export everything at any time, and require us to delete it. These are contractual commitments in our Terms of Service and in the Data Processing Agreement we enter into with every business.",
  },
  {
    kind: "p",
    text: "The rest of this policy explains exactly what we do, in the detail that data protection law requires and that a security review will expect.",
  },

  { kind: "h2", text: "2. Two different relationships — read this first" },
  {
    kind: "p",
    text: "Two different kinds of people appear in this policy, and the law treats them differently. Almost every question about this policy is answered by identifying which one you are.",
  },
  { kind: "h3", text: "2.1 If you are a business owner or staff member using Noxtill" },
  {
    kind: "p",
    text: "We hold your account information — name, email, telephone number, billing details, and how you use the Service. For that information **we are the controller**: we decide why and how it is used. Sections 3, 5, 10 and 11 apply to you.",
  },
  { kind: "h3", text: "2.2 If you are a customer of a business that uses Noxtill" },
  {
    kind: "p",
    text: "For example, you booked an appointment, received a receipt, left a review, or received a message. **The business decides what happens to your information. We only handle it on their instructions.** For that information we are the **processor**, and the business is the controller. Section 4 explains what we handle.",
  },
  {
    kind: "p",
    text: "**To exercise your rights, contact that business directly** — they control your data. We will assist them. If they do not respond within a reasonable period, contact {DPO_EMAIL} and we will do what we lawfully can, including prompting them and, where legally required, acting ourselves.",
  },
  { kind: "h3", text: "2.3 If you visit our website" },
  {
    kind: "p",
    text: "We are the controller of website analytics and marketing data, subject to your cookie choices. See section 12 and our Cookie Policy.",
  },
  { kind: "h3", text: "2.4 Why this matters" },
  {
    kind: "p",
    text: "It determines responsibility. A business using Noxtill is responsible for having a lawful basis to hold its customers' data and to message them. We are responsible for handling that data securely and only as instructed. Neither can discharge the other's obligation.",
  },

  { kind: "h2", text: "3. What we collect as controller" },
  { kind: "h3", text: "3.1 Information you provide" },
  {
    kind: "table",
    headers: ["Category", "Data", "When"],
    rows: [
      ["Account", "Business name, your name, email, telephone, password (hashed, never stored in plain text)", "Registration"],
      ["Business profile", "Business type, address, hours, logo, brand colours, currency, timezone, language, tax settings", "Setup and ongoing"],
      [
        "Billing",
        "Billing name and address, tax registration number, plan, add-ons. Card details are collected and held by our payment provider — we receive a token, the last four digits and expiry only",
        "Subscription",
      ],
      ["Verification", "Where required for a regulated integration or telephony provisioning: identity or address documentation", "On request"],
      ["Support", "Content of your messages to us, attachments, and any screen recording you choose to share", "When you contact us"],
      ["Marketing preferences", "Your consent or objection to our own marketing", "Registration and ongoing"],
    ],
  },
  { kind: "h3", text: "3.2 Information collected automatically" },
  {
    kind: "table",
    headers: ["Category", "Data", "Purpose"],
    rows: [
      ["Usage", "Features used, screens visited, actions taken, timestamps, session duration", "Provide and improve the Service"],
      ["Device and technical", "IP address, browser type and version, operating system, device type, screen size, language, referring page", "Provide the Service, security"],
      ["Performance", "Load times, API latency, error and crash reports with stack traces", "Diagnose and fix faults"],
      ["Security", "Login attempts, device fingerprint for unrecognised-device detection, session records, IP history", "Detect and prevent unauthorised access"],
      ["Approximate location", "Derived from IP address at country and region level only", "Currency and language defaults, sanctions screening, fraud prevention"],
    ],
  },
  {
    kind: "p",
    text: "**We do not collect precise geolocation from the web application.** Where the mobile application offers location features — for example rider tracking — this is opt-in, disclosed at the point of use, and controlled by the business.",
  },
  { kind: "h3", text: "3.3 Information from third parties" },
  {
    kind: "ul",
    items: [
      "**Payment provider** — payment status, chargebacks, payout and dispute information",
      "**Connected integrations** — where you connect a business listing, advertising or messaging account, we receive the data that service returns for your account",
      "**Business information services** — where you register with a business email, publicly available business information to assist configuration",
      "**Sanctions and screening data** — publicly published designation lists, used only to determine eligibility",
    ],
  },

  { kind: "h2", text: "4. What we process as processor" },
  {
    kind: "p",
    text: "When you use Noxtill you process personal data about your own customers and staff. We handle it strictly on your instructions. The categories below reflect the features available; what is actually processed depends on which features you use.",
  },
  {
    kind: "table",
    headers: ["Category", "Examples", "Feature"],
    rows: [
      ["Identity and contact", "Name, telephone, email, postal address", "CRM, bookings, sales"],
      ["Transaction", "Purchases, items, quantities, amounts, discounts, payment method, date, serving staff", "Point of sale, orders"],
      ["Appointment", "Bookings, services, times, staff assigned, attendance, no-show history, deposits", "Bookings"],
      ["Financial arrangement", "Credit extended, payments received, running balance, instalment schedule, voucher and membership status", "Credit ledger, memberships"],
      ["Communications", "Messages sent and received, channel, delivery and read status, opt-in and opt-out records with evidence of consent", "Messaging"],
      ["Feedback", "Star ratings, review text, private complaints, survey responses, video testimonials", "Reviews"],
      ["Preferences and notes", "Tags, notes recorded by you, language, loyalty tier, membership status, service preferences", "CRM"],
      ["Voice", "Call recordings and transcripts where the automated assistant is enabled", "Voice assistant"],
      ["Location", "Rider or field-staff location during working hours where enabled", "Delivery, asset tracking"],
      ["Staff", "Working hours, attendance, sales attribution, commission, advances", "Staff management"],
    ],
  },
  {
    kind: "callout",
    text: "Special category data. Where your business is a clinic, therapy practice, or similar, notes you record may constitute health data. Where you record trade union membership, religious dietary requirements or similar, that is special category data. You are responsible for having a lawful basis under Article 9 UK GDPR / EU GDPR or the equivalent in your jurisdiction. We provide the technical means; you determine the purpose and the basis.",
  },
  {
    kind: "p",
    text: "**We do not decide what customer data you collect, how long you keep it, or what you do with it.** Those are your decisions as controller.",
  },

  { kind: "h2", text: "5. Why we process, and our legal basis" },
  {
    kind: "p",
    text: "Where the UK GDPR, EU GDPR or an equivalent regime applies, we rely on the following bases. Where another regime applies, we rely on the closest equivalent lawful ground.",
  },
  {
    kind: "table",
    headers: ["Purpose", "Data used", "Legal basis"],
    rows: [
      ["Provide the Service", "Account, business profile, usage", "Performance of a contract"],
      ["Process customer data on your behalf", "All Customer Data", "Contract with you; you are the controller and determine the basis"],
      ["Bill you and collect payment", "Billing, transaction records", "Performance of a contract"],
      ["Verify identity where required", "Verification documents", "Legal obligation; legitimate interests"],
      ["Sanctions and eligibility screening", "Country, IP, payment country, designation lists", "Legal obligation"],
      ["Authenticate and secure accounts", "Credentials, IP, device, session", "Legitimate interests — securing the Service"],
      ["Detect and prevent fraud and abuse", "Usage patterns, IP, security events", "Legitimate interests — protecting the platform and its users"],
      ["Provide support", "Support messages, account data", "Performance of a contract"],
      ["Improve and develop the Service", "Aggregated usage analytics", "Legitimate interests — with opt-out available"],
      ["Service announcements", "Email address", "Legitimate interests — you need to know about outages and changes"],
      ["Marketing our own services", "Email address, business profile", "Consent, or soft opt-in for existing customers where permitted"],
      ["Comply with legal obligations", "Financial, tax and audit records", "Legal obligation"],
      ["Establish, exercise or defend claims", "Relevant records including audit logs", "Legitimate interests"],
      ["Business transfer", "Relevant records", "Legitimate interests, with notice to you"],
    ],
  },
  {
    kind: "p",
    text: "**Legitimate interests balancing.** Where we rely on legitimate interests we have assessed whether our interest is overridden by your rights. A summary of each assessment is available on request at {DPO_EMAIL}. **You may object to processing based on legitimate interests at any time** — see section 10.",
  },

  { kind: "h2", text: "6. Who we share information with" },
  {
    kind: "p",
    text: "We share information only with the recipients below, only for the purposes stated, and always under a written contract requiring equivalent protection and prohibiting use for any other purpose.",
  },
  { kind: "h3", text: "6.1 Sub-processors" },
  {
    kind: "table",
    headers: ["Sub-processor", "Purpose", "Data accessed", "Processing location"],
    rows: [
      ["Meta Platforms Ireland Ltd", "WhatsApp message delivery", "Recipient number, message content, delivery status", "EU and global"],
      ["Telephony and SMS providers", "SMS and voice delivery, number provisioning", "Number, message content, call metadata and recordings", "Region-dependent"],
      ["Email delivery provider", "Transactional and marketing email", "Email address, content, engagement events", "EU / US"],
      ["Anthropic PBC", "AI drafting, parsing, extraction, assistant responses", "Content submitted to AI features", "US"],
      ["OpenAI", "Speech-to-text and text-to-speech", "Voice recordings, transcripts, generated audio", "US"],
      ["Stripe Payments Europe Ltd", "Subscription billing and payment processing", "Billing details, payment metadata", "EU and global"],
      ["Hetzner Online GmbH", "Hosting, database, storage, backups", "All Service data", "Germany (EU)"],
      ["Cloudflare Inc", "CDN, DDoS protection, object storage", "Traffic metadata, static assets, stored files", "Global edge network"],
      ["Google LLC / Google Ireland", "Business Profile, Ads, Merchant Center integrations", "Listing, review and campaign data", "EU and global"],
      ["Error monitoring provider", "Crash and error diagnostics", "Technical data, stack traces, user identifier", "EU"],
    ],
  },
  {
    kind: "p",
    text: "The current list is published at {SUBPROCESSOR_URL}. **We will notify you at least 30 days before adding a new sub-processor**, and you may object on reasonable data protection grounds.",
  },
  { kind: "h3", text: "6.2 Other recipients" },
  {
    kind: "ul",
    items: [
      "**Professional advisers** — lawyers, accountants, auditors and insurers, under confidentiality, where necessary",
      "**Public authorities** — where required by valid legal process. **We will notify you unless legally prohibited from doing so, and we will challenge requests we consider overbroad or unlawful**",
      "**A purchaser** — in a merger, acquisition, financing or asset sale, subject to equivalent protection and notice to you",
      "**Successors in insolvency** — where required, subject to applicable law",
    ],
  },
  { kind: "h3", text: "6.3 Who we never share with" },
  {
    kind: "callout",
    text: "Advertisers. Data brokers. List vendors. Marketing agencies acting for others. Other Noxtill customers. AI model trainers. No exceptions, and no arrangement under which any of these could obtain access indirectly.",
  },

  { kind: "h2", text: "7. Where data is held and international transfers" },
  { kind: "h3", text: "7.1 Primary location" },
  {
    kind: "p",
    text: "**The Service is hosted in Germany, within the European Union.** Business Data and Customer Data are stored there. Backups are held within the European Union. Static assets and files are served through a global content delivery network, which caches content at edge locations worldwide.",
  },
  { kind: "h3", text: "7.2 Transfers outside the EEA and UK" },
  {
    kind: "p",
    text: "Some sub-processors operate outside the EEA and UK — principally AI providers (United States), certain messaging infrastructure, and global payment infrastructure. Where personal data is transferred, we rely on:",
  },
  {
    kind: "ul",
    items: [
      "an **adequacy decision** where one applies to the destination;",
      "**Standard Contractual Clauses** adopted by the European Commission, and the **UK International Data Transfer Addendum** for transfers from the UK;",
      "a documented **Transfer Impact Assessment** for each transfer, considering the destination's legal framework and the risk of government access;",
      "**supplementary technical measures** including encryption in transit and at rest, and access controls;",
      "**data minimisation** — we transfer only what the specific function requires, and never the full data set.",
    ],
  },
  { kind: "h3", text: "7.3 UK and EU position" },
  {
    kind: "p",
    text: "Noxtill Ltd is established in the United Kingdom with infrastructure in the European Union. The European Commission has adopted an adequacy decision in respect of the United Kingdom, permitting transfers from the EEA to the UK without additional safeguards for so long as that decision remains in force. {EU_REPRESENTATIVE_STATEMENT}",
  },
  { kind: "h3", text: "7.4 Government access requests" },
  {
    kind: "p",
    text: "We have received no order requiring us to provide bulk access to customer data. Where we receive a request for data we hold as processor, **we will refer the requester to you** unless legally prohibited, and will notify you unless prohibited. We will not provide access beyond what is legally compelled.",
  },

  { kind: "h2", text: "8. How long we keep information" },
  {
    kind: "table",
    headers: ["Data", "Retention period", "Reason"],
    rows: [
      ["Active account data", "Life of the account", "Providing the Service"],
      ["Business Data after termination", "{DATA_RETENTION_DAYS} days, exportable throughout, then deleted", "Allowing you to retrieve your records"],
      ["Financial and invoicing records", "6 years from end of accounting period", "UK statutory requirement"],
      ["Audit logs of financial actions", "6 years", "Legal defensibility and dispute resolution"],
      ["Message content and delivery logs", "24 months", "Dispute resolution and platform compliance"],
      ["Consent and opt-out records", "Duration of reliance plus 6 years", "Demonstrating lawful basis"],
      ["Voice recordings and transcripts", "As configured by the business; default 90 days", "Business's own configuration"],
      ["Support correspondence", "3 years", "Service history and dispute resolution"],
      ["Security and access logs", "12 months", "Security investigation"],
      ["Website analytics", "26 months maximum", "Analytics"],
      ["Backups", "{BACKUP_RETENTION} rolling", "Disaster recovery"],
      ["Suppression list (unsubscribed)", "Indefinitely", "To ensure we never contact you again"],
      ["Sanctions screening records", "6 years", "Regulatory record-keeping"],
    ],
  },
  { kind: "h3", text: "8.1 Backups, honestly" },
  {
    kind: "p",
    text: "When data is deleted it is removed from active systems immediately. **It persists in encrypted backups until those backups rotate out of the retention cycle.** We do not restore deleted data from backup, and backups are not searchable in normal operation. This is a technical reality of any backup system, and we state it rather than implying instant erasure everywhere.",
  },
  { kind: "h3", text: "8.2 Automatic anonymisation" },
  {
    kind: "p",
    text: "Businesses can configure automatic anonymisation of inactive customer records in Settings. Where enabled, personal identifiers are irreversibly removed while financial aggregates are retained for accounting purposes.",
  },

  { kind: "h2", text: "9. How we protect information" },
  {
    kind: "p",
    text: "We implement technical and organisational measures appropriate to the risk, as required by Article 32 UK GDPR and equivalent provisions.",
  },
  { kind: "h3", text: "9.1 Technical measures" },
  {
    kind: "ul",
    items: [
      "**Encryption in transit** — TLS 1.2 or higher on every connection, with modern cipher suites",
      "**Encryption at rest** — databases, backups and stored files",
      "**Tenant isolation** — every record carries a business identifier and every query is scoped at the data access layer, not in application code. Cross-tenant access is architecturally prevented, and this is verified by automated tests covering the API, search indexes, exports, webhooks and AI functions",
      "**Authentication** — passwords hashed with a modern memory-hard algorithm; optional multi-factor authentication; new-device verification",
      "**Session management** — signed tokens, revocable sessions, visible active-session list",
      "**Audit logging** — append-only record of every financial mutation, capturing actor, prior value, new value and timestamp; no update or delete permission granted in production",
      "**Signed URLs** — generated files served through time-limited links expiring within 24 hours",
      "**Input validation and output encoding** against injection and cross-site scripting",
      "**Rate limiting** on authentication and API endpoints",
    ],
  },
  { kind: "h3", text: "9.2 Organisational measures" },
  {
    kind: "ul",
    items: [
      "**Least privilege** — team access limited to what each role requires",
      "**Support access** — access to a customer account is time-limited, logged, and requires a stated reason",
      "**Background checks** where lawful, and confidentiality obligations for all personnel",
      "**Security training** at induction and annually",
      "**Vendor assessment** — every sub-processor reviewed before adoption and periodically thereafter",
      "**Change management** — code review before deployment; automated tests including tenant isolation tests",
      "**Vulnerability management** — dependency scanning, patching, and responsible disclosure process",
    ],
  },
  { kind: "h3", text: "9.3 Resilience" },
  {
    kind: "ul",
    items: [
      "Automated daily backups with **tested restoration**",
      "Documented business continuity and disaster recovery procedures with defined recovery objectives",
      "Monitoring, alerting and on-call escalation",
    ],
  },
  { kind: "h3", text: "9.4 Breach notification" },
  {
    kind: "p",
    text: "No system is perfectly secure. **If a personal data breach occurs affecting data we process on your behalf, we will notify you without undue delay** and in any event within 48 hours of becoming aware, providing the nature of the breach, categories and approximate numbers affected, likely consequences, and measures taken — so you can meet your own 72-hour obligation to your supervisory authority.",
  },
  {
    kind: "p",
    text: "Where we are controller and the breach is likely to result in high risk to individuals, we will notify affected individuals and the relevant supervisory authority as required.",
  },

  { kind: "h2", text: "10. Your rights" },
  {
    kind: "p",
    text: "Where we are controller of your data, you have the rights below. Where we are processor, direct your request to the business that controls your data (see section 2.2).",
  },
  {
    kind: "table",
    headers: ["Right", "What it means"],
    rows: [
      ["Access", "A copy of the personal data we hold about you, and information about how we use it"],
      ["Rectification", "Correction of inaccurate data, and completion of incomplete data"],
      ["Erasure", "Deletion where no overriding legal basis requires retention"],
      ["Restriction", "Limiting how we use your data while accuracy or a dispute is resolved"],
      ["Portability", "A copy in a structured, commonly used, machine-readable format, or transmission to another controller where technically feasible"],
      ["Objection", "To processing based on legitimate interests, and to direct marketing at any time and without reason"],
      ["Withdraw consent", "Where processing is based on consent, without affecting prior lawful processing"],
      ["Automated decisions", "Not to be subject to a decision based solely on automated processing producing legal or similarly significant effects. **We do not make such decisions**"],
      ["Complain", "To a supervisory authority — see 10.3"],
    ],
  },
  { kind: "h3", text: "10.1 How to exercise a right" },
  {
    kind: "p",
    text: "Email **{DPO_EMAIL}**, or use Settings → Data & Privacy in the Service. We may ask for information to verify your identity, and will not use it for any other purpose.",
  },
  { kind: "h3", text: "10.2 Timing" },
  {
    kind: "p",
    text: "We respond within **one month**. Where a request is complex or you have made several, we may extend by up to two further months and **will tell you within the first month, with reasons**. There is no charge unless a request is manifestly unfounded or excessive, in which case we may charge a reasonable fee or refuse, explaining why.",
  },
  { kind: "h3", text: "10.3 Complaints" },
  { kind: "p", text: "We would appreciate the opportunity to address your concern first. You may also complain to a supervisory authority:" },
  {
    kind: "ul",
    items: [
      "**United Kingdom** — Information Commissioner's Office, ico.org.uk",
      "**European Economic Area** — the authority in your country of residence, place of work, or where the alleged infringement occurred",
      "**Elsewhere** — the data protection or privacy authority in your jurisdiction, where one exists",
    ],
  },

  { kind: "h2", text: "11. Marketing to you" },
  {
    kind: "p",
    text: "We may send you information about Noxtill features, updates and offers where you have consented, or where you are an existing customer and the message concerns similar services and you were offered an opt-out at collection and in every message.",
  },
  {
    kind: "p",
    text: "Every marketing email carries an unsubscribe link that works immediately and without login. Once you unsubscribe we add you to a suppression list, which we retain indefinitely **for the sole purpose of ensuring we never contact you again**.",
  },
  {
    kind: "callout",
    text: "Service messages are not marketing. Notices about outages, security incidents, billing, and material changes to terms are necessary to the contract and cannot be unsubscribed from while you hold an account.",
  },
  { kind: "p", text: "**We never market to your customers.** Their data is yours, and we do not use it for our own purposes under any circumstances." },

  { kind: "h2", text: "12. Cookies and similar technologies" },
  {
    kind: "p",
    text: "We use cookies and similar technologies including local storage, session storage and pixels. Full detail — including a table of every cookie, its purpose and duration — is in our **Cookie Policy**.",
  },
  {
    kind: "p",
    text: "In summary: strictly necessary cookies operate without consent; functional, analytics and marketing cookies are set only with your consent; you can change your choice at any time; and **on the public pages we host for businesses we set only strictly necessary cookies**, because the visitor there is that business's customer, not ours.",
  },

  { kind: "h2", text: "13. Children" },
  {
    kind: "p",
    text: "The Service is provided to businesses and is not directed at children. We do not knowingly collect personal data from anyone under 18 in the course of providing the Service to a business owner.",
  },
  {
    kind: "p",
    text: "**Where a business using Noxtill serves customers who are minors** — a tutoring centre, a paediatric clinic, a children's activity provider — that business is the controller and is responsible for the lawful basis, including any parental consent required. The age of consent for information society services varies: 13 in the United Kingdom, 13 to 16 across EEA member states, 13 in the United States under COPPA with parental consent requirements, and varying elsewhere.",
  },
  { kind: "p", text: "If you believe we hold data about a child in error, contact {DPO_EMAIL} and we will investigate and delete it where appropriate." },

  { kind: "h2", text: "14. Automated decision-making and artificial intelligence" },
  {
    kind: "callout",
    text: "We do not make decisions based solely on automated processing that produce legal effects concerning you or similarly significantly affect you.",
  },
  {
    kind: "p",
    text: "The Service includes AI features. Where AI produces an output that could affect an individual — a credit risk indicator, a fraud flag, a lead score, a staffing suggestion — **that output is informational and is presented to a human who decides.** AI never automatically cancels an order, refuses credit, blocks a customer, or takes any adverse action against an individual.",
  },
  { kind: "h3", text: "14.1 What our AI does" },
  {
    kind: "ul",
    items: [
      "Answers questions about a business's own data by calling defined read-only functions",
      "Drafts replies to reviews and messages for human approval",
      "Converts speech into a draft record for human confirmation",
      "Extracts structured data from photographed documents for human review",
      "Generates marketing copy and images for human approval",
      "Produces estimates and insights from the business's own historical data",
    ],
  },
  { kind: "h3", text: "14.2 What our AI never does" },
  {
    kind: "ul",
    items: [
      "**Never saves a financial or customer record without explicit human confirmation**",
      "**Never makes a consequential decision about an individual**",
      "**Never quotes a figure not drawn from the business's own records**",
      "**Never trains on your content** — our AI providers are contractually prohibited from training on data submitted through the Service",
    ],
  },
  { kind: "h3", text: "14.3 Transparency" },
  {
    kind: "p",
    text: "Where a person interacts with an AI system, this is disclosed. Automated voice assistants announce that they are automated at the start of every call, before recording begins. AI-generated content is identified in the interface. Where required, synthetic media is machine-readably marked.",
  },
  { kind: "p", text: "Full detail is in our **AI Usage Disclosure**." },

  { kind: "h2", text: "15. Changes to this policy" },
  {
    kind: "p",
    text: "We may update this policy. **Where a change is material we give at least 30 days' notice** by email and in-product before it takes effect. Minor changes — correcting an error, clarifying wording, adding a sub-processor already notified separately — take effect on posting.",
  },
  {
    kind: "p",
    text: "Every version is dated and we maintain a version history available on request. The date of the current version appears at the head of this policy.",
  },

  { kind: "h2", text: "16. Contact" },
  {
    kind: "p",
    text: "**Noxtill Ltd** · Incorporated in England and Wales · Company number {COMPANY_NUMBER} · Registered office: {REGISTERED_ADDRESS}",
  },
  {
    kind: "p",
    text: "**Data protection enquiries and rights requests: {DPO_EMAIL}**. General support: {SUPPORT_EMAIL}. Security and vulnerability disclosure: {SECURITY_EMAIL}. Legal notices: {LEGAL_EMAIL}.",
  },
  { kind: "p", text: "UK supervisory authority: Information Commissioner's Office · ico.org.uk · 0303 123 1113" },

  { kind: "h2", text: "Annex — jurisdiction-specific information" },
  {
    kind: "p",
    text: "**The Service is available worldwide.** This Annex sets out the additional information and rights that apply in specific jurisdictions. Where this Annex conflicts with the main policy, **this Annex prevails for the jurisdiction concerned**.",
  },
  {
    kind: "p",
    text: "This Annex is not exhaustive of local law and does not replace the advice of local counsel. Where you operate in a jurisdiction not listed, the main policy applies together with any mandatory local requirement.",
  },

  { kind: "h2", text: "J1. United Kingdom" },
  { kind: "p", text: "**Applicable law** — UK GDPR · Data Protection Act 2018 · Privacy and Electronic Communications Regulations 2003" },
  { kind: "p", text: "**Supervisory authority** — Information Commissioner's Office · ico.org.uk · Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF" },
  { kind: "p", text: "**Our status** — Noxtill Ltd is established in the United Kingdom. We are registered with the ICO under registration number {ICO_NUMBER}." },
  {
    kind: "p",
    text: "**Additional rights** — The rights in section 10 apply. You may also complain to the ICO without first contacting us, though we would prefer the opportunity to resolve your concern.",
  },
  { kind: "p", text: "**Age of consent** — 13 years for information society services" },
  {
    kind: "p",
    text: "**Electronic marketing** — PECR requires prior consent for marketing to individual subscribers, which includes sole traders and unincorporated partnerships. The soft opt-in applies where details were obtained in the course of a sale, the marketing concerns similar products, and an opt-out was offered at collection and in every message.",
  },

  { kind: "h2", text: "J2. European Economic Area" },
  { kind: "p", text: "**Applicable law** — GDPR (Regulation 2016/679) and the national implementing law of your member state · ePrivacy Directive as implemented nationally" },
  {
    kind: "p",
    text: "**Supervisory authority** — The authority in your member state of residence, place of work, or where the alleged infringement occurred. A list is published by the European Data Protection Board.",
  },
  { kind: "p", text: "**EU representative** — {EU_REPRESENTATIVE_STATEMENT}" },
  { kind: "p", text: "**Data location** — Your data is hosted in Germany, within the European Union." },
  {
    kind: "p",
    text: "**Transfers** — Transfers to sub-processors outside the EEA rely on Standard Contractual Clauses with documented transfer impact assessments. See section 7.",
  },
  {
    kind: "p",
    text: "**Age of consent** — Varies by member state between 13 and 16. Germany 16 · France 15 · Spain 14 · Italy 14 · Portugal 13 · Netherlands 16 · Ireland 16 · Belgium 13 · Poland 16 · Sweden 13 · Denmark 13",
  },
  {
    kind: "p",
    text: "**AI Act** — Where you deploy AI features you may have obligations as a deployer under the EU Artificial Intelligence Act, including ensuring appropriate AI literacy among staff and informing individuals that they are interacting with an AI system.",
  },
  { kind: "p", text: "**Accessibility** — The European Accessibility Act may apply to public-facing pages you offer to consumers." },

  { kind: "h2", text: "J3. Germany" },
  { kind: "p", text: "**Applicable law** — BDSG · TTDSG (cookies and telemedia) · TMG (imprint) · GDPR" },
  { kind: "p", text: "**Supervisory authority** — The authority of the federal state in which you are established; sixteen state authorities plus the federal commissioner" },
  {
    kind: "p",
    text: "**Employee data** — Section 26 BDSG governs employee data specifically and is more restrictive than the GDPR baseline. **Works council consultation may be legally required before enabling features that monitor employees**, including time tracking, sales attribution and location tracking.",
  },
  { kind: "p", text: "**Imprint** — Section 5 TMG requires a compliant imprint on every commercial website. Where you operate a website using our website builder, this obligation is yours." },
  {
    kind: "p",
    text: "**Fiscal requirements** — The Kassensicherungsverordnung requires a certified technical security element for electronic cash register systems, with DSFinV-K export format. Where this applies to your business, compliance is your responsibility.",
  },

  { kind: "h2", text: "J4. France" },
  { kind: "p", text: "**Applicable law** — Loi Informatique et Libertés as amended · GDPR" },
  { kind: "p", text: "**Supervisory authority** — Commission Nationale de l'Informatique et des Libertés (CNIL) · cnil.fr" },
  { kind: "p", text: "**Cookies** — CNIL requires that refusing cookies is as simple as accepting, and recommends consent duration of no more than 6 months." },
  {
    kind: "p",
    text: "**Language** — La loi Toubon requires French for consumer-facing commercial documentation. Where we provide a French translation and a conflict arises, the French version prevails to the extent required by law.",
  },
  { kind: "p", text: "**Age of consent** — 15 years" },

  { kind: "h2", text: "J5. Spain" },
  { kind: "p", text: "**Applicable law** — LOPDGDD (Organic Law 3/2018) · LSSI-CE · GDPR" },
  { kind: "p", text: "**Supervisory authority** — Agencia Española de Protección de Datos (AEPD) · aepd.es" },
  { kind: "p", text: "**Cookies** — AEPD guidance requires equally prominent reject options, prohibits pre-ticked boxes, and restricts cookie walls." },
  { kind: "p", text: "**Digital disconnection** — The LOPDGDD confers a right to digital disconnection on employees, relevant where you use scheduling or messaging features involving staff." },
  { kind: "p", text: "**Age of consent** — 14 years" },

  { kind: "h2", text: "J6. Italy" },
  { kind: "p", text: "**Applicable law** — Codice Privacy (Legislative Decree 196/2003 as amended) · GDPR" },
  { kind: "p", text: "**Supervisory authority** — Garante per la protezione dei dati personali · garanteprivacy.it" },
  { kind: "p", text: "**Cookies** — Garante guidelines prohibit scroll-to-consent, require refusal to be available at the first layer, and set consent renewal expectations." },
  { kind: "p", text: "**AI scrutiny** — The Garante has taken enforcement action concerning AI services on transparency and lawful basis grounds. AI transparency obligations should be treated as strictly enforced." },
  { kind: "p", text: "**Age of consent** — 14 years" },

  { kind: "h2", text: "J7. Netherlands, Belgium, Ireland, Nordics, Poland and other EEA states" },
  { kind: "p", text: "**Applicable law** — GDPR and the national implementing law of the member state concerned" },
  {
    kind: "p",
    text: "**Supervisory authority** — Netherlands — Autoriteit Persoonsgegevens · Belgium — Autorité de protection des données · Ireland — Data Protection Commission · Sweden — IMY · Denmark — Datatilsynet · Poland — UODO",
  },
  { kind: "p", text: "**Note** — National law varies on employee monitoring, the age of consent, and administrative procedure. The rights in section 10 apply in all cases." },

  { kind: "h2", text: "J8. Switzerland" },
  { kind: "p", text: "**Applicable law** — Federal Act on Data Protection (revFADP)" },
  { kind: "p", text: "**Supervisory authority** — Federal Data Protection and Information Commissioner (FDPIC) · edoeb.admin.ch" },
  { kind: "p", text: "**Rights** — Rights of access, rectification, deletion and objection apply, broadly aligned with the GDPR." },

  { kind: "h2", text: "J9. United States" },
  {
    kind: "p",
    text: "**Applicable law** — State privacy laws apply according to the state of residence of the individual, including California (CCPA/CPRA), Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana and others as they come into force. Sector laws may also apply, including HIPAA for covered entities and COPPA for children under 13.",
  },
  {
    kind: "p",
    text: "**Sale and sharing** — We do not sell personal information, and we do not share it for cross-context behavioural advertising, as those terms are defined under California law. We have not done so in the preceding 12 months.",
  },
  {
    kind: "p",
    text: "**Your rights where a state law applies** — Right to know what is collected and how it is used · right to access · right to correct · right to delete · right to opt out of sale, sharing and targeted advertising · right to limit use of sensitive personal information · right to non-discrimination for exercising a right · right to appeal a refusal",
  },
  {
    kind: "p",
    text: "**How to exercise** — Email {DPO_EMAIL}. We respond within 45 days, extendable once by a further 45 days with notice. You may use an authorised agent, and we may require verification.",
  },
  { kind: "p", text: "**Sensitive personal information** — We do not use or disclose sensitive personal information for purposes requiring a limitation right." },
  {
    kind: "p",
    text: "**Electronic marketing — important for our customers** — Federal law imposes **statutory damages per message** for text messages sent without the required prior express written consent, and permits private and class actions. State laws impose additional requirements. **If you send marketing messages to recipients in the United States, obtaining and evidencing the correct form of consent is your responsibility**, and your indemnity under the Terms applies.",
  },
  { kind: "p", text: "**Shine the Light** — California residents may request information about disclosure of personal information to third parties for direct marketing purposes. We make no such disclosures." },

  { kind: "h2", text: "J10. Canada" },
  { kind: "p", text: "**Applicable law** — PIPEDA and provincial equivalents, including Quebec's Law 25, Alberta's PIPA and British Columbia's PIPA" },
  { kind: "p", text: "**Supervisory authority** — Office of the Privacy Commissioner of Canada · priv.gc.ca · and provincial commissioners" },
  { kind: "p", text: "**Rights** — Access, correction, withdrawal of consent. Quebec's Law 25 adds data portability, a right to de-indexing, and mandatory breach reporting." },
  {
    kind: "p",
    text: "**Electronic marketing** — Canada's Anti-Spam Legislation requires express or implied consent, sender identification and a functional unsubscribe, and imposes substantial administrative monetary penalties. **Compliance is the responsibility of the business sending the message.**",
  },

  { kind: "h2", text: "J11. United Arab Emirates and Gulf Cooperation Council" },
  {
    kind: "p",
    text: "**Applicable law** — UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection. Financial free zones — DIFC and ADGM — operate separate regimes closer to the GDPR. Saudi Arabia, Bahrain, Qatar, Oman and Kuwait each operate distinct laws.",
  },
  { kind: "p", text: "**Which regime applies** — Depends on where the entity is established and where processing occurs. **Determine this before processing personal data.**" },
  { kind: "p", text: "**Rights** — Access, correction, deletion, restriction, objection and portability, broadly aligned with the GDPR, with variations by jurisdiction." },
  { kind: "p", text: "**Language** — Arabic-language disclosure may be required for consumer-facing documentation." },
  { kind: "p", text: "**Electronic communications** — Telecommunications regulators impose consent and sender identification requirements in addition to platform rules." },

  { kind: "h2", text: "J12. India" },
  { kind: "p", text: "**Applicable law** — Digital Personal Data Protection Act 2023 and rules made under it" },
  { kind: "p", text: "**Supervisory authority** — Data Protection Board of India" },
  { kind: "p", text: "**Rights** — Access to a summary of processing, correction, completion, updating, erasure, grievance redressal and nomination" },
  { kind: "p", text: "**Consent managers** — The Act contemplates registered consent managers. Where this applies to your processing, compliance is your responsibility." },
  {
    kind: "p",
    text: "**Electronic marketing** — Telecom regulations require registration of sender identifiers and templates on the distributed ledger platform. **Registration obligations may fall on you as sender.**",
  },

  { kind: "h2", text: "J13. Pakistan, Bangladesh, Sri Lanka and South Asia" },
  {
    kind: "p",
    text: "**Applicable law** — Pakistan's data protection framework, Bangladesh's and Sri Lanka's regimes. **These frameworks are evolving; verify current obligations with local counsel.**",
  },
  { kind: "p", text: "**Electronic communications** — Telecommunications regulators impose consent and registration requirements for commercial messaging." },
  { kind: "p", text: "**Rights** — Where a regime is in force, rights of access, correction and deletion generally apply. We will honour requests to the extent applicable law requires." },

  { kind: "h2", text: "J14. Singapore, Malaysia and Southeast Asia" },
  { kind: "p", text: "**Applicable law** — Singapore PDPA · Malaysia PDPA · Indonesia PDP Law · Thailand PDPA · Philippines Data Privacy Act · Vietnam Decree 13" },
  { kind: "p", text: "**Supervisory authority** — Singapore — Personal Data Protection Commission · Philippines — National Privacy Commission · Thailand — PDPC" },
  { kind: "p", text: "**Do Not Call** — Singapore operates a Do Not Call registry. **Businesses must check the registry before sending marketing messages to Singapore numbers.**" },
  { kind: "p", text: "**Rights** — Access, correction, withdrawal of consent, and in several jurisdictions deletion and portability" },
  { kind: "p", text: "**Breach notification** — Mandatory in Singapore, Philippines, Thailand and Indonesia within prescribed periods" },

  { kind: "h2", text: "J15. Australia and New Zealand" },
  { kind: "p", text: "**Applicable law** — Australia — Privacy Act 1988 and Australian Privacy Principles · New Zealand — Privacy Act 2020" },
  { kind: "p", text: "**Supervisory authority** — Office of the Australian Information Commissioner · oaic.gov.au · Office of the Privacy Commissioner NZ · privacy.org.nz" },
  { kind: "p", text: "**Rights** — Access, correction, complaint. New Zealand adds a right to request correction with a statement of correction sought." },
  { kind: "p", text: "**Breach notification** — Mandatory where a breach is likely to result in serious harm" },
  { kind: "p", text: "**Electronic marketing** — Australia's Spam Act requires consent, sender identification and a functional unsubscribe, with civil penalties per contravention" },

  { kind: "h2", text: "J16. Japan and South Korea" },
  { kind: "p", text: "**Applicable law** — Japan — Act on the Protection of Personal Information (APPI) · South Korea — Personal Information Protection Act (PIPA)" },
  { kind: "p", text: "**Supervisory authority** — Japan — Personal Information Protection Commission · Korea — Personal Information Protection Commission" },
  { kind: "p", text: "**Rights** — Access, correction, suspension of use, deletion, and in Korea a right to withdraw consent and to compensation" },
  { kind: "p", text: "**Transfers** — Both regimes impose specific requirements on cross-border transfers, including notice and in some cases consent" },

  { kind: "h2", text: "J17. Brazil and Latin America" },
  { kind: "p", text: "**Applicable law** — Brazil — LGPD · Argentina, Chile, Colombia, Mexico, Peru — respective data protection laws" },
  { kind: "p", text: "**Supervisory authority** — Brazil — Autoridade Nacional de Proteção de Dados (ANPD) · Mexico — INAI · Colombia — SIC" },
  { kind: "p", text: "**Rights** — Confirmation of processing, access, correction, anonymisation, portability, deletion, information on sharing, and revocation of consent" },
  { kind: "p", text: "**Representative** — Several regimes require appointment of a local representative or registration of databases where processing is directed at residents." },
  { kind: "p", text: "**Consumer protection** — Regimes in the region are generally protective and may restrict limitation of liability and automatic renewal in consumer dealings." },

  { kind: "h2", text: "J18. South Africa, Nigeria, Kenya and Africa" },
  { kind: "p", text: "**Applicable law** — South Africa — POPIA · Nigeria — NDPA · Kenya — Data Protection Act · Egypt — PDP Law · Ghana — Data Protection Act" },
  { kind: "p", text: "**Supervisory authority** — South Africa — Information Regulator · Nigeria — NDPC · Kenya — Office of the Data Protection Commissioner" },
  { kind: "p", text: "**Registration** — Several regimes require registration of the controller or processor with the supervisory authority, and in some cases appointment of a data protection officer." },
  { kind: "p", text: "**Rights** — Access, correction, deletion, objection, and in several jurisdictions a right not to be subject to automated decision-making" },

  { kind: "h2", text: "J19. Jurisdictions where the Service is not available" },
  {
    kind: "p",
    text: "The Service is not available in Restricted Jurisdictions as defined in the Terms of Service, being territories subject to comprehensive sanctions under applicable regimes. **This is the only category of country in which the Service is unavailable.** No processing of personal data from those jurisdictions is undertaken because no service is provided.",
  },
];
