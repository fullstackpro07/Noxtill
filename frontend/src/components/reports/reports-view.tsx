"use client";

import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportCard } from "./report-card";
import { REPORT_DEFS, EXCEL_EXPORTS } from "@/lib/reports";
import { generateExport, requestAccountZip } from "@/lib/exports-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import type { Role } from "@/lib/nav-items";

export function ReportsView({ role }: { role: Role }) {
  const excelExportMutation = useMutation({
    mutationFn: (kind: string) => generateExport(kind),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate that export — please try again.");
    },
  });

  const accountZipMutation = useMutation({
    mutationFn: requestAccountZip,
    onSuccess: () => {
      toast.success("Export ready — check your notifications for the download link (expires in 24h).");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the export — please try again.");
    },
  });

  function handleExcelExport(kind: string) {
    excelExportMutation.mutate(kind);
  }

  function handleExportEverything() {
    toast.info("Preparing your export — this can take a few minutes for larger accounts.");
    accountZipMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Reports</h1>
          <p className="mt-0.5 text-sm text-fg-muted">PDF summaries and Excel exports for every part of the business</p>
        </div>
        {role === "owner" && (
          <Button variant="outline" size="sm" onClick={handleExportEverything} disabled={accountZipMutation.isPending}>
            <Archive className="h-4 w-4" aria-hidden />
            {accountZipMutation.isPending ? "Preparing…" : "Export everything"}
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_DEFS.map((report) => (
          <ReportCard key={report.key} report={report} />
        ))}
      </div>

      {role === "owner" && (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
            <FileSpreadsheet className="h-4 w-4 text-fg-faint" aria-hidden />
            Excel exports
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXCEL_EXPORTS.map((x) => (
              <button
                key={x.key}
                onClick={() => handleExcelExport(x.key)}
                disabled={excelExportMutation.isPending}
                className="rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
              >
                {x.label}.xlsx
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
