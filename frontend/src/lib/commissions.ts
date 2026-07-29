import type { CommissionRule } from "@/lib/staff";

export interface CommissionEntry {
  staffId: string;
  month: string;
  salesTotal: number;
  servicesCount: number;
}

/** Mock month of sales attribution per staff — real commission math is BE-058 (sales × rule), live wiring is INT-009. */
export const COMMISSION_DATA: CommissionEntry[] = [
  { staffId: "s2", month: "July 2026", salesTotal: 3200, servicesCount: 28 },
  { staffId: "s3", month: "July 2026", salesTotal: 2450, servicesCount: 34 },
  { staffId: "s4", month: "July 2026", salesTotal: 1890, servicesCount: 22 },
];

export function commissionEarned(rule: CommissionRule, entry: CommissionEntry): number {
  if (rule.type === "percent") return entry.salesTotal * (rule.rate / 100);
  if (rule.type === "perService") return entry.servicesCount * rule.amount;
  return 0;
}
