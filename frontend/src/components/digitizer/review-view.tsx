"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { DESTINATION_FIELDS } from "@/components/digitizer/field-config";
import {
  fetchDigitizerScan,
  updateDigitizerRow,
  commitDigitizerBatch,
  DESTINATION_LABELS,
  type DigitizerScanPreview,
  type DigitizerRow,
  type DigitizerDestination,
  type DigitizerCommitResult,
} from "@/lib/digitizer-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const ALL_DESTINATIONS = Object.keys(DESTINATION_LABELS) as DigitizerDestination[];

export function ReviewView() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch");

  const { data: preview, isPending, isError, refetch } = useQuery({
    queryKey: ["digitizer-scan", batchId],
    queryFn: () => fetchDigitizerScan(batchId!),
    enabled: !!batchId,
  });

  if (!batchId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <ErrorBanner title="No scan selected" description="Start a new scan, or pick one from Scan History." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <ErrorBanner title="Couldn't load this scan" onRetry={() => refetch()} />
      </div>
    );
  }

  if (isPending || !preview) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  return <ReviewBody key={preview.batchId} initial={preview} />;
}

function ReviewBody({ initial }: { initial: DigitizerScanPreview }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(initial);
  const [result, setResult] = useState<DigitizerCommitResult | null>(null);

  const commitMutation = useMutation({
    mutationFn: () => commitDigitizerBatch(preview.batchId),
    onSuccess: (res) => {
      setResult(res);
      void queryClient.invalidateQueries({ queryKey: ["digitizer-history"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this scan — please try again."),
  });

  function updateRow(rowId: string, patch: Partial<Pick<DigitizerRow, "data" | "destination" | "action">>) {
    setPreview((p) => ({
      ...p,
      rows: p.rows.map((r) =>
        r.id === rowId ? { ...r, ...patch, data: patch.data ? { ...r.data, ...patch.data } : r.data } : r,
      ),
    }));
    updateDigitizerRow(rowId, patch).catch(() => toast.error("Couldn't save that edit — try again."));
  }

  const activeRows = preview.rows.filter((r) => r.action !== "skip");
  const alreadyCommitted = preview.status === "completed";

  if (result) {
    const totalCreated = ALL_DESTINATIONS.reduce((sum, d) => sum + result.created[d], 0);
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-whatsapp" aria-hidden />
          <p className="mt-3 font-display text-lg font-semibold text-fg">
            Saved {totalCreated} record{totalCreated === 1 ? "" : "s"}
          </p>
          <div className="mt-3 flex flex-col gap-1 text-sm text-fg-muted">
            {ALL_DESTINATIONS.filter((d) => result.created[d] > 0).map((d) => (
              <p key={d}>
                {result.created[d]} {DESTINATION_LABELS[d].toLowerCase()}
              </p>
            ))}
          </div>
          {result.skipped.length > 0 && (
            <p className="mt-3 text-xs text-destructive">
              {result.skipped.length} row{result.skipped.length === 1 ? "" : "s"} couldn&apos;t be saved (missing required fields).
            </p>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/digitizer/history">
              <Button variant="outline">View history</Button>
            </Link>
            <Button onClick={() => router.push("/digitizer")}>Scan another</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Review & Correct</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {alreadyCommitted ? "This scan has already been imported." : "Check what the AI read, fix anything wrong, then save."}
        </p>
      </div>

      {preview.rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing was found in this photo.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {preview.rows.map((row) => (
            <RowCard key={row.id} row={row} readOnly={alreadyCommitted} onUpdate={(patch) => updateRow(row.id, patch)} />
          ))}
        </div>
      )}

      {!alreadyCommitted && (
        <div className="mt-5 flex justify-end">
          <Button onClick={() => commitMutation.mutate()} disabled={activeRows.length === 0 || commitMutation.isPending}>
            {commitMutation.isPending ? "Saving…" : `Save ${activeRows.length || ""} record${activeRows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}

function RowCard({
  row,
  readOnly,
  onUpdate,
}: {
  row: DigitizerRow;
  readOnly: boolean;
  onUpdate: (patch: Partial<Pick<DigitizerRow, "data" | "destination" | "action">>) => void;
}) {
  const lowConfidence = row.confidence < LOW_CONFIDENCE_THRESHOLD;
  const skipped = row.action === "skip";
  const fields = DESTINATION_FIELDS[row.destination];

  return (
    <div className={`rounded-[var(--radius-noxtill)] border p-4 ${skipped ? "border-border bg-surface-2/40 opacity-60" : "border-border bg-surface"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {lowConfidence && !skipped && (
            <Badge tone="warning">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Low confidence
            </Badge>
          )}
          {row.corrected && <Badge tone="neutral">Edited</Badge>}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Select
              value={row.destination}
              onChange={(e) => onUpdate({ destination: e.target.value as DigitizerDestination })}
              className="h-8 w-44 text-xs"
            >
              {ALL_DESTINATIONS.map((d) => (
                <option key={d} value={d}>
                  {DESTINATION_LABELS[d]}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onUpdate({ action: skipped ? "commit" : "skip" })}
              aria-label={skipped ? "Include this row" : "Skip this row"}
            >
              <Trash2 className={`h-4 w-4 ${skipped ? "text-fg-faint" : "text-destructive"}`} aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {!skipped && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              type={field.type}
              disabled={readOnly}
              value={String(row.data[field.key] ?? "")}
              onChange={(e) =>
                onUpdate({ data: { [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
