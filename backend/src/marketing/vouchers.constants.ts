export const VOUCHER_ERROR_CODES = {
  NOT_FOUND: 'voucher.not_found',
  NOT_ACTIVE: 'voucher.not_active',
  EXPIRED: 'voucher.expired',
  DUPLICATE_CODE: 'voucher.duplicate_code',
  INVALID_AMOUNT: 'voucher.invalid_amount',
} as const;

export const VOUCHER_ISSUED_TEMPLATE_KEY = 'voucher_issued';
