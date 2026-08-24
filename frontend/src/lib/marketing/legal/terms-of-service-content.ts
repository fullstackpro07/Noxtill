import type { LegalBlock } from "@/components/site/legal-page-layout";

/**
 * Transcribed from d:\Noxtil\docs\Noxtill_Terms_of_Service.docx (extracted via
 * frontend/scripts/extract-legal-docs.mjs). Bracketed placeholders such as
 * {COMPANY_NUMBER}, {REGISTERED_ADDRESS}, {LEGAL_EMAIL} etc. are unfilled
 * fields in the source document itself, not omissions introduced here —
 * preserved verbatim. Three parts (General / Module-Specific / Regional
 * Terms) plus four Schedules, matching the source's own structure.
 */
export const TERMS_OF_SERVICE_BLOCKS: LegalBlock[] = [
  {
    kind: "callout",
    text: "Noxtill Ltd · Incorporated in England and Wales · Company No. {COMPANY_NUMBER}. Version 1.0 · Effective {DATE}. Prepared for legal review — not legal advice.",
  },
  {
    kind: "callout",
    text: "Important — please read. These Terms govern your use of Noxtill and contain provisions that limit our liability, allocate risk between us, and require you to indemnify us in defined circumstances. They also state clearly what Noxtill is not: it is not a lender, a payment institution, or a provider of professional advice. If you do not agree to these Terms, do not use the Service.",
  },
  {
    kind: "p",
    text: "**How to read this document.** Part I contains the General Terms, which always apply. Part II contains Module-Specific Terms, which apply only where you use the feature concerned. Part III contains Regional Terms, which apply where you are established in, or your use is directed at, the territory concerned — and which prevail over the General Terms for that territory. The Schedules contain the Acceptable Use Policy, Service Level Agreement, Support Terms and API Terms.",
  },
  { kind: "h2", text: "Part I — General Terms" },

  { kind: "h2", text: "1. Introduction, structure and order of precedence" },
  { kind: "h3", text: "1.1 Who we are" },
  {
    kind: "p",
    text: "These Terms of Service (**Terms**) form a legal agreement between you and **Noxtill Ltd**, a company incorporated in England and Wales under company number {COMPANY_NUMBER}, whose registered office is at {REGISTERED_ADDRESS} (**Noxtill**, **we**, **us**, **our**).",
  },
  { kind: "h3", text: "1.2 What these Terms cover" },
  {
    kind: "p",
    text: "These Terms govern your access to and use of the Noxtill platform, including our web application, mobile applications, the public customer-facing pages we host on your behalf, our application programming interfaces, our documentation, and any related services (together, the **Service**).",
  },
  { kind: "h3", text: "1.3 Acceptance" },
  {
    kind: "p",
    text: "By creating an account, accessing the Service, clicking to accept these Terms, or paying any Fee, you agree to be bound by them. If you accept on behalf of a company, partnership or other entity, you represent that you have authority to bind that entity, and **you** means that entity.",
  },
  { kind: "p", text: "**If you do not agree to these Terms, you must not use the Service.**" },
  { kind: "h3", text: "1.4 Documents forming this agreement" },
  { kind: "p", text: "This agreement consists of the following documents, each incorporated by reference:" },
  {
    kind: "ul",
    items: [
      "**These General Terms** (Part I) — the core commercial and legal terms",
      "**Module-Specific Terms** (Part II) — additional terms for particular features",
      "**Regional Terms** (Part III) — terms applying in specific territories",
      "**Schedule 1 — Acceptable Use Policy**",
      "**Schedule 2 — Service Level Agreement** (paid plans)",
      "**Schedule 3 — Support Terms**",
      "**Schedule 4 — API and Developer Terms**",
      "**The Privacy Policy**, the **Cookie Policy**, the **Refund and Cancellation Policy**, and the **Data Processing Agreement**",
      "**Your Order** — the plan, add-ons, term and Fees you selected",
    ],
  },
  { kind: "h3", text: "1.5 Order of precedence" },
  { kind: "p", text: "Where there is a conflict between documents, the following order applies, highest first:" },
  {
    kind: "ul",
    items: [
      "1. Any separately negotiated and signed written agreement between us",
      "2. Your Order",
      "3. **Regional Terms** (Part III) — regional terms prevail over General Terms for the territory concerned",
      "4. Module-Specific Terms (Part II)",
      "5. The Data Processing Agreement, in respect of personal data",
      "6. These General Terms (Part I)",
      "7. The Schedules",
    ],
  },
  { kind: "h3", text: "1.6 Interpretation" },
  {
    kind: "p",
    text: "Headings are for convenience only. **Including** and **includes** mean without limitation. References to a statute include it as amended or replaced. Singular includes plural. **Writing** includes email. A **day** means a calendar day; a **working day** means a day other than a Saturday, Sunday or public holiday in England.",
  },

  { kind: "h2", text: "2. Definitions" },
  {
    kind: "ul",
    items: [
      '**"Account"** means the account created to access the Service, including all Users under it.',
      '**"Add-on"** means an optional paid feature purchased in addition to a Plan.',
      '**"Affiliate"** means any entity that controls, is controlled by, or is under common control with a party.',
      '**"Business Data"** means all data you or your Users upload to, create within, or generate through the Service, including customer records, products, sales, orders, appointments, inventory, credit entries, messages, reports and configuration.',
      '**"Confidential Information"** means information disclosed by one party to the other that is marked confidential or would reasonably be understood to be confidential.',
      '**"Customer Data"** means personal data relating to your own customers that you process through the Service. You are the controller; we are your processor.',
      '**"Documentation"** means the user guides, help centre articles and API documentation we publish.',
      '**"End Customer"** means an individual who is a customer of your business whose data you process through the Service, or who interacts with a page we host on your behalf.',
      '**"Fees"** means subscription charges, Add-on charges, usage charges and any other amounts payable for the Service.',
      '**"Message"** means any communication sent through the Service to an End Customer by any channel, including WhatsApp, SMS, RCS, email or voice.',
      '**"Order"** means the record of your selected Plan, Add-ons, billing period and Fees.',
      '**"Personal Data"** has the meaning given in applicable data protection law.',
      '**"Plan"** means the subscription tier you subscribe to, as described on our pricing page.',
      '**"Restricted Jurisdiction"** means a territory listed in clause 3.4 or otherwise notified as restricted.',
      '**"Service"** means as defined in clause 1.2.',
      '**"Subscription Term"** means the billing period of your Plan and each renewal of it.',
      '**"Third-Party Service"** means any external service the Service connects to or depends on.',
      '**"User"** means any individual authorised to access the Service under your Account.',
    ],
  },

  { kind: "h2", text: "3. Eligibility, registration and restricted jurisdictions" },
  { kind: "h3", text: "3.1 Who may use the Service" },
  {
    kind: "p",
    text: "You may use the Service only if you are at least 18 years old, have capacity to contract, and are using the Service for business purposes. The Service is offered business-to-business and is not directed at consumers acting outside a trade, business, craft or profession.",
  },
  { kind: "h3", text: "3.2 Accurate information" },
  {
    kind: "p",
    text: "You must provide accurate, current and complete registration information and keep it updated. We may verify the information you provide and may suspend an Account where information is materially inaccurate or where verification fails.",
  },
  { kind: "h3", text: "3.3 Worldwide availability" },
  {
    kind: "p",
    text: "**The Service is available worldwide.** We do not limit availability by country except where prohibited under clause 3.4, or where a specific feature depends on a Third-Party Service unavailable in your territory. Where a feature is unavailable in your territory this will be indicated in the Service.",
  },
  { kind: "h3", text: "3.4 Restricted Jurisdictions" },
  {
    kind: "callout",
    text: "The Service is not available to any person established in, ordinarily resident in, or operating from a Restricted Jurisdiction. This restriction exists because provision of the Service to those territories is prohibited under sanctions and export control laws binding on us, and under the terms of the infrastructure, payment and messaging providers on which the Service depends.",
  },
  {
    kind: "p",
    text: "Restricted Jurisdictions currently comprise territories subject to comprehensive sanctions under the sanctions regimes of the United Kingdom, the European Union, the United Nations, and the United States, including at the date of these Terms: **Iran, the Democratic People's Republic of Korea (North Korea), Syria, Cuba, the Russian Federation, Belarus**, and the **Crimea, Donetsk and Luhansk regions of Ukraine**.",
  },
  {
    kind: "p",
    text: "This list is not exhaustive and changes as sanctions regimes change. The current operative list is maintained within the Service and applied automatically. We may add or remove territories without prior notice where required by law.",
  },
  { kind: "h3", text: "3.5 Sanctions representations" },
  {
    kind: "p",
    text: "You represent and warrant, on a continuing basis, that: you are not established in, resident in, or operating from a Restricted Jurisdiction; you are not a person designated on any applicable sanctions list, including the UK Sanctions List, the EU Consolidated List, the UN Consolidated List or the US SDN List; you are not owned or controlled, directly or indirectly, by any such person; and you will not make the Service available to any such person.",
  },
  { kind: "h3", text: "3.6 Export control" },
  { kind: "p", text: "You will comply with all applicable export control laws. You will not export, re-export or transfer the Service, or permit access to it, in breach of those laws." },
  { kind: "h3", text: "3.7 Consequences" },
  {
    kind: "p",
    text: "Where we determine that you are established in or operating from a Restricted Jurisdiction, or that a representation in clause 3.5 is untrue, we will suspend your Account immediately and may terminate it. Your Business Data will remain available for export for the period in clause 20.5 **except where a legal restriction prevents us from providing it**, in which case we will comply with that restriction.",
  },
  { kind: "h3", text: "3.8 Account security" },
  {
    kind: "p",
    text: "You are responsible for keeping your credentials confidential and for all activity under your Account. Notify us immediately at {SECURITY_EMAIL} of any suspected unauthorised access. We strongly recommend enabling two-factor authentication.",
  },
  { kind: "h3", text: "3.9 Users" },
  {
    kind: "p",
    text: "You may invite Users and assign roles. **You are responsible for the acts and omissions of your Users as though they were your own**, for ensuring each complies with these Terms, and for promptly removing access when a User leaves your business.",
  },

  { kind: "h2", text: "4. The Service" },
  { kind: "h3", text: "4.1 Licence" },
  {
    kind: "p",
    text: "Subject to these Terms and payment of Fees, we grant you a limited, non-exclusive, non-transferable, non-sublicensable, revocable licence to access and use the Service for your internal business purposes during the Subscription Term, in accordance with your Plan and the Documentation.",
  },
  { kind: "h3", text: "4.2 What the Service provides" },
  {
    kind: "p",
    text: "Depending on your Plan, the Service may include: point-of-sale and sales recording; appointment booking and reminders; customer relationship management; a customer credit ledger; inventory management; profit and loss reporting; review collection and reputation management; staff management; marketing tools; multi-location management; analytics and reporting; artificial intelligence features; and messaging across supported channels.",
  },
  { kind: "h3", text: "4.3 What the Service is not" },
  {
    kind: "callout",
    text: "The Service is a record-keeping and business management tool. It is not: a bank, payment institution, e-money institution, money services business or money transmitter; a lender, credit provider, credit broker, credit reference agency or debt collector; an insurer or insurance intermediary; an accountant, auditor, tax adviser, lawyer or provider of regulated professional advice; or a party to any transaction, arrangement or agreement between you and your End Customers.",
  },
  {
    kind: "p",
    text: "Where the Service records credit you extend, an instalment arrangement, a voucher you issue, a membership you sell, a deposit you take or a warranty you offer, **the underlying arrangement is solely between you and your End Customer**. We record it. We are not a party to it, do not guarantee it, do not underwrite it, and make no representation as to its lawfulness or enforceability.",
  },
  { kind: "h3", text: "4.4 Changes to the Service" },
  {
    kind: "p",
    text: "We may add, modify, improve or remove features. **We will give at least 30 days' notice by email before removing or materially degrading a feature you have actively used in the preceding 90 days**, except where the change is required for security, legal compliance, or is caused by a Third-Party Service outside our control, in which case we will give as much notice as is reasonably practicable.",
  },
  { kind: "h3", text: "4.5 Beta and early-access features" },
  {
    kind: "p",
    text: "Features designated beta, preview, early access or experimental are provided **as is**, may be modified or withdrawn at any time without notice, are excluded from any service level commitment, and may have limited or no support. You use them at your own risk.",
  },
  { kind: "h3", text: "4.6 No reliance on future features" },
  {
    kind: "p",
    text: "You agree that your purchase is not contingent on the delivery of any future feature or functionality, or on any public or private comment we make about future functionality.",
  },

  { kind: "h2", text: "5. Fees, billing, renewal and taxes" },
  { kind: "h3", text: "5.1 Free trial" },
  {
    kind: "p",
    text: "New Accounts receive a 14-day free trial. No payment method is required. **We do not charge you automatically at the end of a trial.** At the end of the trial the Account becomes read-only until you subscribe; your data is retained and nothing is lost. Trials may carry reduced quotas and feature limits. One trial per business.",
  },
  { kind: "h3", text: "5.2 Fees" },
  { kind: "p", text: "Fees are those stated on our pricing page or in your Order, in the currency shown, and are charged in advance for each Subscription Term." },
  { kind: "h3", text: "5.3 Automatic renewal" },
  {
    kind: "p",
    text: "**Your subscription renews automatically at the end of each Subscription Term at the then-current Fees, unless cancelled before renewal.** For annual subscriptions we send a renewal reminder by email **at least 30 days before** the renewal date. For monthly subscriptions the renewal date is stated in your Account.",
  },
  { kind: "h3", text: "5.4 Usage charges and quotas" },
  {
    kind: "p",
    text: "Your Plan includes monthly allowances of utility Messages and marketing Messages, counted separately because they carry materially different costs. Messages beyond your allowance are either blocked or charged as an overage, according to your settings. Where blocked, we notify you in the Service before sending stops.",
  },
  { kind: "h3", text: "5.5 Add-ons" },
  {
    kind: "p",
    text: "Add-ons are charged with your subscription and renew with it. Add-ons that provision a third-party resource — such as a telephone number — may carry their own minimum term, stated at purchase.",
  },
  { kind: "h3", text: "5.6 Payment" },
  {
    kind: "p",
    text: "Payments are processed by our payment provider. By providing payment details you authorise us and our provider to charge the Fees. You must keep payment details current. Fees are payable without set-off, counterclaim or deduction.",
  },
  { kind: "h3", text: "5.7 Failed payment" },
  {
    kind: "p",
    text: "If payment fails we retry over 7 days and notify you each time. After 7 days we may suspend the Account. After 30 days we may terminate under clause 20. **During suspension your data is retained and remains exportable.**",
  },
  { kind: "h3", text: "5.8 Late payment" },
  {
    kind: "p",
    text: "We may charge interest on overdue amounts at 4% above the Bank of England base rate, accruing daily, and may recover reasonable costs of collection. Where the Late Payment of Commercial Debts (Interest) Act 1998 applies, statutory interest and compensation may apply instead.",
  },
  { kind: "h3", text: "5.9 Price changes" },
  {
    kind: "p",
    text: "We may change Fees. **We will give at least 60 days' notice by email.** Changes take effect at your next renewal. If you do not accept a change you may cancel before it takes effect, and clause 21 applies.",
  },
  { kind: "h3", text: "5.10 Taxes" },
  {
    kind: "p",
    text: "Fees are exclusive of VAT, GST, sales tax, withholding tax and any similar tax, which you must pay in addition where applicable. Where we are required to charge indirect tax we will do so at the applicable rate.",
  },
  {
    kind: "p",
    text: "Where you are a business registered for VAT in a jurisdiction that operates a reverse charge and you provide a valid registration number, the reverse charge may apply. Where any deduction or withholding is required by law, you will gross up so that we receive the amount we would have received had no deduction been required.",
  },
  {
    kind: "p",
    text: "**You are solely responsible for all taxes arising from your own business**, including tax on your sales, employment taxes, and any filing obligation in your jurisdiction. Reports generated by the Service are for your convenience and are neither tax advice nor a tax filing.",
  },
  { kind: "h3", text: "5.11 Currency" },
  { kind: "p", text: "Fees are charged in the currency shown at purchase. Where your payment method is denominated in another currency, conversion and any charges are a matter between you and your provider." },
  { kind: "h3", text: "5.12 Refunds" },
  { kind: "p", text: "Refunds are governed by our **Refund and Cancellation Policy**, which forms part of this agreement." },

  { kind: "h2", text: "6. Your Business Data and Customer Data" },
  { kind: "h3", text: "6.1 Ownership" },
  {
    kind: "p",
    text: "**You own your Business Data and your Customer Data.** We claim no ownership. You grant us a limited, non-exclusive, worldwide, royalty-free licence to host, store, process, transmit, adapt for display, and back up that data **solely to the extent necessary** to provide the Service to you, to comply with law, and to enforce these Terms. This licence ends when the data is deleted in accordance with clause 20.5.",
  },
  { kind: "h3", text: "6.2 Our commitments — what we will never do" },
  {
    kind: "ul",
    items: [
      "**We will never sell your Business Data or Customer Data.**",
      "We will never rent, trade, licence or disclose it to advertisers, data brokers or list vendors.",
      "We will never use one customer's data for the benefit of another customer.",
      "We will never use your Customer Data to market our own products to your End Customers.",
      "We will never use your Business Data to train a general-purpose artificial intelligence model, nor permit a sub-processor to do so. Our AI sub-processors are contractually prohibited from training on your content.",
    ],
  },
  { kind: "h3", text: "6.3 Aggregated data" },
  {
    kind: "p",
    text: "We may generate aggregated, de-identified statistics from use of the Service — such as average feature adoption or anonymised category benchmarks — and use them to operate, secure and improve the Service. Such data will not identify you, your business or any individual, and will not be derived from a sample small enough to permit re-identification.",
  },
  { kind: "h3", text: "6.4 Export" },
  {
    kind: "p",
    text: "You may export Business Data at any time from within the Service, in structured, commonly used, machine-readable formats. This is available throughout the Subscription Term, during any suspension, and for the retention window in clause 20.5. **We will never withhold your data as leverage in a dispute.**",
  },
  { kind: "h3", text: "6.5 Backups" },
  {
    kind: "p",
    text: "We take automated backups and test restoration periodically. Backups are retained for {BACKUP_RETENTION} on a rolling cycle and exist for disaster recovery. **They are not a substitute for your own exports**, and we do not undertake to restore individual records deleted by you or a User.",
  },
  { kind: "h3", text: "6.6 Accuracy" },
  {
    kind: "p",
    text: "You are responsible for the accuracy of everything you enter, including prices, tax rates, invoice details, credit records, contact details and consent records. The Service calculates on the data you provide; it does not verify it.",
  },
  { kind: "h3", text: "6.7 Prohibited content" },
  {
    kind: "p",
    text: "You must not upload data you have no right to use, data obtained unlawfully, or special category personal data for which you lack a lawful basis. Where your business processes health data or other special category data, **you are responsible for the lawful basis** under applicable law.",
  },

  { kind: "h2", text: "7. Your responsibilities and warranties" },
  {
    kind: "callout",
    text: "This is the most important clause in these Terms. Breach of it is the most common cause of loss for both parties, and clause 18 (Indemnity) applies.",
  },
  { kind: "p", text: "You confirm and warrant, on a continuing basis, that:" },
  { kind: "h3", text: "7.1 Rights in data" },
  {
    kind: "p",
    text: "You have the right to upload, import, enter and process all Customer Data you put into the Service; you obtained it lawfully; and doing so breaches no law, contract or third-party right.",
  },
  { kind: "h3", text: "7.2 Consent for communications" },
  {
    kind: "p",
    text: "**You have obtained every consent required in each jurisdiction where your End Customers are located, before sending any marketing Message through the Service.** You specifically acknowledge that:",
  },
  {
    kind: "ul",
    items: [
      "a customer providing you with a telephone number or email address does **not**, by itself, constitute consent to receive marketing;",
      "importing a contact list does **not** transfer or create marketing consent; imported contacts must be separately opted in before receiving marketing Messages;",
      "a prior transaction does not create consent for proactive marketing on messaging platforms whose rules require express opt-in;",
      "consent must be specific, informed, freely given, evidenced and revocable;",
      "many jurisdictions — including the United Kingdom, the European Economic Area, Canada, Australia, Singapore and others — require prior opt-in consent for electronic marketing, and some impose statutory damages per message sent without it.",
    ],
  },
  { kind: "h3", text: "7.3 Opt-outs and suppression" },
  {
    kind: "p",
    text: "You will honour every opt-out promptly, will not re-add a person who has opted out, and will not attempt to circumvent, disable or work around the opt-out and suppression controls in the Service.",
  },
  { kind: "h3", text: "7.4 Your arrangements with End Customers" },
  {
    kind: "p",
    text: "Any credit, instalment plan, voucher, gift card, membership, deposit, loyalty reward, refund, guarantee or warranty you offer is **an agreement between you and your End Customer**. You are solely responsible for honouring it, for its lawfulness in the relevant jurisdiction, and for every consequence arising from it.",
  },
  { kind: "h3", text: "7.5 Regulated activity" },
  {
    kind: "p",
    text: "You will not use the Service to conduct any activity requiring a licence, authorisation or registration that you do not hold — including lending, credit brokerage, deposit-taking, money transmission, payment services, insurance mediation, or the provision of regulated professional advice.",
  },
  { kind: "h3", text: "7.6 Legal compliance generally" },
  {
    kind: "p",
    text: "You will comply with all laws applicable to your business in every jurisdiction where you operate, including consumer protection, distance selling, pricing and advertising, tax and invoicing, employment and working time, health and safety, licensing, data protection, and any sector-specific regulation.",
  },
  { kind: "h3", text: "7.7 Platform rules" },
  {
    kind: "p",
    text: "You will comply with the terms of every Third-Party Service you connect through the Service. You acknowledge that a breach by you may cause the relevant integration to be suspended for your Account, and in serious cases may prejudice our own platform relationships — in which case we may suspend or terminate under clauses 19 and 20.",
  },
  { kind: "h3", text: "7.8 Review and reputation integrity" },
  {
    kind: "p",
    text: "You will not create, solicit, purchase, incentivise or fabricate reviews; will not offer any inducement conditional on a positive review; will not selectively solicit only satisfied customers; and will not attempt to suppress, filter or gate negative feedback. **The Service routes feedback solely on the rating the End Customer chooses, and you will not attempt to alter that behaviour.**",
  },
  { kind: "h3", text: "7.9 Staff monitoring" },
  {
    kind: "p",
    text: "Where you use features that record working hours, attribute sales to individuals, or record location, you are responsible for informing affected staff, obtaining any consent or completing any consultation required in your jurisdiction, and limiting monitoring to what is lawful and proportionate. **In some jurisdictions works council or employee representative consultation is required before such features may be enabled.**",
  },
  { kind: "h3", text: "7.10 Recording of calls" },
  {
    kind: "p",
    text: "Where you enable call recording or an automated voice assistant, you are responsible for compliance with recording and interception law in every jurisdiction where a caller may be located, including any requirement for all-party consent.",
  },
  { kind: "h3", text: "7.11 Accessibility" },
  {
    kind: "p",
    text: "Where you offer public-facing pages to consumers, you are responsible for meeting any accessibility obligation applicable to your business. We provide accessibility features; you determine how they are configured.",
  },

  { kind: "h2", text: "8. Acceptable use" },
  { kind: "p", text: "Schedule 1 (Acceptable Use Policy) forms part of this agreement and is set out in full below. In summary, you must not use the Service to:" },
  {
    kind: "ul",
    items: [
      "send any Message to a person who has not consented, or who has opted out;",
      "send content that is unlawful, deceptive, defamatory, threatening, harassing, discriminatory, hateful, obscene or sexually explicit;",
      "send content promoting or facilitating violence, terrorism, self-harm, illegal drugs, weapons, or the exploitation of children;",
      "create, solicit, incentivise or fabricate reviews or testimonials;",
      "impersonate any person or business, or misrepresent your identity or affiliation;",
      "upload data you have no right to use, or special category data without a lawful basis;",
      "attempt to access another business's data, or probe, scan or test the security of the Service;",
      "interfere with, overload, degrade or disrupt the Service, its infrastructure, or any Third-Party Service;",
      "reverse engineer, decompile, disassemble or attempt to derive source code, except to the extent this restriction cannot lawfully be imposed;",
      "copy, frame, mirror or create a derivative work of the Service;",
      "use the Service to build a competing product, or to benchmark it for a competitor without our written consent;",
      "resell, sublicense, rent, lease or provide the Service to third parties except under a written reseller agreement with us;",
      "conduct any regulated financial activity without authorisation;",
      "use AI features to generate misleading content, deepfakes, or to make automated decisions producing legal or similarly significant effects for individuals;",
      "scrape, harvest or systematically extract data other than through your own export functions or our documented API;",
      "circumvent usage limits, quotas or access controls;",
      "breach any sanctions or export control law.",
    ],
  },
  {
    kind: "p",
    text: "**We may suspend an Account immediately, without prior notice, where we reasonably believe this clause has been breached.** We will inform you of the reason as soon as reasonably practicable and give you an opportunity to respond, unless prohibited by law.",
  },

  { kind: "h2", text: "9. Messaging" },
  { kind: "h3", text: "9.1 How Messages are sent" },
  {
    kind: "p",
    text: "Messages are transmitted through Third-Party Services including messaging platforms, telephony carriers and email providers. Delivery depends on those services and on factors outside our control, including network availability, carrier filtering, recipient device settings, and the recipient's own actions.",
  },
  { kind: "h3", text: "9.2 No guarantee of delivery" },
  {
    kind: "callout",
    text: "We do not guarantee that any Message will be delivered, delivered within any particular time, or read. We report delivery status where the underlying provider reports it to us.",
  },
  { kind: "h3", text: "9.3 Classification" },
  {
    kind: "p",
    text: "Messages are classified as utility (transactional) or marketing in accordance with the rules of the relevant platform. **Deliberately misclassifying marketing content as utility is a breach of these Terms and of that platform's policies**, and may result in immediate suspension of messaging.",
  },
  { kind: "h3", text: "9.4 Your identity" },
  {
    kind: "p",
    text: "Where you connect your own number or business account, Messages are sent under your business identity and your End Customers see your business name, not ours. You remain responsible for the content and lawfulness of everything sent.",
  },
  { kind: "h3", text: "9.5 Quality and platform enforcement" },
  {
    kind: "p",
    text: "Messaging platforms measure quality through recipient blocks and reports. Poor quality caused by your practices may result in throttling or suspension **by the platform**, which is outside our control. Where your practices threaten the integrity of our platform relationships or the service of other customers, we may restrict or suspend your sending.",
  },
  { kind: "h3", text: "9.6 Emergency communications" },
  {
    kind: "p",
    text: "**The Service must not be relied upon for emergency communications.** It is not a substitute for emergency services and provides no priority or guaranteed routing.",
  },

  { kind: "h2", text: "10. Artificial intelligence features" },
  { kind: "h3", text: "10.1 What our AI does" },
  {
    kind: "p",
    text: "The Service includes AI features which may: answer questions about your own business data by calling defined read-only functions; draft replies to reviews and messages for your approval; convert speech into a draft record for your confirmation; extract structured data from documents you photograph; generate marketing copy and images for your approval; and produce estimates and insights from your own historical data.",
  },
  { kind: "h3", text: "10.2 Three commitments" },
  {
    kind: "ul",
    items: [
      "**AI never saves a financial or customer record without your explicit confirmation.** Every AI-parsed sale, expense or import is presented for review before it is written.",
      "**AI never makes a decision producing legal or similarly significant effects for an individual.** Risk indicators, fraud flags and scores are informational; a human always decides.",
      "**AI never quotes a figure that does not come from your own records.** Where it cannot find an answer it says so rather than estimating.",
    ],
  },
  { kind: "h3", text: "10.3 Transparency" },
  {
    kind: "p",
    text: "Where you or an End Customer interacts with an AI system, this is disclosed. Any automated voice assistant announces that it is automated at the start of every call, before recording begins. AI-generated content is identified in the interface. Where required by law, synthetic media is machine-readably marked.",
  },
  { kind: "h3", text: "10.4 Estimates are not advice" },
  {
    kind: "callout",
    text: "Projections, forecasts, what-if calculations, health scores, risk indicators and suggestions are estimates derived from your own historical data. They are not advice, not predictions, and not guarantees. You must exercise independent judgement. We are not liable for business decisions taken in reliance on them.",
  },
  { kind: "h3", text: "10.5 Your inputs" },
  {
    kind: "p",
    text: "Content you submit to AI features is processed by our AI sub-processors, identified in our sub-processor list. **Do not submit information to AI features that you are not permitted to disclose to a processor.** You are responsible for the lawfulness of content you submit.",
  },
  { kind: "h3", text: "10.6 Output" },
  {
    kind: "p",
    text: "AI output may be inaccurate, incomplete or unsuitable. You are responsible for reviewing any AI-generated content before it is published, sent or acted upon. As between the parties, you own AI output generated from your inputs, to the extent such output is capable of ownership.",
  },

  { kind: "h2", text: "11. Third-Party Services" },
  { kind: "h3", text: "11.1 Your relationship with providers" },
  {
    kind: "p",
    text: "Your use of any Third-Party Service is governed by that provider's own terms and privacy policy, which you enter into directly with them. We are not a party to that relationship.",
  },
  { kind: "h3", text: "11.2 No responsibility" },
  {
    kind: "p",
    text: "We are not responsible for Third-Party Services, their availability, accuracy, acts, omissions, security, or any change they make to terms, pricing or functionality. Where a Third-Party Service becomes unavailable or changes materially, the corresponding feature may be affected, suspended or withdrawn, and clause 4.4 applies as far as reasonably practicable.",
  },
  { kind: "h3", text: "11.3 Advertising spend" },
  {
    kind: "p",
    text: "**Advertising spend is billed by the advertising platform directly to your own account.** We are not the merchant of record for advertising spend, do not hold advertising funds, do not control auction outcomes, and are not responsible for advertising performance.",
  },
  { kind: "h3", text: "11.4 Payments from your End Customers" },
  {
    kind: "p",
    text: "**For sales you make to your End Customers, you are the merchant of record and bear chargeback liability.** Funds settle to your own payment account. We are the merchant only in respect of the Fees you pay us.",
  },
  { kind: "h3", text: "11.5 Wallets, vouchers and stored value" },
  {
    kind: "p",
    text: "Where the Service records a prepaid balance, wallet or voucher, **we do not hold the underlying funds.** The balance is a liability of your business to your End Customer, recorded by the Service. Funds settle to your own account. You are responsible for honouring the balance and for any regulatory obligation arising from it.",
  },

  { kind: "h2", text: "12. Availability, maintenance and support" },
  { kind: "h3", text: "12.1 Availability" },
  { kind: "p", text: "We aim to keep the Service available at all times but do not guarantee uninterrupted availability. Where your Plan includes a service level commitment, Schedule 2 applies." },
  { kind: "h3", text: "12.2 Maintenance" },
  { kind: "p", text: "We may perform scheduled maintenance and will give reasonable advance notice where material disruption is expected. Emergency maintenance may be performed without notice where necessary for security or stability." },
  { kind: "h3", text: "12.3 Support" },
  { kind: "p", text: "Support is provided per Schedule 3 and your Plan. Support covers use of the Service. **It does not include business, accounting, tax, legal or regulatory advice.**" },
  { kind: "h3", text: "12.4 Business continuity" },
  { kind: "p", text: "We maintain documented business continuity and disaster recovery procedures, including automated backups, tested restoration and defined recovery objectives. Details are available to Enterprise customers on request under confidentiality." },

  { kind: "h2", text: "13. Intellectual property" },
  { kind: "h3", text: "13.1 Our rights" },
  {
    kind: "p",
    text: "The Service — including all software, source code, architecture, design, interfaces, workflows, Documentation, trade marks, trade dress and content we provide — is owned by us or our licensors and protected by intellectual property law. **All rights not expressly granted are reserved.**",
  },
  { kind: "h3", text: "13.2 Your rights" },
  {
    kind: "p",
    text: "You retain all rights in your Business Data, Customer Data, trade marks, logos and content. You grant us a limited licence to display your brand assets within the Service and on pages we host on your behalf, solely to provide the Service.",
  },
  { kind: "h3", text: "13.3 Feedback" },
  {
    kind: "p",
    text: "If you provide suggestions, ideas or feedback, **we may use them without restriction, attribution or obligation, and you assign to us all rights in any resulting improvement to the Service.** We will not identify you as the source without your consent. This does not grant us rights in your Business Data or Confidential Information.",
  },
  { kind: "h3", text: "13.4 Publicity" },
  {
    kind: "p",
    text: "**We will not use your name, logo or a description of your business as a customer reference publicly without your prior written consent.** Where you consent, you may withdraw it on 30 days' notice, after which we will remove the reference from materials within our control at the next reasonable opportunity.",
  },
  { kind: "h3", text: "13.5 Notice of infringement" },
  {
    kind: "p",
    text: "If you believe content on the Service infringes your rights, contact {LEGAL_EMAIL} with details sufficient to identify the content and your right. We operate a notice and takedown procedure and will act on valid notices.",
  },

  { kind: "h2", text: "14. Confidentiality" },
  {
    kind: "p",
    text: "Each party may receive Confidential Information from the other. Each party will: keep it secret using at least the care it uses for its own confidential information and no less than reasonable care; use it only to perform this agreement; and disclose it only to personnel, Affiliates and professional advisers who need it and are bound by equivalent obligations.",
  },
  {
    kind: "p",
    text: "These obligations do not apply to information that is or becomes public through no breach, was lawfully known before disclosure, is independently developed without use of the disclosing party's information, or is lawfully received from a third party without restriction.",
  },
  {
    kind: "p",
    text: "Where disclosure is required by law, regulation or court order, the receiving party will, **where lawful and practicable, give prior notice** so the disclosing party may seek protective relief, and will disclose only what is legally required.",
  },
  { kind: "p", text: "These obligations continue for **3 years** after termination, and **indefinitely** in respect of Personal Data, source code and trade secrets." },

  { kind: "h2", text: "15. Data protection" },
  { kind: "h3", text: "15.1 Roles" },
  {
    kind: "p",
    text: "In respect of Customer Data, **you are the controller and we are the processor**. In respect of your own Account data, we are the controller. Our processing is governed by the **Data Processing Agreement**, which forms part of this agreement, and by our **Privacy Policy**.",
  },
  { kind: "h3", text: "15.2 Your obligations as controller" },
  {
    kind: "p",
    text: "You are responsible for: having a lawful basis for every processing activity you instruct; providing required transparency information to your End Customers; obtaining and evidencing consent where required; responding to data subject requests; and carrying out any data protection impact assessment required for your processing.",
  },
  { kind: "h3", text: "15.3 Our obligations as processor" },
  {
    kind: "p",
    text: "We will process Customer Data only on your documented instructions, ensure personnel are bound by confidentiality, implement appropriate technical and organisational measures, assist you with data subject requests and security obligations, notify you of a personal data breach without undue delay, and delete or return Customer Data at the end of the agreement, as set out in the Data Processing Agreement.",
  },
  { kind: "h3", text: "15.4 Sub-processors" },
  {
    kind: "p",
    text: "You authorise our use of the sub-processors published at {SUBPROCESSOR_URL}. **We will notify you at least 30 days before adding a new sub-processor** and you may object on reasonable data protection grounds; if we cannot accommodate a reasonable objection you may terminate the affected part of the Service without penalty.",
  },
  { kind: "h3", text: "15.5 International transfers" },
  {
    kind: "p",
    text: "Where Personal Data is transferred across borders we rely on an adequacy decision where one applies, or on Standard Contractual Clauses and, for UK transfers, the International Data Transfer Addendum, supported by a documented transfer impact assessment and technical measures including encryption.",
  },
  { kind: "h3", text: "15.6 Audit" },
  {
    kind: "p",
    text: "We will make available information reasonably necessary to demonstrate compliance. Enterprise customers may audit no more than once in any 12 months, on 30 days' notice, at their cost, during business hours, subject to confidentiality, and in a manner that does not disrupt operations. Where available, a current third-party report or certification satisfies an audit request.",
  },

  { kind: "h2", text: "16. Security" },
  {
    kind: "p",
    text: "We implement and maintain technical and organisational measures appropriate to the risk, including: encryption in transit and at rest; strict logical separation of each customer's data with every query scoped at the data access layer; least-privilege access control with logged, time-limited support access; secure authentication with optional multi-factor authentication; append-only audit logging of financial actions; automated backups with tested restoration; vulnerability management; monitoring and alerting; and vendor security assessment before adoption.",
  },
  {
    kind: "p",
    text: "**You are responsible for security within your Account**, including credential hygiene, role assignment, prompt removal of departed Users, and enabling multi-factor authentication.",
  },
  {
    kind: "p",
    text: "If we become aware of a personal data breach affecting data we process for you, **we will notify you without undue delay** with the information you need to meet your own notification obligations, and will cooperate in investigation and remediation.",
  },

  { kind: "h2", text: "17. Warranties and disclaimers" },
  { kind: "h3", text: "17.1 Mutual warranties" },
  { kind: "p", text: "Each party warrants that it has the power and authority to enter into this agreement and that doing so does not breach any other obligation." },
  { kind: "h3", text: "17.2 Our warranty" },
  {
    kind: "p",
    text: "We warrant that we will provide the Service **with reasonable skill and care**, in accordance with these Terms, the Documentation, and applicable law, and that the Service will perform materially in accordance with the Documentation.",
  },
  { kind: "h3", text: "17.3 Your remedy" },
  {
    kind: "p",
    text: "If the Service materially fails to conform to the warranty in clause 17.2, your remedy is for us to use reasonable endeavours to correct the failure, and if we cannot do so within a reasonable period, to terminate the affected part of the Service and receive a pro-rata refund of prepaid Fees for the unused period.",
  },
  { kind: "h3", text: "17.4 Disclaimer" },
  {
    kind: "callout",
    text: "Except as expressly stated in these Terms, and to the maximum extent permitted by law, the Service is provided \"as is\" and \"as available\". We disclaim all other warranties, conditions, terms and representations, express or implied, including any implied warranty of satisfactory quality, merchantability, fitness for a particular purpose, title or non-infringement, and any warranty that the Service will be uninterrupted, timely, secure or error-free, or that defects will be corrected.",
  },
  { kind: "h3", text: "17.5 Specific disclaimers" },
  {
    kind: "p",
    text: "We do not warrant that: any Message will be delivered; any review will be published, retained or removed by a third-party platform; any listing will be accepted or maintained by a directory; any integration will remain available on the same terms; any estimate, forecast, score or insight will prove accurate; or that use of the Service will produce any particular commercial result, increase in revenue, reduction in no-shows, or improvement in rating.",
  },

  { kind: "h2", text: "18. Indemnity" },
  { kind: "h3", text: "18.1 Your indemnity" },
  {
    kind: "p",
    text: "**You will indemnify, defend and hold harmless Noxtill, its Affiliates, and their officers, employees and agents against all claims, demands, proceedings, losses, damages, fines, penalties, costs and reasonable legal fees arising out of or in connection with:**",
  },
  {
    kind: "ul",
    items: [
      "your breach of clause 7 (responsibilities and warranties) or clause 8 (acceptable use);",
      "any Message sent through your Account, including any claim that it was sent without consent or in breach of marketing law;",
      "your Business Data or Customer Data, including any claim that it was collected or processed unlawfully;",
      "any arrangement between you and an End Customer, including credit, instalments, vouchers, memberships, deposits, refunds or warranties;",
      "your breach of any Third-Party Service's terms;",
      "any regulated activity you conduct without authorisation;",
      "your infringement of any third-party intellectual property right;",
      "any claim by your staff arising from monitoring features you enabled.",
    ],
  },
  { kind: "h3", text: "18.2 Our indemnity" },
  {
    kind: "p",
    text: "We will indemnify you against any third-party claim that the Service, used in accordance with these Terms, infringes that third party's intellectual property right, and will pay damages finally awarded or agreed in settlement. This does not apply where the claim arises from your Business Data, your modifications, your combination of the Service with anything not supplied by us, or your use in breach of these Terms.",
  },
  {
    kind: "p",
    text: "If the Service becomes, or we believe may become, the subject of such a claim, we may at our option procure the right to continue use, modify the Service to be non-infringing, or terminate the affected part and refund prepaid Fees for the unused period. **This clause states our entire liability for intellectual property infringement.**",
  },
  { kind: "h3", text: "18.3 Procedure" },
  {
    kind: "p",
    text: "The indemnified party will notify the indemnifying party promptly, give sole control of the defence and settlement (provided no settlement admits liability or imposes obligation on the indemnified party without consent), and provide reasonable cooperation at the indemnifying party's expense.",
  },

  { kind: "h2", text: "19. Limitation of liability" },
  { kind: "h3", text: "19.1 Liability that is not limited" },
  {
    kind: "p",
    text: "**Nothing in these Terms limits or excludes either party's liability for:** death or personal injury caused by negligence; fraud or fraudulent misrepresentation; breach of the obligations implied by section 12 of the Sale of Goods Act 1979 or section 2 of the Supply of Goods and Services Act 1982 where applicable; or any other liability that cannot lawfully be limited or excluded.",
  },
  { kind: "p", text: "Nor does anything limit **your** liability to pay Fees when due, or your liability under clause 18.1 (your indemnity)." },
  { kind: "h3", text: "19.2 Excluded losses" },
  {
    kind: "p",
    text: "**Subject to clause 19.1, and to the maximum extent permitted by law, neither party is liable to the other, whether in contract, tort (including negligence), breach of statutory duty, restitution or otherwise, for any:** loss of profit, revenue, business, contracts, opportunity, anticipated savings, goodwill or reputation; business interruption; loss or corruption of data where the affected party had the ability to export or back it up; wasted expenditure; or any indirect, special or consequential loss, in each case whether or not foreseeable.",
  },
  { kind: "h3", text: "19.3 Cap on liability" },
  {
    kind: "callout",
    text: "Subject to clauses 19.1 and 19.2, each party's total aggregate liability arising out of or in connection with this agreement in any rolling 12-month period is limited to the total Fees paid by you to us in that 12-month period.",
  },
  { kind: "h3", text: "19.4 Data-specific limit" },
  { kind: "p", text: "You are responsible for maintaining your own exports. Our liability for loss of Business Data is limited to using reasonable endeavours to restore from our most recent available backup." },
  { kind: "h3", text: "19.5 Allocation of risk" },
  { kind: "p", text: "You acknowledge that the Fees reflect the allocation of risk in this clause, that we would not provide the Service at these Fees without it, and that the limits are reasonable in the circumstances." },
  { kind: "h3", text: "19.6 One claim" },
  { kind: "p", text: "Multiple claims arising from the same or a connected set of facts constitute a single claim for the purposes of the cap." },

  { kind: "h2", text: "20. Suspension and termination" },
  { kind: "h3", text: "20.1 Your right to cancel" },
  {
    kind: "p",
    text: "You may cancel at any time in Settings. **Cancellation takes effect at the end of the current Subscription Term**; you retain full access until then and the subscription does not renew. See the Refund and Cancellation Policy.",
  },
  { kind: "h3", text: "20.2 Suspension" },
  {
    kind: "p",
    text: "We may suspend the Account or specific features immediately where: Fees are overdue beyond clause 5.7; we reasonably believe clause 7 or 8 has been breached; your use threatens the security, integrity, legality or availability of the Service for others; a Third-Party Service requires it; or we are required to do so by law, regulation or sanctions.",
  },
  {
    kind: "p",
    text: "**Suspension is limited to the affected part of the Service where reasonably practicable**, and we will restore access promptly once the cause is resolved. Data remains retained and exportable during suspension.",
  },
  { kind: "h3", text: "20.3 Termination" },
  {
    kind: "p",
    text: "Either party may terminate: on 30 days' written notice for convenience; immediately where the other materially breaches and fails to remedy within 14 days of written notice, or immediately where the breach is not capable of remedy; or immediately where the other becomes insolvent, enters administration or liquidation, or ceases to carry on business.",
  },
  { kind: "p", text: "We may terminate immediately where continued provision would breach sanctions, export control or other law." },
  { kind: "h3", text: "20.4 Effect of termination" },
  {
    kind: "p",
    text: "On termination: your right to access the Service ends; all outstanding Fees become immediately due; each party returns or destroys the other's Confidential Information subject to legal retention; and any licence granted terminates except as needed for clause 20.5.",
  },
  { kind: "h3", text: "20.5 Your data after termination" },
  {
    kind: "p",
    text: "**Business Data remains available for export for {DATA_RETENTION_DAYS} days after termination.** After that we delete it from active systems, and from backups within the backup rotation cycle, except where retention is required by law. Financial and accounting records are retained for the statutory period.",
  },
  { kind: "h3", text: "20.6 Survival" },
  { kind: "p", text: "Clauses 6.1, 6.2, 13, 14, 15, 17.4, 18, 19, 20.4, 20.5, 21, 22 and 23, and any provision which by its nature should survive, continue after termination." },

  { kind: "h2", text: "21. Changes to these Terms" },
  {
    kind: "p",
    text: "We may amend these Terms. **Where an amendment is material we give at least 30 days' notice** by email and in-product before it takes effect. Where an amendment is minor — correcting an error, clarifying wording, or reflecting a new optional feature without reducing your rights — it takes effect on posting.",
  },
  {
    kind: "p",
    text: "We maintain a dated version history. Continued use after an amendment takes effect constitutes acceptance. **If you do not accept a material amendment you may terminate before it takes effect and receive a pro-rata refund of prepaid Fees for the unused period.**",
  },

  { kind: "h2", text: "22. Governing law, jurisdiction and disputes" },
  { kind: "h3", text: "22.1 Governing law" },
  { kind: "p", text: "This agreement, and any dispute or claim arising out of or in connection with it including non-contractual disputes, is governed by **the law of England and Wales**." },
  { kind: "h3", text: "22.2 Jurisdiction" },
  {
    kind: "p",
    text: "The courts of England and Wales have exclusive jurisdiction. **This does not deprive you of the protection of any mandatory provision of the law of your country of establishment, nor of the right to bring proceedings in your local courts where applicable law confers that right and it cannot be excluded by agreement.**",
  },
  { kind: "h3", text: "22.3 Escalation before proceedings" },
  {
    kind: "p",
    text: "Before commencing proceedings each party will use reasonable endeavours to resolve the dispute by discussion. Either may escalate in writing to the other's senior management, who will meet (in person or remotely) within 21 days. This does not prevent either party seeking urgent injunctive relief.",
  },
  { kind: "h3", text: "22.4 Mediation" },
  { kind: "p", text: "If not resolved within 45 days of escalation, the parties may by agreement refer the dispute to mediation under the CEDR Model Mediation Procedure. Mediation is voluntary and does not prevent proceedings." },
  { kind: "h3", text: "22.5 Time limit" },
  { kind: "p", text: "Except for claims for non-payment, neither party may bring a claim more than **2 years** after the date on which it became aware, or ought reasonably to have become aware, of the facts giving rise to it." },

  { kind: "h2", text: "23. General provisions" },
  { kind: "h3", text: "23.1 Entire agreement" },
  {
    kind: "p",
    text: "This agreement constitutes the entire agreement and supersedes all prior discussions, representations and understandings. Each party acknowledges it has not relied on any statement not set out here. **Nothing limits liability for fraudulent misrepresentation.**",
  },
  { kind: "h3", text: "23.2 Assignment" },
  { kind: "p", text: "You may not assign, transfer or subcontract this agreement without our written consent, not to be unreasonably withheld. We may assign to an Affiliate or in connection with a merger, acquisition or sale of substantially all assets, on notice to you." },
  { kind: "h3", text: "23.3 Subcontracting" },
  { kind: "p", text: "We may use subcontractors and sub-processors. **We remain responsible for their performance as if it were our own.**" },
  { kind: "h3", text: "23.4 Force majeure" },
  {
    kind: "p",
    text: "Neither party is liable for failure or delay caused by events beyond reasonable control, including act of God, natural disaster, epidemic, war, terrorism, civil unrest, government action, sanctions, industrial action, failure of public telecommunications or internet infrastructure, cyber-attack, or the act or omission of a Third-Party Service. The affected party will notify the other and use reasonable endeavours to mitigate. **If force majeure continues for more than 60 days either party may terminate without liability.**",
  },
  { kind: "h3", text: "23.5 Severability" },
  { kind: "p", text: "If any provision is held invalid, illegal or unenforceable it will be modified to the minimum extent necessary to make it enforceable, or if that is not possible, severed. The remainder continues in full force." },
  { kind: "h3", text: "23.6 Waiver" },
  { kind: "p", text: "No failure or delay in exercising a right is a waiver of it. A waiver is effective only in writing and only for the instance given." },
  { kind: "h3", text: "23.7 No partnership or agency" },
  { kind: "p", text: "Nothing creates a partnership, joint venture, agency, franchise or employment relationship. Neither party may bind the other." },
  { kind: "h3", text: "23.8 Third-party rights" },
  { kind: "p", text: "Except for our Affiliates under clause 18, a person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce any term. The parties may vary or rescind this agreement without any third party's consent." },
  { kind: "h3", text: "23.9 Notices" },
  { kind: "p", text: "Notices to us: {LEGAL_EMAIL}, copied to {REGISTERED_ADDRESS}. Notices to you: the email address on your Account, and in-product where material. Notice is deemed given on the next working day after sending, unless a delivery failure is received." },
  { kind: "h3", text: "23.10 Anti-bribery and modern slavery" },
  { kind: "p", text: "Each party will comply with the Bribery Act 2010 and all applicable anti-bribery and anti-corruption law, and will not engage in any activity that would constitute an offence under sections 1, 2 or 6. Each party will comply with the Modern Slavery Act 2015 and maintain policies to ensure no slavery or human trafficking occurs in its business or supply chain." },
  { kind: "h3", text: "23.11 Insurance" },
  { kind: "p", text: "We maintain professional indemnity and cyber liability insurance appropriate to the nature and scale of the Service. Details are available to Enterprise customers on request." },
  { kind: "h3", text: "23.12 Counterparts and electronic signature" },
  { kind: "p", text: "Where a separate order form or agreement is signed, it may be executed in counterparts and by electronic signature, each of which is an original and together constitute one instrument." },
  { kind: "h3", text: "23.13 Language" },
  { kind: "p", text: "These Terms are drafted in English. Where we provide a translation for convenience, **the English version prevails in the event of conflict, except where applicable law requires the local-language version to prevail**, in which case the local version prevails to the minimum extent required." },
  { kind: "h3", text: "23.14 Cumulative remedies" },
  { kind: "p", text: "Rights and remedies under this agreement are cumulative and not exclusive of any provided by law." },

  { kind: "h2", text: "24. Contact" },
  {
    kind: "p",
    text: "**Noxtill Ltd** · Incorporated in England and Wales · Company number {COMPANY_NUMBER} · Registered office: {REGISTERED_ADDRESS}",
  },
  { kind: "p", text: "General and billing: {SUPPORT_EMAIL}. Legal notices: {LEGAL_EMAIL}. Data protection: {DPO_EMAIL}. Security and vulnerability reports: {SECURITY_EMAIL}." },

  { kind: "h2", text: "Part II — Module-Specific Terms" },

  { kind: "h2", text: "M1. Point of sale, orders and invoicing" },
  {
    kind: "p",
    text: "**Invoice compliance.** The Service generates invoices and receipts from the data and settings you provide. **You are responsible for ensuring each document meets the legal requirements of your jurisdiction**, including mandatory content, sequential numbering, tax rates, retention, and any electronic invoicing or fiscalisation obligation.",
  },
  {
    kind: "p",
    text: "**Fiscalisation.** Some jurisdictions require certified fiscal devices, certified invoicing software, or real-time reporting to a tax authority. Where such a requirement applies to your business, you must ensure it is met. We will indicate where a supported integration exists; where none exists, the Service must not be used as your sole compliant record.",
  },
  { kind: "p", text: "**Tax calculation.** Tax is calculated from the rates and rules you configure. We do not verify that your configuration is correct or current." },
  {
    kind: "p",
    text: "**Offline records.** Where offline capture is available, records are queued locally and synchronised when connectivity resumes. You are responsible for reviewing synchronised records for accuracy.",
  },

  { kind: "h2", text: "M2. Customer credit ledger" },
  {
    kind: "callout",
    text: "The credit ledger is a record-keeping function. Noxtill is not a lender, credit provider, credit broker, debt collector or credit reference agency.",
  },
  {
    kind: "p",
    text: "Any credit you extend to an End Customer is an arrangement between you and them. The Service records it. **Noxtill does not set terms, does not calculate or charge interest, does not impose late fees, does not assess creditworthiness on your behalf, and is not a party to the arrangement.**",
  },
  {
    kind: "p",
    text: "**You are responsible** for ensuring that extending credit is lawful for your business in your jurisdiction, that you hold any licence or authorisation required, that any disclosure required by consumer credit law is given, and that your collection practices comply with applicable law.",
  },
  {
    kind: "p",
    text: "**Risk indicators** shown in the Service are computed solely from your own transaction history with that End Customer. They are informational, are never shared with any other business, do not constitute a credit reference or credit score, and must not be used as the sole basis for any decision that significantly affects an individual.",
  },
  { kind: "p", text: "**Reminders** sent through the Service must comply with applicable debt communication rules, including restrictions on frequency, timing and content in some jurisdictions." },

  { kind: "h2", text: "M3. Bookings, deposits and no-show policies" },
  {
    kind: "p",
    text: "Deposits taken through the Service settle to your own payment account. **You are responsible** for your cancellation and no-show policy, for disclosing it clearly before booking, and for ensuring it is fair and enforceable under applicable consumer law. Some jurisdictions restrict forfeiture of deposits or require them to be proportionate to actual loss.",
  },
  { kind: "p", text: "Booking availability is computed from the schedules and constraints you configure. You are responsible for the accuracy of that configuration." },

  { kind: "h2", text: "M4. Reviews and reputation" },
  {
    kind: "p",
    text: "**Review platform rules take precedence.** Each platform prohibits review gating, incentivised positive reviews, and selective solicitation. The Service is designed so that every customer receives the same request link and the path is determined solely by the rating they choose. **You must not attempt to alter this behaviour**, and doing so is a material breach.",
  },
  { kind: "p", text: "We do not control whether a platform publishes, retains or removes any review, and we do not guarantee any rating outcome." },
  {
    kind: "p",
    text: "**Private feedback** collected through the Service is yours. Presenting private feedback publicly as if it were a published review, or in a way that misrepresents your rating, may breach advertising and consumer law.",
  },

  { kind: "h2", text: "M5. Marketing, campaigns and advertising" },
  { kind: "p", text: "**Consent is your responsibility.** See clause 7.2. The Service provides consent capture, suppression and quota controls; it does not verify that consent was lawfully obtained." },
  {
    kind: "p",
    text: "**Advertising.** Campaigns created through the Service are placed on third-party platforms under your own account. Spend is billed to you by the platform. Targeting, delivery, pricing and performance are determined by the platform. **We make no representation as to reach, cost, conversion or return.**",
  },
  {
    kind: "p",
    text: "**Audience uploads.** Where you sync a customer segment to an advertising platform, you must have the consent or other lawful basis required for that transfer. The Service excludes contacts who have opted out; it cannot verify the lawfulness of the original collection.",
  },
  { kind: "p", text: "**Content responsibility.** All campaign content is yours, including AI-generated drafts you approve. You are responsible for its accuracy, its compliance with advertising standards, and any claim it makes." },

  { kind: "h2", text: "M6. Automated voice and telephony" },
  {
    kind: "p",
    text: "Available as a paid Add-on where telephony is supported in your territory. **Number provisioning may require identity and address verification and may be subject to local regulatory requirements and lead times.**",
  },
  {
    kind: "p",
    text: "**Recording and disclosure.** Where enabled, the automated assistant announces at the start of every call that it is automated and that the call may be recorded, before recording begins. **This announcement cannot be removed.** You may disable recording while retaining the assistant.",
  },
  {
    kind: "p",
    text: "**You are responsible** for compliance with recording, interception and consent law in every jurisdiction where a caller may be located, including all-party consent requirements. You are responsible for retention and deletion of recordings in accordance with law and your own policy.",
  },
  {
    kind: "callout",
    text: "The telephony features must not be used for emergency calls and provide no access to emergency services.",
  },

  { kind: "h2", text: "M7. Multi-location, franchise and reseller use" },
  { kind: "p", text: "**Multi-location.** Where you operate several locations under one Account, you remain a single contracting party and are responsible for all locations and Users." },
  {
    kind: "p",
    text: "**Franchise.** Where a franchisor holds a master account with visibility across franchisee accounts, that visibility is limited to the metrics configured and does not confer operational control. Each franchisee remains responsible for its own compliance, and the franchisor and franchisee must determine between them their respective controller responsibilities under data protection law.",
  },
  {
    kind: "p",
    text: "**Reseller and white-label.** Reselling or providing the Service to third parties requires a **separate written reseller agreement**. Without one, providing access to any person who is not your User is a material breach. Under a reseller agreement, the reseller is responsible for its clients' compliance and remains liable to us for their acts and omissions.",
  },

  { kind: "h2", text: "M8. API, integrations and developer use" },
  {
    kind: "p",
    text: "Use of our API is governed by Schedule 4. **Rate limits apply and may change on notice.** We may suspend an API key immediately where use threatens the stability or security of the Service.",
  },
  { kind: "p", text: "API credentials are Confidential Information. You are responsible for all activity conducted with your credentials and must rotate them promptly if compromised." },
  {
    kind: "p",
    text: "**Webhooks** are delivered on a best-efforts basis with retries. You must handle deliveries idempotently and must not rely on webhook delivery as the sole trigger for any critical process.",
  },
  { kind: "p", text: "You must not use the API to replicate the Service's core functionality in a competing product, or to extract data in bulk for resale." },

  { kind: "h2", text: "Part III — Regional Terms" },

  { kind: "h2", text: "R0. How Regional Terms apply" },
  {
    kind: "callout",
    text: "Regional Terms apply where you are established in, or your use is directed at, the territory concerned. Where a Regional Term conflicts with the General Terms, the Regional Term prevails for that territory (clause 1.5).",
  },
  { kind: "p", text: "Regional Terms are not exhaustive of local law. **You remain responsible for compliance with all law applicable to your business** in every territory where you operate, regardless of whether it is addressed here." },

  { kind: "h2", text: "R1. United Kingdom" },
  {
    kind: "p",
    text: "**Electronic marketing.** The Privacy and Electronic Communications Regulations 2003 apply. Marketing by electronic mail to individual subscribers, including sole traders and unincorporated partnerships, requires prior consent, unless the soft opt-in applies: the contact details were obtained in the course of a sale or negotiations for a sale, the marketing relates to similar products, and an opt-out was offered at collection and in every subsequent message.",
  },
  { kind: "p", text: "**Company information.** You must display your company details as required by the Companies Act 2006 where applicable to your business." },
  { kind: "p", text: "**Consumer law.** Where any of your End Customers are consumers, the Consumer Rights Act 2015 and the Consumer Protection from Unfair Trading Regulations 2008 apply to your dealings with them." },
  { kind: "p", text: "**Data protection.** UK GDPR and the Data Protection Act 2018 apply. Most controllers must register with the Information Commissioner's Office and pay the annual data protection fee." },

  { kind: "h2", text: "R2. European Economic Area" },
  {
    kind: "p",
    text: "**Data protection.** The GDPR and the national implementing law of your member state apply. National law varies on employee monitoring, the age of consent for information society services (13 to 16 depending on member state), and administrative procedure.",
  },
  { kind: "p", text: "**Electronic marketing.** The ePrivacy Directive as implemented nationally applies. Prior opt-in consent is generally required for electronic marketing to individuals." },
  {
    kind: "p",
    text: "**Artificial intelligence.** The EU Artificial Intelligence Act applies. Transparency obligations require that a person interacting with an AI system is informed of that fact, and that synthetic content is marked in a machine-readable format. **You are responsible for your own obligations as a deployer of AI systems**, including ensuring appropriate AI literacy among your staff.",
  },
  { kind: "p", text: "**Accessibility.** The European Accessibility Act applies to services offered to consumers. Where you offer public-facing pages to consumers you are responsible for meeting applicable accessibility requirements." },
  {
    kind: "p",
    text: "**Electronic invoicing.** Several member states operate mandatory electronic invoicing or real-time reporting regimes, including but not limited to Italy (SDI), and phased regimes in Germany, France, Spain, Poland and Belgium. **Where such a regime applies to your business, compliance is your responsibility.** We will indicate where a supported integration exists.",
  },
  {
    kind: "p",
    text: "**Certified invoicing and fiscalisation.** Portugal requires certified invoicing software; Germany requires a certified technical security element for electronic cash registers; Austria, Greece, Hungary, Croatia, Slovenia and others operate fiscalisation regimes. **Verify the requirement applicable to your business before relying on the Service as your compliant record.**",
  },
  { kind: "p", text: "**Consumer withdrawal.** Where a sole trader is treated as a consumer under national law, statutory withdrawal rights may apply notwithstanding the business-to-business nature of the Service." },

  { kind: "h2", text: "R3. Middle East and Gulf Cooperation Council" },
  {
    kind: "p",
    text: "**Data protection.** Federal and emirate-level regimes apply in the United Arab Emirates, including separate frameworks within financial free zones. Saudi Arabia, Bahrain, Qatar, Oman and Kuwait each operate their own data protection law. **Determine which regime applies to your establishment before processing personal data.**",
  },
  { kind: "p", text: "**Language.** Arabic-language disclosure may be required for consumer-facing terms and documentation. Where we provide an Arabic translation, clause 23.13 applies." },
  { kind: "p", text: "**Electronic communications.** Telecommunications regulators impose consent and sender identification requirements for commercial messaging, in addition to platform rules." },
  { kind: "p", text: "**Electronic invoicing.** Saudi Arabia operates a mandatory e-invoicing regime; the UAE has announced phased implementation. Compliance is your responsibility." },

  { kind: "h2", text: "R4. South Asia" },
  {
    kind: "p",
    text: "**Data protection.** India's Digital Personal Data Protection Act, Pakistan's data protection framework, Bangladesh's and Sri Lanka's regimes each impose distinct obligations, including in some cases localisation and consent manager requirements. **Verify current obligations with local counsel; these frameworks are evolving.**",
  },
  { kind: "p", text: "**Electronic communications.** Telecommunications regulators operate registration and consent regimes for commercial messaging, including DLT registration in India. Registration obligations may fall on you as sender." },
  { kind: "p", text: "**Tax and invoicing.** GST e-invoicing applies in India above prescribed turnover thresholds. Provincial sales tax on services applies in Pakistan. Compliance is your responsibility." },

  { kind: "h2", text: "R5. Southeast Asia and Asia-Pacific" },
  {
    kind: "p",
    text: "**Data protection.** Singapore's PDPA, Malaysia's PDPA, Indonesia's PDP Law, Thailand's PDPA, the Philippines' Data Privacy Act, Australia's Privacy Act, New Zealand's Privacy Act, Japan's APPI and South Korea's PIPA each impose distinct obligations, several with mandatory breach notification and appointment of a data protection officer.",
  },
  {
    kind: "p",
    text: "**Electronic marketing.** Singapore operates a Do Not Call registry with which you must check before sending marketing messages. Australia's Spam Act requires consent, sender identification and a functional unsubscribe. **Statutory penalties apply per contravention in several jurisdictions.**",
  },
  { kind: "p", text: "**Messaging channels.** Where a market is dominated by a channel we do not support, features dependent on messaging may be of limited use. This does not entitle you to a refund except as provided in the Refund and Cancellation Policy." },

  { kind: "h2", text: "R6. Africa" },
  {
    kind: "p",
    text: "**Data protection.** Nigeria's NDPA, South Africa's POPIA, Kenya's Data Protection Act, Egypt's PDP Law, Ghana's Data Protection Act and others impose registration, notification and in some cases localisation obligations. Several require registration of the data controller with a supervisory authority.",
  },
  { kind: "p", text: "**Electronic communications.** Sector regulators impose consent and identification requirements for bulk messaging. Registration of sender identifiers may be required." },

  { kind: "h2", text: "R7. Latin America" },
  {
    kind: "p",
    text: "**Data protection.** Brazil's LGPD, Argentina's, Chile's, Colombia's, Mexico's and Peru's regimes each impose distinct obligations, several requiring registration of databases or appointment of a representative.",
  },
  {
    kind: "p",
    text: "**Electronic invoicing.** Brazil (NF-e), Mexico (CFDI), Chile, Argentina, Colombia and Peru operate mandatory electronic invoicing regimes with real-time authorisation. **These are strict and technically demanding. Where such a regime applies to your business, the Service must not be used as your sole compliant invoicing record unless a supported integration is in place.**",
  },
  { kind: "p", text: "**Consumer law.** Consumer protection regimes in the region are generally protective and may restrict deposit forfeiture, automatic renewal and limitation of liability in dealings with consumers." },

  { kind: "h2", text: "R8. North America" },
  {
    kind: "p",
    text: "**Data protection.** In the United States, state privacy laws apply according to the state of residence of the individual, several conferring rights of access, deletion, correction and opt-out of sale or sharing. In Canada, PIPEDA and provincial equivalents apply, including Quebec's Law 25.",
  },
  {
    kind: "p",
    text: "**Electronic marketing — important.** United States federal law imposes **statutory damages per message** for text messages sent without the required prior express written consent, and permits private actions and class actions. Canada's Anti-Spam Legislation imposes substantial administrative monetary penalties and requires express or implied consent, sender identification and a functional unsubscribe.",
  },
  {
    kind: "callout",
    text: "If you send marketing messages to recipients in the United States or Canada, you must obtain and evidence the specific form of consent required by those laws. Statutory damages are assessed per message and aggregate rapidly. Clause 18.1 (your indemnity) applies to any resulting claim.",
  },
  { kind: "p", text: "**Do Not Call.** Federal and state do-not-call registries apply to telephone marketing. You are responsible for scrubbing against them where applicable." },
  { kind: "p", text: "**Accessibility.** Public accommodation accessibility requirements may apply to consumer-facing pages." },

  { kind: "h2", text: "R9. Restricted Jurisdictions" },
  { kind: "p", text: "No Regional Terms apply because the Service is not available. See clause 3.4." },

  { kind: "h2", text: "Schedules" },

  { kind: "h2", text: "Schedule 1 — Acceptable Use Policy" },
  { kind: "p", text: "This Acceptable Use Policy forms part of the Terms of Service. It applies to every User of the Account. **Breach may result in immediate suspension.**" },
  { kind: "h3", text: "1. Content you must not send or store" },
  {
    kind: "ul",
    items: [
      "Unlawful content, or content promoting unlawful activity",
      "Content that is defamatory, threatening, abusive, harassing, discriminatory or hateful",
      "Sexually explicit content, or any content sexualising a minor",
      "Content promoting or facilitating violence, terrorism, or self-harm",
      "Content promoting illegal drugs, unlicensed pharmaceuticals, or weapons",
      "Content infringing intellectual property or privacy rights",
      "Malware, viruses, or code designed to disrupt any system",
      "Content that is deliberately false or misleading, including fabricated reviews",
    ],
  },
  { kind: "h3", text: "2. Messaging conduct" },
  {
    kind: "ul",
    items: [
      "Do not message anyone who has not consented or who has opted out",
      "Do not misclassify marketing content as transactional",
      "Do not send at a frequency that could reasonably be regarded as harassment",
      "Do not use misleading sender identification",
      "Do not send outside hours where local law restricts the timing of commercial messages",
      "Do not attempt to evade suppression lists, rate limits or quotas",
    ],
  },
  { kind: "h3", text: "3. Reviews and reputation" },
  {
    kind: "ul",
    items: [
      "Do not fabricate, purchase or solicit false reviews",
      "Do not incentivise positive reviews specifically",
      "Do not selectively solicit only satisfied customers",
      "Do not attempt to gate, filter or suppress negative feedback",
      "Do not misrepresent private feedback as published reviews",
    ],
  },
  { kind: "h3", text: "4. Technical conduct" },
  {
    kind: "ul",
    items: [
      "Do not probe, scan or test the vulnerability of the Service without written authorisation",
      "Do not attempt to access data belonging to another business",
      "Do not circumvent authentication, authorisation, rate limits or quotas",
      "Do not overload, degrade or disrupt the Service or any connected service",
      "Do not reverse engineer, decompile or disassemble, except where this restriction cannot lawfully be imposed",
      "Do not scrape or systematically extract data other than through your own exports or our documented API",
      "Do not use the Service to build a competing product",
    ],
  },
  { kind: "h3", text: "5. Commercial conduct" },
  {
    kind: "ul",
    items: [
      "Do not resell or provide the Service to third parties without a written reseller agreement",
      "Do not share a single Account across separate legal entities to avoid Fees",
      "Do not conduct regulated activity without the required authorisation",
      "Do not use the Service in breach of sanctions or export control law",
    ],
  },
  { kind: "h3", text: "6. Artificial intelligence" },
  {
    kind: "ul",
    items: [
      "Do not use AI features to generate misleading content or deepfakes",
      "Do not use AI output to make automated decisions producing legal or similarly significant effects for individuals",
      "Do not submit to AI features any content you are not permitted to disclose to a processor",
      "Do not represent AI-generated content as human-authored where disclosure is required by law",
    ],
  },
  { kind: "h3", text: "7. Security research" },
  {
    kind: "p",
    text: "We welcome responsible disclosure. Report vulnerabilities to {SECURITY_EMAIL}. **Do not access data belonging to others, do not degrade the Service, and do not publish before we have had a reasonable opportunity to remediate.** We will not pursue action against researchers who follow this process in good faith.",
  },
  { kind: "h3", text: "8. Enforcement" },
  {
    kind: "p",
    text: "We may investigate suspected breaches, and may suspend or terminate under clauses 19 and 20 of the Terms. **Where reasonably practicable we limit suspension to the affected feature.** We will tell you the reason and give an opportunity to respond, unless prohibited by law or where doing so would prejudice an investigation.",
  },

  { kind: "h2", text: "Schedule 2 — Service Level Agreement" },
  { kind: "p", text: "This Schedule applies to paid Plans. It does not apply to free trials, beta features, or the Free tier." },
  { kind: "h3", text: "1. Availability commitment" },
  {
    kind: "table",
    headers: ["Plan", "Monthly uptime target", "Service credit at 99.0–99.9%", "Below 99.0%"],
    rows: [
      ["Starter", "99.5%", "5% of monthly Fee", "10% of monthly Fee"],
      ["Growth", "99.9%", "10% of monthly Fee", "20% of monthly Fee"],
      ["Business", "99.9%", "10% of monthly Fee", "25% of monthly Fee"],
      ["Enterprise", "99.95%", "15% of monthly Fee", "30% of monthly Fee"],
    ],
  },
  { kind: "h3", text: "2. How uptime is measured" },
  {
    kind: "p",
    text: "Uptime is measured monthly as the percentage of five-minute intervals during which the core application responded successfully to an automated health check. **Core application** means authentication, the dashboard, sales recording and data retrieval.",
  },
  { kind: "h3", text: "3. Exclusions" },
  {
    kind: "p",
    text: "The following do not count as downtime: scheduled maintenance notified in advance; emergency maintenance necessary for security or stability; **failure or degradation of a Third-Party Service**, including messaging platforms, payment providers and advertising platforms; failure of your own connectivity or equipment; suspension under clause 20.2; force majeure; and any period during which Fees are overdue.",
  },
  { kind: "h3", text: "4. Claiming a service credit" },
  {
    kind: "p",
    text: "Submit a claim to {SUPPORT_EMAIL} **within 30 days** of the end of the affected month, with the dates and times affected. Credits are applied to your next invoice, are the **sole and exclusive remedy** for failure to meet the availability target, and do not exceed 30% of the monthly Fee in any month.",
  },
  { kind: "h3", text: "5. Chronic failure" },
  {
    kind: "p",
    text: "If we fail to meet the target in **three consecutive months**, you may terminate the affected subscription on written notice within 30 days and receive a pro-rata refund of prepaid Fees for the unused period.",
  },

  { kind: "h2", text: "Schedule 3 — Support Terms" },
  { kind: "h3", text: "1. Channels and hours" },
  {
    kind: "table",
    headers: ["Plan", "Channels", "Hours", "First response target"],
    rows: [
      ["Starter", "Email, help centre", "Business hours", "2 working days"],
      ["Growth", "Email, in-app chat", "Business hours", "1 working day"],
      ["Business", "Email, in-app chat, priority queue", "Extended hours", "4 working hours"],
      ["Enterprise", "All, plus named contact", "24/5, critical 24/7", "1 working hour"],
    ],
  },
  { kind: "h3", text: "2. Severity levels" },
  {
    kind: "table",
    headers: ["Severity", "Definition", "Target response"],
    rows: [
      ["Critical", "Service unavailable, or data loss, affecting all Users", "1 hour (Business and Enterprise)"],
      ["High", "Major feature unusable with no workaround", "4 working hours"],
      ["Normal", "Feature impaired, workaround available", "1 working day"],
      ["Low", "Question, cosmetic issue, or feature request", "2 working days"],
    ],
  },
  { kind: "h3", text: "3. What support covers" },
  { kind: "p", text: "Support covers use of the Service, configuration guidance, defect diagnosis and resolution, and account and billing queries." },
  { kind: "h3", text: "4. What support does not cover" },
  {
    kind: "p",
    text: "**Support does not include business, accounting, tax, legal or regulatory advice**; data entry or migration beyond our documented import tools; custom development; training beyond published materials; support for Third-Party Services; or assistance with hardware or connectivity.",
  },
  { kind: "h3", text: "5. Your cooperation" },
  { kind: "p", text: "You will provide sufficient information to reproduce an issue and will respond to reasonable requests. Where we cannot reproduce an issue with the information provided, we may close the request after reasonable attempts." },

  { kind: "h2", text: "Schedule 4 — API and Developer Terms" },
  { kind: "h3", text: "1. Availability" },
  { kind: "p", text: "API access is available on Enterprise Plans and on such other Plans as we designate." },
  { kind: "h3", text: "2. Credentials" },
  { kind: "p", text: "API keys are Confidential Information. **You are responsible for all activity conducted with your keys.** Rotate them immediately if compromised. Do not embed keys in client-side code or public repositories." },
  { kind: "h3", text: "3. Rate limits" },
  { kind: "p", text: "Rate limits apply and are published in the Documentation. **We may change limits on 30 days' notice, or immediately where necessary to protect the stability or security of the Service.** Exceeding limits may result in throttling or suspension of the key." },
  { kind: "h3", text: "4. Permitted use" },
  { kind: "p", text: "You may use the API to integrate the Service with your own systems and to build applications for your own business. You may not use it to replicate the Service's core functionality in a competing product, to extract data in bulk for resale, or to provide access to any person who is not your User." },
  { kind: "h3", text: "5. Webhooks" },
  { kind: "p", text: "Webhook deliveries are best-efforts with retries and exponential backoff. **You must handle deliveries idempotently** and must not rely on webhook delivery as the sole trigger for any critical process. Verify the signature on every delivery." },
  { kind: "h3", text: "6. Changes and deprecation" },
  { kind: "p", text: "We version the API. **We will give at least 90 days' notice before deprecating a version**, except where a change is required for security, in which case we will give as much notice as is practicable." },
  { kind: "h3", text: "7. Data obtained through the API" },
  { kind: "p", text: "Data you obtain through the API remains subject to the Terms, including clause 6 and the Data Processing Agreement. You must apply equivalent security and retention controls in your own systems." },
  { kind: "h3", text: "8. Suspension" },
  { kind: "p", text: "We may suspend a key immediately where its use threatens the stability, security or integrity of the Service, or breaches these Terms." },
];
