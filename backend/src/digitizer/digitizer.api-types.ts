import {
  AssessedRow,
  DocIssue,
  DocStatus,
  ImportPlanCounts,
  Reconciliation,
  LineItemAssessment,
  DuplicateInfo,
} from './digitizer-rules';
import {
  DigitizerDestination,
  DigitizerStage,
  DocumentKind,
  DocumentTotals,
  ImportJob,
  LedgerData,
  ScannerType,
} from './digitizer.types';

/** Response shapes for the Digitizer screens. The frontend mirrors these in `lib/digitizer-api.ts`. */

export interface PersonRef {
  id: string;
  name: string;
}

export interface DocumentSummary {
  id: string;
  name: string;
  originalName: string | null;
  kind: DocumentKind;
  kindLabel: string;
  /** How sure the model says it is about the type: high ≥ 0.85, medium ≥ the review threshold, else low. */
  kindConfidence: 'high' | 'medium' | 'low' | null;
  scannerType: ScannerType;
  status: DocStatus;
  stage: DigitizerStage | null;
  stageStartedAt: string | null;
  mimeType: string | null;
  pageCount: number;
  handwriting: 'printed' | 'handwritten' | 'mixed' | null;
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
  plan: ImportPlanCounts;
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

export interface QualityRow {
  key: string;
  label: string;
  state: 'passed' | 'warning' | 'failed' | 'unknown';
  detail: string;
  source: 'file' | 'model';
}

export interface MappingRow {
  destination: DigitizerDestination;
  destinationLabel: string;
  source: string;
  target: string | null;
  status: 'mapped' | 'ignored';
  rows: number;
}

export interface NormalizationRow {
  label: string;
  count: number;
  examples: { from: string; to: string }[];
}

export interface DocumentEvent {
  at: string;
  actor: PersonRef | null;
  action: string;
  detail: string;
}

export interface DocumentVersion {
  version: number;
  createdAt: string;
  rows: number;
  corrected: number;
}

export interface ImportPreview {
  counts: ImportPlanCounts;
  byDestination: {
    destination: DigitizerDestination;
    label: string;
    counts: ImportPlanCounts;
  }[];
  blocked: {
    lowConfidence: number;
    duplicates: number;
    invalid: number;
    reconciliation: number;
    other: number;
  };
  highRisk: boolean;
  canImport: boolean;
  reason: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  rows: AssessedRow[];
  issues: DocIssue[];
  reconciliation: Reconciliation | null;
  quality: {
    overall: 'good' | 'warnings' | 'failed' | 'unknown';
    rows: QualityRow[];
    notes: string | null;
  };
  classification: {
    kind: DocumentKind;
    kindLabel: string;
    confidence: number | null;
    requestedScanner: ScannerType;
    /** Types the owner can re-run extraction as. */
    alternatives: {
      kind: DocumentKind;
      label: string;
      scannerType: ScannerType;
    }[];
    unsupportedKinds: DocumentKind[];
  };
  table: {
    lineItems: LineItemAssessment[];
    totals: DocumentTotals | null;
    ledger: LedgerData | null;
    currency: string;
    editable: boolean;
  };
  normalization: NormalizationRow[];
  mapping: MappingRow[];
  importPreview: ImportPreview;
  jobs: ImportJob[];
  events: DocumentEvent[];
  versions: DocumentVersion[];
  invoice: {
    number: string | null;
    supplier: string | null;
    date: string | null;
  };
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
  discrepancies: {
    documentId: string;
    documentName: string;
    kind: 'invoice' | 'ledger';
    message: string;
  }[];
  stages: { key: string; label: string; meta: string; documents: number }[];
  recent: DocumentSummary[];
  openDocuments: number;
  badges: { queue: number; review: number; import: number };
}

export interface QueueResponse {
  kpis: {
    queued: number;
    processing: number;
    ready: number;
    needsReview: number;
    failed: number;
    cleanRecords: number;
    rowsNeedHuman: number;
  };
  pipeline: { key: DigitizerStage; label: string }[];
  inProgress: (DocumentSummary & { stageIndex: number; elapsedMs: number })[];
  documents: DocumentSummary[];
}

export interface ReviewIssue extends DocIssue {
  documentId: string;
  documentName: string;
}

export interface ReviewDuplicate {
  documentId: string;
  documentName: string;
  rowId: string;
  rowName: string;
  sourceLabel: string;
  decision: 'use_existing' | 'create_new' | null;
  duplicate: DuplicateInfo;
}

export interface ReviewResponse {
  issues: ReviewIssue[];
  duplicates: ReviewDuplicate[];
  documents: {
    id: string;
    name: string;
    needsAttention: number;
    status: DocStatus;
  }[];
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
  level: AssessedRow['level'];
  validation: { label: string; tone: 'green' | 'amber' | 'red' };
  duplicate: { label: string; level: 'high' | 'low' | null };
  sourceLabel: string;
  state: AssessedRow['state'];
  stateReason: string | null;
  row: AssessedRow;
}

export interface StructuredResponse {
  kpis: {
    records: number;
    valid: number;
    warnings: number;
    errors: number;
    duplicates: number;
    ready: number;
    documents: number;
  };
  groups: { destination: DigitizerDestination; label: string; count: number }[];
  rows: StructuredRow[];
  truncated: boolean;
}

export interface ImportJobRow extends ImportJob {
  documentId: string;
  documentName: string;
  destinationLabels: string[];
  status: 'completed' | 'partial' | 'failed';
}

export interface ImportOverviewResponse {
  candidates: {
    id: string;
    name: string;
    status: DocStatus;
    create: number;
    update: number;
    blocked: number;
    approved: boolean;
  }[];
  document: DocumentDetail | null;
  jobs: ImportJobRow[];
}

export interface BatchGroupSummary {
  groupId: string;
  files: number;
  createdAt: string;
  uploadedBy: PersonRef | null;
}

export interface BatchResponse {
  groups: BatchGroupSummary[];
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
    classification: {
      key: string;
      label: string;
      handwriting: string;
      files: number;
    }[];
    gates: { key: string; label: string; passing: number; total: number }[];
    priority: {
      rank: number;
      key: string;
      label: string;
      detail: string;
      count: number;
      tone: 'red' | 'amber' | 'green';
    }[];
    approvable: {
      ids: string[];
      records: number;
      ambiguousDuplicates: number;
      criticalErrors: number;
    };
    individual: number;
    documents: DocumentSummary[];
  } | null;
}

export interface AssistantFinding {
  kind: 'observed' | 'inferred';
  scope: string;
  finding: string;
  evidence: string;
  documentIds: string[];
}

export interface AssistantAnomaly {
  title: string;
  reason: string;
  confidence: 'high' | 'medium';
  basis: string;
  documentId: string;
  documentName: string;
  blocksImport: boolean;
}

export interface AssistantAnswer {
  title: string;
  answer: string;
  rows: [string, string, ('pos' | 'neg' | 'muted')?][];
  bullets: string[];
  note: string;
  primary: { label: string; href: string } | null;
  source: 'data' | 'ai';
}

export interface AssistantOverview {
  prompts: { key: string; label: string; hint: string }[];
  findings: AssistantFinding[];
  anomalies: AssistantAnomaly[];
  documents: number;
}

export interface SettingItem {
  key: string;
  label: string;
  meta: string;
  /** `toggle` and `number` are editable and backed by a real policy; `fact` is read-only and describes how the module works. */
  control: 'toggle' | 'number' | 'fact';
  value: string;
  on?: boolean;
  number?: { value: number; min: number; max: number; step: number };
  policy?: string;
  tone: 'green' | 'amber' | 'red' | 'blue' | 'neutral';
}

export interface SettingsResponse {
  groups: { title: string; icon: string; items: SettingItem[] }[];
  principles: string[];
  aliases: {
    id: string;
    rawText: string;
    correctedText: string;
    updatedAt: string;
  }[];
}
