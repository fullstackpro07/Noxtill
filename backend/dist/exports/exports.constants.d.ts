export declare const EXPORTS_QUEUE = "account-zip-export";
export type ExportKind = 'sales' | 'customers' | 'credit' | 'stock' | 'expenses';
export declare const EXPORT_KINDS: ExportKind[];
export declare function isExportKind(value: string): value is ExportKind;
