export interface BranchMetrics {
  branchId: string;
  name: string;
  revenue: number;
  orders: number;
  avgTicket: number;
  reviewAvg: number;
}

/** Mock roll-up — real aggregate comes from GET /rollup/dashboard and /rollup/compare (BE-059), live wiring is INT-009. */
export const BRANCH_METRICS: BranchMetrics[] = [
  { branchId: "b1", name: "Downtown", revenue: 18420, orders: 312, avgTicket: 59, reviewAvg: 4.7 },
  { branchId: "b2", name: "Riverside Mall", revenue: 11860, orders: 204, avgTicket: 58, reviewAvg: 4.4 },
];

export function totalAcrossBranches(metrics: BranchMetrics[]): Omit<BranchMetrics, "branchId" | "name"> {
  const revenue = metrics.reduce((sum, m) => sum + m.revenue, 0);
  const orders = metrics.reduce((sum, m) => sum + m.orders, 0);
  const reviewAvg = metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.reviewAvg, 0) / metrics.length : 0;
  return { revenue, orders, avgTicket: orders > 0 ? revenue / orders : 0, reviewAvg };
}
