"use client";

import { Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportDef } from "@/lib/reports";
import { toast } from "@/lib/toast";

export function ReportCard({ report }: { report: ReportDef }) {
  function handleDownload() {
    toast.success(`${report.label} PDF downloaded. Live generation wires up in INT-012.`);
  }

  function handleSend() {
    toast.success(`${report.label} sent via WhatsApp. Live send wires up in INT-012.`);
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-fg">{report.label}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{report.description}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          PDF
        </Button>
        <Button size="sm" className="flex-1" onClick={handleSend}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send
        </Button>
      </div>
    </div>
  );
}
