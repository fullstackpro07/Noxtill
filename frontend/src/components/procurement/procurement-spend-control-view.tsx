"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { Card, Empty, Kpi, Notice, Page, errorText, money } from "@/components/website/website-ui";
import { procurementContractsApi } from "@/lib/procurement-contracts-api";

export function ProcurementSpendControlView() {
  const [days, setDays] = useState(90);
  const query = useQuery({
    queryKey: ["procurement", "spend-control", days],
    queryFn: () => procurementContractsApi.analytics({ days }),
  });
  const data = query.data;

  useModuleHeader({
    title: "Spend Control",
    subtitle: "Purchase-order commitments and supplier-contract coverage",
  });

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          This view reuses Procurement Analytics. Spend is PO commitment, not billed or paid cash.
        </p>
        <select
          aria-label="Spend period"
          className="rounded-lg border px-2.5 py-1.5 text-sm"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg)", color: "var(--app-text)" }}
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[30, 90, 180, 365].map((value) => <option key={value} value={value}>Last {value} days</option>)}
        </select>
      </div>

      {query.isPending ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading purchase-order commitments…</p>
      ) : query.isError || !data ? (
        <Notice tone="danger">{errorText(query.error, "Couldn't load Procurement Analytics spend data.")}</Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Committed spend" value={money(data.contractUtilization.committed, data.currency)} hint={`Purchase orders created in the last ${data.periodDays} days`} />
            <Kpi label="Under contract" value={money(data.contractUtilization.underContract, data.currency)} hint={data.contractUtilization.percent === null ? "No PO spend to compare" : `${data.contractUtilization.percent}% of recorded commitment`} tone="ok" />
            <Kpi label="Off-contract spend" value={money(data.kpis.offContractSpend.amount, data.currency)} hint={data.kpis.offContractSpend.shareOfCommitted === null ? "No PO spend to compare" : `${data.kpis.offContractSpend.shareOfCommitted}% of commitment`} tone={data.kpis.offContractSpend.amount > 0 ? "warn" : undefined} />
            <Kpi label="Procurement budget" value="Not available" hint="No budget source is configured in this workspace." />
          </div>

          {data.kpis.offContractSpend.amount > 0 && (
            <Notice tone="warn">
              Recorded off-contract commitments were placed with suppliers without a matching active contract on the purchase-order date. Review <Link href="/procurement/contracts" className="font-semibold underline">Supplier Contracts</Link> before treating this as a control breach.
            </Notice>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Supplier commitment coverage" actions={<Link href="/procurement/contracts" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--app-primary)] hover:underline">Contracts <ArrowUpRight className="h-3 w-3" aria-hidden /></Link>}>
              {data.suppliers.length === 0 ? (
                <Empty>No purchase-order commitment is recorded for this period.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead style={{ color: "var(--app-text-faint)" }}><tr><th className="py-2 pr-2">Supplier</th><th className="py-2 pr-2">Committed</th><th className="py-2 pr-2">POs</th><th className="py-2">Under contract</th></tr></thead>
                    <tbody>{data.suppliers.map((supplier) => (
                      <tr key={supplier.supplierId} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                        <td className="py-2 pr-2">{supplier.name}</td>
                        <td className="py-2 pr-2">{money(supplier.committed, data.currency)}</td>
                        <td className="py-2 pr-2">{supplier.purchaseOrders}</td>
                        <td className="py-2">{supplier.underContractPercent === null ? "No contract comparison" : `${supplier.underContractPercent}%`}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Spend by category">
              {data.spendByCategory.length === 0 ? (
                <Empty>No purchase-order category commitments are recorded in this period.</Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.spendByCategory.map((row) => (
                    <div key={row.category} className="flex items-center justify-between gap-3 border-b pb-2 text-xs last:border-0" style={{ borderColor: "var(--app-border)" }}>
                      <span>{row.category}</span><span className="font-semibold tabular-nums">{money(row.committed, data.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title="Control coverage">
            <dl className="m-0 grid gap-3 text-xs sm:grid-cols-3">
              <div><dt className="font-semibold">Recorded basis</dt><dd className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>Purchase orders from the selected period, excluding cancelled orders.</dd></div>
              <div><dt className="font-semibold">Budget tracking</dt><dd className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>Not available — budgets and budget enforcement need a Finance/AP source.</dd></div>
              <div><dt className="font-semibold">Vendor bills and paid spend</dt><dd className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>Not available — supplier bills and payment records are not tracked here.</dd></div>
            </dl>
            <p className="m-0 mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              The off-contract amount and contract coverage above come directly from the existing ProcurementAnalyticsService; this page does not recalculate them. See <Link href="/procurement/analytics" className="underline">Procurement Analytics</Link> or <Link href="/settings/procurement" className="underline">Procurement Settings</Link>.
            </p>
          </Card>
        </>
      )}
    </Page>
  );
}
