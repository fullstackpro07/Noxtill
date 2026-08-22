"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Bell, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatDate, formatTime, formatPercent } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchAppointments,
  bulkCancelAppointments,
  bulkRemindAppointments,
  fetchNoShowReport,
  type LiveAppointment,
  type AppointmentFilters,
} from "@/lib/bookings-api";
import { fetchStaff } from "@/lib/staff-api";

const SOURCE_LABEL: Record<LiveAppointment["source"], string> = {
  link: "Link",
  qr: "QR",
  walk_in: "Walk-in",
  waitlist: "Waitlist",
  phone: "Phone",
};

const STATUS_TONE: Record<LiveAppointment["status"], "primary" | "success" | "neutral" | "danger" | "warning"> = {
  requested: "primary",
  booked: "neutral",
  confirmed: "primary",
  completed: "success",
  cancelled: "neutral",
  no_show: "danger",
};

function todayIso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function AppointmentsListPanel() {
  const queryClient = useQueryClient();
  const [staffFilter, setStaffFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentFilters["status"] | "">("");
  const [selected, setSelected] = useState<string[]>([]);

  const from = todayIso(-14);
  const to = todayIso(30);

  const { data: appointments, isPending, isError, refetch } = useQuery({
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
  const { data: noShowReport } = useQuery({ queryKey: ["no-show-report"], queryFn: () => fetchNoShowReport(6) });

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

  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of appointments ?? []) {
      counts.set(a.date, (counts.get(a.date) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [appointments]);

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">In this range</p>
            <p className="font-display text-xl font-bold text-fg">{appointments?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">No-show rate (6mo)</p>
            <p className="font-display text-xl font-bold text-fg">{noShowReport ? formatPercent(noShowReport.overallRate) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Days covered</p>
            <p className="font-display text-xl font-bold text-fg">{perDay.length}</p>
          </CardContent>
        </Card>
      </div>

      {perDay.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-fg">Bookings per day</p>
            <BookingsPerDayChart data={perDay} />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="w-40">
            <option value="">All staff</option>
            {(staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AppointmentFilters["status"] | "")} className="w-40">
            <option value="">All statuses</option>
            <option value="requested">Requested</option>
            <option value="booked">Booked</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">{selected.length} selected</span>
            <Button variant="outline" size="sm" onClick={() => remindMutation.mutate(selected)} disabled={remindMutation.isPending}>
              <Bell className="h-3.5 w-3.5" aria-hidden />
              Remind
            </Button>
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate(selected)} disabled={cancelMutation.isPending}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {isError && <ErrorBanner title="Couldn't load appointments" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {appointments && appointments.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={ListOrdered} title="No appointments in this range" description="Try a different staff member or status filter." />
          </CardContent>
        </Card>
      )}
      {appointments && appointments.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-fg-muted">
              <tr>
                <th className="w-10 p-3" />
                <th className="p-3 text-start">Customer</th>
                <th className="p-3 text-start">Service</th>
                <th className="p-3 text-start">Staff</th>
                <th className="p-3 text-start">When</th>
                <th className="p-3 text-start">Source</th>
                <th className="p-3 text-start">Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                  </td>
                  <td className="p-3 text-fg">{a.customerName}</td>
                  <td className="p-3 text-fg-muted">{a.serviceName}</td>
                  <td className="p-3 text-fg-muted">{a.staffName ?? "—"}</td>
                  <td className="p-3 text-fg-muted">
                    {formatDate(a.startsAt)} {formatTime(a.startsAt)}
                  </td>
                  <td className="p-3 text-fg-muted">{SOURCE_LABEL[a.source]}</td>
                  <td className="p-3">
                    <Badge tone={STATUS_TONE[a.status]}>{a.status.replace("_", " ")}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BookingsPerDayChart({ data }: { data: [string, number][] }) {
  const width = 560;
  const height = 120;
  const max = Math.max(...data.map(([, count]) => count), 1);
  const barWidth = width / data.length;

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Bookings per day">
        {data.map(([date, count], i) => {
          const barHeight = (count / max) * height;
          return <rect key={date} x={i * barWidth + 1} y={height - barHeight} width={Math.max(barWidth - 2, 1)} height={barHeight} fill="var(--chart-1)" opacity={0.85} rx={2} />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>{data[0][0]}</span>
        <span>{data[data.length - 1][0]}</span>
      </div>
    </div>
  );
}
