"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  uploadDigitizerScan,
  updateDigitizerRow,
  commitDigitizerBatch,
  DESTINATION_LABELS,
  type DigitizerScanPreview,
  type DigitizerRow,
  type DigitizerCommitResult,
} from "@/lib/digitizer-api";

const FIELD_LABEL: Record<ImportCanonicalField, string> = {
  name: "Name",
  kind: "Kind (product/service)",
  category: "Category",
  sku: "SKU",
  costPrice: "Cost Price",
  sellingPrice: "Selling Price",
  stockQty: "Stock",
};

const PHOTO_FIELD_LABEL: Record<string, string> = {
  name: "Name",
  sellingPrice: "Selling Price",
  costPrice: "Cost Price",
  sku: "SKU",
  stockQty: "Stock",
  phone: "Phone",
  email: "Email",
  amount: "Amount",
  description: "Description",
  category: "Category",
  customerName: "Customer Name",
  balance: "Opening Balance",
};

function photoFieldLabel(field: string): string {
  return PHOTO_FIELD_LABEL[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
}

const CSV_STEPS = ["Upload", "Map Columns", "Preview", "Done"];
const PHOTO_STEPS = ["Upload", "Preview", "Done"];
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "12px 18px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 46 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "12px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 46 };

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
  if (!row.valid) return <span className="text-[12px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>Error</span>;
  if (row.confidence >= 0.9) return <span className="text-[12px] font-extrabold" style={{ color: "var(--app-success-text)" }}>Ready</span>;
  return <span className="text-[12px] font-extrabold" style={{ color: "var(--app-warning-text)" }}>Review</span>;
}

function PhotoConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.85) return <span className="text-[12px] font-extrabold" style={{ color: "var(--app-success-text)" }}>Ready</span>;
  if (confidence >= 0.5) return <span className="text-[12px] font-extrabold" style={{ color: "var(--app-warning-text)" }}>Review</span>;
  return <span className="text-[12px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>Low confidence</span>;
}

export function ProductsImportPanel() {
  const [mode, setMode] = useState<"csv" | "photo" | null>(null);
  const queryClient = useQueryClient();

  // --- CSV / Excel path (real 2-step preview→commit flow) ---
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [corrections, setCorrections] = useState<Map<number, Record<string, string>>>(new Map());
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const visibleRows = errorsOnly ? liveRows.filter((r) => !r.valid) : liveRows;

  const csvStep = summary ? 3 : preview ? 2 : file ? 1 : 0;

  function resetCsv() {
    setFile(null);
    setPreview(null);
    setMapping({});
    setSkipped(new Set());
    setCorrections(new Map());
    setSummary(null);
    setErrorsOnly(false);
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

  function downloadErrors() {
    if (summary?.errorsFileUrl) window.open(summary.errorsFileUrl, "_blank", "noopener,noreferrer");
  }

  // --- Photograph Your Price List (real AI Photo Digitizer, scannerType "menu") ---
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoScan, setPhotoScan] = useState<DigitizerScanPreview | null>(null);
  const [photoRows, setPhotoRows] = useState<DigitizerRow[]>([]);
  const [photoDone, setPhotoDone] = useState<DigitizerCommitResult | null>(null);

  const photoUploadMutation = useMutation({
    mutationFn: (f: File) => uploadDigitizerScan(f, "menu"),
    onSuccess: (result) => {
      setPhotoScan(result);
      setPhotoRows(result.rows);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't read this photo — please try again."),
  });

  const photoCommitMutation = useMutation({
    mutationFn: async () => {
      if (!photoScan) throw new Error("No scan in progress");
      const originalById = new Map(photoScan.rows.map((r) => [r.id, r]));
      await Promise.all(
        photoRows.map((row) => {
          const original = originalById.get(row.id);
          if (!original) return Promise.resolve();
          const changed = original.action !== row.action || JSON.stringify(original.data) !== JSON.stringify(row.data);
          return changed ? updateDigitizerRow(row.id, { data: row.data, action: row.action }) : Promise.resolve();
        }),
      );
      return commitDigitizerBatch(photoScan.batchId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setPhotoDone(result);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed — please try again."),
  });

  const photoIncludedCount = photoRows.filter((r) => r.action !== "skip").length;
  const photoStep = photoDone ? 2 : photoScan ? 1 : 0;

  function resetPhoto() {
    setPhotoScan(null);
    setPhotoRows([]);
    setPhotoDone(null);
  }

  function handlePhotoSelected(f: File) {
    setPhotoDone(null);
    photoUploadMutation.mutate(f);
  }

  function togglePhotoSkip(rowId: string) {
    setPhotoRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, action: r.action === "skip" ? "commit" : "skip" } : r)));
  }

  function editPhotoField(rowId: string, field: string, value: string) {
    setPhotoRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, data: { ...r.data, [field]: value } } : r)));
  }

  function backToModePicker() {
    setMode(null);
    resetCsv();
    resetPhoto();
  }

  const showModePicker = mode === null;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Import Products</h2>

      {!showModePicker && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="flex flex-wrap items-center gap-2">
            {(mode === "csv" ? CSV_STEPS : PHOTO_STEPS).map((label, i) => {
              const currentStep = mode === "csv" ? csvStep : photoStep;
              const steps = mode === "csv" ? CSV_STEPS : PHOTO_STEPS;
              return (
                <span key={label} className="flex items-center gap-2">
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-extrabold" style={i <= currentStep ? { background: "var(--app-primary)", color: "#fff" } : { background: "var(--app-surface-2)", color: "var(--app-text-disabled)" }}>{i + 1}</span>
                  <span className="text-[12.5px] font-bold" style={{ color: i <= currentStep ? "var(--app-text-muted)" : "var(--app-text-disabled)" }}>{label}</span>
                  {i < steps.length - 1 && <span className="h-[2px] w-[26px] rounded-[2px]" style={{ background: "var(--app-border)" }} />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {showModePicker && (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
          <div className="flex flex-col gap-[11px] rounded-[16px] p-[22px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ background: "var(--app-success-bg)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--app-primary)" strokeWidth="2" strokeLinecap="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
            </span>
            <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Upload CSV or Excel</div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faintest)" }}>Bring in a whole price list at once. Map your column names to Noxtill fields — nothing is created until you confirm.</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setMode("csv");
                  handleFileSelected(f);
                }
                e.target.value = "";
              }}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-auto self-start" style={primaryBtn}>Choose File</button>
          </div>

          <div className="flex flex-col gap-[11px] rounded-[16px] p-[22px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ background: "#EEF4FF" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3538CD" strokeWidth="2" strokeLinecap="round"><path d="M4 8V7a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </span>
            <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Photograph Your Price List</div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faintest)" }}>Snap your printed menu or price sheet. Each row comes back with a real AI confidence score — a score is a hint, not a guarantee.</div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setMode("photo");
                  handlePhotoSelected(f);
                }
                e.target.value = "";
              }}
              ref={photoInputRef}
            />
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploadMutation.isPending} className="mt-auto self-start" style={{ ...outlineBtn, opacity: photoUploadMutation.isPending ? 0.7 : 1 }}>
              {photoUploadMutation.isPending ? "Reading photo…" : "Take / Select Photo"}
            </button>
          </div>
        </div>
      )}

      {mode === "csv" && preview && !summary && (
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="p-[15px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="m-0 flex items-center gap-2 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>
              {file?.name}
              <button type="button" onClick={backToModePicker} className="ms-auto text-[12px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Start over</button>
            </h3>
            <p className="m-0 mt-1 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Map each column from your file to a product field. Unmapped columns are ignored — nothing is imported yet.</p>
          </div>
          <div className="flex flex-col gap-2.5 p-[17px]">
            {preview.headers.map((header) => (
              <div key={header} className="flex flex-wrap items-center gap-3">
                <span className="flex-1" style={{ minWidth: 130, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", background: "var(--app-surface-2)", border: "1px solid var(--app-surface-2)", borderRadius: 10, padding: "11px 13px" }}>{header}</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-disabled)" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <select
                  value={mapping[header] ?? "ignore"}
                  onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                  aria-label={`Map column "${header}"`}
                  className="flex-1"
                  style={{ minWidth: 150, border: "1px solid var(--app-border)", borderRadius: 10, padding: 11, fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 }}
                >
                  <option value="ignore">Not mapped</option>
                  {IMPORT_CANONICAL_FIELDS.map((f) => (
                    <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                  ))}
                </select>
                {mapping[header] === "ignore" && <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold" style={{ color: "var(--app-warning-text)", background: "var(--app-warning-bg)" }}>Unmapped</span>}
              </div>
            ))}
          </div>

          <div className="p-[13px_17px] flex flex-wrap items-center gap-2" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <h4 className="m-0 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Review ({liveRows.length} row(s))</h4>
            <span className="rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>{readyCount} ready</span>
            {errorCount > 0 && <span className="rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: "#FEE4E2", color: "var(--app-danger-strong)" }}>{errorCount} error(s)</span>}
            {skipped.size > 0 && <span className="rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-disabled)" }}>{skipped.size} skipped</span>}
            <span className="ms-auto flex items-center gap-2">
              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Show errors only</span>
              <button type="button" role="switch" aria-checked={errorsOnly} aria-label="Show errors only" onClick={() => setErrorsOnly((v) => !v)} className="relative rounded-full" style={{ width: 40, height: 22, border: 0, background: errorsOnly ? "var(--app-primary)" : "var(--app-surface-2)" }}>
                <span className="absolute top-[2px] rounded-full bg-white" style={{ width: 18, height: 18, left: errorsOnly ? 20 : 2 }} />
              </button>
            </span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Skip</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  {IMPORT_CANONICAL_FIELDS.map((f) => (
                    <th key={f} className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{FIELD_LABEL[f]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const isSkipped = skipped.has(row.rowNumber);
                  return (
                    <tr key={row.rowNumber} style={{ borderTop: "1px solid var(--app-border-strong)", opacity: isSkipped ? 0.4 : 1 }}>
                      <td className="p-[8px_17px]">
                        <input type="checkbox" checked={isSkipped} onChange={() => toggleSkip(row.rowNumber)} aria-label={`Skip row ${row.rowNumber}`} />
                      </td>
                      <td className="p-[8px]" title={row.error}><ConfidenceBadge row={row} /></td>
                      {IMPORT_CANONICAL_FIELDS.map((f) => {
                        const hasSource = Object.values(mapping).includes(f);
                        return (
                          <td key={f} className="p-[8px]">
                            {hasSource ? (
                              <input
                                value={row.mapped[f] ?? ""}
                                onChange={(e) => editCell(row.rowNumber, f, e.target.value)}
                                disabled={isSkipped}
                                className="w-[110px] rounded-[8px] p-1.5 text-[12px]"
                                style={{ border: "1px solid var(--app-border)" }}
                              />
                            ) : (
                              <span className="text-[12px]" style={{ color: "var(--app-text-disabled)" }}>—</span>
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
          <div className="flex justify-end gap-2.5 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <button type="button" onClick={backToModePicker} style={outlineBtn}>Back</button>
            <button type="button" onClick={() => commitMutation.mutate()} disabled={readyCount === 0 || commitMutation.isPending} style={{ ...primaryBtn, opacity: readyCount === 0 || commitMutation.isPending ? 0.6 : 1 }}>
              {commitMutation.isPending ? "Importing…" : `Import ${readyCount} product(s)`}
            </button>
          </div>
        </div>
      )}

      {mode === "csv" && summary && (
        <div className="rounded-[16px] p-[44px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-success-border)" }}>
          <div className="mx-auto mb-[13px] flex h-[52px] w-[52px] items-center justify-center rounded-[15px]" style={{ background: "var(--app-success-bg)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--app-primary)" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
          </div>
          <div className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Import complete</div>
          <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>{summary.created} product(s) created · {summary.skipped} row(s) skipped. Valid rows were kept.</div>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {summary.errorsFileUrl && (
              <button type="button" onClick={downloadErrors} style={outlineBtn}>Download Error File</button>
            )}
            <button type="button" onClick={backToModePicker} style={primaryBtn}>Import Another File</button>
          </div>
        </div>
      )}

      {mode === "photo" && photoScan && !photoDone && (
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="p-[13px_17px] flex flex-wrap items-center gap-2" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
            <h4 className="m-0 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Review ({photoRows.length} row(s) found)</h4>
            <span className="rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>{photoIncludedCount} will import</span>
            <button type="button" onClick={backToModePicker} className="ms-auto text-[12px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Start over</button>
          </div>
          <p className="m-0 p-[0_17px_13px] text-[12px]" style={{ color: "var(--app-text-faintest)" }}>Every field below is editable — nothing is written to your catalog until you click Import.</p>
          <div className="flex flex-col">
            {photoRows.map((row) => {
              const isSkipped = row.action === "skip";
              return (
                <div key={row.id} className="flex flex-wrap items-start gap-3 p-[13px_17px]" style={{ borderTop: "1px solid var(--app-border-strong)", opacity: isSkipped ? 0.45 : 1 }}>
                  <div className="flex flex-col items-start gap-1.5" style={{ minWidth: 90 }}>
                    <PhotoConfidenceBadge confidence={row.confidence} />
                    <span className="text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{DESTINATION_LABELS[row.destination]}</span>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {Object.entries(row.data).map(([field, value]) => (
                      <label key={field} className="flex flex-col gap-1" style={{ minWidth: 120 }}>
                        <span className="text-[10px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{photoFieldLabel(field).toUpperCase()}</span>
                        <input
                          value={value ?? ""}
                          onChange={(e) => editPhotoField(row.id, field, e.target.value)}
                          disabled={isSkipped}
                          className="rounded-[8px] p-1.5 text-[12.5px]"
                          style={{ border: "1px solid var(--app-border)" }}
                        />
                      </label>
                    ))}
                  </div>
                  <button type="button" onClick={() => togglePhotoSkip(row.id)} className="text-[11.5px] font-bold" style={{ color: isSkipped ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
                    {isSkipped ? "Include" : "Skip"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2.5 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <button type="button" onClick={backToModePicker} style={outlineBtn}>Back</button>
            <button type="button" onClick={() => photoCommitMutation.mutate()} disabled={photoIncludedCount === 0 || photoCommitMutation.isPending} style={{ ...primaryBtn, opacity: photoIncludedCount === 0 || photoCommitMutation.isPending ? 0.6 : 1 }}>
              {photoCommitMutation.isPending ? "Importing…" : `Import ${photoIncludedCount} row(s)`}
            </button>
          </div>
        </div>
      )}

      {mode === "photo" && photoDone && (
        <div className="rounded-[16px] p-[44px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-success-border)" }}>
          <div className="mx-auto mb-[13px] flex h-[52px] w-[52px] items-center justify-center rounded-[15px]" style={{ background: "var(--app-success-bg)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--app-primary)" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
          </div>
          <div className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Import complete</div>
          <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
            {photoDone.created.product} product(s) created
            {photoDone.skipped.length > 0 ? ` · ${photoDone.skipped.length} row(s) couldn't be imported` : ""}.
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={backToModePicker} style={primaryBtn}>Scan Another Photo</button>
          </div>
        </div>
      )}
    </main>
  );
}
