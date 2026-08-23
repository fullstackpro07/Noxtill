"use client";

import { OutstandingPanel } from "@/components/credit/outstanding-panel";
import { useSession } from "@/lib/session";

export default function CreditPage() {
  const session = useSession();
  return <OutstandingPanel currency={session.business.currency} />;
}
