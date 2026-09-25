import { Prisma } from '@prisma/client';
import { KIND_BY_SCANNER_TYPE } from './digitizer-fields';
import {
  DigitizerAnalysis,
  DigitizerEvent,
  DigitizerRow,
  ImportJob,
  ScannerType,
} from './digitizer.types';

/** The columns of `ImportBatch` the digitizer reads — a structural subset so services never depend on the full Prisma type. */
export interface PhotoBatch {
  id: string;
  businessId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scannerType: string | null;
  imageKey: string | null;
  originalName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  pageCount: number | null;
  uploadedById: string | null;
  groupId: string | null;
  stage: string | null;
  stageStartedAt: Date | null;
  failureReason: string | null;
  version: number;
  approvedAt: Date | null;
  approvedById: string | null;
  rows: unknown;
  analysis: unknown;
  importResult: unknown;
  events: unknown;
  versions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export function readRows(batch: Pick<PhotoBatch, 'rows'>): DigitizerRow[] {
  return Array.isArray(batch.rows) ? (batch.rows as DigitizerRow[]) : [];
}

/**
 * Always returns a complete analysis: a batch that is still processing, or one staged before the
 * document workspace existed, has only some of these fields stored.
 */
export function readAnalysis(
  batch: Pick<PhotoBatch, 'analysis' | 'scannerType'>,
): DigitizerAnalysis {
  const stored = (
    batch.analysis && typeof batch.analysis === 'object' ? batch.analysis : {}
  ) as Partial<DigitizerAnalysis>;
  const scannerType = (stored.scannerType ??
    batch.scannerType ??
    'general') as ScannerType;
  return {
    scannerType,
    documentKind:
      stored.documentKind ?? KIND_BY_SCANNER_TYPE[scannerType] ?? 'other',
    typeConfidence: stored.typeConfidence ?? null,
    title: stored.title ?? null,
    handwriting: stored.handwriting ?? null,
    language: stored.language ?? null,
    quality: stored.quality ?? null,
    invoiceNumber: stored.invoiceNumber ?? null,
    supplier: stored.supplier ?? null,
    documentDate: stored.documentDate ?? null,
    currency: stored.currency ?? null,
    lineItems: stored.lineItems ?? [],
    totals: stored.totals ?? null,
    ledger: stored.ledger ?? null,
    dimensions: stored.dimensions ?? null,
    stages: stored.stages ?? [],
    extractionModel: stored.extractionModel ?? '',
  };
}

export function readEvents(
  batch: Pick<PhotoBatch, 'events'>,
): DigitizerEvent[] {
  return Array.isArray(batch.events) ? (batch.events as DigitizerEvent[]) : [];
}

export function readJobs(batch: Pick<PhotoBatch, 'importResult'>): ImportJob[] {
  const r = batch.importResult as { jobs?: ImportJob[] } | null;
  return r && Array.isArray(r.jobs) ? r.jobs : [];
}

export function appendEvent(
  batch: Pick<PhotoBatch, 'events'>,
  actorId: string | null,
  action: string,
  detail: string,
): Prisma.InputJsonValue {
  const next: DigitizerEvent = {
    at: new Date().toISOString(),
    actorId,
    action,
    detail,
  };
  return [...readEvents(batch), next] as unknown as Prisma.InputJsonValue;
}

export const asJson = (v: unknown): Prisma.InputJsonValue =>
  v as Prisma.InputJsonValue;

/** The name a person would give this document: the model's title, else what was uploaded. */
export function documentName(
  batch: Pick<PhotoBatch, 'originalName' | 'id'>,
  analysis: DigitizerAnalysis,
): string {
  return analysis.title ?? batch.originalName ?? `Scan ${batch.id.slice(-6)}`;
}
