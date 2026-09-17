"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };

const FORMATS: { key: ExportFormat; label: string; description: string; iconBg: string; iconColor: string; buttonStyle: React.CSSProperties }[] = [
  { key: "xlsx", label: "Excel", description: "Full spreadsheet with every column — best for editing and re-importing.", iconBg: "var(--app-success-bg)", iconColor: "var(--app-primary)", buttonStyle: { border: 0, background: "var(--app-primary)", color: "#fff" } },
  { key: "csv", label: "CSV", description: "Plain, universal file that any other system can read.", iconBg: "#EEF4FF", iconColor: "#3538CD", buttonStyle: outlineBtn },
  { key: "pdf", label: "PDF Price List", description: "Customer-facing list, ready to print or send. Cost prices are never included.", iconBg: "#FEF0E6", iconColor: "#F97316", buttonStyle: outlineBtn },
];

/** Products Export (UPD-BE-089/UPD-FE-071) — owner-only end to end (the whole `/exports` controller
 * is capability-gated to owner), so cost price is only ever included for the one role that can reach this.
 * The design's own Columns-picker / Category-filter / Status-filter / Include-Cost-Prices sidebar is
 * dropped here: `generateExport()` has no filtering capability — it always returns every column for
 * every product, so a picker that didn't actually change the file would be dishonest UI. */
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
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Export Products</h2>
        <div className="rounded-[16px] p-[48px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-warning-border)" }}>
          <div className="text-[14.5px] font-extrabold" style={{ color: "#93370D" }}>Exports are available to the Owner</div>
          <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-warning-text)" }}>Product data, including cost prices, stays limited to your role.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Export Products</h2>
        <button type="button" onClick={() => setScheduling(true)} className="ms-auto" style={outlineBtn}>Schedule Recurring Export</button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(255px,1fr))" }}>
        {FORMATS.map((f) => (
          <div key={f.key} className="flex flex-col gap-2.5 rounded-[16px] p-[19px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-[11px]" style={{ background: f.iconBg, color: f.iconColor }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
            </span>
            <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{f.label}</div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faintest)" }}>{f.description}</div>
            <button
              type="button"
              onClick={() => { setPending(f.key); mutation.mutate(f.key); }}
              disabled={mutation.isPending}
              className="mt-auto self-start"
              style={{ ...f.buttonStyle, borderRadius: 11, padding: "12px 18px", fontSize: 12.5, fontWeight: 800, minHeight: 46, opacity: mutation.isPending ? 0.7 : 1 }}
            >
              {pending === f.key && mutation.isPending ? "Generating…" : `Export .${f.key}`}
            </button>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex items-center gap-2.5 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Scheduled exports</h3>
          <button type="button" onClick={() => setScheduling(true)} className="ms-auto" style={{ ...outlineBtn, minHeight: 40, padding: "8px 13px", fontSize: 12 }}>+ Schedule</button>
        </div>
        {productSchedules.length === 0 ? (
          <div className="p-[40px_18px] text-center">
            <div className="text-[13.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>No recurring exports</div>
            <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Get a fresh products export delivered automatically, weekly or monthly.</div>
          </div>
        ) : (
          <div className="flex flex-col">
            {productSchedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-[13px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{s.format.toUpperCase()} · {s.frequency}</p>
                  <p className="m-0 mt-0.5 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{s.lastRunAt ? `Last sent ${formatDate(s.lastRunAt)}` : "Not sent yet"}</p>
                </div>
                <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold" style={s.active ? { background: "var(--app-success-bg)", color: "var(--app-success-text)" } : { background: "var(--app-surface-2)", color: "var(--app-text-disabled)" }}>{s.active ? "Active" : "Paused"}</span>
                <button type="button" onClick={() => toggleMutation.mutate({ id: s.id, active: !s.active })} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 }}>{s.active ? "Pause" : "Resume"}</button>
                <button type="button" onClick={() => deleteMutation.mutate(s.id)} aria-label="Delete schedule" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--app-danger-strong)", minHeight: 40 }}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ScheduleExportModal open={scheduling} onClose={() => setScheduling(false)} />
    </main>
  );
}

function ScheduleExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Schedule a Recurring Products Export"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Scheduling…" : "Schedule"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Generated automatically on schedule; you&apos;ll get a notification with the download link each time.</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>FORMAT</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} className="w-full" style={{ ...selectStyle, width: "100%", minHeight: 46 }}>
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
            <option value="pdf">PDF price list</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>FREQUENCY</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)} className="w-full" style={{ ...selectStyle, width: "100%", minHeight: 46 }}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
    </PosModalShell>
  );
}
