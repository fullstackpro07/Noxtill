export const EXPORTS_QUEUE = 'account-zip-export';

export type ExportKind =
  'sales' | 'customers' | 'credit' | 'stock' | 'expenses';

export const EXPORT_KINDS: ExportKind[] = [
  'sales',
  'customers',
  'credit',
  'stock',
  'expenses',
];

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as string[]).includes(value);
}
