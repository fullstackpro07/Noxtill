"use client";

import { useState } from "react";
import Link from "next/link";
import { useWidgetData } from "@/hooks/use-widget-data";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Opportunity {
  key: string;
  title: string;
  why: string;
  href: string;
  cta: string;
}

/** Real opportunity signals from existing widgets (low stock, lapsed customers, overdue credit) —
 * the design's "Opportunities" panel generates estimated-impact prose from an AI model that doesn't
 * exist here, so each card shows the real underlying number instead of a fabricated dollar estimate. */
export function OpportunitiesCard({ currency }: { currency: string }) {
  const lowStock = useWidgetData("low_stock_count");
  const lapsed = useWidgetData("lapsed_customers");
  const credit = useWidgetData("credit_outstanding");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const opportunities: Opportunity[] = [];

  const lowStockCount = (lowStock.data as { count: number } | undefined)?.count ?? 0;
  if (lowStockCount > 0) {
    opportunities.push({
      key: "stock",
      title: `${formatNumber(lowStockCount)} product${lowStockCount === 1 ? "" : "s"} running low on stock`,
      why: "Restocking now avoids a sellout before your next delivery.",
      href: "/inventory",
      cta: "Review stock",
    });
  }

  const lapsedCount = (lapsed.data as { count: number } | undefined)?.count ?? 0;
  if (lapsedCount > 0) {
    opportunities.push({
      key: "lapsed",
      title: `${formatNumber(lapsedCount)} customer${lapsedCount === 1 ? "" : "s"} haven't come back recently`,
      why: "A win-back message could bring some of them in again.",
      href: "/customers",
      cta: "View customers",
    });
  }

  const creditAmount = (credit.data as { revenue?: number; total?: number } | undefined);
  const creditValue = creditAmount?.revenue ?? creditAmount?.total ?? 0;
  if (creditValue > 0) {
    opportunities.push({
      key: "credit",
      title: `${formatCurrency(creditValue, currency)} in outstanding credit`,
      why: "Sending reminders now improves how much of this you recover.",
      href: "/credit",
      cta: "Review credit",
    });
  }

  const isPending = lowStock.isPending || lapsed.isPending || credit.isPending;
  const visible = opportunities.filter((o) => !dismissed.includes(o.key));

  return (
    <section className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <h2 className="mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Opportunities</h2>
      <div className="flex flex-col gap-2.5">
        {isPending ? (
          Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-[76px] animate-pulse rounded-[12px]" style={{ background: "var(--app-surface-2)" }} />)
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Nothing stands out right now — check back later.</p>
        ) : (
          visible.map((o) => (
            <div key={o.key} className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <p className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{o.title}</p>
              <p className="mt-1 text-[11.5px] leading-normal" style={{ color: "var(--app-text-faintest)" }}>{o.why}</p>
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDismissed((d) => [...d, o.key])}
                  className="rounded-[9px] px-[11px] py-2 text-[11.5px] font-bold"
                  style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faintest)" }}
                >
                  Dismiss
                </button>
                <Link
                  href={o.href}
                  className="rounded-[9px] px-[13px] py-2 text-[11.5px] font-extrabold text-white"
                  style={{ background: "var(--app-primary)" }}
                >
                  {o.cta}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
