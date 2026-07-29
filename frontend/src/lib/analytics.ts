export interface KpiCard {
  key: string;
  label: string;
  value: string;
  deltaPercent: number;
  href: string;
}

/** Mock KPIs — real aggregate is GET /analytics/kpis (BE-071), live wiring is INT-010. */
export const KPI_CARDS: KpiCard[] = [
  { key: "revenue", label: "Revenue (30d)", value: "$18,420", deltaPercent: 12.4, href: "/profit" },
  { key: "orders", label: "Orders (30d)", value: "312", deltaPercent: 6.1, href: "/orders" },
  { key: "customers", label: "New customers", value: "24", deltaPercent: -3.2, href: "/customers" },
  { key: "rating", label: "Average rating", value: "4.8", deltaPercent: 2.1, href: "/reviews" },
];

/** Daily revenue for the trailing 30 days. */
export const REVENUE_SERIES = [
  520, 480, 610, 590, 640, 700, 680, 590, 610, 720, 750, 690, 640, 710, 780, 800, 760, 720, 690, 730, 810, 840, 790, 760, 820, 860,
  900, 870, 830, 880,
];

export interface CohortRow {
  cohort: string;
  retention: number[];
}

/** Mock 4-month retention cohort grid (percent of cohort still active in month N). */
export const COHORTS: CohortRow[] = [
  { cohort: "Apr 2026", retention: [100, 62, 48, 41] },
  { cohort: "May 2026", retention: [100, 58, 45, 39] },
  { cohort: "Jun 2026", retention: [100, 65, 51, 0] },
  { cohort: "Jul 2026", retention: [100, 60, 0, 0] },
];

export interface ChannelStat {
  channel: string;
  sent: number;
  delivered: number;
}

export const CHANNEL_STATS: ChannelStat[] = [
  { channel: "WhatsApp", sent: 540, delivered: 528 },
  { channel: "SMS", sent: 80, delivered: 79 },
  { channel: "Email", sent: 20, delivered: 18 },
];
