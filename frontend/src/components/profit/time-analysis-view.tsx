"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { fetchProfitByTime, fetchPnl, type HourlyRevenue, type WeekdayRevenue } from "@/lib/profit-api";
import { fetchBranches } from "@/lib/branches-api";
import { formatHour } from "@/lib/profit";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { DeadHoursOfferDialog } from "./dead-hours-offer-dialog";

type Bucket = "Hour" | "Day of Week" | "Week" | "Month";

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

function short(n: number): string {
  const a = Math.abs(n);
  return (n < 0 ? "−" : "") + (a >= 1000 ? Math.round(a / 1000) + "K" : String(Math.round(a)));
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

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function exportCsv(rows: { label: string; salesCount: number; revenue: number; avgTicket: number }[]) {
  const header = ["Bucket", "Sales count", "Revenue", "Average ticket"];
  const lines = [header, ...rows.map((r) => [r.label, r.salesCount, r.revenue, r.avgTicket])];
  const csv = lines.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "time-analysis.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function TimeAnalysisView() {
  const session = useSession();
  const currency = session.business.currency;
  const [bucket, setBucket] = useState<Bucket>("Hour");
  const [period, setPeriod] = useState("This Month");
  const [branchId, setBranchId] = useState("all");
  const [offerOpen, setOfferOpen] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["profit-time", branchId], queryFn: () => fetchProfitByTime(branchId) });
  const { data: pnl } = useQuery({ queryKey: ["profit-pnl", currentMonth(), branchId], queryFn: () => fetchPnl(currentMonth(), "month", branchId) });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  const isHour = bucket === "Hour";
  const rows: { label: string; revenue: number; salesCount: number; avgTicket: number }[] = useMemo(() => {
    if (!data) return [];
    return isHour
      ? data.hourly.map((h: HourlyRevenue) => ({ label: formatHour(h.hour), revenue: h.revenue, salesCount: h.salesCount, avgTicket: h.avgTicket }))
      : data.weekday.map((w: WeekdayRevenue) => ({ label: w.day, revenue: w.revenue, salesCount: w.salesCount, avgTicket: w.avgTicket }));
  }, [data, isHour]);

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load time analytics</p>
        <button type="button" onClick={() => refetch()} className="mt-3 rounded-[12px] px-5 py-2.5 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
      </div>
    );
  }

  const totalRev = rows.reduce((a, r) => a + r.revenue, 0);
  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));
  const peakRow = rows.length ? rows.reduce((max, r) => (r.revenue > max.revenue ? r : max)) : null;
  const slowRow = rows.length ? rows.reduce((min, r) => (r.revenue < min.revenue ? r : min)) : null;
  const top3Rev = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 3).reduce((a, r) => a + r.revenue, 0);
  const concentration = totalRev > 0 ? Math.round((top3Rev / totalRev) * 100) : 0;

  const peakDay = data && data.weekday.length ? data.weekday.reduce((max, w) => (w.revenue > max.revenue ? w : max)) : null;

  const timeBars = bars(rows.map((r) => r.revenue), maxRev, 620, 106, 12).map((b, i) => ({ ...b, label: rows[i]?.label, fill: rows[i]?.label === peakRow?.label ? "#0E8442" : "#BFE7CF" }));

  const maxDay = data ? Math.max(1, ...data.weekday.map((d) => d.revenue)) : 1;
  const heat = (data?.weekday ?? []).map((d) => {
    const r = d.revenue / maxDay;
    const bg = r > 0.85 ? "#0E8442" : r > 0.65 ? "#12A150" : r > 0.5 ? "#7DD3A4" : r > 0.35 ? "#BFE7CF" : "#E8F7EE";
    const fg = r > 0.65 ? "#fff" : "#0A1B2A";
    return { d: d.day.slice(0, 3), bg, fg, label: short(d.revenue) };
  });

  const trend = pnl?.trend ?? [];
  const momMax = Math.max(1, ...trend.map((t) => t.revenue));
  const momBars = bars(trend.map((t) => t.revenue), momMax, 620, 96, 10).map((b, i) => ({ ...b, m: trend[i] ? new Date(`${trend[i].month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : "" }));

  function onBucketChange(value: string) {
    if (handleFakeOption(value)) return;
    if (value === "Week" || value === "Month") {
      toast.info(`Bucketing revenue by ${value.toLowerCase()} needs more sales history — not available yet.`);
      return;
    }
    setBucket(value as Bucket);
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={bucket} onChange={(e) => onBucketChange(e.target.value)} aria-label="Bucket" style={selectStyle}>
          <option>Hour</option>
          <option>Day of Week</option>
          <option>Week</option>
          <option>Month</option>
          <option>+ Add your own…</option>
        </select>
        <select
          value={period}
          onChange={(e) => { if (handleFakeOption(e.target.value)) return; if (e.target.value === "Custom") { toast.info("Custom date range — not available yet."); return; } setPeriod(e.target.value); }}
          aria-label="Date range"
          style={selectStyle}
        >
          <option>This Month</option>
          <option>Quarter</option>
          <option>Year</option>
          <option>Custom</option>
          <option>+ Add your own…</option>
        </select>
        <select
          value={branchId}
          onChange={(e) => { if (handleFakeOption(e.target.value)) return; setBranchId(e.target.value); }}
          aria-label="Branch"
          style={selectStyle}
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          {rows.length > 0 && (
            <button type="button" onClick={() => exportCsv(rows)} style={outlineBtnStyle}>Export</button>
          )}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setOfferOpen(true)}
              className="rounded-[11px] text-[12.5px] font-extrabold text-white"
              style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}
            >
              Create Dead-Hours Offer
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />)
        ) : (
          <>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #BFE7CF" }}>
              <div className="text-[12px] font-bold" style={{ color: "#0E8442" }}>Peak Hour</div>
              <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{peakRow?.label ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Peak Day</div>
              <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{peakDay?.day ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Slowest Window</div>
              <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "#B54708" }}>{slowRow?.label ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Revenue Concentration</div>
              <div className="mt-1.5 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{concentration}%</div>
              <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Top 3 periods</div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="mb-1.5 flex items-center gap-2.5">
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Revenue by {bucket}</h3>
          <span className="rounded-full text-[11px] font-bold" style={{ color: "#0E8442", background: "#E8F7EE", padding: "3px 9px" }}>Peak highlighted</span>
        </div>
        {rows.length === 0 ? (
          <div className="flex h-[138px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough sales yet.</div>
        ) : (
          <svg viewBox="0 0 620 138" style={{ width: "100%", height: 138, display: "block" }}>
            {timeBars.map((b, i) => (
              <g key={i}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill={b.fill} />
                <text x={b.cx} y={132} textAnchor="middle" fontSize={10} fill="#667085" fontWeight={600}>{b.label}</text>
              </g>
            ))}
          </svg>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Weekday heat</h3>
          {heat.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough sales yet.</p>
          ) : (
            <div className="grid gap-[7px]" style={{ gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
              {heat.map((h) => (
                <div key={h.d} className="rounded-[10px] text-center" style={{ background: h.bg, padding: "11px 6px" }}>
                  <div className="text-[10.5px] font-extrabold" style={{ color: h.fg }}>{h.d}</div>
                  <div className="mt-[5px] text-[11.5px] font-extrabold" style={{ color: h.fg }}>{h.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Month-over-month pattern</h3>
          {trend.length === 0 ? (
            <div className="flex h-[100px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough months of history yet.</div>
          ) : (
            <svg viewBox="0 0 620 122" style={{ width: "100%", height: 122, display: "block" }}>
              {momBars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill="#C7D7FE" />
                  <text x={b.cx} y={116} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{b.m}</text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {!isPending && rows.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>A few weeks of sales reveal your patterns</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 620 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>{bucket}</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Sales count</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Revenue</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Average ticket</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "11px 17px" }}>
                      <span className="flex items-center gap-2">
                        <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.label}</span>
                        {r.label === peakRow?.label && <span className="rounded-full text-[10px] font-extrabold" style={{ color: "#0E8442", background: "#E8F7EE", padding: "2px 8px" }}>Peak</span>}
                      </span>
                    </td>
                    <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.salesCount}</td>
                    <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(r.revenue, currency)}</td>
                    <td style={{ padding: "11px 17px", fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(r.avgTicket, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isPending && rows.length > 0 && data && (
        <div className="flex items-start gap-2.5 rounded-[11px] px-3.5 py-3 text-[13px]" style={{ background: "rgba(18,161,80,.06)", color: "var(--app-text)" }}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-primary)" }} aria-hidden />
          {data.insight}
        </div>
      )}

      {offerOpen && <DeadHoursOfferDialog onClose={() => setOfferOpen(false)} />}
    </main>
  );
}
