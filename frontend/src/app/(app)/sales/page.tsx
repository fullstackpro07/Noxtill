"use client";

import { PosView } from "@/components/pos/pos-view";
import { useSession } from "@/lib/session";

export default function SalesPage() {
  const session = useSession();
  return <PosView currency={session.business.currency} />;
}
