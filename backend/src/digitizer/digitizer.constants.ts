export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
/** A multi-page PDF is legitimately larger than a single photo. */
export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
/** Claude reads at most 100 PDF pages per request; this is the tighter limit the product enforces. */
export const MAX_PDF_PAGES = 40;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const PDF_MIME_TYPE = 'application/pdf';

/** Every format the digitizer can actually read — nothing here is aspirational (HEIC and Office files are not supported). */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  PDF_MIME_TYPE,
] as const;

/**
 * Claude Haiku 4.5 — the vision model used for extraction. Unlike the older Haiku the shared
 * `VISION_MODEL` points at, it reads PDF documents natively and is far better at handwriting.
 */
export const DIGITIZER_MODEL = 'claude-haiku-4-5-20251001';

export const SCANNER_TYPES = [
  'register',
  'receipt',
  'invoice',
  'menu',
  'product',
  'business_card',
  /// Import Customers, photo path (UPD-BE-099) — a photographed Record Book/ledger page of customer names, phones, and opening balances.
  'customer_list',
  /// A handwritten or printed stock count — updates the stock of products that already exist.
  'inventory_sheet',
  /// A customer credit ledger (opening balance, entries, payments, closing balance).
  'credit_ledger',
  'general',
] as const;

export const DESTINATIONS = [
  'customer',
  'product',
  'expense',
  'supplier',
  'credit_opening_balance',
  'inventory',
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
  inventory_sheet: 'inventory',
  credit_ledger: 'credit_opening_balance',
  // "general" is genuinely mixed content — Claude picks a destination per row instead of one default.
  general: null,
};

/** What the model calls a document, as opposed to which scanner the owner picked. */
export const DOCUMENT_KINDS = [
  'customer_list',
  'purchase_invoice',
  'sales_receipt',
  'inventory_sheet',
  'credit_ledger',
  'booking_register',
  'product_list',
  'business_card',
  'staff_register',
  'other',
  'unknown',
] as const;

/** A row whose confidence reaches this is "high" regardless of the owner's review threshold. */
export const HIGH_CONFIDENCE = 0.85;

/** A `processing` batch older than this was interrupted (server restart, crash) and is failed on next read. */
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

/** A document is flagged as a likely misread when its amount is this many times the typical amount. */
export const OUTLIER_AMOUNT_MULTIPLE = 5;
/** …but only once there are enough real amounts to call something typical. */
export const OUTLIER_MIN_SAMPLES = 5;
/** A stock count this many times the current stock is flagged as a possible misread. */
export const STOCK_JUMP_MULTIPLE = 5;

export const DIGITIZER_ERROR_CODES = {
  UNKNOWN_ROW: 'DIGITIZER_ROW_NOT_FOUND',
  UNKNOWN_BATCH: 'DIGITIZER_SCAN_NOT_FOUND',
  ALREADY_COMMITTED: 'DIGITIZER_ALREADY_COMMITTED',
  EXTRACTION_UNAVAILABLE: 'DIGITIZER_EXTRACTION_UNAVAILABLE',
  TOO_MANY_PAGES: 'DIGITIZER_TOO_MANY_PAGES',
  STILL_PROCESSING: 'DIGITIZER_STILL_PROCESSING',
  ROW_ALREADY_IMPORTED: 'DIGITIZER_ROW_ALREADY_IMPORTED',
  DUPLICATE_DECISION_INVALID: 'DIGITIZER_DUPLICATE_DECISION_INVALID',
  NOTHING_TO_IMPORT: 'DIGITIZER_NOTHING_TO_IMPORT',
  ORIGINAL_UNAVAILABLE: 'DIGITIZER_ORIGINAL_UNAVAILABLE',
  ASSISTANT_UNAVAILABLE: 'DIGITIZER_ASSISTANT_UNAVAILABLE',
} as const;
