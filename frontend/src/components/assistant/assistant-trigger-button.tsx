"use client";

import { Sparkles } from "lucide-react";
import { useAssistantStore } from "@/store/assistant-store";
import { useDashboardStore } from "@/store/dashboard-store";

/** Fix-it: this floating launcher sits at the same bottom-right corner as Customize Dashboard's
 * own fixed Save/Cancel bar (z-40) — at z-[140] it was rendering on top of the real Save button,
 * silently swallowing clicks meant for it. Hidden while customizing rather than re-juggling
 * z-index/padding, since two floating action affordances in the same corner is bad UX regardless. */
export function AssistantTriggerButton() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const isCustomizing = useDashboardStore((s) => s.isCustomizing);

  if (open || isCustomizing) return null;

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open assistant"
      className="fixed bottom-5 end-5 z-[140] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lg)] transition-transform hover:scale-105 active:scale-95"
    >
      <Sparkles className="h-5 w-5" aria-hidden />
    </button>
  );
}
