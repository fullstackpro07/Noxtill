/**
 * Prisma model names (PascalCase, as declared in schema.prisma) that carry a
 * `businessId` scalar column and must always be scoped to the caller's tenant.
 *
 * Models without a direct businessId column (e.g. OrderItem, Payment, EmailEvent)
 * are scoped transitively through their parent relation and are intentionally
 * excluded here — the parent lookup already enforces tenancy.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'BusinessUser',
  'Customer',
  'Product',
  'Order',
  'CreditEntry',
  'Appointment',
  'Message',
  'WhatsappWindow',
  'ReviewRequest',
  'PrivateFeedback',
  'ExternalReview',
  'StockMovement',
  'Expense',
  'Attendance',
  'Campaign',
  'Competitor',
  'TrackedKeyword',
  'AuditLog',
  'ImportBatch',
  'Integration',
  'AdCampaign',
  'EmailCampaign',
  'ProductFeedItem',
  'GmbPost',
  'Notification',
  'HealthScoreSnapshot',
  'ActivityEvent',
  'AiInsight',
  'ActionItemState',
  'HeldSale',
  'CashShift',
  'CashMovement',
  'VoiceSaleDraft',
  'Table',
  'Return',
]);

export const CLS_KEY_BUSINESS_ID = 'businessId';
export const CLS_KEY_USER_ID = 'userId';
export const CLS_KEY_ROLE = 'role';
