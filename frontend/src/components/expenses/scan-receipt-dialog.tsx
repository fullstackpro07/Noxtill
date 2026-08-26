"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineError } from "@/components/shared/error-states";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { uploadDigitizerScan, updateDigitizerRow, commitDigitizerBatch, type DigitizerScanPreview } from "@/lib/digitizer-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** A row is flagged for review whenever Claude's own self-reported confidence is below this — never per-field, only per-row (that's the real granularity `DigitizerRow.confidence` gives us). */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function ScanReceiptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <ScanReceiptDialogBody onClose={onClose} />;
}

function ScanReceiptDialogBody({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<DigitizerScanPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDigitizerScan(file, "receipt"),
    onSuccess: (result) => setPreview(result),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't read this receipt — please try again."),
  });

  const commitMutation = useMutation({
    mutationFn: () => commitDigitizerBatch(preview!.batchId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      const created = result.created.expense ?? 0;
      if (created > 0) {
        toast.success(`Added ${created} expense${created === 1 ? "" : "s"} from the receipt.`);
      } else {
        toast.error("Nothing on this receipt could be saved as an expense — try editing the fields.");
      }
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this expense — please try again."),
  });

  const expenseRows = preview?.rows.filter((r) => r.destination === "expense" && r.action !== "skip") ?? [];

  function updateLocalRow(rowId: string, field: string, value: string | number) {
    setPreview((p) => {
      if (!p) return p;
      return {
        ...p,
        rows: p.rows.map((r) => (r.id === rowId ? { ...r, data: { ...r.data, [field]: value } } : r)),
      };
    });
    updateDigitizerRow(rowId, { data: { [field]: value } }).catch(() =>
      toast.error("Couldn't save that edit — try again."),
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Scan a receipt"
      description={!preview ? "Photograph a receipt or invoice — the AI reads the amount, description, and date." : undefined}
      className="max-w-lg"
      footer={
        preview ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={commitMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => commitMutation.mutate()}
              disabled={expenseRows.length === 0 || commitMutation.isPending}
            >
              {commitMutation.isPending ? "Saving…" : `Save ${expenseRows.length || ""} expense${expenseRows.length === 1 ? "" : "s"}`}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
      {!preview ? (
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="flex flex-col items-center gap-2.5 rounded-[var(--radius-noxtill)] border-2 border-dashed border-border-strong bg-surface-2/40 px-6 py-10 text-center transition-colors hover:border-primary disabled:opacity-60"
          >
            <Camera className="h-7 w-7 text-fg-faint" aria-hidden />
            <span className="text-sm font-medium text-fg">
              {uploadMutation.isPending ? "Reading receipt…" : "Take a photo or choose a file"}
            </span>
          </button>
          {uploadMutation.isError && (
            <InlineError
              message={uploadMutation.error instanceof ApiError ? uploadMutation.error.message : "Couldn't read this receipt — please try again."}
            />
          )}
        </div>
      ) : expenseRows.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing that looked like an expense was found in this photo.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {expenseRows.map((row) => {
            const lowConfidence = row.confidence < LOW_CONFIDENCE_THRESHOLD;
            const category = String(row.data.category ?? "");
            const knownCategory = (EXPENSE_CATEGORIES as readonly string[]).includes(category);
            return (
              <div key={row.id} className="rounded-[var(--radius-noxtill)] border border-border bg-surface-2/30 p-4">
                {lowConfidence && (
                  <Badge tone="warning" className="mb-3">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    Low confidence — please double-check
                  </Badge>
                )}
                <div className="flex flex-col gap-3">
                  <Input
                    label="Description"
                    value={String(row.data.description ?? "")}
                    onChange={(e) => updateLocalRow(row.id, "description", e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Category"
                      value={knownCategory ? category : ""}
                      onChange={(e) => updateLocalRow(row.id, "category", e.target.value)}
                    >
                      {!knownCategory && category && <option value="">{category} (from receipt)</option>}
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(row.data.amount ?? "")}
                      onChange={(e) => updateLocalRow(row.id, "amount", Number(e.target.value))}
                      leadingSlot={<span className="text-sm">$</span>}
                    />
                  </div>
                  <Input
                    label="Date"
                    type="date"
                    value={String(row.data.incurredOn ?? new Date().toISOString().slice(0, 10))}
                    onChange={(e) => updateLocalRow(row.id, "incurredOn", e.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
