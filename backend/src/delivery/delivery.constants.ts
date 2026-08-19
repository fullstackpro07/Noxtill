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
} as const;
