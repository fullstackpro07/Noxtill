/**
 * Business policies — the owner-tunable rules Noxtill actually enforces. Every key here has a
 * consumer (named beside it); a policy nothing reads does not belong in this list. A missing key
 * means the default, so existing businesses behave exactly as they did before a key was added.
 */
export type PolicyKind =
  'boolean' | 'number' | 'nullableNumber' | 'time' | 'string';
export type PolicyValue = boolean | number | string | null;

export interface PolicyDef {
  kind: PolicyKind;
  default: PolicyValue;
  min?: number;
  max?: number;
  /** Maximum characters for validated text policies. */
  maxLength?: number;
  /** Whole numbers only. */
  integer?: boolean;
}

export const POLICY_DEFS = {
  // orders.service.ts (createSale)
  'sales.maxDiscountPercent': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100,
  },
  'sales.restrictPriceOverride': { kind: 'boolean', default: false },
  // commerce/commerce-pause.util.ts (channel sync, AI listing generation, subscription renewals)
  'commerce.actionsPaused': { kind: 'boolean', default: false },
  // commerce/commerce-agent-tools.service.ts (which tool risk classes agents may use)
  'commerce.autonomyLevel': {
    kind: 'number',
    default: 1,
    min: 0,
    max: 5,
    integer: true,
  },
  // commerce/commerce-agent-tools.service.ts (write tools must also be on this business allow-list)
  'commerce.agentAllowedWriteTools': {
    kind: 'string',
    default:
      'award_rfq_quote,submit_supplier_claim,create_listing_draft,draft_counteroffer,create_rfq,create_supplier_claim_draft,create_experiment,create_b2b_reorder_draft,publish_listing,reserve_inventory,release_inventory,hold_order,release_order,allocate_preorder,send_customer_message',
    maxLength: 1200,
  },
  // commerce/commerce-specialist-agent.service.ts (registered read-only question tools per run)
  'agents.commerceMaxReadToolCallsPerRun': {
    kind: 'number',
    default: 3,
    min: 1,
    max: 20,
    integer: true,
  },
  // common/agents/specialist-agent-tool-gateway.service.ts (all registered tools per run)
  'agents.maxToolCallsPerRun': {
    kind: 'number',
    default: 20,
    min: 1,
    max: 100,
    integer: true,
  },
  // Optional specialist overrides; null inherits agents.maxToolCallsPerRun.
  'agents.inventoryMaxToolCallsPerRun': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100,
    integer: true,
  },
  'agents.financeMaxToolCallsPerRun': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100,
    integer: true,
  },
  'agents.customerMaxToolCallsPerRun': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100,
    integer: true,
  },
  'agents.seoMaxToolCallsPerRun': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100,
    integer: true,
  },
  'agents.commerceMaxToolCallsPerRun': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100,
    integer: true,
  },
  // Shared cap for material actions proposed from one specialist-agent run.
  'agents.maxMaterialActionsPerRun': {
    kind: 'number',
    default: 10,
    min: 1,
    max: 100,
    integer: true,
  },
  // ai/ai-settings.service.ts (owner-configured advisory for saved queued runs)
  'agents.queuedRunWarningAgeMinutes': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 1440,
    integer: true,
  },
  // Specialist agent runs are manually started and read-only by default. AI explanations have
  // separate per-feature toggles in Business.aiFeatureToggles.
  'agents.inventoryEnabled': { kind: 'boolean', default: true },
  'agents.financeEnabled': { kind: 'boolean', default: true },
  'agents.customerEnabled': { kind: 'boolean', default: true },
  'agents.seoEnabled': { kind: 'boolean', default: true },
  'agents.commerceEnabled': { kind: 'boolean', default: true },
  // Daily specialist reviews are explicit owner opt-ins; existing businesses remain manual-only.
  'agents.inventoryDailyReviewEnabled': { kind: 'boolean', default: false },
  'agents.financeDailyReviewEnabled': { kind: 'boolean', default: false },
  'agents.customerDailyReviewEnabled': { kind: 'boolean', default: false },
  'agents.seoDailyReviewEnabled': { kind: 'boolean', default: false },
  'agents.commerceDailyReviewEnabled': { kind: 'boolean', default: false },
  // Site-audit completion may trigger a read-only SEO workspace review when explicitly enabled.
  'agents.seoAuditEventReviewEnabled': { kind: 'boolean', default: false },
  // A canonical low_stock ActivityEvent may trigger a read-only Inventory review when opted in.
  'agents.inventoryLowStockEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // Applying a canonical physical stock count may trigger a read-only Inventory review.
  'agents.inventoryStockCountEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A fully received canonical purchase order may queue one read-only Inventory review.
  'agents.inventoryPurchaseOrderReceivedEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A confirmed branch transfer receipt may queue isolated, read-only reviews for opted-in branches.
  'agents.inventoryStockTransferReceivedEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A committed wastage movement may queue a read-only Inventory review when opted in.
  'agents.inventoryWastageEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // New lapsed-customer transitions may trigger one daily aggregate Customer review when opted in.
  'agents.customerLapsedEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A newly failed delivery may trigger a privacy-minimized, review-only Customer Agent cue.
  'agents.customerDeliveryFailedEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A newly recorded appointment no-show may trigger a privacy-minimized Customer review.
  'agents.customerNoShowEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A newly cancelled appointment may queue a privacy-minimized Customer review.
  'agents.customerAppointmentCancelledEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A completed POS sale may queue one daily aggregate Customer review when explicitly enabled.
  'agents.customerCompletedSaleEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // customers/customer-profile-intelligence.service.ts (minimum order decline cue)
  'agents.customerRetentionMinimumOrderDecline': {
    kind: 'number',
    default: 1,
    min: 1,
    max: 1000,
    integer: true,
  },
  // Product Validation events may trigger read-only Commerce reviews only when opted in.
  'agents.commerceValidationEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A newly failed canonical delivery may queue a read-only Commerce exception review when opted in.
  'agents.commerceDeliveryFailedEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A current operator-recorded supplier quote may trigger a read-only Commerce review.
  'agents.commerceRfqQuoteEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A recorded experiment decision may queue a read-only Commerce outcome review.
  'agents.commerceExperimentDecisionEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A completed provider reconciliation may queue a read-only Commerce review.
  'agents.commerceReconciliationEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A newly saved Expense may queue a read-only Finance review when opted in.
  'agents.financeExpenseEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A completed canonical Order may queue one aggregate, read-only Finance review per UTC day.
  'agents.financeCompletedOrderEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // An approved canonical Return may queue a read-only Finance review.
  'agents.financeApprovedReturnEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // An approved budget revision may queue a read-only Finance review.
  'agents.financeApprovedBudgetEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // A canonically posted manual journal may queue one read-only Finance review.
  'agents.financePostedJournalEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  // An imported statement may queue a read-only Finance review when opted in.
  'agents.financeStatementImportedEventReviewEnabled': {
    kind: 'boolean',
    default: false,
  },
  'agents.inventoryMaxRequestsPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100_000,
    integer: true,
  },
  'agents.financeMaxRequestsPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100_000,
    integer: true,
  },
  'agents.customerMaxRequestsPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100_000,
    integer: true,
  },
  'agents.seoMaxRequestsPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100_000,
    integer: true,
  },
  'agents.commerceMaxRequestsPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100_000,
    integer: true,
  },
  // AiInfraService reserves each provider request against its specialist run before calling the provider.
  'agents.specialistMaxProviderRequestsPerRun': {
    kind: 'number',
    default: 10,
    min: 1,
    max: 100,
    integer: true,
  },
  // Reject specialist model requests whose requested output could exceed this per-request cap.
  'agents.specialistMaxOutputTokensPerRequest': {
    kind: 'number',
    default: 1024,
    min: 128,
    max: 8192,
    integer: true,
  },
  // Bound the complete serialized specialist request before reserving usage or calling the provider.
  'agents.specialistMaxInputBytesPerRequest': {
    kind: 'number',
    default: 1_048_576,
    min: 4_096,
    max: 16_777_216,
    integer: true,
  },
  // specialist-agents/specialist-agent-retention.service.ts (transient run evidence and payloads)
  'agents.specialistRunRetentionDays': {
    kind: 'nullableNumber',
    default: null,
    min: 30,
    max: 3650,
    integer: true,
  },
  'agents.inventoryMaxSpendUsdPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 0.01,
    max: 100_000,
  },
  'agents.financeMaxSpendUsdPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 0.01,
    max: 100_000,
  },
  'agents.customerMaxSpendUsdPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 0.01,
    max: 100_000,
  },
  'agents.seoMaxSpendUsdPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 0.01,
    max: 100_000,
  },
  'agents.commerceMaxSpendUsdPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 0.01,
    max: 100_000,
  },
  // inventory/inventory-intelligence.service.ts (repeated applied-count review filter)
  'inventory.agentCountVarianceMinimumUnits': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100_000,
    integer: true,
  },
  // inventory/reorder-suggestions.service.ts and inventory-intelligence.service.ts
  'inventory.agentReorderLeadTimeDays': {
    kind: 'number',
    default: 14,
    min: 1,
    max: 365,
    integer: true,
  },
  'sales.requireCustomer': { kind: 'boolean', default: false },
  'sales.allowNegativeStock': { kind: 'boolean', default: false },
  // orders/tables/quotations/public-ordering (computeOrderTotals) and report reconciliation
  'sales.pricesIncludeTax': { kind: 'boolean', default: false },
  // returns.service.ts
  'returns.refundLimit': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100_000_000,
  },
  'returns.refundToOriginalMethod': { kind: 'boolean', default: false },
  // products.service.ts / inventory.service.ts
  'catalog.hideCostFromStaff': { kind: 'boolean', default: false },
  'catalog.defaultLowStockThreshold': {
    kind: 'number',
    default: 5,
    min: 0,
    max: 100_000,
    integer: true,
  },
  // orders.service.ts (credit sales)
  'credit.defaultLimit': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100_000_000,
  },
  // appointments.service.ts / public-booking.service.ts
  'bookings.minAdvanceHours': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 8760,
    integer: true,
  },
  'bookings.maxAdvanceDays': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 730,
    integer: true,
  },
  'bookings.cancellationWindowHours': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 720,
    integer: true,
  },
  'bookings.rescheduleWindowHours': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 720,
    integer: true,
  },
  'bookings.maxDailyBookings': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 10_000,
    integer: true,
  },
  // campaigns.service.ts
  'marketing.frequencyCapMax': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100,
    integer: true,
  },
  'marketing.frequencyCapDays': {
    kind: 'number',
    default: 30,
    min: 1,
    max: 365,
    integer: true,
  },
  'marketing.quietFrom': { kind: 'time', default: null },
  'marketing.quietTo': { kind: 'time', default: null },
  // assistant.service.ts
  'ai.redactContacts': { kind: 'boolean', default: false },
  // digitizer/digitizer-rules.ts (which fields and rows are flagged for review)
  'digitizer.reviewThreshold': {
    kind: 'number',
    default: 0.7,
    min: 0.3,
    max: 0.95,
  },
  // digitizer/digitizer-lookup.service.ts (what counts as an existing match)
  'digitizer.matchOnPhone': { kind: 'boolean', default: true },
  'digitizer.matchOnEmail': { kind: 'boolean', default: true },
  'digitizer.flagNameOnlyMatch': { kind: 'boolean', default: true },
  // digitizer/digitizer-pipeline.service.ts (a photo the model calls unreadable)
  'digitizer.rejectUnreadable': { kind: 'boolean', default: true },
  // marketing/seo-on-page.service.ts (suggest), seo-content.service.ts (generateBrief/generateDraft)
  'seo.aiDraftsEnabled': { kind: 'boolean', default: true },
  // marketing/seo-content.service.ts (opportunities: "improve page" below this rank)
  'seo.improveBelowRank': {
    kind: 'number',
    default: 10,
    min: 1,
    max: 100,
    integer: true,
  },
  // marketing/seo-content.service.ts (refresh queue), seo-workspace/seo-calendar.service.ts
  'seo.refreshDropPositions': {
    kind: 'number',
    default: 5,
    min: 1,
    max: 50,
    integer: true,
  },
  // business-intelligence.service.ts (BI Overview, Opportunity Radar, Simulator)
  'bi.confidenceReviewBelow': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100,
    integer: true,
  },
  'bi.confidenceHighAtOrAbove': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100,
    integer: true,
  },
  'bi.insightImpactAlertThreshold': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100_000_000,
  },
  'bi.simulationPriceChangePercent': {
    kind: 'nullableNumber',
    default: null,
    min: -90,
    max: 500,
  },
  'bi.simulationAdditionalStockUnits': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 1_000_000,
    integer: true,
  },
  'bi.simulationStaffCountChange': {
    kind: 'nullableNumber',
    default: null,
    min: -100,
    max: 100,
    integer: true,
  },
  'bi.simulationMarketingBudgetChange': {
    kind: 'nullableNumber',
    default: null,
    min: -1_000_000,
    max: 1_000_000,
  },
  // marketing/automations/automation-governance.util.ts (workflow editor, version restore, Settings toggle)
  'automations.maxActiveWorkflows': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 1000,
    integer: true,
  },
  // marketing/automations/workflow-trigger.service.ts (monthly workflow run quota)
  'automations.maxRunsPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    integer: true,
  },
  // marketing/automations/jobs/workflow-retention.processor.ts (completed run history cleanup)
  'automations.runRetentionDays': {
    kind: 'nullableNumber',
    default: null,
    min: 30,
    max: 3650,
    integer: true,
  },
  'automations.requireApprovalBeforeCustomerMessages': {
    kind: 'boolean',
    default: false,
  },
  // voice/voice-call.service.ts (inbound automated-receptionist cap; null preserves current behavior)
  'voice.maxInboundCallsPerMonth': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100_000,
    integer: true,
  },
  'voice.monthlySpendCapUsd': {
    kind: 'nullableNumber',
    default: null,
    min: 0.01,
    max: 100_000,
  },
  'voice.bookingsRequireStaffApproval': { kind: 'boolean', default: false },
  'voice.meetingGuestLimit': {
    kind: 'number',
    default: 20,
    min: 1,
    max: 200,
    integer: true,
  },
  // voice/voice-call.service.ts (Twilio hold queue; null keeps the existing immediate fallback)
  'voice.holdQueueMaxWaitSeconds': {
    kind: 'nullableNumber',
    default: null,
    min: 30,
    max: 3600,
    integer: true,
  },
  'voice.holdQueueOverflowToAi': { kind: 'boolean', default: false },
  'voice.holdQueueOverflowToHuman': { kind: 'boolean', default: false },
  // voice/missed-call.service.ts (text a missed caller; on preserves the existing behavior)
  'voice.missedCallTextBack': { kind: 'boolean', default: true },
  // voice/voice-transcript-redaction.service.ts (post-call PII masking; off preserves current behavior)
  'voice.redactTranscripts': { kind: 'boolean', default: false },
  // procurement/contracts (renewal alert job + Supplier Contracts screen)
  'procurement.contractRenewalAlertDays': {
    kind: 'number',
    default: 30,
    min: 1,
    max: 365,
    integer: true,
  },
  // backups (exports/backup.service.ts)
  'backup.enabled': { kind: 'boolean', default: false },
  'backup.retentionDays': {
    kind: 'number',
    default: 30,
    min: 1,
    max: 365,
    integer: true,
  },
} as const satisfies Record<string, PolicyDef>;

export type PolicyKey = keyof typeof POLICY_DEFS;

export function isPolicyKey(key: string): key is PolicyKey {
  return key in POLICY_DEFS;
}
