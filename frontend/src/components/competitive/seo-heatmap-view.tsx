"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchSeoHeatmap, scanSeoHeatmap } from "@/lib/seo-heatmap-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

// Leaflet touches `window` at import time — must load client-only, never during SSR.
const SeoHeatmapMap = dynamic(() => import("@/components/competitive/seo-heatmap-map").then((m) => m.SeoHeatmapMap), {
  ssr: false,
  loading: () => <div className="h-96 w-full rounded-[var(--radius-sm)] bg-surface-2" />,
});

export function SeoHeatmapView() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["seo-heatmap", activeKeyword],
    queryFn: () => fetchSeoHeatmap(activeKeyword!),
    enabled: !!activeKeyword,
  });

  const scanMutation = useMutation({
    mutationFn: () => scanSeoHeatmap({ keyword: activeKeyword! }),
    onSuccess: () => {
      toast.success("Scan complete.");
      void queryClient.invalidateQueries({ queryKey: ["seo-heatmap", activeKeyword] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't run the scan — please try again."),
  });

  function handleSearch() {
    const trimmed = keyword.trim();
    if (trimmed) setActiveKeyword(trimmed);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">SEO Heatmap</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Your real local-pack rank for a keyword, sampled at points around your business.</p>
      </div>

      <div className="mb-4 flex gap-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
          placeholder="e.g. best pizza near me"
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={!keyword.trim()}>
          <MapPin className="h-4 w-4" aria-hidden />
          Load
        </Button>
      </div>

      {!activeKeyword ? (
        <EmptyState icon={MapPin} title="Enter a keyword" description="Load a keyword's last scan, or run a new one." />
      ) : isError ? (
        <ErrorBanner title="Couldn't load the heatmap" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-fg">&quot;{activeKeyword}&quot;</p>
            <Button variant="outline" size="sm" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 ${scanMutation.isPending ? "animate-spin" : ""}`} aria-hidden />
              {scanMutation.isPending ? "Scanning…" : "Run new scan"}
            </Button>
          </div>

          {!data || data.points.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-faint">
              No scan yet for this keyword — run one above. Needs a maps/geocoding provider and SerpApi key configured.
            </p>
          ) : (
            <>
              <SeoHeatmapMap points={data.points} />
              <div className="mt-3 flex justify-center gap-4 text-xs text-fg-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2f9e57" }} /> Top 3
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#d99a1f" }} /> 4–10
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#d64545" }} /> 11+
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-surface-2 ring-1 ring-border" /> Not found
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
