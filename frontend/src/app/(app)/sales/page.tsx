"use client";

import { PosView } from "@/components/pos/pos-view";
import { useMockSession } from "@/lib/mock-session";

export default function SalesPage() {
  const session = useMockSession();
  return <PosView currency={session.business.currency} />;
}
