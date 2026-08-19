import { DESTINATIONS, SCANNER_TYPES } from './digitizer.constants';

export type ScannerType = (typeof SCANNER_TYPES)[number];
export type DigitizerDestination = (typeof DESTINATIONS)[number];

/** Loose on purpose — the field set genuinely differs per destination (see the vision prompts). */
export type DigitizerRowData = Record<string, string | number | undefined>;

export interface DigitizerRow {
  id: string;
  destination: DigitizerDestination;
  data: DigitizerRowData;
  /** Claude's own self-reported 0-1 confidence for this row's extraction. */
  confidence: number;
  /** True once the owner has edited this row during review (UPD-BE-061). */
  corrected: boolean;
  action: 'commit' | 'skip';
}

export interface DigitizerScanPreview {
  batchId: string;
  status: string;
  scannerType: string | null;
  counts: Record<DigitizerDestination, number>;
  rows: DigitizerRow[];
}
