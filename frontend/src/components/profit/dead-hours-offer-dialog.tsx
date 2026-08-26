"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import { generateDeadHoursOffer, sendDeadHoursOffer } from "@/lib/profit-api";
import { fetchAudienceCount } from "@/lib/campaigns-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** The real primary segment keys `SegmentsService.whereForKey` special-cases — kept lowercase to match exactly. */
const SEGMENTS = [
  { key: "all", label: "All customers" },
  { key: "vip", label: "VIP" },
  { key: "lapsed", label: "Lapsed" },
  { key: "new", label: "New" },
];

export function DeadHoursOfferDialog({ onClose }: { onClose: () => void }) {
  // null = not yet edited by the user, so the textarea shows the AI draft as it streams in;
  // becomes a string the moment they type, so their edits are never clobbered by a re-fetch.
  const [editedOfferText, setEditedOfferText] = useState<string | null>(null);
  const [segment, setSegment] = useState("lapsed");
  const queryClient = useQueryClient();

  const generateMutation = useMutation({ mutationFn: generateDeadHoursOffer });
  const generateRef = generateMutation.mutate;
  useEffect(() => {
    generateRef();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offerText = editedOfferText ?? generateMutation.data?.offerText ?? "";

  const { data: audienceCount } = useQuery({
    queryKey: ["audience-count", segment],
    queryFn: () => fetchAudienceCount(segment),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendDeadHoursOffer(segment, offerText),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["quota-usage"] });
      toast.success(`Sent to ${result.sentCount} customer${result.sentCount === 1 ? "" : "s"}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this offer — please try again."),
  });

  const windowLabel = generateMutation.data?.windowLabel;
  const valid = offerText.trim().length >= 5;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Dead-hours offer"
      description={windowLabel ? `Your real slowest window: ${windowLabel}.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sendMutation.isPending}>
            Dismiss
          </Button>
          <Button onClick={() => sendMutation.mutate()} disabled={!valid || sendMutation.isPending || generateMutation.isPending}>
            {sendMutation.isPending ? "Sending…" : `Approve & send to ${audienceCount ?? "…"}`}
          </Button>
        </>
      }
    >
      {generateMutation.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div>
            <label htmlFor="dead-hours-offer-text" className="mb-1.5 block text-sm font-medium text-fg">
              Message
            </label>
            <textarea
              id="dead-hours-offer-text"
              value={offerText}
              onChange={(e) => setEditedOfferText(e.target.value)}
              rows={4}
              className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <Select label="Send to" value={segment} onChange={(e) => setSegment(e.target.value)}>
            {SEGMENTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          {sendMutation.isError && (
            <InlineError message={sendMutation.error instanceof ApiError ? sendMutation.error.message : "Couldn't send this offer — please try again."} />
          )}
        </div>
      )}
    </Dialog>
  );
}
