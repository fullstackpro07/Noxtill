export const IMPORT_CANONICAL_FIELDS = [
  'name',
  'kind',
  'category',
  'sku',
  'costPrice',
  'sellingPrice',
  'stockQty',
] as const;

export type ImportCanonicalField = (typeof IMPORT_CANONICAL_FIELDS)[number];

/** Lower-cased, punctuation-stripped file header -> canonical field, for the auto-suggested mapping. */
export const IMPORT_FIELD_ALIASES: Record<string, ImportCanonicalField> = {
  name: 'name',
  productname: 'name',
  itemname: 'name',
  title: 'name',
  kind: 'kind',
  type: 'kind',
  producttype: 'kind',
  category: 'category',
  cat: 'category',
  sku: 'sku',
  code: 'sku',
  productcode: 'sku',
  costprice: 'costPrice',
  cost: 'costPrice',
  unitcost: 'costPrice',
  sellingprice: 'sellingPrice',
  price: 'sellingPrice',
  sellprice: 'sellingPrice',
  retailprice: 'sellingPrice',
  stockqty: 'stockQty',
  stock: 'stockQty',
  qty: 'stockQty',
  quantity: 'stockQty',
};

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function suggestMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();
  for (const header of headers) {
    const field = IMPORT_FIELD_ALIASES[normalizeHeader(header)];
    if (field && !usedFields.has(field)) {
      mapping[header] = field;
      usedFields.add(field);
    } else {
      mapping[header] = 'ignore';
    }
  }
  return mapping;
}
