"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Send, Download } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { toast } from "@/lib/toast";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/profit/product-profitability", subtitle: "Which items make money and which lose it." },
  { prefix: "/profit/time-analysis", subtitle: "When the money actually comes in." },
  { prefix: "/expenses", subtitle: "What goes out, so net profit is real." },
  { prefix: "/profit/cash-flow", subtitle: "Money in against money out, and what is coming." },
  { prefix: "/profit/customer-analytics", subtitle: "Are customers coming back?" },
  { prefix: "/profit/staff-analytics", subtitle: "Who is producing what." },
  { prefix: "/profit/health-score", subtitle: "One composite measure of business health." },
  { prefix: "/profit", subtitle: "Is the business making money, and from what?" },
];

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  borderRadius: 10,
  padding: "0 14px",
  height: 38,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--app-text-muted)",
};

function ProfitHeaderContent() {
  const pathname = usePathname();
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Profit & Analytics";

  useModuleHeader({
    title: "Profit & Analytics",
    subtitle,
    actions: (
      <>
        <button type="button" onClick={() => toast.info("PDF export lands with the Reports module — not available yet.")} style={outlineBtnStyle}>
          <Download className="me-1.5 inline h-3.5 w-3.5" aria-hidden />
          Export PDF
        </button>
        <button
          type="button"
          onClick={() => toast.info("Emailing statements to an accountant lands with the Reports module — not available yet.")}
          className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
          style={{ background: "var(--app-primary)" }}
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send to Accountant
        </button>
      </>
    ),
  });

  return null;
}

export default function ProfitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ProfitHeaderContent />
      <ModuleTabs moduleKey="profit" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
