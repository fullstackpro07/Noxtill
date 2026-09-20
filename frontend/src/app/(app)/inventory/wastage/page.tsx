"use client";

import { WastageView } from "@/components/inventory/wastage-view";
import { useSession } from "@/lib/session";

export default function WastagePage() {
  const session = useSession();
  return <WastageView currency={session.business.currency} />;
}
