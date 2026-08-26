"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/error-states";
import { messageAtRisk } from "@/lib/analytics-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function MessageAtRiskDialog({ atRiskCount, onClose }: { atRiskCount: number; onClose: () => void }) {
  const [offerText, setOfferText] = useState("Hi {{customerName}}, we miss you! Come back this week for 10% off.");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => messageAtRisk(offerText),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["analytics-customer-summary"] });
      toast.success(`Sent to ${result.sentCount} at-risk customer${result.sentCount === 1 ? "" : "s"}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this offer — please try again."),
  });

  const valid = offerText.trim().length >= 5;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Message at-risk customers"
      description={`Sends a real WhatsApp message to your ${atRiskCount} lapsed customer${atRiskCount === 1 ? "" : "s"} who haven't opted out.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Sending…" : `Send to ${atRiskCount}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="at-risk-offer" className="text-sm font-medium text-fg">
          Message
        </label>
        <textarea
          id="at-risk-offer"
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
          rows={4}
          className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <p className="text-xs text-fg-muted">Use <span className="font-mono">{"{{customerName}}"}</span> to personalize.</p>
        {mutation.isError && (
          <InlineError message={mutation.error instanceof ApiError ? mutation.error.message : "Couldn't send this offer — please try again."} />
        )}
      </div>
    </Dialog>
  );
}
