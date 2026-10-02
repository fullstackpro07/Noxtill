"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchMarketingTasks } from "@/lib/marketing-tasks-api";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/marketing/automations/command-center", subtitle: "Health, failures, approvals and queues across every workflow." },
  { prefix: "/marketing/automations/approvals", subtitle: "Workflow steps waiting for a person to approve or reject." },
  { prefix: "/marketing/automations/governance", subtitle: "Automation limits, who can change workflows, and the audit trail." },
  { prefix: "/marketing/automations/versions", subtitle: "Compare versions, dry-run, restore — and which environment runs use." },
  { prefix: "/marketing/automations/builder", subtitle: "See each workflow as a graph and inspect every step." },
  { prefix: "/marketing/automations/schedules", subtitle: "Scheduled workflows, durable waits and the automation queue." },
  { prefix: "/marketing/automations/executions", subtitle: "Inspect workflow runs, attempts, failures and recovery actions." },
  { prefix: "/marketing/automations/triggers", subtitle: "Inspect the event context fields already exposed to workflow triggers." },
  { prefix: "/marketing/automations/templates", subtitle: "Install a fixture-checked starter as a paused draft and review it before activation." },
  { prefix: "/marketing/automations/actions", subtitle: "Inspect supported action inputs, outputs, setup requirements and execution limits." },
  { prefix: "/marketing/automations/data-mapper", subtitle: "Safely preview JSON field mappings before adding them to a workflow." },
  { prefix: "/marketing/automations/variables", subtitle: "Manage tenant-scoped workflow values and references to server-held secrets." },
  { prefix: "/marketing/seo-autopilot/settings", subtitle: "Configure SEO data sources, rules and safe Autopilot behavior." },
  { prefix: "/marketing/seo-autopilot/reports", subtitle: "Understand what improved, what did not, and what changed alongside it." },
  { prefix: "/marketing/seo-autopilot/agent-workspace", subtitle: "Review what Noxtill found, what it recommends and what is waiting for approval." },
  { prefix: "/marketing/seo-autopilot/content-calendar", subtitle: "Plan new content, optimizations and refreshes around SEO opportunities." },
  { prefix: "/marketing/seo-autopilot/content", subtitle: "Create useful search-driven content from real opportunities and existing business knowledge." },
  { prefix: "/marketing/seo-autopilot/guest-posting", subtitle: "Find relevant publications, prepare outreach and verify published placements." },
  { prefix: "/marketing/seo-autopilot/link-building", subtitle: "Find credible link opportunities and track outreach from discovery to verified placement." },
  { prefix: "/marketing/seo-autopilot/off-page", subtitle: "Review manually recorded backlink evidence and research relevant authority prospects." },
  { prefix: "/marketing/seo-autopilot/local", subtitle: "Improve local search visibility with location-specific evidence and tasks." },
  { prefix: "/marketing/seo-autopilot/technical", subtitle: "Find and safely resolve technical problems affecting search engines." },
  { prefix: "/marketing/seo-autopilot/on-page", subtitle: "Improve titles, content structure and headings for important pages." },
  { prefix: "/marketing/seo-autopilot/competitor-seo", subtitle: "Turn attributed competitor evidence into SEO actions for your own site." },
  { prefix: "/marketing/seo-autopilot", subtitle: "Track verified search positions and spot keywords that need a fresh check." },
  { prefix: "/marketing/campaigns", subtitle: "Broadcast messages to customer segments." },
  { prefix: "/marketing/builder", subtitle: "Build a campaign step by step, with checks before it sends." },
  { prefix: "/marketing/audiences", subtitle: "Who you are talking to, and why they belong together." },
  { prefix: "/marketing/content", subtitle: "Plan and schedule what goes out, across every channel." },
  { prefix: "/marketing/automations", subtitle: "Messages that send themselves on a trigger." },
  { prefix: "/marketing/offers", subtitle: "Discount codes and gift vouchers." },
  { prefix: "/marketing/channels", subtitle: "Every channel, its real state and what it produced." },
  { prefix: "/marketing/analytics", subtitle: "What marketing produced, and which record it came from." },
  { prefix: "/marketing/tasks", subtitle: "Marketing work that needs a person, ranked by what matters." },
  { prefix: "/marketing/settings", subtitle: "Frequency limits, AI rules, attribution and permissions." },
];

function MarketingHeaderContent() {
  const pathname = usePathname();
  const router = useRouter();
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Every channel’s spend against its results.";

  useModuleHeader({
    title: "Marketing",
    subtitle,
    actions: (
      <button
        type="button"
        onClick={() => router.push("/marketing/builder")}
        className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
        style={{ background: "var(--app-primary)" }}
      >
        <Wand2 className="h-3.5 w-3.5" aria-hidden />
        New Campaign
      </button>
    ),
  });

  return null;
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const { data: tasks = [] } = useQuery({ queryKey: ["marketing-tasks"], queryFn: fetchMarketingTasks });
  const urgentCount = useMemo(() => tasks.filter((t) => t.priority === "Urgent" || t.priority === "High").length, [tasks]);

  return (
    <div className="flex min-h-full flex-col">
      <MarketingHeaderContent />
      <ModuleTabs
        moduleKey="marketing"
        badges={{
          "marketing-tasks": { count: urgentCount, tone: "warning" },
        }}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
