import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  AssessedBatch,
  BusinessRules,
  DigitizerAssessmentService,
} from './digitizer-assessment.service';
import { DigitizerPipelineService } from './digitizer-pipeline.service';
import { PhotoBatch, readJobs } from './digitizer-document';
import { DESTINATION_LABELS, DOCUMENT_KIND_LABELS } from './digitizer-fields';
import {
  ALTERNATIVE_KINDS,
  PIPELINE_STAGES,
  STAGE_LABELS,
  UNSUPPORTED_KINDS,
  buildEvents,
  buildMapping,
  buildNormalization,
  buildPreview,
  buildQuality,
  buildVersions,
  isOpenStatus,
  needsHuman,
  personIds,
  primaryPair,
  summarize,
} from './digitizer-summary';
import {
  BatchResponse,
  DocumentDetail,
  DocumentSummary,
  ImportJobRow,
  ImportOverviewResponse,
  OverviewResponse,
  PersonRef,
  QueueResponse,
  ReviewResponse,
  StructuredResponse,
  StructuredRow,
} from './digitizer.api-types';
import { DIGITIZER_ERROR_CODES } from './digitizer.constants';
import { DigitizerDestination } from './digitizer.types';

/** The most recent documents considered by list/aggregate screens — keeps a screen's cost bounded. */
const MAX_DOCUMENTS = 500;
const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

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

@Injectable()
export class DigitizerViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessment: DigitizerAssessmentService,
    private readonly pipeline: DigitizerPipelineService,
  ) {}

  // ───────────────────────────── shared loading ─────────────────────────────

  private async fetchBatches(
    businessId: string,
    where: Record<string, unknown> = {},
    take = MAX_DOCUMENTS,
  ): Promise<PhotoBatch[]> {
    await this.pipeline.reapStale(businessId);
    return this.prisma.importBatch.findMany({
      where: { businessId, source: 'photo', ...where },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async people(ids: string[]): Promise<Map<string, PersonRef>> {
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, { id: u.id, name: u.name }]));
  }

  /** Every recent document, assessed, with its summary — the base of every aggregate screen. */
  async loadAll(businessId: string, where: Record<string, unknown> = {}) {
    const rules = await this.assessment.rulesFor(businessId);
    const batches = await this.fetchBatches(businessId, where);
    const assessed = await this.assessment.assessMany(
      businessId,
      batches,
      rules,
    );
    const people = await this.people(personIds(batches));
    const summaries = assessed.map((a) =>
      summarize(a, people, rules.ctx.reviewThreshold, rules.currency),
    );
    return { rules, assessed, people, summaries };
  }

  // ───────────────────────────── one document ─────────────────────────────

  async detail(businessId: string, id: string): Promise<DocumentDetail> {
    await this.pipeline.reapStale(businessId);
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
    const rules = await this.assessment.rulesFor(businessId);
    const assessed = await this.assessment.assessOne(businessId, batch, rules);
    return this.toDetail(assessed, rules);
  }

  async toDetail(
    a: AssessedBatch,
    rules: BusinessRules,
  ): Promise<DocumentDetail> {
    const people = await this.people(personIds([a.batch]));
    const summary = summarize(
      a,
      people,
      rules.ctx.reviewThreshold,
      rules.currency,
    );
    const { analysis, assessment, batch } = a;
    const supported = ALTERNATIVE_KINDS;

    return {
      ...summary,
      rows: assessment.rows,
      issues: assessment.issues,
      reconciliation: assessment.reconciliation,
      quality: buildQuality(analysis, batch),
      classification: {
        kind: analysis.documentKind,
        kindLabel: DOCUMENT_KIND_LABELS[analysis.documentKind],
        confidence: analysis.typeConfidence,
        requestedScanner: analysis.scannerType,
        alternatives: supported,
        unsupportedKinds: UNSUPPORTED_KINDS,
      },
      table: {
        lineItems: assessment.reconciliation?.lines ?? [],
        totals: analysis.totals,
        ledger: analysis.ledger,
        currency: rules.currency,
        editable:
          assessment.status !== 'imported' &&
          assessment.status !== 'queued' &&
          assessment.status !== 'processing',
      },
      normalization: buildNormalization(assessment.rows),
      mapping: buildMapping(assessment.rows),
      importPreview: buildPreview(a),
      jobs: readJobs(batch),
      events: buildEvents(batch, people),
      versions: buildVersions(batch),
      invoice: {
        number: analysis.invoiceNumber,
        supplier: analysis.supplier,
        date: analysis.documentDate,
      },
      currency: rules.currency,
      reviewThreshold: rules.ctx.reviewThreshold,
      model: analysis.extractionModel || null,
    };
  }

  // ───────────────────────────── history ─────────────────────────────

  async documents(businessId: string, q: DocumentQuery) {
    const where: Record<string, unknown> = {};
    if (q.uploaderId) where.uploadedById = q.uploaderId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const { summaries, rules } = await this.loadAll(businessId, where);

    const needle = q.q?.trim().toLowerCase();
    const filtered = summaries.filter((s) => {
      if (q.status && q.status !== 'all') {
        if (q.status === 'open') {
          if (!isOpenStatus(s.status)) return false;
        } else if (q.status === 'needs_review') {
          if (!needsHuman(s.status)) return false;
        } else if (s.status !== q.status) return false;
      }
      if (q.kind && s.kind !== q.kind) return false;
      if (q.destination && !s.destinations.some((d) => d.key === q.destination))
        return false;
      if (needle) {
        const hay =
          `${s.name} ${s.originalName ?? ''} ${s.kindLabel} ${s.destinations.map((d) => d.label).join(' ')} ${s.uploadedBy?.name ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const offset = Math.max(q.offset ?? 0, 0);

    const all = summaries;
    const uploaders = new Map<string, PersonRef>();
    for (const s of all)
      if (s.uploadedBy) uploaders.set(s.uploadedBy.id, s.uploadedBy);

    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      kpis: {
        processed: all.filter(
          (s) => s.status !== 'queued' && s.status !== 'processing',
        ).length,
        imported: all.filter((s) => s.status === 'imported').length,
        recordsWritten: all.reduce((n, s) => n + s.importedRecords, 0),
        failed: all.filter((s) => s.status === 'failed').length,
        needsReview: all.filter((s) => needsHuman(s.status)).length,
        retained: all.filter((s) => s.originalRetained).length,
      },
      filters: {
        uploaders: [...uploaders.values()],
        kinds: [...new Set(all.map((s) => s.kind))].map((k) => ({
          key: k,
          label: DOCUMENT_KIND_LABELS[k],
        })),
        destinations: [
          ...new Set(all.flatMap((s) => s.destinations.map((d) => d.key))),
        ].map((d) => ({ key: d, label: DESTINATION_LABELS[d] })),
      },
      capped: all.length >= MAX_DOCUMENTS,
      currency: rules.currency,
    };
  }

  // ───────────────────────────── overview ─────────────────────────────

  async overview(businessId: string): Promise<OverviewResponse> {
    const { assessed, summaries, rules } = await this.loadAll(businessId);
    const cutoff = Date.now() - WINDOW_DAYS * DAY_MS;
    const inWindow = (s: DocumentSummary) =>
      new Date(s.uploadedAt).getTime() >= cutoff;

    const done = summaries.filter(
      (s) => s.status !== 'queued' && s.status !== 'processing',
    );
    const windowDocs = done.filter(inWindow);
    const open = summaries.filter((s) => isOpenStatus(s.status));

    let recordsExtracted = 0;
    let fieldsExtracted = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let unreadable = 0;
    let corrected = 0;
    let recordsWritten = 0;
    let duplicates = 0;
    let rowsNeedHuman = 0;
    let cleanRecords = 0;
    const discrepancies: OverviewResponse['discrepancies'] = [];

    assessed.forEach((a, i) => {
      const s = summaries[i];
      const c = a.assessment.counts;
      if (
        inWindow(s) &&
        s.status !== 'queued' &&
        s.status !== 'processing' &&
        s.status !== 'failed'
      ) {
        recordsExtracted += c.rows;
        fieldsExtracted += c.fieldsExtracted;
        high += c.high;
        medium += c.medium;
        low += c.low;
        unreadable += c.unreadable;
        corrected += c.corrected;
        recordsWritten += s.importedRecords;
      }
      if (isOpenStatus(s.status)) {
        duplicates += c.duplicates;
        rowsNeedHuman += c.needsReview + c.blocked + c.failed;
        cleanRecords += c.ready;
        const rec = a.assessment.reconciliation;
        if (rec && !rec.ok)
          discrepancies.push({
            documentId: s.id,
            documentName: s.name,
            kind: rec.kind,
            message: rec.message,
          });
      }
    });

    const count = (pred: (s: DocumentSummary) => boolean) =>
      summaries.filter(pred).length;
    const readyDocs = count((s) => s.status === 'ready');
    const reviewDocs = count((s) => needsHuman(s.status));
    const processing = count((s) => s.status === 'processing');
    const queued = count((s) => s.status === 'queued');
    const importedWin = windowDocs.filter(
      (s) => s.status === 'imported',
    ).length;
    const failedWin = windowDocs.filter((s) => s.status === 'failed').length;
    const aliasCount = await this.prisma.digitizerAlias.count({
      where: { businessId },
    });

    return {
      windowDays: WINDOW_DAYS,
      currency: rules.currency,
      kpis: {
        documentsProcessed: windowDocs.length,
        pendingReview: reviewDocs,
        readyToImport: readyDocs,
        imported: importedWin,
        failed: failedWin,
        processing,
        queued,
        duplicatesDetected: duplicates,
        pagesProcessed: windowDocs.reduce((n, s) => n + s.pageCount, 0),
        recordsExtracted,
        fieldsExtracted,
        highConfidence: high,
        mediumConfidence: medium,
        lowConfidence: low,
        unreadable,
        correctedByYou: corrected,
        recordsWritten,
        rowsNeedHuman,
        cleanRecords,
        learnedAliases: aliasCount,
      },
      discrepancies,
      stages: [
        {
          key: 'ready',
          label: 'Ready to import',
          meta: `${cleanRecords} importable record${cleanRecords === 1 ? '' : 's'}`,
          documents: readyDocs,
        },
        {
          key: 'review',
          label: 'Needs review',
          meta: `${rowsNeedHuman} row${rowsNeedHuman === 1 ? '' : 's'} need a human`,
          documents: reviewDocs,
        },
        {
          key: 'processing',
          label: 'Processing',
          meta: 'extraction running',
          documents: processing,
        },
        {
          key: 'imported',
          label: 'Imported',
          meta: `written to modules · last ${WINDOW_DAYS} days`,
          documents: importedWin,
        },
        {
          key: 'failed',
          label: 'Failed',
          meta: `could not be read · last ${WINDOW_DAYS} days`,
          documents: failedWin,
        },
        {
          key: 'queued',
          label: 'Queued',
          meta: 'waiting to start',
          documents: queued,
        },
      ],
      recent: summaries.slice(0, 6),
      openDocuments: open.length,
      badges: {
        queue: processing + queued,
        review: reviewDocs,
        import: summaries.filter(
          (s) => isOpenStatus(s.status) && s.plan.create + s.plan.update > 0,
        ).length,
      },
    };
  }

  // ───────────────────────────── queue ─────────────────────────────

  async queue(businessId: string): Promise<QueueResponse> {
    const { summaries } = await this.loadAll(businessId);
    const now = Date.now();
    const active = summaries.filter(
      (s) => s.status === 'queued' || s.status === 'processing',
    );
    const stageIdx = (stage: string | null) =>
      Math.max(
        0,
        (PIPELINE_STAGES as readonly string[]).indexOf(stage ?? 'queued'),
      );
    let rowsNeedHuman = 0;
    let cleanRecords = 0;
    for (const s of summaries) {
      if (!isOpenStatus(s.status)) continue;
      rowsNeedHuman +=
        s.counts.needsReview + s.counts.blocked + s.counts.failed;
      cleanRecords += s.counts.ready;
    }
    return {
      kpis: {
        queued: summaries.filter((s) => s.status === 'queued').length,
        processing: summaries.filter((s) => s.status === 'processing').length,
        ready: summaries.filter((s) => s.status === 'ready').length,
        needsReview: summaries.filter((s) => needsHuman(s.status)).length,
        failed: summaries.filter((s) => s.status === 'failed').length,
        cleanRecords,
        rowsNeedHuman,
      },
      pipeline: PIPELINE_STAGES.map((key) => ({
        key,
        label: STAGE_LABELS[key],
      })),
      inProgress: active.map((s) => ({
        ...s,
        stageIndex: stageIdx(s.stage),
        elapsedMs: now - new Date(s.uploadedAt).getTime(),
      })),
      documents: summaries.slice(0, 100),
    };
  }

  // ───────────────────────────── review ─────────────────────────────

  async review(businessId: string): Promise<ReviewResponse> {
    const { assessed, summaries } = await this.loadAll(businessId);
    const issues: ReviewResponse['issues'] = [];
    const duplicates: ReviewResponse['duplicates'] = [];
    const documents: ReviewResponse['documents'] = [];
    let rowsNeedHuman = 0;

    assessed.forEach((a, i) => {
      const s = summaries[i];
      if (!needsHuman(s.status)) return;
      const attention =
        a.assessment.counts.needsReview +
        a.assessment.counts.blocked +
        a.assessment.counts.failed;
      rowsNeedHuman += attention;
      documents.push({
        id: s.id,
        name: s.name,
        needsAttention: attention,
        status: s.status,
      });
      for (const issue of a.assessment.issues)
        issues.push({ ...issue, documentId: s.id, documentName: s.name });
      for (const r of a.assessment.rows) {
        if (!r.duplicate || r.state === 'imported' || r.action === 'skip')
          continue;
        duplicates.push({
          documentId: s.id,
          documentName: s.name,
          rowId: r.id,
          rowName: r.displayName,
          sourceLabel: r.sourceLabel,
          decision: r.duplicateDecision,
          duplicate: r.duplicate,
        });
      }
    });

    issues.sort(
      (x, y) =>
        Number(y.severity === 'critical') - Number(x.severity === 'critical') ||
        y.affected - x.affected,
    );
    return {
      issues,
      duplicates,
      documents,
      totals: {
        issues: issues.length,
        criticalIssues: issues.filter((x) => x.severity === 'critical').length,
        rowsNeedHuman,
      },
    };
  }

  // ───────────────────────────── structured data ─────────────────────────────

  async structured(
    businessId: string,
    destination?: string,
    documentId?: string,
  ): Promise<StructuredResponse> {
    const { assessed, summaries } = await this.loadAll(businessId);
    const rows: StructuredRow[] = [];
    const groups = new Map<DigitizerDestination, number>();
    const kpis = {
      records: 0,
      valid: 0,
      warnings: 0,
      errors: 0,
      duplicates: 0,
      ready: 0,
      documents: 0,
    };
    const docsSeen = new Set<string>();

    assessed.forEach((a, i) => {
      const s = summaries[i];
      const include = documentId ? s.id === documentId : isOpenStatus(s.status);
      if (!include) return;
      for (const r of a.assessment.rows) {
        if (r.action === 'skip' && !documentId) continue;
        groups.set(r.destination, (groups.get(r.destination) ?? 0) + 1);
        if (destination && r.destination !== destination) continue;

        const errors = r.issues.filter((x) => x.severity === 'error');
        const warnings = r.issues.filter((x) => x.severity === 'warning');
        kpis.records += 1;
        docsSeen.add(s.id);
        if (errors.length) kpis.errors += 1;
        else if (warnings.length || r.state === 'needs_review')
          kpis.warnings += 1;
        else kpis.valid += 1;
        if (r.duplicate) kpis.duplicates += 1;
        if (r.state === 'ready') kpis.ready += 1;

        const pair = primaryPair(r);
        rows.push({
          documentId: s.id,
          documentName: s.name,
          rowId: r.id,
          record: r.displayName,
          destination: r.destination,
          destinationLabel: r.destinationLabel,
          fieldLabel: pair?.label ?? '',
          original: pair?.original ?? null,
          normalized: pair?.normalized ?? null,
          normalization: pair?.normalization ?? null,
          level: r.level,
          validation: errors.length
            ? {
                label:
                  errors[0].message.length > 40
                    ? errors[0].code.replace(/_/g, ' ')
                    : errors[0].message,
                tone: 'red',
              }
            : warnings.length
              ? {
                  label:
                    warnings[0].message.length > 40
                      ? warnings[0].code.replace(/_/g, ' ')
                      : warnings[0].message,
                  tone: 'amber',
                }
              : { label: 'Valid', tone: 'green' },
          duplicate: r.duplicate
            ? {
                label:
                  r.duplicateDecision === 'use_existing'
                    ? 'Use existing'
                    : r.duplicateDecision === 'create_new'
                      ? 'Create new'
                      : r.duplicate.level === 'high'
                        ? 'Possible'
                        : 'Weak match',
                level: r.duplicate.level,
              }
            : { label: 'None', level: null },
          sourceLabel: r.sourceLabel,
          state: r.state,
          stateReason: r.stateReason,
          row: r,
        });
      }
    });
    kpis.documents = docsSeen.size;

    const CAP = 500;
    return {
      kpis,
      groups: [...groups].map(([d, count]) => ({
        destination: d,
        label: DESTINATION_LABELS[d],
        count,
      })),
      rows: rows.slice(0, CAP),
      truncated: rows.length > CAP,
    };
  }

  // ───────────────────────────── import ─────────────────────────────

  async importOverview(
    businessId: string,
    documentId?: string,
  ): Promise<ImportOverviewResponse> {
    const { assessed, summaries, rules } = await this.loadAll(businessId);
    const candidates = summaries
      .filter((s) => isOpenStatus(s.status))
      .map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        create: s.plan.create,
        update: s.plan.update,
        blocked: s.plan.blocked,
        approved: s.approvedAt !== null,
      }));

    let pickedIndex = -1;
    if (documentId)
      pickedIndex = summaries.findIndex((s) => s.id === documentId);
    if (pickedIndex === -1) {
      pickedIndex = summaries.findIndex(
        (s) => s.status === 'ready' && s.plan.create + s.plan.update > 0,
      );
    }
    if (pickedIndex === -1)
      pickedIndex = summaries.findIndex((s) => isOpenStatus(s.status));

    const document =
      pickedIndex >= 0
        ? await this.toDetail(assessed[pickedIndex], rules)
        : null;

    const jobs: ImportJobRow[] = [];
    assessed.forEach((a, i) => {
      for (const job of readJobs(a.batch)) {
        jobs.push({
          ...job,
          documentId: summaries[i].id,
          documentName: summaries[i].name,
          destinationLabels: job.destinations.map((d) => DESTINATION_LABELS[d]),
          status:
            job.failed > 0 && job.created + job.updated === 0
              ? 'failed'
              : job.failed > 0
                ? 'partial'
                : 'completed',
        });
      }
    });
    jobs.sort((x, y) => y.at.localeCompare(x.at));

    return { candidates, document, jobs: jobs.slice(0, 50) };
  }

  // ───────────────────────────── batches ─────────────────────────────

  async batches(businessId: string, groupId?: string): Promise<BatchResponse> {
    const { assessed, summaries, rules } = await this.loadAll(businessId);
    const grouped = new Map<string, number[]>();
    summaries.forEach((s, i) => {
      if (!s.groupId) return;
      const list = grouped.get(s.groupId) ?? [];
      list.push(i);
      grouped.set(s.groupId, list);
    });

    const groups = [...grouped.entries()]
      .map(([gid, idxs]) => {
        const first = idxs.reduce(
          (min, i) =>
            summaries[i].uploadedAt < summaries[min].uploadedAt ? i : min,
          idxs[0],
        );
        return {
          groupId: gid,
          files: idxs.length,
          createdAt: summaries[first].uploadedAt,
          uploadedBy: summaries[first].uploadedBy,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const chosen =
      groupId && grouped.has(groupId) ? groupId : groups[0]?.groupId;
    if (!chosen) return { groups, group: null };

    const idxs = grouped.get(chosen)!;
    const docs = idxs.map((i) => ({ s: summaries[i], a: assessed[i] }));
    const settled = docs.filter(
      ({ s }) => s.status !== 'queued' && s.status !== 'processing',
    );
    const gateDocs = settled.filter(({ s }) => s.status !== 'failed');

    const noBlocked = (d: (typeof docs)[number]) =>
      d.a.assessment.counts.blocked === 0 && d.a.assessment.counts.failed === 0;
    const noCritical = (d: (typeof docs)[number]) =>
      d.s.criticalIssueCount === 0;
    const aboveThreshold = (d: (typeof docs)[number]) =>
      d.a.assessment.counts.needsReview === 0;
    const noDup = (d: (typeof docs)[number]) =>
      !d.a.assessment.rows.some((r) => r.blockedBy === 'duplicate');
    const clean = gateDocs.filter(
      (d) =>
        noBlocked(d) &&
        noCritical(d) &&
        aboveThreshold(d) &&
        noDup(d) &&
        d.s.status === 'ready',
    );
    const approvable = clean.filter((d) => !d.s.approvedAt);

    const byKind = new Map<
      string,
      {
        label: string;
        files: number;
        printed: number;
        handwritten: number;
        mixed: number;
      }
    >();
    for (const { s } of docs) {
      const cur = byKind.get(s.kind) ?? {
        label: s.kindLabel,
        files: 0,
        printed: 0,
        handwritten: 0,
        mixed: 0,
      };
      cur.files += 1;
      if (s.handwriting === 'printed') cur.printed += 1;
      else if (s.handwriting === 'handwritten') cur.handwritten += 1;
      else if (s.handwriting === 'mixed') cur.mixed += 1;
      byKind.set(s.kind, cur);
    }

    const criticalDocs = docs.filter(
      ({ s }) => s.criticalIssueCount > 0 || s.status === 'failed',
    );
    const lowDocs = docs.filter(
      ({ a, s }) =>
        s.criticalIssueCount === 0 && a.assessment.counts.needsReview > 0,
    );
    const dupDocs = docs.filter(({ a }) =>
      a.assessment.rows.some((r) => r.blockedBy === 'duplicate'),
    );
    const restDocs = docs.filter(
      ({ s }) => s.status === 'ready' || s.status === 'imported',
    );

    const total = gateDocs.length;
    return {
      groups,
      group: {
        groupId: chosen,
        files: docs.length,
        pages: docs.reduce((n, { s }) => n + s.pageCount, 0),
        processing: docs.filter(
          ({ s }) => s.status === 'queued' || s.status === 'processing',
        ).length,
        ready: docs.filter(({ s }) => s.status === 'ready').length,
        needsReview: docs.filter(({ s }) => needsHuman(s.status)).length,
        failed: docs.filter(({ s }) => s.status === 'failed').length,
        imported: docs.filter(({ s }) => s.status === 'imported').length,
        approved: docs.filter(({ s }) => s.approvedAt).length,
        classification: [...byKind.entries()].map(([key, v]) => ({
          key,
          label: v.label,
          handwriting:
            v.handwritten === 0 && v.mixed === 0
              ? v.printed
                ? 'printed'
                : 'not reported'
              : v.printed === 0 && v.mixed === 0
                ? 'handwritten'
                : 'mixed',
          files: v.files,
        })),
        gates: [
          {
            key: 'valid',
            label: 'All records pass validation',
            passing: gateDocs.filter(noBlocked).length,
            total,
          },
          {
            key: 'critical',
            label: 'No critical errors',
            passing: gateDocs.filter(noCritical).length,
            total,
          },
          {
            key: 'confidence',
            label: 'Confidence above threshold',
            passing: gateDocs.filter(aboveThreshold).length,
            total,
          },
          {
            key: 'duplicates',
            label: 'No ambiguous duplicates',
            passing: gateDocs.filter(noDup).length,
            total,
          },
        ],
        priority: [
          {
            rank: 1,
            key: 'critical',
            label: 'Critical errors first',
            detail: `${criticalDocs.length} document${criticalDocs.length === 1 ? '' : 's'} with reconciliation problems or that could not be read block entirely.`,
            count: criticalDocs.length,
            tone: 'red',
          },
          {
            rank: 2,
            key: 'low',
            label: 'Low confidence',
            detail: `${lowDocs.length} document${lowDocs.length === 1 ? '' : 's'} with fields read but not trusted (below your ${Math.round(rules.ctx.reviewThreshold * 100)}% threshold).`,
            count: lowDocs.length,
            tone: 'amber',
          },
          {
            rank: 3,
            key: 'duplicates',
            label: 'Ambiguous duplicates',
            detail: `${dupDocs.length} document${dupDocs.length === 1 ? '' : 's'} with records that match existing data and need your decision.`,
            count: dupDocs.length,
            tone: 'amber',
          },
          {
            rank: 4,
            key: 'rest',
            label: 'Everything else',
            detail: `${restDocs.length} document${restDocs.length === 1 ? ' is' : 's are'} clean or already imported and need no attention.`,
            count: restDocs.length,
            tone: 'green',
          },
        ],
        approvable: {
          ids: approvable.map(({ s }) => s.id),
          records: approvable.reduce(
            (n, { s }) => n + s.plan.create + s.plan.update,
            0,
          ),
          ambiguousDuplicates: 0,
          criticalErrors: 0,
        },
        individual: docs.filter(({ s }) => needsHuman(s.status)).length,
        documents: docs.map(({ s }) => s),
      },
    };
  }
}
