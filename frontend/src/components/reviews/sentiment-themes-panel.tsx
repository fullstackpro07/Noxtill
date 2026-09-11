"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchReviewSentiment, type ReviewSentimentTheme } from "@/lib/reviews-api";

const SENTIMENT_TONE: Record<string, "success" | "danger" | "warning"> = {
  positive: "success",
  negative: "danger",
  mixed: "warning",
};

/** Trend-arrows depth fix — a real comparison against the previous real generation run, never fabricated. */
function ThemeTrend({ theme }: { theme: ReviewSentimentTheme }) {
  if (theme.previousReviewCount == null) {
    return <span className="text-xs text-fg-faint">New</span>;
  }
  if (theme.reviewCount > theme.previousReviewCount) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-whatsapp">
        <TrendingUp className="h-3 w-3" aria-hidden />
        {theme.reviewCount - theme.previousReviewCount}
      </span>
    );
  }
  if (theme.reviewCount < theme.previousReviewCount) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-fg-muted">
        <TrendingDown className="h-3 w-3" aria-hidden />
        {theme.previousReviewCount - theme.reviewCount}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-fg-faint">
      <Minus className="h-3 w-3" aria-hidden />
    </span>
  );
}

export function SentimentThemesPanel() {
  const { data: themes, isPending } = useQuery({ queryKey: ["review-sentiment"], queryFn: fetchReviewSentiment });

  if (isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  if (!themes || themes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          Recurring themes, AI-clustered from your recent reviews
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => (
            <div key={t.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-2/40 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg">{t.theme}</span>
                <Badge tone={SENTIMENT_TONE[t.sentiment] ?? "warning"}>{t.sentiment}</Badge>
              </div>
              <p className="mb-1.5 text-xs italic text-fg-muted">&ldquo;{t.exampleQuote}&rdquo;</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-fg-faint">
                  Mentioned in {t.reviewCount} review{t.reviewCount === 1 ? "" : "s"}
                </p>
                <ThemeTrend theme={t} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
