"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileTab } from "@/components/account/profile-tab";
import { TeamTab } from "@/components/account/team-tab";
import { PlanTab } from "@/components/account/plan-tab";
import { PaymentTab } from "@/components/account/payment-tab";
import { InvoicesTab } from "@/components/account/invoices-tab";
import { NotificationsTab } from "@/components/account/notifications-tab";

const TABS = { profile: ProfileTab, team: TeamTab, plan: PlanTab, payment: PaymentTab, invoices: InvoicesTab, notifications: NotificationsTab };

export default function AccountTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = use(params);
  const Tab = TABS[tab as keyof typeof TABS];
  if (!Tab) notFound();
  return <Tab />;
}
