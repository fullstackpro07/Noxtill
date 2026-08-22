"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, FileType, Download, Clock, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { generateExport, type ExportFormat } from "@/lib/exports-api";
import {
  createScheduledExport,
  deleteScheduledExport,
  fetchScheduledExports,
  updateScheduledExport,
  type ScheduleFrequency,
} from "@/lib/scheduled-exports-api";

const FORMATS: { key: ExportFormat; label: string; description: string; icon: typeof FileSpreadsheet }[] = [
  { key: "xlsx", label: "Excel", description: "Full workbook, ideal for further editing.", icon: FileSpreadsheet },
  { key: "csv", label: "CSV", description: "Plain text, works with any spreadsheet tool.", icon: FileText },
  { key: "pdf", label: "PDF price list", description: "A printable, read-only price list.", icon: FileType },
];

/** Products Export (UPD-BE-089/UPD-FE-071) — owner-only end to end (the whole `/exports` controller
 * is capability-gated to owner), so cost price is only ever included for the one role that can reach this. */
export function ProductsExportPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const { data: schedules } = useQuery({ queryKey: ["scheduled-exports"], queryFn: fetchScheduledExports });
  const productSchedules = (schedules ?? []).filter((s) => s.kind === "products");

  const mutation = useMutation({
    mutationFn: (format: ExportFormat) => generateExport("products", format),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Export ready — opening in a new tab.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this export — please try again."),
    onSettled: () => setPending(null),
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

  if (session.user.role !== "owner") {
    return <PermissionLockCard description="Product exports are limited to the business owner." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <Card key={f.key}>
            <CardContent className="flex flex-col items-start gap-2 p-5">
              <f.icon className="h-6 w-6 text-primary" aria-hidden />
              <p className="font-display text-base font-semibold text-fg">{f.label}</p>
              <p className="text-xs text-fg-muted">{f.description}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setPending(f.key);
                  mutation.mutate(f.key);
                }}
                disabled={mutation.isPending}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {pending === f.key && mutation.isPending ? "Generating…" : `Download ${f.label}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-fg-faint">
        Every column, including cost price, is included — this export is already limited to the business owner, so there&apos;s nothing to
        additionally hide.
      </p>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-fg-muted" aria-hidden />
            <CardTitle>Scheduled exports</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setScheduling(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Schedule recurring export
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {productSchedules.length === 0 ? (
            <EmptyState icon={Clock} title="No recurring exports" description="Get a fresh products export delivered automatically, weekly or monthly." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {productSchedules.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      {s.format.toUpperCase()} · {s.frequency}
                    </p>
                    <p className="text-xs text-fg-faint">{s.lastRunAt ? `Last sent ${formatDate(s.lastRunAt)}` : "Not sent yet"}</p>
                  </div>
                  <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Paused"}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate({ id: s.id, active: !s.active })}>
                    {s.active ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(s.id)} aria-label="Delete schedule">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ScheduleExportDialog open={scheduling} onClose={() => setScheduling(false)} />
    </div>
  );
}

function ScheduleExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createScheduledExport({ kind: "products", format, frequency }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-exports"] });
      toast.success("Recurring export scheduled.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't schedule this export — please try again."),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule a recurring products export"
      description="Generated automatically on schedule; you'll get a notification with the download link each time."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Scheduling…" : "Schedule"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
          <option value="xlsx">Excel</option>
          <option value="csv">CSV</option>
          <option value="pdf">PDF price list</option>
        </Select>
        <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </div>
    </Dialog>
  );
}
