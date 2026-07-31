"use client";

import { useEffect, useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { TypingDots } from "./typing-dots";

type Phase = "waiting" | "typing" | "sent" | "read";

const TIMINGS: Record<Phase, number> = {
  waiting: 900,
  typing: 1400,
  sent: 700,
  read: 5200,
};

const NEXT_PHASE: Record<Phase, Phase> = {
  waiting: "typing",
  typing: "sent",
  sent: "read",
  read: "waiting",
};

export function NightlyClosePhone() {
  const [phase, setPhase] = useState<Phase>("waiting");

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- matchMedia is unavailable during SSR, so honoring the user's motion preference can only happen post-mount
      setPhase("read");
      return;
    }
    const timer = setTimeout(() => setPhase((p) => NEXT_PHASE[p]), TIMINGS[phase]);
    return () => clearTimeout(timer);
  }, [phase]);

  const showMessage = phase === "sent" || phase === "read";

  return (
    <div className="flex h-full flex-col bg-[#efe9db]">
      <div className="flex items-center gap-2.5 border-b border-black/5 bg-surface px-3.5 py-2.5">
        <button aria-hidden className="text-fg-faint">
          ‹
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          <span className="h-2 w-2 rounded-full bg-primary-foreground/0" />
          🌙
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">Noxtill</p>
          <p className="truncate text-[11px] text-fg-faint">Business account online</p>
        </div>
        <span className="text-fg-faint">⌕</span>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-2 px-3 pb-3">
        <p className="my-2 self-center rounded-full bg-black/5 px-2.5 py-1 text-[10px] text-fg-faint">Monday, 14 July 2026</p>

        {phase === "typing" && (
          <div className="w-fit rounded-2xl rounded-tl-sm bg-surface px-3 shadow-sm">
            <TypingDots />
          </div>
        )}

        {showMessage && (
          <div className="animate-stagger-in w-[88%] rounded-2xl rounded-tl-sm bg-surface p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1 text-xs font-semibold text-fg">🌙 Nightly Close</p>
              <span className="text-[10px] text-fg-faint">10:00 PM</span>
            </div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Al Nour Café</p>
            <div className="flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between"><span className="text-fg-faint">Sales today</span><span className="font-medium text-fg">AED 2,847</span></div>
              <div className="flex justify-between"><span className="text-fg-faint">Net profit</span><span className="font-medium text-whatsapp">AED 891 · 31%</span></div>
              <div className="flex justify-between"><span className="text-fg-faint">New reviews</span><span className="font-medium text-fg">4 · avg 4.9</span></div>
              <div className="flex justify-between"><span className="text-fg-faint">Tomorrow</span><span className="font-medium text-fg">11 bookings</span></div>
              <div className="flex justify-between"><span className="text-fg-faint">Credit recovered</span><span className="font-medium text-fg">AED 340</span></div>
              <div className="flex justify-between"><span className="text-fg-faint">Low stock</span><span className="font-medium text-destructive">Oat milk</span></div>
            </div>
            <div className="mt-2.5 rounded-full bg-primary py-1.5 text-center text-[11px] font-medium text-primary-foreground">
              View full report →
            </div>
            <div className="mt-1.5 flex justify-end">
              {phase === "read" ? (
                <CheckCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-black/5 bg-surface px-3 py-2">
        <div className="h-7 flex-1 rounded-full bg-black/5" />
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">➤</span>
      </div>
    </div>
  );
}
