"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { updateNightlyCloseSettings, type NightlyCloseSettings } from "@/lib/nightly-close-api";

const TIME_OPTIONS = ["21:00", "22:00", "23:00", "00:00"];
function label12h(t: string): string {
  const [h] = t.split(":").map(Number);
  if (h === 0) return "Midnight";
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:00 ${period}`;
}

export function NightlyCloseTimeModal({ open, onClose, current }: { open: boolean; onClose: () => void; current?: NightlyCloseSettings }) {
  const queryClient = useQueryClient();
  const [time, setTime] = useState(current?.time ?? "22:00");

  const mutation = useMutation({
    mutationFn: () => updateNightlyCloseSettings({ time }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nightly-close-settings"] });
      toast.success("Send time updated.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update the send time — please try again."),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change send time"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4.5 py-2 text-[12.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-[10px] px-4.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            {mutation.isPending ? "Saving…" : "Save time"}
          </button>
        </>
      }
    >
      <select
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label="Send time"
        className="w-full rounded-[10px] p-[11px] text-[13px] font-semibold"
        style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", background: "var(--app-surface)" }}
      >
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>{label12h(t)}</option>
        ))}
      </select>
      <p className="mt-2.5 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Times are shown in your business's configured timezone.</p>
    </Dialog>
  );
}
