"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, Camera, FileSpreadsheet, CheckCircle2, AlertTriangle, RefreshCw, Settings2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  stageImport,
  getImportBatch,
  confirmImport,
  getImportColumns,
  remapImport,
  type ImportPreview,
} from "@/lib/customer-import-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

type Step = "upload" | "review" | "processing";

export function ImportCustomersPanel({ currency }: { currency: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [batch, setBatch] = useState<ImportPreview | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [consentAcked, setConsentAcked] = useState(false);
  const [balanceAcked, setBalanceAcked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const stageMutation = useMutation({
    mutationFn: (file: File) => stageImport(file),
    onSuccess: (preview) => {
      setBatch(preview);
      setStep("review");
      setConsentAcked(false);
      setBalanceAcked(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't read this file — please try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmImport(batch!.batchId),
    onSuccess: () => setStep("processing"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't start the import — please try again."),
  });

  const { data: polledBatch } = useQuery({
    queryKey: ["import-batch", batch?.batchId],
    queryFn: () => getImportBatch(batch!.batchId),
    enabled: step === "processing" && !!batch,
    refetchInterval: (query) => (query.state.data?.status === "completed" ? false : 2000),
  });

  const isComplete = polledBatch?.status === "completed";
  const requiresBalanceConfirm = (batch?.counts.totalCredit ?? 0) > 0;
  const canImport =
    consentAcked &&
    (!requiresBalanceConfirm || balanceAcked) &&
    (batch?.counts.create ?? 0) + (batch?.counts.update ?? 0) > 0;

  function reset() {
    setStep("upload");
    setFileName("");
    setBatch(null);
    setMappingOpen(false);
  }

  function handleClose() {
    if (isComplete) {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
    reset();
  }

  function handleFileSelected(file: File) {
    setFileName(file.name);
    stageMutation.mutate(file);
  }

  if (step === "processing") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          {isComplete ? (
            <>
              <CheckCircle2 className="h-9 w-9 text-whatsapp" aria-hidden />
              <p className="text-sm font-medium text-fg">Import complete</p>
              <p className="text-xs text-fg-muted">
                {batch?.counts.create} created, {batch?.counts.update} updated
              </p>
              <Button size="sm" className="mt-2" onClick={handleClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <RefreshCw className="h-9 w-9 animate-spin text-fg-faint" aria-hidden />
              <p className="text-sm font-medium text-fg">Importing…</p>
              <p className="text-xs text-fg-muted">This runs in the background — you can leave this page and check back.</p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (step === "upload" || !batch) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
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
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
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
            <p className="text-xs text-fg-faint">CSV, XLSX, TXT, or DOCX — any column names, you can fix the mapping next</p>
          </button>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={stageMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border-strong px-4 py-3 text-sm font-medium text-fg hover:bg-surface-2 disabled:opacity-60"
          >
            <Camera className="h-4 w-4" aria-hidden />
            Or photograph a ledger page
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-2">
            {batch.hasColumnMapping && (
              <Button variant="outline" size="sm" onClick={() => setMappingOpen(true)}>
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                Fix column mapping
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={reset}>
              Start over
            </Button>
          </div>
        </CardContent>
      </Card>

      {mappingOpen && (
        <ColumnMappingCard
          batchId={batch.batchId}
          onApplied={(updated) => {
            setBatch(updated);
            setMappingOpen(false);
          }}
          onCancel={() => setMappingOpen(false)}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-3.5 p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
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
            <div className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2.5 p-4">
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="checkbox" checked={consentAcked} onChange={(e) => setConsentAcked(e.target.checked)} className="mt-0.5" />
            <span className="flex items-start gap-1.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
              I understand imported customers have <strong className="mx-1">not</strong> opted in to marketing messages — they can only be
              reached with transactional/utility messages until they consent themselves.
            </span>
          </label>
          {requiresBalanceConfirm && (
            <label className="flex items-start gap-2 text-sm text-fg">
              <input type="checkbox" checked={balanceAcked} onChange={(e) => setBalanceAcked(e.target.checked)} className="mt-0.5" />
              <span>
                I confirm the {formatCurrency(batch.counts.totalCredit, currency)} in opening balances above is accurate and should be recorded
                as real credit owed.
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={reset} disabled={confirmMutation.isPending}>
          Cancel
        </Button>
        <Button onClick={() => confirmMutation.mutate()} disabled={!canImport || confirmMutation.isPending}>
          {confirmMutation.isPending ? "Starting…" : `Import ${batch.counts.create + batch.counts.update} customers`}
        </Button>
      </div>
    </div>
  );
}

function ColumnMappingCard({
  batchId,
  onApplied,
  onCancel,
}: {
  batchId: string;
  onApplied: (batch: ImportPreview) => void;
  onCancel: () => void;
}) {
  const { data: columns, isPending } = useQuery({ queryKey: ["import-columns", batchId], queryFn: () => getImportColumns(batchId) });
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);

  const effectiveMapping = mapping ?? columns?.mapping ?? {};

  const remapMutation = useMutation({
    mutationFn: () => remapImport(batchId, effectiveMapping),
    onSuccess: (updated) => {
      toast.success("Mapping applied.");
      onApplied(updated);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this mapping."),
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3.5 p-4">
        <p className="text-sm font-medium text-fg">Map each column from your file to a customer field</p>
        {isPending || !columns ? (
          <p className="text-sm text-fg-faint">Loading columns…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {columns.headers.map((header) => (
              <div key={header} className="flex flex-col gap-1">
                <span className="truncate text-xs text-fg-faint">{header}</span>
                <Select
                  value={effectiveMapping[header] ?? "ignore"}
                  onChange={(e) => setMapping({ ...effectiveMapping, [header]: e.target.value })}
                  aria-label={`Map column "${header}"`}
                >
                  <option value="ignore">Ignore this column</option>
                  <option value="name">Name</option>
                  <option value="phone">Phone</option>
                  <option value="balance">Opening balance</option>
                </Select>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => remapMutation.mutate()} disabled={!columns || remapMutation.isPending}>
            {remapMutation.isPending ? "Applying…" : "Apply mapping"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
