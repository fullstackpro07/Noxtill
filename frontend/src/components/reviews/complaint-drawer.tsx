"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PrivateFeedback } from "@/lib/reviews";
import { findCustomerById } from "@/lib/customers";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export function ComplaintDrawer({
  complaint,
  currency,
  onClose,
  onResolve,
}: {
  complaint: PrivateFeedback | null;
  currency: string;
  onClose: () => void;
  onResolve: (id: string, note: string) => void;
}) {
  if (!complaint) return null;
  return (
    <ComplaintDrawerBody key={complaint.id} complaint={complaint} currency={currency} onClose={onClose} onResolve={onResolve} />
  );
}

function ComplaintDrawerBody({
  complaint,
  currency,
  onClose,
  onResolve,
}: {
  complaint: PrivateFeedback;
  currency: string;
  onClose: () => void;
  onResolve: (id: string, note: string) => void;
}) {
  const [reply, setReply] = useState("");
  const [resolutionNote, setResolutionNote] = useState(complaint.resolutionNote ?? "");
  const customer = complaint.customerId ? findCustomerById(complaint.customerId) : undefined;

  const canResolve = resolutionNote.trim().length >= 5;

  function handleSendReply() {
    toast.success(`Reply sent to ${complaint.customerName}. Live send wires up in INT-007.`);
    setReply("");
  }

  function handleResolve() {
    onResolve(complaint.id, resolutionNote.trim());
    toast.success("Marked resolved.");
    onClose();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#1c231e]/45" />
      <div className="animate-sheet-in absolute inset-y-0 end-0 flex w-full max-w-md flex-col border-s border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-fg">Private feedback</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-fg">{complaint.customerName}</p>
              <p className="text-xs text-fg-faint">{formatDate(complaint.date)}</p>
            </div>
            <Badge tone={complaint.status === "resolved" ? "success" : "danger"}>{complaint.status}</Badge>
          </div>

          <p className="mb-4 text-sm text-accent-foreground">
            {"★".repeat(complaint.rating)}
            {"☆".repeat(5 - complaint.rating)}
          </p>
          <p className="mb-5 whitespace-pre-wrap text-sm text-fg-muted">{complaint.text}</p>

          {customer && (
            <div className="mb-5 rounded-[var(--radius-noxtill)] border border-border bg-surface-2/50 p-3.5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-faint">Customer</p>
              <Link href={`/customers/${customer.id}`} className="text-sm font-medium text-primary hover:underline">
                {customer.name}
              </Link>
              <p className="mt-1 text-xs text-fg-muted">
                {customer.visitCount} visits · {formatCurrency(customer.totalSpent, currency)} lifetime
              </p>
            </div>
          )}

          <div className="mb-5">
            <label htmlFor="complaint-reply" className="mb-1.5 block text-sm font-medium text-fg">
              Reply to customer
            </label>
            <div className="flex gap-2">
              <textarea
                id="complaint-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                className="flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={handleSendReply} disabled={!reply.trim()}>
                <Send className="h-3.5 w-3.5" aria-hidden />
                Send reply
              </Button>
            </div>
          </div>

          <div>
            <label htmlFor="resolution-note" className="mb-1.5 block text-sm font-medium text-fg">
              Resolution note
            </label>
            <textarea
              id="resolution-note"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              placeholder="What did you do about this? (min. 5 characters)"
              className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleResolve} disabled={!canResolve}>
            Mark resolved
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
