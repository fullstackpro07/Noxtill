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
  /** Column-mapping (UPD-BE-099) — true for csv/xlsx batches, where `GET .../columns` + `PATCH .../remap` are available. False for photo/txt/docx batches, which have nothing to remap. */
  hasColumnMapping: boolean;
}
