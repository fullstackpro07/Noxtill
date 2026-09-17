"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/customers-api";
import { fetchDebtors } from "@/lib/credit-api";
import { fetchCustomerDuplicates } from "@/lib/customer-duplicates-api";
import { lifecycleOf, daysSince, HIGH_VALUE_THRESHOLD, MEDIUM_VALUE_THRESHOLD } from "@/lib/customer-lifecycle";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";

export function CustomerInsightsPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const { data: duplicates = [] } = useQuery({ queryKey: ["customer-duplicates"], queryFn: fetchCustomerDuplicates });

  const stats = useMemo(() => {
    const n = customers.length || 1;
    const avgReturnFor = (c: (typeof customers)[number]) => {
      if (c.visitCount < 2 || !c.lastVisitAt) return null;
      const span = new Date(c.lastVisitAt).getTime() - new Date(c.createdAt).getTime();
      return Math.max(1, span / (c.visitCount - 1) / (1000 * 60 * 60 * 24));
    };
    const returns = customers.map(avgReturnFor).filter((v): v is number => v !== null);
    const atRisk = customers.filter((c) => { const lc = lifecycleOf(c); return lc === "At Risk" || lc === "Lapsed" || lc === "Dormant"; });
    return {
      avgLtv: customers.reduce((s, c) => s + c.lifetimeSpend, 0) / n,
      repeatRate: Math.round((customers.filter((c) => c.visitCount > 1).length / n) * 100),
      retention: Math.round((customers.filter((c) => daysSince(c.lastVisitAt) <= 90).length / n) * 100),
      avgSpend: customers.reduce((s, c) => s + (c.visitCount ? c.lifetimeSpend / c.visitCount : 0), 0) / n,
      avgVisitGap: returns.length ? Math.round(returns.reduce((s, v) => s + v, 0) / returns.length) : null,
      atRiskCount: atRisk.length,
      oneVisit: customers.filter((c) => c.visitCount === 1).length,
      incomplete: customers.filter((c) => !c.email || c.tags.length === 0).length,
    };
  }, [customers]);

  const valueBands = useMemo(() => {
    const total = customers.reduce((s, c) => s + c.lifetimeSpend, 0) || 1;
    const bands = [
      { label: `High value — over ${formatCurrency(HIGH_VALUE_THRESHOLD, currency)}`, list: customers.filter((c) => c.lifetimeSpend > HIGH_VALUE_THRESHOLD), color: "#12A150" },
      { label: `Medium — ${formatCurrency(MEDIUM_VALUE_THRESHOLD, currency)} to ${formatCurrency(HIGH_VALUE_THRESHOLD, currency)}`, list: customers.filter((c) => c.lifetimeSpend > MEDIUM_VALUE_THRESHOLD && c.lifetimeSpend <= HIGH_VALUE_THRESHOLD), color: "#2563EB" },
      { label: `Low — under ${formatCurrency(MEDIUM_VALUE_THRESHOLD, currency)}`, list: customers.filter((c) => c.lifetimeSpend <= MEDIUM_VALUE_THRESHOLD), color: "#98A2B3" },
    ];
    return bands.map((b) => {
      const amount = b.list.reduce((s, c) => s + c.lifetimeSpend, 0);
      return { ...b, amount, n: b.list.length, pct: Math.round((amount / total) * 100) };
    });
  }, [customers, currency]);

  const risks = [
    { t: "Churn risk", ev: `${stats.atRiskCount} customers overdue on their usual visit gap`, href: "/customers" },
    { t: "Credit exposure", ev: `${debtors.length} customers carry an outstanding balance`, href: "/credit" },
    { t: "Duplicate records", ev: `${duplicates.length} pair(s) may split a customer's history`, href: "/customers/duplicates" },
  ];
  const opportunities = [
    { t: "Reactivate lapsed customers", ev: `${stats.atRiskCount} customers past their usual return gap`, href: "/customers/segments" },
    { t: "Second visit push", ev: `${stats.oneVisit} customers have visited only once`, href: "/customers/segments" },
    { t: "Complete missing contact details", ev: `${stats.incomplete} profiles missing email or tags`, href: "/customers?filter=incomplete" },
  ];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Lifetime Spend</div>
          <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(stats.avgLtv, currency)}</div>
          <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Actual spend to date, not a prediction</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Repeat Rate</div>
          <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-primary)" }}>{stats.repeatRate}%</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>90-Day Retention</div>
          <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats.retention}%</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Spend</div>
          <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(stats.avgSpend, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Visit Gap</div>
          <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats.avgVisitGap ? `${stats.avgVisitGap}d` : "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Churn Risk</div>
          <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats.atRiskCount}</div>
        </div>
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Where your revenue comes from</h3>
          <div className="flex flex-col gap-3">
            {valueBands.map((b) => (
              <div key={b.label}>
                <div className="mb-[5px] flex justify-between gap-2">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{b.label}</span>
                  <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(b.amount, currency)}</span>
                </div>
                <div className="h-[10px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ width: `${b.pct}%`, background: b.color }} />
                </div>
                <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{b.n} customers · {b.pct}% of total spend</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Top risks</h3>
          <div className="flex flex-col gap-[10px]">
            {risks.map((r) => (
              <div key={r.t} className="flex items-center gap-[11px] rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.t}</span>
                  <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{r.ev}</span>
                </span>
                <button type="button" onClick={() => router.push(r.href)} className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-primary)" }}>Open</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Top opportunities</h3>
        </div>
        {opportunities.map((o) => (
          <div key={o.t} className="flex flex-wrap items-center gap-3 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <span className="min-w-[220px] flex-1">
              <span className="block text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{o.t}</span>
              <span className="mt-1 block text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{o.ev}</span>
            </span>
            <button type="button" onClick={() => router.push(o.href)} className="rounded-[10px] px-[15px] py-[10px] text-[12px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Act on this</button>
          </div>
        ))}
        <div className="p-[11px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          These are real counts from your own customer data — not predictions or promised outcomes.
        </div>
      </div>
    </main>
  );
}
