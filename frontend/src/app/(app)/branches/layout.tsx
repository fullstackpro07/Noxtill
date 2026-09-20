"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Building2, ChevronDown, CalendarDays, Plus } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useQuery } from "@tanstack/react-query";
import { fetchBranches } from "@/lib/branches-api";
import { fetchStockTransfers } from "@/lib/stock-transfers-api";
import { BranchAdvisorPanel } from "@/components/branches/branch-advisor-panel";
import { BranchesScopeProvider, useBranchesScope, PERIOD_OPTIONS } from "@/components/branches/branches-context";
import { BranchDrawerProvider, useBranchDrawer } from "@/components/branches/branch-drawer-context";
import { BranchDrawer } from "@/components/branches/branch-drawer";
import { BR, primaryBtnStyle } from "@/components/branches/branches-ui";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/branches/all", subtitle: "Every location, one table." },
  { prefix: "/branches/profile", subtitle: "Pick a location to open its full workspace." },
  { prefix: "/branches/performance", subtitle: "Who is producing what, and where." },
  { prefix: "/branches/inventory", subtitle: "Stock against sales, by branch." },
  { prefix: "/branches/staff", subtitle: "Capacity against booked demand." },
  { prefix: "/branches/bookings", subtitle: "Today's appointments, by branch." },
  { prefix: "/branches/transfers", subtitle: "Move real stock between branches." },
  { prefix: "/branches/alerts", subtitle: "Only meaningful, actionable changes raise an alert." },
  { prefix: "/branches/settings", subtitle: "Branch configuration, one location at a time." },
  { prefix: "/branches", subtitle: "How your locations are doing right now." },
];

function BranchesHeaderContent() {
  const pathname = usePathname();
  const [askOpen, setAskOpen] = useState(false);
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { scopeBranchId, setScopeBranchId, periodLabel, setPeriod } = useBranchesScope();
  const { openSetup } = useBranchDrawer();
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Branches";

  const scopeName = scopeBranchId ? branches.find((b) => b.id === scopeBranchId)?.name ?? "All branches" : "All branches";

  function cycleScope() {
    const ids: (string | null)[] = [null, ...branches.map((b) => b.id)];
    const i = ids.indexOf(scopeBranchId);
    setScopeBranchId(ids[(i + 1) % ids.length]);
  }
  function cyclePeriod() {
    const i = PERIOD_OPTIONS.findIndex((p) => p.label === periodLabel);
    const next = PERIOD_OPTIONS[(i + 1) % PERIOD_OPTIONS.length];
    setPeriod(next.days, next.label);
  }

  useModuleHeader({
    title: "Branches",
    subtitle,
    search: (
      <button
        type="button"
        onClick={() => setAskOpen(true)}
        style={{ width: "100%", minWidth: 0, maxWidth: 440, height: 38, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", background: BR.bg, border: `1px solid ${BR.border}`, borderRadius: 10, cursor: "text" }}
      >
        <Sparkles size={15} style={{ color: "#6D28D9", flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#8B97A6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>
          Ask across branches — &ldquo;which branch needs attention?&rdquo;
        </span>
      </button>
    ),
    stats: (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={cycleScope}
          style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", background: scopeBranchId ? "#E8F7EE" : "#F2F4F7", border: `1px solid ${scopeBranchId ? "#BFE7CF" : "#E1E5EB"}`, color: scopeBranchId ? "#0E8442" : "#475467" }}
        >
          <Building2 size={14} />
          <span>{scopeName}</span>
          <ChevronDown size={14} style={{ opacity: 0.7 }} />
        </button>
        <button type="button" onClick={cyclePeriod} style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 11px", borderRadius: 10, border: `1px solid ${BR.borderStrong}`, background: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          <CalendarDays size={14} style={{ color: BR.textDim }} />
          <span>{periodLabel}</span>
        </button>
      </div>
    ),
    actions: (
      <button type="button" onClick={() => openSetup()} style={primaryBtnStyle}>
        <Plus size={15} />
        <span>Add branch</span>
      </button>
    ),
  });

  return askOpen ? <BranchAdvisorPanel onClose={() => setAskOpen(false)} /> : null;
}

function BranchesTabs() {
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { data: pendingTransfers = [] } = useQuery({ queryKey: ["stock-transfers", "pending"], queryFn: () => fetchStockTransfers("pending") });
  return (
    <ModuleTabs
      moduleKey="branches"
      badges={{
        all: { count: branches.length, tone: "warning" },
        transfers: { count: pendingTransfers.length, tone: "warning" },
      }}
    />
  );
}

export default function BranchesLayout({ children }: { children: ReactNode }) {
  return (
    <BranchesScopeProvider>
      <BranchDrawerProvider>
        <div className="flex min-h-full flex-col">
          <BranchesHeaderContent />
          <BranchesTabs />
          <div className="flex-1" style={{ background: BR.bg }}>
            {children}
          </div>
          <BranchDrawer />
        </div>
      </BranchDrawerProvider>
    </BranchesScopeProvider>
  );
}
