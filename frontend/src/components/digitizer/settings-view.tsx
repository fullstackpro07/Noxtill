"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchDigitizerAliases, removeDigitizerAlias } from "@/lib/digitizer-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function DigitizerSettingsView() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["digitizer-aliases"], queryFn: fetchDigitizerAliases });

  const removeMutation = useMutation({
    mutationFn: removeDigitizerAlias,
    onSuccess: () => {
      toast.success("Removed.");
      void queryClient.invalidateQueries({ queryKey: ["digitizer-aliases"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this correction."),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Scanner Settings</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Every time you correct a misread word during review, the scanner remembers it and applies the fix automatically on
          future scans — this is that real, learned list.
        </p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load learned corrections" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={BookOpen} title="Nothing learned yet" description="Correct a misread field during review and it'll show up here." />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="px-4 py-2 font-medium">The scanner read</th>
                <th className="px-4 py-2 font-medium">You corrected it to</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((alias) => (
                <tr key={alias.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-fg-muted line-through">{alias.rawText}</td>
                  <td className="px-4 py-2 font-medium text-fg">{alias.correctedText}</td>
                  <td className="px-4 py-2 text-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(alias.id)}
                      disabled={removeMutation.isPending}
                      aria-label={`Forget correction for ${alias.rawText}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
