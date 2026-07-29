import type { Role } from "@/lib/nav-items";

export type CommissionRule = { type: "percent"; rate: number } | { type: "perService"; amount: number } | { type: "none" };

export interface Staff {
  id: string;
  name: string;
  role: Role;
  phone: string;
  /** One of the validated chart color slots — used to color-code calendar blocks per staff member. */
  color: string;
  commissionRule: CommissionRule;
  active: boolean;
}

/** Mock roster — real invites/commissions/attendance are BE-056/057/058, live wiring is INT-009. */
export const STAFF: Staff[] = [
  { id: "s1", name: "Amara Osei", role: "owner", phone: "+1 555 013 3305", color: "var(--chart-1)", commissionRule: { type: "none" }, active: true },
  { id: "s2", name: "Devon Marsh", role: "manager", phone: "+1 555 013 8842", color: "var(--chart-3)", commissionRule: { type: "percent", rate: 15 }, active: true },
  { id: "s3", name: "Priya Nair", role: "staff", phone: "+1 555 013 2210", color: "var(--chart-5)", commissionRule: { type: "percent", rate: 10 }, active: true },
  { id: "s4", name: "Jordan Blake", role: "staff", phone: "+1 555 013 5541", color: "var(--chart-2)", commissionRule: { type: "perService", amount: 5 }, active: true },
];

/** The staff record tied to the current mock session user (Amara Osei = s1) — used to default "my tasks" filters. */
export const CURRENT_STAFF_ID = "s1";

export function staffById(id: string): Staff | undefined {
  return STAFF.find((s) => s.id === id);
}

export function commissionRuleLabel(rule: CommissionRule): string {
  if (rule.type === "percent") return `${rule.rate}% per sale`;
  if (rule.type === "perService") return `$${rule.amount} per service`;
  return "No commission";
}
