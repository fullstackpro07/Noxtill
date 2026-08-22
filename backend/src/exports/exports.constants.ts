export const EXPORTS_QUEUE = 'account-zip-export';

export type ExportKind =
  'sales' | 'customers' | 'credit' | 'stock' | 'expenses' | 'products';

export const EXPORT_KINDS: ExportKind[] = [
  'sales',
  'customers',
  'credit',
  'stock',
  'expenses',
  'products',
];

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as string[]).includes(value);
}

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';
export const EXPORT_FORMATS: ExportFormat[] = ['xlsx', 'csv', 'pdf'];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as string[]).includes(value);
}
