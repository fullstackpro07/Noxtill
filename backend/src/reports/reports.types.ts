import type { ReportCatalogEntry } from './report-data.types';

export type ReportKind =
  | 'monthly'
  | 'pnl'
  | 'sales'
  | 'staff'
  | 'reviews'
  | 'inventory'
  | 'credit_recovery'
  | 'tax'
  | 'marketing'
  | 'product_performance';

export const REPORT_LABELS: Record<ReportKind, string> = {
  monthly: 'Monthly business report',
  pnl: 'Profit & loss',
  sales: 'Sales report',
  staff: 'Staff performance',
  reviews: 'Reviews report',
  inventory: 'Inventory report',
  credit_recovery: 'Credit recovery',
  tax: 'Tax summary',
  marketing: 'Marketing performance',
  product_performance: 'Product performance',
};

/** Library-card copy and icon (a Lucide icon name) for every report. */
export const REPORT_CATALOG: (ReportCatalogEntry & { kind: ReportKind })[] = [
  {
    kind: 'monthly',
    name: REPORT_LABELS.monthly,
    description:
      'Revenue, orders, profit, expenses, credit and reviews for the month in one document',
    icon: 'file-text',
    roles: ['owner', 'manager', 'staff'],
  },
  {
    kind: 'pnl',
    name: REPORT_LABELS.pnl,
    description:
      'Revenue, cost of goods, gross profit, operating expenses, net profit and margin',
    icon: 'chart-no-axes-combined',
    roles: ['owner', 'manager', 'staff'],
  },
  {
    kind: 'sales',
    name: REPORT_LABELS.sales,
    description: 'Every completed order for the month with its customer and total',
    icon: 'shopping-cart',
    roles: ['owner', 'manager', 'staff'],
  },
  {
    kind: 'product_performance',
    name: REPORT_LABELS.product_performance,
    description:
      'Units, revenue, cost, gross profit and margin per product for the month',
    icon: 'package',
    roles: ['owner', 'manager'],
  },
  {
    kind: 'staff',
    name: REPORT_LABELS.staff,
    description: 'Sales and commission per staff member for the month',
    icon: 'users-round',
    roles: ['owner', 'manager'],
  },
  {
    kind: 'reviews',
    name: REPORT_LABELS.reviews,
    description:
      'Rating, review count, star split and how many review requests were answered',
    icon: 'star',
    roles: ['owner', 'manager', 'staff'],
  },
  {
    kind: 'inventory',
    name: REPORT_LABELS.inventory,
    description:
      'Stock on hand, inventory value, low and out of stock, fast and slow movers',
    icon: 'boxes',
    roles: ['owner', 'manager'],
  },
  {
    kind: 'credit_recovery',
    name: REPORT_LABELS.credit_recovery,
    description:
      'Outstanding, recovered, written off, aging buckets and the recovery trend',
    icon: 'credit-card',
    roles: ['owner'],
  },
  {
    kind: 'tax',
    name: REPORT_LABELS.tax,
    description:
      'Taxable sales, tax collected, refund adjustments and net tax for the period',
    icon: 'receipt-text',
    roles: ['owner', 'manager', 'staff'],
  },
  {
    kind: 'marketing',
    name: REPORT_LABELS.marketing,
    description:
      'Campaigns sent, messages by channel and how many were delivered, read or failed',
    icon: 'megaphone',
    roles: ['owner', 'manager'],
  },
];

export const REPORT_KINDS: ReportKind[] = REPORT_CATALOG.map((c) => c.kind);

export function isReportKind(value: string): value is ReportKind {
  return value in REPORT_LABELS;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

/** The calendar month immediately before `month` (YYYY-MM). */
export function previousMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "1–31 August 2026" — the human label for a report's period. */
export function monthLabel(month: string): string {
  const { start, end } = monthBounds(month);
  const lastDay = new Date(end.getTime() - 1).getUTCDate();
  const name = start.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `1–${lastDay} ${name}`;
}
