"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStaffAnalytics, type StaffAnalyticsRow } from "@/lib/analytics-api";
import { fetchCommissions, type CommissionEntry } from "@/lib/staff-api";
import { fetchPnl } from "@/lib/profit-api";
import { fetchBranches } from "@/lib/branches-api";
import { SideDrawer } from "@/components/shared/side-drawer";
import { formatCurrency } from "@/lib/format";
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

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function exportCsv(rows: StaffAnalyticsRow[], commissionByStaff: Map<string, CommissionEntry>) {
  const header = ["Staff", "Role", "Sales count", "Revenue", "Average ticket", "Appointments", "No-shows", "Reviews", "Commission"];
  const lines = [
    header,
    ...rows.map((r) => [r.name, ROLE_LABEL[r.role] ?? r.role, r.orders, r.totalSales, r.avgTicketSize, r.appointmentsCount, r.noShowCount, r.reviewMentionCount, commissionByStaff.get(r.staffUserId)?.commission ?? 0]),
  ];
  const csv = lines.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "staff-analytics.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function StaffAnalyticsView() {
  const session = useSession();
  const currency = session.business.currency;
  const [period, setPeriod] = useState("This month");
  const [branchId, setBranchId] = useState("all");
  const [role, setRole] = useState("All roles");
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [selected, setSelected] = useState<StaffAnalyticsRow | null>(null);

  const { data: rows = [], isPending, isError, refetch } = useQuery({ queryKey: ["analytics-staff", branchId], queryFn: () => fetchStaffAnalytics(branchId) });
  const { data: commissions = [] } = useQuery({ queryKey: ["commissions", currentMonth()], queryFn: () => fetchCommissions(currentMonth()) });
  const { data: pnl } = useQuery({ queryKey: ["profit-pnl", currentMonth(), branchId], queryFn: () => fetchPnl(currentMonth(), "month", branchId) });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  const commissionByStaff = useMemo(() => new Map(commissions.map((c) => [c.businessUserId, c])), [commissions]);
  const filtered = rows.filter((r) => role === "All roles" || (ROLE_LABEL[r.role] ?? r.role) === role);

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Couldn&apos;t load staff analytics</p>
        <button type="button" onClick={() => refetch()} className="mt-3 rounded-[12px] px-5 py-2.5 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
      </div>
    );
  }

  const sorted = [...filtered].sort((a, b) => b.totalSales - a.totalSales);
  const topPerformer = sorted[0] ?? null;
  const totalSales = filtered.reduce((sum, r) => sum + r.totalSales, 0);
  const avgPerStaff = filtered.length ? totalSales / filtered.length : 0;
  const totalCommission = filtered.reduce((sum, r) => sum + (commissionByStaff.get(r.staffUserId)?.commission ?? 0), 0);

  const maxSales = Math.max(1, ...sorted.map((r) => r.totalSales));
  const staffBars = bars(sorted.map((r) => r.totalSales), maxSales, 620, 106, 12).map((b, i) => ({ ...b, name: sorted[i]?.name.split(" ")[0] }));

  const trend = pnl?.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((t) => t.revenue));
  const trendBars = bars(trend.map((t) => t.revenue), trendMax, 620, 96, 10).map((b, i) => ({ ...b, m: trend[i] ? new Date(`${trend[i].month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : "" }));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={period} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setPeriod(e.target.value); }} aria-label="Period" style={selectStyle}>
          <option>This month</option>
          <option>Last month</option>
          <option>This quarter</option>
          <option>+ Add your own…</option>
        </select>
        <select value={branchId} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setBranchId(e.target.value); }} aria-label="Branch" style={selectStyle}>
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <select value={role} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setRole(e.target.value); }} aria-label="Role" style={selectStyle}>
          <option>All roles</option>
          <option>Manager</option>
          <option>Staff</option>
          <option>+ Add your own…</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          {rows.length > 0 && (
            <button type="button" onClick={() => exportCsv(sorted, commissionByStaff)} style={outlineBtnStyle}>Export</button>
          )}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setCommissionOpen(true)}
              className="rounded-[11px] text-[12.5px] font-extrabold text-white"
              style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}
            >
              View Commission Report
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
              <div className="text-[12px] font-bold" style={{ color: "#0E8442" }}>Top Performer</div>
              <div className="mt-2 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{topPerformer?.name ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Total Staff Sales</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalSales, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Average Per Staff</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(avgPerStaff, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Commission Owed</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "#B54708" }}>{formatCurrency(totalCommission, currency)}</div>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Sales per staff</h3>
          {sorted.length === 0 ? (
            <div className="flex h-[130px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Add staff and attribute sales to see performance.</div>
          ) : (
            <svg viewBox="0 0 620 130" style={{ width: "100%", height: 130, display: "block" }}>
              {staffBars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill="#BFE7CF" />
                  <text x={b.cx} y={124} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{b.name}</text>
                </g>
              ))}
            </svg>
          )}
        </div>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Team performance trend</h3>
          {trend.length === 0 ? (
            <div className="flex h-[130px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough months of history yet.</div>
          ) : (
            <svg viewBox="0 0 620 122" style={{ width: "100%", height: 122, display: "block" }}>
              {trendBars.map((b, i) => (
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
        {!isPending && filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add staff and attribute sales to see performance</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 960 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Staff</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Sales count</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Revenue</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Average ticket</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Appointments</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>No-shows</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Reviews</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {isPending
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                        <td colSpan={8} style={{ padding: 14 }}><div className="h-4 animate-pulse rounded" style={{ background: "var(--app-surface-2)" }} /></td>
                      </tr>
                    ))
                  : sorted.map((r) => (
                      <tr key={r.staffUserId} onClick={() => setSelected(r)} style={{ borderTop: "1px solid var(--app-border-strong)", cursor: "pointer" }}>
                        <td style={{ padding: "11px 17px" }}>
                          <span className="flex items-center gap-2.5">
                            <span className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ width: 30, height: 30, background: "#0A1B2A" }}>{initials(r.name)}</span>
                            <span>
                              <span className="block text-[12.5px] font-bold" style={{ color: "#0E8442" }}>{r.name}</span>
                              <span className="block text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{ROLE_LABEL[r.role] ?? r.role}</span>
                            </span>
                          </span>
                        </td>
                        <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.orders}</td>
                        <td style={{ padding: 11, fontSize: 12.5, fontWeight: 800, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(r.totalSales, currency)}</td>
                        <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(r.avgTicketSize, currency)}</td>
                        <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.appointmentsCount}</td>
                        <td style={{ padding: 11, fontSize: 12.5, color: "#B54708", textAlign: "right" }}>{r.noShowCount}</td>
                        <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.reviewMentionCount}</td>
                        <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 700, color: "#0E8442", textAlign: "right" }}>{formatCurrency(commissionByStaff.get(r.staffUserId)?.commission ?? 0, currency)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <StaffDrawer
          staff={selected}
          commission={commissionByStaff.get(selected.staffUserId)?.commission ?? 0}
          currency={currency}
          onClose={() => setSelected(null)}
        />
      )}
      {commissionOpen && <CommissionReportModal commissions={commissions} currency={currency} onClose={() => setCommissionOpen(false)} />}
    </main>
  );
}

function StaffDrawer({ staff, commission, currency, onClose }: { staff: StaffAnalyticsRow; commission: number; currency: string; onClose: () => void }) {
  return (
    <SideDrawer title={staff.name} onClose={onClose} footer={<button type="button" onClick={onClose} className="w-full rounded-[11px] py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>}>
      <div className="flex items-center gap-2.5">
        <span className="flex shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold text-white" style={{ width: 44, height: 44, background: "#0A1B2A" }}>{initials(staff.name)}</span>
        <span>
          <span className="block text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{staff.name}</span>
          <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{ROLE_LABEL[staff.role] ?? staff.role}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Revenue</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(staff.totalSales, currency)}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Sales count</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{staff.orders}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Average ticket</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(staff.avgTicketSize, currency)}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1.5px solid #BFE7CF", background: "#F7FCF9" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "#0E8442" }}>Commission</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(commission, currency)}</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between border-b py-2" style={{ borderColor: "var(--app-surface-2)" }}>
          <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Appointments</span>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{staff.appointmentsCount}</span>
        </div>
        <div className="flex justify-between border-b py-2" style={{ borderColor: "var(--app-surface-2)" }}>
          <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>No-shows</span>
          <span className="text-[12.5px] font-bold" style={{ color: "#B54708" }}>{staff.noShowCount}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Reviews mentioning them</span>
          <span className="text-[12.5px] font-bold" style={{ color: "#0E8442" }}>{staff.reviewMentionCount}</span>
        </div>
      </div>
    </SideDrawer>
  );
}

function CommissionReportModal({ commissions, currency, onClose }: { commissions: CommissionEntry[]; currency: string; onClose: () => void }) {
  const total = commissions.reduce((sum, c) => sum + c.commission, 0);

  function exportReportCsv() {
    const header = ["Staff", "Revenue", "Commission"];
    const lines = [header, ...commissions.map((c) => [c.name, c.totalSales, c.commission])];
    const csv = lines.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "commission-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[490px] rounded-[18px]" style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}>
        <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Commission report — this month</h3>
        </div>
        <div className="p-[17px]">
          <div className="overflow-hidden rounded-[12px]" style={{ border: "1px solid var(--app-border)" }}>
            <div className="flex" style={{ background: "var(--app-surface-2)", padding: "10px 12px" }}>
              <span className="flex-[1.6] text-[10.5px] font-extrabold" style={{ color: "var(--app-text-disabled)" }}>STAFF</span>
              <span className="flex-1 text-end text-[10.5px] font-extrabold" style={{ color: "var(--app-text-disabled)" }}>REVENUE</span>
              <span className="flex-1 text-end text-[10.5px] font-extrabold" style={{ color: "var(--app-text-disabled)" }}>COMMISSION</span>
            </div>
            {commissions.filter((c) => c.totalSales > 0).map((c) => (
              <div key={c.businessUserId} className="flex text-[12px]" style={{ padding: "11px 12px", borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-faint)" }}>
                <span className="flex-[1.6] font-bold" style={{ color: "var(--app-text)" }}>{c.name}</span>
                <span className="flex-1 text-end">{formatCurrency(c.totalSales, currency)}</span>
                <span className="flex-1 text-end font-extrabold" style={{ color: "#0E8442" }}>{formatCurrency(c.commission, currency)}</span>
              </div>
            ))}
            <div className="flex text-[12.5px] font-extrabold" style={{ padding: "11px 12px", borderTop: "1px solid var(--app-border)", background: "#F7FCF9", color: "var(--app-text)" }}>
              <span className="flex-[2.6]">Total owed</span>
              <span className="flex-1 text-end">{formatCurrency(total, currency)}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>
          <button type="button" onClick={exportReportCsv} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Export</button>
        </div>
      </div>
    </div>
  );
}
