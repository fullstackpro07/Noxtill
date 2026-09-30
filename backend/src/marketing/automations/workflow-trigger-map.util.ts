import { ActivityEventType, WorkflowTriggerKey } from '@prisma/client';

/**
 * Maps a real `ActivityEvent` write to the automation trigger it represents, or `null` if this
 * event type/description isn't a defined automation trigger. `type: 'booking'` only means
 * "appointment completed" today (the sole real call site, `appointments.service.ts`) — the
 * description check guards against silently misfiring if a differently-described booking event
 * is ever added later without a matching trigger key.
 */
export function mapActivityEventToTriggerKey(
  type: ActivityEventType,
  description: string,
): WorkflowTriggerKey | null {
  switch (type) {
    case ActivityEventType.sale:
      return WorkflowTriggerKey.sale;
    case ActivityEventType.booking:
      return description === 'Appointment completed'
        ? WorkflowTriggerKey.booking_completed
        : null;
    case ActivityEventType.review:
      return WorkflowTriggerKey.review;
    case ActivityEventType.payment:
      return description.startsWith('Wrote off ')
        ? null
        : WorkflowTriggerKey.payment_received;
    case ActivityEventType.complaint:
      return WorkflowTriggerKey.complaint_received;
    case ActivityEventType.stock:
      return mapStockDescription(description);
    case ActivityEventType.low_stock:
      return WorkflowTriggerKey.low_stock;
    case ActivityEventType.customer_lapsed:
      return WorkflowTriggerKey.lapsed_customer;
    case ActivityEventType.credit_overdue:
      return WorkflowTriggerKey.credit_overdue;
    case ActivityEventType.birthday:
      return WorkflowTriggerKey.birthday;
    case ActivityEventType.commerce_validation:
      return WorkflowTriggerKey.commerce_validation;
    case ActivityEventType.commerce_listing_draft:
      return WorkflowTriggerKey.commerce_listing_draft;
    case ActivityEventType.commerce_rfq_created:
      return WorkflowTriggerKey.commerce_rfq_created;
    case ActivityEventType.commerce_rfq_response_received:
      return WorkflowTriggerKey.commerce_rfq_response_received;
    case ActivityEventType.commerce_rfq_awarded:
      return WorkflowTriggerKey.commerce_rfq_awarded;
    case ActivityEventType.commerce_supplier_claim_created:
      return WorkflowTriggerKey.commerce_supplier_claim_created;
    case ActivityEventType.commerce_supplier_claim_settled:
      return WorkflowTriggerKey.commerce_supplier_claim_settled;
    case ActivityEventType.seo_issue_detected:
      return WorkflowTriggerKey.seo_issue_detected;
    case ActivityEventType.delivery:
      return mapDeliveryDescription(description);
    default:
      return null;
  }
}

function mapDeliveryDescription(
  description: string,
): WorkflowTriggerKey | null {
  if (
    description.startsWith('New delivery for order') ||
    description.startsWith('New online delivery order')
  ) {
    return WorkflowTriggerKey.delivery_created;
  }
  if (description.includes(' assigned to order')) {
    return WorkflowTriggerKey.delivery_assigned;
  }
  if (/^Order .* picked up$/.test(description)) {
    return WorkflowTriggerKey.delivery_picked_up;
  }
  if (/^Order .* on the way$/.test(description)) {
    return WorkflowTriggerKey.delivery_en_route;
  }
  if (/^Order .* delivered(?: — proof captured)?$/.test(description)) {
    return WorkflowTriggerKey.delivery_delivered;
  }
  if (/^Order .* failed — /.test(description)) {
    return WorkflowTriggerKey.delivery_failed;
  }
  if (/^Order .* retry booked /.test(description)) {
    return WorkflowTriggerKey.delivery_retried;
  }
  return null;
}

function mapStockDescription(description: string): WorkflowTriggerKey | null {
  if (
    description.startsWith('Purchase: ') ||
    description.startsWith('Wastage: ') ||
    description.startsWith('Stock count applied — ') ||
    /^Purchase order (?:fully|partially) received from /.test(description)
  ) {
    return WorkflowTriggerKey.stock_changed;
  }
  return null;
}
