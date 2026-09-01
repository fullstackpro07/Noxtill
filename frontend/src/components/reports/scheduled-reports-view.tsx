"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { REPORT_DEFS, type ReportKind } from "@/lib/reports";
import type { ExportFormat } from "@/lib/exports-api";
import {
  createScheduledExport,
  deleteScheduledExport,
  fetchScheduledExports,
  updateScheduledExport,
  type LiveScheduledExport,
  type ScheduleFrequency,
  type ScheduleRecipient,
} from "@/lib/scheduled-exports-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const EXPORT_KINDS: { key: string; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "customers", label: "Customers" },
  { key: "credit", label: "Credit" },
  { key: "stock", label: "Stock" },
  { key: "expenses", label: "Expenses" },
  { key: "products", label: "Products" },
];

const FREQUENCY_DAYS: Record<ScheduleFrequency, number> = { weekly: 7, monthly: 28 };

function scheduleLabel(s: LiveScheduledExport): string {
  if (s.reportKind) return REPORT_DEFS.find((r) => r.key === s.reportKind)?.label ?? s.reportKind;
  return EXPORT_KINDS.find((k) => k.key === s.kind)?.label ?? s.kind ?? "—";
}

function recipientLabel(r: ScheduleRecipient): string {
  return r.label || r.email || r.phone || "—";
}

function estimateNextDelivery(s: LiveScheduledExport): Date | null {
  if (!s.active) return null;
  const dueDays = FREQUENCY_DAYS[s.frequency];
  const base = s.lastRunAt ? new Date(s.lastRunAt) : new Date(s.createdAt);
  return new Date(base.getTime() + dueDays * 24 * 60 * 60 * 1000);
}

export function ScheduledReportsView() {
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: schedules = [], isPending, isError, refetch } = useQuery({
    queryKey: ["scheduled-exports"],
    queryFn: fetchScheduledExports,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateScheduledExport(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduled-exports"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this schedule — please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScheduledExport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-exports"] });
      toast.success("Schedule removed.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this schedule — please try again."),
  });

  const activeCount = schedules.filter((s) => s.active).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const sentThisMonth = schedules.filter((s) => s.lastRunAt?.slice(0, 7) === thisMonth).length;
  const nextDeliveries = schedules.map(estimateNextDelivery).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());

  if (isError) {
    return <ErrorBanner title="Couldn't load scheduled reports" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isPending ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Active schedules" value={String(activeCount)} />
            <StatCard label="Sent this month" value={String(sentThisMonth)} />
            <StatCard label="Next delivery" value={nextDeliveries[0] ? formatDate(nextDeliveries[0].toISOString()) : "—"} />
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New schedule
        </Button>
      </div>

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState icon={Clock} title="No recurring reports or exports" description="Get a fresh report or data export delivered automatically, weekly or monthly." action={{ label: "New schedule", onClick: () => setCreating(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Schedule</th>
                <th className="px-4 py-3 text-start">Frequency</th>
                <th className="px-4 py-3 text-start">Delivery</th>
                <th className="px-4 py-3 text-start">Last sent</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-fg">{scheduleLabel(s)}</p>
                    <p className="text-xs text-fg-faint">{s.reportKind ? "Report" : "Export"} · {s.format.toUpperCase()}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-fg-muted">{s.frequency}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {s.recipients.length === 0 ? "In-app notification" : s.recipients.map(recipientLabel).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{s.lastRunAt ? formatDate(s.lastRunAt) : "Not sent yet"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Paused"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate({ id: s.id, active: !s.active })}>
                        {s.active ? "Pause" : "Resume"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(s.id)} aria-label="Delete schedule">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-fg-faint">
        &ldquo;Next delivery&rdquo; is estimated from the schedule&apos;s own frequency, not an exact send time — the real daily check runs at 6am.
      </p>

      {creating && <NewScheduleDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

function NewScheduleDialog({ onClose }: { onClose: () => void }) {
  const [pipeline, setPipeline] = useState<"export" | "report">("export");
  const [kind, setKind] = useState(EXPORT_KINDS[0].key);
  const [reportKind, setReportKind] = useState<ReportKind>(REPORT_DEFS[0].key);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [recipients, setRecipients] = useState<ScheduleRecipient[]>([]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createScheduledExport({
        kind: pipeline === "export" ? kind : undefined,
        reportKind: pipeline === "report" ? reportKind : undefined,
        format: pipeline === "export" ? format : undefined,
        frequency,
        recipients: recipients.filter((r) => r.phone || r.email),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-exports"] });
      toast.success("Schedule created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this schedule — please try again."),
  });

  function updateRecipient(i: number, patch: Partial<ScheduleRecipient>) {
    setRecipients((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="New recurring schedule"
      description="Delivered automatically on schedule — to explicit recipients if you add any, otherwise as an in-app notification."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Schedule"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex gap-1 rounded-full bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setPipeline("export")}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${pipeline === "export" ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-fg-muted"}`}
          >
            Data export
          </button>
          <button
            type="button"
            onClick={() => setPipeline("report")}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${pipeline === "report" ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-fg-muted"}`}
          >
            Report (PDF)
          </button>
        </div>

        {pipeline === "export" ? (
          <>
            <Select label="Export" value={kind} onChange={(e) => setKind(e.target.value)}>
              {EXPORT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
            <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <option value="xlsx">Excel</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </Select>
          </>
        ) : (
          <Select label="Report" value={reportKind} onChange={(e) => setReportKind(e.target.value as ReportKind)}>
            {REPORT_DEFS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        )}

        <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </Select>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Recipients (optional — leave empty for an in-app notification)</span>
            <Button variant="ghost" size="sm" onClick={() => setRecipients((r) => [...r, {}])}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {recipients.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Phone" value={r.phone ?? ""} onChange={(e) => updateRecipient(i, { phone: e.target.value })} className="flex-1" />
                <Input placeholder="Email" value={r.email ?? ""} onChange={(e) => updateRecipient(i, { email: e.target.value })} className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => setRecipients((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove recipient">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
