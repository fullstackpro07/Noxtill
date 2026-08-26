import { apiFetch } from "@/lib/api-client";

export type DigitizerDestination = "customer" | "product" | "expense" | "supplier" | "credit_opening_balance";
export type DigitizerScannerType = "register" | "receipt" | "invoice" | "menu" | "product";

export type DigitizerRowData = Record<string, string | number | undefined>;

export interface DigitizerRow {
  id: string;
  destination: DigitizerDestination;
  data: DigitizerRowData;
  /** Claude's own self-reported 0-1 confidence for this row's extraction — never per-field, per-row. */
  confidence: number;
  corrected: boolean;
  action: "commit" | "skip";
}

export interface DigitizerScanPreview {
  batchId: string;
  status: string;
  scannerType: string | null;
  counts: Record<DigitizerDestination, number>;
  rows: DigitizerRow[];
}

/** POST /digitizer/upload — synchronous: Claude Vision extraction happens inline, rows come back staged (nothing committed yet). */
export function uploadDigitizerScan(file: File, scannerType: DigitizerScannerType): Promise<DigitizerScanPreview> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("scannerType", scannerType);
  return apiFetch<DigitizerScanPreview>("/digitizer/upload", { method: "POST", body: formData });
}

export function updateDigitizerRow(
  rowId: string,
  patch: Partial<Pick<DigitizerRow, "data" | "destination" | "action">>,
): Promise<DigitizerRow> {
  return apiFetch<DigitizerRow>(`/digitizer/rows/${rowId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface DigitizerCommitResult {
  batchId: string;
  created: Record<DigitizerDestination, number>;
  skipped: { rowId: string; reason: string }[];
}

/** POST /imports/:id/commit — routes every reviewed, non-skipped row to its real destination table. */
export function commitDigitizerBatch(batchId: string): Promise<DigitizerCommitResult> {
  return apiFetch<DigitizerCommitResult>(`/imports/${batchId}/commit`, { method: "POST" });
}
