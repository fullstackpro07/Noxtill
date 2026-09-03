"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Mic } from "lucide-react";

const TRANSCRIPT_LINES = ["Two haircuts,", "one beard trim,", "paid by card."];

const SALE_ITEMS = [
  { name: "Haircut & beard trim", qty: "×2", price: "$56.00" },
  { name: "Beard trim", qty: "×1", price: "$12.00" },
];

/** Phase durations (ms): listening → transcript lines → confirming → saved (hold). */
const PHASE_DURATIONS = [1300, 1500, 900, 2600];
const LAST_PHASE = PHASE_DURATIONS.length - 1;
const RESET_PAUSE = 500;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Always mount, only toggle opacity — keeps the card's height fixed across phases. */
function reveal(flag: boolean) {
  return flag ? "animate-stagger-in" : "opacity-0";
}

/**
 * Live demo for Voice-Entry Sales: a waveform "listens", a transcript builds line by line, then a
 * parsed sale confirmation card reveals with a checkmark before settling on "Saved", looping.
 */
export function AiVoiceSalesDemo() {
  const [phase, setPhase] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === -1) {
      timer = setTimeout(() => setPhase(0), RESET_PAUSE);
    } else if (phase < LAST_PHASE) {
      timer = setTimeout(() => setPhase((p) => p + 1), PHASE_DURATIONS[phase]);
    } else {
      timer = setTimeout(() => setPhase(-1), PHASE_DURATIONS[phase]);
    }
    return () => clearTimeout(timer);
  }, [phase]);

  const listening = phase === 0;
  const transcribing = phase === 1;
  const confirming = phase >= 2;
  const saved = phase >= 3;

  return (
    <div className="w-full rounded-[var(--radius-lg)] border border-border p-4.5 shadow-[0_24px_60px_-44px_rgba(13,21,18,0.5)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#e3fbf1]">
            <Mic className="h-4 w-4 text-accent" aria-hidden strokeWidth={1.9} />
          </span>
          <span className="font-display text-[17px] font-semibold text-fg">Voice-Entry Sales</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[11.5px] text-[#0b8f5c]">
          <span className={`h-1.5 w-1.5 rounded-full bg-accent ${listening ? "animate-pulse" : ""}`} /> {listening ? "Listening" : "Voice input"}
        </span>
      </div>

      <div className="mb-4 rounded-2xl border border-[#eef0ef] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex h-4 flex-1 items-end gap-[2px] overflow-hidden">
            {[6, 11, 7, 15, 9, 17, 8, 13, 6, 11, 7, 14, 9].map((h, i) => (
              <span
                key={i}
                className="w-[2.5px] flex-none rounded-full bg-accent/70"
                style={{
                  height: `${h}px`,
                  animationName: listening ? "waveform-pulse" : "none",
                  animationDuration: "1s",
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                  animationDelay: `${i * 0.07}s`,
                  opacity: listening ? 1 : 0.3,
                }}
              />
            ))}
          </span>
          <span className="flex-none font-mono text-[11px] text-fg-faint">00:04</span>
        </div>
        <div className="min-h-[44px]">
          <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-[14px] leading-snug text-fg">
            {TRANSCRIPT_LINES.map((line, i) =>
              i === 0 ? (
                <span key={line}>{line}</span>
              ) : (
                <span key={line} className={reveal(transcribing || confirming)} style={{ animationDelay: `${(i - 1) * 220}ms` }}>
                  {line}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="relative min-h-[200px]">
        <div className={`absolute inset-0 flex items-center justify-center text-[13px] text-fg-faint ${reveal(!confirming)}`}>Waiting for the sale to finish…</div>

        <div className={`absolute inset-0 rounded-2xl border border-[#d5eee2] bg-[#f7fdfa] p-4 ${reveal(confirming)}`}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="font-display text-[13.5px] font-semibold text-fg">Confirm sale</span>
            <span className="rounded-full border border-[#c8efdd] bg-white px-2.5 py-0.5 text-[10.5px] text-[#0b8f5c]">Card</span>
          </div>
          <div className="mb-2.5 flex flex-col gap-1.5">
            {SALE_ITEMS.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-fg-muted">
                  {item.name} <span className="text-fg-faint">{item.qty}</span>
                </span>
                <span className="font-medium text-fg">{item.price}</span>
              </div>
            ))}
          </div>
          <div className="mb-3 flex items-center justify-between border-t border-[#d5eee2] pt-2.5 font-display text-[14.5px] font-semibold text-fg">
            <span>Total</span>
            <span>$68.00</span>
          </div>
          <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-300 ${saved ? "bg-primary text-white" : "border border-border-strong bg-white text-fg"}`}>
            <Check className="h-4 w-4" aria-hidden />
            {saved ? "Saved to today's sales" : "Confirm sale"}
          </div>
        </div>
      </div>
    </div>
  );
}
