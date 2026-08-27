"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Lightbulb, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

const INSIGHTS = [
  {
    icon: TrendingUp,
    tone: "#0b8f5c",
    bg: "#e3fbf1",
    title: "Sales up 18% this week",
    description: "Mostly weekend bookings — Saturday alone brought in $2,140.",
  },
  {
    icon: AlertTriangle,
    tone: "#b45309",
    bg: "#fdf3e6",
    title: "3 customers overdue on credit",
    description: "$860 total outstanding, all more than 14 days overdue.",
  },
  {
    icon: TrendingDown,
    tone: "#c4563f",
    bg: "#fdecea",
    title: "Best-seller bookings down 22%",
    description: "Haircut & beard trim bookings dropped this month vs last.",
  },
  {
    icon: Lightbulb,
    tone: "#2c477e",
    bg: "#e8edfa",
    title: "Tuesday afternoons are your slowest",
    description: "Consider a promotion or staff reallocation for that slot.",
  },
];

const PHASE_DURATION = 1400;
const LAST_PHASE = INSIGHTS.length - 1;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Live demo for AI Insights: a feed of always-visible insight cards where a timer cycles which
 * one is currently "surfacing" (border + tint highlight, no box-shadow), reading as an
 * always-on analysis pass rather than a still list.
 */
export function AiInsightsFeedDemo() {
  const [active, setActive] = useState<number>(() => (prefersReducedMotion() ? LAST_PHASE : 0));
  const reducedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (reducedRef.current) return;
    const timer = setInterval(() => setActive((p) => (p + 1) % (LAST_PHASE + 1)), PHASE_DURATION);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full rounded-[var(--radius-lg)] border border-border p-4.5 shadow-[0_24px_60px_-44px_rgba(13,21,18,0.5)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#e3fbf1]">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden strokeWidth={1.9} />
          </span>
          <span className="font-display text-[17px] font-semibold text-fg">AI Insights</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3fbf1] px-2.5 py-1 text-[11.5px] text-[#0b8f5c]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Analysing
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {INSIGHTS.map((insight, i) => {
          const isActive = active === i;
          return (
            <div
              key={insight.title}
              className={`flex items-start gap-3 rounded-2xl border p-3.5 transition-colors duration-300 ${isActive ? "border-[#a9e8cb] bg-[#f2f9f6]" : "border-[#eef0ef] bg-white"}`}
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg" style={{ backgroundColor: insight.bg }}>
                <insight.icon className="h-4 w-4" style={{ color: insight.tone }} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[13.5px] font-semibold text-fg">{insight.title}</div>
                <div className="text-[12px] leading-snug text-fg-faint">{insight.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
