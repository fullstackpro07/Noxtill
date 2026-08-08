"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, ArrowRightCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertQuotation, generateInvoice, type LiveQuotation } from "@/lib/orders-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

export function QuotationCard({ quotation, currency }: { quotation: LiveQuotation; currency: string }) {
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: () => generateInvoice(quotation.id, false),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success(`Quote ${quotation.quoteNo} PDF opened — share the link with ${quotation.customerName}.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate the quote PDF.");
    },
  });

  const convertMutation = useMutation({
    mutationFn: () => convertQuotation(quotation.id),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Quotation ${quotation.quoteNo} converted to order #${order.orderNo}.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't convert this quotation.");
    },
  });

  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-sm font-medium text-fg">Q-{quotation.quoteNo}</span>
      <p className="text-sm text-fg-muted">{quotation.customerName}</p>
      <p className="truncate text-xs text-fg-faint">{quotation.items.map((i) => i.name).join(", ")}</p>
      <p className="font-display text-lg font-bold text-fg">{formatCurrency(quotation.total, currency)}</p>
      <div className="mt-1 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => sendMutation.mutate()}
          disabled={sendMutation.isPending}
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {sendMutation.isPending ? "Preparing…" : "Send"}
        </Button>
        <Button size="sm" className="flex-1" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
          <ArrowRightCircle className="h-3.5 w-3.5" aria-hidden />
          {convertMutation.isPending ? "Converting…" : "Convert"}
        </Button>
      </div>
    </div>
  );
}
