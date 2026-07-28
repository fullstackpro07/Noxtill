export interface HourlyRevenue {
  hour: number;
  revenue: number;
}

/** Mock hourly revenue for today — real aggregate is GET /profit/time (BE-036). */
export const HOURLY_REVENUE: HourlyRevenue[] = [
  { hour: 9, revenue: 45 },
  { hour: 10, revenue: 120 },
  { hour: 11, revenue: 210 },
  { hour: 12, revenue: 95 },
  { hour: 13, revenue: 160 },
  { hour: 14, revenue: 240 },
  { hour: 15, revenue: 380 },
  { hour: 16, revenue: 310 },
  { hour: 17, revenue: 190 },
  { hour: 18, revenue: 130 },
];

export function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour;
  return `${display}${period}`;
}

export function peakHourInsight(data: HourlyRevenue[]): string {
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const peak = data.reduce((max, d) => (d.revenue > max.revenue ? d : max), data[0]);
  const share = total > 0 ? Math.round((peak.revenue / total) * 100) : 0;
  return `Your busiest hour is ${formatHour(peak.hour)}–${formatHour(peak.hour + 1)}, generating ${share}% of today's revenue.`;
}

export interface PnlStatement {
  month: string;
  revenue: number;
  cogs: number;
  expenses: number;
}

/** Mock statement — real GET /profit/pnl?month sums revenue − COGS − expenses (BE-037). */
export const PNL_STATEMENT: PnlStatement = {
  month: "July 2026",
  revenue: 18420,
  cogs: 5230,
  expenses: 8565,
};

export function netProfit(statement: PnlStatement): number {
  return statement.revenue - statement.cogs - statement.expenses;
}
