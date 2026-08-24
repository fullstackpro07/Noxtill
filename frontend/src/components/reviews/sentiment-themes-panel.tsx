"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchReviewSentiment } from "@/lib/reviews-api";

const SENTIMENT_TONE: Record<string, "success" | "danger" | "warning"> = {
  positive: "success",
  negative: "danger",
  mixed: "warning",
};

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
              <p className="text-xs text-fg-faint">
                Mentioned in {t.reviewCount} review{t.reviewCount === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
