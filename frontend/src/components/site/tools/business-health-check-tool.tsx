"use client";

import { useMemo, useState } from "react";
import { Check, Gauge, X } from "lucide-react";

const QUESTIONS = [
  { category: "Sales & Profit", text: "Do you know today's sales and profit as two separate numbers, not one combined figure?" },
  { category: "Sales & Profit", text: "Can you name your three highest-margin products or services without checking?" },
  { category: "Customers & Bookings", text: "Are repeat customers reminded before they'd naturally stop coming back?" },
  { category: "Customers & Bookings", text: "Are cancelled appointment slots actively refilled, not left empty?" },
  { category: "Inventory & Credit", text: "Do you know your current stock levels without a physical count?" },
  { category: "Inventory & Credit", text: "Do you know exactly who owes you money right now, and for how long?" },
  { category: "Systems & Reporting", text: "Do you get a summary of how the day went the same day, not weeks later?" },
  { category: "Systems & Reporting", text: "Do your sales, bookings, stock and customer records live in one connected system?" },
];

type Answer = boolean | null;

function resultFor(score: number) {
  if (score >= 7) return { label: "Strong", color: "#0b8f5c", bg: "#e3fbf1", message: "Your business is already running on real numbers. Noxtill's AI Insights can take it further — surfacing what changed and why, automatically." };
  if (score >= 4) return { label: "Needs attention", color: "#9a6a1e", bg: "#fdf3e6", message: "A few real gaps are quietly costing you. The good news: they usually come from the same root cause — disconnected systems." };
  return { label: "At risk", color: "#c4563f", bg: "#fdecea", message: "Several core numbers aren't visible to you right now. That's exactly what one connected system fixes, starting on day one." };
}

export function BusinessHealthCheckTool() {
  const [answers, setAnswers] = useState<Answer[]>(Array(QUESTIONS.length).fill(null));

  const answeredCount = answers.filter((a) => a !== null).length;
  const score = answers.filter((a) => a === true).length;
  const allAnswered = answeredCount === QUESTIONS.length;
  const result = useMemo(() => resultFor(score), [score]);

  function setAnswer(i: number, value: boolean) {
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  function reset() {
    setAnswers(Array(QUESTIONS.length).fill(null));
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#e3fbf1]">
            <Gauge className="h-4.5 w-4.5 text-accent" aria-hidden />
          </span>
          <span className="font-display text-lg font-semibold text-fg">Answer 8 quick questions</span>
        </div>
        <span className="font-mono text-[11px] text-fg-faint">{answeredCount}/8 answered</span>
      </div>

      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[#eef0ef]">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(answeredCount / QUESTIONS.length) * 100}%` }} />
      </div>

      <div className="mt-5 flex flex-col divide-y divide-border">
        {QUESTIONS.map((q, i) => (
          <div key={q.text} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <div className="min-w-[240px] flex-1">
              <div className="font-mono text-[10px] uppercase tracking-wide text-fg-faint">{q.category}</div>
              <div className="text-[13.5px] text-fg">{q.text}</div>
            </div>
            <div className="flex flex-none gap-1.5">
              <button
                type="button"
                onClick={() => setAnswer(i, true)}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  answers[i] === true ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-fg-muted hover:border-primary"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setAnswer(i, false)}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  answers[i] === false ? "border-[#c4563f] bg-[#fdecea] text-[#c4563f]" : "border-border-strong text-fg-muted hover:border-[#c4563f]"
                }`}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </div>

      {allAnswered ? (
        <div className="mt-6 rounded-xl border p-5" style={{ borderColor: result.color + "40", backgroundColor: result.bg }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white font-display text-lg font-bold" style={{ color: result.color }}>
                {score}/8
              </span>
              <div>
                <div className="font-display text-base font-semibold" style={{ color: result.color }}>
                  {result.label}
                </div>
                <div className="text-[12.5px] text-fg-muted">Your business health score</div>
              </div>
            </div>
            <button type="button" onClick={reset} className="text-[12.5px] font-medium text-fg-muted hover:text-primary">
              Start over
            </button>
          </div>
          <p className="mt-3.5 text-[13.5px] leading-relaxed text-[#1e3138]">{result.message}</p>
          <a
            href="/book-a-demo"
            className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover"
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Book a Demo to fix the gaps
          </a>
        </div>
      ) : (
        <p className="mt-5 flex items-center gap-1.5 text-[12.5px] text-fg-faint">
          <X className="h-3.5 w-3.5" aria-hidden /> Answer all 8 to see your score.
        </p>
      )}
    </div>
  );
}
