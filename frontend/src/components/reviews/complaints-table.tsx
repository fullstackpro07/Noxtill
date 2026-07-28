"use client";

import { useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ComplaintDrawer } from "./complaint-drawer";
import { PRIVATE_FEEDBACK, type PrivateFeedback } from "@/lib/reviews";
import { formatDate } from "@/lib/format";

export function ComplaintsTable({ currency }: { currency: string }) {
  const [complaints, setComplaints] = useState<PrivateFeedback[]>(PRIVATE_FEEDBACK);
  const [selected, setSelected] = useState<PrivateFeedback | null>(null);

  function handleResolve(id: string, note: string) {
    setComplaints((prev) => prev.map((c) => (c.id === id ? { ...c, status: "resolved", resolutionNote: note } : c)));
  }

  if (complaints.length === 0) {
    return <EmptyState icon={MessageSquareWarning} title="No private feedback" description="Low-rated feedback lands here privately." />;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Customer</th>
              <th className="px-4 py-3 text-start">Rating</th>
              <th className="px-4 py-3 text-start">Feedback</th>
              <th className="px-4 py-3 text-start">Date</th>
              <th className="px-4 py-3 text-start">Status</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelected(c)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50"
              >
                <td className="px-4 py-3 font-medium text-fg">{c.customerName}</td>
                <td className="px-4 py-3 text-accent-foreground">{"★".repeat(c.rating)}</td>
                <td className="max-w-xs px-4 py-3 truncate text-fg-muted">{c.text}</td>
                <td className="px-4 py-3 text-fg-muted">{formatDate(c.date)}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.status === "resolved" ? "success" : "danger"}>{c.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ComplaintDrawer complaint={selected} currency={currency} onClose={() => setSelected(null)} onResolve={handleResolve} />
    </>
  );
}
