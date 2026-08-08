"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { ReviewsInboxView } from "./reviews-inbox-view";
import { ComplaintsTable } from "./complaints-table";
import { QrGenerator } from "./qr-generator";
import { WidgetGenerator } from "./widget-generator";

type ReviewsTab = "inbox" | "complaints" | "grow";

export function ReviewsView({ currency, businessName, businessSlug }: { currency: string; businessName: string; businessSlug: string }) {
  const [tab, setTab] = useState<ReviewsTab>("inbox");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Reviews</h1>
        <Tabs
          items={[
            { key: "inbox", label: "Inbox" },
            { key: "complaints", label: "Complaints" },
            { key: "grow", label: "Grow" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as ReviewsTab)}
          className="w-80"
        />
      </div>

      {tab === "inbox" && <ReviewsInboxView />}
      {tab === "complaints" && <ComplaintsTable currency={currency} />}
      {tab === "grow" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <p className="mb-4 text-sm font-medium text-fg">QR code</p>
            <QrGenerator businessName={businessName} businessSlug={businessSlug} />
          </div>
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <p className="mb-4 text-sm font-medium text-fg">Website widget</p>
            <WidgetGenerator businessSlug={businessSlug} />
          </div>
        </div>
      )}
    </div>
  );
}
