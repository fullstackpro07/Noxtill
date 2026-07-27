"use client";

import { ProductsView } from "@/components/products/products-view";
import { useMockSession } from "@/lib/mock-session";

export default function ProductsPage() {
  const session = useMockSession();
  return <ProductsView currency={session.business.currency} />;
}
