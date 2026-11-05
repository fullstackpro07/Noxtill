"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { AiPage, CategoryPage, HistoryPage, LimitsPage, OverviewPage, PlanPage, StoragePage, TeamPage, WebPage } from "@/components/usage/usage-pages";
import { CommunicationPage } from "@/components/usage/usage-comm";
import { VoicePage } from "@/components/usage/usage-voice";

export default function UsagePage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = use(params);
  switch (page) {
    case "overview":
      return <OverviewPage />;
    case "plan":
      return <PlanPage />;
    case "team":
      return <TeamPage />;
    case "ai":
      return <AiPage />;
    case "comm":
      return <CommunicationPage />;
    case "voice":
      return <VoicePage />;
    case "auto":
    case "digitizer":
    case "seo":
    case "esign":
      return <CategoryPage page={page} />;
    case "storage":
      return <StoragePage />;
    case "web":
      return <WebPage />;
    case "history":
      return <HistoryPage />;
    case "limits":
      return <LimitsPage />;
    default:
      notFound();
  }
}
