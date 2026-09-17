"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReviews, fetchComplaintThemes, type LivePrivateFeedback } from "@/lib/reviews-api";
import { fetchCustomers } from "@/lib/customers-api";
import { ComplaintTicketDrawer } from "./complaint-ticket-drawer";

function downloadCsv(rows: LivePrivateFeedback[]) {
  const header = "Customer,Stars,Message,Status,Assignee,Created\n";
  const body = rows.map((t) => `"${t.customerId ?? "Anonymous"}",${t.stars},"${(t.message ?? "").replace(/"/g, '""')}",${t.status},"${t.assignedTo ?? ""}",${t.createdAt}`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `private-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  open: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
  assigned: { bg: "#EEF4FF", fg: "#3538CD" },
  resolved: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
};

export function PrivateFeedbackView() {
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [assigneeFilter, setAssigneeFilter] = useState("All assignees");
  const [starsFilter, setStarsFilter] = useState("All stars");
  const [selected, setSelected] = useState<LivePrivateFeedback | null>(null);

  const { data: entries = [] } = useQuery({ queryKey: ["reviews"], queryFn: fetchReviews });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: themes = [] } = useQuery({ queryKey: ["complaint-themes"], queryFn: fetchComplaintThemes });
  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const tickets = useMemo(() => entries.filter((e): e is LivePrivateFeedback => e.source === "private"), [entries]);
  const assignees = useMemo(() => [...new Set(tickets.map((t) => t.assignedTo).filter((a): a is string => !!a))].sort(), [tickets]);

  const filtered = tickets.filter(
    (t) =>
      (statusFilter === "All statuses" || t.status === statusFilter.toLowerCase()) &&
      (assigneeFilter === "All assignees" || t.assignedTo === assigneeFilter) &&
      (starsFilter === "All stars" || t.stars === Number(starsFilter)),
  );

  const open = tickets.filter((t) => t.status === "open").length;
  const assigned = tickets.filter((t) => t.status === "assigned").length;
  const now = new Date();
  const resolvedThisMonth = tickets.filter((t) => t.status === "resolved" && new Date(t.updatedAt).getUTCMonth() === now.getUTCMonth() && new Date(t.updatedAt).getUTCFullYear() === now.getUTCFullYear());
  const avgResponseHours =
    resolvedThisMonth.length > 0
      ? resolvedThisMonth.reduce((sum, t) => sum + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / 3_600_000, 0) / resolvedThisMonth.length
      : null;

  const maxThemeMentions = Math.max(1, ...themes.slice(0, 4).map((t) => t.reviewCount));

  const monthlyResolution = useMemo(() => {
    const months: { label: string; year: number; month: number }[] = [];
    const cursor = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1);
      months.push({ label: d.toLocaleString(undefined, { month: "short" }), year: d.getUTCFullYear(), month: d.getUTCMonth() });
    }
    return months.map(({ label, year, month }) => {
      const resolved = tickets.filter((t) => t.status === "resolved" && new Date(t.updatedAt).getUTCFullYear() === year && new Date(t.updatedAt).getUTCMonth() === month);
      const avg = resolved.length > 0 ? resolved.reduce((sum, t) => sum + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / 3_600_000, 0) / resolved.length : 0;
      return { label, hours: Math.round(avg * 10) / 10 };
    });
  }, [tickets, now]);
  const maxResolutionHours = Math.max(1, ...monthlyResolution.map((m) => m.hours));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Private Feedback</h2>
        {open > 0 && (
          <span className="rounded-full px-2.5 py-[3px] text-[12px] font-extrabold" style={{ background: "#FEE4E2", color: "var(--app-danger-strong)" }}>{open} open</span>
        )}
        <span className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>Never posted publicly — handled as tickets.</span>
        <button type="button" onClick={() => downloadCsv(filtered)} className="ml-auto rounded-[11px] px-[15px] py-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}>
          Export
        </button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Open</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{open}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Assigned</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{assigned}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Resolved This Month</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-success-text)" }}>{resolvedThisMonth.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Average Response Time</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{avgResponseHours != null ? `${avgResponseHours.toFixed(1)} hours` : "—"}</div>
        </div>
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Complaint themes</h3>
            <span className="rounded-[6px] px-[7px] py-[3px] text-[10px] font-extrabold uppercase tracking-[.4px]" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>AI clustered</span>
          </div>
          {themes.length === 0 ? (
            <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Not enough private feedback text yet to cluster themes.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {themes.slice(0, 4).map((t) => (
                <div key={t.id}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{t.theme}</span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{t.reviewCount}</span>
                  </div>
                  <span className="block h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <span className="block h-full rounded-[6px]" style={{ width: `${(t.reviewCount / maxThemeMentions) * 100}%`, background: "var(--app-danger-strong)" }} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Resolution time trend — hours</h3>
          <svg viewBox="0 0 620 118" className="block w-full" style={{ height: 118 }}>
            {monthlyResolution.map((m, i) => {
              const slot = (620 - 44) / monthlyResolution.length;
              const w = slot * 0.6;
              const h = m.hours > 0 ? (m.hours / maxResolutionHours) * 90 : 2;
              const x = 34 + i * slot + slot * 0.18;
              const y = 10 + 90 - h;
              return (
                <g key={m.label + i}>
                  <rect x={x} y={y} width={w} height={h} rx={5} fill="var(--app-success-border)" />
                  <text x={x + w / 2} y={112} textAnchor="middle" fontSize={10.5} fill="var(--app-text-faintest)" fontWeight={600}>{m.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <TableSelect value={statusFilter} onChange={setStatusFilter} options={["All statuses", "Open", "Assigned", "Resolved"]} />
          <TableSelect value={assigneeFilter} onChange={setAssigneeFilter} options={["All assignees", "Unassigned", ...assignees]} />
          <TableSelect value={starsFilter} onChange={setStarsFilter} options={["All stars", "3", "2", "1"]} />
        </div>
        {filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No private complaints — good sign</p>
            <p className="m-0 mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 940 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  {["Customer", "Stars", "Snippet", "Age", "Status", "Assignee", ""].map((h) => (
                    <th key={h} className="p-[10px_17px] text-left text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const tone = STATUS_TONE[t.status];
                  const ageMs = now.getTime() - new Date(t.createdAt).getTime();
                  const ageDays = Math.floor(ageMs / 86_400_000);
                  return (
                    <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                      <td className="p-3 pl-[17px] text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>{t.customerId ? (customerNames.get(t.customerId) ?? "Customer") : "Anonymous"}</td>
                      <td className="p-3">
                        <span className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <svg key={n} width={12} height={12} viewBox="0 0 24 24" fill={n <= t.stars ? "#F59E0B" : "#E1E7EE"} stroke={n <= t.stars ? "#F59E0B" : "#E1E7EE"}>
                              <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8Z" />
                            </svg>
                          ))}
                        </span>
                      </td>
                      <td className="max-w-[280px] truncate p-3 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{t.message ?? "(no message left)"}</td>
                      <td className="whitespace-nowrap p-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{ageDays <= 0 ? "today" : `${ageDays}d`}</td>
                      <td className="p-3">
                        <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{t.status}</span>
                      </td>
                      <td className="whitespace-nowrap p-3 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{t.assignedTo ?? "Unassigned"}</td>
                      <td className="p-3 pr-[17px] text-right">
                        <span className="text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Open →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <ComplaintTicketDrawer complaint={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function TableSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-[10px] p-[9px_11px] text-[12.5px] font-semibold"
      style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", minHeight: 42 }}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
