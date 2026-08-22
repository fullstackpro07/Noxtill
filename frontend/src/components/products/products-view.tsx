"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CatalogPanel } from "./catalog-panel";

/** Catalog — the other Products screens (Variants, Bundles, Suppliers, Pricing, Services,
 * Categories, Import, Export) are reached via the sidebar's Products dropdown, each its own route. */
export function ProductsView({ currency }: { currency: string }) {
  return (
    <SubscreenShell title="Products">
      <CatalogPanel currency={currency} />
    </SubscreenShell>
  );
}
