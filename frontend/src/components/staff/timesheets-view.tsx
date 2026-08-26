"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import {
  fetchTimesheets,
  approveTimesheet,
  fetchTimesheetSettings,
  updateTimesheetSettings,
  type TimesheetRow,
} from "@/lib/staff-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function recentMonths(count = 6): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    return { value, label };
  });
}

export function TimesheetsView() {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: rows = [], isPending, isError, refetch } = useQuery({
    queryKey: ["timesheets", month],
    queryFn: () => fetchTimesheets(month),
  });

  const approveMutation = useMutation({
    mutationFn: (staffUserId: string) => approveTimesheet(staffUserId, month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheets", month] });
      toast.success("Timesheet approved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this timesheet — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-48">
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-3.5 w-3.5" aria-hidden />
          Break & overtime rules
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load timesheets" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Clock} title="No staff to report on" description="Timesheets are computed from real attendance for this month." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Staff</th>
                <th className="px-4 py-3 text-start">Hours worked</th>
                <th className="px-4 py-3 text-start">Overtime</th>
                <th className="px-4 py-3 text-start">Scheduled shifts</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: TimesheetRow) => (
                <tr key={r.businessUserId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-fg">{r.name}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.hoursWorked}h</td>
                  <td className="px-4 py-3">
                    {r.overtimeHours > 0 ? <Badge tone="warning">{r.overtimeHours}h OT</Badge> : <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{r.scheduledShiftCount}</td>
                  <td className="px-4 py-3">
                    {r.approved ? (
                      <Badge tone="success">
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        Approved
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Pending</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {!r.approved && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => approveMutation.mutate(r.businessUserId)}
                        disabled={approveMutation.isPending}
                      >
                        Approve
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settingsOpen && <BreakRulesDialog onClose={() => setSettingsOpen(false)} onSaved={() => refetch()} />}
    </div>
  );
}

function BreakRulesDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: settings, isPending } = useQuery({ queryKey: ["timesheet-settings"], queryFn: fetchTimesheetSettings });
  // null = not yet edited by the user, so the fields show the fetched settings as they arrive;
  // becomes a string the moment they type, so their edits are never clobbered by a re-fetch.
  const [editedOvertimeThreshold, setEditedOvertimeThreshold] = useState<string | null>(null);
  const [editedBreakThreshold, setEditedBreakThreshold] = useState<string | null>(null);
  const [editedBreakMinutes, setEditedBreakMinutes] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const overtimeThreshold = editedOvertimeThreshold ?? String(settings?.overtimeThresholdHoursPerWeek ?? "");
  const breakThreshold = editedBreakThreshold ?? String(settings?.breakThresholdHours ?? "");
  const breakMinutes = editedBreakMinutes ?? String(settings?.breakMinutesPerShift ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateTimesheetSettings({
        overtimeThresholdHoursPerWeek: Number(overtimeThreshold),
        breakThresholdHours: Number(breakThreshold),
        breakMinutesPerShift: Number(breakMinutes),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-settings"] });
      toast.success("Rules updated.");
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these rules — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Break & overtime rules"
      description="Applies to every future timesheet calculation for this business."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={isPending || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {isPending ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <Input
            label="Overtime threshold (hours/week)"
            type="number"
            min={1}
            value={overtimeThreshold}
            onChange={(e) => setEditedOvertimeThreshold(e.target.value)}
            hint="Weekly hours beyond this count as overtime."
          />
          <Input
            label="Break applies after (hours in one session)"
            type="number"
            min={1}
            value={breakThreshold}
            onChange={(e) => setEditedBreakThreshold(e.target.value)}
          />
          <Input
            label="Unpaid break deducted (minutes)"
            type="number"
            min={0}
            value={breakMinutes}
            onChange={(e) => setEditedBreakMinutes(e.target.value)}
            hint="Deducted from any single attendance session longer than the threshold above."
          />
        </div>
      )}
    </Dialog>
  );
}
