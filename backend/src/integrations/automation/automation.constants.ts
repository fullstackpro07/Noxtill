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
  /** When this trigger fires, in plain words (shown in the Integrations Automation tab). */
  description: string;
  samplePayload: Record<string, unknown>;
}> = [
  {
    key: WorkflowTriggerKey.sale,
    label: 'New sale',
    description: 'Fires when a sale is completed',
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
    description: 'Fires when an appointment is marked completed',
    samplePayload: {
      description: 'Appointment completed',
      entityType: 'Appointment',
      entityId: 'appt_123',
    },
  },
  {
    key: WorkflowTriggerKey.review,
    label: 'New review',
    description: 'Fires when a new review arrives',
    samplePayload: {
      description: '5-star review from Jamie',
      entityType: 'ExternalReview',
      entityId: 'review_123',
    },
  },
  {
    key: WorkflowTriggerKey.low_stock,
    label: 'Product low on stock',
    description: 'Fires when a product falls to its low-stock level',
    samplePayload: {
      description: 'Blue T-Shirt is low on stock (3 left)',
      entityType: 'Product',
      entityId: 'product_123',
    },
  },
  {
    key: WorkflowTriggerKey.lapsed_customer,
    label: 'Customer lapsed',
    description: 'Fires when a customer has not visited for a while',
    samplePayload: {
      description: 'Jamie Prospect has not visited in 60 days',
      entityType: 'Customer',
      entityId: 'customer_123',
    },
  },
  {
    key: WorkflowTriggerKey.credit_overdue,
    label: 'Credit overdue',
    description: 'Fires when a credit installment becomes overdue',
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
    description: "Fires on a customer's birthday",
    samplePayload: {
      description: "Jamie Prospect's birthday is today",
      entityType: 'Customer',
      entityId: 'customer_123',
    },
  },
  {
    key: WorkflowTriggerKey.payment_received,
    label: 'Payment received',
    description: 'Fires when a credit payment is recorded',
    samplePayload: {
      description: 'Credit payment from Jamie — 25.00',
      entityType: 'CreditEntry',
      entityId: 'credit_entry_123',
      amount: 25,
    },
  },
  {
    key: WorkflowTriggerKey.complaint_received,
    label: 'Private customer feedback received',
    description: 'Fires when a customer sends private feedback',
    samplePayload: {
      description: 'New 2★ private feedback',
      entityType: 'PrivateFeedback',
      entityId: 'feedback_123',
    },
  },
  {
    key: WorkflowTriggerKey.stock_changed,
    label: 'Stock changed',
    description: "Fires when a product's stock level changes",
    samplePayload: {
      description: 'Purchase: +3 Blue T-Shirt',
      entityType: 'StockMovement',
      entityId: 'stock_movement_123',
      amount: 3,
    },
  },
  {
    key: WorkflowTriggerKey.delivery_created,
    label: 'Delivery created',
    description: 'Fires when a delivery is created',
    samplePayload: {
      description: 'New delivery for order #1042 — waiting for a rider',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_assigned,
    label: 'Rider assigned',
    description: 'Fires when a rider is assigned to a delivery',
    samplePayload: {
      description: 'Rider assigned to order #1042',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_picked_up,
    label: 'Delivery picked up',
    description: 'Fires when a delivery is picked up',
    samplePayload: {
      description: 'Order #1042 picked up',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_en_route,
    label: 'Delivery en route',
    description: 'Fires when a delivery is on its way',
    samplePayload: {
      description: 'Order #1042 on the way',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_delivered,
    label: 'Delivery completed',
    description: 'Fires when a delivery is completed',
    samplePayload: {
      description: 'Order #1042 delivered',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_failed,
    label: 'Delivery failed',
    description: 'Fires when a delivery attempt fails',
    samplePayload: {
      description: 'Order #1042 failed — customer unavailable',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_retried,
    label: 'Delivery retry booked',
    description: 'Fires when a delivery retry is booked',
    samplePayload: {
      description:
        'Order #1042 retry booked (failed before: customer unavailable)',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.commerce_validation,
    label: 'Product validation decision recorded',
    description: 'Fires when a product validation decision is recorded',
    samplePayload: {
      description: 'Product validation approve test: Ceramic pour-over set',
      entityType: 'ProductValidationRun',
      entityId: 'validation_123',
      validationDecision: 'approve_test',
      candidateTitle: 'Ceramic pour-over set',
      candidateRisk: 'low',
      market: 'United States',
      confidence: 82,
      evidenceRecorded: 4,
    },
  },
  {
    key: WorkflowTriggerKey.commerce_listing_draft,
    label: 'Commerce product listing draft changed',
    description: 'Fires when a product listing draft changes',
    samplePayload: {
      description:
        'Listing draft generated for Ceramic pour-over set on shopify',
      entityType: 'CommerceListingDraft',
      entityId: 'listing_draft_123',
    },
  },
  {
    key: WorkflowTriggerKey.seo_issue_detected,
    label: 'High-priority SEO issue detected',
    description: 'Fires when an SEO audit finds a high-priority issue',
    samplePayload: {
      description: 'SEO audit found 2 high-priority issues.',
      entityType: 'SeoAuditRun',
      entityId: 'seo_audit_123',
      auditRunId: 'seo_audit_123',
      siteHost: 'store.example',
      pagesCrawled: 18,
      issuesFound: 7,
      highPriorityIssueCount: 2,
      criticalIssueCount: 1,
      topIssueType: 'missing_title',
    },
  },
  {
    key: WorkflowTriggerKey.commerce_rfq_created,
    label: 'Autonomous Commerce RFQ created',
    description: 'Fires when an RFQ is created',
    samplePayload: {
      description: 'RFQ created for insulated travel mugs',
      entityType: 'CommerceRfq',
      entityId: 'rfq_123',
      rfqId: 'rfq_123',
      rfqStatus: 'draft',
      requirement: 'Source insulated travel mugs',
      market: 'US',
      currency: 'USD',
      supplierCount: 2,
      quoteCount: 0,
    },
  },
  {
    key: WorkflowTriggerKey.commerce_rfq_response_received,
    label: 'Autonomous Commerce supplier quote received or revised',
    description: 'Fires when a supplier quote is received or revised',
    samplePayload: {
      description: 'A supplier quote was recorded for an open RFQ',
      entityType: 'CommerceRfq',
      entityId: 'rfq_123',
      rfqId: 'rfq_123',
      rfqStatus: 'open',
      requirement: 'Source insulated travel mugs',
      market: 'US',
      currency: 'USD',
      supplierCount: 2,
      quoteCount: 1,
    },
  },
  {
    key: WorkflowTriggerKey.commerce_rfq_awarded,
    label: 'Autonomous Commerce RFQ awarded',
    description: 'Fires when an RFQ is awarded',
    samplePayload: {
      description: 'Supplier quote awarded; draft purchase order created',
      entityType: 'CommerceRfq',
      entityId: 'rfq_123',
      rfqId: 'rfq_123',
      rfqStatus: 'awarded',
      requirement: 'Source insulated travel mugs',
      market: 'US',
      currency: 'USD',
      supplierCount: 2,
      quoteCount: 2,
      purchaseOrderId: 'po_123',
    },
  },
  {
    key: WorkflowTriggerKey.commerce_supplier_claim_created,
    label: 'Supplier claim created',
    description: 'Fires when a supplier claim is created',
    samplePayload: {
      description: 'Supplier claim created',
      entityType: 'CommerceSupplierClaim',
      entityId: 'supplier_claim_123',
      amount: 100,
    },
  },
  {
    key: WorkflowTriggerKey.commerce_supplier_claim_settled,
    label: 'Supplier claim settlement recorded',
    description: 'Fires when a supplier claim settlement is recorded',
    samplePayload: {
      description: 'Supplier claim fully recovered',
      entityType: 'CommerceSupplierClaim',
      entityId: 'supplier_claim_123',
      amount: 100,
    },
  },
  {
    key: WorkflowTriggerKey.inbound_webhook,
    label: 'Inbound webhook received',
    description: "Fires when a request reaches this workflow's inbound webhook",
    samplePayload: {
      description: 'Inbound webhook call',
      receivedAt: '2026-10-02T12:00:00.000Z',
      body_orderId: 'A1',
      body_status: 'paid',
    },
  },
  {
    key: WorkflowTriggerKey.sub_workflow,
    label: 'Run by another workflow',
    description: 'Fires when another workflow runs this one',
    samplePayload: {
      description: 'Started by another workflow',
      parentWorkflowId: 'workflow_123',
      parentRunId: 'run_123',
      callDepth: 1,
      parent_amount: 100,
    },
  },
  {
    key: WorkflowTriggerKey.scheduled,
    label: 'Recurring workflow run',
    description: 'Fires on the schedule set for this workflow',
    samplePayload: {
      description: 'Scheduled workflow run',
      scheduledAt: '2026-09-29T09:00:00.000Z',
    },
  },
];
