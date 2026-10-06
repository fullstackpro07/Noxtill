import { Role } from '@prisma/client';

/**
 * Roles & Permissions matrix (UPD-BE-035) — the fixed capability vocabulary. Each key here is a
 * direct, faithful translation of a real gate that existed in this codebase before this ticket
 * (one key per feature area, not per literal `@Roles()` decorator — several decorator calls on
 * the same controller collapse into one capability where they gate the same conceptual action).
 * `roles.manage` and `payroll.export`/`staff.manage_schedule` are the only genuinely new gates,
 * introduced this same milestone (UPD-BE-034/031 respectively, and this ticket for `roles.manage`
 * itself) — every other key already existed as an owner-only or owner+manager `@Roles()` gate.
 */
export const CAPABILITIES = {
  BILLING_MANAGE: 'billing.manage',
  CREDIT_WRITE_OFF: 'credit.write_off',
  EXPORTS_GENERATE: 'exports.generate',
  MESSAGING_SEND_TEST: 'messaging.send_test',
  STAFF_MANAGE: 'staff.manage',
  PAYROLL_EXPORT: 'payroll.export',
  ROLES_MANAGE: 'roles.manage',
  CUSTOMERS_ERASE: 'customers.erase',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  AUTOMATIONS_MANAGE: 'automations.manage',
  COUPONS_MANAGE: 'coupons.manage',
  VOUCHERS_MANAGE: 'vouchers.manage',
  REFERRALS_MANAGE: 'referrals.manage',
  /// UPD-BE-106/107/108 fix-it: P&L/products/time/cash-forecast/analytics/expenses had zero
  /// server-side gate despite being financial data — the nav already restricts them to
  /// owner/manager, this makes that real instead of cosmetic.
  PROFIT_VIEW: 'profit.view',
  EXPENSES_MANAGE: 'expenses.manage',
  RETURNS_APPROVE: 'returns.approve',
  PRICING_MANAGE: 'pricing.manage',
  VIDEO_TESTIMONIALS_MODERATE: 'video_testimonials.moderate',
  STAFF_MANAGE_SCHEDULE: 'staff.manage_schedule',
  STOCK_TRANSFERS_APPROVE: 'stock_transfers.approve',
  BRANCHES_MANAGE: 'branches.manage',
  STOCK_COUNTS_APPLY: 'stock_counts.apply',
  LABELS_MANAGE: 'labels.manage',
  OPTIONS_MANAGE: 'options.manage',
  LISTINGS_MANAGE: 'listings.manage',
  SOCIAL_MANAGE: 'social.manage',
  COMPETITIVE_MANAGE: 'competitive.manage',
  VOICE_MANAGE: 'voice.manage',
  DELIVERY_MANAGE: 'delivery.manage',
  /// Delivery zones, automations and settings change how every delivery is priced, routed and
  /// messaged — owner-only by design (never added to OWNER_AND_MANAGER_CAPABILITIES below), while
  /// day-to-day dispatch stays DELIVERY_MANAGE.
  DELIVERY_CONFIGURE: 'delivery.configure',
  ADS_MANAGE: 'ads.manage',
  HEALTH_SCORE_MANAGE: 'health_score.manage',
  BOOKINGS_MANAGE: 'bookings.manage',
  CREDIT_MANAGE: 'credit.manage',
  /// Owner-only by design (never added to OWNER_AND_MANAGER_CAPABILITIES below) — same pattern as
  /// CREDIT_WRITE_OFF, matching the spec's "Recovery Reports: Owner-only" note.
  CREDIT_RECOVERY_REPORT_VIEW: 'credit.recovery_report_view',
  /// Purchase Orders, formal (UPD-BE-112) — a real financial commitment to a supplier, so the
  /// send/confirm/receive lifecycle is owner+manager, matching the spec's "Purchases: Owner,
  /// Manager" note (unlike Wastage, which the spec marks staff-recordable and stays ungated).
  PURCHASES_MANAGE: 'purchases.manage',
  /// AI Settings (UPD-BE-115) — owner-only by design (never added to OWNER_AND_MANAGER_CAPABILITIES
  /// below), matching the spec's explicit "Owner-only" note on this screen: cost cap / rate limit /
  /// per-feature toggles are a billing-adjacent control, same tier as BILLING_MANAGE.
  AI_SETTINGS_MANAGE: 'ai_settings.manage',
  /// Settings depth (UPD-BE-M16) — one capability per new settings area, owner+manager unless noted.
  BUSINESS_PROFILE_MANAGE: 'business_profile.manage',
  MESSAGING_CHANNELS_MANAGE: 'messaging_channels.manage',
  NIGHTLY_CLOSE_MANAGE: 'nightly_close.manage',
  /// Today's Goals (fix-it) — same owner+manager tier as NIGHTLY_CLOSE_MANAGE, the closest
  /// existing precedent (a small standing dashboard setting, not a financial-write action).
  DASHBOARD_GOALS_MANAGE: 'dashboard_goals.manage',
  TAX_RULES_MANAGE: 'tax_rules.manage',
  /// Owner-only by design (never added to OWNER_AND_MANAGER_CAPABILITIES below) — a data-subject
  /// request can end in real customer PII erasure, same tier as CUSTOMERS_ERASE itself.
  GDPR_MANAGE: 'gdpr.manage',
  /// Activity Log depth fix (UPD-BE-M25) — the append-only audit trail spans every entity
  /// (financial mutations included), so viewing it is owner+manager, matching the tier every
  /// other cross-business oversight screen (Profit & Analytics, Expenses) already uses.
  ACTIVITY_LOG_VIEW: 'activity_log.view',
  /// Customer Settings (UPD-BE-101) — custom fields, tags catalog, merge rules and privacy
  /// toggles are all configuration a Staff user should never be able to change, even if a
  /// privacy toggle later lets Staff export/merge/archive individual customers.
  CUSTOMERS_MANAGE: 'customers.manage',
  /// Marketing Content Planner (v2) — same owner+manager tier as AUTOMATIONS_MANAGE/COUPONS_MANAGE:
  /// creating/editing/deleting a scheduled content item is configuration, while reading the
  /// calendar and marking a task complete stay open to any authenticated user.
  CONTENT_PLANNER_MANAGE: 'content_planner.manage',
  /// Settings policies: what a business's own limits let someone step past. Owner and manager hold
  /// them by default; the policies that consult them (discount limit, price-override restriction,
  /// credit limit, cost visibility) are off until the owner turns them on.
  DISCOUNT_OVERRIDE: 'discounts.override',
  PRICE_OVERRIDE: 'prices.override',
  CREDIT_LIMIT_OVERRIDE: 'credit.limit_override',
  COST_VIEW: 'products.view_cost',
  /// Unified Inbox: see every conversation (without it, only yours and unassigned ones), hand
  /// conversations between people, and change inbox rules, channels and settings.
  INBOX_MANAGE: 'inbox.manage',
  /// Business Brain: approve and run an action it prepared that messages customers (an offer or a
  /// follow-up). Credit reminders and reorder drafts need the credit / purchases capability instead.
  BRAIN_APPROVE: 'brain.approve',
  /// Helpdesk: open the Helpdesk module at all. Every system role has it; a custom role without it
  /// gets the "no access to Helpdesk" screen. What a person can do inside is the Helpdesk matrix.
  HELPDESK_ACCESS: 'helpdesk.access',
  /// Finance & Accounting: open the books (view), prepare journals/bills/imports (manage), approve
  /// within the Finance Manager thresholds (approve), and change accounting settings, periods and
  /// control accounts or approve above the Owner/Controller threshold (admin).
  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',
  FINANCE_APPROVE: 'finance.approve',
  FINANCE_ADMIN: 'finance.admin',
  /// Payments & Billing: open the module (view; staff see only payments they took), create and
  /// send payment requests (request), retry failed payments and run mandates (recover), execute
  /// approved refunds and captures (refund), work provider disputes (dispute), resolve provider
  /// reconciliation (reconcile), approve above the Owner thresholds (approve), and change routing,
  /// payment policy and see raw provider data (admin). Fees, customer PII and exports are
  /// field-level: without them the value is never sent to the browser.
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_REQUEST: 'payments.request',
  PAYMENTS_RECOVER: 'payments.recover',
  PAYMENTS_REFUND: 'payments.refund',
  PAYMENTS_DISPUTE: 'payments.dispute',
  PAYMENTS_RECONCILE: 'payments.reconcile',
  PAYMENTS_APPROVE: 'payments.approve',
  PAYMENTS_ADMIN: 'payments.admin',
  PAYMENTS_FEES: 'payments.fees',
  PAYMENTS_PII: 'payments.pii',
  PAYMENTS_EXPORT: 'payments.export',
  /// Assets & Maintenance: open the module (view), register assets (create), edit them and bulk
  /// changes (edit), transfer them (transfer), retire/dispose/archive (retire), raise maintenance
  /// requests (request), triage requests and approve/assign/schedule/close work orders (approve),
  /// start and progress work orders including issuing parts (start), complete work orders and record
  /// inspections, service events and downtime (complete), manage preventive plans (pm), see costs
  /// (cost — field-level: without it cost values are never sent), export (export), record meter
  /// readings (reading) and change asset settings (settings).
  ASSETS_VIEW: 'assets.view',
  ASSETS_CREATE: 'assets.create',
  ASSETS_EDIT: 'assets.edit',
  ASSETS_TRANSFER: 'assets.transfer',
  ASSETS_RETIRE: 'assets.retire',
  ASSETS_REQUEST: 'assets.request',
  ASSETS_APPROVE: 'assets.approve',
  ASSETS_START: 'assets.start',
  ASSETS_COMPLETE: 'assets.complete',
  ASSETS_PM: 'assets.pm',
  ASSETS_COST: 'assets.cost',
  ASSETS_EXPORT: 'assets.export',
  ASSETS_READING: 'assets.reading',
  ASSETS_SETTINGS: 'assets.settings',
  /// Field Service: open the module (view), log and triage service requests and send customer
  /// notices (request), create/edit/cancel work orders and ask Orders for quotes / invoices
  /// (workorder), assign, schedule and dispatch jobs and see technician locations (dispatch),
  /// carry out jobs — status, checklist, photos, signature, own labor, part use/return (execute),
  /// reserve and issue parts from Inventory (parts), approve jobs, labor, overtime, warranty
  /// exceptions and close/reopen (approve), manage preventive plans and checklist templates (plan),
  /// service agreements and warranty cases (agreement), see costs, rates and invoice totals
  /// (money), see customer phone/email (pii), export (export) and change settings (settings).
  FIELD_VIEW: 'field.view',
  FIELD_REQUEST: 'field.request',
  FIELD_WORKORDER: 'field.workorder',
  FIELD_DISPATCH: 'field.dispatch',
  FIELD_EXECUTE: 'field.execute',
  FIELD_PARTS: 'field.parts',
  FIELD_APPROVE: 'field.approve',
  FIELD_PLAN: 'field.plan',
  FIELD_AGREEMENT: 'field.agreement',
  FIELD_MONEY: 'field.money',
  FIELD_PII: 'field.pii',
  FIELD_EXPORT: 'field.export',
  FIELD_SETTINGS: 'field.settings',
  /// Contracts: open the module (view), upload documents (upload), edit / move / tag / share /
  /// archive documents (documents), delete documents within retention rules (delete), create and
  /// edit contracts, templates, amendments, renewals and signature requests (manage), decide approval
  /// steps (approve), terminate contracts (terminate), see signature evidence (evidence), manage
  /// compliance documents (compliance), see contract values (value — field-level), see restricted
  /// documents and contracts (restricted), export (export) and change settings (settings).
  CONTRACTS_VIEW: 'contracts.view',
  CONTRACTS_UPLOAD: 'contracts.upload',
  CONTRACTS_DOCUMENTS: 'contracts.documents',
  CONTRACTS_DELETE: 'contracts.delete',
  CONTRACTS_MANAGE: 'contracts.manage',
  CONTRACTS_APPROVE: 'contracts.approve',
  CONTRACTS_TERMINATE: 'contracts.terminate',
  CONTRACTS_EVIDENCE: 'contracts.evidence',
  CONTRACTS_COMPLIANCE: 'contracts.compliance',
  CONTRACTS_VALUE: 'contracts.value',
  CONTRACTS_RESTRICTED: 'contracts.restricted',
  CONTRACTS_EXPORT: 'contracts.export',
  CONTRACTS_SETTINGS: 'contracts.settings',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ALL_CAPABILITIES: Capability[] = Object.values(CAPABILITIES);

const OWNER_AND_MANAGER_CAPABILITIES: Capability[] = [
  CAPABILITIES.CUSTOMERS_ERASE,
  CAPABILITIES.INTEGRATIONS_MANAGE,
  CAPABILITIES.AUTOMATIONS_MANAGE,
  CAPABILITIES.COUPONS_MANAGE,
  CAPABILITIES.VOUCHERS_MANAGE,
  CAPABILITIES.REFERRALS_MANAGE,
  CAPABILITIES.PROFIT_VIEW,
  CAPABILITIES.EXPENSES_MANAGE,
  CAPABILITIES.RETURNS_APPROVE,
  CAPABILITIES.PRICING_MANAGE,
  CAPABILITIES.VIDEO_TESTIMONIALS_MODERATE,
  CAPABILITIES.STAFF_MANAGE_SCHEDULE,
  CAPABILITIES.STOCK_TRANSFERS_APPROVE,
  CAPABILITIES.STOCK_COUNTS_APPLY,
  CAPABILITIES.LABELS_MANAGE,
  CAPABILITIES.OPTIONS_MANAGE,
  CAPABILITIES.LISTINGS_MANAGE,
  CAPABILITIES.SOCIAL_MANAGE,
  CAPABILITIES.COMPETITIVE_MANAGE,
  CAPABILITIES.VOICE_MANAGE,
  CAPABILITIES.DELIVERY_MANAGE,
  CAPABILITIES.ADS_MANAGE,
  CAPABILITIES.BOOKINGS_MANAGE,
  CAPABILITIES.CREDIT_MANAGE,
  CAPABILITIES.PURCHASES_MANAGE,
  CAPABILITIES.BUSINESS_PROFILE_MANAGE,
  CAPABILITIES.MESSAGING_CHANNELS_MANAGE,
  CAPABILITIES.NIGHTLY_CLOSE_MANAGE,
  CAPABILITIES.DASHBOARD_GOALS_MANAGE,
  CAPABILITIES.TAX_RULES_MANAGE,
  CAPABILITIES.ACTIVITY_LOG_VIEW,
  CAPABILITIES.CUSTOMERS_MANAGE,
  CAPABILITIES.CONTENT_PLANNER_MANAGE,
  CAPABILITIES.DISCOUNT_OVERRIDE,
  CAPABILITIES.PRICE_OVERRIDE,
  CAPABILITIES.CREDIT_LIMIT_OVERRIDE,
  CAPABILITIES.COST_VIEW,
  CAPABILITIES.INBOX_MANAGE,
  CAPABILITIES.BRAIN_APPROVE,
  CAPABILITIES.HELPDESK_ACCESS,
  CAPABILITIES.FINANCE_VIEW,
  CAPABILITIES.FINANCE_MANAGE,
  CAPABILITIES.FINANCE_APPROVE,
  CAPABILITIES.PAYMENTS_VIEW,
  CAPABILITIES.PAYMENTS_REQUEST,
  CAPABILITIES.PAYMENTS_RECOVER,
  CAPABILITIES.PAYMENTS_FEES,
  CAPABILITIES.PAYMENTS_PII,
  CAPABILITIES.ASSETS_VIEW,
  CAPABILITIES.ASSETS_CREATE,
  CAPABILITIES.ASSETS_EDIT,
  CAPABILITIES.ASSETS_TRANSFER,
  CAPABILITIES.ASSETS_RETIRE,
  CAPABILITIES.ASSETS_REQUEST,
  CAPABILITIES.ASSETS_APPROVE,
  CAPABILITIES.ASSETS_START,
  CAPABILITIES.ASSETS_COMPLETE,
  CAPABILITIES.ASSETS_PM,
  CAPABILITIES.ASSETS_COST,
  CAPABILITIES.ASSETS_EXPORT,
  CAPABILITIES.ASSETS_READING,
  CAPABILITIES.FIELD_VIEW,
  CAPABILITIES.FIELD_REQUEST,
  CAPABILITIES.FIELD_WORKORDER,
  CAPABILITIES.FIELD_DISPATCH,
  CAPABILITIES.FIELD_EXECUTE,
  CAPABILITIES.FIELD_PARTS,
  CAPABILITIES.FIELD_APPROVE,
  CAPABILITIES.FIELD_PLAN,
  CAPABILITIES.FIELD_AGREEMENT,
  CAPABILITIES.FIELD_MONEY,
  CAPABILITIES.FIELD_PII,
  CAPABILITIES.FIELD_EXPORT,
  CAPABILITIES.CONTRACTS_VIEW,
  CAPABILITIES.CONTRACTS_UPLOAD,
  CAPABILITIES.CONTRACTS_DOCUMENTS,
  CAPABILITIES.CONTRACTS_MANAGE,
  CAPABILITIES.CONTRACTS_APPROVE,
  CAPABILITIES.CONTRACTS_EVIDENCE,
  CAPABILITIES.CONTRACTS_COMPLIANCE,
  CAPABILITIES.CONTRACTS_VALUE,
  CAPABILITIES.CONTRACTS_EXPORT,
];

/**
 * Owner is always the full superset — encoded explicitly here (never derived by enumeration),
 * per the real risk this ticket's own research flagged: a future route gated with a new
 * capability that forgets to add it to owner's set would silently lock the owner out, unlike
 * today's `RolesGuard` where every gate already spells out `Role.owner` explicitly. Manager's
 * set is exactly the historical "owner+manager" gates; staff's holds only module access
 * (Helpdesk), matching the fact that `Role.staff` was never named in any `@Roles()` call.
 */
export const SYSTEM_ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  [Role.owner]: ALL_CAPABILITIES,
  [Role.manager]: OWNER_AND_MANAGER_CAPABILITIES,
  [Role.staff]: [
    CAPABILITIES.HELPDESK_ACCESS,
    CAPABILITIES.PAYMENTS_VIEW,
    CAPABILITIES.PAYMENTS_REQUEST,
    CAPABILITIES.ASSETS_VIEW,
    CAPABILITIES.ASSETS_REQUEST,
    CAPABILITIES.ASSETS_READING,
    CAPABILITIES.FIELD_VIEW,
    CAPABILITIES.FIELD_REQUEST,
    CAPABILITIES.FIELD_EXECUTE,
    CAPABILITIES.CONTRACTS_VIEW,
    CAPABILITIES.CONTRACTS_UPLOAD,
  ],
};
