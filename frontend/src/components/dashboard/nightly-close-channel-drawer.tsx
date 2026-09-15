"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, MessageSquare, Mail, Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { updateNightlyCloseSettings, type NightlyCloseChannel, type NightlyCloseSettings } from "@/lib/nightly-close-api";
import { SlideDrawer } from "./slide-drawer";

const CHANNELS: { key: NightlyCloseChannel; label: string; icon: typeof MessageCircle }[] = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "email", label: "Email", icon: Mail },
];

/** Multi-select (fix-it) — Nightly Close now has its own `channels` override, separate from the
 * shared `channelPref` field every other message type in the app still reads, so picking more than
 * one channel here genuinely sends the close on every one of them without touching anything else. */
export function NightlyCloseChannelDrawer({ open, onClose, current }: { open: boolean; onClose: () => void; current?: NightlyCloseSettings }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<NightlyCloseChannel[]>(
    current?.config.channels && current.config.channels.length > 0 ? current.config.channels : current ? [current.channel] : ["whatsapp"],
  );

  useEffect(() => {
    if (!current) return;
    setSelected(current.config.channels.length > 0 ? current.config.channels : [current.channel]);
  }, [current]);

  function toggle(key: NightlyCloseChannel) {
    setSelected((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  const mutation = useMutation({
    mutationFn: () => updateNightlyCloseSettings({ channels: selected }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nightly-close-settings"] });
      toast.success(selected.length > 1 ? `Delivery channels saved — sends on all ${selected.length}.` : "Delivery channel saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save the channel — please try again."),
  });

  return (
    <SlideDrawer open={open} onClose={onClose} title="Delivery Channel">
      <div className="flex flex-col gap-2.5">
        <p className="mb-1 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
          Pick one channel, or select more than one to send the same close on every one of them.
        </p>
        {CHANNELS.map((c) => {
          const picked = selected.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              className="flex items-center gap-3 rounded-[12px] p-[13px] text-start"
              style={{ border: picked ? "1px solid var(--app-primary)" : "1px solid var(--app-border)", background: picked ? "var(--app-success-bg)" : "var(--app-surface)" }}
            >
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border-strong)" }}>
                <c.icon className="h-4 w-4" style={{ color: "var(--app-primary)" }} aria-hidden />
              </span>
              <span className="flex-1 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{c.label}</span>
              {picked && (
                <span className="flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Selected
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || selected.length === 0}
          className="mt-1.5 w-full rounded-[10px] py-[11px] text-[12.5px] font-bold text-white disabled:opacity-60"
          style={{ background: "var(--app-primary)" }}
        >
          {mutation.isPending ? "Saving…" : selected.length > 1 ? `Save ${selected.length} Channels` : "Save Channel"}
        </button>
      </div>
    </SlideDrawer>
  );
}
