"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ProductsImportPanel } from "@/components/products/products-import-panel";

export default function ProductsImportPage() {
  return (
    <SubscreenShell title="Import Products">
      <ProductsImportPanel />
    </SubscreenShell>
  );
}
