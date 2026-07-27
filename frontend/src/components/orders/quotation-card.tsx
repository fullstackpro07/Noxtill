"use client";

import { Send, ArrowRightCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Quotation, QuotationStatus } from "@/lib/orders";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<QuotationStatus, "neutral" | "primary" | "success" | "danger"> = {
  draft: "neutral",
  sent: "primary",
  accepted: "success",
  expired: "danger",
};

export function QuotationCard({ quotation, currency }: { quotation: Quotation; currency: string }) {
  function handleSend() {
    toast.success(`Quotation ${quotation.quoteNo} sent to ${quotation.customerName}. Live send wires up in INT-003.`);
  }

  function handleConvert() {
    toast.success(`Quotation ${quotation.quoteNo} converted to an order. Live convert wires up in INT-003.`);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-fg">{quotation.quoteNo}</span>
        <Badge tone={STATUS_TONE[quotation.status]}>{quotation.status}</Badge>
      </div>
      <p className="text-sm text-fg-muted">{quotation.customerName}</p>
      <p className="truncate text-xs text-fg-faint">{quotation.items.map((i) => i.name).join(", ")}</p>
      <p className="font-display text-lg font-bold text-fg">{formatCurrency(quotation.total, currency)}</p>
      <div className="mt-1 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleSend}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send
        </Button>
        <Button size="sm" className="flex-1" onClick={handleConvert}>
          <ArrowRightCircle className="h-3.5 w-3.5" aria-hidden />
          Convert
        </Button>
      </div>
    </div>
  );
}
