"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportDef } from "@/lib/reports";
import { generateReport, sendReport } from "@/lib/reports-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function ReportCard({ report }: { report: ReportDef }) {
  const downloadMutation = useMutation({
    mutationFn: () => generateReport(report.key),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : `Couldn't generate the ${report.label} PDF — please try again.`);
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => sendReport(report.key),
    onSuccess: () => {
      toast.success(`${report.label} sent — check your messages.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : `Couldn't send the ${report.label} report — please try again.`);
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-fg">{report.label}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{report.description}</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => downloadMutation.mutate()}
          disabled={downloadMutation.isPending}
        >
          {downloadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
          PDF
        </Button>
        <Button size="sm" className="flex-1" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
          {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          Send
        </Button>
      </div>
    </div>
  );
}
