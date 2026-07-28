"use client";

import { ExpensesView } from "@/components/expenses/expenses-view";
import { useMockSession } from "@/lib/mock-session";

export default function ExpensesPage() {
  const session = useMockSession();
  return <ExpensesView currency={session.business.currency} />;
}
