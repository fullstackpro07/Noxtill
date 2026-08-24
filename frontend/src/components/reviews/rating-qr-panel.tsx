"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QrGenerator } from "./qr-generator";
import { BrandingEditor } from "./branding-editor";
import { fetchQrStats, fetchReviewSettings } from "@/lib/reviews-api";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium text-fg-faint">{label}</span>
        <span className="font-display text-xl font-bold tabular-nums text-fg">{value}</span>
      </CardContent>
    </Card>
  );
}

export function RatingQrPanel({ businessName, businessSlug }: { businessName: string; businessSlug: string }) {
  const { data: stats } = useQuery({ queryKey: ["qr-stats"], queryFn: fetchQrStats });
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={`Scans (${stats?.windowDays ?? 30}d)`} value={stats ? String(stats.visits) : "…"} />
        <StatTile label="Ratings submitted" value={stats ? String(stats.ratingsSubmitted) : "…"} />
        <StatTile label="Conversion" value={stats ? `${stats.conversionRate}%` : "…"} />
        <StatTile label="Window" value={`${stats?.windowDays ?? 30} days`} />
      </div>

      {!settings?.publicReviewUrl && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-noxtill)] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            No public review platform is set yet — 4-5★ ratings stay private for now instead of redirecting to a public listing. Set one in{" "}
            <span className="font-medium">Review Settings</span> to send happy customers on to post publicly.
          </p>
        </div>
      )}

      <BrandingEditor businessName={businessName} />

      <Card>
        <CardContent className="p-5">
          <QrGenerator businessName={businessName} businessSlug={businessSlug} />
        </CardContent>
      </Card>
    </div>
  );
}
