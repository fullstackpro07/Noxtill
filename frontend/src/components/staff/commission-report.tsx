"use client";

import { STAFF, commissionRuleLabel } from "@/lib/staff";
import { COMMISSION_DATA, commissionEarned } from "@/lib/commissions";
import { formatCurrency } from "@/lib/format";

export function CommissionReport({ currency }: { currency: string }) {
  const rows = STAFF.filter((s) => s.commissionRule.type !== "none").map((staff) => {
    const entry = COMMISSION_DATA.find((c) => c.staffId === staff.id);
    const earned = entry ? commissionEarned(staff.commissionRule, entry) : 0;
    return { staff, entry, earned };
  });

  const totalEarned = rows.reduce((sum, r) => sum + r.earned, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-fg-muted">July 2026</p>
        <p className="text-sm font-medium text-fg">Total: {formatCurrency(totalEarned, currency)}</p>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Staff</th>
              <th className="px-4 py-3 text-start">Rule</th>
              <th className="px-4 py-3 text-start">Sales</th>
              <th className="px-4 py-3 text-start">Services</th>
              <th className="px-4 py-3 text-start">Earned</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ staff, entry, earned }) => (
              <tr key={staff.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium text-fg">{staff.name}</td>
                <td className="px-4 py-3 text-fg-muted">{commissionRuleLabel(staff.commissionRule)}</td>
                <td className="px-4 py-3 text-fg-muted">{entry ? formatCurrency(entry.salesTotal, currency) : "—"}</td>
                <td className="px-4 py-3 text-fg-muted">{entry?.servicesCount ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-fg">{formatCurrency(earned, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
