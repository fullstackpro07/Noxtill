export const PURCHASE_ORDER_ERROR_CODES = {
  SUPPLIER_NOT_FOUND: 'purchase_order.supplier_not_found',
  PRODUCT_NOT_FOUND: 'purchase_order.product_not_found',
  WRONG_STATUS: 'purchase_order.wrong_status',
  NO_SUPPLIER_PHONE: 'purchase_order.no_supplier_phone',
  ITEM_NOT_FOUND: 'purchase_order.item_not_found',
  OVER_RECEIVE: 'purchase_order.over_receive',
} as const;
