"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ProductsExportPanel } from "@/components/products/products-export-panel";

export default function ProductsExportPage() {
  return (
    <SubscreenShell title="Export Products">
      <ProductsExportPanel />
    </SubscreenShell>
  );
}
