"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchMarketingTasks } from "@/lib/marketing-tasks-api";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
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
