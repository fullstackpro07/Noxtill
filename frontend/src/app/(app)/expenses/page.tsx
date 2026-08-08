"use client";

import { ExpensesView } from "@/components/expenses/expenses-view";
import { useSession } from "@/lib/session";

export default function ExpensesPage() {
  const session = useSession();
  return <ExpensesView currency={session.business.currency} />;
}
