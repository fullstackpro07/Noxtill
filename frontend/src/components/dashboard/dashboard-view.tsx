"use client";

import { useState } from "react";
import { Pencil, Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertStack } from "./alert-stack";
import { LatestReviewCard } from "./latest-review-card";
import { RangeDropdown } from "./range-dropdown";
import { WidgetGridView } from "./widget-grid-view";
import { WidgetGridCustomize } from "./widget-grid-customize";
import { AddWidgetDrawer } from "./add-widget-drawer";
import { NewBusinessEmptyState } from "./new-business-empty-state";
import { useDashboardStore } from "@/store/dashboard-store";
import { getMockWidgetData } from "@/lib/widgets";

/** A dashboard with truly nothing recorded yet gets the guided empty state instead of a wall of zeroes. */
function isBrandNewBusiness(): boolean {
  const revenue = getMockWidgetData("revenue_today") as { revenue: number; orders: number };
  const orders = getMockWidgetData("orders_today") as { count: number };
  return revenue.revenue === 0 && orders.count === 0;
}

export function DashboardView({ currency, businessName }: { currency: string; businessName: string }) {
  const layout = useDashboardStore((s) => s.layout);
  const isCustomizing = useDashboardStore((s) => s.isCustomizing);
  const enterCustomize = useDashboardStore((s) => s.enterCustomize);
  const saveCustomize = useDashboardStore((s) => s.saveCustomize);
  const cancelCustomize = useDashboardStore((s) => s.cancelCustomize);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!isCustomizing && isBrandNewBusiness()) {
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
            <Button size="sm" onClick={saveCustomize}>
              <Check className="h-4 w-4" aria-hidden />
              Save layout
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

      {!isCustomizing && <AlertStack />}

      {isCustomizing ? (
        <WidgetGridCustomize currency={currency} />
      ) : (
        <>
          <div className="mb-3 max-w-sm">
            <LatestReviewCard />
          </div>
          <WidgetGridView layout={layout} currency={currency} />
        </>
      )}

      <AddWidgetDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
