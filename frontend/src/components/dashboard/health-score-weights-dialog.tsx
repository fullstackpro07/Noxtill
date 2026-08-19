"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import {
  HEALTH_SCORE_COMPONENT_LABEL,
  updateHealthScoreWeights,
  type HealthScoreWeights,
} from "@/lib/health-score-api";

const FIELDS = Object.keys(HEALTH_SCORE_COMPONENT_LABEL) as (keyof HealthScoreWeights)[];

/** Only mounts its body while `open` (same pattern as `ComplaintDrawer`) — so `draft` always
 * initializes fresh from the latest `weights` on each open, with no effect-driven reset needed. */
export function HealthScoreWeightsDialog({
  open,
  onClose,
  weights,
}: {
  open: boolean;
  onClose: () => void;
  weights: HealthScoreWeights;
}) {
  if (!open) return null;
  return <HealthScoreWeightsDialogBody onClose={onClose} weights={weights} />;
}

function HealthScoreWeightsDialogBody({
  onClose,
  weights,
}: {
  onClose: () => void;
  weights: HealthScoreWeights;
}) {
  const [draft, setDraft] = useState<HealthScoreWeights>(weights);
  const queryClient = useQueryClient();

  const total = FIELDS.reduce((sum, key) => sum + (draft[key] || 0), 0);
  const canSave = total === 100;

  const mutation = useMutation({
    mutationFn: () => updateHealthScoreWeights(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-score"] });
      toast.success("Weighting saved — next score update will use it.");
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the weighting — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Adjust score weighting"
      description="Each component's share of the 100-point score. Must add up to exactly 100."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save weighting"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {FIELDS.map((key) => (
          <Input
            key={key}
            type="number"
            min={0}
            max={100}
            label={HEALTH_SCORE_COMPONENT_LABEL[key]}
            trailingSlot="pts"
            value={draft[key]}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
          />
        ))}
        <p className={`text-sm font-medium ${canSave ? "text-fg-muted" : "text-destructive"}`}>
          Total: {total} / 100 {!canSave && "— must equal 100"}
        </p>
      </div>
    </Dialog>
  );
}
