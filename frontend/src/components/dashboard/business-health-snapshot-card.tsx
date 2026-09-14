"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchHealthScore, HEALTH_SCORE_COMPONENT_LABEL, type HealthScoreComponents } from "@/lib/health-score-api";

const KEYS = Object.keys(HEALTH_SCORE_COMPONENT_LABEL) as (keyof HealthScoreComponents)[];

/** Real health-score snapshot — reuses the same /health-score data as the dedicated tab. Direction
 * arrows compare the two most recent history points per component (real deltas, not decoration). */
export function BusinessHealthSnapshotCard() {
  const router = useRouter();
  const { data, isPending } = useQuery({ queryKey: ["health-score", 3], queryFn: () => fetchHealthScore(3) });

  return (
    <section className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <h2 className="mb-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Business Health</h2>

      {isPending ? (
        <div className="mt-2 h-[140px] animate-pulse rounded-[12px]" style={{ background: "var(--app-surface-2)" }} />
      ) : !data || data.building ? (
        <p className="py-8 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
          {!data ? "Couldn't load." : data.message}
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[34px] font-extrabold leading-none" style={{ color: "var(--app-text)", letterSpacing: "-1.4px" }}>{data.score}</span>
            <span className="text-[13px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>/ 100</span>
            {data.history.length >= 2 && (() => {
              const latestScore = data.history[data.history.length - 1].totalScore;
              const prevScore = data.history[data.history.length - 2].totalScore;
              const delta = latestScore - prevScore;
              if (delta === 0) return null;
              return (
                <span className="ms-auto text-[12px] font-extrabold" style={{ color: delta > 0 ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
                  {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
                </span>
              );
            })()}
          </div>
          <div className="mt-3.5 flex flex-col gap-[7px]">
            {KEYS.map((key) => {
              const hist = data.history;
              const latest = hist[hist.length - 1];
              const prev = hist[hist.length - 2];
              const dir = latest && prev ? (latest[key] > prev[key] ? "up" : latest[key] < prev[key] ? "down" : "flat") : "flat";
              const color = dir === "up" ? "var(--app-success-text)" : dir === "down" ? "var(--app-danger-strong)" : "var(--app-text-disabled)";
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex-1 text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    {HEALTH_SCORE_COMPONENT_LABEL[key]}
                  </span>
                  <span className="text-[13px] font-extrabold" style={{ color }}>
                    {dir === "up" ? "▲" : dir === "down" ? "▼" : "–"}
                  </span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard/health-score")}
            className="mt-3.5 w-full rounded-[11px] py-[11px] text-[12.5px] font-extrabold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            View Health Score
          </button>
        </>
      )}
    </section>
  );
}
