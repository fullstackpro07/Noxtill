"use client";

import { useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";

const TARGET_FIELDS = ["name", "category", "kind", "price", "costPrice", "sku", "stockOnHand"] as const;
type TargetField = (typeof TARGET_FIELDS)[number];

const MOCK_CSV_COLUMNS = ["Product Name", "Type", "Sell Price", "Cost", "SKU Code", "Qty"];
const MOCK_CSV_ROWS = [
  { "Product Name": "Rosemary Hair Oil", "Type": "product", "Sell Price": "18", "Cost": "7", "SKU Code": "SKU-2001", "Qty": "12" },
  { "Product Name": "Silk Press", "Type": "service", "Sell Price": "65", "Cost": "20", "SKU Code": "", "Qty": "" },
  { "Product Name": "", "Type": "product", "Sell Price": "abc", "Cost": "9", "SKU Code": "SKU-2003", "Qty": "5" },
];

const AUTO_MAP: Partial<Record<string, TargetField>> = {
  "Product Name": "name",
  "Type": "kind",
  "Sell Price": "price",
  "Cost": "costPrice",
  "SKU Code": "sku",
  "Qty": "stockOnHand",
};

type Step = "upload" | "map" | "review" | "done";

export function ImportProductsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>(AUTO_MAP as Record<string, string>);

  function reset() {
    setStep("upload");
    setFileName("");
    setMapping(AUTO_MAP as Record<string, string>);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileSelected(name: string) {
    setFileName(name);
    setStep("map");
  }

  const validRows = MOCK_CSV_ROWS.filter((r) => r["Product Name"].trim() !== "" && !Number.isNaN(Number(r["Sell Price"])));
  const errorRows = MOCK_CSV_ROWS.filter((r) => !validRows.includes(r));

  function handleImport() {
    setStep("done");
    toast.success(`${validRows.length} products imported. Live import wires up in INT-003.`);
  }

  const footer = (
    <>
      {step === "map" && (
        <Button variant="ghost" onClick={() => setStep("upload")}>
          Back
        </Button>
      )}
      {step === "review" && (
        <Button variant="ghost" onClick={() => setStep("map")}>
          Back
        </Button>
      )}
      {step === "upload" && (
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
      )}
      {step === "map" && <Button onClick={() => setStep("review")}>Continue</Button>}
      {step === "review" && <Button onClick={handleImport}>Import {validRows.length} products</Button>}
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
          ? "Upload a CSV or XLSX file exported from your spreadsheet."
          : step === "map"
            ? `Match columns from ${fileName} to product fields.`
            : step === "review"
              ? "Review before importing — invalid rows are skipped."
              : undefined
      }
      footer={footer}
      className="max-w-lg"
    >
      {step === "upload" && (
        <button
          type="button"
          onClick={() => handleFileSelected("products-export.csv")}
          className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-noxtill)] border-2 border-dashed border-border-strong bg-surface-2/40 px-6 py-10 text-center transition-colors hover:border-primary hover:bg-primary/4"
        >
          <UploadCloud className="h-7 w-7 text-fg-faint" aria-hidden />
          <p className="text-sm font-medium text-fg">Click to choose a file</p>
          <p className="text-xs text-fg-faint">CSV, XLSX up to 10MB</p>
        </button>
      )}

      {step === "map" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 text-sm text-fg-muted">
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{fileName}</span>
            <Badge tone="neutral" className="ms-auto shrink-0">
              {MOCK_CSV_ROWS.length} rows
            </Badge>
          </div>
          <div className="flex flex-col gap-2">
            {MOCK_CSV_COLUMNS.map((column) => (
              <div key={column} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-fg-muted">{column}</span>
                <Select
                  value={mapping[column] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [column]: e.target.value }))}
                  className="h-9"
                >
                  <option value="">Don&rsquo;t import</option>
                  {TARGET_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-sm">
            <span className="flex items-center gap-1.5 text-whatsapp">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {validRows.length} ready
            </span>
            {errorRows.length > 0 && (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {errorRows.length} with errors
              </span>
            )}
            {errorRows.length > 0 && (
              <button
                type="button"
                onClick={() => toast.info("Error report downloaded (mock).")}
                className="ms-auto flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download errors CSV
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
            <table className="w-full text-sm">
              <tbody>
                {MOCK_CSV_ROWS.map((row, i) => {
                  const isValid = validRows.includes(row);
                  return (
                    <tr key={i} className={isValid ? "" : "bg-destructive/5"}>
                      <td className="w-8 px-2 py-2">
                        {isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-whatsapp" aria-hidden />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                        )}
                      </td>
                      <td className="px-2 py-2 text-fg">{row["Product Name"] || <span className="italic text-fg-faint">missing name</span>}</td>
                      <td className="px-2 py-2 text-fg-muted">
                        {Number.isNaN(Number(row["Sell Price"])) ? (
                          <span className="text-destructive">invalid price</span>
                        ) : (
                          `$${row["Sell Price"]}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-whatsapp" aria-hidden />
          <p className="text-sm font-medium text-fg">{validRows.length} products imported</p>
          {errorRows.length > 0 && <p className="text-xs text-fg-muted">{errorRows.length} rows skipped due to errors</p>}
        </div>
      )}
    </Dialog>
  );
}
