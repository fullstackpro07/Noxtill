"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchHealthScore, HEALTH_SCORE_COMPONENT_LABEL, type HealthScoreComponents } from "@/lib/health-score-api";

const KEYS = Object.keys(HEALTH_SCORE_COMPONENT_LABEL) as (keyof HealthScoreComponents)[];

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: "Excellent", color: "var(--app-primary)" };
  if (score >= 60) return { text: "Good", color: "var(--app-info, #2563EB)" };
  if (score >= 40) return { text: "Fair", color: "var(--app-warning-text)" };
  return { text: "Needs work", color: "var(--app-danger-strong)" };
}

function ratingFor(fraction: number): { text: string; color: string } {
  if (fraction >= 0.85) return { text: "Excellent", color: "var(--app-primary)" };
  if (fraction >= 0.6) return { text: "Good", color: "var(--app-info, #2563EB)" };
  return { text: "Needs work", color: "var(--app-danger-strong)" };
}

/** The design's second, separate Business Health widget — a bigger radial gauge next to the
 * Business Overview chart, distinct from the compact row-3 snapshot card. Reuses the same real
 * /health-score data; per-component ratings are derived from the real value/weight fraction
 * (>=85% Excellent, >=60% Good, else Needs work) rather than the demo's unrelated fabricated
 * categories (Sales Growth, Customer Growth, etc. — signals this app doesn't track individually). */
export function BusinessHealthGaugeCard() {
  const router = useRouter();
  const { data, isPending } = useQuery({ queryKey: ["health-score", 3], queryFn: () => fetchHealthScore(3) });

  const C = 2 * Math.PI * 80;

  return (
    <section className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <h2 className="mb-1.5 text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Business Health Score</h2>

      {isPending || !data ? (
        <div className="h-[220px] animate-pulse rounded-[12px]" style={{ background: "var(--app-surface-2)" }} />
      ) : data.building ? (
        <p className="py-8 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>{data.message}</p>
      ) : (
        <>
          <div className="mb-1.5 mt-0.5 flex justify-center">
            <div className="relative" style={{ width: "100%", maxWidth: 230, height: 118 }}>
              <svg viewBox="0 0 240 130" className="h-full w-full">
                <path d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="var(--app-surface-2)" strokeWidth={16} strokeLinecap="round" />
                <path
                  d="M20 120 A100 100 0 0 1 220 120"
                  fill="none"
                  stroke="var(--app-primary)"
                  strokeWidth={16}
                  strokeLinecap="round"
                  strokeDasharray={`${(data.score / 100) * C} ${C}`}
                />
              </svg>
              <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-1">
                <span className="text-[44px] font-extrabold leading-none" style={{ color: "var(--app-text)", letterSpacing: "-2px" }}>{Math.round(data.score)}</span>
                <span className="text-[14px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>/100</span>
              </div>
            </div>
          </div>
          <p className="mb-0.5 text-center text-[14px] font-bold" style={{ color: scoreLabel(data.score).color }}>{scoreLabel(data.score).text}</p>

          <div className="mt-3 flex flex-col gap-2.5">
            {KEYS.map((key) => {
              const max = data.weights[key];
              const value = data.components[key];
              const fraction = max > 0 ? value / max : 0;
              const rating = ratingFor(fraction);
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex-1 text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{HEALTH_SCORE_COMPONENT_LABEL[key]}</span>
                  <span className="text-[11.5px] font-bold" style={{ color: rating.color }}>{rating.text}</span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard/health-score")}
            className="mt-4 w-full rounded-[10px] py-[9px] text-[12.5px] font-bold"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
          >
            View Full Report
          </button>
        </>
      )}
    </section>
  );
}
