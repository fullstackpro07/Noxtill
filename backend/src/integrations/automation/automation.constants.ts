import { IntegrationProvider, WorkflowTriggerKey } from '@prisma/client';

/** Every `IntegrationProvider` that is an automation platform (UPD-BE-074) — single source of truth. */
export const AUTOMATION_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.zapier,
  IntegrationProvider.make,
  IntegrationProvider.n8n,
];

export const OUTBOUND_WEBHOOK_QUEUE = 'outbound-webhook';

/** Header carrying the HMAC-SHA256 signature of the raw request body, hex-encoded. */
export const OUTBOUND_WEBHOOK_SIGNATURE_HEADER = 'X-Noxtill-Signature';

/**
 * `GET /integrations/automation/triggers` (UPD-BE-074) — every real, subscribable trigger, reusing
 * the exact same `WorkflowTriggerKey` taxonomy the Automations engine (UPD-BE-028) already
 * dispatches on, plus one real sample payload shape so a Zapier/Make/n8n user can build their
 * automation without guessing field names.
 */
export const AUTOMATION_TRIGGERS: Array<{
  key: WorkflowTriggerKey;
  label: string;
  samplePayload: Record<string, unknown>;
}> = [
  {
    key: WorkflowTriggerKey.sale,
    label: 'New sale',
    samplePayload: {
      description: 'Sale #1042 — 45.00',
      entityType: 'Order',
      entityId: 'order_123',
      amount: 45,
    },
  },
  {
    key: WorkflowTriggerKey.booking_completed,
    label: 'Booking completed',
    samplePayload: {
      description: 'Appointment completed',
      entityType: 'Appointment',
      entityId: 'appt_123',
    },
  },
  {
    key: WorkflowTriggerKey.review,
    label: 'New review',
    samplePayload: {
      description: '5-star review from Jamie',
      entityType: 'ExternalReview',
      entityId: 'review_123',
    },
  },
  {
    key: WorkflowTriggerKey.low_stock,
    label: 'Product low on stock',
    samplePayload: {
      description: 'Blue T-Shirt is low on stock (3 left)',
      entityType: 'Product',
      entityId: 'product_123',
    },
  },
  {
    key: WorkflowTriggerKey.lapsed_customer,
    label: 'Customer lapsed',
    samplePayload: {
      description: 'Jamie Prospect has not visited in 60 days',
      entityType: 'Customer',
      entityId: 'customer_123',
    },
  },
  {
    key: WorkflowTriggerKey.credit_overdue,
    label: 'Credit overdue',
    samplePayload: {
      description: 'Installment #3 overdue (120.00)',
      entityType: 'Installment',
      entityId: 'installment_123',
      amount: 120,
    },
  },
  {
    key: WorkflowTriggerKey.birthday,
    label: 'Customer birthday',
    samplePayload: {
      description: "Jamie Prospect's birthday is today",
      entityType: 'Customer',
      entityId: 'customer_123',
    },
  },
];
