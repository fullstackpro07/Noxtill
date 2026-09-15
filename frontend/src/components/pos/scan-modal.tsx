"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PosModalShell } from "./pos-modal-shell";
import type { Product } from "@/lib/products";

/** Real barcode/SKU lookup against the actual product catalog — no simulated camera scan, since
 * there's no real scanner hardware integration; honestly disclosed, matching the design's own
 * "Scanner hardware: Not Connected" note rather than faking a working camera. */
export function ScanModal({
  open,
  onClose,
  products,
  onFound,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onFound: (product: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<"found" | "missing" | null>(null);
  const [foundName, setFoundName] = useState("");

  function tryScan() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match = products.find((p) => p.sku?.toLowerCase() === q || p.id === q);
    if (match) {
      onFound(match);
      setFoundName(match.name);
      setResult("found");
      setQuery("");
    } else {
      setResult("missing");
    }
  }

  function handleClose() {
    setQuery("");
    setResult(null);
    onClose();
  }

  return (
    <PosModalShell
      open={open}
      onClose={handleClose}
      title="Barcode Scan"
      footer={
        <>
          <button onClick={handleClose} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" }}>Close</button>
          <button onClick={tryScan} style={{ background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" }}>Add to Cart</button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-[17px]">
        <div className="relative flex h-[168px] items-center justify-center overflow-hidden rounded-[14px]" style={{ background: "var(--app-sidebar-bg)" }}>
          <div className="h-3/5 w-3/4 rounded-[12px]" style={{ border: "2px solid rgba(143,240,187,.8)" }} />
          <span className="absolute inset-x-0 bottom-[10px] text-center text-[11.5px] font-bold" style={{ color: "#8FF0BB" }}>Camera not available in-browser</span>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>SEARCH BARCODE / MANUAL SKU</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResult(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && tryScan()}
            placeholder="e.g. NX-1005 or 890123456789"
            autoFocus
            className="w-full rounded-[11px] p-[13px] text-[14px] font-semibold"
            style={{ border: "1px solid var(--app-border)" }}
          />
        </label>
        {result === "found" && (
          <div className="flex items-center gap-[11px] rounded-[12px] p-[13px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
            <CheckCircle2 className="h-5 w-5" style={{ color: "var(--app-primary)" }} aria-hidden />
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-primary-hover, #0E8442)" }}>{foundName} added to the cart.</span>
          </div>
        )}
        {result === "missing" && (
          <div role="alert" className="rounded-[12px] p-[13px] text-[12.5px] font-bold" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", color: "var(--app-danger-strong)" }}>
            No matching product.
          </div>
        )}
        <div className="self-start rounded-full px-[10px] py-[3px] text-[11px] font-bold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
          Scanner hardware: Not Connected — type the SKU manually
        </div>
      </div>
    </PosModalShell>
  );
}
