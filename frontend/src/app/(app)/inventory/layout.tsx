"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchInventory, fetchLowStock, fetchReorderSuggestions } from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  InventoryDrawerProvider,
  InventorySearchProvider,
  InventoryExportProvider,
  useInventoryDrawer,
  useInventorySearch,
  useInventoryExport,
} from "@/components/inventory/inventory-drawer-context";
import { InventoryDrawer } from "@/components/inventory/inventory-drawer";
import { InventoryModal } from "@/components/inventory/inventory-modal";
import { INV } from "@/components/inventory/inventory-ui";
import { canManagePurchasesByDefaultRole } from "@/components/inventory/inventory-classification";

const SEARCH_PLACEHOLDER_BY_PATH: { prefix: string; placeholder: string }[] = [
  { prefix: "/inventory/movements", placeholder: "Search product or reference…" },
  { prefix: "/inventory/purchases", placeholder: "Search PO or supplier…" },
  { prefix: "/inventory/wastage", placeholder: "Search product…" },
  { prefix: "/inventory/stock-count", placeholder: "Search product or barcode…" },
  { prefix: "/inventory/reorder-suggestions", placeholder: "Search product or supplier…" },
  { prefix: "/inventory/low-stock", placeholder: "Search product…" },
  { prefix: "/inventory", placeholder: "Search product, SKU or barcode…" },
];

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/inventory/overview", subtitle: "What your stock is telling you." },
  { prefix: "/inventory/product", subtitle: "One product, in full." },
  { prefix: "/inventory/restock", subtitle: "What to order next, and why." },
  { prefix: "/inventory/valuation", subtitle: "Where your capital is sitting." },
  { prefix: "/inventory/forecast", subtitle: "Forecast, not fact." },
  { prefix: "/inventory/reports", subtitle: "Export what you need." },
  { prefix: "/inventory/settings", subtitle: "How reorder math and counts behave." },
  { prefix: "/inventory/movements", subtitle: "Every unit, accounted for." },
  { prefix: "/inventory/low-stock", subtitle: "What's about to run out." },
  { prefix: "/inventory/purchases", subtitle: "Draft, send, receive." },
  { prefix: "/inventory/wastage", subtitle: "What was lost, and why." },
  { prefix: "/inventory/stock-count", subtitle: "Reconcile what you counted." },
  { prefix: "/inventory/reorder-suggestions", subtitle: "Suggested from real sales velocity." },
  { prefix: "/inventory", subtitle: "Stock levels, suppliers, and movement history." },
];

function InventoryHeaderContent() {
  const pathname = usePathname();
  const session = useSession();
  const { query, setQuery } = useInventorySearch();
  const { exporter } = useInventoryExport();
  const { openPo } = useInventoryDrawer();
  const { data: items = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });

  const canManagePurchases = canManagePurchasesByDefaultRole(session.user.role);
  const onStock = pathname === "/inventory";
  const stockValue = items.reduce((sum, i) => sum + i.stockValue, 0);
  const placeholder = SEARCH_PLACEHOLDER_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.placeholder ?? "Search…";
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Inventory";

  useEffect(() => {
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const currency = session.business.currency;

  const title = useMemo(
    () => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
        Inventory
        {onStock && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: 20, padding: "4px 11px" }}>
            Stock value {formatCurrency(stockValue, currency)}
          </span>
        )}
      </span>
    ),
    [onStock, stockValue, currency],
  );

  const search = useMemo(
    () => (
      <div style={{ position: "relative", width: "100%", maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: "#98A2B3" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Search inventory"
          style={{ width: "100%", padding: "10px 12px 10px 36px", border: `1px solid ${INV.border}`, borderRadius: 10, fontSize: 13, background: "#F9FAFB", minHeight: 42 }}
        />
      </div>
    ),
    [query, setQuery, placeholder],
  );

  const actions = useMemo(
    () => (
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <button
          type="button"
          onClick={() => exporter?.()}
          disabled={!exporter}
          style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: exporter ? "pointer" : "default", minHeight: 44, opacity: exporter ? 1 : 0.5 }}
        >
          Export
        </button>
        {canManagePurchases && (
          <button type="button" onClick={() => openPo()} style={{ display: "flex", alignItems: "center", gap: 7, background: INV.primary, border: 0, borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}>
            <Plus size={16} />
            Purchase
          </button>
        )}
      </div>
    ),
    [exporter, openPo, canManagePurchases],
  );

  useModuleHeader({ title, subtitle, search, actions });

  return null;
}

function Plus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function InventoryTabs() {
  const { data: lowStock = [] } = useQuery({ queryKey: ["low-stock"], queryFn: fetchLowStock });
  const { data: reorderGroups = [] } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: fetchReorderSuggestions });
  const reorderCount = reorderGroups.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <ModuleTabs
      moduleKey="inventory"
      badges={{
        "low-stock": { count: lowStock.length, tone: "warning" },
        reorder: { count: reorderCount, tone: "warning" },
      }}
    />
  );
}

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <InventorySearchProvider>
      <InventoryExportProvider>
        <InventoryDrawerProvider>
          <div className="flex min-h-full flex-col">
            <InventoryHeaderContent />
            <InventoryTabs />
            <div className="flex-1" style={{ background: INV.bg }}>
              {children}
            </div>
            <InventoryDrawer />
            <InventoryModal />
          </div>
        </InventoryDrawerProvider>
      </InventoryExportProvider>
    </InventorySearchProvider>
  );
}
