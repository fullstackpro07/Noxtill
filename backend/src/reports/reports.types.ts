export type ReportKind = 'monthly' | 'pnl' | 'sales' | 'staff' | 'reviews';

export const REPORT_LABELS: Record<ReportKind, string> = {
  monthly: 'Monthly summary',
  pnl: 'Profit & loss',
  sales: 'Sales report',
  staff: 'Staff performance',
  reviews: 'Reviews summary',
};

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
