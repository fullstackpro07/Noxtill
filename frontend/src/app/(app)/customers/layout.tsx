"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useCustomersSearchStore } from "@/store/customers-search-store";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/customers/segments", subtitle: "Groups of customers for targeted messaging" },
  { prefix: "/customers/tags", subtitle: "Tags group customers for segments, campaigns and pricing" },
  { prefix: "/customers/import", subtitle: "Bring an existing list or paper register into Noxtill" },
  { prefix: "/customers/export", subtitle: "Take customer data out, with sensitive fields controlled" },
  { prefix: "/customers/activity", subtitle: "Everything customers have done across the business" },
  { prefix: "/customers/insights", subtitle: "Customer intelligence — value, retention and risk" },
  { prefix: "/customers/duplicates", subtitle: "Possible duplicate records, compared before anything is merged" },
  { prefix: "/customers/settings", subtitle: "Custom fields, statuses, merge rules and privacy" },
  { prefix: "/customers/loyalty", subtitle: "Stamp cards, tiers and recurring plans" },
  { prefix: "/customers/memory-notes", subtitle: "Knowledge that stays with the business when staff leave" },
];

function CustomersHeaderContent() {
  const pathname = usePathname();
  const query = useCustomersSearchStore((s) => s.query);
  const setQuery = useCustomersSearchStore((s) => s.setQuery);
  const [addOpen, setAddOpen] = useState(false);
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Find and manage every customer in one place";

  useModuleHeader({
    title: "Customers",
    subtitle,
    search: (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers..."
          aria-label="Search customers by name, phone, email or tag"
          className="w-full rounded-[10px] py-2.5 ps-9 pe-3 text-[13px]"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}
        />
      </div>
    ),
    actions: (
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
        style={{ background: "var(--app-primary)" }}
      >
        + Add Customer
      </button>
    ),
  });

  return <AddCustomerDialog open={addOpen} onClose={() => setAddOpen(false)} />;
}

export default function CustomersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <CustomersHeaderContent />
      <ModuleTabs moduleKey="customers" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
