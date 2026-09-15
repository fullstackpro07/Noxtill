"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic } from "lucide-react";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchNightlyCloseVoiceOptions, updateNightlyCloseSettings, type NightlyCloseSettings } from "@/lib/nightly-close-api";
import { SlideDrawer } from "./slide-drawer";

/** Real voice list from the backend and only the two fields the real config actually supports
 * (enabled + which voice) — the design's language/speed controls aren't backed by any real
 * setting, so they're left out rather than faked. Fix-it: enabling this now places a real outbound
 * Twilio call reading the close aloud in the selected voice, via NightlyCloseVoiceCallService. */
export function NightlyCloseVoiceDrawer({ open, onClose, current }: { open: boolean; onClose: () => void; current?: NightlyCloseSettings }) {
  const queryClient = useQueryClient();
  const { data: voices } = useQuery({ queryKey: ["nightly-close-voice-options"], queryFn: fetchNightlyCloseVoiceOptions, enabled: open });
  const [enabled, setEnabled] = useState(current?.config.voiceNoteEnabled ?? false);
  const [voiceId, setVoiceId] = useState<string | null>(current?.config.voiceId ?? null);

  useEffect(() => {
    if (current) {
      setEnabled(current.config.voiceNoteEnabled);
      setVoiceId(current.config.voiceId);
    }
  }, [current]);

  const mutation = useMutation({
    mutationFn: () => updateNightlyCloseSettings({ voiceNoteEnabled: enabled, voiceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nightly-close-settings"] });
      toast.success("Voice note settings saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save voice settings — please try again."),
  });

  return (
    <SlideDrawer open={open} onClose={onClose} title="Voice Note Settings">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3 rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--app-success-bg)" }}>
            <Mic className="h-4 w-4" style={{ color: "var(--app-primary)" }} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Enable voice note</span>
            <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>A real phone call reading a short spoken summary of each close</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((e) => !e)}
            className="relative h-[22px] w-10 shrink-0 rounded-full transition-colors"
            style={{ background: enabled ? "var(--app-primary)" : "var(--app-border-strong)" }}
          >
            <span className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: enabled ? 20 : 2 }} />
          </button>
        </div>

        {enabled && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>VOICE</label>
            <select
              value={voiceId ?? ""}
              onChange={(e) => setVoiceId(e.target.value || null)}
              className="w-full rounded-[10px] p-[10px] text-[13px] font-semibold"
              style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", background: "var(--app-surface)" }}
            >
              <option value="">No voice selected</option>
              {(voices ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            {current && !current.voiceCallConfigured && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--app-warning-text)" }}>
                Voice calling isn&apos;t configured on this server yet — this will save, but no call will actually be placed until Twilio credentials are added.
              </p>
            )}
          </div>
        )}

        <div className="mt-1 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-[10px] py-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 rounded-[10px] py-[10px] text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </SlideDrawer>
  );
}
