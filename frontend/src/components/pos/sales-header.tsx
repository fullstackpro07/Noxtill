"use client";

import { useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import Link from "next/link";
import { fetchTodayBusiness } from "@/lib/today-business-api";
import { formatCurrency } from "@/lib/format";
import { useModuleHeader } from "@/components/layout/module-header-context";

/** Fast Sale's title, subtitle, real today's-sales stats and Barcode Scan action, injected into
 * the ONE shared global Topbar (via `useModuleHeader`) instead of stacking a second bespoke
 * header underneath it. Passing `title` switches the Topbar into "custom" mode for as long as a
 * Fast Sale screen is mounted — its default greeting line, full-width search bar, quick-add,
 * mail and "Live" pill are swapped out for this content, not appended alongside it — and the
 * Topbar reverts to its plain state on navigating away. Renders no DOM of its own. */
export function SalesHeader({ currency }: { currency: string }) {
  const { data } = useQuery({ queryKey: ["today-business", {}], queryFn: () => fetchTodayBusiness({}) });

  useModuleHeader({
    title: "New Sale",
    subtitle: "Fast Sale · counter terminal",
    stats: (
      <>
        <div className="rounded-[11px] px-[13px] py-[7px]" style={{ background: "var(--app-page-bg, #FAFBFC)", border: "1px solid var(--app-border)" }}>
          <div className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>Today&apos;s Sales</div>
          <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.3px" }}>{data ? data.cards.salesCount : "—"}</div>
        </div>
        <div className="rounded-[11px] px-[13px] py-[7px]" style={{ background: "var(--app-page-bg, #FAFBFC)", border: "1px solid var(--app-border)" }}>
          <div className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>Revenue</div>
          <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.3px" }}>{data ? formatCurrency(data.cards.revenue, currency) : "—"}</div>
        </div>
        <div className="rounded-[11px] px-[13px] py-[7px]" style={{ background: "var(--app-page-bg, #FAFBFC)", border: "1px solid var(--app-border)" }}>
          <div className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>Avg. Ticket</div>
          <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.3px" }}>{data ? formatCurrency(data.cards.avgTicket, currency) : "—"}</div>
        </div>
      </>
    ),
    actions: (
      <Link
        href="/sales?scan=1"
        className="flex h-[34px] items-center gap-1.5 rounded-[10px] px-[13px] text-[12px] font-bold text-white"
        style={{ background: "var(--app-sidebar-bg)" }}
      >
        <ScanLine className="h-4 w-4" aria-hidden />
        <span className="hidden md:inline">Barcode Scan</span>
      </Link>
    ),
  });

  return null;
}
