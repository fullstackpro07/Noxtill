"use client";

import { ProductsView } from "@/components/products/products-view";
import { useSession } from "@/lib/session";

export default function ProductsPage() {
  const session = useSession();
  return <ProductsView currency={session.business.currency} />;
}
