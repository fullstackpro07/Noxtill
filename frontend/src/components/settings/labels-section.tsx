"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { SettingsSectionHeader } from "./settings-section-header";
import { fetchLabels, updateLabels, type LabelMatrix } from "@/lib/terminology-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const AREA_LABEL: Record<string, string> = {
  general: "General (WhatsApp messages)",
  pdf: "Invoice PDF",
};

export function LabelsSection() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["labels"], queryFn: fetchLabels });

  return (
    <div>
      <SettingsSectionHeader title="Labels & terminology" description="Rename what Noxtill calls things across your messages and documents." />
      {isError ? (
        <ErrorBanner title="Couldn't load labels" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <LabelsForm key={Object.keys(data).length} initial={data} />
      )}
    </div>
  );
}

function LabelsForm({ initial }: { initial: LabelMatrix }) {
  const queryClient = useQueryClient();
  const [matrix, setMatrix] = useState(initial);

  const mutation = useMutation({
    mutationFn: () => {
      const updates = Object.entries(matrix).flatMap(([area, terms]) =>
        Object.entries(terms)
          .filter(([key, value]) => initial[area]?.[key] !== value)
          .map(([key, value]) => ({ area, key, value })),
      );
      return updateLabels(updates);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["labels"], updated);
      toast.success("Labels saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these changes — please try again."),
  });

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(matrix).map(([area, terms]) => (
        <div key={area} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="mb-3 text-sm font-medium text-fg">{AREA_LABEL[area] ?? area}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(terms).map(([key, value]) => (
              <Input
                key={key}
                label={key}
                value={value}
                onChange={(e) => setMatrix({ ...matrix, [area]: { ...matrix[area], [key]: e.target.value } })}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
