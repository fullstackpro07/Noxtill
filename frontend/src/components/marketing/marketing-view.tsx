"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { CampaignsTab } from "./campaigns-tab";
import { ReferralsCompetitorsTab } from "./referrals-competitors-tab";
import { AnalyticsTab } from "@/components/analytics/analytics-tab";

type MarketingTab = "campaigns" | "referrals" | "analytics";

export function MarketingView({ currency }: { currency: string }) {
  const [tab, setTab] = useState<MarketingTab>("campaigns");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Marketing</h1>
        <Tabs
          items={[
            { key: "campaigns", label: "Campaigns" },
            { key: "referrals", label: "Referrals & Competitors" },
            { key: "analytics", label: "Analytics" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as MarketingTab)}
          className="w-full sm:w-[26rem]"
        />
      </div>

      {tab === "campaigns" && <CampaignsTab />}
      {tab === "referrals" && <ReferralsCompetitorsTab />}
      {tab === "analytics" && <AnalyticsTab currency={currency} />}
    </div>
  );
}
