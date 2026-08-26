"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchAttendance, fetchStaffList, toggleAttendance } from "@/lib/staff-api";
import { formatDate, formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function durationLabel(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return "In progress";
  const hours = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (60 * 60 * 1000);
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function AttendanceView() {
  const session = useSession();
  const [staffFilter, setStaffFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: fetchStaffList });
  const {
    data: rows = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["attendance", staffFilter],
    queryFn: () => fetchAttendance({ staffUserId: staffFilter || undefined }),
  });

  // Independent of the staff-filter dropdown, so the clock-in/out button always reflects this
  // user's own real open session — not whichever row happens to be first in the filtered table.
  const { data: myRows = [] } = useQuery({
    queryKey: ["attendance", "self", session.user.businessUserId],
    queryFn: () => fetchAttendance({ staffUserId: session.user.businessUserId ?? undefined }),
    enabled: !!session.user.businessUserId,
  });
  const myOpenRow = myRows.find((r) => r.checkOut === null);

  const toggleMutation = useMutation({
    mutationFn: toggleAttendance,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(result.checkOut ? "Checked out." : "Checked in.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="flex items-center gap-2.5">
          <Fingerprint className="h-5 w-5 text-primary" aria-hidden />
          <p className="text-sm font-medium text-fg">Clock in or out for your own shift</p>
        </div>
        <Button onClick={() => toggleMutation.mutate()} disabled={toggleMutation.isPending}>
          {myOpenRow ? <LogOut className="h-4 w-4" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
          {toggleMutation.isPending ? "Recording…" : myOpenRow ? "Check out" : "Check in"}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-fg">Attendance history</p>
        <Select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="w-48">
          <option value="">All staff</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load attendance" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Fingerprint} title="No attendance recorded yet" description="Check-ins and check-outs will show up here." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Staff</th>
                <th className="px-4 py-3 text-start">Date</th>
                <th className="px-4 py-3 text-start">Check in</th>
                <th className="px-4 py-3 text-start">Check out</th>
                <th className="px-4 py-3 text-start">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-fg">{r.staffName}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(r.checkIn)}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatTime(r.checkIn)}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.checkOut ? formatTime(r.checkOut) : "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{durationLabel(r.checkIn, r.checkOut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
