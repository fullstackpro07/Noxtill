"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReferralSettingsCard } from "./referral-settings-card";
import { CompetitorCard } from "./competitor-card";
import { AddCompetitorDialog } from "./add-competitor-dialog";
import { KeywordEditor } from "./keyword-editor";
import { COMPETITORS as INITIAL_COMPETITORS, MAX_COMPETITORS, type Competitor } from "@/lib/competitors";
import { toast } from "@/lib/toast";

export function ReferralsCompetitorsTab() {
  const [competitors, setCompetitors] = useState<Competitor[]>(INITIAL_COMPETITORS);
  const [dialogOpen, setDialogOpen] = useState(false);

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} />
          ))}
        </div>
      </div>

      <KeywordEditor />

      <AddCompetitorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdd={(c) => setCompetitors((prev) => [...prev, c])}
        atLimit={atLimit}
      />
    </div>
  );
}
