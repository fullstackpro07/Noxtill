export const INVENTORY_ERROR_CODES = {
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
} as const;

export const STOCK_COUNT_ERROR_CODES = {
  ITEM_NOT_FOUND: 'stock_count.item_not_found',
  ALREADY_APPLIED: 'stock_count.already_applied',
} as const;
