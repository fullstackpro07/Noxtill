"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { History, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchDigitizerHistory, DESTINATION_LABELS, SCANNER_TYPE_LABELS, type DigitizerDestination } from "@/lib/digitizer-api";
import { formatDate, formatTime } from "@/lib/format";

const STATUS_TONE = {
  pending: "primary",
  processing: "primary",
  completed: "success",
  failed: "danger",
} as const;

const ALL_DESTINATIONS = Object.keys(DESTINATION_LABELS) as DigitizerDestination[];

export function DigitizerHistoryView() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["digitizer-history"], queryFn: fetchDigitizerHistory });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Scan History</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Every photo you&apos;ve scanned, most recent first.</p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load scan history" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={History} title="No scans yet" description="Scans you take will show up here." action={{ label: "Scan something", onClick: () => (window.location.href = "/digitizer") }} />
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((batch) => {
            const totalCount = ALL_DESTINATIONS.reduce((sum, d) => sum + (batch.counts[d] ?? 0), 0);
            return (
              <Link
                key={batch.id}
                href={`/digitizer/review?batch=${batch.id}`}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 hover:bg-surface-2"
              >
                <div className="flex items-center gap-3">
                  <ScanLine className="h-4 w-4 text-fg-faint" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-fg">{batch.scannerType ? SCANNER_TYPE_LABELS[batch.scannerType] : "Scan"}</p>
                    <p className="text-xs text-fg-faint">
                      {formatDate(batch.createdAt)} · {formatTime(batch.createdAt)} · {totalCount} row{totalCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <Badge tone={STATUS_TONE[batch.status]}>{batch.status}</Badge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
