import { DeliveryStatus } from '@prisma/client';

/** Redis pub/sub channel a business's live delivery updates broadcast on — same pattern as `activityChannel()`. */
export function deliveryChannel(businessId: string): string {
  return `delivery:${businessId}`;
}

/** Same shape as `APPOINTMENT_STATUS_TRANSITIONS` — a rider can only move a delivery forward (or to `failed`), never skip or reverse a step. */
export const DELIVERY_STATUS_TRANSITIONS: Record<
  DeliveryStatus,
  DeliveryStatus[]
> = {
  unassigned: [DeliveryStatus.assigned],
  assigned: [DeliveryStatus.picked_up, DeliveryStatus.failed],
  picked_up: [DeliveryStatus.en_route, DeliveryStatus.failed],
  en_route: [DeliveryStatus.delivered, DeliveryStatus.failed],
  delivered: [],
  failed: [],
};

/** Statuses that count as "currently on a rider's plate" for auto-assign load-balancing. */
export const ACTIVE_DELIVERY_STATUSES = [
  'assigned',
  'picked_up',
  'en_route',
] as const;

export const MAX_PROOF_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_PROOF_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const DELIVERY_ERROR_CODES = {
  RIDER_NOT_FOUND: 'RIDER_NOT_FOUND',
  DELIVERY_NOT_FOUND: 'DELIVERY_NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  ORDER_ALREADY_HAS_DELIVERY: 'ORDER_ALREADY_HAS_DELIVERY',
  NO_ACTIVE_RIDERS: 'NO_ACTIVE_RIDERS',
  DELIVERY_ALREADY_HAS_PROOF: 'DELIVERY_ALREADY_HAS_PROOF',
  INVALID_STATUS_TRANSITION: 'INVALID_DELIVERY_STATUS_TRANSITION',
  FAILURE_REASON_REQUIRED: 'DELIVERY_FAILURE_REASON_REQUIRED',
} as const;

/** All Deliveries depth fix (UPD-FE-055e) — common reasons for the dropdown; the field itself is free text so "Add custom" always works. */
export const DELIVERY_FAILURE_REASONS = [
  'Customer not available',
  'Wrong or incomplete address',
  'Customer refused delivery',
  'Item damaged in transit',
  'Unable to contact customer',
] as const;

/** On-time-rate depth fix — mirrored by `DeliverySettings.defaultSlaMinutes`'s own column default. */
export const DEFAULT_DELIVERY_SETTINGS = {
  defaultSlaMinutes: 45,
} as const;

/** How many trailing days the on-time-rate trend covers. */
export const ON_TIME_TREND_DAYS = 14;
