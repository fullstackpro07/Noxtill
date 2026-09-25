import { HIGH_CONFIDENCE } from './digitizer.constants';
import {
  DESTINATION_LABELS,
  DOCUMENT_KIND_LABELS,
  SCANNER_BY_KIND,
} from './digitizer-fields';
import { AssessedBatch } from './digitizer-assessment.service';
import { readEvents, readJobs, PhotoBatch } from './digitizer-document';
import {
  AssessedRow,
  confidenceSummary,
  formatAmount,
  DocStatus,
} from './digitizer-rules';
import {
  DocumentEvent,
  DocumentSummary,
  DocumentVersion,
  ImportPreview,
  MappingRow,
  NormalizationRow,
  PersonRef,
  QualityRow,
} from './digitizer.api-types';
import {
  DigitizerAnalysis,
  DigitizerDestination,
  DocumentKind,
  ScannerType,
} from './digitizer.types';

export const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  quality: 'File check',
  extraction: 'Extraction',
  validation: 'Validation',
  done: 'Done',
};

export const PIPELINE_STAGES = [
  'queued',
  'quality',
  'extraction',
  'validation',
] as const;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function kindConfidence(
  confidence: number | null,
  threshold: number,
): 'high' | 'medium' | 'low' | null {
  if (confidence === null) return null;
  if (confidence >= HIGH_CONFIDENCE) return 'high';
  return confidence >= threshold ? 'medium' : 'low';
}

export function isOpenStatus(s: DocStatus): boolean {
  return (
    s === 'needs_review' ||
    s === 'total_mismatch' ||
    s === 'unbalanced' ||
    s === 'ready'
  );
}

export function needsHuman(s: DocStatus): boolean {
  return s === 'needs_review' || s === 'total_mismatch' || s === 'unbalanced';
}

export function summarize(
  a: AssessedBatch,
  people: Map<string, PersonRef>,
  threshold: number,
  currency: string,
): DocumentSummary {
  const { batch, analysis, assessment } = a;
  const { counts } = assessment;
  const importedRecords = assessment.rows.filter(
    (r) =>
      r.result &&
      (r.result.status === 'created' || r.result.status === 'updated'),
  ).length;
  const critical = assessment.issues.filter(
    (i) => i.severity === 'critical',
  ).length;

  return {
    id: batch.id,
    name: analysis.title ?? batch.originalName ?? `Scan ${batch.id.slice(-6)}`,
    originalName: batch.originalName,
    kind: analysis.documentKind,
    kindLabel: DOCUMENT_KIND_LABELS[analysis.documentKind],
    kindConfidence: kindConfidence(analysis.typeConfidence, threshold),
    scannerType: analysis.scannerType,
    status: assessment.status,
    stage: (batch.stage as DocumentSummary['stage']) ?? null,
    stageStartedAt: batch.stageStartedAt
      ? batch.stageStartedAt.toISOString()
      : null,
    mimeType: batch.mimeType,
    pageCount: batch.pageCount ?? 1,
    handwriting: analysis.handwriting,
    language: analysis.language,
    destinations: assessment.destinations.map((d) => ({
      key: d,
      label: DESTINATION_LABELS[d],
    })),
    confidenceSummary: confidenceSummary(counts),
    counts: {
      rows: counts.rows,
      ready: counts.ready,
      needsReview: counts.needsReview,
      blocked: counts.blocked,
      skipped: counts.skipped,
      imported: counts.imported,
      failed: counts.failed,
      unreadable: counts.unreadable,
      duplicates: counts.duplicates,
    },
    plan: assessment.plan,
    issueCount: assessment.issues.length,
    criticalIssueCount: critical,
    uploadedAt: batch.createdAt.toISOString(),
    uploadedBy: batch.uploadedById
      ? (people.get(batch.uploadedById) ?? null)
      : null,
    version: batch.version,
    approvedAt: batch.approvedAt ? batch.approvedAt.toISOString() : null,
    approvedBy: batch.approvedById
      ? (people.get(batch.approvedById) ?? null)
      : null,
    groupId: batch.groupId,
    failureReason: batch.failureReason,
    originalRetained: Boolean(batch.imageKey),
    importedRecords,
    nextAction: nextAction(a, currency),
    evidence: evidence(a),
  };
}

function nextAction(
  a: AssessedBatch,
  currency: string,
): { title: string; why: string } {
  const { batch, assessment } = a;
  const { counts, plan, reconciliation } = assessment;
  const attention = counts.needsReview + counts.blocked + counts.failed;

  switch (assessment.status) {
    case 'queued':
    case 'processing':
      return {
        title: 'Wait for extraction to finish',
        why: `This document is at the ${STAGE_LABELS[batch.stage ?? 'queued'].toLowerCase()} stage. Nothing can be reviewed until it has been read.`,
      };
    case 'failed':
      return {
        title: 'Retake the photo, or reprocess the original',
        why: `${batch.failureReason ?? 'Extraction did not finish.'} The original file is kept, and nothing was written to any module.`,
      };
    case 'imported': {
      const byDest = new Map<DigitizerDestination, number>();
      for (const r of assessment.rows) {
        if (
          r.result &&
          (r.result.status === 'created' || r.result.status === 'updated')
        ) {
          byDest.set(r.destination, (byDest.get(r.destination) ?? 0) + 1);
        }
      }
      const parts = [...byDest].map(
        ([d, n]) => `${n} in ${DESTINATION_LABELS[d]}`,
      );
      return {
        title: `No action needed — ${plural(counts.imported, 'record')} imported`,
        why: `${parts.join(', ') || 'Records were written'}. Each was created from this scan and the original is kept alongside.`,
      };
    }
    case 'total_mismatch':
    case 'unbalanced': {
      const gap = formatAmount(
        Math.abs(reconciliation?.difference ?? 0),
        currency,
      );
      const issue = assessment.issues.find(
        (i) => i.code === 'total_mismatch' || i.code === 'ledger_unbalanced',
      );
      return {
        title:
          assessment.status === 'unbalanced'
            ? `Check the ledger — the closing balance is ${gap} away from what the entries produce`
            : `Resolve the total mismatch — the line items are ${gap} away from the printed total`,
        why: `${reconciliation?.message ?? ''} ${issue?.cause ? `${issue.cause}. ` : ''}Noxtill will not adjust either figure to make them balance — read the original and set the correct figure.`.trim(),
      };
    }
    case 'needs_review': {
      const parts: string[] = [];
      const unreadable = assessment.rows.filter(
        (r) =>
          r.state !== 'imported' &&
          r.fields.some((f) => f.level === 'unreadable' && f.target !== null),
      ).length;
      if (unreadable)
        parts.push(`${plural(unreadable, 'row')} with an unreadable value`);
      const dup = assessment.rows.filter(
        (r) => r.blockedBy === 'duplicate',
      ).length;
      if (dup)
        parts.push(
          `${plural(dup, 'row')} that match existing records and need your decision`,
        );
      const invalid = assessment.rows.filter(
        (r) => r.blockedBy === 'error',
      ).length;
      if (invalid)
        parts.push(`${plural(invalid, 'row')} with a missing or invalid value`);
      const low = assessment.rows.filter(
        (r) => r.blockedBy === 'review',
      ).length;
      if (low) parts.push(`${plural(low, 'row')} read with low confidence`);
      return {
        title: `Review the ${plural(attention, 'row')} that need${attention === 1 ? 's' : ''} you`,
        why: `${parts.join(', ')}. ${plan.create + plan.update > 0 ? `The other ${plural(plan.create + plan.update, 'record')} can import independently. ` : ''}Nothing has been written yet.`,
      };
    }
    case 'ready':
      return {
        title: `Import ${plural(plan.create + plan.update, 'record')}`,
        why: `Every row passed validation${plan.skip ? `, ${plural(plan.skip, 'row')} will be skipped as you decided` : ''}. Nothing has been written to any module yet — importing is the only step that writes.`,
      };
  }
}

function evidence(a: AssessedBatch): string {
  const { batch, analysis, assessment } = a;
  const rows = assessment.counts.rows;
  if (assessment.status === 'failed') return '0 records extracted';
  if (assessment.status === 'queued' || assessment.status === 'processing')
    return 'Extraction in progress';
  if (assessment.reconciliation?.kind === 'invoice')
    return `Calculated from ${plural(analysis.lineItems.length, 'extracted line item')}`;
  if (assessment.reconciliation?.kind === 'ledger')
    return `Reconciled across ${plural(analysis.ledger?.entries.length ?? 0, 'ledger entry', 'ledger entries')}`;
  if (analysis.documentKind === 'inventory_sheet')
    return `${plural(rows, 'row')} checked against your catalog`;
  return `${plural(rows, 'record')} extracted from ${plural(batch.pageCount ?? 1, 'page')}`;
}

// ───────────────────────────── detail pieces ─────────────────────────────

export function buildQuality(
  analysis: DigitizerAnalysis,
  batch: Pick<PhotoBatch, 'mimeType' | 'fileSize' | 'pageCount'>,
): {
  overall: 'good' | 'warnings' | 'failed' | 'unknown';
  rows: QualityRow[];
  notes: string | null;
} {
  const q = analysis.quality;
  const rows: QualityRow[] = [];

  if (analysis.dimensions) {
    const { width, height } = analysis.dimensions;
    const adequate = Math.min(width, height) >= 800;
    rows.push({
      key: 'resolution',
      label: 'Resolution',
      state: adequate ? 'passed' : 'warning',
      detail: `${width} × ${height} px · ${adequate ? 'adequate' : 'low — small handwriting may be misread'}`,
      source: 'file',
    });
  } else if (batch.mimeType === 'application/pdf') {
    rows.push({
      key: 'resolution',
      label: 'Resolution',
      state: 'unknown',
      detail: `PDF · ${plural(batch.pageCount ?? 1, 'page')}`,
      source: 'file',
    });
  }

  const level = (
    key: string,
    label: string,
    v: 'none' | 'mild' | 'severe' | null,
    what: string,
  ) => {
    if (v === null) {
      rows.push({
        key,
        label,
        state: 'unknown',
        detail: 'Not reported for this document',
        source: 'model',
      });
      return;
    }
    rows.push({
      key,
      label,
      state: v === 'none' ? 'passed' : v === 'mild' ? 'warning' : 'failed',
      detail:
        v === 'none'
          ? `No ${what} detected`
          : `${v[0].toUpperCase()}${v.slice(1)} ${what}`,
      source: 'model',
    });
  };
  level('blur', 'Blur', q?.blur ?? null, 'blur');
  level('glare', 'Glare', q?.glare ?? null, 'glare');
  level('shadow', 'Shadow', q?.shadow ?? null, 'shadow');
  level(
    'skew',
    'Perspective',
    q?.skew ?? null,
    'tilt or perspective distortion',
  );

  rows.push({
    key: 'cutoff',
    label: 'Cut-off text',
    state:
      q?.cutOff === null || q?.cutOff === undefined
        ? 'unknown'
        : q.cutOff
          ? 'warning'
          : 'passed',
    detail:
      q?.cutOff === null || q?.cutOff === undefined
        ? 'Not reported for this document'
        : q.cutOff
          ? 'Text is cut off at a page edge'
          : 'Nothing cut off at the edges',
    source: 'model',
  });
  rows.push({
    key: 'legible',
    label: 'Legibility',
    state:
      q?.legible === null || q?.legible === undefined
        ? 'unknown'
        : q.legible
          ? 'passed'
          : 'failed',
    detail:
      q?.legible === null || q?.legible === undefined
        ? 'Not reported for this document'
        : q.legible
          ? 'The text could be read'
          : 'The text could not be read reliably',
    source: 'model',
  });

  const reported = rows.filter(
    (r) => r.source === 'model' && r.state !== 'unknown',
  );
  let overall: 'good' | 'warnings' | 'failed' | 'unknown' = 'unknown';
  if (reported.length > 0 || analysis.dimensions) {
    overall = rows.some((r) => r.state === 'failed')
      ? 'failed'
      : rows.some((r) => r.state === 'warning')
        ? 'warnings'
        : reported.length > 0
          ? 'good'
          : 'unknown';
  }
  return { overall, rows, notes: q?.notes ?? null };
}

export function buildMapping(rows: AssessedRow[]): MappingRow[] {
  const acc = new Map<string, MappingRow>();
  for (const r of rows) {
    for (const f of r.fields) {
      if (f.blank) continue;
      const key = `${r.destination}|${f.field}`;
      const hit = acc.get(key);
      if (hit) hit.rows += 1;
      else
        acc.set(key, {
          destination: r.destination,
          destinationLabel: DESTINATION_LABELS[r.destination],
          source: f.field,
          target: f.target,
          status: f.target ? 'mapped' : 'ignored',
          rows: 1,
        });
    }
  }
  return [...acc.values()].sort(
    (x, y) =>
      x.destination.localeCompare(y.destination) ||
      Number(y.status === 'mapped') - Number(x.status === 'mapped'),
  );
}

export function buildNormalization(rows: AssessedRow[]): NormalizationRow[] {
  const acc = new Map<string, NormalizationRow>();
  for (const r of rows) {
    for (const f of r.fields) {
      if (!f.normalization || f.original === null || f.normalized === null)
        continue;
      const hit = acc.get(f.normalization) ?? {
        label: f.normalization,
        count: 0,
        examples: [],
      };
      hit.count += 1;
      if (hit.examples.length < 3 && f.original !== f.normalized)
        hit.examples.push({ from: f.original, to: f.normalized });
      acc.set(f.normalization, hit);
    }
  }
  return [...acc.values()].sort((a, b) => b.count - a.count);
}

export function buildPreview(a: AssessedBatch): ImportPreview {
  const { assessment } = a;
  const blocked = {
    lowConfidence: 0,
    duplicates: 0,
    invalid: 0,
    reconciliation: 0,
    other: 0,
  };
  for (const r of assessment.rows) {
    if (r.plan !== 'blocked') continue;
    if (r.blockedBy === 'review') blocked.lowConfidence += 1;
    else if (r.blockedBy === 'duplicate') blocked.duplicates += 1;
    else if (r.blockedBy === 'error') blocked.invalid += 1;
    else if (r.blockedBy === 'reconciliation') blocked.reconciliation += 1;
    else blocked.other += 1;
  }
  const writes = assessment.plan.create + assessment.plan.update;
  const st = assessment.status;
  let reason: string | null = null;
  if (st === 'queued' || st === 'processing')
    reason = 'This document is still being read.';
  else if (st === 'failed')
    reason = 'Nothing was extracted from this document.';
  else if (st === 'imported')
    reason = 'Everything importable has already been imported.';
  else if (writes === 0)
    reason =
      assessment.plan.blocked > 0
        ? 'Every remaining row is blocked — resolve them in Review first.'
        : 'There is nothing to write.';

  return {
    counts: assessment.plan,
    byDestination: (
      Object.entries(assessment.planByDestination) as [
        DigitizerDestination,
        ImportPreview['counts'],
      ][]
    ).map(([destination, counts]) => ({
      destination,
      label: DESTINATION_LABELS[destination],
      counts,
    })),
    blocked,
    highRisk: assessment.destinations.includes('credit_opening_balance'),
    canImport:
      writes > 0 &&
      st !== 'queued' &&
      st !== 'processing' &&
      st !== 'failed' &&
      st !== 'imported',
    reason,
  };
}

export function buildEvents(
  batch: Pick<PhotoBatch, 'events'>,
  people: Map<string, PersonRef>,
): DocumentEvent[] {
  return readEvents(batch).map((e) => ({
    at: e.at,
    actor: e.actorId ? (people.get(e.actorId) ?? null) : null,
    action: e.action,
    detail: e.detail,
  }));
}

export function buildVersions(
  batch: Pick<PhotoBatch, 'versions'>,
): DocumentVersion[] {
  const stored = Array.isArray(batch.versions)
    ? (batch.versions as {
        version: number;
        createdAt: string;
        rows: { corrected?: boolean }[];
      }[])
    : [];
  return stored.map((v) => ({
    version: v.version,
    createdAt: v.createdAt,
    rows: Array.isArray(v.rows) ? v.rows.length : 0,
    corrected: Array.isArray(v.rows)
      ? v.rows.filter((r) => r.corrected).length
      : 0,
  }));
}

export function personIds(batches: PhotoBatch[]): string[] {
  const ids = new Set<string>();
  for (const b of batches) {
    if (b.uploadedById) ids.add(b.uploadedById);
    if (b.approvedById) ids.add(b.approvedById);
    for (const e of readEvents(b)) if (e.actorId) ids.add(e.actorId);
    for (const j of readJobs(b)) if (j.byId) ids.add(j.byId);
  }
  return [...ids];
}

export const ALTERNATIVE_KINDS: {
  kind: DocumentKind;
  label: string;
  scannerType: ScannerType;
}[] = (Object.entries(SCANNER_BY_KIND) as [DocumentKind, ScannerType][]).map(
  ([kind, scannerType]) => ({
    kind,
    label: DOCUMENT_KIND_LABELS[kind],
    scannerType,
  }),
);

export const UNSUPPORTED_KINDS: DocumentKind[] = [
  'booking_register',
  'staff_register',
];

/** The field pair shown in Structured Data: original beside normalized. Prefers a field that was actually changed. */
const PRIMARY_FIELDS: Record<DigitizerDestination, string[]> = {
  customer: ['phone', 'email', 'name'],
  supplier: ['phone', 'email', 'name'],
  product: ['sku', 'sellingPrice', 'name'],
  expense: ['amount', 'incurredOn', 'description'],
  credit_opening_balance: ['amount', 'phone'],
  inventory: ['countedQty', 'sku', 'name'],
};

export function primaryPair(row: AssessedRow) {
  const changed = row.fields.find((f) => f.normalization && !f.blank);
  if (changed) return changed;
  for (const key of PRIMARY_FIELDS[row.destination]) {
    const f = row.fields.find((x) => x.field === key);
    if (f && !f.blank) return f;
  }
  return row.fields.find((f) => !f.blank) ?? row.fields[0] ?? null;
}
