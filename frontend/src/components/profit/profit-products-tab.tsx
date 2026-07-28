"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRODUCTS, marginPercent } from "@/lib/products";
import { formatCurrency } from "@/lib/format";

export function ProfitProductsTab({ currency }: { currency: string }) {
  const sorted = [...PRODUCTS]
    .filter((p) => p.active)
    .map((p) => ({ ...p, margin: marginPercent(p.price, p.costPrice) }))
    .sort((a, b) => a.margin - b.margin);

  return (
    <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
            <th className="px-4 py-3 text-start">Product</th>
            <th className="px-4 py-3 text-start">Price</th>
            <th className="px-4 py-3 text-start">Cost</th>
            <th className="px-4 py-3 text-start">Margin</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const low = p.margin < 10;
            return (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium text-fg">{p.name}</td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(p.price, currency)}</td>
                <td className="px-4 py-3 text-fg-muted">{formatCurrency(p.costPrice, currency)}</td>
                <td className="px-4 py-3">
                  <span className={low ? "font-medium text-destructive" : p.margin < 30 ? "font-medium text-accent-foreground" : "font-medium text-whatsapp"}>
                    {p.margin.toFixed(0)}%
                  </span>
                  {low && (
                    <Badge tone="danger" className="ms-2">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      Low margin
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
