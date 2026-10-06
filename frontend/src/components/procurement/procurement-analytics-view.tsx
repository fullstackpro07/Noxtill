"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { Btn, Card, Empty, Kpi, Notice, Page, inputClass, inputStyle, errorText, money } from "@/components/website/website-ui";
import { procurementContractsApi, type ProcurementAnalytics } from "@/lib/procurement-contracts-api";

const EXCLUSION_LABELS: Record<string, string> = {
  no_source_request: "RFQ not started from a purchase request",
  not_awarded: "Not awarded yet",
  no_estimate: "Request had no cost estimate",
  currency_differs: "Quote in a different currency",
  scope_changed: "Quantities changed between request, RFQ and quote",
};

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate" title={label}>{label}</span>
      <div className="h-3 flex-1 rounded" style={{ background: "var(--app-surface-muted)" }}>
        <div className="h-3 rounded" style={{ width: `${pct}%`, background: "var(--app-primary)" }} />
      </div>
    </div>
  );
}

function exportCsv(d: ProcurementAnalytics) {
  const lines = [
    `# Procurement analytics,last ${d.periodDays} days,currency ${d.currency},generated ${new Date().toISOString()},spend = PO commitments`,
    "supplier,committed,purchase_orders,under_contract_percent,rfq_invites,rfq_responses,median_response_hours",
    ...d.suppliers.map((s) => [JSON.stringify(s.name), s.committed, s.purchaseOrders, s.underContractPercent ?? "", s.rfqInvites, s.rfqResponses, s.medianResponseHours ?? ""].join(",")),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `procurement-analytics-${d.periodDays}d.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProcurementAnalyticsView() {
  const [days, setDays] = useState(90);
  const [supplierId, setSupplierId] = useState("");
  const [department, setDepartment] = useState("");
  const q = useQuery({ queryKey: ["procurement", "analytics", days, supplierId, department], queryFn: () => procurementContractsApi.analytics({ days, supplierId: supplierId || undefined, department: department || undefined }) });
  const d = q.data;
  useModuleHeader({
    title: "Procurement Analytics",
    subtitle: "Cycle time, sourcing savings, supplier response and contract coverage",
    actions: d ? <Btn onClick={() => exportCsv(d)}><Download className="h-3.5 w-3.5" aria-hidden /> Export CSV</Btn> : undefined,
  });

  return (
    <Page>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Period" className={inputClass} style={{ ...inputStyle, maxWidth: 160 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 90, 180, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}
        </select>
        <select aria-label="Supplier" className={inputClass} style={{ ...inputStyle, maxWidth: 220 }} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">All suppliers</option>
          {(d?.options.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Department" className={inputClass} style={{ ...inputStyle, maxWidth: 220 }} value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments</option>
          {(d?.options.departments ?? []).map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>

      {q.isLoading ? <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p> : q.isError || !d ? <Notice tone="danger">{errorText(q.error, "Couldn't load analytics.")}</Notice> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Request → PO cycle" value={d.kpis.requestToPoCycleDays.median === null ? "No data" : `${d.kpis.requestToPoCycleDays.median} days`} hint={`median of ${d.kpis.requestToPoCycleDays.sample}`} />
            <Kpi label="RFQ participation" value={d.kpis.rfqParticipation.rate === null ? "No data" : `${d.kpis.rfqParticipation.rate}%`} hint={`${d.kpis.rfqParticipation.responded}/${d.kpis.rfqParticipation.invited} invites answered`} />
            <Kpi label="Savings vs baseline" value={d.kpis.savingsVsBaseline.amount === null ? "No comparable RFQs" : money(d.kpis.savingsVsBaseline.amount, d.currency)} hint={d.kpis.savingsVsBaseline.percent !== null ? `${d.kpis.savingsVsBaseline.percent}% across ${d.kpis.savingsVsBaseline.comparedRfqs} RFQ(s)` : "See methodology"} tone={d.kpis.savingsVsBaseline.amount !== null && d.kpis.savingsVsBaseline.amount < 0 ? "danger" : undefined} />
            <Kpi label="Off-contract spend" value={money(d.kpis.offContractSpend.amount, d.currency)} hint={d.kpis.offContractSpend.shareOfCommitted === null ? "No PO spend" : `${d.kpis.offContractSpend.shareOfCommitted}% of committed`} tone={d.kpis.offContractSpend.amount > 0 ? "warn" : undefined} />
            <Kpi label="Match exception rate" value="Not available" hint={d.kpis.matchExceptionRate.detail} />
            <Kpi label="Supplier response time" value={d.kpis.supplierResponseHours.median === null ? "No data" : `${d.kpis.supplierResponseHours.median} h`} hint={`median of ${d.kpis.supplierResponseHours.sample}`} />
            <Kpi label="Throughput" value={`${d.kpis.throughput.requestsConverted} converted`} hint={`${d.kpis.throughput.requestsCreated} requests · ${d.kpis.throughput.purchaseOrders} POs`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Committed spend by category">
              {d.spendByCategory.length === 0 ? <Empty>No purchase orders in this period.</Empty> : (
                <div className="flex flex-col gap-1.5">
                  {d.spendByCategory.slice(0, 12).map((c) => <Bar key={c.category} label={`${c.category} · ${money(c.committed, d.currency)}`} value={c.committed} max={d.spendByCategory[0].committed} />)}
                </div>
              )}
              <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Purchase-order commitment by product category. Billed spend is not available without vendor bills.</p>
            </Card>
            <Card title="Request funnel">
              <div className="flex flex-col gap-1.5">
                {["draft", "submitted", "approved", "sourcing", "converted", "rejected", "cancelled"].map((s) => <Bar key={s} label={`${s} · ${d.funnel[s] ?? 0}`} value={d.funnel[s] ?? 0} max={Math.max(1, ...Object.values(d.funnel))} />)}
              </div>
              <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Requests created in the period, by current status. <Link className="underline" href="/procurement/requests">Open requests</Link></p>
            </Card>
          </div>

          <Card title="Sourcing savings">
            {d.savings.rows.length === 0 ? <Empty>No RFQ in this period qualifies for a like-for-like savings comparison.</Empty> : (
              <table className="w-full text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}><tr><th className="py-1">Awarded supplier</th><th className="py-1">Baseline (request estimate)</th><th className="py-1">Awarded total</th><th className="py-1">Savings</th></tr></thead>
                <tbody>{d.savings.rows.map((r) => <tr key={r.rfqId} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="py-1">{r.supplier ?? "—"}</td><td className="py-1">{money(r.baseline, d.currency)}</td><td className="py-1">{money(r.awarded, d.currency)}</td><td className="py-1" style={{ color: r.savings < 0 ? "var(--app-danger-strong)" : "var(--app-success-text)" }}>{money(r.savings, d.currency)}</td></tr>)}</tbody>
              </table>
            )}
            <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{d.savings.methodology}</p>
            {Object.values(d.savings.exclusions).some(Boolean) && (
              <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                Excluded: {Object.entries(d.savings.exclusions).filter(([, n]) => n).map(([k, n]) => `${EXCLUSION_LABELS[k] ?? k} (${n})`).join("; ")}.
              </p>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Suppliers">
              {d.suppliers.length === 0 ? <Empty>No supplier activity in this period.</Empty> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead style={{ color: "var(--app-text-faint)" }}><tr><th className="py-1">Supplier</th><th className="py-1">Committed</th><th className="py-1">POs</th><th className="py-1">Under contract</th><th className="py-1">RFQ replies</th><th className="py-1">Median reply</th></tr></thead>
                    <tbody>{d.suppliers.map((s) => <tr key={s.supplierId} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="py-1">{s.name}</td><td className="py-1">{money(s.committed, d.currency)}</td><td className="py-1">{s.purchaseOrders}</td><td className="py-1">{s.underContractPercent === null ? "—" : `${s.underContractPercent}%`}</td><td className="py-1">{s.rfqResponses}/{s.rfqInvites}</td><td className="py-1">{s.medianResponseHours === null ? "—" : `${s.medianResponseHours} h`}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </Card>
            <div className="flex flex-col gap-4">
              <Card title="Contract utilization">
                <p className="m-0 text-2xl font-bold">{d.contractUtilization.percent === null ? "No PO spend" : `${d.contractUtilization.percent}%`}</p>
                <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>{money(d.contractUtilization.underContract, d.currency)} of {money(d.contractUtilization.committed, d.currency)} committed was placed under a supplier contract. <Link className="underline" href="/procurement/contracts">Open contracts</Link></p>
              </Card>
              <Card title="By department">
                {d.departments.length === 0 ? <Empty>No requests in this period.</Empty> : (
                  <table className="w-full text-left text-xs">
                    <thead style={{ color: "var(--app-text-faint)" }}><tr><th className="py-1">Department</th><th className="py-1">Requests</th><th className="py-1">Estimated</th><th className="py-1">Converted</th></tr></thead>
                    <tbody>{d.departments.map((x) => <tr key={x.department} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="py-1">{x.department}</td><td className="py-1">{x.requests}</td><td className="py-1">{money(x.estimated, d.currency)}</td><td className="py-1">{x.converted}</td></tr>)}</tbody>
                  </table>
                )}
              </Card>
              <Card title="Exception trend">
                <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>Not available: 3-way match exceptions need vendor bills, which are not recorded in this workspace (no Finance &amp; Accounting module).</p>
              </Card>
            </div>
          </div>

          <Card title="Metric definitions">
            <dl className="m-0 grid gap-2 text-xs md:grid-cols-2">
              {d.definitions.map((x) => <div key={x.metric}><dt className="font-semibold">{x.metric}</dt><dd className="m-0" style={{ color: "var(--app-text-muted)" }}>{x.definition}</dd></div>)}
            </dl>
            <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Profit and cash flow stay in <Link className="underline" href="/profit">Profit &amp; Analytics</Link>; cross-business questions in <Link className="underline" href="/business-brain">Business Brain</Link>. Scheduled delivery of this report is not available.</p>
          </Card>
        </>
      )}
    </Page>
  );
}
