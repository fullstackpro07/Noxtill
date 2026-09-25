import {
  DESTINATIONS,
  DOCUMENT_KINDS,
  SCANNER_TYPES,
} from './digitizer.constants';

export type ScannerType = (typeof SCANNER_TYPES)[number];
export type DigitizerDestination = (typeof DESTINATIONS)[number];
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Loose on purpose — the field set genuinely differs per destination (see `digitizer-fields.ts`). `null` = the model saw the field but could not read it. */
export type DigitizerRowData = Record<
  string,
  string | number | null | undefined
>;

/** Approximate location of a value on its page, as fractions (0–1) of the page width/height. */
export interface FieldRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DigitizerRowResult {
  status: 'created' | 'updated' | 'skipped' | 'failed';
  recordId?: string;
  error?: string;
  at: string;
  jobId: string;
}

export type DuplicateDecision = 'use_existing' | 'create_new';

export interface DigitizerRow {
  id: string;
  destination: DigitizerDestination;
  data: DigitizerRowData;
  /** Claude's own self-reported 0-1 confidence for this row's extraction. */
  confidence: number;
  /** True once the owner has edited this row during review (UPD-BE-061). */
  corrected: boolean;
  action: 'commit' | 'skip';
  /** The values exactly as the model read them, before learned aliases or any correction. */
  original?: DigitizerRowData;
  /** Per-field 0-1 confidence; `null` means the field was seen but unreadable. Absent key = field not on the document. */
  fieldConfidence?: Record<string, number | null>;
  page?: number;
  /** The row's position on its page as the model reported it (e.g. 41 for "row 41"). */
  sourceRow?: number;
  region?: FieldRegion;
  /** The owner looked at this row and accepted it — required before a low-confidence row can import. */
  reviewed?: boolean;
  duplicateDecision?: DuplicateDecision;
  result?: DigitizerRowResult;
}

export type Legibility = 'none' | 'mild' | 'severe';

export interface QualityAssessment {
  legible: boolean | null;
  blur: Legibility | null;
  glare: Legibility | null;
  shadow: Legibility | null;
  skew: Legibility | null;
  cutOff: boolean | null;
  notes: string | null;
}

export interface LineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  page?: number;
  row?: number;
}

export interface DocumentTotals {
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  printedTotal: number | null;
}

export interface LedgerEntry {
  description: string | null;
  amount: number | null;
  /** `charge` raises what the customer owes; `payment` lowers it. */
  kind: 'charge' | 'payment';
}

export interface LedgerData {
  openingBalance: number | null;
  entries: LedgerEntry[];
  statedClosingBalance: number | null;
}

export interface StageTiming {
  stage: DigitizerStage;
  startedAt: string;
  finishedAt: string | null;
}

export type DigitizerStage =
  'queued' | 'quality' | 'extraction' | 'validation' | 'done';

/** Model-reported facts about the document, plus the pipeline's own timings. Stored on `ImportBatch.analysis`. */
export interface DigitizerAnalysis {
  scannerType: ScannerType;
  documentKind: DocumentKind;
  typeConfidence: number | null;
  title: string | null;
  handwriting: 'printed' | 'handwritten' | 'mixed' | null;
  language: string | null;
  quality: QualityAssessment | null;
  invoiceNumber: string | null;
  supplier: string | null;
  documentDate: string | null;
  currency: string | null;
  lineItems: LineItem[];
  totals: DocumentTotals | null;
  ledger: LedgerData | null;
  /** Pixel size of the uploaded image; null for a PDF. */
  dimensions: { width: number; height: number } | null;
  stages: StageTiming[];
  /** Fields the model returned that this build cannot place (kept so nothing is silently dropped). */
  extractionModel: string;
}

export interface DigitizerEvent {
  at: string;
  actorId: string | null;
  action: string;
  detail: string;
}

export interface ImportJob {
  id: string;
  at: string;
  byId: string | null;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  blocked: number;
  destinations: DigitizerDestination[];
  failures: { rowId: string; reason: string }[];
}

export interface ExtractionResult {
  analysis: Omit<DigitizerAnalysis, 'stages' | 'dimensions' | 'scannerType'>;
  rows: DigitizerRow[];
}

/** Kept for backwards compatibility with earlier clients of `POST /digitizer/upload`. */
export interface DigitizerScanPreview {
  batchId: string;
  status: string;
  scannerType: string | null;
  counts: Record<DigitizerDestination, number>;
  rows: DigitizerRow[];
}
