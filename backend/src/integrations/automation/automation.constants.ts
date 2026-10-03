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
  {
    key: WorkflowTriggerKey.payment_received,
    label: 'Payment received',
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
    samplePayload: {
      description: 'New 2★ private feedback',
      entityType: 'PrivateFeedback',
      entityId: 'feedback_123',
    },
  },
  {
    key: WorkflowTriggerKey.stock_changed,
    label: 'Stock changed',
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
    samplePayload: {
      description: 'New delivery for order #1042 — waiting for a rider',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_assigned,
    label: 'Rider assigned',
    samplePayload: {
      description: 'Rider assigned to order #1042',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_picked_up,
    label: 'Delivery picked up',
    samplePayload: {
      description: 'Order #1042 picked up',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_en_route,
    label: 'Delivery en route',
    samplePayload: {
      description: 'Order #1042 on the way',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_delivered,
    label: 'Delivery completed',
    samplePayload: {
      description: 'Order #1042 delivered',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_failed,
    label: 'Delivery failed',
    samplePayload: {
      description: 'Order #1042 failed — customer unavailable',
      entityType: 'Delivery',
      entityId: 'delivery_123',
    },
  },
  {
    key: WorkflowTriggerKey.delivery_retried,
    label: 'Delivery retry booked',
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
    samplePayload: {
      description: 'Scheduled workflow run',
      scheduledAt: '2026-09-29T09:00:00.000Z',
    },
  },
];
