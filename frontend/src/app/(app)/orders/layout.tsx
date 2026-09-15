"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search, Plus } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useOrdersSearchStore } from "@/store/orders-search-store";
import { OrderFormDrawer } from "@/components/orders/order-form-drawer";

/** Matches the design's per-tab `screenSub` line under the "Orders" title — the header itself
 * (title, search, "New Order", avatar) is identical across every Orders screen. */
const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/orders/board", subtitle: "Drag orders through fulfilment" },
  { prefix: "/orders/drafts", subtitle: "Started but unconfirmed orders" },
  { prefix: "/orders/quotations", subtitle: "Priced proposals that convert on approval" },
  { prefix: "/orders/invoices", subtitle: "Issued invoices and payment status" },
  { prefix: "/orders/returns", subtitle: "Reverse a sale with stock and money restored" },
  { prefix: "/orders/receipts", subtitle: "Reprint or resend any receipt" },
  { prefix: "/orders/tables", subtitle: "Restaurant floor view" },
  { prefix: "/orders/exceptions", subtitle: "Orders that need a decision, worst first" },
];

function OrdersHeaderContent() {
  const pathname = usePathname();
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const query = useOrdersSearchStore((s) => s.query);
  const setQuery = useOrdersSearchStore((s) => s.setQuery);
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Every order in one place";

  useModuleHeader({
    title: "Orders",
    subtitle,
    search: (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders..."
          aria-label="Search orders"
          className="w-full rounded-[10px] py-2.5 ps-9 pe-3 text-[13px]"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}
        />
      </div>
    ),
    actions: (
      <button
        type="button"
        onClick={() => setNewOrderOpen(true)}
        className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
        style={{ background: "var(--app-primary)" }}
      >
        <Plus className="h-4 w-4" aria-hidden />
        <span className="hidden md:inline">New Order</span>
      </button>
    ),
  });

  return <OrderFormDrawer open={newOrderOpen} onClose={() => setNewOrderOpen(false)} />;
}

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <OrdersHeaderContent />
      <ModuleTabs moduleKey="orders" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
