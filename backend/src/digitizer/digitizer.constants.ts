export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const SCANNER_TYPES = [
  'register',
  'receipt',
  'invoice',
  'menu',
  'product',
  'business_card',
  /// Import Customers, photo path (UPD-BE-099) — a photographed khata/ledger page of customer names, phones, and opening balances.
  'customer_list',
  'general',
] as const;

export const DESTINATIONS = [
  'customer',
  'product',
  'expense',
  'supplier',
  'credit_opening_balance',
] as const;

/** UPD-BE-060: each scanner type's natural default destination — the owner can still change it per row during review. */
export const DEFAULT_DESTINATION_BY_SCANNER_TYPE: Record<
  (typeof SCANNER_TYPES)[number],
  (typeof DESTINATIONS)[number] | null
> = {
  register: 'expense',
  receipt: 'expense',
  invoice: 'expense',
  menu: 'product',
  product: 'product',
  business_card: 'supplier',
  customer_list: 'customer',
  // "general" is genuinely mixed content — Claude picks a destination per row instead of one default.
  general: null,
};

export const DIGITIZER_ERROR_CODES = {
  UNKNOWN_ROW: 'DIGITIZER_ROW_NOT_FOUND',
  UNKNOWN_BATCH: 'DIGITIZER_SCAN_NOT_FOUND',
  ALREADY_COMMITTED: 'DIGITIZER_ALREADY_COMMITTED',
  EXTRACTION_UNAVAILABLE: 'DIGITIZER_EXTRACTION_UNAVAILABLE',
} as const;
