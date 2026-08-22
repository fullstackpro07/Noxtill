"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CategoriesPanel } from "@/components/products/categories-panel";
import { useSession } from "@/lib/session";

export default function ProductsCategoriesPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Categories">
      <CategoriesPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}
