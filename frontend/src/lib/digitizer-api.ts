import { apiFetch } from "@/lib/api-client";

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

export type DigitizerDestination = "customer" | "product" | "expense" | "supplier" | "credit_opening_balance" | "inventory";
export type DigitizerScannerType =
  | "register"
  | "receipt"
  | "invoice"
  | "menu"
  | "product"
  | "business_card"
  | "customer_list"
  | "inventory_sheet"
  | "credit_ledger"
  | "general";

export const SCANNER_TYPE_LABELS: Record<DigitizerScannerType, string> = {
  register: "Register tape",
  receipt: "Receipt",
  invoice: "Invoice",
  menu: "Menu / price list",
  product: "Product list",
  business_card: "Business card",
  customer_list: "Customer list / ledger page",
  inventory_sheet: "Inventory sheet",
  credit_ledger: "Credit ledger",
  general: "Other document",
};

export const DESTINATION_LABELS: Record<DigitizerDestination, string> = {
  customer: "Customers",
  product: "Products",
  expense: "Expenses",
  supplier: "Suppliers",
  credit_opening_balance: "Credit",
  inventory: "Inventory",
};

export type DocStatus =
  | "queued"
  | "processing"
  | "failed"
  | "needs_review"
  | "total_mismatch"
  | "unbalanced"
  | "ready"
  | "imported";
export type ConfidenceLevel = "high" | "medium" | "low" | "unreadable";
export type RowState = "ready" | "needs_review" | "blocked" | "skipped" | "imported" | "failed";
export type DocumentKind =
  | "customer_list"
  | "purchase_invoice"
  | "sales_receipt"
  | "inventory_sheet"
  | "credit_ledger"
  | "booking_register"
  | "product_list"
  | "business_card"
  | "staff_register"
  | "other"
  | "unknown";
export type DuplicateDecision = "use_existing" | "create_new";

// ─────────────────────────────────────────────────────────────────────────────
// Response shapes (mirror backend/src/digitizer/digitizer.api-types.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonRef {
  id: string;
  name: string;
}

export interface PlanCounts {
  create: number;
  update: number;
  skip: number;
  blocked: number;
  written: number;
}

export interface DocumentSummary {
  id: string;
  name: string;
  originalName: string | null;
  kind: DocumentKind;
  kindLabel: string;
  kindConfidence: "high" | "medium" | "low" | null;
  scannerType: DigitizerScannerType;
  status: DocStatus;
  stage: "queued" | "quality" | "extraction" | "validation" | "done" | null;
  stageStartedAt: string | null;
  mimeType: string | null;
  pageCount: number;
  handwriting: "printed" | "handwritten" | "mixed" | null;
  language: string | null;
  destinations: { key: DigitizerDestination; label: string }[];
  confidenceSummary: string;
  counts: {
    rows: number;
    ready: number;
    needsReview: number;
    blocked: number;
    skipped: number;
    imported: number;
    failed: number;
    unreadable: number;
    duplicates: number;
  };
  plan: PlanCounts;
  issueCount: number;
  criticalIssueCount: number;
  uploadedAt: string;
  uploadedBy: PersonRef | null;
  version: number;
  approvedAt: string | null;
  approvedBy: PersonRef | null;
  groupId: string | null;
  failureReason: string | null;
  originalRetained: boolean;
  importedRecords: number;
  nextAction: { title: string; why: string };
  evidence: string;
}

export interface AssessedField {
  field: string;
  label: string;
  kind: "text" | "phone" | "email" | "money" | "int" | "date" | "sku";
  required: boolean;
  target: string | null;
  original: string | null;
  value: string | null;
  normalized: string | null;
  normalization: string | null;
  level: ConfidenceLevel;
  confidence: number | null;
  blank: boolean;
  issue: string | null;
}

export interface RowIssue {
  code: string;
  severity: "error" | "warning";
  field?: string;
  message: string;
}

export interface DuplicateInfo {
  level: "high" | "low";
  entity: "Customers" | "Suppliers" | "Products" | "Expenses";
  basis: string;
  phoneMatch: boolean;
  emailMatch: boolean;
  nameMatch: boolean;
  existing: { id: string; name: string; phone: string | null; email: string | null; sku?: string | null };
}

export interface AssessedRow {
  id: string;
  destination: DigitizerDestination;
  destinationLabel: string;
  action: "commit" | "skip";
  reviewed: boolean;
  corrected: boolean;
  page: number | null;
  sourceRow: number | null;
  sourceLabel: string;
  region: { x: number; y: number; w: number; h: number } | null;
  confidence: number;
  level: ConfidenceLevel;
  displayName: string;
  fields: AssessedField[];
  issues: RowIssue[];
  duplicate: DuplicateInfo | null;
  duplicateDecision: DuplicateDecision | null;
  product: { id: string; name: string; sku: string | null; stockQty: number } | null;
  existingCustomer: DuplicateInfo["existing"] | null;
  state: RowState;
  stateReason: string | null;
  blockedBy: "reconciliation" | "error" | "duplicate" | "review" | null;
  plan: "create" | "update" | "skip" | "blocked" | "done";
  result: { status: "created" | "updated" | "skipped" | "failed"; recordId?: string; error?: string; at: string; jobId: string } | null;
}

export interface DocIssue {
  code: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  affected: number;
  rowIds: string[];
  blocks: "document" | "rows" | "none";
  cause: string | null;
}

export interface LineItemAssessment {
  index: number;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  effectiveTotal: number | null;
  missing: string[];
  reconciles: boolean | null;
}

export interface Reconciliation {
  kind: "invoice" | "ledger";
  ok: boolean;
  calculated: number;
  stated: number | null;
  difference: number | null;
  unreadableLines: { index: number; missing: string[] }[];
  components: { label: string; value: number }[];
  lines: LineItemAssessment[];
  message: string;
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

export interface QualityRow {
  key: string;
  label: string;
  state: "passed" | "warning" | "failed" | "unknown";
  detail: string;
  source: "file" | "model";
}

export interface DocumentDetail extends DocumentSummary {
  rows: AssessedRow[];
  issues: DocIssue[];
  reconciliation: Reconciliation | null;
  quality: { overall: "good" | "warnings" | "failed" | "unknown"; rows: QualityRow[]; notes: string | null };
  classification: {
    kind: DocumentKind;
    kindLabel: string;
    confidence: number | null;
    requestedScanner: DigitizerScannerType;
    alternatives: { kind: DocumentKind; label: string; scannerType: DigitizerScannerType }[];
    unsupportedKinds: DocumentKind[];
  };
  table: {
    lineItems: LineItemAssessment[];
    totals: { subtotal: number | null; tax: number | null; discount: number | null; printedTotal: number | null } | null;
    ledger: {
      openingBalance: number | null;
      entries: { description: string | null; amount: number | null; kind: "charge" | "payment" }[];
      statedClosingBalance: number | null;
    } | null;
    currency: string;
    editable: boolean;
  };
  normalization: { label: string; count: number; examples: { from: string; to: string }[] }[];
  mapping: {
    destination: DigitizerDestination;
    destinationLabel: string;
    source: string;
    target: string | null;
    status: "mapped" | "ignored";
    rows: number;
  }[];
  importPreview: {
    counts: PlanCounts;
    byDestination: { destination: DigitizerDestination; label: string; counts: PlanCounts }[];
    blocked: { lowConfidence: number; duplicates: number; invalid: number; reconciliation: number; other: number };
    highRisk: boolean;
    canImport: boolean;
    reason: string | null;
  };
  jobs: ImportJob[];
  events: { at: string; actor: PersonRef | null; action: string; detail: string }[];
  versions: { version: number; createdAt: string; rows: number; corrected: number }[];
  invoice: { number: string | null; supplier: string | null; date: string | null };
  currency: string;
  reviewThreshold: number;
  /** The model that read this document, or null while it has not been read yet. */
  model: string | null;
}

export interface OverviewResponse {
  windowDays: number;
  currency: string;
  kpis: {
    documentsProcessed: number;
    pendingReview: number;
    readyToImport: number;
    imported: number;
    failed: number;
    processing: number;
    queued: number;
    duplicatesDetected: number;
    pagesProcessed: number;
    recordsExtracted: number;
    fieldsExtracted: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    unreadable: number;
    correctedByYou: number;
    recordsWritten: number;
    rowsNeedHuman: number;
    cleanRecords: number;
    learnedAliases: number;
  };
  discrepancies: { documentId: string; documentName: string; kind: "invoice" | "ledger"; message: string }[];
  stages: { key: string; label: string; meta: string; documents: number }[];
  recent: DocumentSummary[];
  openDocuments: number;
  badges: { queue: number; review: number; import: number };
}

export interface QueueResponse {
  kpis: { queued: number; processing: number; ready: number; needsReview: number; failed: number; cleanRecords: number; rowsNeedHuman: number };
  pipeline: { key: string; label: string }[];
  inProgress: (DocumentSummary & { stageIndex: number; elapsedMs: number })[];
  documents: DocumentSummary[];
}

export interface ReviewResponse {
  issues: (DocIssue & { documentId: string; documentName: string })[];
  duplicates: {
    documentId: string;
    documentName: string;
    rowId: string;
    rowName: string;
    sourceLabel: string;
    decision: DuplicateDecision | null;
    duplicate: DuplicateInfo;
  }[];
  documents: { id: string; name: string; needsAttention: number; status: DocStatus }[];
  totals: { issues: number; criticalIssues: number; rowsNeedHuman: number };
}

export interface StructuredRow {
  documentId: string;
  documentName: string;
  rowId: string;
  record: string;
  destination: DigitizerDestination;
  destinationLabel: string;
  fieldLabel: string;
  original: string | null;
  normalized: string | null;
  normalization: string | null;
  level: ConfidenceLevel;
  validation: { label: string; tone: "green" | "amber" | "red" };
  duplicate: { label: string; level: "high" | "low" | null };
  sourceLabel: string;
  state: RowState;
  stateReason: string | null;
  row: AssessedRow;
}

export interface StructuredResponse {
  kpis: { records: number; valid: number; warnings: number; errors: number; duplicates: number; ready: number; documents: number };
  groups: { destination: DigitizerDestination; label: string; count: number }[];
  rows: StructuredRow[];
  truncated: boolean;
}

export interface ImportOverviewResponse {
  candidates: { id: string; name: string; status: DocStatus; create: number; update: number; blocked: number; approved: boolean }[];
  document: DocumentDetail | null;
  jobs: (ImportJob & { documentId: string; documentName: string; destinationLabels: string[]; status: "completed" | "partial" | "failed" })[];
}

export interface BatchResponse {
  groups: { groupId: string; files: number; createdAt: string; uploadedBy: PersonRef | null }[];
  group: {
    groupId: string;
    files: number;
    pages: number;
    processing: number;
    ready: number;
    needsReview: number;
    failed: number;
    imported: number;
    approved: number;
    classification: { key: string; label: string; handwriting: string; files: number }[];
    gates: { key: string; label: string; passing: number; total: number }[];
    priority: { rank: number; key: string; label: string; detail: string; count: number; tone: "red" | "amber" | "green" }[];
    approvable: { ids: string[]; records: number; ambiguousDuplicates: number; criticalErrors: number };
    individual: number;
    documents: DocumentSummary[];
  } | null;
}

export interface DocumentsResponse {
  items: DocumentSummary[];
  total: number;
  kpis: { processed: number; imported: number; recordsWritten: number; failed: number; needsReview: number; retained: number };
  filters: {
    uploaders: PersonRef[];
    kinds: { key: DocumentKind; label: string }[];
    destinations: { key: DigitizerDestination; label: string }[];
  };
  capped: boolean;
  currency: string;
}

export interface AssistantOverview {
  prompts: { key: string; label: string; hint: string }[];
  findings: { kind: "observed" | "inferred"; scope: string; finding: string; evidence: string; documentIds: string[] }[];
  anomalies: {
    title: string;
    reason: string;
    confidence: "high" | "medium";
    basis: string;
    documentId: string;
    documentName: string;
    blocksImport: boolean;
  }[];
  documents: number;
}

export interface AssistantAnswer {
  title: string;
  answer: string;
  rows: [string, string, ("pos" | "neg" | "muted")?][];
  bullets: string[];
  note: string;
  primary: { label: string; href: string } | null;
  source: "data" | "ai";
}

export interface SettingItem {
  key: string;
  label: string;
  meta: string;
  control: "toggle" | "number" | "fact";
  value: string;
  on?: boolean;
  number?: { value: number; min: number; max: number; step: number };
  policy?: string;
  tone: "green" | "amber" | "red" | "blue" | "neutral";
}

export interface SettingsResponse {
  groups: { title: string; icon: string; items: SettingItem[] }[];
  principles: string[];
  aliases: { id: string; rawText: string; correctedText: string; updatedAt: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Requests
// ─────────────────────────────────────────────────────────────────────────────

export interface RowPatch {
  data?: Record<string, string | number | null>;
  destination?: DigitizerDestination;
  action?: "commit" | "skip";
  reviewed?: boolean;
  duplicateDecision?: DuplicateDecision | null;
}

/** POST /digitizer/upload — returns at once with the document queued; extraction continues on the server. */
export function uploadDigitizerDocument(file: File, scannerType: DigitizerScannerType, groupId?: string) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("scannerType", scannerType);
  if (groupId) formData.append("groupId", groupId);
  return apiFetch<DocumentDetail & { reused: boolean }>("/digitizer/upload", { method: "POST", body: formData });
}

export const fetchDigitizerOverview = () => apiFetch<OverviewResponse>("/digitizer/overview");
export const fetchDigitizerQueue = () => apiFetch<QueueResponse>("/digitizer/queue");
export const fetchDigitizerReview = () => apiFetch<ReviewResponse>("/digitizer/review");
export const fetchDigitizerStructured = (params: { destination?: string; documentId?: string } = {}) => {
  const q = new URLSearchParams();
  if (params.destination) q.set("destination", params.destination);
  if (params.documentId) q.set("documentId", params.documentId);
  return apiFetch<StructuredResponse>(`/digitizer/structured${q.size ? `?${q}` : ""}`);
};
export const fetchDigitizerImport = (documentId?: string) =>
  apiFetch<ImportOverviewResponse>(`/digitizer/import${documentId ? `?documentId=${documentId}` : ""}`);
export const fetchDigitizerBatches = (groupId?: string) =>
  apiFetch<BatchResponse>(`/digitizer/batches${groupId ? `?groupId=${groupId}` : ""}`);
export const fetchDigitizerAssistant = () => apiFetch<AssistantOverview>("/digitizer/assistant");
export const askDigitizerAssistant = (input: { key?: string; question?: string }) =>
  apiFetch<AssistantAnswer>("/digitizer/assistant/ask", { method: "POST", body: JSON.stringify(input) });
export const fetchDigitizerSettings = () => apiFetch<SettingsResponse>("/digitizer/settings");
export const updateDigitizerSetting = (key: string, value: boolean | number) =>
  apiFetch<SettingsResponse>("/digitizer/settings", { method: "PATCH", body: JSON.stringify({ key, value }) });

export interface DocumentQuery {
  status?: string;
  kind?: string;
  destination?: string;
  uploaderId?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
export function fetchDigitizerDocuments(query: DocumentQuery = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") q.set(k, String(v));
  return apiFetch<DocumentsResponse>(`/digitizer/documents${q.size ? `?${q}` : ""}`);
}

export const fetchDigitizerDocument = (id: string) => apiFetch<DocumentDetail>(`/digitizer/documents/${id}`);
export const fetchDigitizerOriginal = (id: string) =>
  apiFetch<{ url: string; name: string; mimeType: string | null }>(`/digitizer/documents/${id}/original`);

export const updateDigitizerDocumentRow = (documentId: string, rowId: string, patch: RowPatch) =>
  apiFetch<DocumentDetail>(`/digitizer/documents/${documentId}/rows/${rowId}`, { method: "PATCH", body: JSON.stringify(patch) });
export const acceptAllDigitizerRows = (documentId: string) =>
  apiFetch<DocumentDetail>(`/digitizer/documents/${documentId}/accept-all`, { method: "POST" });
export const updateDigitizerTable = (
  documentId: string,
  patch: {
    lineItems?: { description: string | null; quantity: number | null; unitPrice: number | null; lineTotal: number | null }[];
    totals?: { subtotal?: number | null; tax?: number | null; discount?: number | null; printedTotal?: number | null };
    ledger?: {
      openingBalance?: number | null;
      statedClosingBalance?: number | null;
      entries?: { description: string | null; amount: number | null; kind: "charge" | "payment" }[];
    };
  },
) => apiFetch<DocumentDetail>(`/digitizer/documents/${documentId}/table`, { method: "PATCH", body: JSON.stringify(patch) });
export const reprocessDigitizerDocument = (documentId: string, scannerType?: DigitizerScannerType) =>
  apiFetch<DocumentDetail>(`/digitizer/documents/${documentId}/reprocess`, { method: "POST", body: JSON.stringify(scannerType ? { scannerType } : {}) });
export const deleteDigitizerDocument = (documentId: string) =>
  apiFetch<{ id: string; deleted: boolean; importedRecordsKept: number }>(`/digitizer/documents/${documentId}`, { method: "DELETE" });
export const approveDigitizerDocuments = (ids: string[]) =>
  apiFetch<{ approved: string[]; rejected: { id: string; reason: string }[] }>("/digitizer/documents/approve", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
export const commitDigitizerDocument = (documentId: string) =>
  apiFetch<{ job: ImportJob; document: DocumentDetail }>(`/imports/${documentId}/commit`, { method: "POST" });

export interface DigitizerAlias {
  id: string;
  businessId: string;
  rawText: string;
  correctedText: string;
  createdAt: string;
  updatedAt: string;
}
export const fetchDigitizerAliases = () => apiFetch<DigitizerAlias[]>("/digitizer/aliases");
export const removeDigitizerAlias = (id: string) => apiFetch<void>(`/digitizer/aliases/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// Waiting for extraction
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL: DocStatus[] = ["failed", "needs_review", "total_mismatch", "unbalanced", "ready", "imported"];

/** Polls a document until the pipeline has finished with it (or the wait runs out). */
export async function waitForDigitizerDocument(id: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<DocumentDetail> {
  const deadline = Date.now() + (opts.timeoutMs ?? 3 * 60_000);
  for (;;) {
    const doc = await fetchDigitizerDocument(id);
    if (TERMINAL.includes(doc.status)) return doc;
    if (Date.now() > deadline) throw new Error("Reading this document is taking longer than expected. It will keep processing — check the Processing Queue.");
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1500));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedded scanners (Expenses "Scan receipt", Products "Photograph your price list")
//
// Those dialogs have their own review UI and expect the original synchronous shape: upload → rows
// → edit rows → commit. These adapters give them exactly that on top of the document workspace.
// ─────────────────────────────────────────────────────────────────────────────

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
  counts: Record<string, number>;
  rows: DigitizerRow[];
}

function legacyRow(r: AssessedRow): DigitizerRow {
  const data: DigitizerRowData = {};
  for (const f of r.fields) {
    if (f.value === null) continue;
    data[f.field] = f.kind === "money" || f.kind === "int" ? Number(f.normalized ?? f.value) : f.value;
  }
  return { id: r.id, destination: r.destination, data, confidence: r.confidence, corrected: r.corrected, action: r.action };
}

function legacyPreview(doc: DocumentDetail): DigitizerScanPreview {
  const counts: Record<string, number> = {};
  for (const r of doc.rows) if (r.action === "commit") counts[r.destination] = (counts[r.destination] ?? 0) + 1;
  return { batchId: doc.id, status: doc.status, scannerType: doc.scannerType, counts, rows: doc.rows.map(legacyRow) };
}

/** Upload and wait for the rows — the synchronous contract the embedded scanners were built on. */
export async function uploadDigitizerScan(file: File, scannerType: DigitizerScannerType): Promise<DigitizerScanPreview> {
  const up = await uploadDigitizerDocument(file, scannerType);
  const doc = await waitForDigitizerDocument(up.id);
  if (doc.status === "failed") throw new Error(doc.failureReason ?? "Could not read this photo — please try again.");
  return legacyPreview(doc);
}

export async function updateDigitizerRow(
  rowId: string,
  patch: Partial<Pick<DigitizerRow, "data" | "destination" | "action">>,
): Promise<DigitizerRow> {
  const data = patch.data
    ? Object.fromEntries(Object.entries(patch.data).map(([k, v]) => [k, v === undefined ? null : v]))
    : undefined;
  const doc = await apiFetch<DocumentDetail>(`/digitizer/rows/${rowId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, data }),
  });
  const row = doc.rows.find((r) => r.id === rowId);
  if (!row) throw new Error("Row not found");
  return legacyRow(row);
}

export interface DigitizerCommitResult {
  batchId: string;
  created: Record<string, number>;
  skipped: { rowId: string; reason: string }[];
}

/**
 * Commits what the embedded dialog showed. The dialog has already put every flagged row in front
 * of the person (they can edit or skip it), so pressing Import is their acceptance of the rest —
 * rows that still cannot import (a missing value, a duplicate) come back as `skipped` with the reason.
 */
export async function commitDigitizerBatch(batchId: string): Promise<DigitizerCommitResult> {
  await acceptAllDigitizerRows(batchId);
  const { job, document } = await commitDigitizerDocument(batchId);
  const created: Record<string, number> = {};
  for (const r of document.rows) {
    if (r.result?.jobId === job.id && (r.result.status === "created" || r.result.status === "updated")) {
      created[r.destination] = (created[r.destination] ?? 0) + 1;
    }
  }
  const skipped = [
    ...job.failures,
    ...document.rows
      .filter((r) => r.action === "commit" && (r.state === "blocked" || r.state === "needs_review"))
      .map((r) => ({ rowId: r.id, reason: r.stateReason ?? "Could not be imported" })),
  ];
  return { batchId, created, skipped };
}
