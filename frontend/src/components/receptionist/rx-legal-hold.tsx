"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { placeLegalHold, releaseLegalHold } from "@/lib/voice-legal-hold-api";
import { inputCls, labelCls, saveCls } from "./rx-settings-forms";
import { useRxStore } from "./rx-store";

/** The call payload carries these columns; the shared call type does not declare them yet. */
export type LegalHoldFields = { legalHoldAt?: string | null; legalHoldReason?: string | null; transcriptRedactedAt?: string | null };

/** Place or release a legal hold on one call's recording and transcript, with a required reason. */
export function LegalHoldForm({ callId, held }: { callId: string; held: boolean }) {
  const qc = useQueryClient();
  const notify = useRxStore((s) => s.notify);
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex-none rounded-[12px] border border-[#E6E8EC] p-3.5">
      <label className={labelCls} htmlFor={`rx-hold-${callId}`}>
        Reason (kept in the audit trail)
      </label>
      <textarea
        id={`rx-hold-${callId}`}
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={held ? "e.g. Dispute closed; normal retention can resume." : "e.g. Customer dispute — keep audio until resolved."}
        className={`${inputCls} h-auto py-2.5 leading-[1.5]`}
      />
      <button
        type="button"
        disabled={busy || reason.trim().length < 8}
        onClick={async () => {
          setBusy(true);
          try {
            if (held) await releaseLegalHold(callId, reason.trim());
            else await placeLegalHold(callId, reason.trim());
            await qc.invalidateQueries({ queryKey: ["rx-insights"] });
            notify(held ? "Legal hold released" : "Legal hold placed", held ? "Normal retention and deletion apply again." : "The recording and transcript cannot be deleted or purged until the hold is released.");
            closeOverlays();
          } catch (error) {
            notify("Couldn't update the legal hold", error instanceof Error ? error.message : "Please try again.", "error");
          } finally {
            setBusy(false);
          }
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : held ? "Release hold" : "Place hold"}
      </button>
    </div>
  );
}
