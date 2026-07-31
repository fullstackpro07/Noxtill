"use client";

import { useEffect, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { TypingDots } from "./typing-dots";
import { ASSISTANT_MODULE } from "@/lib/landing-content";

const TURN_COUNT = ASSISTANT_MODULE.conversation.length;
const HOLD_AFTER_COMPLETE_MS = 4500;
const TYPING_MS = 1100;
const USER_APPEAR_MS = 500;

export function AssistantChatPanel() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- matchMedia is unavailable during SSR, so honoring the user's motion preference can only happen post-mount
      setVisibleCount(TURN_COUNT);
      return;
    }

    if (visibleCount >= TURN_COUNT) {
      const resetTimer = setTimeout(() => setVisibleCount(0), HOLD_AFTER_COMPLETE_MS);
      return () => clearTimeout(resetTimer);
    }

    const nextTurn = ASSISTANT_MODULE.conversation[visibleCount];
    const isAssistantTurn = nextTurn.role === "assistant";

    if (isAssistantTurn && !typing) {
      const typingTimer = setTimeout(() => setTyping(true), 300);
      return () => clearTimeout(typingTimer);
    }

    const delay = isAssistantTurn ? TYPING_MS : USER_APPEAR_MS;
    const advanceTimer = setTimeout(() => {
      setTyping(false);
      setVisibleCount((c) => c + 1);
    }, delay);
    return () => clearTimeout(advanceTimer);
  }, [visibleCount, typing]);

  const visibleTurns = ASSISTANT_MODULE.conversation.slice(0, visibleCount);

  return (
    <div className="flex h-[420px] flex-col overflow-hidden rounded-[var(--radius-noxtill)] border border-border/60 bg-[#0f1a15] shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">AI Business Assistant</p>
          <p className="truncate text-[11px] text-white/50">Powered by your own data (read-only)</p>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-whatsapp">
          <span className="h-1.5 w-1.5 rounded-full bg-whatsapp" />
          live
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
        {visibleTurns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                turn.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-white/8 text-white/90"
              }`}
            >
              {turn.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-white/8 px-2">
              <TypingDots tone="inverted" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
        <div className="h-9 flex-1 rounded-full bg-white/8 px-3.5 text-sm leading-9 text-white/40">Ask anything about your business…</div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Send className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}
