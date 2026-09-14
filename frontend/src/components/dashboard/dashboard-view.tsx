"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { SkeletonCard } from "@/components/shared/skeleton";
import { DashboardTabs } from "./dashboard-tabs";
import { KpiRow } from "./kpi-row";
import { ExecSummaryBanner } from "./exec-summary-banner";
import { OpportunitiesCard } from "./opportunities-card";
import { NeedsAttentionCard } from "./needs-attention-card";
import { BusinessHealthSnapshotCard } from "./business-health-snapshot-card";
import { BusinessHealthGaugeCard } from "./business-health-gauge-card";
import { BusinessOverviewCard } from "./business-overview-card";
import { TopProductsCard } from "./top-products-card";
import { RecentOrdersCard } from "./recent-orders-card";
import { TopChannelsCard } from "./top-channels-card";
import { QuickActionsGrid } from "./quick-actions-grid";
import { GettingStartedCard } from "./getting-started-card";
import { OverviewToolbar } from "./overview-toolbar";
import { useSession } from "@/lib/session";
import { DashboardSidePanel } from "./side-panel";
import { IntelligencePromoGrid } from "./intelligence-promo-grid";
import { WidgetGridCustomize } from "./widget-grid-customize";
import { AddWidgetDrawer } from "./add-widget-drawer";
import { NewBusinessEmptyState } from "./new-business-empty-state";
import { useDashboardStore } from "@/store/dashboard-store";
import { useWidgetData } from "@/hooks/use-widget-data";
import { fetchDashboardConfig, saveDashboardConfig } from "@/lib/widgets-api";
import { toast } from "@/lib/toast";

export function DashboardView({ currency }: { currency: string; businessName: string }) {
  const session = useSession();
  const layout = useDashboardStore((s) => s.layout);
  const setLayout = useDashboardStore((s) => s.setLayout);
  const isCustomizing = useDashboardStore((s) => s.isCustomizing);
  const cancelCustomize = useDashboardStore((s) => s.cancelCustomize);
  const saveCustomize = useDashboardStore((s) => s.saveCustomize);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrates the layout from the server's saved dashboard config, if one exists — server wins over whatever's locally cached.
  const { data: serverConfig } = useQuery({
    queryKey: ["dashboard-config"],
    queryFn: fetchDashboardConfig,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (serverConfig?.layout && serverConfig.layout.length > 0) {
      setLayout(serverConfig.layout);
    }
  }, [serverConfig, setLayout]);

  const revenueToday = useWidgetData("revenue_today");
  const ordersToday = useWidgetData("orders_today");
  const newBusinessCheckPending = revenueToday.isPending || ordersToday.isPending;
  const isBrandNewBusiness =
    !newBusinessCheckPending &&
    (revenueToday.data as { revenue: number } | undefined)?.revenue === 0 &&
    (ordersToday.data as { count: number } | undefined)?.count === 0;

  async function handleSaveLayout() {
    setSaving(true);
    try {
      await saveDashboardConfig(useDashboardStore.getState().draftLayout ?? layout);
      saveCustomize();
      toast.success("Dashboard layout saved.");
    } catch {
      toast.error("Couldn't save your layout — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <DashboardTabs />

      {!isCustomizing && newBusinessCheckPending ? (
        <div className="px-6 pb-7 pt-4.5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      ) : !isCustomizing && isBrandNewBusiness ? (
        <div className="mx-auto w-full max-w-3xl px-6 pb-7 pt-4.5">
          <NewBusinessEmptyState />
        </div>
      ) : isCustomizing ? (
        <>
          <div className="flex flex-col gap-4 px-6 pb-[70px] pt-4.5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h2 className="text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>
                  Customize Dashboard
                </h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
                  Drag to reorder, remove what you don&apos;t need, add widgets from any module.
                </p>
              </div>
              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => useDashboardStore.getState().resetDraftToDefault()}
                  className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold"
                  style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", background: "var(--app-surface)" }}
                >
                  Reset to default for my business type
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[12.5px] font-bold text-white"
                  style={{ background: "var(--app-primary)" }}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add widget
                </button>
              </div>
            </div>
            <WidgetGridCustomize />
          </div>
          <div
            className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 p-[12px_24px] md:left-[205px]"
            style={{ background: "var(--app-surface)", borderTop: "1px solid var(--app-border)", boxShadow: "0 -4px 16px rgba(16,24,40,.06)" }}
          >
            <span className="text-[12px]" style={{ color: "var(--app-text-faintest)" }}>Changes apply to your Overview screen only.</span>
            <div className="ms-auto flex gap-2.5">
              <button
                type="button"
                onClick={cancelCustomize}
                className="rounded-[10px] px-4.5 py-2 text-[12.5px] font-semibold"
                style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", background: "var(--app-surface)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLayout}
                disabled={saving}
                className="rounded-[10px] px-5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                style={{ background: "var(--app-primary)" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex w-full flex-col gap-4 px-6 pb-7 pt-4.5">
          <OverviewToolbar branches={session.business.branches} onAddWidget={() => setDrawerOpen(true)} />

          <ExecSummaryBanner currency={currency} />

          <KpiRow currency={currency} />

          <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
            <OpportunitiesCard currency={currency} />
            <NeedsAttentionCard currency={currency} />
            <BusinessHealthSnapshotCard />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_336px]">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_292px]">
                <BusinessOverviewCard currency={currency} />
                <BusinessHealthGaugeCard />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
                <TopProductsCard currency={currency} />
                <RecentOrdersCard currency={currency} />
                <TopChannelsCard />
              </div>
              <IntelligencePromoGrid />
              <QuickActionsGrid />
              <GettingStartedCard />
            </div>
            <DashboardSidePanel currency={currency} />
          </div>
        </div>
      )}

      <AddWidgetDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
