"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Check, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { replyToReview, aiDraftReply, type LiveExternalReview } from "@/lib/reviews-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const PLATFORM_LABEL: Record<string, string> = { google: "Google", gmb: "Google", facebook: "Facebook", yelp: "Yelp" };

export function ReviewCard({ review }: { review: LiveExternalReview }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();

  const posted = !!review.replyText;

  const draftMutation = useMutation({
    mutationFn: () => aiDraftReply(review.id),
    onSuccess: ({ draft: text }) => {
      setDraft(text);
      setEditing(true);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't draft a reply — please try again.");
    },
  });

  const postMutation = useMutation({
    mutationFn: () => replyToReview(review.id, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setEditing(false);
      toast.success("Reply saved — it'll post once your Google listing is connected.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save this reply — please try again.");
    },
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{PLATFORM_LABEL[review.platform] ?? review.platform}</Badge>
          <span className="text-sm font-medium text-fg">{review.author ?? "Anonymous"}</span>
        </div>
        <span className="text-xs text-fg-faint">{formatDate(review.createdAt)}</span>
      </div>
      <p className="mb-2 text-sm text-accent-foreground">
        {"★".repeat(review.stars)}
        {"☆".repeat(5 - review.stars)}
      </p>
      <p className="text-sm text-fg-muted">{review.text ?? "(no text left with this review)"}</p>

      {posted ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-whatsapp">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Reply saved — will post once Google is connected
        </div>
      ) : editing ? (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-primary/25 bg-primary/[0.04] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            AI-drafted reply
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Cancel
            </Button>
            <Button size="sm" onClick={() => postMutation.mutate()} disabled={!draft.trim() || postMutation.isPending}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              {postMutation.isPending ? "Saving…" : "Approve & Post"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => draftMutation.mutate()} disabled={draftMutation.isPending}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {draftMutation.isPending ? "Drafting…" : "Draft AI reply"}
          </Button>
        </div>
      )}
    </div>
  );
}
