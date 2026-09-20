/**
 * The structured result of computing one report. It is the single source both the PDF
 * (`report-renderer.ts`) and the on-screen preview/drawer read from, and it is stored verbatim as
 * `ReportRun.snapshot` — so what a recipient was sent can always be shown again exactly as it was,
 * and two versions of the same report can be compared figure for figure.
 *
 * Everything here is display-ready strings PLUS the raw `metrics` numbers. Strings are formatted
 * once, server-side, in the business's own currency/locale, so the PDF and the preview can never
 * disagree with each other.
 */

export type ReportTone = 'pos' | 'neg' | 'neutral';

export interface ReportKpi {
  label: string;
  display: string;
  /** Change vs. the previous period, only when a real previous-period figure exists. */
  delta?: string;
  deltaDir?: 'up' | 'down' | 'flat';
  /** Whether `up` is good news for this figure (revenue) or bad (credit outstanding). */
  upIsGood?: boolean;
}

export interface ReportTableColumn {
  key: string;
  label: string;
  align: 'left' | 'right' | 'center';
}

export interface ReportTable {
  title: string;
  columns: ReportTableColumn[];
  rows: Record<string, string>[];
  /** Shown when there are no rows, instead of an empty table. */
  emptyText: string;
}

export interface ReportBars {
  title: string;
  bars: { label: string; value: number }[];
}

export interface ReportRow {
  label: string;
  value: string;
  tone?: ReportTone;
  /** Marks a row that opens the source records behind it (Lineage section). */
  link?: boolean;
}

export type ValidationStatus = 'reconciled' | 'warning' | 'critical';

export interface ReportValidation {
  status: ValidationStatus;
  checks: ReportRow[];
  /** Records left out of a calculation for missing data — named, never silently zero. */
  exclusions: string[];
  /** The headline figure as the report shows it, and the same figure recomputed independently. */
  reportTotal?: string;
  sourceTotal?: string;
  difference?: string;
}

export interface ReportSource {
  module: string;
  records: number;
}

export interface ReportData {
  kind: string;
  title: string;
  /** YYYY-MM */
  period: string;
  /** e.g. "1–31 August 2026" */
  periodLabel: string;
  currency: string;
  summary: string;
  kpis: ReportKpi[];
  bars?: ReportBars;
  table?: ReportTable;
  /** Raw figures keyed by name — used to compare versions and to explain what changed. */
  metrics: Record<string, number>;
  /** The "Metrics" section: every calculated figure, terms never mixed. */
  metricRows: ReportRow[];
  /** The "Configuration" section: what defines this report. */
  configuration: ReportRow[];
  /** The "Lineage" section: source → filter → calculation → result for the headline figure. */
  lineage: ReportRow[];
  footnotes: string[];
  sources: ReportSource[];
  recordsCount: number;
  validation: ReportValidation;
  formats: string[];
}

/** Every report kind the module can produce, with its library-card copy and icon. */
export interface ReportCatalogEntry {
  kind: string;
  name: string;
  description: string;
  icon: string;
  /** Who may generate it. Mirrors the checks in `ReportBuildersService`. */
  roles: ('owner' | 'manager' | 'staff')[];
}
