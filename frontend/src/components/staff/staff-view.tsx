"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { TeamList } from "./team-list";
import { CommissionReport } from "./commission-report";
import { TeamInbox } from "./team-inbox";
import type { Role } from "@/lib/nav-items";

type StaffTab = "team" | "commissions" | "inbox";

export function StaffView({ currency, role }: { currency: string; role: Role }) {
  const [tab, setTab] = useState<StaffTab>("team");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Staff</h1>
        <Tabs
          items={[
            { key: "team", label: "Team" },
            { key: "commissions", label: "Commissions" },
            { key: "inbox", label: "Inbox" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as StaffTab)}
          className="w-80"
        />
      </div>

      {tab === "team" && <TeamList role={role} />}
      {tab === "commissions" && <CommissionReport currency={currency} />}
      {tab === "inbox" && <TeamInbox role={role} />}
    </div>
  );
}
