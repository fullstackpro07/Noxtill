"use client";

import { MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PrivateFeedback } from "@/lib/reviews";
import { formatDate } from "@/lib/format";

export function ComplaintInlineCard({ complaint }: { complaint: PrivateFeedback }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-destructive/25 bg-destructive/[0.03] p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareWarning className="h-4 w-4 text-destructive" aria-hidden />
          <span className="text-sm font-medium text-fg">{complaint.customerName}</span>
          <Badge tone={complaint.status === "resolved" ? "success" : "danger"}>{complaint.status}</Badge>
        </div>
        <span className="text-xs text-fg-faint">{formatDate(complaint.date)}</span>
      </div>
      <p className="mb-2 text-sm text-accent-foreground">
        {"★".repeat(complaint.rating)}
        {"☆".repeat(5 - complaint.rating)}
      </p>
      <p className="text-sm text-fg-muted">{complaint.text}</p>
      <p className="mt-2 text-xs text-fg-faint">Private feedback — not visible publicly. Manage from the Complaints tab.</p>
    </div>
  );
}
