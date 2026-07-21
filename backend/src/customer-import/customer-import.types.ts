export interface RawImportRow {
  name: string;
  phone: string;
  balance?: number;
}

export type StagedRowAction = 'create' | 'update' | 'skip';

export interface StagedImportRow {
  rowNumber: number;
  name: string;
  rawPhone: string;
  normalizedPhone?: string;
  balance?: number;
  action: StagedRowAction;
  reason?: string;
  existingCustomerId?: string;
}

export interface ImportPreview {
  batchId: string;
  status: string;
  counts: { create: number; update: number; skip: number; totalCredit: number };
  preview: StagedImportRow[];
  invalid: StagedImportRow[];
}
