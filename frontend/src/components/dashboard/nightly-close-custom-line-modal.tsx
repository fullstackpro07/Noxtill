"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { updateNightlyCloseSettings, type NightlyCloseSettings } from "@/lib/nightly-close-api";

export function NightlyCloseCustomLineModal({ open, onClose, current }: { open: boolean; onClose: () => void; current?: NightlyCloseSettings }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      updateNightlyCloseSettings({
        customLines: [...(current?.config.customLines ?? []), { label: "Note", value: text.trim() }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nightly-close-settings"] });
      toast.success("Custom line added.");
      setText("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add the line — please try again."),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a custom line"
      description="Appears at the end of every Nightly Close."
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4.5 py-2 text-[12.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || text.trim().length === 0}
            className="rounded-[10px] px-4.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            {mutation.isPending ? "Adding…" : "Add line"}
          </button>
        </>
      }
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Tomorrow's staff: Ayesha, Bilal"
        aria-label="Custom line"
        className="w-full rounded-[10px] p-[11px] text-[13px]"
        style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text)" }}
      />
    </Dialog>
  );
}
