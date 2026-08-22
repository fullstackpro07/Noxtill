"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/shared/skeleton";
import { AlertStack } from "./alert-stack";
import { LatestReviewCard } from "./latest-review-card";
import { RangeDropdown } from "./range-dropdown";
import { WidgetGridView } from "./widget-grid-view";
import { WidgetGridCustomize } from "./widget-grid-customize";
import { AddWidgetDrawer } from "./add-widget-drawer";
import { NewBusinessEmptyState } from "./new-business-empty-state";
import { useDashboardStore } from "@/store/dashboard-store";
import { useWidgetData } from "@/hooks/use-widget-data";
import { fetchDashboardConfig, saveDashboardConfig } from "@/lib/widgets-api";
import { toast } from "@/lib/toast";

/** Dashboard overview — the other dashboard screens (Today's Business, Health Score, Live
 * Activity, AI Insights, Action Center, Nightly Close) are reached via the sidebar's Dashboard
 * dropdown, each its own route, not an in-page tab. */
export function DashboardView({ currency, businessName }: { currency: string; businessName: string }) {
  const layout = useDashboardStore((s) => s.layout);
  const setLayout = useDashboardStore((s) => s.setLayout);
  const range = useDashboardStore((s) => s.range);
  const isCustomizing = useDashboardStore((s) => s.isCustomizing);
  const enterCustomize = useDashboardStore((s) => s.enterCustomize);
  const saveCustomize = useDashboardStore((s) => s.saveCustomize);
  const cancelCustomize = useDashboardStore((s) => s.cancelCustomize);
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

  if (!isCustomizing && newBusinessCheckPending) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!isCustomizing && isBrandNewBusiness) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <NewBusinessEmptyState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Dashboard</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{businessName}</p>
        </div>

        {isCustomizing ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add widget
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelCustomize}>
              <X className="h-4 w-4" aria-hidden />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveLayout} disabled={saving}>
              <Check className="h-4 w-4" aria-hidden />
              {saving ? "Saving…" : "Save layout"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <RangeDropdown />
            <Button variant="outline" size="sm" onClick={enterCustomize}>
              <Pencil className="h-4 w-4" aria-hidden />
              Customize
            </Button>
          </div>
        )}
      </div>

      {isCustomizing ? (
        <WidgetGridCustomize currency={currency} />
      ) : (
        <>
          <AlertStack />
          <div className="mb-3 max-w-sm">
            <LatestReviewCard />
          </div>
          <WidgetGridView layout={layout} currency={currency} range={range} />
        </>
      )}

      <AddWidgetDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
