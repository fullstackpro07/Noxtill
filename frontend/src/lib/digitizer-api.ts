import { apiFetch } from "@/lib/api-client";

export type DigitizerDestination = "customer" | "product" | "expense" | "supplier" | "credit_opening_balance";
export type DigitizerScannerType =
  | "register"
  | "receipt"
  | "invoice"
  | "menu"
  | "product"
  | "business_card"
  | "customer_list"
  | "general";

export const SCANNER_TYPE_LABELS: Record<DigitizerScannerType, string> = {
  register: "Register tape",
  receipt: "Receipt",
  invoice: "Invoice",
  menu: "Menu / price list",
  product: "Product label",
  business_card: "Business card",
  customer_list: "Customer list / ledger page",
  general: "General (mixed content)",
};

export const DESTINATION_LABELS: Record<DigitizerDestination, string> = {
  customer: "Customers",
  product: "Products",
  expense: "Expenses",
  supplier: "Suppliers",
  credit_opening_balance: "Credit opening balances",
};

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

/** Resume/reload a scan by batch id (e.g. from Scan History) — same shape as upload's response. */
export function fetchDigitizerScan(batchId: string): Promise<DigitizerScanPreview> {
  return apiFetch<DigitizerScanPreview>(`/digitizer/scans/${batchId}/rows`);
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

export interface DigitizerBatchSummary {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  scannerType: DigitizerScannerType | null;
  counts: Record<DigitizerDestination, number>;
  createdAt: string;
}

/** Scan History — last 100 photo-sourced batches, most recent first. */
export function fetchDigitizerHistory(): Promise<DigitizerBatchSummary[]> {
  return apiFetch<DigitizerBatchSummary[]>("/digitizer/history");
}

export interface DigitizerAlias {
  id: string;
  businessId: string;
  rawText: string;
  correctedText: string;
  createdAt: string;
  updatedAt: string;
}

/** Scanner Settings — every correction learned from past reviews, replayed on every future scan. */
export function fetchDigitizerAliases(): Promise<DigitizerAlias[]> {
  return apiFetch<DigitizerAlias[]>("/digitizer/aliases");
}

export function removeDigitizerAlias(id: string): Promise<void> {
  return apiFetch<void>(`/digitizer/aliases/${id}`, { method: "DELETE" });
}
