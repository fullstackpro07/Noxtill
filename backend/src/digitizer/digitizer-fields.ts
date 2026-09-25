import {
  DigitizerDestination,
  DocumentKind,
  ScannerType,
} from './digitizer.types';

export type FieldKind =
  'text' | 'phone' | 'email' | 'money' | 'int' | 'date' | 'sku';

export interface DestinationField {
  field: string;
  label: string;
  required: boolean;
  kind: FieldKind;
  /** Where the value lands in Noxtill, e.g. `Customers.name`. */
  target: string;
}

/**
 * The single source of truth for what each destination accepts. Validation, normalization, the
 * import mapping table and the commit step all read this, so the screen can never claim a mapping
 * the importer does not perform.
 */
export const DESTINATION_FIELDS: Record<
  DigitizerDestination,
  DestinationField[]
> = {
  customer: [
    {
      field: 'name',
      label: 'Name',
      required: true,
      kind: 'text',
      target: 'Customers.name',
    },
    {
      field: 'phone',
      label: 'Phone',
      required: true,
      kind: 'phone',
      target: 'Customers.phone',
    },
    {
      field: 'email',
      label: 'Email',
      required: false,
      kind: 'email',
      target: 'Customers.email',
    },
    {
      field: 'address',
      label: 'Address',
      required: false,
      kind: 'text',
      target: 'Customers.address',
    },
    {
      field: 'notes',
      label: 'Notes',
      required: false,
      kind: 'text',
      target: 'Customers.notes',
    },
    {
      field: 'balance',
      label: 'Opening balance',
      required: false,
      kind: 'money',
      target: 'Credit.openingBalance',
    },
  ],
  product: [
    {
      field: 'name',
      label: 'Product name',
      required: true,
      kind: 'text',
      target: 'Products.name',
    },
    {
      field: 'sku',
      label: 'SKU',
      required: false,
      kind: 'sku',
      target: 'Products.sku',
    },
    {
      field: 'category',
      label: 'Category',
      required: false,
      kind: 'text',
      target: 'Products.category',
    },
    {
      field: 'sellingPrice',
      label: 'Selling price',
      required: false,
      kind: 'money',
      target: 'Products.sellingPrice',
    },
    {
      field: 'costPrice',
      label: 'Cost price',
      required: false,
      kind: 'money',
      target: 'Products.costPrice',
    },
    {
      field: 'stockQty',
      label: 'Opening stock',
      required: false,
      kind: 'int',
      target: 'Products.stockQty',
    },
  ],
  expense: [
    {
      field: 'description',
      label: 'Description',
      required: true,
      kind: 'text',
      target: 'Expenses.description',
    },
    {
      field: 'amount',
      label: 'Amount',
      required: true,
      kind: 'money',
      target: 'Expenses.amount',
    },
    {
      field: 'category',
      label: 'Category',
      required: false,
      kind: 'text',
      target: 'Expenses.category',
    },
    {
      field: 'incurredOn',
      label: 'Date',
      required: true,
      kind: 'date',
      target: 'Expenses.incurredOn',
    },
  ],
  supplier: [
    {
      field: 'name',
      label: 'Name',
      required: true,
      kind: 'text',
      target: 'Suppliers.name',
    },
    {
      field: 'phone',
      label: 'Phone',
      required: false,
      kind: 'phone',
      target: 'Suppliers.phone',
    },
    {
      field: 'email',
      label: 'Email',
      required: false,
      kind: 'email',
      target: 'Suppliers.email',
    },
    {
      field: 'address',
      label: 'Address',
      required: false,
      kind: 'text',
      target: 'Suppliers.address',
    },
  ],
  credit_opening_balance: [
    {
      field: 'customerName',
      label: 'Customer',
      required: true,
      kind: 'text',
      target: 'Customers.name',
    },
    {
      field: 'phone',
      label: 'Phone',
      required: true,
      kind: 'phone',
      target: 'Customers.phone',
    },
    {
      field: 'amount',
      label: 'Amount owed',
      required: true,
      kind: 'money',
      target: 'Credit.entry',
    },
  ],
  inventory: [
    {
      field: 'name',
      label: 'Product name',
      required: false,
      kind: 'text',
      target: 'Products.name (match)',
    },
    {
      field: 'sku',
      label: 'SKU',
      required: false,
      kind: 'sku',
      target: 'Products.sku (match)',
    },
    {
      field: 'countedQty',
      label: 'Counted quantity',
      required: true,
      kind: 'int',
      target: 'Products.stockQty',
    },
  ],
};

export const DESTINATION_LABELS: Record<DigitizerDestination, string> = {
  customer: 'Customers',
  product: 'Products',
  expense: 'Expenses',
  supplier: 'Suppliers',
  credit_opening_balance: 'Credit',
  inventory: 'Inventory',
};

/** Destinations whose data is financial — a discrepancy on these blocks the whole document, not one row. */
export const HIGH_RISK_DESTINATIONS: DigitizerDestination[] = [
  'credit_opening_balance',
];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  customer_list: 'Customer list',
  purchase_invoice: 'Purchase invoice',
  sales_receipt: 'Sales receipt',
  inventory_sheet: 'Inventory sheet',
  credit_ledger: 'Credit ledger',
  booking_register: 'Booking register',
  product_list: 'Product list',
  business_card: 'Business card',
  staff_register: 'Staff register',
  other: 'Other document',
  unknown: 'Unknown',
};

/** The document type each scanner is looking for — used when the model returns no classification of its own. */
export const KIND_BY_SCANNER_TYPE: Record<ScannerType, DocumentKind> = {
  register: 'sales_receipt',
  receipt: 'sales_receipt',
  invoice: 'purchase_invoice',
  menu: 'product_list',
  product: 'product_list',
  business_card: 'business_card',
  customer_list: 'customer_list',
  inventory_sheet: 'inventory_sheet',
  credit_ledger: 'credit_ledger',
  general: 'other',
};

/** The scanner to re-run when the owner overrides the detected document type. Booking and staff registers have no importer. */
export const SCANNER_BY_KIND: Partial<Record<DocumentKind, ScannerType>> = {
  customer_list: 'customer_list',
  purchase_invoice: 'invoice',
  sales_receipt: 'receipt',
  inventory_sheet: 'inventory_sheet',
  credit_ledger: 'credit_ledger',
  product_list: 'product',
  business_card: 'business_card',
  other: 'general',
};

export function fieldsFor(
  destination: DigitizerDestination,
): DestinationField[] {
  return DESTINATION_FIELDS[destination];
}

export function fieldSpec(
  destination: DigitizerDestination,
  field: string,
): DestinationField | undefined {
  return DESTINATION_FIELDS[destination].find((f) => f.field === field);
}
