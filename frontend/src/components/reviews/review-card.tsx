"use client";

import { useState } from "react";
import { Sparkles, Check, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLATFORM_LABELS, type ExternalReview } from "@/lib/reviews";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export function ReviewCard({ review }: { review: ExternalReview }) {
  const [draft, setDraft] = useState(review.aiDraftReply);
  const [editing, setEditing] = useState(false);
  const [posted, setPosted] = useState(review.status === "replied");

  function handleApprove() {
    setPosted(true);
    setEditing(false);
    toast.success("Reply posted. Live post wires up in INT-007.");
  }

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{PLATFORM_LABELS[review.platform]}</Badge>
          <span className="text-sm font-medium text-fg">{review.author}</span>
        </div>
        <span className="text-xs text-fg-faint">{formatDate(review.date)}</span>
      </div>
      <p className="mb-2 text-sm text-accent-foreground">
        {"★".repeat(review.rating)}
        {"☆".repeat(5 - review.rating)}
      </p>
      <p className="text-sm text-fg-muted">{review.text}</p>

      {posted ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-whatsapp">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Reply posted
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-primary/25 bg-primary/[0.04] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            AI-drafted reply
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          ) : (
            <p className="text-sm text-fg">{draft}</p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {editing ? "Done" : "Edit"}
            </Button>
            <Button size="sm" onClick={handleApprove}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Approve &amp; Post
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
