import { OrderStatus } from '../../generated/prisma';

/** Valid forward transitions (spec §4.3 "flow guard"). Cancelled is reachable from any non-terminal state. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // Draft has no forward transition here by design — converting a draft (UPD-BE-009) decrements
  // stock and takes payment, which `updateStatus()` deliberately never does; it goes through
  // `OrdersService.convertDraft()` instead, not this plain status-flip transition map.
  draft: [],
  pending: [OrderStatus.confirmed, OrderStatus.cancelled],
  confirmed: [OrderStatus.in_progress, OrderStatus.cancelled],
  in_progress: [OrderStatus.completed, OrderStatus.cancelled],
  completed: [],
  cancelled: [],
};

export const ORDER_ERROR_CODES = {
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  CREDIT_REQUIRES_CUSTOMER: 'CREDIT_REQUIRES_CUSTOMER',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
} as const;
