import {
  ActivityEventType,
  WorkflowTriggerKey,
} from '../../../generated/prisma';

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
    case ActivityEventType.low_stock:
      return WorkflowTriggerKey.low_stock;
    case ActivityEventType.customer_lapsed:
      return WorkflowTriggerKey.lapsed_customer;
    case ActivityEventType.credit_overdue:
      return WorkflowTriggerKey.credit_overdue;
    case ActivityEventType.birthday:
      return WorkflowTriggerKey.birthday;
    default:
      return null;
  }
}
