"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStaffAnalytics, type StaffAnalyticsRow } from "@/lib/analytics-api";
import { fetchCommissions, fetchAttendance, fetchShifts } from "@/lib/staff-api";
import { fetchActions } from "@/lib/action-center-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { SimpleKpiTile, KpiSkeleton, selectStyle, outlineBtnStyle, exportCsv, recentMonths, confidenceTier, confidenceTint } from "@/components/staff/staff-ui";

function monthsBack(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function combineRows(perMonth: StaffAnalyticsRow[][]): StaffAnalyticsRow[] {
  const byId = new Map<string, StaffAnalyticsRow>();
  for (const rows of perMonth) {
    for (const r of rows) {
      const existing = byId.get(r.staffUserId);
      if (!existing) {
        byId.set(r.staffUserId, { ...r });
      } else {
        existing.totalSales += r.totalSales;
        existing.orders += r.orders;
        existing.appointmentsCount += r.appointmentsCount;
        existing.noShowCount += r.noShowCount;
        existing.avgTicketSize = existing.orders > 0 ? Math.round((existing.totalSales / existing.orders) * 100) / 100 : 0;
      }
    }
  }
  return Array.from(byId.values());
}

export function PerformanceView() {
  const session = useSession();
  const currency = session.business.currency;
  const months = useMemo(() => recentMonths(4), []);
  const [period, setPeriod] = useState<"this" | "last" | "90d">("this");

  const targetMonths = period === "this" ? [months[0].value] : period === "last" ? [months[1].value] : monthsBack(3);

  const { data: perMonthRows = [], isPending } = useQuery({
    queryKey: ["staff-analytics-multi", targetMonths.join(",")],
    queryFn: () => Promise.all(targetMonths.map((m) => fetchStaffAnalytics(undefined, m))),
  });
  const rows = combineRows(perMonthRows);

  const { data: commissionsThis = [] } = useQuery({ queryKey: ["commissions-multi", targetMonths.join(",")], queryFn: () => Promise.all(targetMonths.map((m) => fetchCommissions(m))).then((all) => all.flat()) });
  const { data: lastMonthAnalytics = [] } = useQuery({ queryKey: ["staff-analytics", months[1].value], queryFn: () => fetchStaffAnalytics(undefined, months[1].value) });
  const { data: actions } = useQuery({ queryKey: ["actions"], queryFn: () => fetchActions() });
  const { data: shifts = [] } = useQuery({ queryKey: ["shifts", "perf-month"], queryFn: () => fetchShifts({ from: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString() }) });
  const { data: attendance = [] } = useQuery({ queryKey: ["attendance", "perf-month"], queryFn: () => fetchAttendance({ from: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString() }) });

  const commissionByStaff = new Map<string, number>();
  for (const c of commissionsThis) commissionByStaff.set(c.businessUserId, (commissionByStaff.get(c.businessUserId) ?? 0) + c.commission);

  const scheduledDaysByStaff = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!scheduledDaysByStaff.has(s.staffUserId)) scheduledDaysByStaff.set(s.staffUserId, new Set());
    scheduledDaysByStaff.get(s.staffUserId)!.add(s.startsAt.slice(0, 10));
  }
  const attendedDaysByStaff = new Map<string, Set<string>>();
  for (const a of attendance) {
    if (!attendedDaysByStaff.has(a.staffUserId)) attendedDaysByStaff.set(a.staffUserId, new Set());
    attendedDaysByStaff.get(a.staffUserId)!.add(a.checkIn.slice(0, 10));
  }
  function attendancePct(staffId: string): number | null {
    const scheduled = scheduledDaysByStaff.get(staffId)?.size ?? 0;
    if (scheduled === 0) return null;
    const attended = attendedDaysByStaff.get(staffId)?.size ?? 0;
    return Math.round((attended / scheduled) * 100);
  }

  const totalRevenue = rows.reduce((a, r) => a + r.totalSales, 0);
  const totalOrders = rows.reduce((a, r) => a + r.orders, 0);
  const totalBookings = rows.reduce((a, r) => a + r.appointmentsCount, 0);
  const totalCommission = Array.from(commissionByStaff.values()).reduce((a, v) => a + v, 0);
  const avgRevenue = rows.length > 0 ? totalRevenue / rows.length : 0;
  const maxRevenue = Math.max(1, ...rows.map((r) => r.totalSales));

  const enriched = rows
    .filter((r) => r.totalSales > 0 || r.orders > 0)
    .map((r) => {
      const lastRow = lastMonthAnalytics.find((l) => l.staffUserId === r.staffUserId);
      const trendPct = lastRow && lastRow.totalSales > 0 ? Math.round(((r.totalSales - lastRow.totalSales) / lastRow.totalSales) * 100) : null;
      return {
        ...r,
        commission: commissionByStaff.get(r.staffUserId) ?? 0,
        attendancePct: attendancePct(r.staffUserId),
        share: totalRevenue > 0 ? Math.round((r.totalSales / totalRevenue) * 100) : 0,
        barW: Math.round((r.totalSales / maxRevenue) * 100),
        vsAvg: r.totalSales >= avgRevenue,
        trendPct,
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);

  function doExport() {
    exportCsv(
      "staff-performance.csv",
      ["Name", "Role", "Revenue", "Orders", "Bookings", "No-shows", "Attendance", "Commission"],
      enriched.map((r) => [r.name, r.role, r.totalSales, r.orders, r.appointmentsCount, r.noShowCount, r.attendancePct ?? "", r.commission]),
    );
  }

  const a = enriched[0];
  const b = enriched[1];

  const topPerformer = enriched[0];
  const bookingsLeader = enriched.slice().sort((x, y) => y.appointmentsCount - x.appointmentsCount)[0];
  const biggestDrop = enriched.filter((r) => r.trendPct !== null && r.trendPct < 0).sort((x, y) => (x.trendPct ?? 0) - (y.trendPct ?? 0))[0];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Period" className="rounded-[11px]" style={selectStyle}>
          <option value="this">This month</option>
          <option value="last">Last month</option>
          <option value="90d">Last 90 days</option>
        </select>
        <span className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>Performance is more than sales — bookings, tasks and attendance all count.</span>
        <button type="button" onClick={doExport} className="ml-auto rounded-[11px]" style={outlineBtnStyle}>Export</button>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={6} />
        ) : (
          <>
            <SimpleKpiTile label="Revenue Attributed" labelColor="#0E8442" value={formatCurrency(totalRevenue, currency)} valueSize={20} border="1.5px solid #BFE7CF" />
            <SimpleKpiTile label="Orders" value={String(totalOrders)} valueSize={20} />
            <SimpleKpiTile label="Bookings" value={String(totalBookings)} valueSize={20} />
            <SimpleKpiTile label="Tasks Completed" value={String(actions?.counts.completedThisWeek ?? 0)} valueSize={20} />
            <SimpleKpiTile label="Attendance" value={rows.length > 0 ? `${Math.round(rows.reduce((sum, r) => sum + (attendancePct(r.staffUserId) ?? 0), 0) / rows.length)}%` : "—"} valueSize={20} />
            <SimpleKpiTile label="Commission" value={formatCurrency(totalCommission, currency)} valueSize={20} valueColor="#12A150" />
          </>
        )}
      </div>

      <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
        <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Performance by staff member</h3>
        {enriched.length === 0 ? (
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No sales attributed to any staff member this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "6px 0" }}>Staff</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 6, minWidth: 200 }}>Revenue</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 6 }}>Orders</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 6 }}>Bookings</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 6 }}>No-shows</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 6 }}>Attendance</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 6 }}>Commission</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 6 }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((r) => (
                  <tr key={r.staffUserId} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "10px 0" }}>
                      <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.name}</p>
                      <p className="m-0 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>{r.role.charAt(0).toUpperCase() + r.role.slice(1)}</p>
                    </td>
                    <td style={{ padding: 6 }}>
                      <div className="h-[7px] overflow-hidden rounded-[5px]" style={{ background: "var(--app-surface-2)" }}>
                        <div className="h-full rounded-[5px]" style={{ width: `${Math.max(2, r.barW)}%`, background: "#12A150" }} />
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(r.totalSales, currency)}</span>
                        <span className="text-[10px] font-semibold" style={{ color: r.vsAvg ? "#0E8442" : "#B54708" }}>{r.vsAvg ? "Above avg" : "Below avg"}</span>
                        <span className="text-[10px]" style={{ color: "var(--app-text-disabled)" }}>{r.share}% of team</span>
                      </div>
                    </td>
                    <td style={{ padding: 6, fontSize: 12, color: "var(--app-text-faint)", textAlign: "right" }}>{r.orders}</td>
                    <td style={{ padding: 6, fontSize: 12, color: "var(--app-text-faint)", textAlign: "right" }}>{r.appointmentsCount}</td>
                    <td style={{ padding: 6, fontSize: 12, color: "var(--app-text-faint)", textAlign: "right" }}>{r.noShowCount}</td>
                    <td style={{ padding: 6, fontSize: 12, color: "var(--app-text-faint)", textAlign: "right" }}>{r.attendancePct !== null ? `${r.attendancePct}%` : "—"}</td>
                    <td style={{ padding: 6, fontSize: 12, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(r.commission, currency)}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>
                      {r.trendPct !== null ? <span className="text-[11.5px] font-bold" style={{ color: r.trendPct >= 0 ? "#0E8442" : "#B42318" }}>{r.trendPct >= 0 ? "▲" : "▼"} {Math.abs(r.trendPct)}%</span> : <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 mt-2.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Revenue is attributed at the point of sale.</p>
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Side by side</h3>
          {a && b ? (
            <>
              <div className="grid gap-[9px] pb-[9px]" style={{ gridTemplateColumns: "1.3fr 1fr 1fr", borderBottom: "1px solid var(--app-surface-2)" }}>
                <span className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Metric</span>
                <span className="text-right text-[11px] font-extrabold" style={{ color: "var(--app-text)" }}>{a.name}</span>
                <span className="text-right text-[11px] font-extrabold" style={{ color: "var(--app-text)" }}>{b.name}</span>
              </div>
              {[
                { m: "Revenue attributed", av: formatCurrency(a.totalSales, currency), bv: formatCurrency(b.totalSales, currency) },
                { m: "Orders", av: String(a.orders), bv: String(b.orders) },
                { m: "Bookings", av: String(a.appointmentsCount), bv: String(b.appointmentsCount) },
                { m: "No-shows", av: String(a.noShowCount), bv: String(b.noShowCount) },
                { m: "Attendance", av: a.attendancePct !== null ? `${a.attendancePct}%` : "—", bv: b.attendancePct !== null ? `${b.attendancePct}%` : "—" },
                { m: "Commission", av: formatCurrency(a.commission, currency), bv: formatCurrency(b.commission, currency) },
              ].map((row) => (
                <div key={row.m} className="grid gap-[9px] py-2.5" style={{ gridTemplateColumns: "1.3fr 1fr 1fr", borderBottom: "1px solid var(--app-surface-2)" }}>
                  <span className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>{row.m}</span>
                  <span className="text-right text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{row.av}</span>
                  <span className="text-right text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{row.bv}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Need at least two staff with sales this period to compare.</p>
          )}
          <p className="m-0 mt-2.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Shown across six measures deliberately — a single-metric ranking would misrepresent both.</p>
        </div>

        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>What stands out</h3>
          <div className="flex flex-col gap-[11px]">
            {topPerformer && (() => {
              const tier = confidenceTier(topPerformer.share);
              const tint = confidenceTint(tier);
              return (
                <div className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
                  <p className="m-0 text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{topPerformer.name} leads the team this period</p>
                  <p className="m-0 mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Highest attributed revenue, {topPerformer.share}% of the team&apos;s total this period.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(topPerformer.totalSales, currency)} this period.</span>
                    <span className="rounded-full text-[10px] font-extrabold" style={{ padding: "2px 8px", background: tint.bg, color: tint.color }}>Confidence {tier}</span>
                  </div>
                </div>
              );
            })()}
            {bookingsLeader && bookingsLeader.staffUserId !== topPerformer?.staffUserId && (() => {
              const share = totalBookings > 0 ? (bookingsLeader.appointmentsCount / totalBookings) * 100 : 0;
              const tier = confidenceTier(share);
              const tint = confidenceTint(tier);
              return (
                <div className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
                  <p className="m-0 text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{bookingsLeader.name} converts the most bookings</p>
                  <p className="m-0 mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Highest completed-booking count this period, carrying a normal task load.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{bookingsLeader.appointmentsCount} of {totalBookings} bookings this period.</span>
                    <span className="rounded-full text-[10px] font-extrabold" style={{ padding: "2px 8px", background: tint.bg, color: tint.color }}>Confidence {tier}</span>
                  </div>
                </div>
              );
            })()}
            {biggestDrop && (() => {
              const tier = confidenceTier(Math.abs(biggestDrop.trendPct ?? 0));
              const tint = confidenceTint(tier);
              return (
                <div className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
                  <p className="m-0 text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{biggestDrop.name} is down {Math.abs(biggestDrop.trendPct ?? 0)}% vs last month</p>
                  <p className="m-0 mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Real month-over-month comparison — worth a quick check-in.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Timesheets vs last month&apos;s commission report.</span>
                    <span className="rounded-full text-[10px] font-extrabold" style={{ padding: "2px 8px", background: tint.bg, color: tint.color }}>Confidence {tier}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </main>
  );
}
