export const COUPON_ERROR_CODES = {
  NOT_FOUND: 'coupon.not_found',
  INACTIVE: 'coupon.inactive',
  NOT_STARTED: 'coupon.not_started',
  EXPIRED: 'coupon.expired',
  USAGE_LIMIT_REACHED: 'coupon.usage_limit_reached',
  CUSTOMER_USAGE_LIMIT_REACHED: 'coupon.customer_usage_limit_reached',
  MIN_ORDER_NOT_MET: 'coupon.min_order_not_met',
  DUPLICATE_CODE: 'coupon.duplicate_code',
} as const;
