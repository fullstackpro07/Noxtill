export const STOCK_TRANSFER_ERROR_CODES = {
  NOT_FOUND: 'stock_transfer.not_found',
  SAME_BRANCH: 'stock_transfer.same_branch',
  NOT_SAME_GROUP: 'stock_transfer.not_same_group',
  ITEM_NOT_FOUND: 'stock_transfer.item_not_found',
  WRONG_STATUS: 'stock_transfer.wrong_status',
  NOT_CANCELLABLE: 'stock_transfer.not_cancellable',
  NO_SKU: 'stock_transfer.no_sku',
  NO_DEST_MATCH: 'stock_transfer.no_dest_match',
  INSUFFICIENT_STOCK: 'stock_transfer.insufficient_stock',
} as const;
