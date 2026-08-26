"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Mic } from "lucide-react";

/** Time (ms) spent at each phase before advancing to the next. Last entry is the "hold" before looping. */
const PHASE_DURATIONS = [950, 650, 1050, 550, 550, 500, 550, 2400];
const RESET_PAUSE = 500;
const LAST_PHASE = PHASE_DURATIONS.length - 1;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function TypingDots({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-1 px-0.5 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${tone === "dark" ? "bg-white/70" : "bg-fg-faint"}`}
          style={{ animation: "typing-bounce 1.1s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Fully animated WhatsApp-style mockup: loops through a realistic automation sequence — user asks
 * for a summary, Noxtill "types" and replies, then a summary card, report file and voice note land
 * one by one — rather than a static screenshot of a chat. Skips the cycle entirely (holds on the
 * settled final state) for prefers-reduced-motion, matching the Reveal component's convention.
 */
export function HeroPhoneMockup() {
  const [phase, setPhase] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const [cycle, setCycle] = useState(0);
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;

    let timer: ReturnType<typeof setTimeout>;
    if (phase === -1) {
      timer = setTimeout(() => setPhase(0), RESET_PAUSE);
    } else if (phase < LAST_PHASE) {
      timer = setTimeout(() => setPhase((p) => p + 1), PHASE_DURATIONS[phase]);
    } else {
      timer = setTimeout(() => {
        setPhase(-1);
        setCycle((c) => c + 1);
      }, PHASE_DURATIONS[phase]);
    }
    return () => clearTimeout(timer);
  }, [phase]);

  const userTyping = phase === 0;
  const userMsg = phase >= 1;
  const noxtillTyping = phase === 2;
  const noxtillMsg = phase >= 3;
  const summary = phase >= 4;
  const file = phase >= 5;
  const voice = phase >= 6;
  const sent = phase >= 7;

  return (
    <div className="w-[230px] sm:w-[250px]">
      <div className="rounded-[34px] bg-[#111c22] p-2 shadow-[0_44px_90px_-38px_rgba(13,21,18,0.55)]">
        <div className="flex aspect-[9/19] flex-col overflow-hidden rounded-[26px] bg-[#efe9df]">
          <div className="flex items-center gap-2 bg-[#075e45] px-3 py-3">
            <Image src="/brand/whatsapp.png" alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-full object-cover" />
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-white">Noxtill Business</div>
              <div className="flex items-center gap-1 text-[9.5px] text-[#a9d3c3]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" style={{ animation: "typing-bounce 2s ease-in-out infinite" }} />
                online
              </div>
            </div>
          </div>

          <div key={cycle} className="flex flex-1 flex-col justify-end gap-2 overflow-hidden p-3">
            {userTyping ? (
              <div className="animate-stagger-in self-end rounded-[12px_12px_3px_12px] bg-[#d9fdd3] px-3 py-2">
                <TypingDots />
              </div>
            ) : null}
            {userMsg ? (
              <div className="animate-stagger-in max-w-[85%] self-end rounded-[12px_12px_3px_12px] bg-[#d9fdd3] px-3 py-2 text-[11px] leading-snug text-fg">
                Give me today&apos;s business summary
              </div>
            ) : null}
            {noxtillTyping ? (
              <div className="animate-stagger-in self-start rounded-[12px_12px_12px_3px] bg-white px-3 py-2">
                <TypingDots />
              </div>
            ) : null}
            {noxtillMsg ? (
              <div className="animate-stagger-in max-w-[85%] self-start rounded-[12px_12px_12px_3px] bg-white px-3 py-2 text-[11px] text-fg">
                Here is your summary 👋
              </div>
            ) : null}
            {summary ? (
              <div className="animate-stagger-in w-[92%] self-start rounded-[10px] bg-white p-2">
                <div className="mb-1 text-[9.5px] font-medium text-fg">Today&apos;s Summary</div>
                <div className="flex flex-col gap-0.5 text-[9px] text-fg-muted">
                  {[
                    ["Sales", "$18,760"],
                    ["Profit", "$4,890"],
                    ["Orders", "128"],
                    ["Bookings", "18"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span>{label}</span>
                      <span className="font-medium text-fg">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {file ? (
              <div className="animate-stagger-in flex w-[68%] items-center gap-1.5 self-start rounded-[10px] bg-white px-2.5 py-2">
                <span className="h-4 w-4 flex-none rounded-[4px] bg-[#f42b3d]" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[9px] text-fg">Daily_Report.pdf</span>
              </div>
            ) : null}
            {voice ? (
              <div className="animate-stagger-in flex w-[54%] items-center gap-1.5 self-start rounded-[10px] bg-white px-2.5 py-2">
                <Mic className="h-3 w-3 flex-none text-whatsapp" aria-hidden />
                <span className="flex flex-1 items-center gap-[2px]">
                  {[5, 9, 6, 11, 7, 4, 8].map((h, i) => (
                    <span
                      key={i}
                      className="w-[2px] flex-none rounded-full bg-whatsapp/70"
                      style={{ height: `${h}px`, animation: "waveform-pulse 0.9s ease-in-out infinite", animationDelay: `${i * 0.08}s` }}
                    />
                  ))}
                </span>
                <span className="flex-none text-[8.5px] text-fg-faint">0:07</span>
              </div>
            ) : null}
            {sent ? (
              <div className="animate-stagger-in text-[8.5px] leading-snug text-fg-faint">Report sent to WhatsApp and email ✓</div>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 px-3 pb-3">
            <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[9.5px] text-fg-faint">Type a message</div>
            <div className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full bg-whatsapp">
              <ArrowRight className="h-3.5 w-3.5 -rotate-45 text-white" aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
