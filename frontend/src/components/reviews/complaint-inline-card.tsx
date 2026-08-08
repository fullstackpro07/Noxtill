"use client";

import { MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LivePrivateFeedback, FeedbackStatus } from "@/lib/reviews-api";
import { formatDate } from "@/lib/format";

const STATUS_TONE: Record<FeedbackStatus, "danger" | "warning" | "success"> = {
  open: "danger",
  assigned: "warning",
  resolved: "success",
};

export function ComplaintInlineCard({ complaint, customerName }: { complaint: LivePrivateFeedback; customerName: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-destructive/25 bg-destructive/[0.03] p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareWarning className="h-4 w-4 text-destructive" aria-hidden />
          <span className="text-sm font-medium text-fg">{customerName}</span>
          <Badge tone={STATUS_TONE[complaint.status]}>{complaint.status}</Badge>
        </div>
        <span className="text-xs text-fg-faint">{formatDate(complaint.createdAt)}</span>
      </div>
      <p className="mb-2 text-sm text-accent-foreground">
        {"★".repeat(complaint.stars)}
        {"☆".repeat(5 - complaint.stars)}
      </p>
      <p className="text-sm text-fg-muted">{complaint.message ?? "(no message left)"}</p>
      <p className="mt-2 text-xs text-fg-faint">Private feedback — not visible publicly. Manage from the Complaints tab.</p>
    </div>
  );
}
