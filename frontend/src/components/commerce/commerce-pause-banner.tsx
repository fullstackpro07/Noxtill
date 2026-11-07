"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { AUTONOMOUS_COMMERCE_SUMMARY_KEY, fetchAutonomousCommerceSummary } from "@/lib/autonomous-commerce-api";
import { saveHubChanges } from "@/lib/settings-hub-api";
import { toast } from "@/lib/toast";
import { askConfirm } from "@/lib/ask-dialog";

/**
 * Commerce kill switch. Saves through Settings (Automations → Autonomous Commerce) so the change is
 * permission-checked and appears in settings history like any other setting.
 */
export function CommercePauseBanner() {
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: AUTONOMOUS_COMMERCE_SUMMARY_KEY, queryFn: fetchAutonomousCommerceSummary, staleTime: 60_000 });
  const paused = summary.data?.operations.paused ?? false;
  const toggle = useMutation({
    mutationFn: (next: boolean) => saveHubChanges([{ category: "automations", rowKey: "commerce-paused", value: next }]),
    onSuccess: async (_result, next) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: AUTONOMOUS_COMMERCE_SUMMARY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["settings-hub"] }),
      ]);
      toast.success(next ? "Commerce actions paused." : "Commerce actions resumed.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't change the commerce pause."),
  });
  if (!summary.data) return null;

  const pause = async () => {
    if (await askConfirm({ title: "Pause all commerce actions?", description: "Sending listings to channels, AI listing generation and subscription renewals will be refused until you resume.", tone: "danger", confirmLabel: "Pause" })) {
      toggle.mutate(true);
    }
  };

  return paused ? (
    <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs md:mx-7" style={{ borderColor: "var(--app-danger-strong)", background: "var(--app-surface)", color: "var(--app-text)" }} role="status">
      <span>
        <strong style={{ color: "var(--app-danger-strong)" }}>Commerce actions are paused.</strong> Channel sends, AI listing generation and subscription renewals are refused. Viewing and manual record keeping still work.
      </span>
      <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(false)} className="rounded-lg px-3 py-1.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
        {toggle.isPending ? "Resuming…" : "Resume"}
      </button>
    </div>
  ) : (
    <div className="mx-5 mt-3 flex justify-end md:mx-7">
      <button type="button" disabled={toggle.isPending} onClick={pause} className="text-xs font-bold underline disabled:opacity-50" style={{ color: "var(--app-text-faint)" }}>
        {toggle.isPending ? "Pausing…" : "Pause all commerce actions"}
      </button>
    </div>
  );
}
