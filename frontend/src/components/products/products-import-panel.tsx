"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  commitProductsImport,
  previewProductsImport,
  IMPORT_CANONICAL_FIELDS,
  type ImportCanonicalField,
  type ImportPreview,
  type ImportRowCorrection,
} from "@/lib/products-import-mapping-api";
import type { ImportSummary } from "@/lib/products-api";

const FIELD_LABEL: Record<ImportCanonicalField, string> = {
  name: "Name",
  kind: "Kind (product/service)",
  category: "Category",
  sku: "SKU",
  costPrice: "Cost price",
  sellingPrice: "Selling price",
  stockQty: "Stock quantity",
};

interface LiveRow {
  rowNumber: number;
  mapped: Record<string, string | number | undefined>;
  confidence: number;
  valid: boolean;
  error?: string;
}

function requiredNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Mirrors the backend's own validateRow()/confidence logic closely enough for a live preview —
 * commit() always re-validates for real server-side, so this is a UX aid, never the source of truth. */
function reviewRow(raw: Record<string, string>, mapping: Record<string, string>, rowNumber: number): LiveRow {
  const mapped: Record<string, string | undefined> = {};
  for (const [fileColumn, target] of Object.entries(mapping)) {
    if (target === "ignore" || !target) continue;
    if (raw[fileColumn] !== undefined) mapped[target] = raw[fileColumn];
  }

  const name = mapped.name?.trim();
  if (!name) return { rowNumber, mapped, confidence: 0, valid: false, error: "name is required" };

  const kindMapped = Object.values(mapping).includes("kind");
  const kind = (mapped.kind?.trim().toLowerCase() || "product") as string;
  if (kind !== "product" && kind !== "service") {
    return { rowNumber, mapped, confidence: 0, valid: false, error: `kind must be "product" or "service", got "${mapped.kind}"` };
  }

  const costPrice = requiredNumber(mapped.costPrice ?? 0);
  const sellingPrice = requiredNumber(mapped.sellingPrice ?? 0);
  const stockQty = requiredNumber(mapped.stockQty ?? 0);
  if (Number.isNaN(costPrice) || costPrice < 0) {
    return { rowNumber, mapped, confidence: 0, valid: false, error: `costPrice must be a non-negative number, got "${mapped.costPrice}"` };
  }
  if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
    return { rowNumber, mapped, confidence: 0, valid: false, error: `sellingPrice must be a non-negative number, got "${mapped.sellingPrice}"` };
  }
  if (Number.isNaN(stockQty) || stockQty < 0) {
    return { rowNumber, mapped, confidence: 0, valid: false, error: `stockQty must be a non-negative number, got "${mapped.stockQty}"` };
  }

  const categoryMapped = Object.values(mapping).includes("category");
  const confidence = kindMapped && categoryMapped ? 1 : 0.7;
  return { rowNumber, mapped: { ...mapped, kind, costPrice, sellingPrice, stockQty }, confidence, valid: true };
}

function ConfidenceBadge({ row }: { row: LiveRow }) {
  if (!row.valid) return <Badge tone="danger">Error</Badge>;
  if (row.confidence >= 0.9) return <Badge tone="success">Ready</Badge>;
  return <Badge tone="warning">Review</Badge>;
}

export function ProductsImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [corrections, setCorrections] = useState<Map<number, Record<string, string>>>(new Map());
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: (f: File) => previewProductsImport(f),
    onSuccess: (result) => {
      setPreview(result);
      setMapping(result.suggestedMapping);
      setSkipped(new Set());
      setCorrections(new Map());
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't read this file — please try again."),
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      const correctionList: ImportRowCorrection[] = Array.from(corrections.entries()).map(([rowNumber, data]) => ({ rowNumber, data }));
      return commitProductsImport(file!, mapping, Array.from(skipped), correctionList);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSummary(result);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed — please try again."),
  });

  const liveRows = useMemo<LiveRow[]>(() => {
    if (!preview) return [];
    return preview.rows.map((r) => {
      const correction = corrections.get(r.rowNumber);
      const raw = correction ? { ...r.raw, ...correction } : r.raw;
      return reviewRow(raw, mapping, r.rowNumber);
    });
  }, [preview, mapping, corrections]);

  const includedRows = liveRows.filter((r) => !skipped.has(r.rowNumber));
  const readyCount = includedRows.filter((r) => r.valid).length;
  const errorCount = includedRows.filter((r) => !r.valid).length;

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping({});
    setSkipped(new Set());
    setCorrections(new Map());
    setSummary(null);
  }

  function handleFileSelected(f: File) {
    setFile(f);
    setSummary(null);
    previewMutation.mutate(f);
  }

  function toggleSkip(rowNumber: number) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  function editCell(rowNumber: number, field: string, value: string) {
    if (!preview) return;
    const fileColumn = Object.entries(mapping).find(([, target]) => target === field)?.[0];
    if (!fileColumn) return; // no source column mapped for this field — nothing to attribute the edit to
    setCorrections((prev) => {
      const next = new Map(prev);
      next.set(rowNumber, { ...next.get(rowNumber), [fileColumn]: value });
      return next;
    });
  }

  if (summary) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-whatsapp" aria-hidden />
          <p className="text-sm font-medium text-fg">{summary.created} product(s) imported</p>
          {summary.skipped > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {summary.skipped} row(s) skipped due to errors
            </p>
          )}
          {summary.errorsFileUrl && (
            <a href={summary.errorsFileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download error report
            </a>
          )}
          <Button size="sm" variant="outline" onClick={reset} className="mt-2">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Import another file
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardContent className="p-6">
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
            disabled={previewMutation.isPending}
            className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-noxtill)] border-2 border-dashed border-border-strong bg-surface-2/40 px-6 py-14 text-center transition-colors hover:border-primary hover:bg-primary/4"
          >
            <UploadCloud className="h-7 w-7 text-fg-faint" aria-hidden />
            <p className="text-sm font-medium text-fg">{previewMutation.isPending ? "Reading file…" : "Click to choose a file"}</p>
            <p className="text-xs text-fg-faint">CSV or XLSX, any column names — you&apos;ll map them next</p>
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-fg-muted" aria-hidden />
            <CardTitle>{file?.name}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            Start over
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-fg-muted">Map each column from your file to a product field.</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {preview.headers.map((header) => (
              <div key={header} className="flex flex-col gap-1">
                <span className="truncate text-xs text-fg-faint">{header}</span>
                <Select
                  value={mapping[header] ?? "ignore"}
                  onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                  aria-label={`Map column "${header}"`}
                >
                  <option value="ignore">Ignore this column</option>
                  {IMPORT_CANONICAL_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABEL[f]}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review ({liveRows.length} row(s))</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge tone="success">{readyCount} ready</Badge>
            {errorCount > 0 && <Badge tone="danger">{errorCount} error(s)</Badge>}
            {skipped.size > 0 && <Badge tone="neutral">{skipped.size} skipped</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-3 py-2 font-medium">Skip</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  {IMPORT_CANONICAL_FIELDS.map((f) => (
                    <th key={f} className="px-3 py-2 font-medium">
                      {FIELD_LABEL[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {liveRows.map((row) => {
                  const isSkipped = skipped.has(row.rowNumber);
                  return (
                    <tr key={row.rowNumber} className={isSkipped ? "opacity-40" : undefined}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={isSkipped} onChange={() => toggleSkip(row.rowNumber)} aria-label={`Skip row ${row.rowNumber}`} />
                      </td>
                      <td className="px-3 py-1.5">
                        <div title={row.error}>
                          <ConfidenceBadge row={row} />
                        </div>
                      </td>
                      {IMPORT_CANONICAL_FIELDS.map((f) => {
                        const hasSource = Object.values(mapping).includes(f);
                        return (
                          <td key={f} className="px-3 py-1.5">
                            {hasSource ? (
                              <Input
                                value={row.mapped[f] ?? ""}
                                onChange={(e) => editCell(row.rowNumber, f, e.target.value)}
                                disabled={isSkipped}
                                className="h-8 w-28 px-2 text-xs"
                              />
                            ) : (
                              <span className="text-xs text-fg-faint">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => commitMutation.mutate()} disabled={readyCount === 0 || commitMutation.isPending}>
          {commitMutation.isPending ? "Importing…" : `Import ${readyCount} product(s)`}
        </Button>
      </div>
    </div>
  );
}
