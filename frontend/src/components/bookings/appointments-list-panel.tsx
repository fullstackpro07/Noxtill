"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBookingsSearchStore } from "@/store/bookings-search-store";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchAppointments,
  bulkCancelAppointments,
  bulkRemindAppointments,
  type LiveAppointment,
  type AppointmentFilters,
} from "@/lib/bookings-api";
import { fetchStaff } from "@/lib/staff-api";
import { fetchProducts } from "@/lib/products-api";

const SOURCE_LABEL: Record<LiveAppointment["source"], string> = { link: "Link", qr: "QR", walk_in: "Walk-in", waitlist: "Waitlist", phone: "Phone" };
const STATUS_TONE: Record<LiveAppointment["status"], { bg: string; fg: string }> = {
  requested: { bg: "#EEF4FF", fg: "#3538CD" },
  booked: { bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
  confirmed: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  completed: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
  cancelled: { bg: "var(--app-surface-2)", fg: "var(--app-text-disabled)" },
  no_show: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
};

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

function todayIso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const RANGE_OPTIONS = [
  { key: "week", label: "This week", from: 0, to: 7 },
  { key: "month", label: "This month", from: 0, to: 30 },
  { key: "wide", label: "Past 2 weeks + next 6 weeks", from: -14, to: 42 },
] as const;

export function AppointmentsListPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const query = useBookingsSearchStore((s) => s.query);
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["key"]>("wide");
  const [staffFilter, setStaffFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentFilters["status"] | "">("");
  const [sourceFilter, setSourceFilter] = useState<LiveAppointment["source"] | "">("");
  const [selected, setSelected] = useState<string[]>([]);

  const activeRange = RANGE_OPTIONS.find((r) => r.key === range)!;
  const from = todayIso(activeRange.from);
  const to = todayIso(activeRange.to);

  const { data: appointments, isPending } = useQuery({
    queryKey: ["appointments", "list", from, to, staffFilter, statusFilter],
    queryFn: () =>
      fetchAppointments({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
        staff: staffFilter || undefined,
        status: statusFilter || undefined,
      }),
  });
  const { data: staff } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff });
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  const remindMutation = useMutation({
    mutationFn: (ids: string[]) => bulkRemindAppointments(ids),
    onSuccess: (result) => {
      toast.success(`Sent ${result.sent ?? 0} reminder(s)${result.failed.length ? `, ${result.failed.length} failed` : ""}.`);
      setSelected([]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders."),
  });
  const cancelMutation = useMutation({
    mutationFn: (ids: string[]) => bulkCancelAppointments(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`Cancelled ${result.cancelled ?? 0} appointment(s)${result.failed.length ? `, ${result.failed.length} failed` : ""}.`);
      setSelected([]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel these appointments."),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (appointments ?? []).filter((a) => {
      if (serviceFilter && a.serviceId !== serviceFilter) return false;
      if (sourceFilter && a.source !== sourceFilter) return false;
      if (q && !a.customerName.toLowerCase().includes(q) && !a.customerPhone.toLowerCase().includes(q) && !a.serviceName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [appointments, serviceFilter, sourceFilter, query]);

  const now = useNow();
  const kpis = useMemo(() => {
    const all = appointments ?? [];
    const total = all.length;
    const upcoming = all.filter((a) => new Date(a.startsAt).getTime() > now && a.status !== "cancelled").length;
    const completed = all.filter((a) => a.status === "completed").length;
    const noShow = all.filter((a) => a.status === "no_show").length;
    const nsRate = total > 0 ? (noShow / total) * 100 : 0;
    return { total, upcoming, completed, nsRate };
  }, [appointments, now]);

  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of filtered) counts.set(a.date, (counts.get(a.date) ?? 0) + 1);
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }
  function toggleAll() {
    setSelected((ids) => (ids.length === filtered.length ? [] : filtered.map((a) => a.id)));
  }

  function exportCsv() {
    if (filtered.length === 0) return;
    const header = ["Date", "Time", "Customer", "Phone", "Service", "Staff", "Duration (min)", "Deposit", "Status", "Source"];
    const rows = filtered.map((a) => [
      formatDate(a.startsAt),
      formatTime(a.startsAt),
      a.customerName,
      a.customerPhone,
      a.serviceName,
      a.staffName ?? "Unassigned",
      String(Math.round(a.durationHours * 60)),
      String(a.depositPaid),
      a.status,
      SOURCE_LABEL[a.source],
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointments-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Appointments</h2>
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Date range" style={{ ...selectStyle, minHeight: 44, padding: "10px 12px" }}>
          {RANGE_OPTIONS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={exportCsv} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => remindMutation.mutate(filtered.map((a) => a.id))} disabled={filtered.length === 0 || remindMutation.isPending} style={outlineBtn}>Bulk Remind</button>
          <button type="button" onClick={() => cancelMutation.mutate(filtered.map((a) => a.id))} disabled={filtered.length === 0 || cancelMutation.isPending} style={{ ...outlineBtn, color: "var(--app-danger-strong)" }}>Bulk Cancel</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Total</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.total}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Upcoming</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.upcoming}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Completed</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{kpis.completed}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-danger-strong)" }}>No-Show Rate</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.nsRate.toFixed(0)}%</div>
        </div>
      </div>

      {perDay.length > 1 && (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Bookings per day</h3>
            <BarChart data={perDay} />
          </div>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Status split</h3>
            <StatusSplitChart appointments={filtered} />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Status" style={selectStyle}>
            <option value="">All statuses</option>
            <option value="requested">Requested</option>
            <option value="booked">Booked</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
            <option value="">All staff</option>
            {(staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Service" style={selectStyle}>
            <option value="">All services</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} aria-label="Source" style={selectStyle}>
            <option value="">All sources</option>
            <option value="link">Link</option>
            <option value="qr">QR</option>
            <option value="walk_in">Walk-in</option>
            <option value="waitlist">Waitlist</option>
            <option value="phone">Phone</option>
          </select>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-[11px_17px]" style={{ background: "var(--app-sidebar-bg)" }}>
            <span className="text-[12.5px] font-bold text-white">{selected.length} selected</span>
            <button type="button" onClick={() => setSelected([])} className="text-[12px] font-semibold" style={{ color: "#8FF0BB" }}>Clear selection</button>
            <span className="ms-auto flex gap-2">
              <button type="button" onClick={() => remindMutation.mutate(selected)} disabled={remindMutation.isPending} style={{ border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#fff", minHeight: 40 }}>Remind</button>
              <button type="button" onClick={() => cancelMutation.mutate(selected)} disabled={cancelMutation.isPending} style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#fff", minHeight: 40 }}>Cancel</button>
            </span>
          </div>
        )}

        {!isPending && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No appointments in this range</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Widen the date range or clear a filter.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1080 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]"><input type="checkbox" checked={filtered.length > 0 && selected.length === filtered.length} onChange={toggleAll} aria-label="Select all appointments" style={{ accentColor: "var(--app-primary)" }} /></th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date / Time</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Phone</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Service</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Staff</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Duration</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Deposit</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Source</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[11px_0_11px_17px]"><input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.customerName}`} style={{ accentColor: "var(--app-primary)" }} /></td>
                    <td className="whitespace-nowrap p-[11px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatDate(a.startsAt)} {formatTime(a.startsAt)}</td>
                    <td className="p-[11px] text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>{a.customerName}</td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{a.customerPhone}</td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{a.serviceName}</td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{a.staffName ?? "—"}</td>
                    <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{Math.round(a.durationHours * 60)}m</td>
                    <td className="p-[11px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{a.depositPaid > 0 ? formatCurrency(a.depositPaid, session.business.currency) : "—"}</td>
                    <td className="p-[11px]"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: STATUS_TONE[a.status].bg, color: STATUS_TONE[a.status].fg }}>{a.status.replace("_", " ")}</span></td>
                    <td className="p-[11px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{SOURCE_LABEL[a.source]}</td>
                    <td className="p-[11px_17px] text-end">
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => remindMutation.mutate([a.id])} style={smallOutline}>Remind</button>
                        <button type="button" onClick={() => cancelMutation.mutate([a.id])} style={{ ...smallOutline, color: "var(--app-text-faint)" }}>Cancel</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function BarChart({ data }: { data: [string, number][] }) {
  const height = 130;
  const max = Math.max(...data.map(([, count]) => count), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map(([date, count]) => (
          <div key={date} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t-[4px]" style={{ height: `${(count / max) * (height - 16)}px`, background: "var(--app-success-border)" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
        <span>{data[0][0]}</span>
        <span>{data[data.length - 1][0]}</span>
      </div>
    </div>
  );
}

function StatusSplitChart({ appointments }: { appointments: LiveAppointment[] }) {
  const counts = useMemo(() => {
    const map = new Map<LiveAppointment["status"], number>();
    for (const a of appointments) map.set(a.status, (map.get(a.status) ?? 0) + 1);
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a);
  }, [appointments]);
  const total = appointments.length || 1;

  if (counts.length === 0) return <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing in this range yet.</p>;

  return (
    <div className="flex flex-col gap-2.5">
      {counts.map(([status, count]) => (
        <div key={status}>
          <div className="mb-1 flex justify-between"><span className="text-[12px] font-semibold capitalize" style={{ color: "var(--app-text-muted)" }}>{status.replace("_", " ")}</span><span className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>{count}</span></div>
          <div className="h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
            <div className="h-full rounded-[6px]" style={{ width: `${(count / total) * 100}%`, background: STATUS_TONE[status].fg }} />
          </div>
        </div>
      ))}
    </div>
  );
}
