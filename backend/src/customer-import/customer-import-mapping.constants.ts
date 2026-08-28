export const IMPORT_CANONICAL_FIELDS = ['name', 'phone', 'balance'] as const;

export type ImportCanonicalField = (typeof IMPORT_CANONICAL_FIELDS)[number];

/** Lower-cased, punctuation-stripped file header -> canonical field, for the auto-suggested mapping (UPD-BE-099). */
export const IMPORT_FIELD_ALIASES: Record<string, ImportCanonicalField> = {
  name: 'name',
  fullname: 'name',
  customername: 'name',
  contactname: 'name',
  contact: 'name',
  phone: 'phone',
  mobile: 'phone',
  phonenumber: 'phone',
  mobilenumber: 'phone',
  contactnumber: 'phone',
  cell: 'phone',
  balance: 'balance',
  openingbalance: 'balance',
  opening_balance: 'balance',
  dues: 'balance',
  owed: 'balance',
  amountowed: 'balance',
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

export interface MappedRow {
  name: string;
  phone: string;
  balance?: number;
}

/** Applies a `{fileColumnName: canonicalFieldOrIgnore}` mapping to raw header-keyed rows (UPD-BE-099). */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): MappedRow[] {
  const nameColumn = Object.keys(mapping).find((h) => mapping[h] === 'name');
  const phoneColumn = Object.keys(mapping).find((h) => mapping[h] === 'phone');
  const balanceColumn = Object.keys(mapping).find(
    (h) => mapping[h] === 'balance',
  );

  return rows.map((row) => {
    const balanceRaw = balanceColumn ? row[balanceColumn] : undefined;
    const balance = balanceRaw ? Number(balanceRaw) : undefined;
    return {
      name: (nameColumn ? row[nameColumn] : '')?.trim() ?? '',
      phone: (phoneColumn ? row[phoneColumn] : '')?.trim() ?? '',
      balance: balance && !Number.isNaN(balance) ? balance : undefined,
    };
  });
}
