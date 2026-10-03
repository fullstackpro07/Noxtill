import { WorkflowTriggerKey } from '@prisma/client';

export interface WorkflowTriggerCatalogEntry {
  key: WorkflowTriggerKey;
  label: string;
  module: string;
  mode: 'event' | 'scheduled';
  fields: string[];
}

const TRIGGER_MODULES: Record<WorkflowTriggerKey, string> = {
  [WorkflowTriggerKey.sale]: 'Orders',
  [WorkflowTriggerKey.booking_completed]: 'Bookings',
  [WorkflowTriggerKey.lapsed_customer]: 'Customers',
  [WorkflowTriggerKey.low_stock]: 'Inventory',
  [WorkflowTriggerKey.review]: 'Reviews',
  [WorkflowTriggerKey.credit_overdue]: 'Credit',
  [WorkflowTriggerKey.birthday]: 'Customers',
  [WorkflowTriggerKey.payment_received]: 'Credit',
  [WorkflowTriggerKey.complaint_received]: 'Reviews',
  [WorkflowTriggerKey.stock_changed]: 'Inventory',
  [WorkflowTriggerKey.delivery_created]: 'Deliveries',
  [WorkflowTriggerKey.delivery_assigned]: 'Deliveries',
  [WorkflowTriggerKey.delivery_picked_up]: 'Deliveries',
  [WorkflowTriggerKey.delivery_en_route]: 'Deliveries',
  [WorkflowTriggerKey.delivery_delivered]: 'Deliveries',
  [WorkflowTriggerKey.delivery_failed]: 'Deliveries',
  [WorkflowTriggerKey.delivery_retried]: 'Deliveries',
  [WorkflowTriggerKey.commerce_validation]: 'Autonomous Commerce',
  [WorkflowTriggerKey.commerce_listing_draft]: 'Autonomous Commerce',
  [WorkflowTriggerKey.seo_issue_detected]: 'SEO Autopilot',
  [WorkflowTriggerKey.commerce_rfq_created]: 'Autonomous Commerce',
  [WorkflowTriggerKey.commerce_rfq_response_received]: 'Autonomous Commerce',
  [WorkflowTriggerKey.commerce_rfq_awarded]: 'Autonomous Commerce',
  [WorkflowTriggerKey.commerce_supplier_claim_created]: 'Autonomous Commerce',
  [WorkflowTriggerKey.commerce_supplier_claim_settled]: 'Autonomous Commerce',
  [WorkflowTriggerKey.scheduled]: 'Automations & Workflows',
  [WorkflowTriggerKey.inbound_webhook]: 'Automations & Workflows',
};

/** Fields are the real values produced by buildTriggerContext for each event type. */
const TRIGGER_METADATA: Record<
  WorkflowTriggerKey,
  Omit<WorkflowTriggerCatalogEntry, 'key' | 'module' | 'mode'>
> = {
  [WorkflowTriggerKey.sale]: {
    label: 'A sale is made',
    fields: [
      'description',
      'amount',
      'customerId',
      'customerName',
      'orderTotal',
      'orderNo',
    ],
  },
  [WorkflowTriggerKey.booking_completed]: {
    label: 'A booking is completed',
    fields: [
      'description',
      'amount',
      'customerId',
      'customerName',
      'serviceName',
    ],
  },
  [WorkflowTriggerKey.lapsed_customer]: {
    label: 'A customer lapses',
    fields: ['description', 'amount', 'customerId', 'customerName'],
  },
  [WorkflowTriggerKey.low_stock]: {
    label: 'Stock runs low',
    fields: ['description', 'amount'],
  },
  [WorkflowTriggerKey.review]: {
    label: 'A review comes in',
    fields: [
      'description',
      'amount',
      'customerId',
      'customerName',
      'reviewRating',
    ],
  },
  [WorkflowTriggerKey.credit_overdue]: {
    label: 'Credit becomes overdue',
    fields: [
      'description',
      'amount',
      'customerId',
      'customerName',
      'installmentAmount',
    ],
  },
  [WorkflowTriggerKey.birthday]: {
    label: "A customer's birthday",
    fields: ['description', 'amount', 'customerId', 'customerName'],
  },
  [WorkflowTriggerKey.payment_received]: {
    label: 'A payment is received',
    fields: [
      'description',
      'amount',
      'customerId',
      'customerName',
      'paymentAmount',
      'paymentMethod',
    ],
  },
  [WorkflowTriggerKey.complaint_received]: {
    label: 'Customer feedback needs attention',
    fields: ['description', 'customerId', 'customerName', 'feedbackRating'],
  },
  [WorkflowTriggerKey.stock_changed]: {
    label: 'Stock changes',
    fields: ['description', 'amount'],
  },
  [WorkflowTriggerKey.delivery_created]: {
    label: 'A delivery is created',
    fields: [
      'description',
      'customerId',
      'customerName',
      'orderNo',
      'deliveryId',
      'deliveryStatus',
    ],
  },
  [WorkflowTriggerKey.delivery_assigned]: {
    label: 'A rider is assigned',
    fields: [
      'description',
      'customerId',
      'customerName',
      'orderNo',
      'deliveryId',
      'deliveryStatus',
    ],
  },
  [WorkflowTriggerKey.delivery_picked_up]: {
    label: 'A delivery is picked up',
    fields: [
      'description',
      'customerId',
      'customerName',
      'orderNo',
      'deliveryId',
      'deliveryStatus',
    ],
  },
  [WorkflowTriggerKey.delivery_en_route]: {
    label: 'A delivery is on the way',
    fields: [
      'description',
      'customerId',
      'customerName',
      'orderNo',
      'deliveryId',
      'deliveryStatus',
    ],
  },
  [WorkflowTriggerKey.delivery_delivered]: {
    label: 'A delivery is completed',
    fields: [
      'description',
      'customerId',
      'customerName',
      'orderNo',
      'deliveryId',
      'deliveryStatus',
    ],
  },
  [WorkflowTriggerKey.delivery_failed]: {
    label: 'A delivery fails',
    fields: [
      'description',
      'customerId',
      'customerName',
      'orderNo',
      'deliveryId',
      'deliveryStatus',
    ],
  },
  [WorkflowTriggerKey.delivery_retried]: {
    label: 'A delivery retry is booked',
    fields: [
      'description',
      'customerId',
      'customerName',
      'orderNo',
      'deliveryId',
      'deliveryStatus',
    ],
  },
  [WorkflowTriggerKey.commerce_validation]: {
    label: 'A product validation decision is recorded',
    fields: [
      'description',
      'validationDecision',
      'candidateTitle',
      'candidateRisk',
      'market',
      'confidence',
      'evidenceRecorded',
    ],
  },
  [WorkflowTriggerKey.commerce_listing_draft]: {
    label: 'A commerce listing draft changes',
    fields: [
      'description',
      'listingDraftId',
      'draftVersion',
      'listingStatus',
      'listingChannel',
      'listingMarket',
      'productId',
      'productName',
    ],
  },
  [WorkflowTriggerKey.commerce_rfq_created]: {
    label: 'An RFQ is created',
    fields: [
      'description',
      'rfqId',
      'rfqStatus',
      'requirement',
      'market',
      'currency',
      'supplierCount',
      'quoteCount',
    ],
  },
  [WorkflowTriggerKey.commerce_rfq_response_received]: {
    label: 'A supplier quote is received or revised',
    fields: [
      'description',
      'rfqId',
      'rfqStatus',
      'requirement',
      'market',
      'currency',
      'supplierCount',
      'quoteCount',
    ],
  },
  [WorkflowTriggerKey.commerce_rfq_awarded]: {
    label: 'An RFQ supplier quote is awarded',
    fields: [
      'description',
      'rfqId',
      'rfqStatus',
      'requirement',
      'market',
      'currency',
      'supplierCount',
      'quoteCount',
      'purchaseOrderId',
    ],
  },
  [WorkflowTriggerKey.commerce_supplier_claim_created]: {
    label: 'A supplier claim is created',
    fields: [
      'description',
      'amount',
      'supplierClaimId',
      'supplierId',
      'supplierName',
      'claimStatus',
      'claimCurrency',
      'claimReference',
      'claimReasonCode',
      'claimRequestedAmount',
      'claimRecoveredAmount',
      'claimOutstandingAmount',
    ],
  },
  [WorkflowTriggerKey.commerce_supplier_claim_settled]: {
    label: 'A supplier claim is fully recovered',
    fields: [
      'description',
      'amount',
      'supplierClaimId',
      'supplierId',
      'supplierName',
      'claimStatus',
      'claimCurrency',
      'claimReference',
      'claimReasonCode',
      'claimRequestedAmount',
      'claimRecoveredAmount',
      'claimOutstandingAmount',
    ],
  },
  [WorkflowTriggerKey.seo_issue_detected]: {
    label: 'A high-priority SEO issue is detected',
    fields: [
      'description',
      'auditRunId',
      'siteHost',
      'pagesCrawled',
      'issuesFound',
      'highPriorityIssueCount',
      'criticalIssueCount',
      'topIssueType',
    ],
  },
  [WorkflowTriggerKey.scheduled]: {
    label: 'On a recurring schedule',
    fields: ['description', 'scheduledAt'],
  },
  [WorkflowTriggerKey.inbound_webhook]: {
    label: 'An external system calls this workflow’s webhook URL',
    // Plus `body_<key>` for each top-level text / number / true-false value in the JSON body.
    fields: ['description', 'receivedAt'],
  },
};

export const WORKFLOW_TRIGGER_CATALOG: WorkflowTriggerCatalogEntry[] =
  Object.values(WorkflowTriggerKey).map((key) => ({
    key,
    module: TRIGGER_MODULES[key],
    mode: key === WorkflowTriggerKey.scheduled ? 'scheduled' : 'event',
    ...TRIGGER_METADATA[key],
  }));
