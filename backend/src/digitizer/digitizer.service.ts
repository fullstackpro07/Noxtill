import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ImportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerAssessmentService } from './digitizer-assessment.service';
import {
  DigitizerPipelineService,
  countCommit,
} from './digitizer-pipeline.service';
import { DigitizerViewService } from './digitizer-view.service';
import {
  PhotoBatch,
  appendEvent,
  asJson,
  readAnalysis,
  readRows,
} from './digitizer-document';
import { readImageDimensions, readPdfPageCount } from './digitizer-file-info';
import { fieldSpec } from './digitizer-fields';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  DIGITIZER_ERROR_CODES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_PDF_SIZE_BYTES,
  PDF_MIME_TYPE,
} from './digitizer.constants';
import { DocumentDetail } from './digitizer.api-types';
import {
  DigitizerAnalysis,
  DigitizerRow,
  DigitizerRowData,
  DigitizerDestination,
  DocumentTotals,
  DuplicateDecision,
  LedgerData,
  LineItem,
  ScannerType,
} from './digitizer.types';

export interface DigitizerUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface RowPatch {
  data?: DigitizerRowData;
  destination?: DigitizerDestination;
  action?: 'commit' | 'skip';
  reviewed?: boolean;
  duplicateDecision?: DuplicateDecision | null;
}

export interface TablePatch {
  lineItems?: LineItem[];
  totals?: Partial<DocumentTotals>;
  ledger?: Partial<LedgerData>;
}

/** The real content type of the bytes — a client-sent mimetype is only a fallback. */
async function detectMime(buffer: Buffer, claimed: string): Promise<string> {
  try {
    // file-type is ESM-only; a dynamic import keeps this file usable from CommonJS.
    const { fileTypeFromBuffer } = await import('file-type');
    return (await fileTypeFromBuffer(buffer))?.mime ?? claimed;
  } catch {
    return claimed;
  }
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(-80) || 'scan';
}

/**
 * AI Photo Digitizer write side (UPD-BE-060/061/063): upload → staged rows → the owner's
 * corrections. Extraction runs in the pipeline after the response is sent; importing is a separate,
 * explicit step (`DigitizerImportService`). Nothing here writes to any other module.
 */
@Injectable()
export class DigitizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly aliases: DigitizerAliasService,
    private readonly pipeline: DigitizerPipelineService,
    private readonly assessment: DigitizerAssessmentService,
    private readonly view: DigitizerViewService,
  ) {}

  // ───────────────────────────── upload ─────────────────────────────

  async upload(
    businessId: string,
    actorId: string,
    scannerType: ScannerType,
    file: DigitizerUploadFile,
    groupId?: string,
  ): Promise<DocumentDetail & { reused: boolean }> {
    const mimeType = await detectMime(file.buffer, file.mimetype);
    await validateUploadedFile(
      { buffer: file.buffer, size: file.size, mimetype: mimeType },
      {
        allowedMimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
        maxSizeBytes:
          mimeType === PDF_MIME_TYPE
            ? MAX_PDF_SIZE_BYTES
            : MAX_IMAGE_SIZE_BYTES,
      },
    );

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const existing = (await this.prisma.importBatch.findUnique({
      where: { businessId_contentHash: { businessId, contentHash } },
    })) as unknown as PhotoBatch | null;

    if (existing) {
      // The same file again: a failed scan is retried (that is what "retake" usually means), anything else is just shown.
      if (existing.status === ImportStatus.failed && existing.imageKey) {
        await this.restart(
          existing,
          actorId,
          scannerType,
          'retried',
          `Uploaded again — read as ${scannerType.replace('_', ' ')}`,
          file.buffer,
        );
      }
      return {
        ...(await this.view.detail(businessId, existing.id)),
        reused: existing.status !== ImportStatus.failed,
      };
    }

    const pageCount =
      mimeType === PDF_MIME_TYPE ? await readPdfPageCount(file.buffer) : 1;
    const dimensions =
      mimeType === PDF_MIME_TYPE
        ? null
        : readImageDimensions(file.buffer, mimeType);
    const imageKey = `digitizer/${businessId}/${Date.now()}-${safeName(file.originalname)}`;
    await this.s3.upload(imageKey, file.buffer, mimeType);

    const now = new Date();
    const analysis: Partial<DigitizerAnalysis> = {
      scannerType,
      dimensions,
      stages: [
        { stage: 'queued', startedAt: now.toISOString(), finishedAt: null },
      ],
    };
    const batch = await this.prisma.importBatch.create({
      data: {
        businessId,
        source: 'photo',
        status: ImportStatus.processing,
        scannerType,
        imageKey,
        contentHash,
        originalName: file.originalname.slice(0, 255),
        mimeType,
        fileSize: file.size,
        pageCount,
        uploadedById: actorId,
        groupId: groupId ?? null,
        stage: 'queued',
        stageStartedAt: now,
        analysis: asJson(analysis),
        events: asJson([
          {
            at: now.toISOString(),
            actorId,
            action: 'uploaded',
            detail: `${file.originalname} · ${mimeType === PDF_MIME_TYPE ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : dimensions ? `${dimensions.width} × ${dimensions.height} px` : 'image'} · ${Math.round(file.size / 1024)} KB`,
          },
        ]),
        counts: {},
        rows: [],
      },
    });

    this.pipeline.schedule(batch.id, file.buffer);
    return { ...(await this.view.detail(businessId, batch.id)), reused: false };
  }

  // ───────────────────────────── reading ─────────────────────────────

  detail(businessId: string, id: string): Promise<DocumentDetail> {
    return this.view.detail(businessId, id);
  }

  async originalUrl(businessId: string, id: string) {
    const batch = await this.mustFind(businessId, id);
    if (!batch.imageKey) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ORIGINAL_UNAVAILABLE,
        'The original file is no longer stored.',
        HttpStatus.GONE,
      );
    }
    return {
      url: await this.s3.getSignedDownloadUrl(batch.imageKey),
      name: batch.originalName ?? 'original',
      mimeType: batch.mimeType,
    };
  }

  // ───────────────────────────── corrections ─────────────────────────────

  /** Finds the document containing a row when the caller only knows the row id (the original endpoint's shape). */
  private async findByRow(
    businessId: string,
    rowId: string,
  ): Promise<PhotoBatch> {
    const batches = (await this.prisma.importBatch.findMany({
      where: {
        businessId,
        source: 'photo',
        status: { in: [ImportStatus.pending] },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })) as unknown as PhotoBatch[];
    const hit = batches.find((b) => readRows(b).some((r) => r.id === rowId));
    if (!hit) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.UNKNOWN_ROW,
        'Digitizer row not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return hit;
  }

  async updateRow(
    businessId: string,
    actorId: string,
    rowId: string,
    patch: RowPatch,
    documentId?: string,
  ): Promise<DocumentDetail> {
    const batch = documentId
      ? await this.mustFind(businessId, documentId)
      : await this.findByRow(businessId, rowId);
    this.assertEditable(batch);

    const rows = readRows(batch);
    const index = rows.findIndex((r) => r.id === rowId);
    if (index === -1) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.UNKNOWN_ROW,
        'Digitizer row not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const before = rows[index];
    if (
      before.result &&
      (before.result.status === 'created' || before.result.status === 'updated')
    ) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ROW_ALREADY_IMPORTED,
        'This row has already been imported and can no longer be edited.',
        HttpStatus.CONFLICT,
      );
    }

    const rules = await this.assessment.rulesFor(businessId);
    if (patch.duplicateDecision === 'create_new') {
      const a = await this.assessment.assessOne(businessId, batch, rules);
      const row = a.assessment.rows.find((r) => r.id === rowId);
      if (row?.duplicate?.entity === 'Customers' && row.duplicate.phoneMatch) {
        throw new AppException(
          DIGITIZER_ERROR_CODES.DUPLICATE_DECISION_INVALID,
          'A customer with this phone number already exists, and phone numbers are unique. Use the existing customer, or correct the phone number.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    const changes: string[] = [];
    const data: DigitizerRowData = { ...before.data };
    const fieldConfidence: Record<string, number | null> = {
      ...(before.fieldConfidence ?? {}),
    };
    if (patch.data) {
      for (const [field, next] of Object.entries(patch.data)) {
        const prev = data[field] ?? null;
        const value =
          typeof next === 'string'
            ? next.trim() === ''
              ? null
              : next.trim()
            : (next ?? null);
        if (prev === value) continue;
        data[field] = value;
        // A value the owner typed is certain — it no longer carries the model's doubt.
        if (value !== null) fieldConfidence[field] = 1;
        changes.push(`${field}: ${prev ?? 'blank'} → ${value ?? 'blank'}`);
        await this.learn(businessId, before, field, value);
      }
    }

    const after: DigitizerRow = {
      ...before,
      data,
      ...(Object.keys(fieldConfidence).length ? { fieldConfidence } : {}),
      destination: patch.destination ?? before.destination,
      action: patch.action ?? before.action,
      corrected: before.corrected || changes.length > 0,
      // Editing a value, or explicitly accepting the row, is the owner looking at it.
      reviewed: patch.reviewed ?? (changes.length > 0 ? true : before.reviewed),
      duplicateDecision:
        patch.duplicateDecision === undefined
          ? before.duplicateDecision
          : (patch.duplicateDecision ?? undefined),
      // `original` is the model's own read — kept forever so the correction is visibly the owner's.
      original: before.original ?? before.data,
    };
    if (patch.destination && patch.destination !== before.destination)
      changes.push(`destination: ${before.destination} → ${patch.destination}`);
    if (patch.action && patch.action !== before.action)
      changes.push(patch.action === 'skip' ? 'skipped' : 'restored');
    if (
      patch.reviewed === true &&
      before.reviewed !== true &&
      changes.length === 0
    )
      changes.push('accepted');
    if (
      patch.duplicateDecision !== undefined &&
      patch.duplicateDecision !== (before.duplicateDecision ?? null)
    ) {
      changes.push(
        `duplicate decision: ${patch.duplicateDecision ?? 'cleared'}`,
      );
    }
    rows[index] = after;

    await this.saveRows(
      batch,
      actorId,
      rows,
      changes.length ? 'corrected' : null,
      `Row ${after.page ? `p${after.page} ` : ''}${after.sourceRow ? `r${after.sourceRow}` : rowId.slice(0, 6)} — ${changes.join('; ')}`,
    );
    return this.view.detail(businessId, batch.id);
  }

  /** Marks every row that only needs a look (low confidence, warnings) as reviewed — never rows with errors, duplicates or a reconciliation block. */
  async acceptAll(
    businessId: string,
    actorId: string,
    id: string,
  ): Promise<DocumentDetail> {
    const batch = await this.mustFind(businessId, id);
    this.assertEditable(batch);
    const a = await this.assessment.assessOne(businessId, batch);
    const acceptable = new Set(
      a.assessment.rows
        .filter((r) => r.state === 'needs_review')
        .map((r) => r.id),
    );
    if (acceptable.size === 0) return this.view.detail(businessId, id);

    const rows = readRows(batch).map((r) =>
      acceptable.has(r.id) ? { ...r, reviewed: true } : r,
    );
    await this.saveRows(
      batch,
      actorId,
      rows,
      'accepted',
      `Accepted ${acceptable.size} row${acceptable.size === 1 ? '' : 's'} read with low confidence`,
    );
    return this.view.detail(businessId, id);
  }

  async updateTable(
    businessId: string,
    actorId: string,
    id: string,
    patch: TablePatch,
  ): Promise<DocumentDetail> {
    const batch = await this.mustFind(businessId, id);
    this.assertEditable(batch);
    const analysis = readAnalysis(batch);
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;

    const next: DigitizerAnalysis = { ...analysis };
    const changes: string[] = [];
    if (patch.lineItems) {
      next.lineItems = patch.lineItems.slice(0, 500).map((l) => ({
        description:
          typeof l.description === 'string' && l.description.trim()
            ? l.description.trim().slice(0, 200)
            : null,
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        lineTotal: num(l.lineTotal),
        ...(l.page ? { page: l.page } : {}),
        ...(l.row ? { row: l.row } : {}),
      }));
      changes.push(`${next.lineItems.length} line items`);
    }
    if (patch.totals) {
      const t = analysis.totals ?? {
        subtotal: null,
        tax: null,
        discount: null,
        printedTotal: null,
      };
      next.totals = {
        subtotal:
          'subtotal' in patch.totals ? num(patch.totals.subtotal) : t.subtotal,
        tax: 'tax' in patch.totals ? num(patch.totals.tax) : t.tax,
        discount:
          'discount' in patch.totals ? num(patch.totals.discount) : t.discount,
        printedTotal:
          'printedTotal' in patch.totals
            ? num(patch.totals.printedTotal)
            : t.printedTotal,
      };
      changes.push('totals');
    }
    if (patch.ledger) {
      const l = analysis.ledger ?? {
        openingBalance: null,
        entries: [],
        statedClosingBalance: null,
      };
      next.ledger = {
        openingBalance:
          'openingBalance' in patch.ledger
            ? num(patch.ledger.openingBalance)
            : l.openingBalance,
        statedClosingBalance:
          'statedClosingBalance' in patch.ledger
            ? num(patch.ledger.statedClosingBalance)
            : l.statedClosingBalance,
        entries: patch.ledger.entries
          ? patch.ledger.entries.slice(0, 1000).map((e) => ({
              description:
                typeof e.description === 'string' && e.description.trim()
                  ? e.description.trim().slice(0, 200)
                  : null,
              amount: num(e.amount),
              kind: e.kind === 'payment' ? 'payment' : 'charge',
            }))
          : l.entries,
      };
      changes.push('ledger');
    }
    if (!changes.length) return this.view.detail(businessId, id);

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        analysis: asJson(next),
        approvedAt: null,
        approvedById: null,
        events: appendEvent(
          batch,
          actorId,
          'table_corrected',
          `Figures corrected by hand: ${changes.join(', ')}`,
        ),
      },
    });
    return this.view.detail(businessId, id);
  }

  // ───────────────────────────── reprocess / approve / delete ─────────────────────────────

  async reprocess(
    businessId: string,
    actorId: string,
    id: string,
    scannerType?: ScannerType,
  ): Promise<DocumentDetail> {
    const batch = await this.mustFind(businessId, id);
    if (batch.status === ImportStatus.processing) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.STILL_PROCESSING,
        'This document is already being read.',
        HttpStatus.CONFLICT,
      );
    }
    if (
      readRows(batch).some(
        (r) =>
          r.result &&
          (r.result.status === 'created' || r.result.status === 'updated'),
      )
    ) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ROW_ALREADY_IMPORTED,
        'Some rows from this document were already imported, so it cannot be read again. Upload the photo again to start a fresh scan.',
        HttpStatus.CONFLICT,
      );
    }
    if (!batch.imageKey) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ORIGINAL_UNAVAILABLE,
        'The original file is no longer stored.',
        HttpStatus.GONE,
      );
    }
    const target = scannerType ?? readAnalysis(batch).scannerType;
    await this.restart(
      batch,
      actorId,
      target,
      'reprocessed',
      `Reprocessed as ${target.replace('_', ' ')} — version ${batch.version + 1}`,
    );
    return this.view.detail(businessId, id);
  }

  /** Snapshots the current extraction as a version, then queues a fresh read of the stored original. */
  private async restart(
    batch: PhotoBatch,
    actorId: string,
    scannerType: ScannerType,
    action: string,
    detail: string,
    buffer?: Buffer,
  ): Promise<void> {
    const analysis = readAnalysis(batch);
    const snapshot = {
      version: batch.version,
      createdAt: new Date().toISOString(),
      rows: readRows(batch),
      analysis,
    };
    const versions = [
      ...(Array.isArray(batch.versions) ? (batch.versions as unknown[]) : []),
      snapshot,
    ];
    const now = new Date();
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: ImportStatus.processing,
        stage: 'queued',
        stageStartedAt: now,
        failureReason: null,
        version: batch.version + 1,
        scannerType,
        approvedAt: null,
        approvedById: null,
        versions: asJson(versions),
        analysis: asJson({
          ...analysis,
          scannerType,
          stages: [
            { stage: 'queued', startedAt: now.toISOString(), finishedAt: null },
          ],
        }),
        events: appendEvent(batch, actorId, action, detail),
      },
    });
    this.pipeline.schedule(batch.id, buffer);
  }

  async approve(businessId: string, actorId: string, ids: string[]) {
    const approved: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const rules = await this.assessment.rulesFor(businessId);
    for (const id of [...new Set(ids)].slice(0, 200)) {
      const batch = (await this.prisma.importBatch.findFirst({
        where: { id, businessId, source: 'photo' },
      })) as unknown as PhotoBatch | null;
      if (!batch) {
        rejected.push({ id, reason: 'Document not found' });
        continue;
      }
      const a = await this.assessment.assessOne(businessId, batch, rules);
      const { status, counts, issues } = a.assessment;
      const dup = a.assessment.rows.some((r) => r.blockedBy === 'duplicate');
      let reason: string | null = null;
      if (status !== 'ready')
        reason = `Not clean — status is ${status.replace('_', ' ')}`;
      else if (
        counts.blocked > 0 ||
        counts.failed > 0 ||
        counts.needsReview > 0
      )
        reason = 'Has rows that still need review';
      else if (issues.some((i) => i.severity === 'critical'))
        reason = 'Has a critical error';
      else if (dup) reason = 'Has an ambiguous duplicate';
      else if (batch.approvedAt) reason = 'Already approved';
      if (reason) {
        rejected.push({ id, reason });
        continue;
      }
      await this.prisma.importBatch.update({
        where: { id },
        data: {
          approvedAt: new Date(),
          approvedById: actorId,
          events: appendEvent(
            batch,
            actorId,
            'approved',
            'Approved for import (approval only — nothing has been written)',
          ),
        },
      });
      approved.push(id);
    }
    return { approved, rejected };
  }

  async remove(businessId: string, actorId: string, id: string) {
    const batch = await this.mustFind(businessId, id);
    if (batch.imageKey) {
      // Expenses created from this scan point at the photo as their receipt — unlink them before it goes.
      await this.prisma.expense.updateMany({
        where: { businessId, receiptKey: batch.imageKey },
        data: { receiptKey: null },
      });
      await this.s3.delete(batch.imageKey).catch(() => undefined);
    }
    await this.prisma.importBatch.delete({ where: { id: batch.id } });
    return {
      id: batch.id,
      deleted: true,
      deletedBy: actorId,
      at: new Date().toISOString(),
      importedRecordsKept: readRows(batch).filter(
        (r) =>
          r.result &&
          (r.result.status === 'created' || r.result.status === 'updated'),
      ).length,
    };
  }

  // ───────────────────────────── internals ─────────────────────────────

  private async mustFind(businessId: string, id: string): Promise<PhotoBatch> {
    const batch = (await this.prisma.importBatch.findFirst({
      where: { id, businessId, source: 'photo' },
    })) as unknown as PhotoBatch | null;
    if (!batch) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.UNKNOWN_BATCH,
        'Digitizer scan not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return batch;
  }

  private assertEditable(batch: PhotoBatch) {
    if (batch.status === ImportStatus.processing) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.STILL_PROCESSING,
        'This document is still being read.',
        HttpStatus.CONFLICT,
      );
    }
    if (batch.status === ImportStatus.completed) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ALREADY_COMMITTED,
        'This scan has already been imported',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async saveRows(
    batch: PhotoBatch,
    actorId: string,
    rows: DigitizerRow[],
    action: string | null,
    detail: string,
  ) {
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        rows: asJson(rows),
        counts: asJson(countCommit(rows)),
        // Any edit invalidates an earlier approval — what was approved is no longer what is there.
        approvedAt: null,
        approvedById: null,
        ...(action
          ? { events: appendEvent(batch, actorId, action, detail) }
          : {}),
      },
    });
  }

  /**
   * Learns from a corrected free-text field, not from phones, emails, amounts or dates — a rule
   * like "0300-1234567 → +92300…" replayed onto every future scan would corrupt unrelated values.
   * What the model *originally* read (not an already-corrected value) is the misread worth remembering.
   */
  private async learn(
    businessId: string,
    before: DigitizerRow,
    field: string,
    corrected: string | number | null,
  ) {
    if (typeof corrected !== 'string') return;
    const spec = fieldSpec(before.destination, field);
    if (!spec || spec.kind !== 'text') return;
    const raw = before.original?.[field] ?? before.data[field];
    if (typeof raw !== 'string' || raw.trim().length < 3) return;
    await this.aliases.learn(businessId, raw, corrected);
  }
}
