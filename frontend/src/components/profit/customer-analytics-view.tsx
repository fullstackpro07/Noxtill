"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomerSummary, fetchCohorts, fetchCohortCustomers, fetchNewVsReturning, type CohortRow } from "@/lib/analytics-api";
import { fetchBranches } from "@/lib/branches-api";
import { MessageAtRiskDialog } from "./message-at-risk-dialog";
import { SideDrawer } from "@/components/shared/side-drawer";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text-muted)",
  borderRadius: 11,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  minHeight: 44,
};

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  borderRadius: 11,
  padding: "11px 15px",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--app-text-muted)",
  minHeight: 44,
};

function handleFakeOption(value: string): boolean {
  if (value.indexOf("+ Add") === 0) {
    toast.info("Custom option builder — not available yet.");
    return true;
  }
  return false;
}

function bars(vals: number[], max: number, W: number, PH: number, T: number) {
  const slot = (W - 44) / Math.max(1, vals.length);
  return vals.map((v, i) => ({
    x: +(34 + i * slot + slot * 0.18).toFixed(1),
    w: +(slot * 0.62).toFixed(1),
    h: +((v / max) * PH).toFixed(1),
    y: +(T + PH - (v / max) * PH).toFixed(1),
    cx: +(34 + i * slot + slot / 2).toFixed(1),
  }));
}

/** Whether cohort `cohortMonth`'s relative-month `offset` window has actually elapsed yet — the
 * backend pads not-yet-reached offsets with 0, indistinguishable from a true 0% without this. */
function offsetHasElapsed(cohortMonth: string, offset: number): boolean {
  const [y, m] = cohortMonth.split("-").map(Number);
  const windowStart = new Date(Date.UTC(y, m - 1 + offset, 1));
  return windowStart <= new Date();
}

function cellStyle(pct: number, hasData: boolean): { bg: string; fg: string } {
  if (!hasData) return { bg: "#FAFBFC", fg: "#D5DCE4" };
  if (pct > 80) return { bg: "#0E8442", fg: "#fff" };
  if (pct > 45) return { bg: "#12A150", fg: "#fff" };
  if (pct > 30) return { bg: "#7DD3A4", fg: "#0A1B2A" };
  if (pct > 18) return { bg: "#BFE7CF", fg: "#0A1B2A" };
  return { bg: "#E8F7EE", fg: "#0A1B2A" };
}

function exportCsv(cohorts: CohortRow[]) {
  const header = ["Cohort month", "Customers", "Retention month 1", "Revenue"];
  const lines = [header, ...cohorts.map((c) => [c.cohortMonth, c.size, c.retention[1] ?? 0, c.revenue])];
  const csv = lines.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "customer-analytics.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function CustomerAnalyticsView() {
  const session = useSession();
  const currency = session.business.currency;
  const [period, setPeriod] = useState("Last 6 months");
  const [segment, setSegment] = useState("All segments");
  const [branchId, setBranchId] = useState("all");
  const [messageOpen, setMessageOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<CohortRow | null>(null);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["analytics-customer-summary", branchId], queryFn: () => fetchCustomerSummary(branchId) });
  const { data: cohorts = [], isPending: cohortsPending } = useQuery({ queryKey: ["analytics-cohorts", branchId], queryFn: () => fetchCohorts(branchId) });
  const { data: nvr = [] } = useQuery({ queryKey: ["analytics-new-vs-returning", branchId], queryFn: () => fetchNewVsReturning(branchId) });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Couldn&apos;t load customer analytics</p>
        <button type="button" onClick={() => refetch()} className="mt-3 rounded-[12px] px-5 py-2.5 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
      </div>
    );
  }

  const maxLtvBucket = Math.max(1, ...(data?.ltvDistribution.map((b) => b.count) ?? []));
  const maxNvr = Math.max(1, ...nvr.map((n) => n.newCount), ...nvr.map((n) => n.returningCount));
  const newBars = bars(nvr.map((n) => n.newCount), maxNvr, 620, 96, 10);
  const returningBars = bars(nvr.map((n) => n.returningCount), maxNvr, 620, 96, 10);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={period} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setPeriod(e.target.value); }} aria-label="Period" style={selectStyle}>
          <option>Last 6 months</option>
          <option>Last 12 months</option>
          <option>This year</option>
          <option>+ Add your own…</option>
        </select>
        <select value={segment} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setSegment(e.target.value); }} aria-label="Segment" style={selectStyle}>
          <option>All segments</option>
          <option>VIP</option>
          <option>New</option>
          <option>Lapsed</option>
          <option>+ Add your own…</option>
        </select>
        <select value={branchId} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setBranchId(e.target.value); }} aria-label="Branch" style={selectStyle}>
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => exportCsv(cohorts)} style={outlineBtnStyle}>Export</button>
          {!!data && data.atRiskCount > 0 && (
            <button
              type="button"
              onClick={() => setMessageOpen(true)}
              className="rounded-[11px] text-[12.5px] font-extrabold text-white"
              style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}
            >
              Message At-Risk Customers
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending || !data ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />)
        ) : (
          <>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>New Customers</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{data.newCount}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Returning</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{data.returningCount}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #BFE7CF" }}>
              <div className="text-[12px] font-bold" style={{ color: "#0E8442" }}>Retention Rate</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatPercent(data.retentionRate)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Average Lifetime Value</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(data.avgLTV, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
              <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Churn Signals</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{data.atRiskCount}</div>
              <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>No visit in 45+ days</div>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Cohort retention</h3>
        {cohortsPending ? (
          <div className="h-40 animate-pulse rounded-[10px]" style={{ background: "var(--app-surface-2)" }} />
        ) : cohorts.every((c) => c.size === 0) ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Retention becomes meaningful after a few months</div>
          </div>
        ) : (
          <div style={{ minWidth: 660 }}>
            <div className="mb-1.5 grid gap-1.5" style={{ gridTemplateColumns: "130px repeat(6,minmax(0,1fr))" }}>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Cohort</div>
              {["Month 0", "Month 1", "Month 2", "Month 3", "Month 4", "Month 5"].map((h) => (
                <div key={h} className="text-center text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>{h}</div>
              ))}
            </div>
            {cohorts.map((c) => (
              <div key={c.cohortMonth} className="mb-1.5 grid gap-1.5" style={{ gridTemplateColumns: "130px repeat(6,minmax(0,1fr))" }}>
                <div className="flex flex-col justify-center">
                  <span className="text-[12px] font-bold" style={{ color: "var(--app-text)" }}>{c.cohortMonth}</span>
                  <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{c.size} customers</span>
                </div>
                {c.retention.map((pct, i) => {
                  const hasData = c.size > 0 && offsetHasElapsed(c.cohortMonth, i);
                  const { bg, fg } = cellStyle(pct, hasData);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!hasData}
                      onClick={() => setDrillDown(c)}
                      aria-label={`${c.cohortMonth} month ${i} retention ${hasData ? pct + "%" : "not yet reached"}`}
                      className="rounded-[9px] text-[11.5px] font-extrabold"
                      style={{ border: 0, background: bg, color: fg, padding: "12px 4px", minHeight: 44, cursor: hasData ? "pointer" : "default" }}
                    >
                      {hasData ? `${pct}%` : "—"}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", alignItems: "start" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-1.5 flex items-center gap-3.5">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>New vs returning</h3>
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "#C7D7FE" }} />New
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "#12A150" }} />Returned
            </span>
          </div>
          {nvr.length === 0 ? (
            <div className="flex h-[122px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
          ) : (
            <svg viewBox="0 0 620 122" style={{ width: "100%", height: 122, display: "block" }}>
              {nvr.map((n, i) => (
                <g key={n.month}>
                  <rect x={newBars[i].x} y={newBars[i].y} width={newBars[i].w} height={newBars[i].h} rx={5} fill="#C7D7FE" />
                  <rect x={returningBars[i].x} y={returningBars[i].y} width={returningBars[i].w} height={returningBars[i].h} rx={5} fill="#12A150" />
                  <text x={newBars[i].cx} y={116} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>
                    {new Date(`${n.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Lifetime value spread</h3>
          {!data || data.ltvDistribution.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough customer data yet.</p>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {data.ltvDistribution.map((b) => (
                <div key={b.label}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{b.label}</span>
                    <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{b.count}</span>
                  </div>
                  <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[6px]" style={{ width: `${(b.count / maxLtvBucket) * 100}%`, background: "#12A150" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {cohortsPending ? (
          <div className="p-4 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
        ) : cohorts.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Retention becomes meaningful after a few months</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 700 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Cohort month</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Customers</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Returned next month</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Retention</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => {
                  const returned = c.size > 0 && offsetHasElapsed(c.cohortMonth, 1) ? Math.round((c.retention[1] / 100) * c.size) : null;
                  return (
                    <tr key={c.cohortMonth} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{c.cohortMonth}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{c.size}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{returned ?? "—"}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>{returned !== null ? `${c.retention[1]}%` : "—"}</td>
                      <td style={{ padding: "11px 17px", fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(c.revenue, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {messageOpen && data && <MessageAtRiskDialog atRiskCount={data.atRiskCount} onClose={() => setMessageOpen(false)} />}
      {drillDown && <CohortDrawer cohort={drillDown} currency={currency} branchId={branchId} onClose={() => setDrillDown(null)} />}
    </main>
  );
}

function CohortDrawer({ cohort, currency, branchId, onClose }: { cohort: CohortRow; currency: string; branchId: string; onClose: () => void }) {
  const { data: customers = [], isPending } = useQuery({ queryKey: ["cohort-customers", cohort.cohortMonth, branchId], queryFn: () => fetchCohortCustomers(cohort.cohortMonth, branchId) });
  const stillActive = customers.filter((c) => c.visitCount > 1).length;
  const revenue = customers.reduce((sum, c) => sum + Number(c.lifetimeSpend), 0);
  const retention = cohort.size > 0 ? Math.round((stillActive / cohort.size) * 100) : 0;
  const top = [...customers].sort((a, b) => Number(b.lifetimeSpend) - Number(a.lifetimeSpend)).slice(0, 8);

  return (
    <SideDrawer title={`${cohort.cohortMonth} cohort`} onClose={onClose} footer={<button type="button" onClick={onClose} className="w-full rounded-[11px] py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>}>
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Customers</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{cohort.size}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Still active</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{stillActive}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1.5px solid #BFE7CF", background: "#F7FCF9" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "#0E8442" }}>Retention</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{retention}%</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Revenue</div>
          <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(revenue, currency)}</div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Highest-value customers in this cohort</div>
        {isPending ? (
          <div className="text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
        ) : top.length === 0 ? (
          <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No customers found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {top.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 rounded-[11px] p-2.5" style={{ border: "1px solid var(--app-border)" }}>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{c.name}</span>
                <span className="text-[12px] font-extrabold" style={{ color: "#0E8442" }}>{formatCurrency(Number(c.lifetimeSpend), currency)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Customer records live in the Customers module — shown here for context.</div>
      </div>
      <p className="m-0 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>
        Last visit: {top[0]?.lastVisitAt ? formatDate(top[0].lastVisitAt) : "—"}
      </p>
    </SideDrawer>
  );
}
