"use client";

import { StatementsPanel } from "@/components/credit/statements-panel";
import { useSession } from "@/lib/session";

export default function CreditStatementsPage() {
  const session = useSession();
  return <StatementsPanel currency={session.business.currency} />;
}
