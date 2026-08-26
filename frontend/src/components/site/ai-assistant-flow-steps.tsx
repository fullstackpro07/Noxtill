"use client";

import { useEffect, useRef, useState } from "react";
import { AI_ASSISTANT_STEPS } from "@/lib/marketing/home-content";

const STEP_DURATION = 900;
const HOLD_DURATION = 1800;
const RESET_PAUSE = 400;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Animates the "How Noxtill AI Assistant Works" step row: each step lights up in turn, the arrow
 * after it fills in once "passed", then the whole row holds on the completed state before looping. */
export function AiAssistantFlowSteps() {
  const lastIndex = AI_ASSISTANT_STEPS.length - 1;
  const [active, setActive] = useState<number>(() => (prefersReducedMotion() ? lastIndex : 0));
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;

    let timer: ReturnType<typeof setTimeout>;
    if (active === -1) {
      timer = setTimeout(() => setActive(0), RESET_PAUSE);
    } else if (active < lastIndex) {
      timer = setTimeout(() => setActive((a) => a + 1), STEP_DURATION);
    } else {
      timer = setTimeout(() => setActive(-1), HOLD_DURATION);
    }
    return () => clearTimeout(timer);
  }, [active, lastIndex]);

  return (
    <div className="flex flex-wrap items-start gap-2.5">
      {AI_ASSISTANT_STEPS.map((step, i) => {
        const isActive = i === active;
        const isDone = active !== -1 && i < active;
        const lit = isActive || isDone;
        return (
          <div key={step.title} className="contents">
            <div className="flex min-w-[118px] flex-1 basis-[130px] flex-col items-center gap-2.5 text-center">
              <span
                className={`flex h-[54px] w-[54px] items-center justify-center rounded-full border transition-colors duration-300 ${
                  lit ? "border-accent bg-accent shadow-[0_8px_20px_-10px_rgba(14,168,106,0.55)]" : "border-border bg-white shadow-[0_8px_20px_-14px_rgba(13,21,18,0.35)]"
                }`}
                style={isActive ? { animation: "step-pulse 0.7s ease-out" } : undefined}
              >
                <step.icon className={`h-6 w-6 ${lit ? "text-white" : "text-accent"}`} aria-hidden strokeWidth={1.8} />
              </span>
              <div className={`text-[13.5px] font-medium transition-colors duration-300 ${lit ? "text-fg" : "text-fg-faint"}`}>{step.title}</div>
              <div className="text-xs leading-snug text-fg-faint">{step.description}</div>
            </div>
            {i < lastIndex ? (
              <span
                className={`mt-6 flex-none self-start text-[15px] transition-colors duration-300 ${isDone ? "text-accent" : "text-[#9fdcc0]"}`}
              >
                →
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
