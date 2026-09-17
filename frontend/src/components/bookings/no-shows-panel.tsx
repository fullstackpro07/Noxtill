"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { fetchAppointments, fetchNoShowReport, type LiveAppointment } from "@/lib/bookings-api";
import { fetchStaff } from "@/lib/staff-api";
import { fetchProducts } from "@/lib/products-api";
import { useSession } from "@/lib/session";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };

function todayIso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const RANGE_OPTIONS = [
  { key: "month", label: "This month", from: -30 },
  { key: "90", label: "Last 90 days", from: -90 },
] as const;

export function NoShowsPanel() {
  const session = useSession();
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["key"]>("90");
  const [staffFilter, setStaffFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  const activeRange = RANGE_OPTIONS.find((r) => r.key === range)!;
  const from = todayIso(activeRange.from);
  const to = todayIso(1);

  const { data: noShows } = useQuery({
    queryKey: ["appointments", "no-shows", from, to],
    queryFn: () => fetchAppointments({ status: "no_show", from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() }),
  });
  const { data: report } = useQuery({ queryKey: ["no-show-report"], queryFn: () => fetchNoShowReport(6) });
  const { data: staff } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff });
  const { data: services } = useQuery({ queryKey: ["products", "all-for-noshows"], queryFn: () => fetchProducts() });

  const priceByServiceId = useMemo(() => new Map((services ?? []).map((s) => [s.id, s.price])), [services]);
  const repeatOffenderIds = useMemo(() => new Set((report?.repeatOffenders ?? []).map((o) => o.customerId)), [report]);

  const countByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of noShows ?? []) map.set(a.customerId, (map.get(a.customerId) ?? 0) + 1);
    return map;
  }, [noShows]);

  const filtered = useMemo(() => {
    return (noShows ?? []).filter((a) => {
      if (staffFilter && a.staffId !== staffFilter) return false;
      if (serviceFilter && a.serviceId !== serviceFilter) return false;
      if (repeatOnly && !repeatOffenderIds.has(a.customerId)) return false;
      return true;
    });
  }, [noShows, staffFilter, serviceFilter, repeatOnly, repeatOffenderIds]);

  const valueLost = (a: LiveAppointment) => priceByServiceId.get(a.serviceId) ?? 0;

  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = (noShows ?? []).filter((a) => { const d = new Date(a.startsAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const revenueLost = (noShows ?? []).reduce((sum, a) => sum + (priceByServiceId.get(a.serviceId) ?? 0), 0);
    return { thisMonth: thisMonth.length, revenueLost, repeatOffenders: report?.repeatOffenders.length ?? 0 };
  }, [noShows, report, priceByServiceId]);

  const byDay = useMemo(() => {
    const counts = new Array(7).fill(0);
    for (const a of filtered) counts[new Date(a.startsAt).getDay()] += 1;
    return counts;
  }, [filtered]);
  const maxDay = Math.max(...byDay, 1);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const byService = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of filtered) counts.set(a.serviceName, (counts.get(a.serviceName) ?? 0) + 1);
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [filtered]);
  const maxService = Math.max(...byService.map(([, c]) => c), 1);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>No-Shows</h2>
        {report && (
          <span className="rounded-full px-[11px] py-1 text-[12px] font-extrabold" style={{ color: "var(--app-success-text)", background: "var(--app-success-bg)" }}>{formatPercent(report.overallRate)} overall (6mo)</span>
        )}
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>No-Shows This Month</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.thisMonth}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Rate (6mo)</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{report ? formatPercent(report.overallRate) : "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Revenue Lost</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.revenueLost, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-warning-border)" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-warning-text)" }}>Repeat Offenders (6mo)</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.repeatOffenders}</div>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        {report && report.trend.length > 1 && (
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>No-show rate trend (6mo)</h3>
            <TrendChart trend={report.trend} />
          </div>
        )}
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>By day of week</h3>
          <div className="flex items-end gap-1.5" style={{ height: 120 }}>
            {byDay.map((count, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>{count}</span>
                <div className="w-full rounded-t-[4px]" style={{ height: `${(count / maxDay) * 80}px`, background: "#FDBA74" }} />
                <span className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{dayLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {byService.length > 0 && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>By service</h3>
          <div className="flex flex-col gap-2.5">
            {byService.map(([name, count]) => (
              <div key={name}>
                <div className="mb-1 flex justify-between"><span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{name}</span><span className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>{count}</span></div>
                <div className="h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ width: `${(count / maxService) * 100}%`, background: "#F97316" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Date range" style={selectStyle}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
            <option value="">All staff</option>
            {(staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Service" style={selectStyle}>
            <option value="">All services</option>
            {(services ?? []).filter((s) => s.kind === "service").map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <span className="ms-2 flex items-center gap-2">
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Repeat offenders only</span>
            <button type="button" role="switch" aria-checked={repeatOnly} onClick={() => setRepeatOnly((v) => !v)} className="relative rounded-full" style={{ width: 40, height: 22, border: 0, background: repeatOnly ? "var(--app-primary)" : "var(--app-surface-2)" }}>
              <span className="absolute top-[2px] rounded-full bg-white" style={{ width: 18, height: 18, left: repeatOnly ? 20 : 2 }} />
            </button>
          </span>
        </div>

        {noShows && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No no-shows — your reminders are working</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Service</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Staff</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Value Lost</th>
                  <th className="p-[10px] text-center text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>No-Show Count</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="whitespace-nowrap p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatDate(a.startsAt)}</td>
                    <td className="p-[12px]">
                      <button type="button" onClick={() => setHistoryFor({ id: a.customerId, name: a.customerName })} className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>{a.customerName}</button>
                    </td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{a.serviceName}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{a.staffName ?? "—"}</td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(valueLost(a), session.business.currency)}</td>
                    <td className="p-[12px] text-center"><span className="rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: (countByCustomer.get(a.customerId) ?? 0) > 1 ? "#FEE4E2" : "var(--app-surface-2)", color: (countByCustomer.get(a.customerId) ?? 0) > 1 ? "var(--app-danger-strong)" : "var(--app-text-muted)" }}>{countByCustomer.get(a.customerId) ?? 0}×</span></td>
                    <td className="p-[12px_17px] text-end">
                      <button type="button" onClick={() => setHistoryFor({ id: a.customerId, name: a.customerName })} style={outlineBtn}>History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {historyFor && (
        <PosModalShell
          open
          onClose={() => setHistoryFor(null)}
          title={`${historyFor.name} — No-Show History`}
          footer={<button type="button" onClick={() => setHistoryFor(null)} style={cancelBtn}>Close</button>}
        >
          <div className="flex flex-col p-[17px]">
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <div className="rounded-[12px] p-3" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6" }}>
                <div className="text-[11.5px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Total no-shows (in range)</div>
                <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{countByCustomer.get(historyFor.id) ?? 0}</div>
              </div>
              <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Value lost</div>
                <div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency((noShows ?? []).filter((a) => a.customerId === historyFor.id).reduce((sum, a) => sum + valueLost(a), 0), session.business.currency)}</div>
              </div>
            </div>
            {(noShows ?? []).filter((a) => a.customerId === historyFor.id).map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-[9px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
                <span className="w-[100px] text-[12px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatDate(a.startsAt)}</span>
                <span className="flex-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>{a.serviceName}</span>
                <span className="text-[12px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(valueLost(a), session.business.currency)}</span>
              </div>
            ))}
          </div>
        </PosModalShell>
      )}
    </main>
  );
}

function TrendChart({ trend }: { trend: { month: string; rate: number }[] }) {
  const width = 560;
  const height = 140;
  const max = Math.max(...trend.map((t) => t.rate), 10);
  const points = trend.map((t, i) => ({ x: (i / (trend.length - 1)) * width, y: height - (t.rate / max) * height }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, display: "block" }}>
      <path d={areaPath} fill="rgba(249,115,22,.1)" />
      <path d={linePath} fill="none" stroke="#F97316" strokeWidth={2.4} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.4} fill="var(--app-surface)" stroke="#F97316" strokeWidth={1.8} />
      ))}
    </svg>
  );
}
