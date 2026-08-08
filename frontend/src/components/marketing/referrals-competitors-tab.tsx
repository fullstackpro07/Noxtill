"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { ReferralSettingsCard } from "./referral-settings-card";
import { CompetitorCard } from "./competitor-card";
import { AddCompetitorDialog } from "./add-competitor-dialog";
import { KeywordEditor } from "./keyword-editor";
import { fetchCompetitors } from "@/lib/competitors-api";
import { MAX_COMPETITORS } from "@/lib/competitors";
import { toast } from "@/lib/toast";

export function ReferralsCompetitorsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: competitors = [], isPending, isError, refetch } = useQuery({
    queryKey: ["competitors"],
    queryFn: fetchCompetitors,
  });

  const atLimit = competitors.length >= MAX_COMPETITORS;

  function handleOpenAdd() {
    if (atLimit) {
      toast.error(`You can track up to ${MAX_COMPETITORS} competitors.`);
    }
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <ReferralSettingsCard />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Competitors</p>
          <Button size="sm" variant="outline" onClick={handleOpenAdd}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Track competitor
          </Button>
        </div>
        {isError ? (
          <ErrorBanner title="Couldn't load competitors" description="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {isPending ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : competitors.length === 0 ? (
              <p className="text-sm text-fg-faint">No competitors tracked yet.</p>
            ) : (
              competitors.map((c) => <CompetitorCard key={c.id} competitor={c} />)
            )}
          </div>
        )}
      </div>

      <KeywordEditor />

      <AddCompetitorDialog open={dialogOpen} onClose={() => setDialogOpen(false)} atLimit={atLimit} />
    </div>
  );
}
