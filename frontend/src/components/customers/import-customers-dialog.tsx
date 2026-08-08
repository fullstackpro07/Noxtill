"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  stageImport,
  getImportBatch,
  confirmImport,
  type ImportPreview,
} from "@/lib/customer-import-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

type Step = "upload" | "review" | "processing";

export function ImportCustomersDialog({ open, onClose, currency }: { open: boolean; onClose: () => void; currency: string }) {
  if (!open) return null;
  return <ImportCustomersDialogBody onClose={onClose} currency={currency} />;
}

function ImportCustomersDialogBody({ onClose, currency }: { onClose: () => void; currency: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [batch, setBatch] = useState<ImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const stageMutation = useMutation({
    mutationFn: (file: File) => stageImport(file),
    onSuccess: (preview) => {
      setBatch(preview);
      setStep("review");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't read this file — please try again.");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmImport(batch!.batchId),
    onSuccess: () => setStep("processing"),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the import — please try again.");
    },
  });

  const { data: polledBatch } = useQuery({
    queryKey: ["import-batch", batch?.batchId],
    queryFn: () => getImportBatch(batch!.batchId),
    enabled: step === "processing" && !!batch,
    refetchInterval: (query) => (query.state.data?.status === "completed" ? false : 2000),
  });

  const isComplete = polledBatch?.status === "completed";

  function handleClose() {
    if (isComplete) {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
    setStep("upload");
    setFileName("");
    setBatch(null);
    onClose();
  }

  function handleFileSelected(file: File) {
    setFileName(file.name);
    stageMutation.mutate(file);
  }

  const footer =
    step === "upload" ? (
      <Button variant="ghost" onClick={handleClose}>
        Cancel
      </Button>
    ) : step === "review" ? (
      <>
        <Button variant="ghost" onClick={handleClose} disabled={confirmMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending || (batch?.counts.create ?? 0) + (batch?.counts.update ?? 0) === 0}
        >
          {confirmMutation.isPending ? "Starting…" : `Import ${(batch?.counts.create ?? 0) + (batch?.counts.update ?? 0)} customers`}
        </Button>
      </>
    ) : (
      <Button onClick={handleClose} disabled={!isComplete}>
        {isComplete ? "Done" : "Importing…"}
      </Button>
    );

  return (
    <Dialog
      open
      onClose={handleClose}
      title="Import customers"
      description={
        step === "upload"
          ? "Upload a CSV, XLSX, or plain-text/Word file with customer names and phone numbers."
          : step === "review"
            ? `Ready to import ${fileName}. Rows matching an existing phone number are updated, not duplicated.`
            : "Creating and updating customer records in the background."
      }
      footer={footer}
      className="max-w-lg"
    >
      {step === "upload" && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.txt,.docx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
            disabled={stageMutation.isPending}
            className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-noxtill)] border-2 border-dashed border-border-strong bg-surface-2/40 px-6 py-10 text-center transition-colors hover:border-primary hover:bg-primary/4 disabled:opacity-60"
          >
            {stageMutation.isPending ? (
              <RefreshCw className="h-7 w-7 animate-spin text-fg-faint" aria-hidden />
            ) : (
              <UploadCloud className="h-7 w-7 text-fg-faint" aria-hidden />
            )}
            <p className="text-sm font-medium text-fg">{stageMutation.isPending ? "Reading file…" : "Click to choose a file"}</p>
            <p className="text-xs text-fg-faint">CSV, XLSX, TXT, or DOCX up to 10MB</p>
          </button>
        </>
      )}

      {step === "review" && batch && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 text-sm text-fg-muted">
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{fileName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-sm">
            <span className="flex items-center gap-1.5 text-whatsapp">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {batch.counts.create} new
            </span>
            {batch.counts.update > 0 && <span className="text-fg-muted">{batch.counts.update} updated</span>}
            {batch.counts.skip > 0 && (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {batch.counts.skip} skipped
              </span>
            )}
            {batch.counts.totalCredit > 0 && (
              <span className="ms-auto text-fg-muted">{formatCurrency(batch.counts.totalCredit, currency)} opening credit</span>
            )}
          </div>

          {batch.preview.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {batch.preview.map((row) => (
                    <tr key={row.rowNumber} className="border-b border-border/60 last:border-0">
                      <td className="px-2.5 py-1.5 text-fg">{row.name}</td>
                      <td className="px-2.5 py-1.5 text-fg-muted">{row.normalizedPhone ?? row.rawPhone}</td>
                      <td className="px-2.5 py-1.5 text-end">
                        <Badge tone={row.action === "create" ? "success" : "neutral"}>{row.action}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {batch.invalid.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-[var(--radius-sm)] border border-destructive/25 bg-destructive/5">
              <table className="w-full text-sm">
                <tbody>
                  {batch.invalid.map((row) => (
                    <tr key={row.rowNumber} className="border-b border-destructive/15 last:border-0">
                      <td className="px-2.5 py-1.5 text-fg-muted">Row {row.rowNumber}</td>
                      <td className="px-2.5 py-1.5 text-destructive">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {step === "processing" && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          {isComplete ? (
            <>
              <CheckCircle2 className="h-8 w-8 text-whatsapp" aria-hidden />
              <p className="text-sm font-medium text-fg">Import complete</p>
              <p className="text-xs text-fg-muted">
                {batch?.counts.create} created, {batch?.counts.update} updated
              </p>
            </>
          ) : (
            <>
              <RefreshCw className="h-8 w-8 animate-spin text-fg-faint" aria-hidden />
              <p className="text-sm font-medium text-fg">Importing…</p>
              <p className="text-xs text-fg-muted">This runs in the background — you can close this and check back.</p>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
