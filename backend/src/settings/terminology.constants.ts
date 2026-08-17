/**
 * Real defaults, not placeholders — a `LabelOverride` row only exists once a business actually
 * renames something. `general` covers WhatsApp copy (via `{{term:key}}`/`{{term:area.key}}` in
 * any template body); `pdf` covers the invoice PDF's line labels.
 */
export const DEFAULT_TERMS: Record<string, Record<string, string>> = {
  general: {
    customer: 'Customer',
    order: 'Order',
    product: 'Product',
    staff: 'Staff',
    branch: 'Branch',
    appointment: 'Appointment',
    invoice: 'Invoice',
  },
  pdf: {
    orderNumber: 'Order #',
    item: 'Item',
    qty: 'Qty',
    price: 'Price',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'Total',
  },
};

export const TERMINOLOGY_ERROR_CODES = {
  UNKNOWN_AREA: 'terminology.unknown_area',
} as const;

/** `{{term:key}}` (implicitly `general`) or `{{term:area.key}}` — never collides with the existing `{{variableName}}` substitution regex (`\w+` doesn't match the colon). */
export const TERM_PATTERN = /\{\{term:(?:([\w-]+)\.)?([\w-]+)\}\}/g;
