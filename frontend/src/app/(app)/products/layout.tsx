"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Plus } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useProductsSearchStore } from "@/store/products-search-store";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/products/services", subtitle: "Bookable services and their formal settings" },
  { prefix: "/products/categories", subtitle: "Organise your catalog and see revenue by category" },
  { prefix: "/products/variants", subtitle: "Reusable option sets you can apply to many products" },
  { prefix: "/products/bundles", subtitle: "Combine products sold together into one sellable item" },
  { prefix: "/products/pricing", subtitle: "Margins, bulk price changes and price history" },
  { prefix: "/products/suppliers", subtitle: "Where your stock comes from" },
  { prefix: "/products/import", subtitle: "Bring in a whole price list at once" },
  { prefix: "/products/export", subtitle: "Download your catalog or schedule a recurring export" },
];

function ProductsHeaderContent() {
  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const query = useProductsSearchStore((s) => s.query);
  const setQuery = useProductsSearchStore((s) => s.setQuery);
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Every product and service in one place";

  useModuleHeader({
    title: "Products",
    subtitle,
    search: (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, SKU or category..."
          aria-label="Search products"
          className="w-full rounded-[10px] py-2.5 ps-9 pe-3 text-[13px]"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}
        />
      </div>
    ),
    actions: (
      <>
        <button
          type="button"
          onClick={() => router.push("/products/import")}
          className="hidden h-[38px] items-center rounded-[10px] px-3.5 text-[12.5px] font-bold sm:flex"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
        >
          Import
        </button>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
          style={{ background: "var(--app-primary)" }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden md:inline">Add Product</span>
        </button>
      </>
    ),
  });

  return <ProductFormDrawer open={addOpen} onClose={() => setAddOpen(false)} product={null} />;
}

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ProductsHeaderContent />
      <ModuleTabs moduleKey="products" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
