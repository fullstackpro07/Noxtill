"use client";

import type { ReactNode } from "react";
import { Send, Download } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { toast } from "@/lib/toast";

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

function ExpensesHeaderContent() {
  useModuleHeader({
    title: "Profit & Analytics",
    subtitle: "What goes out, so net profit is real.",
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

export default function ExpensesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ExpensesHeaderContent />
      <ModuleTabs moduleKey="profit" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
