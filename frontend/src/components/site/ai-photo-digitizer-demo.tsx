"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check } from "lucide-react";

const LEDGER_ROWS = [
  { date: "12 May", desc: "Haircut — James", amount: "$28.00" },
  { date: "12 May", desc: "Hair colour — Mia", amount: "$54.00" },
  { date: "13 May", desc: "Beard trim — Omar", amount: "$12.00" },
  { date: "13 May", desc: "Kids cut — Ali", amount: "$14.00" },
];

const ROW_DURATION = 750;
const LAST_PHASE = LEDGER_ROWS.length;
const HOLD_DURATION = 2400;
const RESET_PAUSE = 500;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function reveal(flag: boolean) {
  return flag ? "animate-stagger-in" : "opacity-0";
}

/**
 * Live demo for Photo Digitizer: a scanning line sweeps down a CSS-drawn paper-ledger mockup
 * while a structured data table on the right populates row by row in step, looping.
 */
export function AiPhotoDigitizerDemo() {
  const [phase, setPhase] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === -1) {
      timer = setTimeout(() => setPhase(0), RESET_PAUSE);
    } else if (phase < LAST_PHASE) {
      timer = setTimeout(() => setPhase((p) => p + 1), ROW_DURATION);
    } else {
      timer = setTimeout(() => setPhase(-1), HOLD_DURATION);
    }
    return () => clearTimeout(timer);
  }, [phase]);

  const scanning = phase >= 0 && phase < LAST_PHASE;
  const done = phase >= LAST_PHASE;

  return (
    <div className="w-full rounded-[var(--radius-lg)] border border-border p-4.5 shadow-[0_24px_60px_-44px_rgba(13,21,18,0.5)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#e3fbf1]">
            <Camera className="h-4 w-4 text-accent" aria-hidden strokeWidth={1.9} />
          </span>
          <span className="font-display text-[17px] font-semibold text-fg">Photo Digitizer</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[11.5px] text-[#0b8f5c]">
          <span className={`h-1.5 w-1.5 rounded-full bg-accent ${scanning ? "animate-pulse" : ""}`} /> {scanning ? "Scanning" : "Digitized"}
        </span>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <div className="relative min-w-[220px] flex-1 basis-[240px] overflow-hidden rounded-2xl border border-[#eef0ef] bg-[#fbfbf8] p-4">
          <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Paper register</div>
          <div className="flex flex-col gap-3">
            {LEDGER_ROWS.map((row, i) => (
              <div key={row.desc} className="border-b border-dashed border-[#e2ded0] pb-2.5" style={{ opacity: phase > i ? 1 : 0.45 }}>
                <div className="h-2 w-16 rounded-full bg-[#c9c3ab]" />
                <div className="mt-1.5 h-2 w-[85%] rounded-full bg-[#d8d3bd]" />
              </div>
            ))}
          </div>
          {scanning ? (
            <span
              className="pointer-events-none absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_12px_2px_rgba(14,168,106,0.55)]"
              style={{ animation: `scan-sweep ${ROW_DURATION * LAST_PHASE}ms linear infinite` }}
            />
          ) : null}
        </div>

        <div className="min-w-[220px] flex-1 basis-[260px] rounded-2xl border border-[#eef0ef] p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">Structured data</span>
            {done ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0b8f5c]">
                <Check className="h-3.5 w-3.5" aria-hidden /> Ready to save
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            {LEDGER_ROWS.map((row, i) => (
              <div key={row.desc} className={`flex items-center justify-between gap-2 rounded-xl border border-[#eef0ef] px-2.5 py-2 ${reveal(phase > i)}`}>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium text-fg">{row.desc}</div>
                  <div className="font-mono text-[10px] text-fg-faint">{row.date}</div>
                </div>
                <span className="flex-none font-display text-[13px] font-semibold text-fg">{row.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
