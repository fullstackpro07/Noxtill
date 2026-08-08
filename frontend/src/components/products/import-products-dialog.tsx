"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { importProductsFile, type ImportSummary } from "@/lib/products-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

type Step = "upload" | "confirm" | "done";

export function ImportProductsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (f: File) => importProductsFile(f),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSummary(result);
      setStep("done");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Import failed — please try again.");
    },
  });

  function reset() {
    setStep("upload");
    setFile(null);
    setSummary(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileSelected(f: File) {
    setFile(f);
    setStep("confirm");
  }

  function handleImport() {
    if (file) mutation.mutate(file);
  }

  const footer = (
    <>
      {step === "confirm" && (
        <Button variant="ghost" onClick={() => setStep("upload")} disabled={mutation.isPending}>
          Back
        </Button>
      )}
      {step === "upload" && (
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
      )}
      {step === "confirm" && (
        <Button onClick={handleImport} disabled={mutation.isPending}>
          {mutation.isPending ? "Importing…" : "Import products"}
        </Button>
      )}
      {step === "done" && <Button onClick={handleClose}>Done</Button>}
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Import products"
      description={
        step === "upload"
          ? "Upload a CSV or XLSX file with columns: name, kind, category, sku, costPrice, sellingPrice, stockQty."
          : step === "confirm"
            ? `Ready to import ${file?.name}. Invalid rows are skipped and listed in an error report.`
            : undefined
      }
      footer={footer}
      className="max-w-lg"
    >
      {step === "upload" && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelected(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-noxtill)] border-2 border-dashed border-border-strong bg-surface-2/40 px-6 py-10 text-center transition-colors hover:border-primary hover:bg-primary/4"
          >
            <UploadCloud className="h-7 w-7 text-fg-faint" aria-hidden />
            <p className="text-sm font-medium text-fg">Click to choose a file</p>
            <p className="text-xs text-fg-faint">CSV, XLSX up to 5MB</p>
          </button>
        </>
      )}

      {step === "confirm" && file && (
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 text-sm text-fg-muted">
          <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{file.name}</span>
        </div>
      )}

      {step === "done" && summary && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-whatsapp" aria-hidden />
          <p className="text-sm font-medium text-fg">{summary.created} products imported</p>
          {summary.skipped > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {summary.skipped} rows skipped due to errors
            </p>
          )}
          {summary.errorsFileUrl && (
            <a
              href={summary.errorsFileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download error report
            </a>
          )}
        </div>
      )}
    </Dialog>
  );
}
