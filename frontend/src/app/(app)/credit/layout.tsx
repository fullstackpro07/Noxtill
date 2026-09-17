"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useCreditSearchStore } from "@/store/credit-search-store";
import { fetchDebtors } from "@/lib/credit-api";
import { RemindAllDialog } from "@/components/credit/remind-all-dialog";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/credit/customer", subtitle: "One customer's full running balance and ledger" },
  { prefix: "/credit/sales", subtitle: "Every credit sale, oldest balance paid down first" },
  { prefix: "/credit/payments", subtitle: "Every payment recorded against an outstanding balance" },
  { prefix: "/credit/aging", subtitle: "Who owes what, grouped by how long it's been outstanding" },
  { prefix: "/credit/due", subtitle: "Installments and overdue balances that need attention" },
  { prefix: "/credit/limits", subtitle: "Per-customer credit limits" },
  { prefix: "/credit/collections", subtitle: "Automatic reminders and recovery performance" },
  { prefix: "/credit/statements", subtitle: "Generate and send customer statements" },
  { prefix: "/credit/recovery-reports", subtitle: "How much overdue credit gets recovered, and how fast" },
];

function CreditHeaderContent() {
  const pathname = usePathname();
  const query = useCreditSearchStore((s) => s.query);
  const setQuery = useCreditSearchStore((s) => s.setQuery);
  const [remindAllOpen, setRemindAllOpen] = useState(false);
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Who owes you, what's overdue, and what to do next";

  useModuleHeader({
    title: "Credit",
    subtitle,
    search: (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer or phone..."
          aria-label="Search credit records"
          className="w-full rounded-[10px] py-2.5 ps-9 pe-3 text-[13px]"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}
        />
      </div>
    ),
    actions: (
      <button
        type="button"
        onClick={() => setRemindAllOpen(true)}
        className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
        style={{ background: "var(--app-primary)" }}
      >
        Remind All
      </button>
    ),
  });

  return <RemindAllDialog open={remindAllOpen} debtors={debtors} onClose={() => setRemindAllOpen(false)} />;
}

export default function CreditLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <CreditHeaderContent />
      <ModuleTabs moduleKey="credit" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
