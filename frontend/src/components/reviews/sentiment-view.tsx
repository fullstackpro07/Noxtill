"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchReviewSentiment, fetchReviewMetricsHistory, type ReviewSentimentTheme } from "@/lib/reviews-api";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const SENTIMENT_TONE: Record<string, { bg: string; fg: string }> = {
  positive: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  negative: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
  neutral: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
};
function tone(sentiment: string) {
  return SENTIMENT_TONE[sentiment.toLowerCase()] ?? SENTIMENT_TONE.neutral;
}

function downloadCsv(rows: ReviewSentimentTheme[]) {
  const header = "Theme,Sentiment,Mentions,Example Quote\n";
  const body = rows.map((t) => `"${t.theme}",${t.sentiment},${t.reviewCount},"${t.exampleQuote.replace(/"/g, '""')}"`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sentiment-themes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function SentimentView() {
  const router = useRouter();
  const [themeFilter, setThemeFilter] = useState("All themes");
  const [detail, setDetail] = useState<ReviewSentimentTheme | null>(null);

  const { data: themes = [] } = useQuery({ queryKey: ["review-sentiment"], queryFn: fetchReviewSentiment });
  const { data: metricsHistory = [] } = useQuery({ queryKey: ["review-metrics-history"], queryFn: fetchReviewMetricsHistory });
  const sentimentTrend = metricsHistory.filter((m) => m.positiveThemePct != null);

  const totals = useMemo(() => {
    const bySentiment = new Map<string, number>();
    let total = 0;
    for (const t of themes) {
      const key = t.sentiment.toLowerCase();
      bySentiment.set(key, (bySentiment.get(key) ?? 0) + t.reviewCount);
      total += t.reviewCount;
    }
    return { bySentiment, total };
  }, [themes]);
  const pct = (key: string) => (totals.total > 0 ? Math.round(((totals.bySentiment.get(key) ?? 0) / totals.total) * 100) : 0);

  const topPraise = [...themes].filter((t) => t.sentiment.toLowerCase() === "positive").sort((a, b) => b.reviewCount - a.reviewCount)[0];
  const topComplaint = [...themes].filter((t) => t.sentiment.toLowerCase() === "negative").sort((a, b) => b.reviewCount - a.reviewCount)[0];

  const filtered = themeFilter === "All themes" ? themes : themes.filter((t) => t.theme === themeFilter);
  const maxMentions = Math.max(1, ...themes.map((t) => t.reviewCount));

  function goCreateAction() {
    toast.success("Action Center picks up recurring themes automatically — opening your open actions.");
    router.push("/dashboard/actions");
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Sentiment</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => downloadCsv(filtered)} style={outlineBtn}>Export</button>
          <button type="button" onClick={goCreateAction} style={primaryBtn}>Create Action From Theme</button>
        </div>
      </div>

      <div className="rounded-[12px] p-[11px_14px] text-[12px]" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
        Based on AI-clustered themes from your recent reviews (updated once daily) — not every review is individually scored.
      </div>

      {themes.length === 0 ? (
        <div className="rounded-[16px] p-[52px_18px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>We need around 20 reviews before themes become meaningful</p>
          <p className="m-0 mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Themes regenerate automatically once a day.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
            <Kpi label="Positive" value={`${pct("positive")}%`} color="var(--app-success-text)" />
            <Kpi label="Neutral" value={`${pct("neutral")}%`} color="var(--app-text-faint)" />
            <Kpi label="Negative" value={`${pct("negative")}%`} color="var(--app-danger-strong)" />
            <Kpi label="Top Praise Theme" value={topPraise?.theme ?? "—"} small />
            <Kpi label="Top Complaint Theme" value={topComplaint?.theme ?? "—"} small />
          </div>

          <div className="grid items-start gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
            <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Positive sentiment over time</h3>
              {sentimentTrend.length >= 2 ? (
                <SentimentTrendChart points={sentimentTrend} />
              ) : (
                <p className="m-0 py-8 text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough weekly history yet — a real trend appears once a few Monday snapshots have run.</p>
              )}
            </div>
            <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Theme frequency</h3>
              <div className="flex flex-col gap-2.5">
                {themes.map((t) => (
                  <div key={t.id}>
                    <div className="mb-[5px] flex justify-between"><span className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{t.theme}</span><span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{t.reviewCount}</span></div>
                    <span className="block h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                      <span className="block h-full rounded-[6px]" style={{ width: `${(t.reviewCount / maxMentions) * 100}%`, background: tone(t.sentiment).fg }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)} className="rounded-[10px] p-[9px_11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", minHeight: 42 }}>
                <option>All themes</option>
                {themes.map((t) => (
                  <option key={t.id}>{t.theme}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "var(--app-surface-2)" }}>
                    {["Theme", "Mentions", "Sentiment", "Example quote", "Trend", ""].map((h) => (
                      <th key={h} className="p-[10px_17px] text-left text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const c = tone(t.sentiment);
                    const trendGlyph = t.previousReviewCount == null ? "New" : t.reviewCount > t.previousReviewCount ? "▲" : t.reviewCount < t.previousReviewCount ? "▼" : "—";
                    return (
                      <tr key={t.id} onClick={() => setDetail(t)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                        <td className="p-3 pl-[17px] text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>{t.theme}</td>
                        <td className="p-3 text-center text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{t.reviewCount}</td>
                        <td className="p-3"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: c.bg, color: c.fg }}>{t.sentiment}</span></td>
                        <td className="p-3 text-[12px] italic" style={{ color: "var(--app-text-faintest)" }}>&ldquo;{t.exampleQuote}&rdquo;</td>
                        <td className="p-3 text-center text-[13px] font-extrabold" style={{ color: "var(--app-text-faint)" }}>{trendGlyph}</td>
                        <td className="p-3 pr-[17px] text-right"><span className="text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>View →</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {detail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={() => setDetail(null)}>
          <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{detail.theme}</h3>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
            </div>
            <div className="flex flex-col gap-3.5 p-[17px]">
              <span className="w-fit rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: tone(detail.sentiment).bg, color: tone(detail.sentiment).fg }}>{detail.sentiment}</span>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}><div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Mentions</div><div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{detail.reviewCount}</div></div>
                <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}><div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Previous run</div><div className="mt-1 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{detail.previousReviewCount ?? "New"}</div></div>
              </div>
              <div className="rounded-[12px] p-3.5 italic" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)", fontSize: 12.5 }}>&ldquo;{detail.exampleQuote}&rdquo;</div>
            </div>
            <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <button type="button" onClick={() => setDetail(null)} style={outlineBtn}>Close</button>
              <button type="button" onClick={goCreateAction} style={primaryBtn}>Create Action</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</div>
      <div className={small ? "mt-2 text-[14px] font-extrabold" : "mt-1.5 text-[22px] font-extrabold"} style={{ color: color ?? "var(--app-text)" }}>{value}</div>
    </div>
  );
}

function SentimentTrendChart({ points }: { points: { capturedAt: string; positiveThemePct: number | null }[] }) {
  const width = 620;
  const height = 126;
  const values = points.map((p) => p.positiveThemePct ?? 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const step = (width - 68) / (points.length - 1);
  const pts = points.map((p, i) => ({ x: 34 + i * step, y: 12 + 90 * (1 - ((p.positiveThemePct ?? 0) - min) / span) }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
      <path d={line} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#fff" stroke="var(--app-primary)" strokeWidth={1.8} />
      ))}
      {points.map((p, i) => (
        <text key={p.capturedAt} x={pts[i].x} y={121} textAnchor="middle" fontSize={10.5} fill="var(--app-text-faintest)" fontWeight={600}>{formatDate(p.capturedAt)}</text>
      ))}
    </svg>
  );
}
