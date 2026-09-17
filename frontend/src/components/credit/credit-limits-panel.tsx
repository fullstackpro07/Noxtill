"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchDebtors } from "@/lib/credit-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";

/** Credit Limits — deliberately not built out yet. The design shows a per-customer limit, used
 * amount, utilisation bar, a numeric "credit health" score and a review workflow, none of which
 * exist anywhere in the schema: there's no limit field on Customer or Business, no review/approval
 * log, and no weighted "health score" formula backed by real data. Rather than invent a limit and
 * an arbitrary scoring formula, this screen says so and links to the real, already-computable
 * exposure numbers instead — the same standard applied elsewhere in this rebuild (e.g. Orders'
 * Exception Center). */
export function CreditLimitsPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const totalExposure = debtors.reduce((s, d) => s + d.balance, 0);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Credit Limits</h2>

      <div className="rounded-[16px] p-[48px_24px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ background: "#FEF6E7" }}>
          <ShieldCheck className="h-[23px] w-[23px]" style={{ color: "#B54708" }} aria-hidden />
        </div>
        <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Not available yet</div>
        <p className="mx-auto mt-2 max-w-[52ch] text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-disabled)" }}>
          Noxtill tracks credit as one running balance per customer, with no per-customer cap, &quot;used/available&quot; split, review workflow, or
          numeric credit-health score anywhere in the system today. Rather than invent a limit and a scoring formula to fill this in, this screen
          stays off until a real limit field and review log exist to back it.
        </p>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Customers With A Balance</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{debtors.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Total Exposure</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalExposure, currency)}</div>
        </div>
      </div>
      <p className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>
        These are the real, uncapped numbers available today — see the <Link href="/credit/aging" style={{ color: "var(--app-primary)", fontWeight: 700 }}>Aging</Link> screen for the full per-customer breakdown.
      </p>
    </main>
  );
}
