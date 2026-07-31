"use client";

import { Sparkles } from "lucide-react";
import { useAssistantStore } from "@/store/assistant-store";

export function AssistantTriggerButton() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);

  if (open) return null;

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
