import { normalizePhoneE164 } from '../common/utils/phone.util';
import { HIGH_CONFIDENCE } from './digitizer.constants';
import {
  DESTINATION_FIELDS,
  DESTINATION_LABELS,
  DestinationField,
  FieldKind,
  HIGH_RISK_DESTINATIONS,
} from './digitizer-fields';
import {
  DigitizerAnalysis,
  DigitizerDestination,
  DigitizerRow,
  DigitizerRowData,
  DuplicateDecision,
  DigitizerRowResult,
  FieldRegion,
} from './digitizer.types';

// ───────────────────────────── types ─────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unreadable';
export type RowState =
  'ready' | 'needs_review' | 'blocked' | 'skipped' | 'imported' | 'failed';
export type RowPlan = 'create' | 'update' | 'skip' | 'blocked' | 'done';

export type DocStatus =
  | 'queued'
  | 'processing'
  | 'failed'
  | 'needs_review'
  | 'total_mismatch'
  | 'unbalanced'
  | 'ready'
  | 'imported';

export interface RulesContext {
  /** ISO country of the business — the default region for phone numbers written without a country code. */
  country: string | null;
  /** Below this a field/row is flagged for review (owner-tunable policy). */
  reviewThreshold: number;
  currency: string;
  now: Date;
}

export interface AssessedField {
  field: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  /** Where it lands in Noxtill, or null when this build has no place for it (the value is ignored). */
  target: string | null;
  original: string | null;
  value: string | null;
  normalized: string | null;
  /** Human description of what normalization did, or null when nothing changed. */
  normalization: string | null;
  level: ConfidenceLevel;
  confidence: number | null;
  blank: boolean;
  issue: string | null;
}

export interface RowIssue {
  code: string;
  severity: 'error' | 'warning';
  field?: string;
  message: string;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  sku?: string | null;
}

export interface DuplicateInfo {
  /** `high` = a strong identifier (phone, email, SKU) matches; `low` = the name alone matches. */
  level: 'high' | 'low';
  entity: 'Customers' | 'Suppliers' | 'Products' | 'Expenses';
  basis: string;
  phoneMatch: boolean;
  emailMatch: boolean;
  nameMatch: boolean;
  existing: DuplicateMatch;
}

export interface ProductMatch {
  id: string;
  name: string;
  sku: string | null;
  stockQty: number;
}

/** What the database says about a row — resolved once, in bulk, by the duplicate service. */
export interface RowLookup {
  duplicate: DuplicateInfo | null;
  /** Inventory rows only: the catalog product this row updates, or null when it matches nothing. */
  product: ProductMatch | null;
  /** Credit rows only: the customer the balance will attach to, if one already exists. */
  existingCustomer: DuplicateMatch | null;
}

export interface AssessedRow {
  id: string;
  destination: DigitizerDestination;
  destinationLabel: string;
  action: 'commit' | 'skip';
  reviewed: boolean;
  corrected: boolean;
  page: number | null;
  sourceRow: number | null;
  /** Short location, e.g. `p2 r41`. */
  sourceLabel: string;
  region: FieldRegion | null;
  confidence: number;
  /** The weakest field's level — what the confidence chip shows for the row. */
  level: ConfidenceLevel;
  displayName: string;
  fields: AssessedField[];
  issues: RowIssue[];
  duplicate: DuplicateInfo | null;
  duplicateDecision: DuplicateDecision | null;
  product: ProductMatch | null;
  existingCustomer: DuplicateMatch | null;
  state: RowState;
  stateReason: string | null;
  /** Why a blocked/needs-review row cannot import yet. */
  blockedBy: 'reconciliation' | 'error' | 'duplicate' | 'review' | null;
  plan: RowPlan;
  result: DigitizerRowResult | null;
}

export interface LineItemAssessment {
  index: number;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  /** The total actually used in the sum: the written line total, else quantity × unit price. */
  effectiveTotal: number | null;
  missing: string[];
  reconciles: boolean | null;
}

export interface Reconciliation {
  kind: 'invoice' | 'ledger';
  ok: boolean;
  calculated: number;
  stated: number | null;
  difference: number | null;
  /** Line numbers (1-based) with a value that could not be read, so their total is not in the sum. */
  unreadableLines: { index: number; missing: string[] }[];
  components: { label: string; value: number }[];
  lines: LineItemAssessment[];
  message: string;
}

export interface DocIssue {
  code: string;
  severity: 'critical' | 'warning';
  title: string;
  /** e.g. `9 rows · left blank`. */
  detail: string;
  affected: number;
  rowIds: string[];
  /** Whether this stops the whole document, only the affected rows, or nothing. */
  blocks: 'document' | 'rows' | 'none';
  cause: string | null;
}

export interface ImportPlanCounts {
  create: number;
  update: number;
  skip: number;
  blocked: number;
  written: number;
}

export interface DocumentAssessment {
  rows: AssessedRow[];
  issues: DocIssue[];
  reconciliation: Reconciliation | null;
  counts: {
    rows: number;
    ready: number;
    needsReview: number;
    blocked: number;
    skipped: number;
    imported: number;
    failed: number;
    corrected: number;
    rowsByLevel: Record<ConfidenceLevel, number>;
    fieldsExtracted: number;
    high: number;
    medium: number;
    low: number;
    unreadable: number;
    duplicates: number;
  };
  plan: ImportPlanCounts;
  planByDestination: Partial<Record<DigitizerDestination, ImportPlanCounts>>;
  status: DocStatus;
  /** Every destination this document's rows go to. */
  destinations: DigitizerDestination[];
}

// ───────────────────────────── helpers ─────────────────────────────

export function isBlank(v: unknown): boolean {
  return (
    v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
  );
}

function asText(v: unknown): string | null {
  if (isBlank(v)) return null;
  return String(v).trim();
}

export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  // The first number in the text — "Rs. 1,250.50" and "$40" both read as numbers, "abc" does not.
  const match = /-?\d[\d,]*(?:\.\d+)?|-?\.\d+/.exec(v);
  if (!match) return null;
  const n = Number(match[0].replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatAmount(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(round2(n));
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `YYYY-MM-DD` only — anything else is not a date this build will import. */
export function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(m[2]) - 1
    ? null
    : d;
}

export function levelForConfidence(
  confidence: number,
  reviewThreshold: number,
): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE) return 'high';
  if (confidence >= reviewThreshold) return 'medium';
  if (confidence > 0) return 'low';
  return 'unreadable';
}

const LEVEL_RANK: Record<ConfidenceLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
  unreadable: 3,
};

// ───────────────────────────── normalization ─────────────────────────────

interface Normalized {
  value: string | null;
  note: string | null;
  invalid: boolean;
}

export function normalizeField(
  kind: FieldKind,
  raw: unknown,
  ctx: Pick<RulesContext, 'country'>,
): Normalized {
  const text = asText(raw);
  if (text === null) return { value: null, note: null, invalid: false };

  switch (kind) {
    case 'phone': {
      const e164 = normalizePhoneE164(text, ctx.country ?? undefined);
      if (!e164) return { value: text, note: null, invalid: true };
      const hadCountryCode = text.trim().startsWith('+');
      return {
        value: e164,
        note:
          e164 === text
            ? null
            : hadCountryCode
              ? 'Spacing removed'
              : `Local format to international${ctx.country ? ` (${ctx.country})` : ''}`,
        invalid: false,
      };
    }
    case 'email': {
      const lowered = text.toLowerCase();
      return {
        value: lowered,
        note: lowered === text ? null : 'Lower-cased',
        invalid: !EMAIL_RE.test(lowered),
      };
    }
    case 'money': {
      const n = parseAmount(raw);
      if (n === null) return { value: text, note: null, invalid: true };
      const out = String(round2(n));
      return {
        value: out,
        note: out === text ? null : 'Currency symbol and separators removed',
        invalid: false,
      };
    }
    case 'int': {
      const n = parseAmount(raw);
      if (n === null || !Number.isInteger(n))
        return { value: text, note: null, invalid: true };
      const out = String(n);
      return {
        value: out,
        note: out === text ? null : 'Read as a whole number',
        invalid: false,
      };
    }
    case 'date': {
      const d = parseIsoDate(text);
      if (!d) return { value: text, note: null, invalid: true };
      const out = d.toISOString().slice(0, 10);
      return {
        value: out,
        note: out === text ? null : 'Reformatted as YYYY-MM-DD',
        invalid: false,
      };
    }
    case 'sku': {
      const out = text.replace(/\s+/g, '').toUpperCase();
      return {
        value: out,
        note: out === text ? null : 'Uppercased and trimmed',
        invalid: false,
      };
    }
    default: {
      const out = text.replace(/\s+/g, ' ');
      return {
        value: out,
        note: out === text ? null : 'Whitespace tidied',
        invalid: false,
      };
    }
  }
}

// ───────────────────────────── row assessment ─────────────────────────────

const QUANTITY_FIELDS = new Set(['stockQty', 'countedQty']);
const AMOUNT_MUST_BE_POSITIVE = new Set([
  'expense.amount',
  'credit_opening_balance.amount',
]);

function fieldLevel(
  row: DigitizerRow,
  field: string,
  blank: boolean,
  ctx: RulesContext,
): { level: ConfidenceLevel; confidence: number | null } {
  const perField = row.fieldConfidence?.[field];
  if (blank) return { level: 'unreadable', confidence: null };
  const confidence = typeof perField === 'number' ? perField : row.confidence;
  return {
    level: levelForConfidence(confidence, ctx.reviewThreshold),
    confidence,
  };
}

function sourceLabelOf(page: number | null, sourceRow: number | null): string {
  if (page !== null && sourceRow !== null) return `p${page} r${sourceRow}`;
  if (page !== null) return `p${page}`;
  if (sourceRow !== null) return `r${sourceRow}`;
  return '—';
}

function displayNameOf(row: DigitizerRow, sourceLabel: string): string {
  const d = row.data;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const t = asText(d[k]);
      if (t) return t;
    }
    return null;
  };
  const name = pick('name', 'customerName', 'description');
  if (name) return name;
  const sku = pick('sku');
  if (sku) return sku;
  return sourceLabel === '—'
    ? 'Unnamed row'
    : `Row ${sourceLabel} · name blank`;
}

function assessFields(
  row: DigitizerRow,
  ctx: RulesContext,
): { fields: AssessedField[]; issues: RowIssue[] } {
  const specs = DESTINATION_FIELDS[row.destination];
  const known = new Set(specs.map((s) => s.field));
  const fields: AssessedField[] = [];
  const issues: RowIssue[] = [];
  const original = row.original ?? row.data;

  const build = (spec: DestinationField | null, field: string) => {
    const value = row.data[field];
    const blank = isBlank(value);
    const seenByModel =
      field in row.data ||
      (row.fieldConfidence && field in row.fieldConfidence);
    // An optional field the document simply does not have is not a problem — skip it entirely.
    if (spec && !spec.required && blank && !seenByModel) return;
    if (!spec && blank) return;

    const kind: FieldKind = spec?.kind ?? 'text';
    const norm = normalizeField(kind, value, ctx);
    const lvl = fieldLevel(row, field, blank, ctx);
    let issue: string | null = null;

    if (spec) {
      if (blank && spec.required) {
        issue = `${spec.label} is missing`;
        issues.push({
          code: 'missing_required',
          severity: 'error',
          field,
          message: issue,
        });
      } else if (!blank && norm.invalid) {
        const msg = invalidMessage(kind, spec.label);
        issue = msg;
        const blocking =
          spec.required ||
          kind === 'email' ||
          kind === 'money' ||
          kind === 'int' ||
          kind === 'date';
        issues.push({
          code: kind === 'phone' ? 'invalid_phone' : `invalid_${kind}`,
          severity: blocking ? 'error' : 'warning',
          field,
          message: msg,
        });
      } else if (!blank) {
        const n =
          kind === 'money' || kind === 'int' ? parseAmount(value) : null;
        if (n !== null && n < 0) {
          const code = QUANTITY_FIELDS.has(field)
            ? 'negative_quantity'
            : 'negative_amount';
          issue = `${spec.label} cannot be negative`;
          issues.push({ code, severity: 'error', field, message: issue });
        } else if (
          n !== null &&
          n === 0 &&
          AMOUNT_MUST_BE_POSITIVE.has(`${row.destination}.${field}`)
        ) {
          issue = `${spec.label} must be more than zero`;
          issues.push({
            code: 'zero_amount',
            severity: 'error',
            field,
            message: issue,
          });
        } else if (kind === 'date') {
          const d = parseIsoDate(norm.value);
          if (d && d.getTime() > ctx.now.getTime() + 24 * 3600 * 1000) {
            issue = 'Date is in the future';
            issues.push({
              code: 'future_date',
              severity: 'warning',
              field,
              message: issue,
            });
          }
        }
      }
    }

    fields.push({
      field,
      label: spec?.label ?? field,
      kind,
      required: spec?.required ?? false,
      target: spec?.target ?? null,
      original: asText(original[field]),
      value: asText(value),
      normalized: norm.value,
      normalization: norm.note,
      level: lvl.level,
      confidence: lvl.confidence,
      blank,
      issue,
    });
  };

  for (const spec of specs) build(spec, spec.field);
  for (const field of Object.keys(row.data)) {
    if (!known.has(field)) build(null, field);
  }
  return { fields, issues };
}

function invalidMessage(kind: FieldKind, label: string): string {
  switch (kind) {
    case 'phone':
      return `${label} could not be recognised as a phone number`;
    case 'email':
      return `${label} is not a valid email address`;
    case 'money':
      return `${label} is not a valid amount`;
    case 'int':
      return `${label} is not a whole number`;
    case 'date':
      return `${label} is not a valid date (expected YYYY-MM-DD)`;
    default:
      return `${label} is not valid`;
  }
}

export function assessRow(
  row: DigitizerRow,
  ctx: RulesContext,
  lookup: RowLookup | undefined,
  blockedByDocument: string | null,
): AssessedRow {
  const { fields, issues } = assessFields(row, ctx);
  const page = row.page ?? null;
  const sourceRow = row.sourceRow ?? null;
  const sourceLabel = sourceLabelOf(page, sourceRow);
  const duplicate = lookup?.duplicate ?? null;
  const product = lookup?.product ?? null;
  const existingCustomer = lookup?.existingCustomer ?? null;

  if (row.destination === 'inventory') {
    const hasKey = fields.some(
      (f) => (f.field === 'name' || f.field === 'sku') && !f.blank,
    );
    if (!hasKey) {
      issues.push({
        code: 'unidentified_product',
        severity: 'error',
        message: 'Neither a product name nor a SKU could be read',
      });
    } else if (!product) {
      issues.push({
        code: 'unmatched_product',
        severity: 'error',
        message: 'Matches no product in your catalog',
      });
    }
  }

  if (duplicate && duplicate.level === 'low') {
    issues.push({
      code: 'possible_duplicate',
      severity: 'warning',
      message: duplicate.basis,
    });
  }

  const mapped = fields.filter((f) => f.target !== null);
  const rowLevel = levelForConfidence(row.confidence, ctx.reviewThreshold);
  const worst = mapped.reduce<ConfidenceLevel>(
    (acc, f) => (LEVEL_RANK[f.level] > LEVEL_RANK[acc] ? f.level : acc),
    rowLevel,
  );

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const needsAttention =
    row.confidence < ctx.reviewThreshold ||
    mapped.some(
      (f) =>
        f.level === 'low' || (f.level === 'unreadable' && f.field in row.data),
    ) ||
    warnings.length > 0;
  const reviewed = row.reviewed === true;
  const decision = row.duplicateDecision ?? null;

  let state: RowState;
  let stateReason: string | null = null;
  let blockedBy: AssessedRow['blockedBy'] = null;
  let plan: RowPlan;

  if (
    row.result &&
    (row.result.status === 'created' || row.result.status === 'updated')
  ) {
    state = 'imported';
    plan = 'done';
  } else if (row.result?.status === 'skipped') {
    state = 'skipped';
    plan = 'done';
  } else if (row.action === 'skip') {
    state = 'skipped';
    plan = 'skip';
  } else if (blockedByDocument) {
    state = 'blocked';
    stateReason = blockedByDocument;
    blockedBy = 'reconciliation';
    plan = 'blocked';
  } else if (errors.length > 0) {
    state = 'blocked';
    stateReason = errors[0].message;
    blockedBy = 'error';
    plan = 'blocked';
  } else if (duplicate && duplicate.level === 'high' && !decision) {
    state = 'blocked';
    stateReason = 'Possible duplicate — choose use existing or create new';
    blockedBy = 'duplicate';
    plan = 'blocked';
  } else if (needsAttention && !reviewed) {
    state = 'needs_review';
    stateReason =
      warnings[0]?.message ?? 'Low confidence — check against the original';
    blockedBy = 'review';
    plan = 'blocked';
  } else if (row.result?.status === 'failed') {
    state = 'failed';
    stateReason = row.result.error ?? 'The last import attempt failed';
    plan = planFor(
      row.destination,
      duplicate,
      decision,
      product,
      existingCustomer,
      row.data,
    );
  } else {
    state = 'ready';
    plan = planFor(
      row.destination,
      duplicate,
      decision,
      product,
      existingCustomer,
      row.data,
    );
  }

  return {
    id: row.id,
    destination: row.destination,
    destinationLabel: DESTINATION_LABELS[row.destination],
    action: row.action,
    reviewed,
    corrected: row.corrected === true,
    page,
    sourceRow,
    sourceLabel,
    region: row.region ?? null,
    confidence: row.confidence,
    level: worst,
    displayName: displayNameOf(row, sourceLabel),
    fields,
    issues,
    duplicate,
    duplicateDecision: decision,
    product,
    existingCustomer,
    state,
    stateReason,
    blockedBy,
    plan,
    result: row.result ?? null,
  };
}

function planFor(
  destination: DigitizerDestination,
  duplicate: DuplicateInfo | null,
  decision: DuplicateDecision | null,
  product: ProductMatch | null,
  existingCustomer: DuplicateMatch | null,
  data: DigitizerRowData,
): RowPlan {
  if (destination === 'inventory') return product ? 'update' : 'blocked';
  if (destination === 'credit_opening_balance')
    return existingCustomer ? 'update' : 'create';
  if (duplicate && duplicate.level === 'high' && decision === 'use_existing') {
    if (destination === 'customer')
      return (parseAmount(data.balance) ?? 0) > 0 ? 'update' : 'skip';
    return 'skip';
  }
  return 'create';
}

// ───────────────────────────── reconciliation ─────────────────────────────

const TOLERANCE = 0.005;

export function reconcile(
  analysis: Pick<DigitizerAnalysis, 'lineItems' | 'totals' | 'ledger'>,
  currency: string,
): Reconciliation | null {
  if (
    analysis.ledger &&
    (analysis.ledger.entries.length > 0 ||
      analysis.ledger.statedClosingBalance !== null)
  ) {
    return reconcileLedger(analysis.ledger, currency);
  }
  if (
    analysis.lineItems.length > 0 &&
    analysis.totals &&
    analysis.totals.printedTotal !== null
  ) {
    return reconcileInvoice(analysis.lineItems, analysis.totals, currency);
  }
  return null;
}

export function assessLineItems(
  items: DigitizerAnalysis['lineItems'],
): LineItemAssessment[] {
  return items.map((it, i) => {
    const missing: string[] = [];
    if (it.quantity === null || it.quantity === undefined)
      missing.push('quantity');
    if (it.unitPrice === null || it.unitPrice === undefined)
      missing.push('unit price');
    if (it.lineTotal === null || it.lineTotal === undefined)
      missing.push('line total');

    let effective: number | null = null;
    if (typeof it.lineTotal === 'number') effective = it.lineTotal;
    else if (
      typeof it.quantity === 'number' &&
      typeof it.unitPrice === 'number'
    )
      effective = round2(it.quantity * it.unitPrice);

    const derivable =
      typeof it.quantity === 'number' &&
      typeof it.unitPrice === 'number' &&
      typeof it.lineTotal === 'number';
    return {
      index: i + 1,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      effectiveTotal: effective,
      missing,
      // A line's own arithmetic — only judged when all three figures were read.
      reconciles: derivable
        ? Math.abs(round2(it.quantity! * it.unitPrice!) - it.lineTotal!) <
          TOLERANCE
        : null,
    };
  });
}

function reconcileInvoice(
  items: DigitizerAnalysis['lineItems'],
  totals: NonNullable<DigitizerAnalysis['totals']>,
  currency: string,
): Reconciliation {
  const lines = assessLineItems(items);
  const unreadable = lines
    .filter((l) => l.effectiveTotal === null)
    .map((l) => ({
      index: l.index,
      missing: l.missing.length ? l.missing : ['line total'],
    }));
  const itemsSum = round2(
    lines.reduce((s, l) => s + (l.effectiveTotal ?? 0), 0),
  );
  const tax = totals.tax ?? 0;
  const discount = totals.discount ?? 0;
  const calculated = round2(itemsSum + tax - discount);
  const stated = totals.printedTotal;
  const difference = stated === null ? null : round2(stated - calculated);
  const ok = difference === null || Math.abs(difference) < TOLERANCE;

  const components: Reconciliation['components'] = [
    { label: 'Line items', value: itemsSum },
  ];
  if (totals.tax !== null) components.push({ label: 'Tax', value: totals.tax });
  if (totals.discount !== null)
    components.push({ label: 'Discount', value: -totals.discount });

  return {
    kind: 'invoice',
    ok,
    calculated,
    stated,
    difference,
    unreadableLines: unreadable,
    components,
    lines,
    message: ok
      ? `The ${lines.length} line item${lines.length === 1 ? '' : 's'} add up to the printed total.`
      : `The line items add to ${formatAmount(calculated, currency)} but the printed total reads ${formatAmount(stated ?? 0, currency)} — a ${formatAmount(Math.abs(difference ?? 0), currency)} gap.`,
  };
}

function reconcileLedger(
  ledger: NonNullable<DigitizerAnalysis['ledger']>,
  currency: string,
): Reconciliation {
  const opening = ledger.openingBalance ?? 0;
  const charges = round2(
    ledger.entries
      .filter((e) => e.kind === 'charge')
      .reduce((s, e) => s + (e.amount ?? 0), 0),
  );
  const payments = round2(
    ledger.entries
      .filter((e) => e.kind === 'payment')
      .reduce((s, e) => s + (e.amount ?? 0), 0),
  );
  const calculated = round2(opening + charges - payments);
  const stated = ledger.statedClosingBalance;
  const difference = stated === null ? null : round2(stated - calculated);
  const ok = difference === null || Math.abs(difference) < TOLERANCE;
  const unreadable = ledger.entries
    .map((e, i) => ({
      index: i + 1,
      missing: e.amount === null ? ['amount'] : [],
    }))
    .filter((e) => e.missing.length > 0);

  return {
    kind: 'ledger',
    ok,
    calculated,
    stated,
    difference,
    unreadableLines: unreadable,
    components: [
      { label: 'Opening balance', value: opening },
      { label: 'Charges', value: charges },
      { label: 'Payments', value: -payments },
    ],
    lines: [],
    message: ok
      ? 'Opening balance plus charges minus payments matches the written closing balance.'
      : `Opening balance plus charges minus payments gives ${formatAmount(calculated, currency)}, but the written closing balance reads ${formatAmount(stated ?? 0, currency)} — a ${formatAmount(Math.abs(difference ?? 0), currency)} difference.`,
  };
}

// ───────────────────────────── document assessment ─────────────────────────────

export interface DocumentInput {
  batchStatus: 'pending' | 'processing' | 'completed' | 'failed';
  stage: string | null;
  rows: DigitizerRow[];
  analysis: Pick<DigitizerAnalysis, 'lineItems' | 'totals' | 'ledger'> | null;
}

export function assessDocument(
  input: DocumentInput,
  ctx: RulesContext,
  lookups: Map<string, RowLookup>,
): DocumentAssessment {
  const reconciliation = input.analysis
    ? reconcile(input.analysis, ctx.currency)
    : null;
  const mismatch = reconciliation && !reconciliation.ok ? reconciliation : null;

  const rows = input.rows.map((r) => {
    let blockedByDocument: string | null = null;
    if (
      mismatch?.kind === 'ledger' &&
      HIGH_RISK_DESTINATIONS.includes(r.destination)
    ) {
      blockedByDocument =
        'The ledger does not reconcile — credit data is blocked until it does';
    } else if (mismatch?.kind === 'invoice' && r.destination === 'expense') {
      blockedByDocument = 'Line items do not add up to the printed total';
    }
    return assessRow(r, ctx, lookups.get(r.id), blockedByDocument);
  });

  const counts = {
    rows: rows.length,
    ready: 0,
    needsReview: 0,
    blocked: 0,
    skipped: 0,
    imported: 0,
    failed: 0,
    corrected: 0,
    rowsByLevel: { high: 0, medium: 0, low: 0, unreadable: 0 } as Record<
      ConfidenceLevel,
      number
    >,
    fieldsExtracted: 0,
    high: 0,
    medium: 0,
    low: 0,
    unreadable: 0,
    duplicates: 0,
  };
  const plan: ImportPlanCounts = {
    create: 0,
    update: 0,
    skip: 0,
    blocked: 0,
    written: 0,
  };
  const planByDestination: Partial<
    Record<DigitizerDestination, ImportPlanCounts>
  > = {};
  const destinations = new Set<DigitizerDestination>();

  for (const r of rows) {
    destinations.add(r.destination);
    if (r.state === 'ready') counts.ready += 1;
    else if (r.state === 'needs_review') counts.needsReview += 1;
    else if (r.state === 'blocked') counts.blocked += 1;
    else if (r.state === 'skipped') counts.skipped += 1;
    else if (r.state === 'imported') counts.imported += 1;
    else if (r.state === 'failed') counts.failed += 1;
    if (r.corrected) counts.corrected += 1;
    if (r.duplicate) counts.duplicates += 1;
    counts.rowsByLevel[r.level] += 1;
    for (const f of r.fields) {
      if (f.blank && f.level !== 'unreadable') continue;
      if (f.level === 'unreadable') counts.unreadable += 1;
      else {
        counts.fieldsExtracted += 1;
        counts[f.level] += 1;
      }
    }

    const bucket = (planByDestination[r.destination] ??= {
      create: 0,
      update: 0,
      skip: 0,
      blocked: 0,
      written: 0,
    });
    if (r.plan === 'create') {
      plan.create += 1;
      bucket.create += 1;
    } else if (r.plan === 'update') {
      plan.update += 1;
      bucket.update += 1;
    } else if (r.plan === 'skip') {
      plan.skip += 1;
      bucket.skip += 1;
    } else if (r.plan === 'blocked') {
      plan.blocked += 1;
      bucket.blocked += 1;
    } else if (r.state === 'imported') {
      plan.written += 1;
      bucket.written += 1;
    }
  }

  const issues = buildIssues(rows, reconciliation, ctx);
  const status = deriveStatus(input, rows, reconciliation);

  return {
    rows,
    issues,
    reconciliation,
    counts,
    plan,
    planByDestination,
    status,
    destinations: [...destinations],
  };
}

function deriveStatus(
  input: DocumentInput,
  rows: AssessedRow[],
  reconciliation: Reconciliation | null,
): DocStatus {
  if (input.batchStatus === 'processing')
    return input.stage === 'queued' || !input.stage ? 'queued' : 'processing';
  if (input.batchStatus === 'failed') return 'failed';
  if (input.batchStatus === 'completed') return 'imported';
  if (
    rows.length > 0 &&
    rows.every((r) => r.state === 'imported' || r.state === 'skipped') &&
    rows.some((r) => r.state === 'imported')
  )
    return 'imported';
  if (reconciliation && !reconciliation.ok) {
    const open = rows.some(
      (r) => r.state !== 'imported' && r.state !== 'skipped',
    );
    if (open)
      return reconciliation.kind === 'ledger' ? 'unbalanced' : 'total_mismatch';
  }
  const open = rows.filter(
    (r) => r.state !== 'imported' && r.state !== 'skipped',
  );
  if (
    open.some(
      (r) =>
        r.state === 'blocked' ||
        r.state === 'needs_review' ||
        r.state === 'failed',
    )
  )
    return 'needs_review';
  return 'ready';
}

function buildIssues(
  rows: AssessedRow[],
  reconciliation: Reconciliation | null,
  ctx: RulesContext,
): DocIssue[] {
  const issues: DocIssue[] = [];

  if (reconciliation && !reconciliation.ok) {
    const gap = formatAmount(
      Math.abs(reconciliation.difference ?? 0),
      ctx.currency,
    );
    const affected = rows.filter(
      (r) =>
        r.state !== 'imported' &&
        (reconciliation.kind === 'ledger'
          ? HIGH_RISK_DESTINATIONS.includes(r.destination)
          : r.destination === 'expense'),
    );
    const unreadable = reconciliation.unreadableLines;
    issues.push({
      code:
        reconciliation.kind === 'ledger'
          ? 'ledger_unbalanced'
          : 'total_mismatch',
      severity: 'critical',
      title:
        reconciliation.kind === 'ledger'
          ? 'Credit ledger closing balance does not reconcile'
          : 'Invoice line items do not sum to the printed total',
      detail: `1 document · ${gap} gap`,
      affected: affected.length,
      rowIds: affected.map((r) => r.id),
      blocks: reconciliation.kind === 'ledger' ? 'document' : 'rows',
      cause:
        unreadable.length > 0
          ? reconciliation.kind === 'invoice'
            ? `Line ${unreadable.map((u) => u.index).join(', ')} ${unreadable[0].missing.join(' / ')} could not be read`
            : `Ledger entry ${unreadable.map((u) => u.index).join(', ')} has an unreadable amount`
          : reconciliation.kind === 'ledger'
            ? 'The written balance does not follow from the entries — a discrepancy in the paper itself'
            : 'Every line was read, so the difference is on the paper (or in a value that was misread as a different number)',
    });
  }

  const group = (code: string) =>
    rows.filter(
      (r) => r.state !== 'imported' && r.issues.some((i) => i.code === code),
    );

  const missing = group('missing_required');
  if (missing.length) {
    issues.push({
      code: 'missing_required',
      severity: 'warning',
      title: 'Required fields could not be read',
      detail: `${missing.length} row${missing.length === 1 ? '' : 's'} · left blank, not guessed`,
      affected: missing.length,
      rowIds: missing.map((r) => r.id),
      blocks: 'rows',
      cause:
        'The value is unreadable or absent from the document, so it was left empty instead of filled with a guess',
    });
  }

  const invalid = rows.filter(
    (r) =>
      r.state !== 'imported' &&
      r.issues.some(
        (i) =>
          i.code.startsWith('invalid_') ||
          i.code === 'negative_quantity' ||
          i.code === 'negative_amount' ||
          i.code === 'zero_amount',
      ),
  );
  if (invalid.length) {
    issues.push({
      code: 'invalid_values',
      severity: 'warning',
      title: 'Values in an invalid format',
      detail: `${invalid.length} row${invalid.length === 1 ? '' : 's'} · phone, email, amount or date`,
      affected: invalid.length,
      rowIds: invalid.map((r) => r.id),
      blocks: 'rows',
      cause:
        'A value was read but is not a valid phone number, email, amount or date',
    });
  }

  const unmatched = group('unmatched_product');
  if (unmatched.length) {
    issues.push({
      code: 'unmatched_product',
      severity: 'warning',
      title: 'Products match nothing in your catalog',
      detail: `${unmatched.length} row${unmatched.length === 1 ? '' : 's'} · may be new or misread`,
      affected: unmatched.length,
      rowIds: unmatched.map((r) => r.id),
      blocks: 'rows',
      cause:
        'No product has this SKU or name. A new product is never created from a stock count.',
    });
  }

  const future = group('future_date');
  if (future.length) {
    issues.push({
      code: 'future_date',
      severity: 'warning',
      title: 'Date is in the future',
      detail: `${future.length} row${future.length === 1 ? '' : 's'} · likely a written or misread date`,
      affected: future.length,
      rowIds: future.map((r) => r.id),
      blocks: 'none',
      cause: null,
    });
  }

  const dupHigh = rows.filter(
    (r) =>
      r.state !== 'imported' &&
      r.duplicate?.level === 'high' &&
      !r.duplicateDecision &&
      r.action === 'commit',
  );
  if (dupHigh.length) {
    issues.push({
      code: 'duplicate_high',
      severity: 'warning',
      title: 'Records that match existing data',
      detail: `${dupHigh.length} row${dupHigh.length === 1 ? '' : 's'} · waiting for your decision`,
      affected: dupHigh.length,
      rowIds: dupHigh.map((r) => r.id),
      blocks: 'rows',
      cause:
        'A phone, email or SKU matches a record you already have. Nothing is merged automatically.',
    });
  }

  const lowConfidence = rows.filter(
    (r) =>
      r.state === 'needs_review' &&
      r.fields.some(
        (f) => f.level === 'low' || (f.level === 'unreadable' && !f.required),
      ),
  );
  if (lowConfidence.length) {
    issues.push({
      code: 'low_confidence',
      severity: 'warning',
      title: 'Fields read with low confidence',
      detail: `${lowConfidence.length} row${lowConfidence.length === 1 ? '' : 's'} · check against the original`,
      affected: lowConfidence.length,
      rowIds: lowConfidence.map((r) => r.id),
      blocks: 'rows',
      cause:
        'The model read something but is not sure. It stays flagged until you accept or correct it.',
    });
  }

  const failed = rows.filter((r) => r.state === 'failed');
  if (failed.length) {
    issues.push({
      code: 'import_failed',
      severity: 'critical',
      title: 'Rows that failed to import',
      detail: `${failed.length} row${failed.length === 1 ? '' : 's'} · reason kept on each row`,
      affected: failed.length,
      rowIds: failed.map((r) => r.id),
      blocks: 'rows',
      cause: failed[0].stateReason,
    });
  }

  return issues;
}

// ───────────────────────────── small shared pieces ─────────────────────────────

/** Row-level confidence, e.g. `72 high · 9 low · 3 unreadable` — counted from the rows, never typed in. */
export function confidenceSummary(
  counts: DocumentAssessment['counts'],
): string {
  if (counts.rows === 0) return 'Nothing extracted';
  const by = counts.rowsByLevel;
  if (by.medium === 0 && by.low === 0 && by.unreadable === 0) return 'All high';
  const parts: string[] = [];
  if (by.high > 0) parts.push(`${by.high} high`);
  if (by.medium > 0) parts.push(`${by.medium} medium`);
  if (by.low > 0) parts.push(`${by.low} low`);
  if (by.unreadable > 0) parts.push(`${by.unreadable} unreadable`);
  return parts.join(' · ');
}
